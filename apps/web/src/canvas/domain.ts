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
  review: 'needs-review' | 'reviewed'; position: { x: number; y: number };
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
export type CanvasProject = {
  schemaVersion: 1; id: string; revision: number; title: string;
  source: { name: string; sha256: string; pages: number };
  preparation: { mode: 'grok' | 'curated'; model: string | null; promptVersion: string; preparedAt: string };
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
