import { OPS, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { Asset, FigureLink } from '../canvas/domain';
import { clipRect, drawingBounds, findFigureRegions, transformRect, type Matrix, type Rect, type PositionedText } from './figureGeometry';
import { registerPdfAsset, releasePdfAssets, pdfAssetBytes } from './localAssets';
import { locateQuote } from './sourceText';
import type { ExtractedPage, ExtractOptions } from './extract';
export type LocalFigure = { asset: Asset; link: FigureLink };
export const FIGURE_LIMITS = { pages: 30, figures: 32, pixels: 2_000_000, totalBytes: 24*1024*1024 } as const;
const abortIfNeeded=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
const encode=(canvas:HTMLCanvasElement,type='image/png')=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not render this figure.')),type,.92));

function positionedText(page:PDFPageProxy,items:TextItem[]):PositionedText[] {
  const viewport=page.getViewport({scale:1});
  return items.filter(t=>t.str.trim()).map(t=>({
    ...transformRect({x:t.transform[4],y:t.transform[5],width:t.width,height:t.height},viewport.transform as Matrix),text:t.str,
  }));
}
async function renderPage(page:PDFPageProxy,signal?:AbortSignal):Promise<HTMLCanvasElement> {
  abortIfNeeded(signal);
  const unit=page.getViewport({scale:1});
  const scale=Math.min(2.5,Math.sqrt(FIGURE_LIMITS.pixels/(unit.width*unit.height)));
  const viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas rendering is unavailable.');
  const task=page.render({canvas,canvasContext:context,viewport,background:'#ffffff'});
  const cancel=()=>task.cancel();signal?.addEventListener('abort',cancel,{once:true});
  try { await task.promise;abortIfNeeded(signal);return canvas; }
  catch(error){canvas.width=canvas.height=0;throw error;}
  finally {signal?.removeEventListener('abort',cancel);}
}
async function cropFigure(canvas:HTMLCanvasElement,rect:Rect,page:PDFPageProxy,pageText:string,caption:string,kind:Asset['kind'],docKey:string,index:number,signal?:AbortSignal):Promise<{figure:LocalFigure;bytes:number}> {
  abortIfNeeded(signal);
  const viewport=page.getViewport({scale:1});const crop=clipRect(rect,viewport.width,viewport.height);
  const scaleX=canvas.width/viewport.width,scaleY=canvas.height/viewport.height;
  const output=document.createElement('canvas');output.width=Math.max(1,Math.ceil(crop.width*scaleX));output.height=Math.max(1,Math.ceil(crop.height*scaleY));
  const context=output.getContext('2d');if(!context)throw new Error('Canvas rendering is unavailable.');
  context.drawImage(canvas,crop.x*scaleX,crop.y*scaleY,crop.width*scaleX,crop.height*scaleY,0,0,output.width,output.height);
  try {
    let blob=await encode(output);if(blob.size>1_500_000)blob=await encode(output,'image/webp');
    abortIfNeeded(signal);
    const id=`pdf-figure-${page.pageNumber}-${index}`;
    const asset:Asset={id,kind,blobKey:`local-pdf:${docKey}:${id}`,page:page.pageNumber,crop:{x:crop.x/viewport.width,y:crop.y/viewport.height,width:Math.min(1-crop.x/viewport.width,crop.width/viewport.width),height:Math.min(1-crop.y/viewport.height,crop.height/viewport.height)},alt:caption||`Source image on page ${page.pageNumber}`,width:output.width,height:output.height};
    const located=caption?locateQuote(pageText,caption):null;
    const link:FigureLink={assetId:id,page:page.pageNumber,label:(caption||`Image on page ${page.pageNumber}`).slice(0,120),caption,keywords:[],enabled:Boolean(caption),captionSource:located?{page:page.pageNumber,...located}:null};
    registerPdfAsset(asset,blob);return {figure:{asset,link},bytes:blob.size};
  } finally {output.width=output.height=0;}
}

/** Render original PDF crops (raster and captioned vector figures) locally.
 * Binary image data is never placed in the preparation request or a manifest.
 */
export async function extractPdfFigures(doc:PDFDocumentProxy,pages:ExtractedPage[],sha:string,options:ExtractOptions={}):Promise<{figures:LocalFigure[];warnings:string[]}> {
  const figures:LocalFigure[]=[];const warnings:string[]=[];let bytes=0;
  const count=Math.min(doc.numPages,FIGURE_LIMITS.pages);const docKey=`${sha}:${crypto.randomUUID()}`;
  try {
    for(let n=1;n<=count;n++) {
      abortIfNeeded(options.signal);
      if(figures.length>=FIGURE_LIMITS.figures||bytes>=FIGURE_LIMITS.totalBytes){warnings.push('The local figure limit was reached. Add only the figures you need for this presentation.');break;}
      let canvas:HTMLCanvasElement|undefined;let page:PDFPageProxy|undefined;
      try {
        page=await doc.getPage(n);const viewport=page.getViewport({scale:1});
        const content=await page.getTextContent();const text=positionedText(page,content.items.filter((t):t is TextItem=>'str'in t));
        const operators=await page.getOperatorList();const bounds=drawingBounds(operators,OPS,viewport.transform as Matrix);
        const regions=findFigureRegions(bounds.images,bounds.paths,text,viewport.width,viewport.height);
        if(regions.length) {
          canvas=await renderPage(page,options.signal);
          for(let i=0;i<regions.length&&figures.length<FIGURE_LIMITS.figures;i++) {
            const r=regions[i];const result=await cropFigure(canvas,r.rect,page,pages[n-1].text,r.caption,r.kind,docKey,i+1,options.signal);
            if(bytes+result.bytes>FIGURE_LIMITS.totalBytes){releasePdfAssets([result.figure.asset.blobKey]);warnings.push('Some large figures were omitted to keep local memory bounded.');break;}
            figures.push(result.figure);bytes+=result.bytes;
          }
        }
      } catch(error) {
        abortIfNeeded(options.signal);warnings.push(`Figures on page ${n} could not be rendered. Its extracted text is still available.`);
      } finally {if(canvas)canvas.width=canvas.height=0;page?.cleanup();}
      options.onFiguresProgress?.(n,count,figures.length);
    }
    if(doc.numPages>count)warnings.push(`Automatic figure detection checked the first ${count} pages. You can add a full-page visual from another page locally.`);
    return {figures,warnings};
  } catch(error){releasePdfAssets(figures.map(f=>f.asset.blobKey));throw error;}
}

/** Explicit full-page fallback for uncaptioned/vector-heavy layouts. */
export async function addPageFigure(file:File,pageNumber:number,sha:string,text:string):Promise<LocalFigure> {
  const {getDocument}=await import('pdfjs-dist');
  const task=getDocument({data:new Uint8Array(await file.arrayBuffer()),verbosity:0});
  let canvas:HTMLCanvasElement|undefined;
  try {
    const doc=await task.promise;const page=await doc.getPage(pageNumber);const viewport=page.getViewport({scale:1});
    canvas=await renderPage(page);const result=await cropFigure(canvas,{x:0,y:0,width:viewport.width,height:viewport.height},page,text,'','page-crop',`${sha}:${crypto.randomUUID()}`,1000+pageNumber);
    if(pdfAssetBytes()>FIGURE_LIMITS.totalBytes){releasePdfAssets([result.figure.asset.blobKey]);throw new Error('The local figure memory limit was reached. Keep the existing figures or choose a smaller PDF.');}
    result.figure.link.label=`Page ${pageNumber} visual`;return result.figure;
  } finally {if(canvas)canvas.width=canvas.height=0;await task.destroy();}
}
