import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Settings come from .env, which `npm start` loads with Node's --env-file-if-exists.
// Empty values count as unset so a blank line in .env falls back to the default.
export function getConfig() {
  const sellTaxPercent = Number(process.env.SELL_TAX_PERCENT || 13);
  if (!(sellTaxPercent >= 0 && sellTaxPercent < 100)) {
    throw new Error('SELL_TAX_PERCENT must be a number from 0 to 99, for example 13.');
  }

  const webPort = Number(process.env.WEB_PORT || 3000);
  if (!(Number.isInteger(webPort) && webPort >= 1 && webPort <= 65535)) {
    throw new Error('WEB_PORT must be a port number from 1 to 65535.');
  }

  return {
    apiToken: process.env.DELTAFORCE_API_TOKEN || '',
    apiBaseUrl: (process.env.DELTAFORCE_API_BASE_URL || 'https://api.deltaforceapi.com').replace(/\/$/, ''),
    sellTaxPercent,
    webPort,
    // Only this computer by default; set WEB_HOST=0.0.0.0 on a server so others can open the site.
    webHost: process.env.WEB_HOST || '127.0.0.1',
    // Point this at the bot's data/recipes.json to share one recipe list instead of keeping a copy in sync.
    recipesPath: path.resolve(projectRoot, process.env.RECIPES_PATH || 'data/recipes.json'),
  };
}
