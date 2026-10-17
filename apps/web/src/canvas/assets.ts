import { resolvePdfAsset } from '../pdf/localAssets';
import type { Asset } from './domain';
/** Blob storage is owned by D. Imported storage keys never become external requests. */
export function defaultResolveAsset(asset: Asset): string | undefined {
  const local=resolvePdfAsset(asset); if(local)return local;
  return /^\/examples\/[a-zA-Z0-9_./-]+$/.test(asset.blobKey) && !asset.blobKey.includes('..') ? asset.blobKey : undefined;
}
