import type { Projectile as ProjectileData } from '../types';
import { PROJECTILE_LIFETIME } from '../config/gameConfig';
import type { WeaponDefinition } from '../types';

let nextId = 1;

export function createProjectile(
  ownerId: string,
  weapon: WeaponDefinition,
  x: number,
  y: number,
  vx: number,
  vy: number,
  isPrimary = false
): ProjectileData {
  return {
    id: nextId++,
    ownerId,
    weaponId: weapon.id,
    x,
    y,
    prevX: x,
    prevY: y,
    vx,
    vy,
    radius: weapon.behavior === 'heavy' ? 6 : 4.2,
    alive: true,
    age: 0,
    maxAge: PROJECTILE_LIFETIME,
    bounceCount: 0,
    splitTime: weapon.splitTime ?? 0,
    splitDone: false,
    damage: weapon.maxDamage,
    explosionRadius: weapon.explosionRadius,
    terrainDamageMultiplier: weapon.terrainDamageMultiplier,
    gravityMultiplier: weapon.gravityMultiplier,
    windMultiplier: weapon.windMultiplier,
    speedMultiplier: weapon.projectileSpeedMultiplier,
    isDirectHit: false,
    drillDistance: 0,
    drillRemaining: 0,
    state: 'flying',
    rollRemaining: 0,
    isPayload: false,
    maxBounce: weapon.bounceCount ?? 0,
    isPrimary,
    trail: [],
  };
}

export function spawnTrail(p: ProjectileData): void {
  if (p.trail.length > 16) {
    p.trail.shift();
  }
  p.trail.push({ x: p.x, y: p.y, life: 0.5 });
}

export function updateTrail(p: ProjectileData, dt: number): void {
  for (const t of p.trail) {
    t.life -= dt;
  }
  while (p.trail.length > 0 && p.trail[0].life <= 0) {
    p.trail.shift();
  }
}
