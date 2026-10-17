import { useState } from 'react';
import { Image, Plus } from 'lucide-react';
import type { LocalFigure } from './figures';
import { resolvePdfAsset } from './localAssets';
import type { FigureLink } from '../canvas/domain';
import './figures.css';
function FigureCard({figure,disabled,onChange}:{figure:LocalFigure;disabled:boolean;onChange:(patch:Partial<FigureLink>)=>void}) {
  const [keywords,setKeywords]=useState(figure.link.keywords.join(', '));
  return <article className={`pdf-figure-card ${figure.link.enabled?'is-enabled':''}`}>
    <div className="pdf-figure-preview"><img src={resolvePdfAsset(figure.asset)} alt={figure.asset.alt}/></div>
    <div className="pdf-figure-fields">
      <label className="checkbox-label"><input type="checkbox" checked={figure.link.enabled} disabled={disabled} onChange={e=>onChange({enabled:e.target.checked})}/>Use while presenting</label>
      <label>Figure title<input maxLength={120} disabled={disabled} value={figure.link.label} onChange={e=>onChange({label:e.target.value})} onBlur={()=>{if(!figure.link.label.trim())onChange({label:`Image on page ${figure.link.page}`});}}/></label>
      <label>Topics you might say<input maxLength={500} disabled={disabled} value={keywords} onChange={e=>setKeywords(e.target.value)} onBlur={()=>onChange({keywords:keywords.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12).map(x=>x.slice(0,80))})} placeholder="e.g. water cycle, filtration, growing beds"/></label>
      <p className="notice">{figure.link.caption?`PDF caption: ${figure.link.caption}`:'No caption found. Add a clear title and topic words so FOLLOW can identify when this image is relevant.'}</p>
      <span className="local-figure-note">Page {figure.link.page} · original PDF crop · stays on this device</span>
    </div>
  </article>;
}
export function FigurePicker({figures,page,disabled,adding,onChange,onAddPage}:{figures:LocalFigure[];page:number;disabled:boolean;adding:boolean;onChange:(id:string,patch:Partial<FigureLink>)=>void;onAddPage?:()=>void}) {
  const list=figures.filter(f=>f.link.page===page);
  return <div className="pdf-figure-library">
    <div className="pdf-figure-intro"><Image size={20}/><div><h2>Your source figures, kept local.</h2><p>FOLLOW uses captions and your topic words to bring useful figures into the explanation. Image data is never sent to Groq.</p></div></div>
    {list.length?list.map(f=><FigureCard key={f.asset.id} figure={f} disabled={disabled} onChange={patch=>onChange(f.asset.id,patch)}/>):<p className="figure-empty">No automatic figure crop was found on this page. You can keep the full page as a visual for an uncaptioned diagram or unusual layout.</p>}
    {onAddPage&&<button onClick={onAddPage} disabled={disabled||adding||figures.length>=32}><Plus size={16}/>{adding?'Rendering page locally…':'Add this page as a visual'}</button>}
  </div>;
}
