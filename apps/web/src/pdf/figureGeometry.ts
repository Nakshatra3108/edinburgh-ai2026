/** Geometry only: no pixel decoding, model calls or network access. */
export type Matrix = [number, number, number, number, number, number];
export type Rect = { x: number; y: number; width: number; height: number };
export type PositionedText = Rect & { text: string };
export type FigureRegion = { rect: Rect; caption: string; kind: 'image' | 'page-crop' };
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformRect(rect: Rect, m: Matrix): Rect {
  const pts = [[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
  const x=Math.min(...pts.map(p=>p[0])),y=Math.min(...pts.map(p=>p[1]));
  return {x,y,width:Math.max(...pts.map(p=>p[0]))-x,height:Math.max(...pts.map(p=>p[1]))-y};
}
const union=(a:Rect,b:Rect):Rect=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.max(a.x+a.width,b.x+b.width)-Math.min(a.x,b.x),height:Math.max(a.y+a.height,b.y+b.height)-Math.min(a.y,b.y)});
const gap=(a:Rect,b:Rect)=>Math.hypot(Math.max(0,a.x-b.x-b.width,b.x-a.x-a.width),Math.max(0,a.y-b.y-b.height,b.y-a.y-a.height));
export function clipRect(r:Rect,width:number,height:number,pad=0):Rect {
  const x=Math.max(0,r.x-pad),y=Math.max(0,r.y-pad);
  return {x,y,width:Math.max(0,Math.min(width,r.x+r.width+pad)-x),height:Math.max(0,Math.min(height,r.y+r.height+pad)-y)};
}

/** Track the graphics-state CTM, including nested form XObjects and repeated images. */
export function drawingBounds(ops:{fnArray:ArrayLike<number>;argsArray:unknown[][]}, codes:Record<string,number>, viewport:Matrix) {
  let matrix=IDENTITY; const stack:Matrix[]=[]; const images:Rect[]=[]; const paths:Rect[]=[];
  const pushImage=(m:Matrix)=>{if(images.length<256)images.push(transformRect({x:0,y:0,width:1,height:1},multiply(viewport,m)));};
  for(let i=0;i<ops.fnArray.length;i++) {
    const op=ops.fnArray[i],a=ops.argsArray[i];
    if(op===codes.save)stack.push([...matrix]);
    else if(op===codes.restore)matrix=stack.pop()??IDENTITY;
    else if(op===codes.transform)matrix=multiply(matrix,a as Matrix);
    else if(op===codes.paintFormXObjectBegin){stack.push([...matrix]);if(a[0])matrix=multiply(matrix,a[0] as Matrix);}
    else if(op===codes.paintFormXObjectEnd)matrix=stack.pop()??IDENTITY;
    else if(op===codes.paintImageXObject||op===codes.paintInlineImageXObject||op===codes.paintImageMaskXObject)pushImage(matrix);
    else if(op===codes.paintImageXObjectRepeat) {
      const positions=a[3] as ArrayLike<number>;
      for(let j=0;j<positions.length;j+=2)pushImage(multiply(matrix,[a[1] as number,0,0,a[2] as number,positions[j],positions[j+1]]));
    } else if(op===codes.paintInlineImageXObjectGroup) {
      for(const item of a[1] as {transform:Matrix}[])pushImage(multiply(matrix,item.transform));
    } else if(op===codes.paintImageMaskXObjectGroup) {
      for(const item of a[0] as {transform:Matrix}[])pushImage(multiply(matrix,item.transform));
    } else if(op===codes.constructPath && a[2] && paths.length<6000) {
      // PDF.js 6 records each painted path's source bounding box here.
      const b=a[2] as ArrayLike<number>;
      if(b.length===4&&Array.from(b).every(Number.isFinite))paths.push(transformRect({x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]},multiply(viewport,matrix)));
    }
  }
  return {images,paths};
}

export function captionLines(items:PositionedText[]):PositionedText[] {
  const lines:PositionedText[]=[];
  for(const t of [...items].sort((a,b)=>a.y-b.y||a.x-b.x)) {
    const line=lines.find(l=>Math.abs(l.y-t.y)<Math.max(3,t.height*.35)&&gap(l,t)<24);
    if(line){line.text+=` ${t.text}`;Object.assign(line,union(line,t));}else lines.push({...t});
  }
  return lines.filter(l=>/^(?:fig(?:ure)?\.?|chart|diagram|table)\s*[a-z]?\d+\b/i.test(l.text.trim()));
}

export function findFigureRegions(images:Rect[],paths:Rect[],text:PositionedText[],width:number,height:number):FigureRegion[] {
  const captions=captionLines(text);const area=width*height;
  const large=(r:Rect)=>r.width>=50&&r.height>=35&&r.width*r.height>=area*.009;
  const rasters=images.filter(large).filter(r=>r.width*r.height<area*.97);
  // Path clusters are considered figures only when a nearby figure/table caption exists.
  // This avoids treating rules, backgrounds and decorative vector marks as diagrams.
  const clusters:Rect[]=[];
  for(const p of (captions.length?paths:[]).slice(0,3500).filter(p=>p.width*p.height<area*.65)) {
    let box=p;
    for(let j=clusters.length-1;j>=0;j--)if(gap(box,clusters[j])<=14){box=union(box,clusters[j]);clusters.splice(j,1);}
    clusters.push(box);
  }
  const vectors=clusters.filter(large);
  const used=new Set<Rect>();const result:FigureRegion[]=[];
  for(const caption of captions) {
    const candidates=[...rasters,...vectors].filter(r=>gap(r,caption)<150&&r.x<caption.x+caption.width+40&&r.x+r.width>caption.x-40);
    candidates.sort((a,b)=>gap(a,caption)-gap(b,caption));
    const nearest=candidates[0];if(!nearest)continue;
    // Merge multi-panel images/paths close to the same caption.
    const peers=candidates.filter(r=>r===nearest||(gap(r,nearest)<32&&Math.abs(r.y-nearest.y)<Math.max(r.height,nearest.height)));
    let region=nearest;for(const r of peers){region=union(region,r);used.add(r);}
    result.push({rect:clipRect(region,width,height,rasters.includes(nearest)?8:24),caption:caption.text.trim().slice(0,300),kind:rasters.includes(nearest)?'image':'page-crop'});
  }
  for(const r of rasters)if(!used.has(r)&&!result.some(f=>gap(f.rect,r)===0))result.push({rect:clipRect(r,width,height,6),caption:'',kind:'image'});
  return result.filter((f,i)=>f.rect.width>0&&f.rect.height>0&&!result.slice(0,i).some(other=>gap(other.rect,f.rect)===0&&Math.abs(other.rect.width-f.rect.width)<20&&Math.abs(other.rect.height-f.rect.height)<20)).slice(0,8);
}
