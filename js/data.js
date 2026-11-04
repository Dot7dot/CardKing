// 遊戲資料：卡牌資料庫連線、存檔、抽卡規則
import { hashStr } from './util.js';

// ───────── 遊戲規則（要調整數值改這裡） ─────────
export const RULES = {
  startCoins: 200,        // 一開始的金幣
  starterPacks: 5,        // 第一次打開送的卡包
  packPrice: 100,         // 一包卡的價格
  cardsPerPack: 5,        // 每包幾張
  dupCoins: 10,           // 重複卡換幾枚金幣
  coinsPerMinute: 10,     // 每待一分鐘賺多少
  dexRewardEvery: 5,      // 每解鎖幾張送一包該系列卡包
  goldTier: 3,            // 稀有度 >= 3：開包時黃金光
  rainbowTier: 4,         // 稀有度 >= 4：開包時彩虹光
};

// 抽到某個稀有度的權重（數字越大越容易抽到）
const RARITY_WEIGHT = { 1: 100, 2: 40, 3: 12, 4: 4, 5: 1.5 };
const rarityWeight = (r) => RARITY_WEIGHT[r] ?? Math.max(0.2, 1.5 * 0.4 ** (r - 5));

// 四種型態：三種變體各 15%，一般 55%
export const VARIANTS = {
  normal: { label: '一般', chance: 0.55 },
  holo: { label: '金光亮面', chance: 0.15 },
  matte: { label: '霧面', chance: 0.15 },
  gold: { label: '金色邊框', chance: 0.15 },
};
export const VARIANT_ORDER = ['normal', 'holo', 'matte', 'gold'];

const DEFAULT_API = 'https://card-uploader.onrender.com';
const SAVE_KEY = 'cardking.save.v1';
const CACHE_KEY = 'cardking.cards.v1';
const UNSORTED = '未分類';

// ───────── 稀有度 ─────────
const RARITY_WORDS = [
  [/普通|common|^c$|^n$/i, 1], [/稀有|rare|^r$/i, 2], [/史詩|epic|^sr$/i, 3],
  [/傳說|legend|^ssr$|^ur$/i, 4], [/神話|myth/i, 5],
];
export function rarityNum(rarity) {
  if (rarity == null || rarity === '') return 0;
  const n = parseInt(String(rarity).replace(/[^\d-]/g, ''), 10);
  if (Number.isFinite(n)) return Math.max(0, n);
  for (const [re, v] of RARITY_WORDS) if (re.test(String(rarity))) return v;
  const stars = (String(rarity).match(/★/g) || []).length;
  return stars || 1;
}
export const tierOf = (r) => (r >= RULES.rainbowTier ? 'rainbow' : r >= RULES.goldTier ? 'gold' : 'base');

// ───────── 系列顏色（每個系列固定一個蠟筆色） ─────────
const PALETTE = ['#e5533d', '#3d7fe0', '#5bb04f', '#8a5cd6', '#f39a2b', '#2bb3a3', '#e46aa6', '#d4b21f', '#a8714a', '#4a5bd6', '#c0392b', '#16a085'];
const colorMap = new Map();
export function setColor(name) {
  if (!colorMap.has(name)) colorMap.set(name, PALETTE[hashStr(name) % PALETTE.length]);
  return colorMap.get(name);
}
function assignColors(setNames) {
  colorMap.clear();
  const used = new Set();
  for (const name of [...setNames].sort()) {
    let i = hashStr(name) % PALETTE.length;
    for (let k = 0; k < PALETTE.length && used.has(i); k++) i = (i + 1) % PALETTE.length;
    used.add(i);
    colorMap.set(name, PALETTE[i]);
  }
}

// ───────── 卡牌資料庫 ─────────
export const lib = { cards: [], byId: new Map(), sets: [], setByName: new Map(), loadedAt: 0, fromCache: false };

export function apiBase() {
  const q = new URLSearchParams(location.search).get('api');
  return (q || DEFAULT_API).replace(/\/+$/, '');
}

function setLibrary(cards, loadedAt, fromCache) {
  cards = cards.filter((c) => c && c.id != null && c.name);
  for (const c of cards) c._set = (c.set && String(c.set).trim()) || UNSORTED;
  const groups = new Map();
  for (const c of cards) {
    if (!groups.has(c._set)) groups.set(c._set, []);
    groups.get(c._set).push(c);
  }
  assignColors(groups.keys());
  lib.cards = cards.sort((a, b) => a._set.localeCompare(b._set) || a.id - b.id);
  lib.byId = new Map(cards.map((c) => [c.id, c]));
  lib.sets = [...groups].map(([name, list]) => ({ name, cards: list, color: setColor(name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  lib.setByName = new Map(lib.sets.map((s) => [s.name, s]));
  lib.loadedAt = loadedAt;
  lib.fromCache = fromCache;
}

/** 先用快取（秒開），再向伺服器要最新的卡牌 */
export function loadCachedLibrary() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw?.api === apiBase() && Array.isArray(raw.cards) && raw.cards.length) {
      setLibrary(raw.cards, raw.at, true);
      return true;
    }
  } catch { /* 快取壞了就重新抓 */ }
  return false;
}

export async function fetchLibrary({ timeoutMs = 90000, onSlow } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const slow = setTimeout(() => onSlow?.(), 2500);
  try {
    const res = await fetch(`${apiBase()}/api/cards`, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`伺服器回應 ${res.status}`);
    const data = await res.json();
    const cards = Array.isArray(data) ? data : data.cards;
    if (!Array.isArray(cards)) throw new Error('資料格式不正確');
    setLibrary(cards, Date.now(), false);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ api: apiBase(), at: Date.now(), cards })); } catch { /* 空間不足 */ }
  } finally {
    clearTimeout(timer);
    clearTimeout(slow);
  }
}

// ───────── 存檔 ─────────
export let save;

function freshSave() {
  return {
    coins: RULES.startCoins,
    packs: [],                 // [{ id, set }]
    col: {},                   // { [cardId]: { v: ['normal', 'holo'], t: 首次取得時間 } }
    rewards: {},               // { [set]: 已領取的圖鑑獎勵包數 }
    starterGiven: false,
    minuteMs: 0,               // 距離下一次 +10 金幣累積的毫秒
    stats: { opened: 0, dupCoins: 0 },
    sound: true,
  };
}

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    save = s && typeof s === 'object' ? { ...freshSave(), ...s } : freshSave();
  } catch {
    save = freshSave();
  }
  return save;
}

export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* 無痕模式等 */ }
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function addPacks(setName, n = 1) {
  for (let i = 0; i < n; i++) save.packs.push({ id: uid(), set: setName });
}

/** 新手禮物：五包卡包平均分到各系列 */
export function giveStarterPacks() {
  if (save.starterGiven || !lib.sets.length) return false;
  for (let i = 0; i < RULES.starterPacks; i++) addPacks(lib.sets[i % lib.sets.length].name);
  save.starterGiven = true;
  persist();
  return true;
}

export function buyPack(setName) {
  if (save.coins < RULES.packPrice) return false;
  save.coins -= RULES.packPrice;
  addPacks(setName);
  persist();
  return true;
}

// ───────── 收藏與圖鑑 ─────────
export const owned = (id) => !!save.col[id];
export const ownedCards = () => lib.cards.filter((c) => save.col[c.id]);
export const unlockedIn = (set) => set.cards.filter((c) => save.col[c.id]).length;

/** 圖鑑獎勵：該系列每解鎖 5 張送一包，回傳這次新送出的 [{ set, n }] */
export function claimDexRewards() {
  const out = [];
  for (const set of lib.sets) {
    const earned = Math.floor(unlockedIn(set) / RULES.dexRewardEvery);
    const claimed = save.rewards[set.name] || 0;
    if (earned > claimed) {
      addPacks(set.name, earned - claimed);
      save.rewards[set.name] = earned;
      out.push({ set: set.name, n: earned - claimed });
    }
  }
  return out;
}

// ───────── 抽卡 ─────────
function rollVariant() {
  let x = Math.random();
  for (const key of ['holo', 'matte', 'gold']) {
    x -= VARIANTS[key].chance;
    if (x < 0) return key;
  }
  return 'normal';
}

function drawCard(pool) {
  // 先依權重決定稀有度，再從該稀有度的卡裡平均抽一張
  const tiers = new Map();
  for (const c of pool) {
    const r = rarityNum(c.rarity);
    if (!tiers.has(r)) tiers.set(r, []);
    tiers.get(r).push(c);
  }
  const entries = [...tiers].map(([r, list]) => [rarityWeight(r || 1), list]);
  let x = Math.random() * entries.reduce((s, [w]) => s + w, 0);
  for (const [w, list] of entries) {
    x -= w;
    if (x < 0) return list[Math.floor(Math.random() * list.length)];
  }
  const list = entries[entries.length - 1][1];
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 打開一包卡：決定內容、寫進收藏、重複卡換金幣。
 * 「重複」= 同一張卡、同一種型態已經擁有；同一張卡的新型態會收進收藏。
 */
export function openPack(packId) {
  const idx = save.packs.findIndex((p) => p.id === packId);
  if (idx < 0) return null;
  const pack = save.packs[idx];
  const pool = lib.setByName.get(pack.set)?.cards ?? lib.cards;
  if (!pool.length) return null;
  save.packs.splice(idx, 1);

  // 先抽好並排序（最稀有的留到最後翻），再依翻牌順序判斷新卡／重複
  const draws = [];
  for (let i = 0; i < RULES.cardsPerPack; i++) {
    const card = drawCard(pool);
    draws.push({ card, variant: rollVariant(), r: rarityNum(card.rarity) });
  }
  draws.sort((a, b) => a.r - b.r || (b.variant === 'normal') - (a.variant === 'normal'));

  const results = [];
  for (const { card, variant, r } of draws) {
    const entry = save.col[card.id];
    const isNew = !entry;
    const dup = !!entry && entry.v.includes(variant);
    if (dup) {
      save.coins += RULES.dupCoins;
      save.stats.dupCoins += RULES.dupCoins;
    } else if (entry) {
      entry.v.push(variant);
    } else {
      save.col[card.id] = { v: [variant], t: Date.now() };
    }
    results.push({ card, variant, isNew, dup, newVariant: !isNew && !dup, r });
  }
  save.stats.opened++;
  const best = Math.max(...results.map((x) => x.r));
  const rewards = claimDexRewards();
  persist();
  return { pack, results, tier: tierOf(best), coins: results.filter((x) => x.dup).length * RULES.dupCoins, rewards };
}
