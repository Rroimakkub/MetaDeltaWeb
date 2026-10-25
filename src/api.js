// DeltaForceAPI client: market prices and the item catalog (names, tiers, icons).

export async function callApi(config, method, body) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Connect-Protocol-Version': '1',
  };
  if (config.apiToken) headers['deltaforceapi-gateway-key'] = config.apiToken;

  const response = await fetch(`${config.apiBaseUrl}/deltaforceapi.gateway.ApiService/${method}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error = new Error(`DeltaForce API ${method} responded with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function fetchMarketPrice(config, item) {
  const data = await callApi(config, 'GetItemAuctionPrice', { itemId: item.id });
  if (data.price?.price == null) {
    // Same status the API uses for an item with no price, so callers can tell "no price" from a failed request.
    const error = new Error(`No market price for ${item.name}.`);
    error.status = 404;
    throw error;
  }
  return { ...data.price, item };
}

async function listAllItems(config) {
  const items = [];
  let pageToken;
  do {
    const page = await callApi(config, 'ListItems', { pageSize: 100, language: 'LANGUAGE_EN', ...(pageToken && { pageToken }) });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}

const CATALOG_TTL = 6 * 60 * 60 * 1000;
const CATALOG_RETRY_MS = 60 * 1000;
let catalog = null;
let catalogFailure = null;

// All items (about 3,800). Loading takes ~13 seconds, so the list is cached for 6 hours.
// After a failed load, lookups fail with that error for a minute instead of each one loading the list again.
function getCatalog(config) {
  if (!catalog || Date.now() - catalog.loadedAt > CATALOG_TTL) {
    if (catalogFailure && Date.now() - catalogFailure.at < CATALOG_RETRY_MS) return Promise.reject(catalogFailure.error);
    const items = listAllItems(config);
    catalog = { items, loadedAt: Date.now() };
    items.catch((error) => {
      if (catalog?.items === items) catalog = null;
      catalogFailure = { error, at: Date.now() };
    });
  }
  return catalog.items;
}

export function normalizeName(name) {
  return String(name ?? '').toLocaleLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]/g, '');
}

// Matches an exact name first, then (when a quality tier is given) a unique item whose name starts with it,
// so shorthand like "5.7x28mm" + tier 5 still resolves to the full in-game name.
// Some names exist twice (one copy not sold on the market), so market items win ties.
export async function findItem(config, name, quality) {
  const items = (await getCatalog(config)).filter((item) => item.name);
  const key = normalizeName(name);
  const pick = (list) => {
    const tiered = quality == null ? list : list.filter((item) => item.quality === quality);
    const onMarket = tiered.filter((item) => item.auctionable !== false);
    return onMarket.length ? onMarket : tiered;
  };
  const exact = items.filter((item) => normalizeName(item.name) === key);
  if (exact.length && (pick(exact).length || quality == null)) return pick(exact)[0] ?? exact[0];

  const prefixed = pick(items.filter((item) => normalizeName(item.name).startsWith(key)));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) {
    const names = prefixed.slice(0, 5).map((item) => item.name).join(', ');
    throw new Error(`"${name}"${quality == null ? '' : ` T${quality}`} matches several items (${names}). Use the full name.`);
  }
  throw new Error(`Item "${name}" not found.`);
}

export function calculateCraft({ sale, materials, minutes }) {
  const profit = sale - materials;
  return {
    profit,
    profitPerHour: Math.floor((profit / minutes) * 60),
    roi: materials ? Math.round((profit / materials) * 100) : null,
  };
}
