import { WEAPONS } from '../config/weaponConfig';
import type { Tank } from '../types';

// 训练场库存不复用商店弹药数，所有武器都以 -1 表示无限。
export function createTrainingLoadout(): Record<string, number> {
  return Object.fromEntries(WEAPONS.map((weapon) => [weapon.id, -1]));
}

// 靶机仍参与正常碰撞、伤害数字和击退，只在结算后恢复生命状态。
// 返回值表示本次是否确实修复了靶机，便于调用方决定是否更新提示。
export function restoreTrainingTarget(target: Tank): boolean {
  const restored = !target.isAlive || target.health !== target.maxHealth;
  target.health = target.maxHealth;
  target.isAlive = true;
  return restored;
}

export function isTrainingTarget(tank: Tank): boolean {
  return tank.playerIndex === 1;
}
