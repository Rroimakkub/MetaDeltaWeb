// Renders /api/player like the Operations overview of the "My Data" page: the player's rank and stash,
// then the economy, combat and squad groups with the first stat of each shown large.
import { el, fact, formatNumber } from './ui.js';

const RANK_IMAGES = 'https://www.playdeltaforce.com/basic_info/';
// Operations rank tiers from playdeltaforce.com/basic_info/ranks_en.js: [lowest score, name, badge].
const RANKS = [
  [1000, 'Bronze III', 'rank_4e3b05f68ab6a729bce3140033f411cd.png'],
  [1150, 'Bronze II', 'rank_755bcc474ce917a4b33884d6c8ccf9ca.png'],
  [1300, 'Bronze I', 'rank_92f16ed2fe6ed2b666d7a96b58f2023b.png'],
  [1450, 'Silver III', 'rank_15794bf08b4352369dede3e539273caa.png'],
  [1600, 'Silver II', 'rank_ea0dbe9a29630778ffb47a0ba6dc9055.png'],
  [1750, 'Silver I', 'rank_2b6b71f3a1328abd610e8156dc043a3b.png'],
  [1900, 'Gold IV', 'rank_c347649900586c186bb3dbd7f7ffff42.png'],
  [2100, 'Gold III', 'rank_6628c65e72bd0d45e036605ba7d07263.png'],
  [2300, 'Gold II', 'rank_5d66b4dab79ee1cf6e20fcc6db656129.png'],
  [2500, 'Gold I', 'rank_53a9c3cdc294117f26954a5e739b27c8.png'],
  [2700, 'Platinum IV', 'rank_45bec4294e2ffbef39236146159dfbac.png'],
  [2900, 'Platinum III', 'rank_537ea2daf86aeb4d3e924fde7fe13dfe.png'],
  [3100, 'Platinum II', 'rank_59baba72328f5a9fe30ee311db95ff4a.png'],
  [3300, 'Platinum I', 'rank_00d74e1b4597a066df504ceaebd2cc04.png'],
  [3500, 'Diamond V', 'rank_10de9c73d959ad20610b2e7345df0cfc.png'],
  [3750, 'Diamond IV', 'rank_54ec0f9862b751d73d04ec1f8db7b14f.png'],
  [4000, 'Diamond III', 'rank_ea02c9844c9e55c49a20122accce9a14.png'],
  [4250, 'Diamond II', 'rank_b08a0c69940d72ff8ef5e08001785750.png'],
  [4500, 'Diamond I', 'rank_fc36591b61c1adba1f3c29d35f026b5c.png'],
  [4750, 'Black Hawk V', 'rank_4e2319b998a3a5a80821a08981b3946d.png'],
  [5000, 'Black Hawk IV', 'rank_fef5ffbd7a3a722fd4df0fea2454fcf5.png'],
  [5250, 'Black Hawk III', 'rank_4890f27387b095428b463272f9cc2672.png'],
  [5500, 'Black Hawk II', 'rank_c3ec51d55313ca9a9a639fc9533bdc33.png'],
  [5750, 'Black Hawk I', 'rank_4093a30992162d5ce7fa315e995312d7.png'],
  [6000, 'DF Pinnacle', 'rank_f145ef231188f33f5036a8bc27ab557e.png'],
];

const form = document.getElementById('search');
const input = document.getElementById('q');
const seasonSelect = document.getElementById('season');
const result = document.getElementById('result');
const statusLine = document.getElementById('status');
const periodLine = document.getElementById('period');
const pageTitle = document.title;

const formatDecimal = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const formatCompact = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const formatPercent = (ratio) => `${(ratio * 100).toFixed(1)}%`;
const seasonLabel = (season) => (season?.number ? `S${season.number} - ${season.name}` : 'ซีซันที่เลือก');
const rankFor = (points) => RANKS.findLast(([lowest]) => points >= lowest);

function formatPlayTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${formatNumber(hours)} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

function formatAge(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return minutes ? `${minutes} นาทีที่แล้ว` : 'เมื่อสักครู่';
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} ชม. ที่แล้ว` : `${Math.round(hours / 24)} วันที่แล้ว`;
}

// A column in the same frame as a Black Site workshop column.
function card(title) {
  const column = el('article', 'ws');
  column.style.setProperty('--tier', 'var(--accent)');
  const body = el('div', 'feature');
  column.append(el('div', 'ws-name', title), body);
  return [column, body];
}

// One "Comprehensive Data" group: the first stat large, the rest as rows.
function group(title, [heroLabel, heroValue, heroClass], rows) {
  const [column, body] = card(title);
  const hero = el('div', 'rate');
  hero.append(el('small', null, heroLabel), el('strong', heroClass, heroValue));
  const list = el('dl', 'stat-list');
  for (const [label, value] of rows) {
    const row = el('div');
    row.append(el('dt', null, label), el('dd', null, value));
    list.append(row);
  }
  body.append(hero, list);
  return column;
}

function rankColumn({ rank, stash }) {
  const [column, body] = card('แรงก์ & คลัง');
  const tier = rank && rankFor(rank.points);
  const art = el('div', 'art');
  if (tier) {
    const badge = new Image();
    badge.src = RANK_IMAGES + tier[2];
    badge.alt = '';
    badge.referrerPolicy = 'no-referrer';
    badge.addEventListener('error', () => badge.remove());
    art.append(badge);
  }
  body.append(
    art,
    el('p', 'item-name', tier ? tier[1] : 'ยังไม่มีแรงก์'),
    el('p', 'meta', rank ? `${formatNumber(rank.points)} แต้ม · ${seasonLabel(rank.season)}` : 'ไม่มีแต้มแรงก์ในซีซันนี้'),
  );
  if (stash) {
    // assetsNet is cash + equipment; the collection value is reported separately and not part of it.
    const facts = el('div', 'facts');
    facts.append(
      fact('มูลค่าคลัง', formatCompact(stash.net)),
      fact('ของสะสม (แยก)', formatCompact(stash.collection)),
      fact('เงินสด', formatCompact(stash.liquid)),
      fact('อุปกรณ์', formatCompact(stash.fixed)),
    );
    body.append(facts);
    if (stash.recordedAt) body.append(el('p', 'meta', `ข้อมูลคลังอัปเดต ${formatAge(stash.recordedAt)}`));
  }
  return column;
}

function noStatsReason({ fresh, player }) {
  if (fresh) return 'API เพิ่งเริ่มดึงข้อมูลผู้เล่นนี้จากเกม สถิติยังไม่พร้อม ลองค้นหาอีกครั้งในอีกสักครู่';
  if (Number(player.levelOperations ?? 0) > 1) return 'API ไม่มีสถิติของผู้เล่นนี้ (ผู้เล่นอาจตั้งค่าซ่อนประวัติในเกม หรือ API ยังดึงข้อมูลบัญชีนี้ไม่ได้) ลองใหม่ภายหลัง';
  return 'ไม่มีสถิติโหมด Operations (ผู้เล่นอาจเล่นแต่ Warfare หรือยังไม่เคยเล่น Operations)';
}

function render(report) {
  const { player, stats } = report;
  periodLine.textContent = `${report.season ? seasonLabel(report.season) : 'ตลอดกาล'}${report.rankedOnly ? ' · Ranked' : ''}`;

  const head = el('div', 'player-head');
  head.append(
    el('h2', null, player.name),
    el('p', 'meta', [`Operations Lv. ${player.levelOperations ?? '-'}`, `Warfare Lv. ${player.levelWarfare ?? '-'}`, player.deltaForceId && `ID ${player.deltaForceId}`].filter(Boolean).join(' · ')),
  );
  if (player.pastNames.length) head.append(el('p', 'meta', `เคยใช้ชื่อ: ${player.pastNames.join(', ')}`));
  if (stats) head.append(el('p', 'summary', `เวลาเล่น ${formatPlayTime(stats.playTime)} | ${formatNumber(stats.matchesPlayed)} แมตช์`));
  const nodes = [head];
  if (report.seasonFallback) nodes.push(el('p', 'note', `ไม่มีสถิติ Operations ใน ${seasonLabel(report.requestedSeason)} จึงแสดงสถิติตลอดกาลแทน`));
  if (report.rankedOnly) nodes.push(el('p', 'note', 'API มีเฉพาะสถิติแมตช์ Ranked ของผู้เล่นนี้'));

  const bar = el('div', 'bar');
  bar.append(el('h2', null, 'Operations – Comprehensive Data'));
  const grid = el('div', 'grid');
  grid.append(rankColumn(report));
  if (stats) {
    grid.append(
      group('ข้อมูลเศรษฐกิจ', ['มูลค่าที่ขนออก', formatCompact(stats.extractedAssets)], [
        ['ถอนตัวสำเร็จ / ล้มเหลว', `${formatNumber(stats.matchesExtracted)} / ${formatNumber(stats.matchesLost)}`],
        ['ออกกลางเกม', formatNumber(stats.matchesQuit)],
        ['Mandelbrick ที่ขนออก', formatNumber(stats.extractedMandlebricks)],
      ]),
      group('ข้อมูลการต่อสู้', ['K/D ง่าย : กลาง : ยาก', [stats.kdRatioEasy, stats.kdRatioMedium, stats.kdRatioHard].map(formatDecimal).join(' : '), 'wide'], [
        ['K/D รวม', formatDecimal(stats.kdRatio)],
        ['ยอดฆ่า', formatNumber(stats.totalKills)],
        ['ความแม่น', formatPercent(stats.bulletDischargedHitRatio)],
        ['ล้มด้วย Headshot', formatPercent(stats.knockedHeadshotRatio)],
      ]),
      group('ข้อมูลทีม', ['อัตราถอนตัว', formatPercent(stats.extractionRate)], [
        ['มูลค่าที่เพื่อนขนออก', formatCompact(stats.extractedTeammateAssets)],
        ['ช่วยชีวิตเพื่อน', formatNumber(stats.revives)],
        ['เก็บป้ายเพื่อน', formatNumber(stats.pickups)],
      ]),
    );
  } else {
    grid.append(el('p', 'loading', noStatsReason(report)));
  }
  nodes.push(bar, grid);
  result.replaceChildren(...nodes);
  document.title = `${player.name} — ${pageTitle}`;
  statusLine.classList.remove('error');
  statusLine.textContent = stats?.updatedAt ? `สถิติอัปเดต ${formatAge(stats.updatedAt)}` : '';
}

// Fills the season list: the current season first, then lifetime, then past seasons newest first.
async function loadSeasons() {
  const response = await fetch('/api/seasons');
  if (!response.ok) return;
  const { current, seasons } = await response.json();
  const currentSeason = seasons.find((season) => season.id === current);
  if (currentSeason) seasonSelect.options[0].textContent = `${seasonLabel(currentSeason)} (ซีซันนี้)`;
  for (const season of seasons) if (season.id !== current) seasonSelect.append(new Option(seasonLabel(season), season.id));
}

let latest = 0;

// Searches for what the URL says (?q=&season=), so a result can be linked, reloaded and reached with Back.
async function search() {
  const params = new URLSearchParams(location.search);
  const query = (params.get('q') ?? '').trim();
  const season = params.get('season') ?? '';
  input.value = query;
  seasonSelect.value = [...seasonSelect.options].some((option) => option.value === season) ? season : '';
  if (!query) return;
  const request = ++latest;
  result.replaceChildren(el('p', 'loading', `กำลังค้นหา "${query}"… ผู้เล่นที่ยังไม่เคยถูกค้นอาจใช้เวลาสักครู่`));
  statusLine.classList.remove('error');
  statusLine.textContent = 'กำลังค้นหา…';
  try {
    const response = await fetch(`/api/player?${new URLSearchParams({ q: query, season })}`, { cache: 'no-store' });
    const body = await response.json();
    if (request !== latest) return;
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    render(body);
  } catch (error) {
    if (request !== latest) return;
    document.title = pageTitle;
    periodLine.textContent = '';
    result.replaceChildren(el('p', 'loading', error.message));
    statusLine.classList.add('error');
    statusLine.textContent = 'ค้นหาไม่สำเร็จ';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  const params = new URLSearchParams({ q: query });
  if (seasonSelect.value) params.set('season', seasonSelect.value);
  history.pushState(null, '', `/player?${params}`);
  search();
});
// Picking another season re-runs the current search.
seasonSelect.addEventListener('change', () => { if (input.value.trim()) form.requestSubmit(); });
window.addEventListener('popstate', search);

await loadSeasons().catch(() => {});
search();
