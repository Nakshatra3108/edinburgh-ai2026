import { memo, type ReactNode } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ArrowRight, Layers2, GitCompareArrows, Image as ImageIcon, Route, Hash, AudioLines, BrainCircuit, Database, FileText, Workflow, ShieldCheck, Users, Zap, Network } from 'lucide-react';
import type { Asset, Concept } from './domain';
export type CanvasNodeData = {
  board?: boolean; compact?: boolean; concept: Concept; expanded: boolean; paired: boolean; home: boolean; introduced: boolean;
  revealed: string[]; highlightedDetailId: string | null; asset?: Asset; assetUrl?: string;
};
export type FollowNode = Node<CanvasNodeData>;
const visualIcons = { concept: Layers2, process: Route, metric: Hash, figure: ImageIcon, comparison: GitCompareArrows };
const visualNames = { concept: 'Idea', process: 'Process', metric: 'Evidence', figure: 'Figure', comparison: 'Comparison' };
function TopicGlyph({ concept }: { concept: Concept }) {
  const text = `${concept.title} ${concept.summary}`.toLowerCase();
  const Icon = /speech|speaker|voice|audio|listen/.test(text) ? AudioLines
    : /knowledge|database|source|storage/.test(text) ? Database
    : /document|pdf|text|upload/.test(text) ? FileText
    : /privacy|safe|verif|trust/.test(text) ? ShieldCheck
    : /people|team|audience|user/.test(text) ? Users
    : /speed|fast|energy|power/.test(text) ? Zap
    : /model|intelligen|semantic|reason|ai\b/.test(text) ? BrainCircuit
    : concept.visual.type === 'process' ? Workflow : Network;
  return <Icon className="topic-glyph" size={72} strokeWidth={1.5} aria-hidden="true"/>;
}
function NodeShell({ data, children }: { data: CanvasNodeData; children?: ReactNode }) {
  const Icon = visualIcons[data.concept.visual.type];
  return <article className={`canvas-node visual-${data.concept.visual.type} ${data.expanded ? 'is-focused' : 'is-anchor'} ${data.introduced ? 'is-introduced' : ''} ${data.home ? 'is-home' : ''} ${data.paired ? 'is-paired' : ''} ${data.board ? 'is-board-element' : ''} ${data.compact ? 'is-compact' : ''}`}  aria-label={data.concept.title}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <div className="node-type"><Icon size={24}/><span>{visualNames[data.concept.visual.type]}</span>{data.home && <span>Home anchor</span>}</div>
    {data.board && data.concept.visual.type !== 'figure' && <TopicGlyph concept={data.concept}/>}
    <h2>{data.concept.title}</h2>
    <div className="node-detail-group" hidden={!data.expanded}><p className="node-summary" hidden={data.concept.visual.type === 'figure' || (data.paired && !data.compact && data.revealed.length > 0 && data.concept.visual.type === 'concept')}>{data.concept.summary}</p>{children}</div>
    {!data.expanded && !data.home && <div className="anchor-rule" aria-hidden="true"><span/><ArrowRight size={32}/></div>}
    {data.board && <span className="board-provenance">{data.concept.sources.length ? `Source · p. ${[...new Set(data.concept.sources.map(s => s.page))].join(', ')}` : 'Original PDF figure'}</span>}
    <Handle type="source" position={Position.Right} isConnectable={false}/>
  </article>;
}
function Points({ data }: { data: CanvasNodeData }) {
  const revealed = data.revealed.flatMap(id => data.concept.details.filter(d => d.id === id));
  const candidate = revealed.slice(-(data.compact ? 1 : 3));
  const highlighted = revealed.find(d => d.id === data.highlightedDetailId);
  if (highlighted && !candidate.includes(highlighted)) candidate.splice(0, 1, highlighted);
  const points = (!data.board && candidate.reduce((n, d) => n + d.text.length, 0) > 180) || data.concept.visual.type === 'metric'
    ? [revealed.find(d => d.id === data.highlightedDetailId) ?? revealed.at(-1)].filter((d): d is NonNullable<typeof d> => !!d)
    : candidate;
  return <ul className="node-points">{points.map(d => <li key={d.id} className={data.highlightedDetailId === d.id ? 'detail-highlighted' : ''}><span className="point-mark" aria-hidden="true"/><span className="point-text">{d.text}</span></li>)}</ul>;
}
export const ConceptNode = memo(({ data }: NodeProps<FollowNode>) => <NodeShell data={data}><Points data={data}/></NodeShell>);
export const ProcessNode = memo(({ data }: NodeProps<FollowNode>) => {
  const visual = data.concept.visual;
  return <NodeShell data={data}>{visual.type === 'process' && <ol className="process-path">{visual.stepDetailIds.map((id, i) => {
    const d = data.concept.details.find(d => d.id === id);
    const shown = data.revealed.includes(id);
    return <li key={id} className={`${shown ? 'step-revealed' : 'step-hidden'} ${data.highlightedDetailId === id ? 'detail-highlighted' : ''}`} aria-label={shown ? undefined : `Step ${i + 1}, not introduced`}>
      <span className="step-index">{i + 1}</span><span className="step-label" aria-hidden={!shown}>{d?.text}</span>
    </li>;
  })}</ol>}</NodeShell>;
});
export const MetricNode = memo(({ data }: NodeProps<FollowNode>) => {
  const v = data.concept.visual;
  return <NodeShell data={data}>{v.type === 'metric' && <div className="metric-composition"><div className="metric-value">{v.value}<span>{v.unit}</span></div><p>{v.label}</p><span className="metric-source">Source · p. {v.valueSource.page}</span></div>}<Points data={data}/></NodeShell>;
});
export const FigureNode = memo(({ data }: NodeProps<FollowNode>) => {
  const v = data.concept.visual;
  return <NodeShell data={data}>{v.type === 'figure' && <figure className="source-figure">{data.assetUrl ? <img src={data.assetUrl} alt={data.asset?.alt ?? v.caption} width={data.asset?.width} height={data.asset?.height} onError={e => { e.currentTarget.hidden = true; e.currentTarget.nextElementSibling?.removeAttribute('hidden'); }}/>: null}<p className="asset-unavailable" hidden={!!data.assetUrl}>Figure unavailable. Return to the studio and reconnect its asset.</p><figcaption><span className="figure-provenance">Original PDF · page {data.asset?.page ?? '—'}</span>{data.concept.details.find(d => d.id === data.highlightedDetailId)?.text ?? v.caption}</figcaption></figure>}</NodeShell>;
});
export const ComparisonNode = memo(({ data }: NodeProps<FollowNode>) => <NodeShell data={data}><div className="comparison-intent"><GitCompareArrows size={48}/><p>Two ideas. A different relationship.</p></div></NodeShell>);
export const NODE_TYPES = { concept: ConceptNode, process: ProcessNode, metric: MetricNode, figure: FigureNode, comparison: ComparisonNode };
