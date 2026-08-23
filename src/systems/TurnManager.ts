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
  // 将整步拆成若干小段（每段 ≤ 2px），逐段检查履带姿态和瞬时坡度
  moveTank(
    tank: Tank,
    dir: -1 | 1,
    distance: number,
    terrain: {
      surfaceY: (x: number) => number;
      worldWidth: number;
      tankPose?: (x: number, fromY: number, trackWidth: number) => {
        y: number;
        angle: number;
        supported: boolean;
      };
    }
  ): boolean {
    if (tank.movementFuel <= 0) return false;
    const want = Math.min(distance, tank.movementFuel);
    const worldMin = 14;
    const worldMax = terrain.worldWidth - 14;
    let moved = 0;
    const subStep = 2;
    while (moved < want) {
      const remain = want - moved;
      const step = Math.min(subStep, remain);
      const candidateX = clamp(tank.x + dir * step, worldMin, worldMax);
      if (candidateX === tank.x) break; // 撞到边界
      const currentPose = terrain.tankPose?.(tank.x, tank.y, TANK_CONFIG.bodyWidth);
      const nextPose = terrain.tankPose?.(candidateX, tank.y, TANK_CONFIG.bodyWidth);
      const curY = currentPose?.y ?? terrain.surfaceY(tank.x);
      const nextY = nextPose?.y ?? terrain.surfaceY(candidateX);
      const dx = candidateX - tank.x;
      const dy = nextY - curY;
      // 屏幕坐标系 y 向下：dy < 0 才是需要动力攀爬的上坡。
      // 向下进入弹坑时即便坑壁很陡也必须允许前进，随后由落地阶段
      // 处理支撑与坠落；若对 dy 取绝对值，弹坑边缘会变成无形墙。
      const climbSlope = Math.max(0, -dy / Math.max(0.5, Math.abs(dx)));
      if (climbSlope > TANK_CONFIG.maxClimbSlope) {
        // 爆炸后的像素地形常在坑沿留下很窄的尖唇。以履带半宽向前
        // 探测：若尖唇后方已经回到当前高度或更低，允许履带越过；
        // 连续陡坡在整个探测范围内都更高，仍会被正确阻挡。
        const probeDistance = TANK_CONFIG.bodyWidth / 2;
        let clearsLip = false;
        for (let probe = subStep * 2; probe <= probeDistance; probe += subStep) {
          const probeX = clamp(tank.x + dir * probe, worldMin, worldMax);
          if (terrain.surfaceY(probeX) >= curY) {
            clearsLip = true;
            break;
          }
        }
        if (!clearsLip) break;
      }
      tank.x = candidateX;
      if (!nextPose || nextY <= tank.y + 5) {
        // 小台阶和正常坡面直接贴合；姿态角限制每个子步的变化量，消除
        // 像素边缘导致的视觉顿挫。
        tank.y = nextY;
        tank.isGrounded = nextPose?.supported ?? true;
        const targetAngle = nextPose?.angle ?? Math.atan2(
          terrain.surfaceY(tank.x + 2) - terrain.surfaceY(tank.x - 2),
          4
        );
        tank.bodyAngle += clamp(targetAngle - tank.bodyAngle, -0.06, 0.06);
      } else {
        // 驶入宽弹坑时只移动 X，不瞬移到坑底；下一物理帧由重力接管。
        tank.isGrounded = false;
      }
      moved += step;
    }
    if (moved === 0) return false;
    tank.movementFuel = Math.max(0, tank.movementFuel - moved);
    return true;
  }
}
