// 開卡包動畫：卡包飛到螢幕前 → 蓄力抖動 → 自己撕開（依稀有度發出黃光／彩虹光）→ 一張一張翻牌
import { cardHTML, cardBackHTML, packHTML, TEAR_Y } from './crayon.js';
import { RULES, tierOf } from './data.js';
import { Particles, TIER_COLORS } from './particles.js';
import { sfx } from './sfx.js';
import { $, $$, sleep, done, htmlToEl, vibrate, esc } from './util.js';

const rnd = (a) => (Math.random() - 0.5) * 2 * a;

function zigzag(n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const y = TEAR_Y + (i % 2 ? 0.018 : -0.014);
    pts.push(`${((i / n) * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`);
  }
  return pts;
}

function badgeFor(res) {
  if (res.isNew) return '<span class="badge b-new">NEW!</span>';
  if (res.newVariant) return '<span class="badge b-var">新型態！</span>';
  return `<span class="badge b-dup">重複 +${RULES.dupCoins}<i class="coin-ico sm"></i></span>`;
}

function preload(urls, ms) {
  const all = Promise.all(urls.filter(Boolean).map((u) => new Promise((r) => {
    const img = new Image();
    img.onload = img.onerror = r;
    img.src = u;
  })));
  return Promise.race([all, sleep(ms)]);
}

/**
 * @param {HTMLElement} sourceEl 被點擊的卡包元素（動畫從這裡飛出來）
 * @param {object} outcome data.openPack() 的結果
 * @param {object} opts { morePacks: 同系列還剩幾包, onCoins: 金幣變動時呼叫 }
 * @returns {Promise<'again'|'close'>}
 */
export function playOpening(sourceEl, outcome, { morePacks = 0, onCoins } = {}) {
  return new Promise((resolve) => run(sourceEl, outcome, morePacks, onCoins, resolve));
}

async function run(sourceEl, outcome, morePacks, onCoins, resolve) {
  const { results, tier, pack } = outcome;
  const root = $('#stage-root');
  const vw = innerWidth, vh = innerHeight;
  const W = Math.min(vw * 0.6, 260, (vh * 0.5) / 1.5);
  const H = W * 1.5;
  const CW = Math.min(vw * 0.68, 300, (vh * 0.56) / 1.4);
  const CH = CW * 1.4;
  const zig = zigzag();
  const packInner = packHTML(pack.set);

  const stage = htmlToEl(`<div class="stage tier-${tier}">
    <div class="stage-bg"></div>
    <div class="rays"></div>
    <div class="aura"></div>
    <div class="shaker">
      <div class="deck" style="width:${CW}px;height:${CH}px;left:${(vw - CW) / 2}px;top:${(vh - CH) / 2 - vh * 0.04}px"></div>
      <div class="pack-fly" style="width:${W}px;height:${H}px;left:${(vw - W) / 2}px;top:${(vh - H) / 2}px">
        <div class="pack-shake">
          <div class="half bottom"><div class="clip" style="clip-path:polygon(${zig.join(',')},100% 100%,0% 100%)">${packInner}</div></div>
          <div class="half top"><div class="clip" style="clip-path:polygon(0% 0%,100% 0%,${[...zig].reverse().join(',')})">${packInner}</div></div>
          <div class="spark" style="top:${TEAR_Y * 100}%"></div>
        </div>
      </div>
    </div>
    <div class="flash"></div>
    <canvas class="pcv"></canvas>
    <div class="stage-ui">
      <div class="hint"></div>
      <button class="btn ghost skip" hidden>全部翻開 ⏩</button>
    </div>
    <div class="tray">${results.map(() => '<div class="tray-slot"></div>').join('')}</div>
  </div>`);
  root.append(stage);
  document.body.classList.add('stage-open');
  const P = new Particles($('.pcv', stage));
  const fly = $('.pack-fly', stage);
  const shake = $('.pack-shake', stage);
  const top = $('.half.top', stage);
  const bottom = $('.half.bottom', stage);
  const deck = $('.deck', stage);
  const hint = $('.hint', stage);
  const skip = $('.skip', stage);
  const imgs = preload(results.map((r) => r.card.imageUrl), 2500);

  // ── 1. 卡包放大浮到螢幕前 ──
  const src = sourceEl?.getBoundingClientRect();
  if (sourceEl) sourceEl.style.visibility = 'hidden';
  const dstCx = vw / 2, dstCy = vh / 2;
  const from = src && src.width
    ? `translate(${src.left + src.width / 2 - dstCx}px,${src.top + src.height / 2 - dstCy}px) scale(${src.width / W})`
    : 'translate(0,40vh) scale(.4)';
  $('.stage-bg', stage).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
  sfx.whoosh();
  await done(fly.animate([
    { transform: from },
    { transform: 'translate(0,-28px) scale(1.12) rotate(-4deg)', offset: 0.7 },
    { transform: 'translate(0,0) scale(1) rotate(0deg)' },
  ], { duration: 720, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }));

  // ── 2. 蓄力：越抖越大，背後的光越來越亮 ──
  const CHARGE = 1150;
  sfx.charge(CHARGE);
  vibrate([20, 120, 20, 100, 30, 80, 40]);
  const kf = [];
  for (let i = 0; i <= 22; i++) {
    const k = i / 22, a = 0.5 + k * k * 9;
    kf.push({ transform: `translate(${rnd(a)}px,${rnd(a) - k * 10}px) rotate(${rnd(a * 0.45)}deg) scale(${1 + k * 0.07})` });
  }
  const aura = $('.aura', stage);
  aura.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.85, transform: 'scale(1.1)' }], { duration: CHARGE, easing: 'ease-in', fill: 'forwards' });
  await done(shake.animate(kf, { duration: CHARGE, easing: 'ease-in', fill: 'forwards' }));
  await imgs;

  // ── 3. 撕開！ ──
  const spark = $('.spark', stage);
  sfx.tear();
  vibrate([60, 30, 120]);
  const tearRect = fly.getBoundingClientRect();
  const tearY = tearRect.top + tearRect.height * TEAR_Y;
  const colors = TIER_COLORS[tier];
  spark.animate([
    { left: '-6%', opacity: 1, transform: 'scale(1)' },
    { left: '106%', opacity: 1, transform: 'scale(1.3)', offset: 0.75 },
    { left: '112%', opacity: 0, transform: 'scale(.4)' },
  ], { duration: 450, easing: 'ease-in-out', fill: 'forwards' });
  for (let i = 0; i <= 4; i++) {
    setTimeout(() => P.burst(tearRect.left + (tearRect.width * i) / 4, tearY, {
      colors: ['#fff', '#fff8d0', ...colors], count: 8, power: 4, gravity: 0.15, shapes: ['dot', 'rect'], life: 0.6,
    }), i * 70);
  }
  await sleep(330);

  stage.classList.add('torn');
  sfx.burst(tier);
  const flashOpacity = tier === 'base' ? 0.55 : 1;
  $('.flash', stage).animate([{ opacity: 0 }, { opacity: flashOpacity, offset: 0.15 }, { opacity: 0 }], { duration: tier === 'base' ? 450 : 900, easing: 'ease-out' });
  if (tier !== 'base') $('.rays', stage).animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, easing: 'cubic-bezier(.2,1,.3,1)', fill: 'forwards' });
  aura.classList.add('lit');
  $('.shaker', stage).animate([
    { transform: 'translate(0,0)' }, { transform: 'translate(-9px,6px)' }, { transform: 'translate(8px,-7px)' },
    { transform: 'translate(-6px,-3px)' }, { transform: 'translate(4px,5px)' }, { transform: 'translate(0,0)' },
  ], { duration: 380 });
  const big = { base: [50, 11], gold: [110, 15], rainbow: [180, 18] }[tier];
  P.burst(vw / 2, tearY, { colors, count: big[0], power: big[1], spread: Math.PI * 1.3, gravity: 0.25 });
  if (tier === 'rainbow') {
    setTimeout(() => P.burst(vw * 0.15, vh * 0.3, { colors, count: 60, power: 12, angle: -Math.PI / 4, spread: 1.2 }), 200);
    setTimeout(() => P.burst(vw * 0.85, vh * 0.3, { colors, count: 60, power: 12, angle: (-3 * Math.PI) / 4, spread: 1.2 }), 320);
  }
  top.animate([
    { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
    { transform: 'translate(18px,-26px) rotate(9deg)', opacity: 1, offset: 0.2 },
    { transform: `translate(${vw * 0.55}px,${-vh * 0.55}px) rotate(80deg)`, opacity: 0 },
  ], { duration: 950, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
  shake.getAnimations().forEach((a) => a.cancel());
  await sleep(160);

  // ── 4. 卡片從卡包裡冒出來 ──
  results.forEach((res, i) => {
    const slot = htmlToEl(`<div class="slot" style="z-index:${20 - i}">
      <div class="face back">${cardBackHTML(i + 1)}</div>
      <div class="face front">${cardHTML(res.card, res.variant, { eager: true })}<div class="halo"></div>${badgeFor(res)}</div>
    </div>`);
    slot.style.transform = `translate(${i * 3}px,${i * -3}px) rotate(${(i - 2) * 1.2}deg)`;
    deck.append(slot);
  });
  const rise = H * 0.42;
  await done(deck.animate([
    { transform: `translateY(${H * 0.3}px) scale(.78)` },
    { transform: `translateY(${-rise}px) scale(.86)` },
  ], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' }));
  deck.style.zIndex = 5;
  sfx.whoosh();
  bottom.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${vh * 0.6}px) rotate(-8deg)`, opacity: 0 }], { duration: 650, easing: 'ease-in', fill: 'forwards' });
  await done(deck.animate([
    { transform: `translateY(${-rise}px) scale(.86)` },
    { transform: 'translateY(0) scale(1)' },
  ], { duration: 520, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'forwards' }));
  fly.remove();

  // ── 5. 一張一張翻 ──
  const slots = $$('.slot', deck);
  const traySlots = $$('.tray-slot', stage);
  let cur = 0, faceUp = false, busy = false, finished = false;
  hint.textContent = '點一下翻牌';
  skip.hidden = false;

  async function flip(i, fast = false) {
    const slot = slots[i], res = results[i];
    const back = $('.face.back', slot), front = $('.face.front', slot);
    const t = tierOf(res.r);
    sfx.flip();
    await done(back.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], { duration: fast ? 60 : 150, easing: 'ease-in', fill: 'forwards' }));
    back.style.visibility = 'hidden';
    front.style.visibility = 'visible';
    slot.classList.add('up', `ft-${t}`, `fv-${res.variant}`);
    front.animate([{ transform: 'rotateY(-90deg) scale(1.12)' }, { transform: 'rotateY(0deg) scale(1)' }], { duration: fast ? 120 : 280, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    if (fast) return;
    const rc = slot.getBoundingClientRect();
    const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    sfx.reveal(t);
    if (t !== 'base') {
      vibrate(t === 'rainbow' ? [40, 40, 40, 40, 120] : [40, 40, 80]);
      P.burst(cx, cy, { colors: TIER_COLORS[t], count: t === 'rainbow' ? 120 : 70, power: t === 'rainbow' ? 14 : 11 });
    } else if (res.variant !== 'normal' || res.isNew) {
      P.burst(cx, rc.top, { colors: res.variant === 'normal' ? ['#fff', '#ffe9a8', '#cfe3ff'] : TIER_COLORS.gold, count: 26, power: 7, spread: 1.8 });
    }
    if (res.dup) { sfx.coin(); onCoins?.(); }
  }

  async function toTray(i, fast = false) {
    const slot = slots[i];
    const target = traySlots[i].getBoundingClientRect();
    const rc = slot.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (rc.left + rc.width / 2);
    const dy = target.top + target.height / 2 - (rc.top + rc.height / 2);
    const s = target.width / rc.width;
    if (!fast) sfx.whoosh();
    await done(slot.animate([
      { transform: getComputedStyle(slot).transform },
      { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(${rnd(6)}deg)` },
    ], { duration: fast ? 150 : 340, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }));
    slot.remove();
    const res = results[i];
    traySlots[i].innerHTML = cardHTML(res.card, res.variant) + badgeFor(res);
    traySlots[i].classList.add('filled', `ft-${tierOf(res.r)}`);
  }

  async function step() {
    if (busy || finished) return;
    busy = true;
    if (!faceUp) {
      await flip(cur);
      faceUp = true;
      hint.textContent = cur === results.length - 1 ? '點一下看結果' : '點一下下一張';
    } else {
      await toTray(cur);
      faceUp = false;
      cur++;
      hint.textContent = '點一下翻牌';
      if (cur >= results.length) await finish();
    }
    busy = false;
  }

  async function skipAll() {
    if (finished) return;
    busy = true;
    skip.hidden = true;
    for (let i = cur; i < results.length; i++) {
      if (!(i === cur && faceUp)) await flip(i, true);
    }
    const best = results.reduce((m, r) => Math.max(m, r.r), 0);
    sfx.reveal(tierOf(best));
    if (results.some((r) => r.dup)) { sfx.coin(); onCoins?.(); }
    for (let i = cur; i < results.length; i++) await toTray(i, true);
    cur = results.length;
    await finish();
  }

  // ── 6. 結算 ──
  async function finish() {
    finished = true;
    skip.hidden = true;
    hint.textContent = '';
    stage.classList.add('done');
    const coins = outcome.coins;
    const news = results.filter((r) => r.isNew).length;
    const panel = htmlToEl(`<div class="summary">
      <h2>開包結果</h2>
      <p class="sum-line">新卡 <b>${news}</b> 張${coins ? `　·　重複卡換得 <b>+${coins}</b><i class="coin-ico sm"></i>` : ''}</p>
      ${outcome.rewards.map((rw) => `<p class="sum-reward">📖 圖鑑獎勵：「${esc(rw.set)}」解鎖滿 ${RULES.dexRewardEvery} 張，送你 ${rw.n} 包卡包！</p>`).join('')}
      <div class="sum-actions">
        ${morePacks > 0 ? `<button class="btn" data-act="again">再開一包（剩 ${morePacks}）</button>` : ''}
        <button class="btn primary" data-act="close">完成</button>
      </div>
    </div>`);
    stage.append(panel);
    panel.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out', fill: 'both' });
    const tray = $('.tray', stage);
    tray.classList.add('big');
    panel.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      sfx.tap();
      await done(stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }));
      stage.remove();
      document.body.classList.remove('stage-open');
      if (sourceEl) sourceEl.style.visibility = '';
      resolve(act);
    });
  }

  $('.shaker', stage).addEventListener('click', step);
  $('.stage-bg', stage).addEventListener('click', step);
  hint.addEventListener('click', step);
  skip.addEventListener('click', (e) => { e.stopPropagation(); skipAll(); });
}
