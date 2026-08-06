import { WEAPONS, getWeaponById } from '../config/weaponConfig';
import type { WeaponDefinition } from '../types';

export class WeaponRegistry {
  private list: WeaponDefinition[];

  constructor(defs: WeaponDefinition[] = WEAPONS) {
    this.list = defs;
  }

  all(): WeaponDefinition[] {
    return this.list;
  }

  get(id: string): WeaponDefinition {
    return getWeaponById(id);
  }

  // 初始化玩家弹药，-1 表示无限
  createInitialAmmo(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const w of this.list) {
      map[w.id] = w.ammo;
    }
    return map;
  }

  // 获取下一把可用武器（弹药不为 0）
  next(currentId: string): string {
    const idx = this.list.findIndex((w) => w.id === currentId);
    if (idx < 0) return this.list[0].id;
    for (let i = 1; i <= this.list.length; i++) {
      const w = this.list[(idx + i) % this.list.length];
      return w.id;
    }
    return this.list[0].id;
  }

  prev(currentId: string): string {
    const idx = this.list.findIndex((w) => w.id === currentId);
    if (idx < 0) return this.list[0].id;
    for (let i = this.list.length - 1; i >= 1; i--) {
      const w = this.list[(idx + i) % this.list.length];
      return w.id;
    }
    return this.list[0].id;
  }
}

export const weaponRegistry = new WeaponRegistry();
