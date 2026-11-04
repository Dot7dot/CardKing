// 全螢幕粒子（彩紙、星星、蠟筆屑）
export class Particles {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.ps = [];
    this.running = false;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.cv.width = innerWidth * dpr;
    this.cv.height = innerHeight * dpr;
  }

  /** 從 (x, y) 炸開 */
  burst(x, y, { colors = ['#fff'], count = 40, power = 9, spread = Math.PI * 2, angle = -Math.PI / 2, gravity = 0.22, shapes = ['rect', 'star', 'dot'], life = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = power * (0.35 + Math.random() * 0.75);
      this.ps.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: gravity * (0.6 + Math.random() * 0.8),
        s: 3 + Math.random() * 6,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4,
        c: colors[Math.floor(Math.random() * colors.length)],
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        life: 0,
        max: (50 + Math.random() * 50) * life,
      });
    }
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(() => this.tick());
    }
  }

  tick() {
    const { g, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    this.ps = this.ps.filter((p) => p.life < p.max);
    for (const p of this.ps) {
      p.life++;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const alpha = 1 - (p.life / p.max) ** 2;
      g.globalAlpha = Math.max(0, alpha);
      g.fillStyle = p.c;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      if (p.shape === 'rect') {
        g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      } else if (p.shape === 'star') {
        const s = p.s * 0.9;
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const r = k % 2 ? s * 0.35 : s;
          const a = (k / 8) * Math.PI * 2;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
      } else {
        g.beginPath();
        g.arc(0, 0, p.s / 2.5, 0, 6.28);
        g.fill();
      }
      g.restore();
    }
    g.globalAlpha = 1;
    if (this.ps.length) requestAnimationFrame(() => this.tick());
    else {
      this.running = false;
      g.clearRect(0, 0, innerWidth, innerHeight);
    }
  }
}

export const TIER_COLORS = {
  base: ['#ffffff', '#fff6d8', '#d9e8ff'],
  gold: ['#ffd84a', '#ffb703', '#fff1a8', '#ffffff', '#f4a300'],
  rainbow: ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa7ff', '#8a5cff', '#ff5cc8', '#ffffff'],
};
