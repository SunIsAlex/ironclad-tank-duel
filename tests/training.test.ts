import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/config/weaponConfig';
import { consumeAmmo, createTank } from '../src/entities/Tank';
import { DamageSystem } from '../src/systems/DamageSystem';
import {
  createTrainingLoadout,
  isTrainingTarget,
  restoreTrainingTarget,
} from '../src/systems/TrainingSystem';
import { TurnManager } from '../src/systems/TurnManager';

describe('训练场规则', () => {
  it('全部武器都拥有无限弹药且发射不会扣减', () => {
    const loadout = createTrainingLoadout();
    expect(Object.keys(loadout)).toHaveLength(WEAPONS.length);
    expect(Object.values(loadout).every((ammo) => ammo === -1)).toBe(true);

    const tank = createTank('trainer', 0, '训练者', 100, 100, 100, 220, 'basic_shell');
    tank.ammo = loadout;
    for (const weapon of WEAPONS) {
      expect(consumeAmmo(tank, weapon.id)).toBe(true);
      expect(tank.ammo[weapon.id]).toBe(-1);
    }
  });

  it('靶机受到致命伤后会恢复满血与存活状态', () => {
    const target = createTank('target', 1, '训练靶机', 500, 400, 100, 220, 'basic_shell');
    target.health = 0;
    target.isAlive = false;

    expect(isTrainingTarget(target)).toBe(true);
    expect(restoreTrainingTarget(target)).toBe(true);
    expect(target.health).toBe(target.maxHealth);
    expect(target.isAlive).toBe(true);
    expect(restoreTrainingTarget(target)).toBe(false);
  });

  it('固定玩家模式会让训练者连续获得回合', () => {
    const trainer = createTank('trainer', 0, '训练者', 100, 100, 100, 220, 'basic_shell');
    const target = createTank('target', 1, '训练靶机', 500, 100, 100, 220, 'basic_shell');
    const turns = new TurnManager([trainer, target], new DamageSystem());
    turns.fixedPlayer = 0;
    turns.startGame(0);

    turns.switchPlayer();
    expect(turns.currentPlayer).toBe(0);
    expect(turns.roundCount).toBe(2);
    turns.switchPlayer();
    expect(turns.currentPlayer).toBe(0);
    expect(turns.roundCount).toBe(3);
  });
});
