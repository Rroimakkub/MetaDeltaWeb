// Renders /api/crafts: one column per Black Site workshop with its best craft and the next best ones.
// The server re-prices at most every 10 minutes and answers checks from its cache,
// so checking every minute is cheap and shows new prices soon after they are ready.
const REFRESH_MS = 60 * 1000;
const TIER_COLORS = { 1: 'var(--t1)', 2: 'var(--t2)', 3: 'var(--t3)', 4: 'var(--t4)', 5: 'var(--t5)', 6: 'var(--t6)' };
const SOURCE_LABELS = { crafted: 'คราฟเอง', fixed: 'ราคาประเมิน' };
const ICON_ORIGIN = 'https://cdn.deltaforceapi.com/';

const grid = document.getElementById('grid');
const statusLine = document.getElementById('status');
const dateLine = document.getElementById('date');
const hint = document.getElementById('hint');
const hintText = hint.textContent;

let data = null;
const selected = new Map(); // workshop name -> craftKey of the craft shown in its card
const craftKey = (craft) => `${craft.item}|${craft.tier}`;

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Math.round(value));
const formatDuration = (minutes) => {
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} ชม. ${minutes % 60} นาที` : `${hours} ชม.`;
};

// Builds elements with textContent only, so names from the API are never parsed as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function icon(src, alt) {
  if (!src || !src.startsWith(ICON_ORIGIN)) return el('span', 'ph');
  const image = new Image();
  image.src = src;
  image.alt = alt;
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => image.replaceWith(el('span', 'ph')));
  return image;
}

const withTier = (node, tier) => {
  node.style.setProperty('--tier', TIER_COLORS[tier] ?? 'var(--t1)');
  return node;
};

function fact(label, value) {
  const box = el('div');
  box.append(el('span', null, label), el('b', null, value));
  return box;
}

function featureCard(craft) {
  const card = withTier(el('div', 'feature'), craft.tier);
  const art = el('div', 'art');
  if (craft.tier) art.append(el('span', 'tier-tag', `T${craft.tier}`));
  art.append(icon(craft.icon, craft.item));

  const rate = el('div', 'rate');
  rate.append(el('small', null, 'กำไรต่อชั่วโมง'), el('strong', null, formatNumber(craft.profitPerHour)));

  const facts = el('div', 'facts');
  facts.append(
    fact('กำไร/รอบ', formatNumber(craft.profit)),
    fact('ROI', craft.roi == null ? '-' : `${craft.roi}%`),
    fact(`ขายได้ (หลังภาษี ${data.sellTaxPercent}%)`, formatNumber(craft.sale)),
    fact('ต้นทุนวัตถุดิบ', formatNumber(craft.cost)),
  );

  const materials = el('div', 'mats');
  materials.append(el('h3', 'section-title', 'วัตถุดิบ'));
  for (const material of craft.materials) {
    const row = el('div', 'mat');
    const name = el('span', 'n', material.name);
    if (SOURCE_LABELS[material.source]) name.append(el('span', 'source', SOURCE_LABELS[material.source]));
    row.append(icon(material.icon, material.name), name, el('span', 'q', `×${formatNumber(material.quantity)}`), el('span', 'p', formatNumber(material.total)));
    materials.append(row);
  }

  const meta = [craft.quantity > 1 ? `ได้ ×${formatNumber(craft.quantity)}` : null, formatDuration(craft.minutes)].filter(Boolean).join(' · ');
  card.append(art, el('p', 'item-name', craft.item), el('p', 'meta', meta), rate, facts, materials);
  return card;
}

function workshopColumn(workshop) {
  const column = el('article', 'ws');
  column.append(el('div', 'ws-name', workshop.name));
  if (!workshop.crafts.length) {
    column.append(el('p', 'empty', 'ไม่มีสูตรที่ได้กำไรตอนนี้'));
    return column;
  }
  // Matched by item rather than rank, so a refresh that re-ranks the list keeps showing the same craft.
  const current = Math.max(0, workshop.crafts.findIndex((craft) => craftKey(craft) === selected.get(workshop.name)));
  column.append(featureCard(workshop.crafts[current]));

  if (workshop.crafts.length > 1) {
    const others = el('div', 'others');
    others.append(el('h3', 'section-title', `${workshop.crafts.length} อันดับในแผนกนี้`));
    workshop.crafts.forEach((craft, index) => {
      const button = withTier(el('button', 'other'), craft.tier);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(index === current));
      button.append(el('span', 'rank', `${index + 1}.`), icon(craft.icon, ''), el('span', 'n', craft.item), el('span', 'r', `${formatNumber(craft.profitPerHour)}/ชม.`));
      button.addEventListener('click', () => {
        selected.set(workshop.name, craftKey(craft));
        const next = workshopColumn(workshop);
        column.replaceWith(next);
        // The clicked button was replaced too; focus its copy so keyboard users stay in place.
        next.querySelectorAll('.other')[index].focus();
      });
      others.append(button);
    });
    column.append(others);
  }
  return column;
}

function render() {
  grid.replaceChildren(...data.workshops.map(workshopColumn));
  dateLine.textContent = new Date(data.updatedAt).toLocaleDateString('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' });
  hint.textContent = data.skipped ? `${hintText} • ข้าม ${data.skipped} สูตรเพราะดึงราคาไม่ได้` : hintText;
  showStatus();
}

function showStatus() {
  if (!data) return;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(data.updatedAt).getTime()) / 60000));
  statusLine.classList.remove('error');
  statusLine.textContent = `อัปเดตราคา${minutes ? ` ${minutes} นาทีที่แล้ว` : 'เมื่อสักครู่'} • รีเฟรชเองทุก 10 นาที`;
}

async function load() {
  try {
    const response = await fetch('/api/crafts', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    // Most checks get the same prices back; re-rendering then would only reset the page under the user.
    if (body.updatedAt === data?.updatedAt) {
      showStatus();
      return;
    }
    data = body;
    render();
  } catch (error) {
    statusLine.classList.add('error');
    statusLine.textContent = `โหลดราคาไม่สำเร็จ: ${error.message}`;
    if (!data) grid.replaceChildren(el('p', 'loading', 'ยังโหลดคำแนะนำไม่ได้ จะลองใหม่อัตโนมัติ'));
  }
}

load();
setInterval(load, REFRESH_MS);
setInterval(showStatus, 30_000);
