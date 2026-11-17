import 'dotenv/config';
import { createApp } from './app.js';
import { createEquipmentSync, equipmentSyncOptionsFromEnv } from './equipmentSync.js';
import { createConditionsService } from './conditions.js';

const port = Number(process.env.PORT || 8787);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必須是有效的連接埠');
const equipmentSync = createEquipmentSync(equipmentSyncOptionsFromEnv());
const conditionsService = createConditionsService();
const app = createApp({ apiKey: process.env.CWA_API_KEY, production: process.env.NODE_ENV === 'production', equipmentSync, conditionsService });
const server = app.listen(port, '127.0.0.1', () => {
  equipmentSync.start(); conditionsService.startPolling();
  console.log(`mt_info API: http://127.0.0.1:${port}`);
});
let closing = false;
const shutdown = () => {
  if (closing) return; closing = true;
  equipmentSync.stop(); conditionsService.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
