import type { Particle, DamageNumber } from '../types';
import { ObjectPool } from '../utils/objectPool';
import { makeParticle, resetParticle, updateParticle } from '../entities/Particle';

export class ParticleSystem {
  private pool: ObjectPool<Particle>;
  private damageNumbers: DamageNumber[] = [];
  particleLimit = 220;

  constructor() {
    this.pool = new ObjectPool<Particle>(
      () => makeParticle({ x: 0, y: 0, color: '#ffffff', kind: 'spark' }),
      resetParticle,
      32
    );
  }

  reset(): void {
    this.pool.releaseAll();
    this.damageNumbers.length = 0;
  }

  setQuality(level: 'low' | 'mid' | 'high'): void {
    this.particleLimit = level === 'low' ? 80 : level === 'mid' ? 160 : 260;
  }

  spawnExplosion(x: number, y: number, radius: number, color: string): void {
    // 火花
    const sparkCount = Math.min(20, Math.floor(this.particleLimit * 0.1));
    for (let i = 0; i < sparkCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 200;
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.4 + Math.random() * 0.3,
        size: 2 + Math.random() * 2,
        color,
        kind: 'spark',
        gravity: 280,
      });
    }
    // 烟雾
    const smokeCount = Math.min(14, Math.floor(this.particleLimit * 0.06));
    for (let i = 0; i < smokeCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 60;
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 30,
        life: 0.7 + Math.random() * 0.8,
        size: 8 + Math.random() * 10,
        color: 'rgba(60, 60, 60, 0.6)',
        kind: 'smoke',
        gravity: -20,
      });
    }
    // 爆炸环
    this.spawn({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.25,
      size: radius * 0.6,
      color,
      kind: 'ring',
      gravity: 0,
    });
    // 闪光
    this.spawn({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.12,
      size: radius * 0.9,
      color: '#fff3b0',
      kind: 'flash',
      gravity: 0,
    });
  }

  spawnMuzzleFlash(x: number, y: number, angleDeg: number): void {
    const r = angleDeg * Math.PI / 180;
    const dx = Math.cos(r);
    const dy = -Math.sin(r);
    for (let i = 0; i < 6; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const sp = 60 + Math.random() * 120;
      this.spawn({
        x,
        y,
        vx: (Math.cos(r + spread)) * sp,
        vy: (-Math.sin(r + spread)) * sp,
        life: 0.16 + Math.random() * 0.1,
        size: 2 + Math.random() * 2,
        color: '#ffd166',
        kind: 'spark',
        gravity: 0,
      });
    }
    this.spawn({
      x: x + dx * 4,
      y: y + dy * 4,
      vx: 0,
      vy: 0,
      life: 0.12,
      size: 14,
      color: '#fff3b0',
      kind: 'flash',
      gravity: 0,
    });
    void dx; void dy;
  }

  spawnDebris(x: number, y: number, color: string, count: number): void {
    const limit = Math.min(count, Math.floor(this.particleLimit * 0.08));
    for (let i = 0; i < limit; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 180;
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 50,
        life: 0.6 + Math.random() * 0.6,
        size: 2 + Math.random() * 2,
        color,
        kind: 'debris',
        gravity: 360,
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 8,
      });
    }
  }

  spawnTrailSpark(x: number, y: number, color: string): void {
    this.spawn({
      x,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 0.2,
      size: 1.5,
      color,
      kind: 'spark',
      gravity: 0,
    });
  }

  private spawn(opts: Partial<Particle> & { x: number; y: number; color: string; kind: Particle['kind'] }): void {
    if (this.pool.getActiveCount() >= this.particleLimit) return;
    const p = this.pool.acquire();
    Object.assign(p, makeParticle(opts));
  }

  spawnDamageNumber(x: number, y: number, value: number): void {
    if (this.damageNumbers.length > 24) this.damageNumbers.shift();
    this.damageNumbers.push({ x, y, value, life: 1.1, maxLife: 1.1, isHeal: false });
  }

  getDamageNumbers(): DamageNumber[] {
    return this.damageNumbers;
  }

  getParticles(): Particle[] {
    return this.pool.getActive();
  }

  update(dt: number): void {
    const active = this.pool.getActive();
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      updateParticle(p, dt);
      if (p.life <= 0) {
        this.pool.release(p);
      }
    }
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.life -= dt;
      d.y -= 28 * dt;
      if (d.life <= 0) this.damageNumbers.splice(i, 1);
    }
  }
}
