import manifest from '../../../../demo/manifest.json';
import { parseCanvasProject } from '../canvas/manifest';
/** The source-verified curated project; no generation or live speech is implied. */
export const demoProject = parseCanvasProject(manifest);
