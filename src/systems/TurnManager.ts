import type { GamePhase, Tank, WindState } from '../types';
import type { DamageSystem } from './DamageSystem';
import { TANK_CONFIG } from '../config/gameConfig';
import { clamp } from '../utils/math';

export class TurnManager {
  phase: GamePhase = 'GAME_START';
  turnTimer = 0;
  phaseTimer = 0;
  roundCount = 0;
  currentPlayer = 0;
  tanks: Tank[];
  wind: WindState = { value: 0, displayStrength: 0 };
  windStrength = 2;
  turnTimeLimit = 0;
  private turnStartTime = 0;
  private damageSystem: DamageSystem;

  constructor(tanks: Tank[], damageSystem: DamageSystem) {
    this.tanks = tanks;
    this.damageSystem = damageSystem;
  }

  reset(tanks: Tank[]): void {
    this.tanks = tanks;
    this.phase = 'GAME_START';
    this.roundCount = 0;
    this.currentPlayer = 0;
    this.turnTimer = 0;
    this.phaseTimer = 0;
    this.wind = this.damageSystem.generateWind(this.windStrength);
  }

  startGame(startingPlayer = 0): void {
    this.currentPlayer = clamp(Math.floor(startingPlayer), 0, Math.max(0, this.tanks.length - 1));
    this.roundCount = 1;
    this.enterTurnStart();
  }

  // 给当前坦克重置燃料
  private resetCurrentTankFuel(maxFuel: number): void {
    const tank = this.tanks[this.currentPlayer];
    if (tank) {
      tank.movementFuel = maxFuel;
      tank.maxFuel = maxFuel;
    }
  }

  enterTurnStart(): void {
    this.phase = 'TURN_START';
    this.phaseTimer = 0.6;
    this.resetCurrentTankFuel(this.turnFuel);
    this.wind = this.damageSystem.generateWind(this.windStrength);
  }

  enterPlayerControl(): void {
    this.phase = 'PLAYER_CONTROL';
    if (this.turnTimeLimit > 0) {
      this.turnTimer = this.turnTimeLimit;
      this.turnStartTime = performance.now();
    } else {
      this.turnTimer = 0;
    }
  }

  enterProjectileFlying(): void {
    this.phase = 'PROJECTILE_FLYING';
    this.phaseTimer = 0;
  }

  enterExplosion(): void {
    this.phase = 'EXPLOSION';
    this.phaseTimer = 0.6;
  }

  enterDamageResolution(): void {
    this.phase = 'DAMAGE_RESOLUTION';
    this.phaseTimer = 0.15;
  }

  enterTerrainSettling(): void {
    this.phase = 'TERRAIN_SETTLING';
    this.phaseTimer = 2.5;
  }

  enterTurnEnd(): void {
    this.phase = 'TURN_END';
    this.phaseTimer = 0.3;
  }

  enterGameOver(): void {
    this.phase = 'GAME_OVER';
  }

  setPaused(paused: boolean): void {
    if (paused && this.phase !== 'GAME_OVER' && this.phase !== 'PAUSED') {
      this.phase = 'PAUSED';
    }
  }

  turnFuel = 220;

  updateTimers(dt: number): void {
    if (this.phase === 'PLAYER_CONTROL' && this.turnTimeLimit > 0) {
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) {
        // 超时自动跳过 -> 视为结束回合但不发射
        this.enterTurnEnd();
      }
    }
    if (this.phaseTimer > 0) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.onPhaseEnd();
      }
    }
  }

  private onPhaseEnd(): void {
    switch (this.phase) {
      case 'TURN_START':
        this.enterPlayerControl();
        break;
      case 'EXPLOSION':
        this.enterDamageResolution();
        break;
      case 'DAMAGE_RESOLUTION':
        this.enterTerrainSettling();
        break;
      case 'TERRAIN_SETTLING':
        this.enterTurnEnd();
        break;
      case 'TURN_END':
        this.switchPlayer();
        this.enterTurnStart();
        break;
      default:
        break;
    }
  }

  // 切换玩家，跳过已死亡的坦克
  switchPlayer(): void {
    if (this.tanks.filter((t) => t.isAlive).length <= 1) {
      this.enterGameOver();
      return;
    }
    let next = this.currentPlayer;
    for (let i = 0; i < this.tanks.length; i++) {
      next = (next + 1) % this.tanks.length;
      if (this.tanks[next].isAlive) {
        this.currentPlayer = next;
        this.roundCount++;
        return;
      }
    }
    this.enterGameOver();
  }

  // 检查胜负
  checkVictory(): { isOver: boolean; winnerIndex: number; isDraw: boolean } {
    const alive = this.tanks.filter((t) => t.isAlive);
    if (alive.length === 0) {
      return { isOver: true, winnerIndex: -1, isDraw: true };
    }
    if (alive.length === 1 && this.tanks.length > 1) {
      const winner = alive[0];
      return { isOver: true, winnerIndex: this.tanks.indexOf(winner), isDraw: false };
    }
    return { isOver: false, winnerIndex: -1, isDraw: false };
  }

  // 坦克沿地形移动：处理碰撞与坡度
  // 将整步拆成若干小段（每段 ≤ 4px），逐段检查瞬时坡度
  moveTank(
    tank: Tank,
    dir: -1 | 1,
    distance: number,
    terrain: { surfaceY: (x: number) => number; worldWidth: number }
  ): boolean {
    if (tank.movementFuel <= 0) return false;
    const want = Math.min(distance, tank.movementFuel);
    const worldMin = 14;
    const worldMax = terrain.worldWidth - 14;
    let moved = 0;
    const subStep = 4;
    while (moved < want) {
      const remain = want - moved;
      const step = Math.min(subStep, remain);
      const candidateX = clamp(tank.x + dir * step, worldMin, worldMax);
      if (candidateX === tank.x) break; // 撞到边界
      const curY = terrain.surfaceY(tank.x);
      const nextY = terrain.surfaceY(candidateX);
      const dx = candidateX - tank.x;
      const dy = nextY - curY;
      // 瞬时坡度（屏幕坐标系 y 向下，地形上坡 dy<0）
      const slope = Math.abs(dy / Math.max(0.5, Math.abs(dx)));
      if (slope > TANK_CONFIG.maxClimbSlope) {
        // 太陡，本帧停止移动
        break;
      }
      tank.x = candidateX;
      tank.y = nextY;
      moved += step;
    }
    if (moved === 0) return false;
    // 车身角度跟随地表
    const x0 = terrain.surfaceY(tank.x - 2);
    const x1 = terrain.surfaceY(tank.x + 2);
    const s = (x1 - x0) / 4;
    tank.bodyAngle = Math.atan2(s, 1);
    tank.movementFuel = Math.max(0, tank.movementFuel - moved);
    return true;
  }
}
