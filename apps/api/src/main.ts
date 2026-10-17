// Starts the local preparation server: node src/main.ts (or npm start).

import { loadConfig } from './config.ts';
import { buildServer } from './server.ts';

const config = loadConfig();
const app = buildServer({ config });
await app.listen({ host: config.host, port: config.port });
app.log.info(`provider groq, model ${config.groqModel}, keys ${config.groqApiKeys.length} configured, rotation every 5 minutes`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close().then(() => process.exit(0)));
