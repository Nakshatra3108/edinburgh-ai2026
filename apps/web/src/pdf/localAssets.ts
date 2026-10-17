import type { Asset } from '../canvas/domain';
const assets=new Map<string,{url:string;id:string;bytes:number}>();
/** Only blobs created by our local PDF renderer can resolve these opaque keys. */
export function registerPdfAsset(asset:Asset,blob:Blob):void {
  const old=assets.get(asset.blobKey);if(old)URL.revokeObjectURL(old.url);
  assets.set(asset.blobKey,{url:URL.createObjectURL(blob),id:asset.id,bytes:blob.size});
}
export function resolvePdfAsset(asset:Asset):string|undefined {
  const entry=assets.get(asset.blobKey);return entry?.id===asset.id?entry.url:undefined;
}
export function retainPdfAssets(keep:Asset[]):void {
  const keys=new Set(keep.map(a=>a.blobKey));
  for(const [key,value]of assets)if(!keys.has(key)){URL.revokeObjectURL(value.url);assets.delete(key);}
}
export function releasePdfAssets(keys:string[]):void {
  for(const key of keys){const value=assets.get(key);if(value)URL.revokeObjectURL(value.url);assets.delete(key);}
}

export function pdfAssetBytes():number { return [...assets.values()].reduce((total,asset)=>total+asset.bytes,0); }
