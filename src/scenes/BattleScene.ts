import type { Game, Scene } from '../core/Game';
import type { GameMode, Tank, WindState, MissionStats } from '../types';
import { createTank, consumeAmmo, hasAmmo, cycleWeapon } from '../entities/Tank';
import { TurnManager } from '../systems/TurnManager';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { Renderer } from '../rendering/Renderer';
import { HudRenderer } from '../rendering/HudRenderer';
import { BattleHud } from '../ui/BattleHud';
import { TouchControls } from '../ui/TouchControls';
import { createRng, generateRandomSeed } from '../utils/random';
import { clamp, angleToVector, radToDeg } from '../utils/math';
import { POWER_RANGE, ANGLE_RANGE, TANK_CONFIG, WORLD_CONFIG, BASE_GRAVITY } from '../config/gameConfig';
import { weaponRegistry } from '../weapons/WeaponRegistry';
import { COLORS, PLAYER_COLORS } from '../core/Constants';
import { getGameVariant, TRAINING_VARIANT, type GameVariant } from '../config/gameVariants';
import { getBattleTheme, type BattleTheme } from '../config/battleThemes';
import {
  capTurnTime,
  isSubmergedInLava,
  LAVA_DAMAGE_PER_TURN,
  lavaLevelForRound,
  pickSupplyDrop,
  planLava,
  type LavaPlan,
} from '../systems/VariantRules';
import { isFormElement } from '../systems/InputManager';
import { audioSystem } from '../systems/AudioSystem';
import { planAIShot, type AIShotPlan } from '../systems/AIController';
import {
  AI_MOVE_REASON_TEXT,
  chooseAIMove,
  chooseAITacticalWeapon,
  type AIMovePlan,
  type AITacticsContext,
} from '../systems/AITactics';
import { ShopPanel } from '../ui/ShopPanel';
import {
  awardRoundCredits,
  chooseAIShopItem,
  createBasicLoadout,
  purchaseWeapon,
} from '../systems/ShopSystem';
import {
  hasWonMatch,
  MATCH_MAX_GAMES,
  MATCH_WINS_REQUIRED,
  nextGameHealth,
  resolveRoundByHealth,
} from '../systems/MatchRules';
import { createTrainingLoadout, isTrainingTarget, restoreTrainingTarget } from '../systems/TrainingSystem';
import type { OnlineInput } from '../net/OnlineSession';
import { ShotHistory } from '../systems/ShotHistory';

/** 集束弹已不可控制时上报的弹道进度，表示对手无需再等待。 */
const ONLINE_FLIGHT_DONE = 1e9;

interface PendingExplosion {
  x: number;
  y: number;
  radius: number;
  damage: number;
  ownerTankId: string;
  directHitTankId: string | null;
  terrainDamageMultiplier: number;
  weaponColor: string;
  processed: boolean;
}

export class BattleScene implements Scene {
  private game: Game;
  readonly mode: GameMode;
  readonly variant: GameVariant;
  private readonly theme: BattleTheme;
  private readonly hud = new HudRenderer();
  private readonly shotHistory = new ShotHistory(3);
  private variantRound = 0;
  private lavaPlan: LavaPlan | null = null;
  private lavaLevel: number | null = null;
  tanks: Tank[];
  turn: TurnManager;
  projectileSystem: ProjectileSystem;
  renderer: Renderer;
  battleHud: BattleHud;
  touchControls: TouchControls;
  seed: string;
  wind: WindState;
  private pendingExplosions: PendingExplosion[] = [];
  private turnHint: { text: string; life: number } | null = null;
  private firePressed = false;
  private weaponCyclePressed = false;
  private paused = false;
  private aimPointerId: number | null = null;
  private mouseAimPoint: { x: number; y: number } | null = null;
  private aiPlayer = -1;
  private aiThinkTimer = 0;
  private aiPlan: AIShotPlan | null = null;
  /** AI 回合流程：思考 → 移动 → 换武器 → 瞄准开火 */
  private aiStage: 'think' | 'move' | 'switch' | 'aim' | 'fired' = 'think';
  /** 区分不同回合的标识，避免同一控制阶段重复规划 */
  private aiTurnKey = -1;
  private aiMove: AIMovePlan = { targetX: null, reason: null };
  private aiStuckTimer = 0;
  private aiWeaponTarget = 'basic_shell';
  private aiCycleDir: 1 | -1 = 1;
  private landscapeHint: HTMLElement | null = null;
  private chestRound = 0;
  private wormholeRound = 0;
  private matchWins: [number, number] = [0, 0];
  private gameNumber = 1;
  private gamesPlayed = 0;
  private totalTurns = 0;
  private terrainAttempt = 1;
  private roundEnding = false;
  private roundTransitionTimer = 0;
  private matchComplete = false;
  private nextHealth: [number, number];
  private aggregateStats = [
    { damageDealt: 0, hitCount: 0, directHitCount: 0 },
    { damageDealt: 0, hitCount: 0, directHitCount: 0 },
  ];
  private credits: [number, number] = [0, 0];
  private inventories: [Record<string, number>, Record<string, number>] = [
    createBasicLoadout(),
    createBasicLoadout(),
  ];
  private shopPanel: ShopPanel | null = null;
  private shopOpen = false;
  private shopPlayer = 0;
  private lastRoundWinner = -1;
  private onlinePublishTimer = 0;
  private onlineLastPublished = '';
  /** 本方最后一次上报的坦克状态；开火后冻结，弹道同步消息沿用这一快照。 */
  private onlineSnapshot: Omit<OnlineInput, 'fire' | 'pass' | 'flightTick' | 'detonateAt'> | null = null;
  private onlineFireSequence = 0;
  private onlinePassSequence = 0;
  private onlineAppliedFire = 0;
  private onlineAppliedPass = 0;
  /** 当前炮弹已完成的弹道步数（双方独立计数，按固定步长保持一致） */
  private onlineFlightTick = 0;
  private onlineDetonateAt = 0;
  private onlineClusterTracked = false;
  private onlineEndTimer = -1;
  private random: () => number = Math.random;

  constructor(game: Game, mode: GameMode = 'duel', variantId?: string) {
    this.game = game;
    this.mode = mode;
    this.variant = mode === 'training'
      ? TRAINING_VARIANT
      : getGameVariant(variantId ?? game.settings.gameVariant);
    this.theme = getBattleTheme(this.variant.theme);
    // 重力是全局物理参数；每场对局开始时按模式显式设定，避免沿用上一场。
    WORLD_CONFIG.gravity = BASE_GRAVITY * this.variant.gravityMultiplier;
    // 种子
    const settings = game.settings;
    this.nextHealth = [settings.initialHealth, settings.initialHealth];
    this.seed = settings.mapSeed && settings.mapSeed.length > 0 ? settings.mapSeed : generateRandomSeed();
    this.random = mode === 'online' ? createRng(this.seed).next : Math.random;
    game.settings.mapSeed = this.seed;
    game.saveSettings();

    // 创建地形（必要时复用 game.terrain）
    game.terrain.theme = this.theme;
    game.terrain.generate(this.seed, settings.mapPreset);
    this.renderer = new Renderer(this.seed, this.theme);

    // 坦克
    const hp = settings.initialHealth;
    const fuel = this.turnFuel();
    const t1 = createTank('t1', 0, settings.player1Name, 0, 0, hp, fuel, 'basic_shell');
    const targetName = mode === 'training' ? '训练靶机' : settings.player2Name;
    const t2 = createTank('t2', 1, targetName, 0, 0, hp, fuel, 'basic_shell');
    this.tanks = [t1, t2];
    this.placeTanks();

    this.wind = { value: 0, displayStrength: 0 };
    this.turn = new TurnManager(this.tanks, game.damageSystem);
    this.turn.random = this.random;
    this.turn.fixedPlayer = mode === 'training' ? 0 : null;
    this.turn.turnFuel = fuel;
    this.turn.windStrength = settings.windEnabled ? settings.windStrength : 0;
    this.turn.turnTimeLimit = mode === 'training' ? 0 : capTurnTime(settings.turnTime, this.variant.turnTimeCap);
    this.turn.reset(this.tanks);
    this.turn.startGame();
    this.resetVariantState();

    game.camera.x = this.tanks[0].x;
    game.camera.followTank(this.tanks[0].x, this.tanks[0].y);
    game.camera.y = game.camera.targetY;

    this.projectileSystem = new ProjectileSystem(game.terrain, game.collision, this.tanks, this.wind, this.random);
    this.projectileSystem.setWind(this.wind);

    const parent = game.canvas.parentElement!;
    this.battleHud = new BattleHud(parent, game.mobile);
    this.touchControls = new TouchControls(parent, game.mobile);
    this.touchControls.autoShow();
    this.landscapeHint = this.createLandscapeHint();
    parent.appendChild(this.landscapeHint);
    this.updateLandscape();

    if (mode === 'training') {
      this.applyTrainingRules();
    } else {
      this.applyInventoriesToTanks();
      if (mode === 'online') this.shopOpen = false;
      else this.openShop(-1);
      if (!this.shopOpen && this.variant.id !== 'classic') {
        this.turnHint = { text: `${this.variant.displayName} · ${this.variant.tagline}`, life: 2.2 };
      }
    }

  }

  private turnFuel(): number {
    return Math.round(this.game.settings.movementFuel * this.variant.fuelMultiplier);
  }

  /** 新一局开始时重置模式状态（熔岩从谷底重新规划）。 */
  private resetVariantState(): void {
    this.variantRound = 0;
    this.lavaPlan = this.variant.risingLava
      ? planLava(this.game.terrain.heightMap, this.variant.maxTurnsPerGame)
      : null;
    this.lavaLevel = this.lavaPlan ? lavaLevelForRound(this.lavaPlan, 1) : null;
  }

  /**
   * 每个操作回合开始时执行一次的模式效果。返回 true 表示本局已因此结束。
   * 随机数按固定顺序消耗，联机双方得到相同结果。
   */
  private applyRoundModifiers(): boolean {
    if (this.lavaPlan) {
      this.lavaLevel = lavaLevelForRound(this.lavaPlan, this.turn.roundCount);
      let burned = false;
      for (const tank of this.tanks) {
        if (!tank.isAlive || !isSubmergedInLava(tank.y, this.lavaLevel)) continue;
        burned = true;
        tank.health = Math.max(0, tank.health - LAVA_DAMAGE_PER_TURN);
        tank.hitFlash = 0.4;
        this.game.particles.spawnDamageNumber(tank.x, tank.y - 30, LAVA_DAMAGE_PER_TURN);
        this.game.particles.spawnExplosion(tank.x, tank.y - 4, 20, '#ff8a1f');
        if (tank.health <= 0) {
          tank.isAlive = false;
          this.game.particles.spawnExplosion(tank.x, tank.y - 8, 60, COLORS.Warning);
          this.game.camera.shake(18, 0.5);
        }
      }
      if (burned) {
        audioSystem.tankHit();
        this.turnHint = { text: '熔岩灼烧！浸没的坦克受到伤害', life: 1.6 };
      }
      const victory = this.turn.checkVictory();
      if (victory.isOver) {
        this.finishRound(victory);
        return true;
      }
    }
    if (this.variant.supplyDrops) {
      const tank = this.tanks[this.turn.currentPlayer];
      if (tank?.isAlive) {
        const weaponId = pickSupplyDrop(this.random);
        const weapon = weaponRegistry.get(weaponId);
        tank.ammo[weaponId] = Math.max(0, tank.ammo[weaponId] ?? 0) + 1;
        tank.selectedWeaponId = weaponId;
        this.game.particles.spawnExplosion(tank.x, tank.y - 46, 22, weapon.color);
        this.turnHint = { text: `空投补给 · ${weapon.displayName}`, life: 1.6 };
        audioSystem.click();
      }
    }
    return false;
  }

  private nextLavaLevel(): number | null {
    if (!this.lavaPlan || this.turn.roundCount >= this.variant.maxTurnsPerGame) return null;
    return lavaLevelForRound(this.lavaPlan, this.turn.roundCount + 1);
  }

  private placeTanks(): void {
    const terrain = this.game.terrain;
    const w = terrain.worldWidth;
    // 大地图上扩大出生区间；从多个候选点中挑选相对稳定的落脚处，避免
    // 多样地形把坦克直接生成在尖峰侧面。
    const findSpawn = (minRatio: number, maxRatio: number): number => {
      let bestX = Math.floor(w * (minRatio + this.random() * (maxRatio - minRatio)));
      let bestSlope = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 24; i++) {
        const x = Math.floor(w * (minRatio + this.random() * (maxRatio - minRatio)));
        const slope = Math.abs(terrain.surfaceY(x + 18) - terrain.surfaceY(x - 18)) / 36;
        if (slope < bestSlope) {
          bestX = x;
          bestSlope = slope;
        }
      }
      return bestX;
    };
    const x1 = findSpawn(0.15, 0.3);
    const x2 = findSpawn(0.7, 0.85);
    this.tanks[0].x = x1;
    this.tanks[1].x = x2;
    for (const t of this.tanks) {
      const pose = terrain.tankPose(t.x, 0, TANK_CONFIG.bodyWidth);
      t.y = pose.y;
      t.bodyAngle = pose.angle;
      t.isGrounded = pose.supported;
    }
  }

  private createLandscapeHint(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'landscape-hint hidden';
    el.innerHTML = `<div class="landscape-hint-inner"><div class="rotate-icon">⟳</div>建议横屏游戏</div>`;
    return el;
  }

  private updateLandscape(): void {
    if (!this.landscapeHint) return;
    if (window.innerHeight > window.innerWidth) {
      this.landscapeHint.classList.remove('hidden');
    } else {
      this.landscapeHint.classList.add('hidden');
    }
  }

  update(dt: number): void {
    if (this.paused) return;
    this.game.particles.update(dt);
    this.game.camera.update(dt);

    if (this.turnHint) {
      this.turnHint.life -= dt;
      if (this.turnHint.life <= 0) this.turnHint = null;
    }

    // 战前购买阶段暂停战斗状态机，商店完成后才正式开始本局计时。
    if (this.shopOpen) return;

    if (this.roundEnding) {
      this.roundTransitionTimer -= dt;
      if (this.roundTransitionTimer <= 0) {
        if (this.matchComplete) this.finishMatch();
        else this.startNextGame();
      }
      return;
    }

    if (this.mode === 'online' && this.handleOnlineEnded(dt)) return;

    // 联机时回合超时只由操作方判定，再通过 pass 序号通知对手；
    // 否则网络延迟会让双方在不同时刻结束同一回合。
    const remoteTurn = this.isRemoteTurn();
    const wasLocalControl = this.mode === 'online' && !remoteTurn && this.turn.phase === 'PLAYER_CONTROL';
    this.turn.timeoutEnabled = !remoteTurn;
    this.turn.updateTimers(dt);
    if (wasLocalControl && this.turn.phase === 'TURN_END') {
      this.onlinePassSequence++;
      const tank = this.tanks[this.turn.currentPlayer];
      if (tank) this.publishOnlineInput(tank, 0, true);
    }
    // TurnManager 在 TURN_START 随机生成新风；每帧同步到弹道系统，
    // 确保新回合的风不会沿用上一回合。
    this.wind = this.turn.wind;
    this.projectileSystem.setWind(this.wind);

    // 状态机驱动
    switch (this.turn.phase) {
      case 'TURN_START':
        // 第 10 次操作已经完整结算；第 11 回合只显示裁决，不再给予控制权。
        if (this.mode !== 'training' && this.turn.roundCount > this.variant.maxTurnsPerGame) {
          this.resolveTurnLimit();
          return;
        }
        if (this.mode !== 'training' && this.chestRound !== this.turn.roundCount) {
          this.projectileSystem.spawnRandomChest();
          this.chestRound = this.turn.roundCount;
        }
        if (this.mode !== 'training' && this.wormholeRound !== this.turn.roundCount) {
          const appeared = this.projectileSystem.spawnWormholesForTurn(this.variant.wormholeChance, this.random);
          this.wormholeRound = this.turn.roundCount;
          if (appeared) this.turnHint = { text: '空间异常：双向黑洞出现！', life: 1.8 };
        }
        if (this.mode !== 'training' && this.variantRound !== this.turn.roundCount) {
          this.variantRound = this.turn.roundCount;
          if (this.applyRoundModifiers()) return;
        }
        // 提示
        if (!this.turnHint) {
          const t = this.tanks[this.turn.currentPlayer];
          this.turnHint = { text: `${t.name} 的回合`, life: 1.0 };
          audioSystem.turnSwitch();
          // 重置燃料与角度由 turn.enterTurnStart 完成
        }
        break;
      case 'PLAYER_CONTROL':
        if (this.isAITurn()) this.handleAIControl(dt);
        else this.handlePlayerControl(dt);
        break;
      case 'PROJECTILE_FLYING':
        // 联机对手的集束弹尚未确认本步是否释放时暂停弹道，等待操作方进度。
        if (!this.handleClusterDetonation()) break;
        this.projectileSystem.update(dt);
        this.shotHistory.sample(this.projectileSystem.getProjectiles());
        this.onlineFlightTick++;
        this.publishOnlineFlight();
        for (const event of this.projectileSystem.consumeWormholeEvents()) {
          this.game.particles.spawnExplosion(event.entryX, event.entryY, 24, event.color);
          this.game.particles.spawnExplosion(event.exitX, event.exitY, 30, event.color);
          this.game.camera.shake(5, 0.18);
        }
        this.consumeTreasureRewards();
        this.consumeExplosions();
        this.updateTanksSettling(dt, false);
        if (!this.projectileSystem.hasAlive() && this.pendingExplosions.length === 0) {
          // 所有炮弹消失 -> 进入爆炸阶段（如果有未消化的）
          this.shotHistory.end();
          this.turn.enterExplosion();
        } else {
          // 跟随主弹
          const ps = this.projectileSystem.getProjectiles();
          if (ps.length > 0) {
            let cx = 0;
            let cy = 0;
            for (const p of ps) {
              cx += p.x;
              cy += p.y;
            }
            cx /= ps.length;
            cy /= ps.length;
            this.game.camera.follow(cx, cy);
          }
        }
        break;
      case 'EXPLOSION':
        // 短暂展示后进入伤害结算（伤害已在 consumeExplosions 中应用）
        this.updateTanksSettling(dt, false);
        this.turn.phaseTimer = Math.min(this.turn.phaseTimer, 0.3);
        break;
      case 'DAMAGE_RESOLUTION':
        this.updateTanksSettling(dt, false);
        break;
      case 'TERRAIN_SETTLING':
        this.updateTanksSettling(dt);
        if (this.mode === 'training') {
          restoreTrainingTarget(this.tanks[1]);
          const player = this.tanks[0];
          if (!player.isAlive) {
            player.health = player.maxHealth;
            player.isAlive = true;
            this.turnHint = { text: '训练坦克已自动维修', life: 1.4 };
          }
        } else {
          // 普通对战检查胜负；训练场为无限循环，不进入结算界面。
          const v = this.turn.checkVictory();
          if (v.isOver) {
            this.finishRound(v);
            return;
          }
        }
        break;
      case 'TURN_END':
        break;
      case 'GAME_OVER':
        break;
      default:
        break;
    }

    // 炮口指向也更新（预测轨迹用）
  }

  private consumeTreasureRewards(): void {
    const labels = {
      double_damage: '宝箱奖励：本次炮弹伤害翻倍！',
      wide_blast: '宝箱奖励：本次爆炸范围扩大！',
      split_shot: '宝箱奖励：炮弹分裂为两枚！',
    } as const;
    for (const event of this.projectileSystem.consumeRewards()) {
      const tank = this.tanks.find((t) => t.id === event.ownerTankId);
      if (tank) this.turnHint = { text: `${tank.name} · ${labels[event.reward]}`, life: 1.8 };
      this.game.particles.spawnExplosion(
        this.projectileSystem.getChest()?.x ?? tank?.x ?? 0,
        this.projectileSystem.getChest()?.y ?? tank?.y ?? 0,
        24,
        COLORS.Accent
      );
    }
  }

  private handlePlayerControl(dt: number): void {
    // 人类回合到来后清除上一回合 AI 计划，确保下次依据新地形和风力重算。
    this.aiPlayer = -1;
    this.aiPlan = null;
    const tank = this.tanks[this.turn.currentPlayer];
    if (!tank || !tank.isAlive) {
      this.turn.enterTurnEnd();
      return;
    }
    // 防御性修正：若地形结算的最后一帧恰好把坦克水平推到空洞上方，
    // 控制阶段继续完成落地，避免坦克永久悬空。
    if (this.settleTankAtCurrentPosition(tank, dt)) return;
    if (this.isRemoteTurn()) {
      this.handleRemotePlayerControl(dt, tank);
      return;
    }
    // 镜头跟随当前坦克
    this.game.camera.followTank(tank.x, tank.y);

    // 处理触控一次性动作
    const oneShots = this.game.mobile.consumeOneShots();
    let fireRequested = false;
    let weaponSwitchRequested = false;
    let pauseRequested = false;
    for (const a of oneShots) {
      if (a === 'fire') fireRequested = true;
      else if (a === 'switchWeapon') weaponSwitchRequested = true;
      else if (a === 'pause') pauseRequested = true;
    }

    // 键盘
    const input = this.game.input;
    // 联机对局无法暂停对手，忽略暂停请求但保持其余操作可用。
    if ((input.isDown('escape') || pauseRequested) && this.mode !== 'online') {
      this.paused = true;
      this.game.gotoPause();
      return;
    }
    if (input.isDown('r')) {
      // 仅在 GAME_OVER 时有效，这里忽略
    }
    // 切换武器（一次按下一次切换）
    const tabNow = input.isDown('tab');
    if (tabNow && !this.weaponCyclePressed) {
      weaponSwitchRequested = true;
    }
    this.weaponCyclePressed = tabNow;

    // 跳过无弹药武器
    if (weaponSwitchRequested) this.cycleToNextAvailableWeapon(tank);

    // 移动
    const moveDir = (input.isDown('arrowleft') ? -1 : 0) +
      (input.isDown('arrowright') ? 1 : 0) +
      (this.game.mobile.isActionDown('left') ? -1 : 0) +
      (this.game.mobile.isActionDown('right') ? 1 : 0);
    if (moveDir !== 0) {
      const dir = moveDir > 0 ? 1 : -1;
      const moved = this.turn.moveTank(tank, dir, TANK_CONFIG.moveSpeed * dt, this.game.terrain);
      if (moved) {
        // 移动音效节流
        if (Math.random() < 0.3) audioSystem.tankMove();
      }
    }

    // 角度：桌面端由鼠标与坦克的连线决定；移动端仍使用触控角度按钮。
    const aimDir = (this.game.mobile.isActionDown('aimUp') ? 1 : 0) +
      (this.game.mobile.isActionDown('aimDown') ? -1 : 0);
    if (aimDir !== 0) {
      tank.turretAngle = clamp(tank.turretAngle + aimDir * 60 * dt, ANGLE_RANGE.min, ANGLE_RANGE.max);
    }

    // 移动端用屏幕按钮；桌面端力度由鼠标滚轮事件调整。
    const pwDir = (this.game.mobile.isActionDown('powerUp') ? 1 : 0) +
      (this.game.mobile.isActionDown('powerDown') ? -1 : 0);
    if (pwDir !== 0) {
      tank.power = clamp(tank.power + pwDir * 180 * dt, POWER_RANGE.min, POWER_RANGE.max);
    }

    // 发射
    const spaceNow = input.isDown(' ');
    const fireHeld = spaceNow || this.game.mobile.isActionDown('fire');
    const fireTriggered = fireRequested || (fireHeld && !this.firePressed);
    if (fireTriggered) {
      this.fire(tank);
    }
    this.firePressed = fireHeld;
    // 开火时 fire() 已按开火前的状态上报；此后不能再用开火后的坦克状态覆盖快照。
    if (this.turn.phase === 'PLAYER_CONTROL') this.publishOnlineInput(tank, moveDir);
  }

  private isRemoteTurn(): boolean {
    const session = this.game.onlineSession;
    return this.mode === 'online' && !!session && this.turn.currentPlayer !== session.localPlayer;
  }

  /** 局数与回合数组成的回合标识，双方按相同规则推进，可用来识别过期消息。 */
  private onlineTurnId(): number {
    return this.gamesPlayed * 100 + this.turn.roundCount;
  }

  private handleRemotePlayerControl(dt: number, tank: Tank): void {
    const session = this.game.onlineSession;
    if (!session) return;
    this.game.camera.followTank(tank.x, tank.y);
    const input = session.remoteInput;
    if (!input) return;
    // 开火与放弃回合使用递增序号，不受消息延迟或合并影响；即使本端仍在
    // 结算上一回合，序号变化也会保留到进入本回合操作阶段后再执行。
    if (input.pass !== this.onlineAppliedPass) {
      this.onlineAppliedPass = input.pass;
      this.applyRemoteTankState(tank, input);
      this.turn.enterTurnEnd();
      return;
    }
    if (input.fire !== this.onlineAppliedFire) {
      this.onlineAppliedFire = input.fire;
      this.applyRemoteTankState(tank, input);
      this.fire(tank);
      return;
    }
    if (input.turn !== this.onlineTurnId()) return;
    // 操作阶段仅做平滑跟随展示；开火时再精确对齐操作方的状态。
    tank.turretAngle = input.angle;
    tank.power = input.power;
    if (hasAmmo(tank, input.weaponId)) tank.selectedWeaponId = input.weaponId;
    const gap = input.x - tank.x;
    if (Math.abs(gap) > 0.5) {
      const step = Math.min(Math.abs(gap), TANK_CONFIG.moveSpeed * 1.5 * dt);
      tank.x += Math.sign(gap) * step;
      const pose = this.game.terrain.tankPose(tank.x, tank.y, TANK_CONFIG.bodyWidth);
      tank.y = pose.y;
      tank.bodyAngle = pose.angle;
      tank.isGrounded = pose.supported;
    }
    tank.movementFuel = input.fuel;
  }

  /** 采用操作方上报的权威坦克状态，保证双方弹道起点、血量和武器一致。 */
  private applyRemoteTankState(tank: Tank, input: OnlineInput): void {
    tank.x = input.x;
    tank.y = input.y;
    tank.turretAngle = input.angle;
    tank.power = input.power;
    tank.movementFuel = input.fuel;
    tank.velocityX = 0;
    tank.velocityY = 0;
    const pose = this.game.terrain.tankPose(tank.x, tank.y, TANK_CONFIG.bodyWidth);
    tank.bodyAngle = pose.angle;
    tank.isGrounded = pose.supported;
    if (hasAmmo(tank, input.weaponId)) tank.selectedWeaponId = input.weaponId;
    tank.health = Math.min(tank.maxHealth, input.health);
    if (tank.health <= 0) {
      tank.health = 0;
      tank.isAlive = false;
    }
  }

  private publishOnlineInput(tank: Tank | null, moveDir = 0, force = false): void {
    const session = this.game.onlineSession;
    if (!session || this.mode !== 'online') return;
    this.onlinePublishTimer -= 1 / 60;
    if (tank) {
      this.onlineSnapshot = {
        turn: this.onlineTurnId(),
        move: (moveDir < 0 ? -1 : moveDir > 0 ? 1 : 0) as OnlineInput['move'],
        x: tank.x,
        y: tank.y,
        angle: tank.turretAngle,
        power: tank.power,
        health: tank.health,
        fuel: tank.movementFuel,
        weaponId: tank.selectedWeaponId,
      };
    }
    if (!this.onlineSnapshot) return;
    const input: OnlineInput = {
      ...this.onlineSnapshot,
      fire: this.onlineFireSequence,
      pass: this.onlinePassSequence,
      flightTick: this.onlineFlightTick,
      detonateAt: this.onlineDetonateAt,
    };
    // 仅在状态变化时发送（最多每 0.1 秒一次），减少房间存储写入。
    const serialized = JSON.stringify(input);
    if (serialized === this.onlineLastPublished) return;
    if (this.onlinePublishTimer > 0 && !force) return;
    this.onlinePublishTimer = 0.1;
    this.onlineLastPublished = serialized;
    session.sendInput(input);
  }

  /**
   * 本方集束弹飞行期间持续上报弹道进度，对手据此逐步推进并在同一步释放；
   * 集束弹不可再控制后上报一个极大值，让对手不再等待。
   */
  private publishOnlineFlight(): void {
    if (this.mode !== 'online' || this.isRemoteTurn()) return;
    const owner = this.tanks[this.turn.currentPlayer];
    if (!owner) return;
    if (this.projectileSystem.hasControllableCluster(owner.id)) {
      this.onlineClusterTracked = true;
      this.publishOnlineInput(null);
    } else if (this.onlineClusterTracked) {
      this.onlineClusterTracked = false;
      this.onlineFlightTick = ONLINE_FLIGHT_DONE;
      this.publishOnlineInput(null, 0, true);
    }
  }

  /** 对手离开或房间失效时提示并返回主菜单；返回 true 表示暂停战斗逻辑。 */
  private handleOnlineEnded(dt: number): boolean {
    const session = this.game.onlineSession;
    if (this.matchComplete) return false;
    if (this.onlineEndTimer < 0) {
      if (!session || !session.ended) return false;
      this.onlineEndTimer = 3;
      this.turnHint = {
        text: session.opponentLeft ? '对手已离开对局，即将返回主菜单' : '联机连接已失效，即将返回主菜单',
        life: 3,
      };
    }
    this.onlineEndTimer -= dt;
    if (this.onlineEndTimer <= 0) this.game.gotoMenu();
    return true;
  }

  private isAITurn(): boolean {
    return this.mode !== 'training' &&
      this.game.settings.opponentMode === 'ai' && this.turn.currentPlayer === 1;
  }

  private handleAIControl(dt: number): void {
    const tank = this.tanks[this.turn.currentPlayer];
    const target = this.tanks.find((candidate) => candidate.isAlive && candidate.id !== tank?.id);
    if (!tank?.isAlive || !target) {
      this.turn.enterTurnEnd();
      return;
    }

    // AI 回合仍允许玩家用键盘或屏幕暂停按钮暂停游戏。
    const pauseRequested = this.game.mobile.consumeOneShots().includes('pause');
    if (this.game.input.isDown('escape') || pauseRequested) {
      this.paused = true;
      this.game.gotoPause();
      return;
    }

    const difficultyName = this.game.settings.aiDifficulty === 'elite' ? '精英 AI' : 'AI';
    const turnKey = this.onlineTurnId();
    if (this.aiTurnKey !== turnKey || this.aiPlayer !== this.turn.currentPlayer) {
      this.aiTurnKey = turnKey;
      this.aiPlayer = this.turn.currentPlayer;
      this.aiPlan = null;
      this.aiStage = 'think';
      // 留出观察地形和风向的时间，避免 AI 像脚本一样瞬间完成操作。
      this.aiThinkTimer = 0.7 + Math.random() * 0.6;
      this.aiMove = chooseAIMove(this.aiTacticsContext(tank, target));
      this.aiStuckTimer = 0;
      this.turnHint = { text: `${tank.name}（${difficultyName}）正在判断…`, life: 1.6 };
      this.game.mobile.clearAll();
      this.firePressed = false;
      this.weaponCyclePressed = false;
    }

    // 被炸空后先完成下落，再继续行动
    if (this.settleTankAtCurrentPosition(tank, dt)) return;
    this.game.camera.followTank(tank.x, tank.y);

    switch (this.aiStage) {
      case 'think':
        this.aiThinkTimer -= dt;
        if (this.aiThinkTimer > 0) return;
        if (this.aiMove.targetX !== null && this.aiMove.reason) {
          this.aiStage = 'move';
          this.turnHint = { text: `${tank.name} · ${AI_MOVE_REASON_TEXT[this.aiMove.reason]}`, life: 1.6 };
        } else {
          this.beginAIWeaponSwitch(tank, target);
        }
        return;
      case 'move': {
        const goal = this.aiMove.targetX ?? tank.x;
        const gap = goal - tank.x;
        let moved = false;
        if (Math.abs(gap) > 2) {
          const step = Math.min(Math.abs(gap), TANK_CONFIG.moveSpeed * dt);
          moved = this.turn.moveTank(tank, gap > 0 ? 1 : -1, step, this.game.terrain);
          if (moved && Math.random() < 0.3) audioSystem.tankMove();
        }
        // 到达、燃料耗尽或被陡坡挡住都结束移动，在实际位置重新规划
        this.aiStuckTimer = moved ? 0 : this.aiStuckTimer + dt;
        if (Math.abs(gap) <= 2 || this.aiStuckTimer > 0.25) this.beginAIWeaponSwitch(tank, target);
        return;
      }
      case 'switch':
        this.aiThinkTimer -= dt;
        if (this.aiThinkTimer > 0) return;
        if (tank.selectedWeaponId !== this.aiWeaponTarget && hasAmmo(tank, this.aiWeaponTarget)) {
          // 与玩家按 Tab 一样逐个切换，让对手看得见 AI 的选择
          this.cycleToNextAvailableWeapon(tank, this.aiCycleDir);
          this.aiThinkTimer = 0.2;
          return;
        }
        if (tank.selectedWeaponId !== 'basic_shell' || this.aiWeaponTarget !== 'basic_shell') {
          this.turnHint = { text: `${tank.name} 选用 ${weaponRegistry.get(tank.selectedWeaponId).displayName}`, life: 1.3 };
        }
        this.aiPlan = planAIShot(
          tank,
          target,
          this.wind,
          this.game.terrain,
          Math.random,
          tank.selectedWeaponId,
          this.game.settings.aiDifficulty,
          this.projectileSystem.getWormholes()
        );
        this.aiThinkTimer = 0.4 + Math.random() * 0.4;
        this.aiStage = 'aim';
        return;
      case 'aim': {
        if (!this.aiPlan) return;
        this.aiThinkTimer -= dt;
        const angleDiff = this.aiPlan.angle - tank.turretAngle;
        const angleStep = 42 * dt;
        tank.turretAngle += clamp(angleDiff, -angleStep, angleStep);
        const powerDiff = this.aiPlan.power - tank.power;
        const powerStep = 150 * dt;
        tank.power += clamp(powerDiff, -powerStep, powerStep);
        const aimed = Math.abs(angleDiff) < 0.8 && Math.abs(powerDiff) < 3;
        if (this.aiThinkTimer <= 0 && aimed) {
          this.aiStage = 'fired';
          this.turnHint = { text: `${tank.name}（${difficultyName}）开火！`, life: 1.1 };
          this.fire(tank);
        }
        return;
      }
      case 'fired':
        return;
    }
  }

  private aiTacticsContext(tank: Tank, target: Tank): AITacticsContext {
    const opponentShot = this.shotHistory.get(target.playerIndex)[0];
    const lastPath = opponentShot?.paths[0];
    const urgency = this.turn.roundCount / this.variant.maxTurnsPerGame +
      (tank.health < target.health ? 0.3 : 0);
    return {
      self: tank,
      target,
      wind: this.wind,
      terrain: this.game.terrain,
      difficulty: this.game.settings.aiDifficulty,
      wormholes: this.projectileSystem.getWormholes(),
      lavaLevel: this.lavaLevel,
      nextLavaLevel: this.nextLavaLevel(),
      threat: lastPath ? lastPath[lastPath.length - 1] : null,
      urgency,
    };
  }

  /** 在最终站位上选择武器，并进入逐个切换的展示阶段。 */
  private beginAIWeaponSwitch(tank: Tank, target: Tank): void {
    const choice = chooseAITacticalWeapon(this.aiTacticsContext(tank, target));
    this.aiWeaponTarget = hasAmmo(tank, choice.weaponId) ? choice.weaponId : 'basic_shell';
    // 沿较短方向切换
    const owned = weaponRegistry.all().filter((weapon) => hasAmmo(tank, weapon.id)).map((weapon) => weapon.id);
    const from = owned.indexOf(tank.selectedWeaponId);
    const to = owned.indexOf(this.aiWeaponTarget);
    const forward = from < 0 || to < 0 ? 0 : (to - from + owned.length) % owned.length;
    this.aiCycleDir = forward <= owned.length - forward ? 1 : -1;
    this.aiStage = 'switch';
    this.aiThinkTimer = 0.25;
  }

  private cycleToNextAvailableWeapon(tank: Tank, dir: 1 | -1 = 1): void {
    cycleWeapon(tank, dir);
    let safety = weaponRegistry.all().length;
    while (!hasAmmo(tank, tank.selectedWeaponId) && safety-- > 0) cycleWeapon(tank, dir);
    audioSystem.click();
  }

  private fire(tank: Tank): void {
    if (this.turn.phase !== 'PLAYER_CONTROL') return;
    if (!hasAmmo(tank, tank.selectedWeaponId)) {
      audioSystem.tankHit();
      return;
    }
    this.onlineFlightTick = 0;
    this.onlineDetonateAt = 0;
    this.onlineClusterTracked = false;
    if (this.mode === 'online' && !this.isRemoteTurn()) {
      // 必须在扣除弹药前上报：弹药耗尽时会自动换回基础炮弹。
      this.onlineFireSequence++;
      this.publishOnlineInput(tank, 0, true);
    }
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    consumeAmmo(tank, tank.selectedWeaponId);
    // 计算炮口位置和初速度
    const dir = angleToVector(tank.turretAngle);
    const px = tank.x + dir.x * (TANK_CONFIG.barrelLength + 6);
    const py = tank.y - TANK_CONFIG.bodyHeight + dir.y * (TANK_CONFIG.barrelLength + 6);
    audioSystem.fire();
    this.game.particles.spawnMuzzleFlash(px, py, tank.turretAngle);
    this.shotHistory.begin(tank.playerIndex, tank.turretAngle, tank.power, weapon.id);
    this.projectileSystem.fire(tank, tank.turretAngle, tank.power);
    this.shotHistory.sample(this.projectileSystem.getProjectiles());
    this.turn.enterProjectileFlying();
  }

  /** 返回 false 表示本步需等待联机对手的弹道进度，暂不推进炮弹。 */
  private handleClusterDetonation(): boolean {
    const owner = this.tanks[this.turn.currentPlayer];
    if (!owner) return true;
    if (this.isAITurn()) {
      const target = this.tanks.find((tank) => tank.isAlive && tank.id !== owner.id);
      if (
        target &&
        this.projectileSystem.shouldAIDetonateCluster(owner.id, target.x, target.y)
      ) {
        if (this.projectileSystem.detonateCluster(owner.id)) {
          this.turnHint = { text: `${owner.name}（AI）释放集束子弹！`, life: 1.1 };
        }
      }
      return true;
    }

    if (this.isRemoteTurn()) {
      if (!this.projectileSystem.hasControllableCluster(owner.id)) return true;
      const input = this.game.onlineSession?.remoteInput;
      if (!input || input.fire !== this.onlineAppliedFire) return false;
      if (input.detonateAt > 0 && this.onlineFlightTick >= input.detonateAt - 1) {
        if (this.projectileSystem.detonateCluster(owner.id)) {
          this.turnHint = { text: '集束子弹释放！', life: 1 };
          audioSystem.fire();
        }
        return true;
      }
      // 操作方已越过这一步且未释放，才可以继续推进。
      return input.flightTick > this.onlineFlightTick;
    }

    const actions = this.game.mobile.consumeOneShots();
    const pauseRequested = actions.includes('pause');
    if ((this.game.input.isDown('escape') || pauseRequested) && this.mode !== 'online') {
      this.paused = true;
      this.game.gotoPause();
      return true;
    }
    const spaceNow = this.game.input.isDown(' ');
    const detonateRequested = actions.includes('fire') || (spaceNow && !this.firePressed);
    this.firePressed = spaceNow;
    if (detonateRequested && this.projectileSystem.detonateCluster(owner.id)) {
      if (this.mode === 'online') {
        this.onlineDetonateAt = this.onlineFlightTick + 1;
        this.publishOnlineInput(null, 0, true);
      }
      this.turnHint = { text: '集束子弹释放！', life: 1 };
      audioSystem.fire();
    }
    return true;
  }

  private consumeExplosions(): void {
    const explosions = this.projectileSystem.consumePendingExplosions();
    const { blastRadiusMultiplier, damageMultiplier, terrainDamageMultiplier } = this.variant;
    for (const ex of explosions) {
      this.shotHistory.addImpact(ex.x, ex.y);
      // 弹坑半径 = 爆炸半径 × 地形系数；此处换算保证地形破坏倍率独立于爆炸范围。
      this.pendingExplosions.push({
        ...ex,
        radius: ex.radius * blastRadiusMultiplier,
        damage: Math.round(ex.damage * damageMultiplier),
        terrainDamageMultiplier: ex.terrainDamageMultiplier * terrainDamageMultiplier / blastRadiusMultiplier,
        processed: false,
      });
    }
    if (this.pendingExplosions.length === 0) return;
    for (const ex of this.pendingExplosions) {
      if (ex.processed) continue;
      ex.processed = true;
      this.processExplosion(ex);
    }
    this.pendingExplosions = this.pendingExplosions.filter((e) => !e.processed || e.radius > 0);
    // 实际上 processed 都为 true 后立刻清空
    this.pendingExplosions = [];
  }

  private processExplosion(ex: PendingExplosion): void {
    const terrain = this.game.terrain;
    // 地形破坏
    const craterR = ex.radius * ex.terrainDamageMultiplier;
    terrain.carveCircle(ex.x, ex.y, craterR);
    // 粒子
    this.game.particles.spawnExplosion(ex.x, ex.y, ex.radius, ex.weaponColor);
    this.game.particles.spawnDebris(ex.x, ex.y, this.theme.terrain.debris, 14);
    // 屏幕震动
    this.game.camera.shake(Math.min(14, ex.radius * 0.15), 0.35);
    audioSystem.explosion();
    // 伤害
    const dmg = this.game.damageSystem;
    const result = dmg.applyExplosion(
      { x: ex.x, y: ex.y },
      ex.radius,
      ex.damage,
      this.tanks,
      ex.directHitTankId,
      // 每次爆炸独立去重；散射、分裂与集束的不同弹体可分别造成伤害。
      new Set<string>()
    );
    for (const r of result.targets) {
      const tank = this.tanks.find((t) => t.id === r.tankId);
      if (!tank) continue;
      this.game.particles.spawnDamageNumber(tank.x, tank.y - 30, r.damage);
      audioSystem.tankHit();
      // 击退
      dmg.applyKnockback({ x: ex.x, y: ex.y }, ex.radius, tank, 0.4);
      // 统计
      if (r.damage > 0) {
        const owner = this.tanks.find((t) => t.id === ex.ownerTankId);
        if (owner && owner.id !== tank.id) {
          // 击中次数
          owner.hitCount++;
          if (r.isDirect) owner.directHitCount++;
          owner.damageDealt += r.damage;
        }
      }
      if (this.mode === 'training' && isTrainingTarget(tank)) {
        restoreTrainingTarget(tank);
        // 靶机可能刚被判定击毁；训练场立即修复并取消死亡表现。
        r.killed = false;
      }
      // 检查死亡 -> 触发爆炸动画
      if (r.killed) {
        this.game.particles.spawnExplosion(tank.x, tank.y - 8, 60, COLORS.Warning);
        this.game.camera.shake(20, 0.6);
      }
    }
  }

  private updateTanksSettling(dt: number, extendSettlingPhase = true): void {
    const terrain = this.game.terrain;
    let anyFalling = false;
    for (const tank of this.tanks) {
      if (this.mode === 'training' && isTrainingTarget(tank)) restoreTrainingTarget(tank);
      if (!tank.isAlive) continue;
      // 必须先应用水平击退，再按新的 X 坐标查询地面。旧顺序会在
      // 坦克被推离坑沿的同一帧误判“仍有支撑”，从而提前结束结算。
      if (Math.abs(tank.velocityX) > 0.1) {
        tank.x += tank.velocityX * dt;
        tank.x = clamp(tank.x, 12, terrain.worldWidth - 12);
        tank.velocityX *= 0.88;
      } else {
        tank.velocityX = 0;
      }
      // 应用重力直到接触地面
      const pose = terrain.tankPose(tank.x, tank.y, TANK_CONFIG.bodyWidth);
      const groundY = pose.y;
      if (groundY > tank.y + 1) {
        // 下落
        tank.velocityY += WORLD_CONFIG.gravity * dt;
        tank.y += tank.velocityY * dt;
        anyFalling = true;
        if (tank.y >= groundY) {
          // 落地：判断速度产生坠落伤害
          const impact = Math.abs(tank.velocityY);
          tank.y = groundY;
          if (impact > TANK_CONFIG.fallDamageThreshold) {
            const dmg = Math.round((impact - TANK_CONFIG.fallDamageThreshold) * TANK_CONFIG.fallDamageFactor);
            if (dmg > 0) {
              tank.health -= dmg;
              this.game.particles.spawnDamageNumber(tank.x, tank.y - 30, dmg);
              if (tank.health <= 0) {
                if (this.mode === 'training' && isTrainingTarget(tank)) {
                  restoreTrainingTarget(tank);
                } else {
                  tank.health = 0;
                  tank.isAlive = false;
                  this.game.particles.spawnExplosion(tank.x, tank.y - 8, 60, COLORS.Warning);
                }
              }
            }
          }
          tank.velocityY = 0;
          tank.isGrounded = pose.supported;
        }
      } else {
        // 在地表，对齐
        tank.y = groundY;
        tank.velocityY = 0;
        tank.isGrounded = pose.supported;
      }
      // 接地后以时间常数平滑贴合坡面，帧率变化不会引发角度抖动。
      if (tank.isGrounded) {
        const angleBlend = 1 - Math.exp(-18 * dt);
        tank.bodyAngle += (pose.angle - tank.bodyAngle) * angleBlend;
      }
      if (this.mode === 'training' && isTrainingTarget(tank)) restoreTrainingTarget(tank);
    }
    // 仍有下落时延长 TERRAIN_SETTLING
    if (anyFalling && extendSettlingPhase) {
      this.turn.phaseTimer = Math.max(this.turn.phaseTimer, 0.4);
    }
  }

  /**
   * 控制阶段的落地保险。正常情况下 TERRAIN_SETTLING 已完成此工作；
   * 返回 true 表示本帧仍在下落，不应同时接受移动或开火输入。
   */
  private settleTankAtCurrentPosition(tank: Tank, dt: number): boolean {
    const terrain = this.game.terrain;
    const pose = terrain.tankPose(tank.x, tank.y, TANK_CONFIG.bodyWidth);
    const groundY = pose.y;
    if (groundY <= tank.y + 1) {
      tank.y = groundY;
      tank.velocityY = 0;
      tank.isGrounded = pose.supported;
      const angleBlend = 1 - Math.exp(-18 * dt);
      tank.bodyAngle += (pose.angle - tank.bodyAngle) * angleBlend;
      return false;
    }

    tank.isGrounded = false;
    tank.velocityY += WORLD_CONFIG.gravity * dt;
    tank.y = Math.min(groundY, tank.y + tank.velocityY * dt);
    if (tank.y >= groundY) {
      tank.y = groundY;
      tank.velocityY = 0;
      tank.isGrounded = pose.supported;
      tank.bodyAngle = pose.angle;
      return false;
    }
    return true;
  }

  private resolveTurnLimit(): void {
    const result = resolveRoundByHealth(this.tanks);
    const losers = result.isDraw
      ? this.tanks
      : this.tanks.filter((tank) => tank.playerIndex !== result.winnerIndex);
    for (const tank of losers) {
      tank.health = 0;
      tank.isAlive = false;
      this.game.particles.spawnExplosion(tank.x, tank.y - 8, 68, COLORS.Warning);
    }
    this.game.camera.shake(result.isDraw ? 22 : 16, 0.7);
    audioSystem.explosion();
    this.finishRound(result, true);
  }

  private finishRound(
    v: { winnerIndex: number; isDraw: boolean },
    decidedByTurnLimit = false
  ): void {
    if (this.roundEnding) return;
    this.turn.enterGameOver();
    this.roundEnding = true;
    this.gamesPlayed++;
    this.totalTurns += Math.min(this.turn.roundCount, this.variant.maxTurnsPerGame);
    this.tanks.forEach((tank, index) => {
      this.aggregateStats[index].damageDealt += tank.damageDealt;
      this.aggregateStats[index].hitCount += tank.hitCount;
      this.aggregateStats[index].directHitCount += tank.directHitCount;
      // 空投武器只在当局有效，避免军火狂欢后期弹药无限膨胀。
      this.inventories[index] = this.variant.supplyDrops ? createBasicLoadout() : { ...tank.ammo };
    });

    this.nextHealth = nextGameHealth(this.tanks, v.winnerIndex, this.game.settings.initialHealth);
    if (!v.isDraw && v.winnerIndex >= 0) {
      this.matchWins[v.winnerIndex]++;
    }
    this.lastRoundWinner = v.isDraw ? -1 : v.winnerIndex;
    this.matchComplete = hasWonMatch(this.matchWins);

    const reason = decidedByTurnLimit ? `${this.variant.maxTurnsPerGame} 回合血量裁决` : '击毁对手';
    if (v.isDraw) {
      this.turnHint = { text: `第 ${this.gameNumber} 局平局 · 双方重赛`, life: 2.4 };
    } else {
      const winner = this.tanks[v.winnerIndex];
      this.turnHint = {
        text: `${winner.name} 赢下第 ${this.gameNumber} 局（${reason}） · 比分 ${this.matchWins[0]}:${this.matchWins[1]}`,
        life: 2.4,
      };
      if (!this.matchComplete) this.gameNumber++;
    }
    this.roundTransitionTimer = this.matchComplete ? 1.5 : 2.4;
    if (this.matchComplete) audioSystem.victory();
    else audioSystem.turnSwitch();
  }

  private startNextGame(): void {
    const settings = this.game.settings;
    this.terrainAttempt++;
    this.game.terrain.generate(`${this.seed}:game:${this.terrainAttempt}`, settings.mapPreset);
    const fuel = this.turnFuel();
    const tanks = [
      createTank('t1', 0, settings.player1Name, 0, 0, settings.initialHealth, fuel, 'basic_shell'),
      createTank('t2', 1, settings.player2Name, 0, 0, settings.initialHealth, fuel, 'basic_shell'),
    ];
    tanks[0].health = this.nextHealth[0];
    tanks[1].health = this.nextHealth[1];
    this.tanks = tanks;
    this.applyInventoriesToTanks();
    this.placeTanks();

    this.turn.reset(this.tanks);
    // 每局轮换先手，避免五局中固定一方持续获得先手优势。
    this.turn.startGame(this.gamesPlayed % 2);
    this.resetVariantState();
    // 新地形上旧弹道已无参考价值
    this.shotHistory.clear();
    this.wind = this.turn.wind;
    this.projectileSystem.reset(this.tanks, this.wind);
    this.game.particles.reset();
    this.pendingExplosions = [];
    this.chestRound = 0;
    this.wormholeRound = 0;
    this.aiPlayer = -1;
    this.aiPlan = null;
    this.firePressed = false;
    this.weaponCyclePressed = false;
    this.mouseAimPoint = null;
    this.roundEnding = false;
    this.matchComplete = false;
    const activeTank = this.tanks[this.turn.currentPlayer];
    this.game.camera.followTank(activeTank.x, activeTank.y);
    this.turnHint = {
      text: `第 ${this.gameNumber}/${MATCH_MAX_GAMES} 局 · 比分 ${this.matchWins[0]}:${this.matchWins[1]}`,
      life: 2,
    };
    this.openShop(this.lastRoundWinner);
  }

  private applyTrainingRules(): void {
    const infiniteAmmo = createTrainingLoadout();
    for (const tank of this.tanks) {
      tank.ammo = { ...infiniteAmmo };
      tank.selectedWeaponId = 'basic_shell';
    }
    restoreTrainingTarget(this.tanks[1]);
    this.shopOpen = false;
    this.turnHint = {
      text: '训练场：全武器无限弹药 · 靶机无限耐久',
      life: 3,
    };
  }

  private applyInventoriesToTanks(): void {
    this.tanks.forEach((tank, index) => {
      tank.ammo = { ...this.inventories[index] };
      tank.selectedWeaponId = 'basic_shell';
    });
  }

  private openShop(previousWinner: number): void {
    this.credits = [
      awardRoundCredits(this.credits[0], previousWinner === 0),
      awardRoundCredits(this.credits[1], previousWinner === 1),
    ];
    if (this.mode === 'online' || !this.variant.shopEnabled) {
      this.shopOpen = false;
      return;
    }
    this.shopOpen = true;
    this.shopPlayer = 0;
    this.showCurrentShop();
  }

  private showCurrentShop(): void {
    this.shopPanel?.destroy();
    this.shopPanel = null;
    if (this.shopPlayer === 1 && this.game.settings.opponentMode === 'ai') {
      const weaponId = chooseAIShopItem(this.credits[1], this.inventories[1], {
        distance: Math.abs(this.tanks[1].x - this.tanks[0].x),
        windStrength: this.wind.value,
        difficulty: this.game.settings.aiDifficulty,
      });
      if (weaponId) this.buyShopWeapon(1, weaponId);
      this.finishShopPlayer();
      return;
    }
    const parent = this.game.canvas.parentElement!;
    this.shopPanel = new ShopPanel(
      parent,
      () => ({
        playerIndex: this.shopPlayer,
        playerName: this.tanks[this.shopPlayer].name,
        credits: this.credits[this.shopPlayer],
        ammo: this.inventories[this.shopPlayer],
        gameNumber: this.gameNumber,
      }),
      (weaponId) => this.buyShopWeapon(this.shopPlayer, weaponId),
      () => this.finishShopPlayer()
    );
  }

  private buyShopWeapon(playerIndex: number, weaponId: string): void {
    const result = purchaseWeapon(this.credits[playerIndex], this.inventories[playerIndex], weaponId);
    if (!result.success) {
      audioSystem.tankHit();
      return;
    }
    this.credits[playerIndex] = result.credits;
    this.inventories[playerIndex] = result.ammo;
    this.tanks[playerIndex].ammo = { ...result.ammo };
    audioSystem.click();
  }

  private finishShopPlayer(): void {
    this.shopPanel?.destroy();
    this.shopPanel = null;
    if (this.shopPlayer === 0) {
      this.shopPlayer = 1;
      this.showCurrentShop();
      return;
    }
    this.shopOpen = false;
    this.turnHint = { text: `第 ${this.gameNumber} 局开始！`, life: 1.4 };
    this.game.mobile.clearAll();
  }

  private finishMatch(): void {
    // 先清除标志，避免 gotoResult 前同一帧重复提交结果。
    this.roundEnding = false;
    const winnerIndex = this.matchWins[0] >= MATCH_WINS_REQUIRED ? 0 : 1;
    const stats: MissionStats = {
      variantId: this.variant.id,
      totalRounds: this.totalTurns,
      gamesPlayed: this.gamesPlayed,
      matchWins: [...this.matchWins],
      winnerIndex,
      isDraw: false,
      tanks: this.tanks.map((t, index) => ({
        name: t.name,
        damageDealt: this.aggregateStats[index].damageDealt,
        hitCount: this.aggregateStats[index].hitCount,
        directHitCount: this.aggregateStats[index].directHitCount,
        isAlive: t.isAlive,
      })),
    };
    this.game.gotoResult(stats, this.seed);
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    const game = this.game;
    this.wind = this.turn.wind;
    this.projectileSystem.setWind(this.wind);
    this.renderer.renderScene(
      ctx,
      game.camera,
      game.terrain,
      game.particles,
      this.turn,
      this.projectileSystem,
      this.tanks,
      this.wind || { value: 0, displayStrength: 0 },
      game.settings.showTrajectory,
      game.settings.reducedMotion,
      this.turnHint,
      alpha,
      game.dpr,
      this.mouseAimPoint,
      {
        lavaLevel: this.lavaLevel,
        shotHistory: game.settings.showShotHistory
          ? this.shotHistory.get(this.turn.currentPlayer)
          : [],
        nextLavaLevel: this.nextLavaLevel(),
        hintAccent: PLAYER_COLORS[this.turn.currentPlayer] ?? COLORS.Accent,
      }
    );
    if (!this.tanks[this.turn.currentPlayer]) return;
    ctx.save();
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    this.hud.render(ctx, game.viewportWidth, game.viewportHeight, {
      tanks: this.tanks,
      currentPlayer: this.turn.currentPlayer,
      phase: this.turn.phase,
      roles: this.tanks.map((tank) => this.roleLabel(tank)),
      credits: this.tanks.map((tank) =>
        this.mode === 'training' || !this.variant.shopEnabled ? null : this.credits[tank.playerIndex]
      ),
      invulnerable: this.tanks.map((tank) => this.mode === 'training' && isTrainingTarget(tank)),
      matchWins: this.matchWins,
      winsRequired: this.mode === 'training' ? 0 : MATCH_WINS_REQUIRED,
      title: this.mode === 'training'
        ? '训练场'
        : `第 ${this.gameNumber}/${MATCH_MAX_GAMES} 局  ${this.matchWins[0]} : ${this.matchWins[1]}`,
      roundLabel: this.mode === 'training'
        ? `第 ${this.turn.roundCount} 发`
        : `回合 ${Math.min(this.turn.roundCount, this.variant.maxTurnsPerGame)}/${this.variant.maxTurnsPerGame}`,
      variant: this.mode === 'training'
        ? { ...this.variant, displayName: '训练场', englishName: 'TARGET RANGE', accent: '#ffe169' }
        : this.variant,
      wind: this.wind,
      timer: this.turn.turnTimeLimit > 0 && this.turn.phase === 'PLAYER_CONTROL' ? this.turn.turnTimer : null,
      // 触控布局下不显示键盘操作提示
      hint: this.touchControls.isVisible && this.turn.phase === 'PLAYER_CONTROL' && !this.isAITurn()
        ? ''
        : this.getPhaseHint(),
      compact: this.touchControls.isVisible,
    });
    ctx.restore();
  }

  private roleLabel(tank: Tank): string {
    if (this.mode === 'training' && isTrainingTarget(tank)) return 'BOT';
    if (tank.playerIndex === 1 && this.game.settings.opponentMode === 'ai' && this.mode !== 'online') {
      return this.game.settings.aiDifficulty === 'elite' ? '精英 AI' : 'AI';
    }
    return `P${tank.playerIndex + 1}`;
  }

  private getPhaseHint(): string {
    switch (this.turn.phase) {
      case 'TURN_START':
        return this.mode === 'training' ? '准备下一发...' : '回合开始';
      case 'PLAYER_CONTROL':
        return this.mode === 'training'
          ? '训练场：全武器 ∞  · Tab 切换 · 靶机无限耐久 · Esc 退出'
          : this.isAITurn()
          ? `${this.game.settings.aiDifficulty === 'elite' ? '精英' : '普通'} AI 小模型正在判断并瞄准…`
          : '←/→ 移动  鼠标拖动瞄准  滚轮调力度  空格发射  Tab 切换武器';
      case 'PROJECTILE_FLYING':
        return this.projectileSystem.hasControllableCluster(this.tanks[this.turn.currentPlayer]?.id ?? '')
          ? '集束弹飞行中：再次按空格 / 发射键释放子弹'
          : '炮弹飞行中...';
      case 'EXPLOSION':
        return '爆炸中...';
      case 'DAMAGE_RESOLUTION':
        return '伤害结算...';
      case 'TERRAIN_SETTLING':
        return '地形稳定中...';
      case 'TURN_END':
        return this.mode === 'training' ? '重置训练回合...' : '切换玩家...';
      default:
        return '';
    }
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    if (isFormElement(e.target)) return false;
    if (e.key === 'Escape') {
      if (this.mode === 'online') return true;
      this.paused = true;
      this.game.gotoPause();
      return true;
    }
    if (e.key.toLowerCase() === 'r' && this.turn.phase === 'GAME_OVER') {
      if (this.mode === 'online') return true;
      this.game.gotoBattle(this.mode);
    }
    return false;
  }
  handleKeyUp(_e: KeyboardEvent): boolean {
    return false;
  }
  handlePointerDown(x: number, y: number, id: number): boolean {
    if (this.turn.phase !== 'PLAYER_CONTROL' || this.isAITurn() || this.isRemoteTurn()) return false;
    this.aimPointerId = id;
    this.updateMouseAim(x, y);
    return true;
  }
  handlePointerMove(x: number, y: number, id: number): boolean {
    if (this.turn.phase !== 'PLAYER_CONTROL' || this.isAITurn() || this.isRemoteTurn()) return false;
    if (this.aimPointerId !== null && this.aimPointerId !== id) return false;
    this.updateMouseAim(x, y);
    return true;
  }
  handlePointerUp(_x: number, _y: number, id: number): boolean {
    if (this.aimPointerId !== id) return false;
    this.aimPointerId = null;
    return true;
  }
  handleWheel(e: WheelEvent): boolean {
    if (this.turn.phase !== 'PLAYER_CONTROL' || this.isAITurn() || this.isRemoteTurn()) return false;
    const tank = this.tanks[this.turn.currentPlayer];
    if (!tank?.isAlive) return false;
    const unit = e.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? this.game.viewportHeight
        : 1;
    // 向上滚提高力度，向下滚降低；限制单次变化，兼容滚轮和触控板。
    const delta = clamp(-e.deltaY * unit * 0.5, -60, 60);
    tank.power = clamp(tank.power + delta, POWER_RANGE.min, POWER_RANGE.max);
    return true;
  }
  resize(_w: number, _h: number): void {
    this.touchControls.autoShow();
    this.updateLandscape();
  }

  destroy(): void {
    this.shopPanel?.destroy();
    this.shopPanel = null;
    this.battleHud.destroy();
    this.touchControls.destroy();
    this.landscapeHint?.remove();
    this.game.mobile.clearAll();
    this.aimPointerId = null;
    this.mouseAimPoint = null;
  }

  exit(): void {
    // 暂停场景会临时切走；战斗 UI 必须保留，以便继续游戏时恢复。
  }

  resumeFromPause(): void {
    this.paused = false;
  }

  private updateMouseAim(screenX: number, screenY: number): void {
    const tank = this.tanks[this.turn.currentPlayer];
    if (!tank?.isAlive) return;
    const point = this.game.camera.screenToWorld(screenX, screenY);
    const originY = tank.y - TANK_CONFIG.bodyHeight;
    const dx = point.x - tank.x;
    const dy = point.y - originY;
    let angle = radToDeg(Math.atan2(-dy, dx));
    // 炮管只能指向上半球；鼠标落到坦克下方时保持水平朝向。
    if (angle < 0) angle = dx < 0 ? ANGLE_RANGE.max : ANGLE_RANGE.min;
    tank.turretAngle = clamp(angle, ANGLE_RANGE.min, ANGLE_RANGE.max);
    this.mouseAimPoint = point;
  }
}
