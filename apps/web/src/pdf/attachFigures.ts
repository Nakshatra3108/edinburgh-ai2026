import type { CanvasProject } from '../canvas/domain';
import type { LocalFigure } from './figures';
/** Pixel blobs never enter the project; only session keys and text descriptors. */
export function attachPdfFigures(project:CanvasProject,figures:LocalFigure[]):CanvasProject {
  if(!project.knowledgeBase)return project;
  const included=figures.filter(f=>(f.link.enabled||project.knowledgeBase!.pages.some(p=>p.page===f.link.page)));
  const links=included.map(f=>{
    const ref=f.link.captionSource;
    const valid=ref&&project.knowledgeBase!.pages.find(p=>p.page===ref.page)?.text.slice(ref.start,ref.end)===ref.quote;
    return {...f.link,label:f.link.label.trim()||`Image on page ${f.link.page}`,captionSource:valid?ref:null};
  });
  return {...project,assets:[...project.assets.filter(a=>!included.some(f=>f.asset.id===a.id)),...included.map(f=>({...f.asset,alt:f.link.label.trim()||f.asset.alt}))],knowledgeBase:{...project.knowledgeBase,figures:links}};
}
