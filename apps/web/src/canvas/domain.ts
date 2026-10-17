/** Person A's structural view of PRD §11.1. No shared-contract dependency.
 * Replace these aliases with shared imports after D freezes the schemas. */
export type SourceRef = { page: number; quote: string; start: number; end: number };
export type VisualPayload =
  | { type: 'concept' }
  | { type: 'metric'; value: string; unit: string | null; label: string; valueSource: SourceRef }
  | { type: 'process'; stepDetailIds: string[] }
  | { type: 'figure'; assetId: string; caption: string }
  | { type: 'comparison'; leftId: string; rightId: string; relationshipId: string };
export type Concept = {
  id: string; title: string; summary: string; aliases: string[]; speechExamples: string[];
  visual: VisualPayload;
  details: { id: string; text: string; sources: SourceRef[]; origin: 'source' | 'user' }[];
  sources: SourceRef[]; assetIds: string[]; enabled: boolean;
  review: 'needs-review' | 'reviewed' | 'source-checked'; position: { x: number; y: number };
};
export type Relationship = {
  id: string; from: string; to: string; label: string;
  kind: 'sequence' | 'comparison' | 'association' | 'causal'; sources: SourceRef[]; approved: boolean;
};
export type Asset = {
  id: string; kind: 'page-crop' | 'image'; blobKey: string; page: number | null;
  crop: { x: number; y: number; width: number; height: number } | null;
  alt: string; width: number; height: number;
};
export type FigureLink = { assetId: string; page: number; label: string; caption: string; keywords: string[]; enabled: boolean; captionSource: SourceRef | null };
export type CanvasProject = {
  schemaVersion: 1; id: string; revision: number; title: string;
  source: { name: string; sha256: string; pages: number };
  preparation: { mode: 'groq' | 'curated'; model: string | null; promptVersion: string; preparedAt: string };
  knowledgeBase?: { version: 1; pages: { page: number; text: string }[]; figures?: FigureLink[] };
  concepts: Concept[]; relationships: Relationship[]; assets: Asset[]; approvedRevision: number | null;
};
export type CanvasAction =
  | { type: 'FOCUS'; conceptId: string }
  | { type: 'REVEAL'; conceptId: string; detailId: string }
  | { type: 'CONNECT'; relationshipId: string }
  | { type: 'COMPARE'; leftId: string; rightId: string }
  | { type: 'OVERVIEW' } | { type: 'HOLD' };
export type CanvasState = {
  project: CanvasProject;
  live?: boolean;
  /** Current spoken explanation plus nearby visual context; history remains on the canvas. */
  boardIds?: string[];
  provisionalIds?: string[];
  view: 'overview' | 'focus' | 'connection' | 'comparison';
  focusId: string | null;
  pair: [string, string] | null;
  activeRelationshipId: string | null;
  introduced: string[];
  revealed: Record<string, string[]>;
  connected: string[];
  highlightedDetailId: string | null;
  revision: number;
};
export type ActionOrigin = 'manual' | 'automatic';
