// Structural copy of the Project contract (PRD §11.1), matching
// apps/web/src/canvas/domain.ts. Replace with packages/shared imports once
// the shared contracts exist (owner: Naksh / Aditya).

export type SourceRef = { page: number; quote: string; start: number; end: number };
export type VisualPayload =
  | { type: 'concept' }
  | { type: 'metric'; value: string; unit: string | null; label: string; valueSource: SourceRef }
  | { type: 'process'; stepDetailIds: string[] }
  | { type: 'figure'; assetId: string; caption: string }
  | { type: 'comparison'; leftId: string; rightId: string; relationshipId: string };
export type Detail = { id: string; text: string; sources: SourceRef[]; origin: 'source' | 'user' };
export type Concept = {
  id: string; title: string; summary: string; aliases: string[]; speechExamples: string[];
  visual: VisualPayload; details: Detail[]; sources: SourceRef[]; assetIds: string[]; enabled: boolean;
  review: 'needs-review' | 'reviewed' | 'source-checked'; position: { x: number; y: number };
};
export type Relationship = {
  id: string; from: string; to: string; label: string;
  kind: 'sequence' | 'comparison' | 'association' | 'causal'; sources: SourceRef[]; approved: boolean;
};
export type CanvasProject = {
  schemaVersion: 1; id: string; revision: number; title: string;
  source: { name: string; sha256: string; pages: number };
  preparation: { mode: 'groq' | 'curated'; model: string | null; promptVersion: string; preparedAt: string };
  knowledgeBase?: { version: 1; pages: { page: number; text: string }[] };
  concepts: Concept[]; relationships: Relationship[]; assets: never[]; approvedRevision: number | null;
};

/** Content budgets from PRD §6.2 and the canvas validator. */
export const BUDGET = {
  projectTitle: 160, title: 64, summary: 180, detail: 180, processStep: 40, metricValue: 16, metricUnit: 32,
  metricLabel: 80, relationshipLabel: 48, alias: 80, aliases: 12, speechExample: 200, speechExamples: 12, quote: 600,
} as const;
