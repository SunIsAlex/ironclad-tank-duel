import type { Particle, DamageNumber } from '../types';

export function resetParticle(p: Particle): void {
  p.x = 0;
  p.y = 0;
  p.vx = 0;
  p.vy = 0;
  p.life = 0;
  p.maxLife = 1;
  p.size = 0;
  p.color = '#ffffff';
  p.kind = 'spark';
  p.gravity = 0;
  p.rotation = 0;
  p.vr = 0;
}

export function updateParticle(p: Particle, dt: number): void {
  p.vy += p.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  p.rotation += p.vr * dt;
}

export function updateDamageNumber(d: DamageNumber, dt: number): void {
  d.life -= dt;
  d.y -= 28 * dt;
}

// 粒子工厂方法 - 通常使用对象池
export function makeParticle(overrides: Partial<Particle> & { x: number; y: number; color: string; kind: Particle['kind'] }): Particle {
  return {
    x: overrides.x,
    y: overrides.y,
    vx: overrides.vx ?? 0,
    vy: overrides.vy ?? 0,
    life: overrides.life ?? 0.6,
    maxLife: overrides.maxLife ?? overrides.life ?? 0.6,
    size: overrides.size ?? 2,
    color: overrides.color,
    kind: overrides.kind,
    gravity: overrides.gravity ?? 0,
    rotation: overrides.rotation ?? 0,
    vr: overrides.vr ?? 0,
  };
}
