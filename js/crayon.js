// 蠟筆風的繪圖工具：卡牌、卡包、卡背、按鈕底圖
import { esc, mulberry32, hashStr } from './util.js';
import { rarityNum, tierOf, setColor, VARIANTS } from './data.js';

const INK = '#2d2a32';
const f = (n) => Math.round(n * 10) / 10;

function smoothClosed(pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M${f(m0[0])} ${f(m0[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`;
  }
  return d + 'Z';
}

/** 手繪感的長方形 */
export function roughRect(rng, x, y, w, h, jit = 1.5, step = 16) {
  const pts = [];
  const edge = (x1, y1, x2, y2) => {
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x1 + (x2 - x1) * t + (rng() - 0.5) * 2 * jit, y1 + (y2 - y1) * t + (rng() - 0.5) * 2 * jit]);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
  return smoothClosed(pts);
}

/** 手繪感的圓 */
export function roughCircle(rng, cx, cy, r, jit = 1.2, n = 12) {
  const pts = [];
  const off = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const rr = r + (rng() - 0.5) * 2 * jit;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return smoothClosed(pts);
}

/** 在矩形範圍內來回塗鴉（蠟筆塗色的筆觸） */
function scribble(rng, x, y, w, h, color, width = 3, gap = 9) {
  let d = `M${f(x)} ${f(y + h)}`;
  for (let sx = x; sx < x + w + h; sx += gap) {
    const x1 = Math.min(sx, x + w), y1 = sx > x + w ? y + (sx - x - w) : y;
    const x2 = Math.max(x, sx - h), y2 = sx - h < x ? y + h - (x - (sx - h)) : y + h;
    d += `L${f(x1 + (rng() - 0.5) * 2)} ${f(y1)}L${f(x2 + (rng() - 0.5) * 2)} ${f(y2)}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function doubleStroke(rng, pathFn, stroke, w1, w2, fill = 'none') {
  return `<path d="${pathFn()}" fill="${fill}" stroke="${stroke}" stroke-width="${w1}" stroke-linejoin="round"/>` +
    `<path d="${pathFn()}" fill="none" stroke="${stroke}" stroke-width="${w2}" stroke-opacity=".75" stroke-linejoin="round"/>`;
}

const STAT_COLORS = { cost: '#3f86e0', attack: '#f2b42c', health: '#e4503f' };

/** 卡牌外框（SVG，250×350 座標） */
function cardFrameSVG(card, variant, color) {
  const rng = mulberry32(card.id * 7919 + 17);
  const gold = variant === 'gold';
  const frame = gold ? 'url(#g-gold)' : INK;
  const stat = (key, cx, cy) => card[key] == null ? '' :
    doubleStroke(rng, () => roughCircle(rng, cx, cy, 21, 1.3), INK, 3, 1.6, STAT_COLORS[key]) +
    `<path d="M${cx - 12} ${cy - 6} q6 -9 15 -8" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/>`;
  return `<svg class="card-frame" viewBox="0 0 250 350" aria-hidden="true">
    <g filter="url(#crayon)">
      ${doubleStroke(rng, () => roughRect(rng, 17, 17, 216, 162, 1.3), INK, 3.2, 1.6)}
      <path d="${roughRect(rng, 13, 186, 224, 36, 1.2)}" fill="${color}" stroke="${INK}" stroke-width="2.6"/>
      ${scribble(rng, 18, 190, 214, 28, 'rgba(255,255,255,.28)', 3, 8)}
      ${scribble(rng, 30, 236, 190, 70, 'rgba(120,100,70,.07)', 6, 14)}
      ${doubleStroke(rng, () => roughRect(rng, 6, 6, 238, 338, 1.6), frame, gold ? 10 : 5, gold ? 4 : 2.4)}
      ${gold ? `<path d="${roughRect(rng, 12, 12, 226, 326, 1)}" fill="none" stroke="url(#g-gold)" stroke-width="2.5"/>
        ${[[8, 8], [242, 8], [8, 342], [242, 342]].map(([x, y]) => `<path d="M${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}L${x - 9} ${y}Z" fill="#fff4b8" stroke="#b07a06" stroke-width="2"/>`).join('')}` : ''}
      ${stat('cost', 31, 31)}
      ${stat('attack', 31, 319)}
      ${stat('health', 219, 319)}
    </g>
  </svg>`;
}

function starsHTML(r) {
  if (!r) return '';
  return r <= 5 ? '★'.repeat(r) : `★×${r}`;
}

/** 一張卡牌的 HTML。variant：normal / holo / matte / gold */
export function cardHTML(card, variant = 'normal', { cls = '', eager = false } = {}) {
  const r = rarityNum(card.rarity);
  const tier = tierOf(r);
  const color = setColor(card._set);
  const stat = (key, c) => card[key] == null ? '' : `<div class="stat ${c}">${esc(card[key])}</div>`;
  const art = card.imageUrl
    ? `<img src="${esc(card.imageUrl)}" alt="" ${eager ? '' : 'loading="lazy"'} draggable="false">`
    : `<div class="noart" style="--h:${hashStr(card.name) % 360}">${esc([...(card.name || '?')][0])}</div>`;
  return `<div class="card v-${variant} t-${tier} ${cls}" data-card-id="${card.id}" style="--set:${color}">
    <div class="card-inner">
      <div class="card-art">${art}</div>
      ${cardFrameSVG(card, variant, color)}
      ${r ? `<div class="card-stars" title="稀有度 ${esc(card.rarity)}">${starsHTML(r)}</div>` : ''}
      <div class="card-name">${esc(card.name)}</div>
      <div class="card-sub">${esc([card.type, card.set].filter(Boolean).join(' · '))}</div>
      <div class="card-desc">${esc(card.description || '')}</div>
      ${stat('cost', 's-cost')}${stat('attack', 's-atk')}${stat('health', 's-hp')}
      <div class="fx"></div>
      ${variant !== 'normal' ? `<div class="v-tag">${VARIANTS[variant].label}</div>` : ''}
    </div>
  </div>`;
}

/** 卡背 */
export function cardBackHTML(seed = 1) {
  const rng = mulberry32(seed * 131 + 7);
  return `<div class="card card-back">
    <div class="card-inner">
      <svg class="card-frame" viewBox="0 0 250 350" aria-hidden="true">
        <g filter="url(#crayon)">
          <path d="${roughRect(rng, 6, 6, 238, 338, 1.5)}" fill="#3b2f5c" stroke="${INK}" stroke-width="5"/>
          ${scribble(rng, 14, 14, 222, 322, 'rgba(255,255,255,.08)', 5, 12)}
          ${doubleStroke(rng, () => roughRect(rng, 22, 22, 206, 306, 1.4), '#f2c84b', 3, 1.5)}
          ${doubleStroke(rng, () => roughCircle(rng, 125, 175, 58, 2), '#f2c84b', 4, 2, '#4d3f78')}
          <path d="M92 196 L98 152 L113 172 L125 145 L137 172 L152 152 L158 196 Z" fill="#f2c84b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
          <path d="M92 205 H158" stroke="#f2c84b" stroke-width="6" stroke-linecap="round"/>
        </g>
      </svg>
      <div class="back-word">CardKing</div>
    </div>
  </div>`;
}

/** 卡包：鋸齒封口的鋁箔袋（200×300 座標），撕裂線在 16% 高度 */
export const TEAR_Y = 0.16;
export function packHTML(setName, { cls = '' } = {}) {
  const color = setColor(setName);
  const rng = mulberry32(hashStr(setName) + 3);
  let outline = 'M8 14';
  for (let x = 8, i = 0; x <= 192; x += 8, i++) outline += `L${x} ${i % 2 ? 5 : 14}`;
  outline += 'L192 286';
  for (let x = 192, i = 0; x >= 8; x -= 8, i++) outline += `L${x} ${i % 2 ? 295 : 286}`;
  outline += 'Z';
  return `<div class="pack ${cls}" style="--c:${color}" data-set="${esc(setName)}">
    <svg class="pack-svg" viewBox="0 0 200 300" aria-hidden="true">
      <g filter="url(#crayon)">
        <path d="${outline}" fill="${color}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <rect x="9" y="14" width="182" height="34" fill="rgba(0,0,0,.18)"/>
        ${scribble(rng, 14, 60, 60, 150, 'rgba(255,255,255,.22)', 5, 13)}
        ${scribble(rng, 140, 120, 46, 120, 'rgba(0,0,0,.10)', 5, 13)}
        <path d="M14 49 H186" stroke="${INK}" stroke-width="2.4" stroke-dasharray="7 6"/>
        ${doubleStroke(rng, () => roughCircle(rng, 100, 128, 44, 1.8), INK, 3.2, 1.6, '#fff8e6')}
        <path d="M74 146 L80 108 L92 126 L100 100 L108 126 L120 108 L126 146 Z" fill="#f2c84b" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="${roughRect(rng, 22, 196, 156, 64, 1.3)}" fill="rgba(255,252,240,.92)" stroke="${INK}" stroke-width="2.6"/>
      </g>
    </svg>
    <div class="pack-top">CARD PACK</div>
    <div class="pack-name">${esc(setName)}</div>
    <div class="pack-count">卡包 · 5 張</div>
  </div>`;
}

/** 蠟筆塗色的按鈕／面板底圖（會被拉伸，所以線寬固定） */
export function crayonBgHTML(seed, fill, stroke = INK) {
  const rng = mulberry32(seed);
  return `<svg class="crayon-bg" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
    <g filter="url(#crayon-soft)">
      <path d="${roughRect(rng, 4, 5, 292, 90, 1.6, 20)}" fill="${fill}" stroke="${stroke}" stroke-width="3" vector-effect="non-scaling-stroke"/>
      <path d="${roughRect(rng, 5, 4, 290, 92, 1.8, 24)}" fill="none" stroke="${stroke}" stroke-opacity=".6" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    </g>
  </svg>`;
}
