/**
 * 超軽量 Canvas 紙吹雪 (Confetti) アニメーション
 */

export class ConfettiManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.particles = [];
    this.animationId = null;
    this.isActive = false;

    if (this.canvas) {
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  start(count = 120, durationMs = 3500) {
    if (!this.canvas || !this.ctx) return;
    this.resize();
    this.stop();
    this.isActive = true;

    const colors = [
      '#ffd700', '#ff6b6b', '#48dbfb', '#1dd1a1', '#feca57',
      '#ff9ff3', '#54a0ff', '#5f27cd', '#ff7f7f', '#7fff7f'
    ];

    this.particles = [];
    const width = this.canvas.width;
    const height = this.canvas.height;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: width * 0.5 + (Math.random() - 0.5) * 160,
        y: height * 0.4 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 14 - 6,
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.35 + Math.random() * 0.15,
        opacity: 1
      });
    }

    const startTime = Date.now();

    const loop = () => {
      if (!this.isActive) return;
      const elapsed = Date.now() - startTime;
      const progress = elapsed / durationMs;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      let aliveCount = 0;
      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98; // 空気抵抗
        p.rotation += p.rotationSpeed;

        if (progress > 0.6) {
          p.opacity = Math.max(0, 1 - (progress - 0.6) / 0.4);
        }

        if (p.y < this.canvas.height && p.opacity > 0) {
          aliveCount++;
          this.ctx.save();
          this.ctx.translate(p.x, p.y);
          this.ctx.rotate((p.rotation * Math.PI) / 180);
          this.ctx.fillStyle = p.color;
          this.ctx.globalAlpha = p.opacity;
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          this.ctx.restore();
        }
      }

      if (elapsed < durationMs && aliveCount > 0) {
        this.animationId = requestAnimationFrame(loop);
      } else {
        this.stop();
      }
    };

    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    this.isActive = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.particles = [];
  }
}
