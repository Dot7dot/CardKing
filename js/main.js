// 主程式：畫面切換、金幣、商店、卡包區、圖鑑、我的卡片
import {
  RULES, VARIANTS, VARIANT_ORDER, lib, save, loadSave, persist, apiBase, loadCachedLibrary, fetchLibrary,
  giveStarterPacks, buyPack, openPack, ownedCards, unlockedIn, rarityNum, setColor, claimDexRewards,
} from './data.js';
import { cardHTML, cardBackHTML, packHTML, crayonBgHTML } from './crayon.js';
import { playOpening } from './opening.js';
import { sfx, setSound, unlockAudio } from './sfx.js';
import { $, $$, esc, htmlToEl, clamp } from './util.js';

const screen = $('#screen');
const ROUTES = ['home', 'cards', 'packs', 'dex', 'shop'];
const TITLES = { home: '卡牌王', cards: '我的卡片', packs: '卡包區', dex: '卡包區', shop: '商店' };
let route = 'home';
let started = false;
let opening = false;
let cardsFilter = 'all';

// ───────── 小工具 ─────────
export function toast(msg, ms = 2400) {
  const el = htmlToEl(`<div class="toast">${msg}</div>`);
  $('#toasts').append(el);
  el.animate([{ opacity: 0, transform: 'translateY(-12px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 250, fill: 'forwards' }).finished.then(() => el.remove());
  }, ms);
}

function modal(html, { cls = '' } = {}) {
  const el = htmlToEl(`<div class="modal ${cls}"><div class="modal-bg" data-close></div><div class="modal-box">${html}</div></div>`);
  $('#modal-root').append(el);
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  $('.modal-box', el).animate([{ transform: 'scale(.85) translateY(20px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  const close = () => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).finished.then(() => el.remove());
  };
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { sfx.tap(); close(); } });
  el.close = close;
  return el;
}

// ───────── 金幣 ─────────
let shownCoins = null;
let coinAnim = 0;
function renderCoins(animate = true) {
  const el = $('#coin-val');
  const target = save.coins;
  if (shownCoins === null || !animate) {
    shownCoins = target;
    el.textContent = target;
    return;
  }
  const from = shownCoins, t0 = performance.now(), id = ++coinAnim;
  const diff = target - from;
  if (!diff) return;
  $('.coins').classList.remove('bump');
  void $('.coins').offsetWidth;
  $('.coins').classList.add('bump');
  floatText(diff > 0 ? `+${diff}` : `${diff}`, diff > 0);
  const tick = (now) => {
    if (id !== coinAnim) return;
    const k = clamp((now - t0) / 600, 0, 1);
    shownCoins = Math.round(from + diff * (1 - (1 - k) ** 3));
    el.textContent = shownCoins;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function floatText(text, good) {
  const r = $('.coins').getBoundingClientRect();
  const el = htmlToEl(`<div class="float-coin ${good ? '' : 'neg'}">${text}</div>`);
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.bottom}px`;
  document.body.append(el);
  el.animate([
    { opacity: 0, transform: 'translate(-50%,0) scale(.6)' },
    { opacity: 1, transform: 'translate(-50%,8px) scale(1.15)', offset: 0.25 },
    { opacity: 0, transform: 'translate(-50%,34px) scale(1)' },
  ], { duration: 1100, easing: 'ease-out' }).finished.then(() => el.remove());
}

function renderEarnProgress() {
  const p = clamp(save.minuteMs / 60000, 0, 1);
  $('.coin-ring').style.setProperty('--p', p);
  const bar = $('.earn-bar i');
  if (bar) bar.style.width = `${p * 100}%`;
  const secs = $('.earn-secs');
  if (secs) secs.textContent = Math.ceil((60000 - save.minuteMs) / 1000);
}

/** 待在遊戲裡（畫面在前景）每分鐘 +10 金幣 */
function startTicker() {
  let last = performance.now();
  let n = 0;
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden) persist();
  });
  addEventListener('pagehide', persist);
  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(now - last, 2000);
    last = now;
    if (document.hidden) return;
    save.minuteMs += dt;
    let earned = 0;
    while (save.minuteMs >= 60000) {
      save.minuteMs -= 60000;
      earned += RULES.coinsPerMinute;
    }
    if (earned) {
      save.coins += earned;
      persist();
      renderCoins(true);
      if (!opening) sfx.coin();
      if (route === 'shop') render();
    } else if (++n % 5 === 0) persist();
    renderEarnProgress();
  }, 1000);
}

// ───────── 畫面 ─────────
const packCount = () => save.packs.length;
const bestVariant = (vs) => ['holo', 'gold', 'matte', 'normal'].find((v) => vs.includes(v)) || 'normal';

function viewHome() {
  const owned = ownedCards();
  const fan = [...owned].sort((a, b) => rarityNum(b.rarity) - rarityNum(a.rarity)).slice(0, 3);
  const fanHTML = [0, 1, 2].map((i) => {
    const c = fan[i];
    return `<div class="fan-card f${i}">${c ? cardHTML(c, bestVariant(save.col[c.id].v)) : cardBackHTML(i + 2)}</div>`;
  }).join('');
  return `<section class="home">
    <div class="logo">
      <div class="logo-main">Card<b>King</b></div>
      <div class="logo-sub">卡 牌 王 · 抽 卡 收 藏</div>
    </div>
    <div class="fan">${fanHTML}</div>
    <nav class="menu">
      <a class="menu-btn" href="#cards">${crayonBgHTML(11, '#fffaf0')}
        <span class="mi" style="--c:#3d7fe0">🃏</span><span class="mt">我的卡片</span>
        <span class="ms">已收集 ${owned.length} / ${lib.cards.length}</span></a>
      <a class="menu-btn" href="#packs">${crayonBgHTML(22, '#fffaf0')}
        <span class="mi" style="--c:#e5533d">🎁</span><span class="mt">卡包區</span>
        <span class="ms">${packCount() ? `<b class="pill">${packCount()}</b> 包等你開` : '開卡包 · 看圖鑑'}</span></a>
      <a class="menu-btn" href="#shop">${crayonBgHTML(33, '#fffaf0')}
        <span class="mi" style="--c:#5bb04f">🛒</span><span class="mt">商店區</span>
        <span class="ms">一包 ${RULES.packPrice} 金幣</span></a>
    </nav>
    <div class="earn">
      <div class="earn-bar"><i></i></div>
      <span>留在遊戲中，再 <b class="earn-secs">60</b> 秒 +${RULES.coinsPerMinute} 金幣</span>
    </div>
    <p class="foot">牌庫 ${lib.cards.length} 張 · ${lib.sets.length} 個系列${lib.fromCache ? ' · 離線資料' : ''}</p>
  </section>`;
}

function viewCards() {
  const owned = ownedCards();
  const list = cardsFilter === 'all' ? owned : owned.filter((c) => c._set === cardsFilter);
  return `<section class="page">
    <h2 class="page-title">我的卡片 <small>${owned.length} / ${lib.cards.length}</small></h2>
    <div class="chips">
      <button class="chip ${cardsFilter === 'all' ? 'on' : ''}" data-filter="all">全部</button>
      ${lib.sets.map((s) => `<button class="chip ${cardsFilter === s.name ? 'on' : ''}" data-filter="${esc(s.name)}" style="--c:${s.color}">${esc(s.name)} <small>${unlockedIn(s)}/${s.cards.length}</small></button>`).join('')}
    </div>
    ${list.length ? `<div class="grid">${list.map((c) => {
      const vs = save.col[c.id].v;
      return `<button class="cell" data-card="${c.id}">${cardHTML(c, bestVariant(vs))}
        <span class="vdots">${VARIANT_ORDER.map((v) => `<i class="vd vd-${v} ${vs.includes(v) ? 'on' : ''}" title="${VARIANTS[v].label}"></i>`).join('')}</span></button>`;
    }).join('')}</div>` : `<div class="empty">${cardBackHTML(9)}<p>這裡還沒有卡片，<br>去卡包區開包吧！</p><a class="btn primary" href="#packs">前往卡包區</a></div>`}
  </section>`;
}

function packTabs(active) {
  return `<div class="tabs">
    <a href="#packs" class="${active === 'packs' ? 'on' : ''}">我的卡包${packCount() ? ` <b class="pill">${packCount()}</b>` : ''}</a>
    <a href="#dex" class="${active === 'dex' ? 'on' : ''}">圖鑑</a>
  </div>`;
}

function viewPacks() {
  const groups = new Map();
  for (const p of save.packs) groups.set(p.set, (groups.get(p.set) || 0) + 1);
  return `<section class="page">
    ${packTabs('packs')}
    ${groups.size ? `<p class="tip">點一下卡包就會開包 ✨</p>
    <div class="pack-grid">${[...groups].map(([set, n]) => `<button class="pack-cell ${n > 1 ? 'stacked' : ''}" data-open="${esc(set)}" style="--c:${setColor(set)}">
        ${n > 2 ? '<span class="pack-shadow s2"></span>' : ''}${n > 1 ? '<span class="pack-shadow s1"></span>' : ''}
        ${packHTML(set)}${n > 1 ? `<span class="pack-n">×${n}</span>` : ''}</button>`).join('')}</div>`
    : `<div class="empty">${packHTML(lib.sets[0]?.name || '卡包', { cls: 'ghost' })}<p>卡包都開完了！<br>去商店買新的，或收集圖鑑拿獎勵。</p><a class="btn primary" href="#shop">前往商店</a></div>`}
  </section>`;
}

function viewDex() {
  return `<section class="page">
    ${packTabs('dex')}
    <p class="tip">每個系列每解鎖 ${RULES.dexRewardEvery} 張，就送一包該系列的卡包 🎁</p>
    ${lib.sets.map((s) => {
      const got = unlockedIn(s);
      const left = RULES.dexRewardEvery - (got % RULES.dexRewardEvery);
      const allDone = got === s.cards.length;
      return `<div class="dex-set" style="--c:${s.color}">
        <div class="dex-head">${crayonBgHTML(hashSeed(s.name), s.color)}
          <span class="dex-name">${esc(s.name)}</span>
          <span class="dex-count">${got} / ${s.cards.length}</span>
        </div>
        <div class="dex-bar"><i style="width:${(got / s.cards.length) * 100}%"></i></div>
        <p class="dex-next">${allDone ? '🏆 這個系列全部收集完成！' : `再解鎖 <b>${Math.min(left, s.cards.length - got)}</b> 張${left <= s.cards.length - got ? '，送一包卡包' : '就收集完成'}`}</p>
        <div class="grid">${s.cards.map((c) => save.col[c.id]
          ? `<button class="cell" data-card="${c.id}">${cardHTML(c, bestVariant(save.col[c.id].v))}</button>`
          : `<div class="cell locked"><div class="lock-card"><span>?</span><small>${'★'.repeat(Math.min(5, rarityNum(c.rarity)))}</small><em>#${c.id}</em></div></div>`).join('')}</div>
      </div>`;
    }).join('')}
  </section>`;
}

const hashSeed = (s) => [...s].reduce((a, ch) => a * 31 + ch.codePointAt(0), 7) >>> 0;

function viewShop() {
  return `<section class="page">
    <h2 class="page-title">商店區</h2>
    <p class="tip">每包 ${RULES.packPrice} 金幣 · 內含 ${RULES.cardsPerPack} 張卡 · 重複卡自動換 ${RULES.dupCoins} 金幣</p>
    <div class="shop-list">${lib.sets.map((s) => {
      const rs = [...new Set(s.cards.map((c) => rarityNum(c.rarity)))].sort((a, b) => a - b);
      return `<div class="shop-item" style="--c:${s.color}">
        ${crayonBgHTML(hashSeed(s.name) + 5, '#fffaf0')}
        <div class="shop-pack">${packHTML(s.name)}</div>
        <div class="shop-info">
          <h3>${esc(s.name)}</h3>
          <p>共 ${s.cards.length} 種卡 · 已收集 ${unlockedIn(s)}</p>
          <p class="shop-rar">${rs.map((r) => `<span class="rt rt-${r >= RULES.rainbowTier ? 'rainbow' : r >= RULES.goldTier ? 'gold' : 'base'}">${r ? '★' + r : '—'}</span>`).join('')}</p>
          <button class="btn buy ${save.coins < RULES.packPrice ? 'poor' : ''}" data-buy="${esc(s.name)}"><i class="coin-ico sm"></i>${RULES.packPrice} 購買</button>
        </div>
      </div>`;
    }).join('')}</div>
  </section>`;
}

const VIEWS = { home: viewHome, cards: viewCards, packs: viewPacks, dex: viewDex, shop: viewShop };

function render() {
  if (!started) return;
  const scroll = screen.dataset.route === route ? scrollY : 0;
  document.body.dataset.route = route;
  $('.title').textContent = TITLES[route];
  screen.dataset.route = route;
  if (!lib.cards.length) {
    screen.innerHTML = `<div class="empty center">${cardBackHTML(3)}<p>卡牌資料庫裡還沒有任何卡牌。<br>先到卡牌製造機新增卡牌吧！</p><a class="btn" href="${esc(apiBase())}" target="_blank" rel="noopener">打開卡牌製造機</a></div>`;
    return;
  }
  screen.innerHTML = VIEWS[route]();
  scrollTo(0, scroll);
  renderEarnProgress();
}

function go() {
  $('#modal-root').replaceChildren();
  const r = location.hash.replace('#', '') || 'home';
  const next = ROUTES.includes(r) ? r : 'home';
  const changed = next !== route;
  route = next;
  render();
  if (changed) {
    scrollTo(0, 0);
    screen.firstElementChild?.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
}

// ───────── 卡牌詳情（可以傾斜看反光） ─────────
function showCard(id) {
  const card = lib.byId.get(id);
  if (!card) return;
  const vs = save.col[id]?.v ?? [];
  let cur = bestVariant(vs);
  const m = modal(`<div class="detail">
    <div class="detail-card"></div>
    ${vs.length ? `<div class="var-tabs">${VARIANT_ORDER.map((v) => `<button class="var-tab ${vs.includes(v) ? '' : 'missing'}" data-v="${v}" ${vs.includes(v) ? '' : 'disabled'}>${VARIANTS[v].label}</button>`).join('')}</div>
    <p class="detail-note">已收集型態 ${vs.length} / 4　·　按住卡片拖曳可以看反光</p>` : ''}
    <button class="btn" data-close>關閉</button>
  </div>`, { cls: 'card-modal' });
  const holder = $('.detail-card', m);
  const draw = () => {
    holder.innerHTML = cardHTML(card, cur, { eager: true });
    $$('.var-tab', m).forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
  };
  draw();
  m.addEventListener('click', (e) => {
    const b = e.target.closest('.var-tab');
    if (b && !b.disabled) { cur = b.dataset.v; sfx.flip(); draw(); }
  });
  const tilt = (e) => {
    const r = holder.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    const c = $('.card', holder);
    c.classList.add('tilting');
    c.style.transform = `rotateY(${(x - 0.5) * 26}deg) rotateX(${(0.5 - y) * 26}deg)`;
    c.style.setProperty('--mx', `${x * 100}%`);
    c.style.setProperty('--my', `${y * 100}%`);
  };
  holder.addEventListener('pointermove', tilt);
  holder.addEventListener('pointerdown', (e) => { holder.setPointerCapture?.(e.pointerId); tilt(e); });
  const reset = () => {
    const c = $('.card', holder);
    if (!c) return;
    c.classList.remove('tilting');
    c.style.transform = '';
  };
  holder.addEventListener('pointerup', reset);
  holder.addEventListener('pointerleave', reset);
  holder.addEventListener('pointercancel', reset);
}

// ───────── 開包 ─────────
async function openFromSet(setName, packEl) {
  if (opening) return;
  const pack = save.packs.find((p) => p.set === setName);
  if (!pack) return;
  const outcome = openPack(pack.id);
  if (!outcome) { toast('這個系列目前沒有卡牌'); return; }
  opening = true;
  const more = save.packs.filter((p) => p.set === setName).length;
  const act = await playOpening(packEl, outcome, { morePacks: more, onCoins: () => renderCoins(true) });
  opening = false;
  render();
  renderCoins(true);
  if (act === 'again') {
    const next = $(`.pack-cell[data-open="${CSS.escape(setName)}"] .pack`);
    if (next) openFromSet(setName, next);
  }
}

// ───────── 事件 ─────────
document.addEventListener('click', (e) => {
  unlockAudio();
  const t = e.target;
  const a = t.closest('[data-action]')?.dataset.action;
  if (a === 'back') { sfx.tap(); location.hash = route === 'dex' ? '#packs' : '#home'; return; }
  if (a === 'sound') {
    save.sound = !save.sound;
    setSound(save.sound);
    persist();
    $('.sound').textContent = save.sound ? '🔊' : '🔇';
    if (save.sound) sfx.tap();
    return;
  }
  if (t.closest('a[href^="#"]')) sfx.tap();
  const f = t.closest('[data-filter]');
  if (f) { cardsFilter = f.dataset.filter; sfx.tap(); render(); return; }
  const c = t.closest('[data-card]');
  if (c) { sfx.flip(); showCard(Number(c.dataset.card)); return; }
  const o = t.closest('[data-open]');
  if (o) { openFromSet(o.dataset.open, $('.pack', o)); return; }
  const b = t.closest('[data-buy]');
  if (b) {
    if (!buyPack(b.dataset.buy)) {
      b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 300 });
      toast(`金幣不足！還差 ${RULES.packPrice - save.coins} 金幣`);
      return;
    }
    sfx.coin();
    renderCoins(true);
    const p = $('.pack', b.closest('.shop-item'));
    p?.animate([{ transform: 'none' }, { transform: 'translateY(-14px) rotate(-6deg) scale(1.08)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    toast(`🎁 買到一包「${esc(b.dataset.buy)}」，已放進卡包區`);
    render();
  }
});

// ───────── 啟動 ─────────
function loadingView(msg, err = false) {
  screen.innerHTML = `<div class="loading">
    <div class="logo"><div class="logo-main">Card<b>King</b></div><div class="logo-sub">卡 牌 王</div></div>
    <div class="load-card">${cardBackHTML(5)}</div>
    <p class="load-msg">${msg}</p>
    ${err ? `<button class="btn primary" onclick="location.reload()">重試</button>` : ''}
    <p class="foot">${esc(apiBase())}</p>
  </div>`;
}

function welcome() {
  const m = modal(`<div class="gift">
    <div class="gift-packs">${lib.sets.slice(0, 3).map((s, i) => `<div class="gp g${i}">${packHTML(s.name)}</div>`).join('')}</div>
    <h2>歡迎來到卡牌王！</h2>
    <p>送你 <b>${RULES.starterPacks} 包</b>新手卡包和 <b>${save.coins}</b> 金幣，<br>快去卡包區開包吧！</p>
    <button class="btn primary" data-close data-go="packs">去開卡包 🎁</button>
  </div>`, { cls: 'gift-modal' });
  $('[data-go]', m).addEventListener('click', () => { location.hash = '#packs'; });
}

function startGame() {
  started = true;
  startTicker();
  addEventListener('hashchange', go);
  route = '';
  go();
  if (giveStarterPacks()) {
    render();
    setTimeout(welcome, 350);
  }
  // 資料庫的卡牌更新後，補發可能新增的圖鑑獎勵
  if (claimDexRewards().length) persist();
}

async function boot() {
  loadSave();
  setSound(save.sound);
  $('.sound').textContent = save.sound ? '🔊' : '🔇';
  renderCoins(false);
  if (loadCachedLibrary()) {
    startGame();
    fetchLibrary().then(() => {
      render();
      if (giveStarterPacks()) { render(); welcome(); }
    }).catch(() => toast('連不到卡牌伺服器，先用上次的卡牌資料'));
    return;
  }
  loadingView('連接卡牌資料庫…');
  try {
    await fetchLibrary({ onSlow: () => loadingView('正在喚醒卡牌伺服器…<br><small>免費伺服器第一次啟動約需 30–60 秒</small>') });
    startGame();
  } catch (e) {
    loadingView(`連不到卡牌資料庫 😢<br><small>${esc(e.name === 'AbortError' ? '等太久了' : e.message)}</small>`, true);
  }
}

boot();
