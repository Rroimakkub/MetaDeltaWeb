import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateCraft } from './api.js';
import { getConfig } from './config.js';
import { getCachedCraftRecommendations } from './crafting.js';
import { getPlayerReport, getSeasons, isPlayerReportCached, isSeasonChoice, PlayerNotFoundError } from './player.js';
import { createRateLimiter } from './rateLimit.js';

// MetaDelta website: Black Site craft recommendations ranked by profit per hour from live market prices.
const config = getConfig();
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const TOP_PER_WORKSHOP = 5;
// In-game order of the Black Site workshops; any other workshop in the recipe file is listed after these.
const WORKSHOPS = ['Cyber Warfare Division', 'Workbench', 'Pharmacy', 'Armor Bench'];

// The only files the site serves; request paths never reach the file system directly.
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/player': ['player.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/ui.js': ['ui.js', 'text/javascript; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/player.js': ['player.js', 'text/javascript; charset=utf-8'],
};
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.deltaforceapi.com https://www.playdeltaforce.com data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'",
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

// The JSON is rebuilt only when a new pricing pass has finished.
let payload = { result: null, body: null };
async function craftsPayload() {
  const result = await getCachedCraftRecommendations(config);
  if (payload.result !== result) {
    const { groups, skipped, pricedAt } = result;
    if (skipped.length) {
      const lines = skipped.map(({ recipe, reasons }) => `  ${recipe.workshop} / ${recipe.item}${recipe.quality == null ? '' : ` T${recipe.quality}`}: ${reasons.join('; ')}`);
      console.warn(`Skipped ${skipped.length} recipes that could not be priced:\n${lines.join('\n')}`);
    }
    const byWorkshop = new Map(groups.map(({ workshop, crafts }) => [workshop, crafts]));
    const names = [...WORKSHOPS, ...groups.map(({ workshop }) => workshop).filter((name) => !WORKSHOPS.includes(name))];
    payload = {
      result,
      body: JSON.stringify({
        updatedAt: new Date(pricedAt).toISOString(),
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

// A player lookup that misses the cache spends 5-7 calls of the API key the bot also uses, so each visitor gets
// 10 a minute and the whole site 60, which keeps someone looking up names in bulk from using up the key.
const lookupsPerVisitor = createRateLimiter({ limit: 10, windowMs: 60_000 });
const lookupsOverall = createRateLimiter({ limit: 60, windowMs: 60_000 });

// Behind a reverse proxy every request comes from the proxy, so the visitor is the address the proxy appended to
// X-Forwarded-For (the last entry; earlier ones are whatever the visitor sent). Without a proxy the header is untrusted.
function visitorAddress(request) {
  const forwarded = config.trustProxy ? request.headers['x-forwarded-for']?.split(',').at(-1)?.trim() : null;
  return forwarded || request.socket.remoteAddress || 'unknown';
}

// body: an already serialized JSON string, or a value to serialize.
const sendJson = (response, status, body) => response
  .writeHead(status, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
  .end(typeof body === 'string' ? body : JSON.stringify(body));

async function handleRequest(request, response) {
  // Request targets like "//x:99999" are not valid URLs.
  if (!URL.canParse(request.url, 'http://localhost')) {
    response.writeHead(400, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
    return;
  }
  const { pathname, searchParams } = new URL(request.url, 'http://localhost');
  if (request.method !== 'GET') {
    response.writeHead(405, HEADERS).end();
    return;
  }
  if (pathname === '/api/crafts') {
    try {
      sendJson(response, 200, await craftsPayload());
    } catch (error) {
      console.error('Could not price the recipes:', error.message);
      sendJson(response, 503, { error: 'ดึงราคาไม่สำเร็จ ลองใหม่อีกครั้งภายหลัง' });
    }
    return;
  }
  if (pathname === '/api/seasons') {
    try {
      const { seasons, current } = await getSeasons(config);
      sendJson(response, 200, { current: current?.id ?? null, seasons: seasons.map(({ id, number, name }) => ({ id, number, name })) });
    } catch (error) {
      console.error('Could not load the seasons:', error.message);
      sendJson(response, 503, { error: 'ดึงรายชื่อซีซันไม่สำเร็จ' });
    }
    return;
  }
  if (pathname === '/api/player') {
    const query = (searchParams.get('q') ?? '').trim();
    const season = searchParams.get('season') ?? '';
    if (!query || query.length > 64 || !isSeasonChoice(season)) {
      sendJson(response, 400, { error: 'ใส่ชื่อในเกมหรือ Delta Force ID' });
      return;
    }
    if (!isPlayerReportCached(query, season)) {
      const wait = lookupsPerVisitor.take(visitorAddress(request)) || lookupsOverall.take('all');
      if (wait) {
        response.setHeader('Retry-After', String(wait));
        sendJson(response, 429, { error: `ค้นหาบ่อยเกินไป ลองใหม่ในอีก ${wait} วินาที` });
        return;
      }
    }
    try {
      sendJson(response, 200, await getPlayerReport(config, query, season));
    } catch (error) {
      if (error instanceof PlayerNotFoundError) {
        sendJson(response, 404, { error: `ไม่พบผู้เล่น "${query}" ลองใช้ชื่อในเกมแบบตรงตัว หรือ Delta Force ID` });
        return;
      }
      console.error(`Could not look up player ${JSON.stringify(query)}:`, error.message);
      sendJson(response, 503, { error: 'ดึงข้อมูลผู้เล่นไม่สำเร็จ ลองใหม่อีกครั้งภายหลัง' });
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
