import { callApi } from './api.js';

// Operations stats of any player: the same figures as the "My Data" page on playdeltaforce.com, which only shows
// the signed-in player's own data. Ported from the MetaDelta bot's /player lookup.

export const LIFETIME = 'lifetime';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEASON_TTL = 6 * 60 * 60 * 1000;
const REPORT_TTL = 5 * 60 * 1000;
const MAX_REPORTS = 500;
const FRESH_RECORD_MS = 10 * 60 * 1000;
const FRESH_RETRIES = 2;
const FRESH_RETRY_DELAY_MS = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;
const STASH_DAYS = 7;
// The API records a stash only about every 15 hours, so history from before the chart supplies the value going into it.
const STASH_LOOKBACK_DAYS = 14;
const MAX_HISTORY_PAGES = 5;
const STAT_FIELDS = [
  'playTime', 'matchesPlayed', 'matchesExtracted', 'matchesLost', 'matchesQuit', 'extractionRate',
  'extractedAssets', 'extractedTeammateAssets', 'extractedMandlebricks',
  'totalKills', 'kdRatio', 'kdRatioEasy', 'kdRatioMedium', 'kdRatioHard', 'bulletDischargedHitRatio', 'knockedHeadshotRatio',
  'revives', 'pickups',
];

export class PlayerNotFoundError extends Error {}

// A season choice from the page: empty for the current season, LIFETIME, or a season id.
export const isSeasonChoice = (value) => !value || value === LIFETIME || UUID.test(value);

// Missing stats or stash data (e.g. a player who never played Operations) come back as null instead of failing.
const optional = (promise) => promise.catch((error) => {
  if (error.status === 404) return null;
  throw error;
});

async function loadSeasons(config) {
  const seasons = [];
  let pageToken;
  do {
    const page = await callApi(config, 'ListSeasons', { pageSize: 100, language: 'LANGUAGE_EN', ...(pageToken && { pageToken }) });
    seasons.push(...(page.seasons ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  seasons.sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  const current = (await optional(callApi(config, 'GetSeasonCurrent', {})))?.season ?? null;
  return { seasons, current };
}

let seasonCache = null;

// All seasons, newest first, and the current one. Cached because they only change when a new season starts.
export function getSeasons(config) {
  if (!seasonCache || Date.now() - seasonCache.loadedAt > SEASON_TTL) {
    const result = loadSeasons(config);
    seasonCache = { result, loadedAt: Date.now() };
    result.catch(() => { if (seasonCache?.result === result) seasonCache = null; });
  }
  return seasonCache.result;
}

// Accepts a display name, a numeric Delta Force ID, or the API's player UUID.
async function findPlayer(config, query) {
  const body = UUID.test(query) ? { id: query } : /^\d+$/.test(query) ? { deltaForceId: query } : { name: query };
  try {
    return (await callApi(config, 'GetPlayer', body)).player;
  } catch (error) {
    if (error.status === 404) throw new PlayerNotFoundError(query);
    throw error;
  }
}

async function fetchStashHistory(config, playerId) {
  const startTime = new Date(Date.now() - (STASH_DAYS + STASH_LOOKBACK_DAYS) * DAY_MS).toISOString();
  const records = [];
  let pageToken;
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const result = await callApi(config, 'GetPlayerOperationHistoricalStashValue', { playerId, startTime, pageSize: 100, ...(pageToken && { pageToken }) });
    records.push(...(result.stashes ?? []));
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  return records;
}

// The stash over the last 7 days: its value going into them (the last record before, if any) and each record since.
// The current stash is usually also the newest history record, so points are kept one per timestamp.
function stashChart(history, stash, now = Date.now()) {
  const start = now - STASH_DAYS * DAY_MS;
  const points = [...new Map([...history, ...(stash ? [stash] : [])]
    .map((entry) => [new Date(entry.createdAt).getTime(), Number(entry.assetsNet ?? 0)])
    .filter(([at]) => !Number.isNaN(at))).entries()]
    .sort(([a], [b]) => a - b);
  const before = points.filter(([at]) => at < start);
  const during = points.filter(([at]) => at >= start && at <= now);
  if (!before.length && !during.length) return null;
  return {
    start: new Date(start).toISOString(),
    end: new Date(now).toISOString(),
    baseline: before.at(-1)?.[1] ?? null,
    points: during.map(([at, value]) => ({ at: new Date(at).toISOString(), value })),
  };
}

const shapeSeason = (season) => season && { id: season.id, number: season.number ?? null, name: season.name ?? null };
const shapeStats = (stats) => ({ ...Object.fromEntries(STAT_FIELDS.map((key) => [key, Number(stats[key] ?? 0)])), updatedAt: stats.updatedAt ?? null });

async function fetchPlayerReport(config, query, seasonChoice) {
  const [player, { seasons, current }] = await Promise.all([findPlayer(config, query), getSeasons(config)]);
  const season = seasonChoice === LIFETIME ? null : seasonChoice ? (seasons.find((entry) => entry.id === seasonChoice) ?? { id: seasonChoice }) : current;
  // Some players only have ranked stats (the unranked lookup returns 404), so ask for both and show what exists.
  const statsFor = (ranked, seasonOfStats) => optional(callApi(config, 'GetPlayerOperationStats', {
    playerId: player.id, ranked, ...(seasonOfStats && { seasonId: seasonOfStats.id }),
  })).then((response) => response?.stats ?? null);
  const bothFor = (seasonOfStats) => Promise.all([statsFor(false, seasonOfStats), statsFor(true, seasonOfStats)]);

  // The rank card shows the chosen season's ranked points, or the current season's next to lifetime stats.
  let [[unranked, ranked], stash, currentRanked, stashHistory] = await Promise.all([
    bothFor(season),
    optional(callApi(config, 'GetPlayerOperationStashValue', { playerId: player.id })).then((response) => response?.stash ?? null),
    !season && current ? statsFor(true, current) : null,
    // The chart is an extra: if its history can't be loaded, show the stats without it.
    fetchStashHistory(config, player.id).catch((error) => {
      if (error.status !== 404) console.warn(`Could not load the stash history of ${player.name}:`, error.message);
      return [];
    }),
  ]);

  // The API fetches a player from the game the first time anyone looks them up, so a brand-new record
  // can have no stats for a few seconds. Retry briefly before giving up.
  const fresh = Date.now() - new Date(player.createdAt ?? 0).getTime() < FRESH_RECORD_MS;
  for (let attempt = 0; fresh && !unranked && !ranked && attempt < FRESH_RETRIES; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, FRESH_RETRY_DELAY_MS));
    [unranked, ranked] = await bothFor(season);
  }

  // Nothing in the chosen season (e.g. hasn't played Operations this season): show lifetime stats instead.
  let seasonFallback = false;
  if (!unranked && !ranked && season) {
    [unranked, ranked] = await bothFor(null);
    seasonFallback = Boolean(unranked || ranked);
  }

  const rankSeason = season ?? current;
  const rankPoints = seasonFallback ? 0 : Number((season ? ranked : currentRanked)?.rankedPoints ?? 0);
  const stats = unranked ?? ranked;
  return {
    player: {
      name: player.name,
      deltaForceId: player.deltaForceId ?? null,
      levelOperations: player.levelOperations ?? null,
      levelWarfare: player.levelWarfare ?? null,
      pastNames: [...new Set((player.nameHistory ?? []).map((entry) => entry.name).filter((name) => name && name !== player.name))].slice(0, 5),
    },
    season: seasonFallback ? null : shapeSeason(season),
    requestedSeason: shapeSeason(season),
    seasonFallback,
    fresh,
    rankedOnly: !unranked && Boolean(ranked),
    stats: stats && shapeStats(stats),
    rank: rankPoints ? { points: rankPoints, season: shapeSeason(rankSeason) } : null,
    stash: stash && {
      net: Number(stash.assetsNet ?? 0),
      liquid: Number(stash.assetsLiquid ?? 0),
      fixed: Number(stash.assetsFixed ?? 0),
      collection: Number(stash.assetsCollection ?? 0),
      recordedAt: stash.createdAt ?? null,
    },
    stashChart: stashChart(stashHistory, stash),
  };
}

const reports = new Map(); // `${query}|${seasonChoice}` -> { at, result }

// Each lookup costs 4-6 API calls, so a report is reused for 5 minutes.
export function getPlayerReport(config, query, seasonChoice) {
  const key = `${query}|${seasonChoice}`;
  const hit = reports.get(key);
  if (hit && Date.now() - hit.at < REPORT_TTL) return hit.result;
  const result = fetchPlayerReport(config, query, seasonChoice);
  reports.delete(key);
  reports.set(key, { at: Date.now(), result });
  if (reports.size > MAX_REPORTS) reports.delete(reports.keys().next().value);
  result.catch(() => { if (reports.get(key)?.result === result) reports.delete(key); });
  return result;
}
