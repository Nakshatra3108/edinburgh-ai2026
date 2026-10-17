import manifest from './manifest.json';
import { parseCanvasProject } from '../manifest';
/** An authored example, never evidence of a prepared or verified PDF. */
export const exampleProject = parseCanvasProject(manifest);
