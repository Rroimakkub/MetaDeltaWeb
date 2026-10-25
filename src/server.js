import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateCraft } from './api.js';
import { getConfig } from './config.js';
import { getCachedCraftRecommendations } from './crafting.js';

// MetaDelta website: Black Site craft recommendations ranked by profit per hour from live market prices.
const config = getConfig();
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const TOP_PER_WORKSHOP = 5;
// In-game order of the Black Site workshops; any other workshop in the recipe file is listed after these.
const WORKSHOPS = ['Cyber Warfare Division', 'Workbench', 'Pharmacy', 'Armor Bench'];

// The only files the site serves; request paths never reach the file system directly.
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
};
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.deltaforceapi.com data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'",
};

const shapeCraft = (craft) => {
  const { profit, profitPerHour, roi } = calculateCraft(craft);
  return {
    item: craft.item,
    tier: craft.tier ?? null,
    icon: craft.icon ?? null,
    quantity: craft.quantity,
    minutes: craft.minutes,
    sale: craft.sale,
    cost: craft.materials,
    profit,
    profitPerHour,
    roi,
    materials: craft.materialList.map(({ name, icon, quantity, total, source }) => ({ name, icon: icon ?? null, quantity, total, source })),
  };
};

// Prices are cached for 10 minutes; the JSON is rebuilt only when that cache refreshes.
let payload = { result: null, body: null };
async function craftsPayload() {
  const result = getCachedCraftRecommendations(config);
  const { groups, skipped } = await result;
  if (payload.result !== result) {
    const byWorkshop = new Map(groups.map(({ workshop, crafts }) => [workshop, crafts]));
    const names = [...WORKSHOPS, ...groups.map(({ workshop }) => workshop).filter((name) => !WORKSHOPS.includes(name))];
    payload = {
      result,
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        sellTaxPercent: config.sellTaxPercent,
        skipped: skipped.length,
        workshops: names.map((name) => ({
          name,
          crafts: (byWorkshop.get(name) ?? []).filter((craft) => calculateCraft(craft).profitPerHour > 0).slice(0, TOP_PER_WORKSHOP).map(shapeCraft),
        })),
      }),
    };
  }
  return payload.body;
}

async function handleRequest(request, response) {
  // Request targets like "//x:99999" are not valid URLs.
  if (!URL.canParse(request.url, 'http://localhost')) {
    response.writeHead(400, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
    return;
  }
  const { pathname } = new URL(request.url, 'http://localhost');
  if (request.method !== 'GET') {
    response.writeHead(405, HEADERS).end();
    return;
  }
  if (pathname === '/api/crafts') {
    try {
      const body = await craftsPayload();
      response.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' }).end(body);
    } catch (error) {
      console.error('Could not price the recipes:', error.message);
      response.writeHead(503, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'ดึงราคาไม่สำเร็จ ลองใหม่อีกครั้งภายหลัง' }));
    }
    return;
  }
  const file = FILES[pathname];
  if (!file) {
    response.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const [name, type] = file;
  response.writeHead(200, { ...HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' }).end(await readFile(path.join(webRoot, name)));
}

// An error while answering must not become an unhandled rejection, which would stop the whole server.
const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(`Could not answer ${request.url}:`, error.message);
    if (response.headersSent) response.destroy();
    else response.writeHead(500, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Server error');
  });
});

server.listen(config.webPort, config.webHost, () => {
  console.log(`MetaDelta web is running at http://${config.webHost === '0.0.0.0' ? 'localhost' : config.webHost}:${config.webPort}`);
});
// Price the recipes now so the first visitor doesn't wait ~30 seconds.
craftsPayload().catch((error) => console.warn('Could not price the recipes yet:', error.message));
