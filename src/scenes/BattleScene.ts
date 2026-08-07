import type { Game, Scene } from '../core/Game';
import type { Tank, WindState, MissionStats } from '../types';
import { createTank, consumeAmmo, hasAmmo, cycleWeapon } from '../entities/Tank';
import { TurnManager } from '../systems/TurnManager';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { Renderer } from '../rendering/Renderer';
import { BattleHud } from '../ui/BattleHud';
import { TouchControls } from '../ui/TouchControls';
import { generateRandomSeed } from '../utils/random';
import { clamp, angleToVector, radToDeg } from '../utils/math';
import { POWER_RANGE, ANGLE_RANGE, TANK_CONFIG, WORLD_CONFIG } from '../config/gameConfig';
import { weaponRegistry } from '../weapons/WeaponRegistry';
import { COLORS } from '../core/Constants';
import { isFormElement } from '../systems/InputManager';
import { audioSystem } from '../systems/AudioSystem';
import { planAIShot, type AIShotPlan } from '../systems/AIController';
import { ShopPanel } from '../ui/ShopPanel';
import {
  awardRoundCredits,
  chooseAICombatWeapon,
  chooseAIShopItem,
  createBasicLoadout,
  purchaseWeapon,
} from '../systems/ShopSystem';
import {
  hasWonMatch,
  MATCH_MAX_GAMES,
  MATCH_WINS_REQUIRED,
  MAX_TURNS_PER_GAME,
  nextGameHealth,
  resolveRoundByHealth,
} from '../systems/MatchRules';

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

  constructor(game: Game) {
    this.game = game;
    // 种子
    const settings = game.settings;
    this.nextHealth = [settings.initialHealth, settings.initialHealth];
    this.seed = settings.mapSeed && settings.mapSeed.length > 0 ? settings.mapSeed : generateRandomSeed();
    game.settings.mapSeed = this.seed;
    game.saveSettings();

    // 创建地形（必要时复用 game.terrain）
    game.terrain.generate(this.seed, settings.mapPreset);
    this.renderer = new Renderer(this.seed);

    // 坦克
    const hp = settings.initialHealth;
    const fuel = settings.movementFuel;
    const t1 = createTank('t1', 0, settings.player1Name, 0, 0, hp, fuel, 'basic_shell');
    const t2 = createTank('t2', 1, settings.player2Name, 0, 0, hp, fuel, 'basic_shell');
    this.tanks = [t1, t2];
    this.placeTanks();

    this.wind = { value: 0, displayStrength: 0 };
    this.turn = new TurnManager(this.tanks, game.damageSystem);
    this.turn.turnFuel = fuel;
    this.turn.windStrength = settings.windStrength;
    this.turn.turnTimeLimit = settings.turnTime;
    this.turn.reset(this.tanks);
    this.turn.startGame();

    game.camera.x = this.tanks[0].x;
    game.camera.followTank(this.tanks[0].x, this.tanks[0].y);
    game.camera.y = game.camera.targetY;

    this.projectileSystem = new ProjectileSystem(game.terrain, game.collision, this.tanks, this.wind);
    this.projectileSystem.setWind(this.wind);

    const parent = game.canvas.parentElement!;
    this.battleHud = new BattleHud(parent, game.mobile);
    this.touchControls = new TouchControls(parent, game.mobile);
    this.touchControls.autoShow();
    this.landscapeHint = this.createLandscapeHint();
    parent.appendChild(this.landscapeHint);
    this.updateLandscape();

    this.applyInventoriesToTanks();
    this.openShop(-1);

  }

  private placeTanks(): void {
    const terrain = this.game.terrain;
    const w = terrain.worldWidth;
    // 大地图上扩大出生区间；从多个候选点中挑选相对稳定的落脚处，避免
    // 多样地形把坦克直接生成在尖峰侧面。
    const findSpawn = (minRatio: number, maxRatio: number): number => {
      let bestX = Math.floor(w * (minRatio + Math.random() * (maxRatio - minRatio)));
      let bestSlope = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 24; i++) {
        const x = Math.floor(w * (minRatio + Math.random() * (maxRatio - minRatio)));
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
    this.tanks[0].y = terrain.surfaceY(x1);
    this.tanks[1].x = x2;
    this.tanks[1].y = terrain.surfaceY(x2);
    // 车身角度
    for (const t of this.tanks) {
      const x0 = terrain.surfaceY(t.x - 2);
      const x1n = terrain.surfaceY(t.x + 2);
      t.bodyAngle = Math.atan2((x1n - x0) / 4, 1);
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

    this.turn.updateTimers(dt);
    // TurnManager 在 TURN_START 随机生成新风；每帧同步到弹道系统，
    // 确保新回合的风不会沿用上一回合。
    this.wind = this.turn.wind;
    this.projectileSystem.setWind(this.wind);

    // 状态机驱动
    switch (this.turn.phase) {
      case 'TURN_START':
        // 第 10 次操作已经完整结算；第 11 回合只显示裁决，不再给予控制权。
        if (this.turn.roundCount > MAX_TURNS_PER_GAME) {
          this.resolveTurnLimit();
          return;
        }
        if (this.chestRound !== this.turn.roundCount) {
          this.projectileSystem.spawnRandomChest();
          this.chestRound = this.turn.roundCount;
        }
        if (this.wormholeRound !== this.turn.roundCount) {
          const appeared = this.projectileSystem.spawnWormholesForTurn(0.3);
          this.wormholeRound = this.turn.roundCount;
          if (appeared) this.turnHint = { text: '空间异常：双向黑洞出现！', life: 1.8 };
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
        this.handleClusterDetonation();
        this.projectileSystem.update(dt);
        for (const event of this.projectileSystem.consumeWormholeEvents()) {
          this.game.particles.spawnExplosion(event.entryX, event.entryY, 24, event.color);
          this.game.particles.spawnExplosion(event.exitX, event.exitY, 30, event.color);
          this.game.camera.shake(5, 0.18);
        }
        this.consumeTreasureRewards();
        this.consumeExplosions();
        if (!this.projectileSystem.hasAlive() && this.pendingExplosions.length === 0) {
          // 所有炮弹消失 -> 进入爆炸阶段（如果有未消化的）
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
        this.turn.phaseTimer = Math.min(this.turn.phaseTimer, 0.3);
        break;
      case 'DAMAGE_RESOLUTION':
        break;
      case 'TERRAIN_SETTLING':
        this.updateTanksSettling(dt);
        // 检查胜负
        {
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
    if (input.isDown('escape') || pauseRequested) {
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

    if (weaponSwitchRequested) {
      cycleWeapon(tank, 1);
      // 跳过无弹药武器
      let safety = 10;
      while (!hasAmmo(tank, tank.selectedWeaponId) && safety-- > 0) {
        cycleWeapon(tank, 1);
      }
      audioSystem.click();
    }

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
    if (fireRequested || (fireHeld && !this.firePressed)) {
      this.fire(tank);
    }
    this.firePressed = fireHeld;
  }

  private isAITurn(): boolean {
    return this.game.settings.opponentMode === 'ai' && this.turn.currentPlayer === 1;
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

    if (this.aiPlayer !== this.turn.currentPlayer || !this.aiPlan) {
      this.aiPlayer = this.turn.currentPlayer;
      // 留出观察地形和风向的时间，避免 AI 像脚本一样瞬间完成操作。
      this.aiThinkTimer = 1.1 + Math.random() * 0.9;
      tank.selectedWeaponId = chooseAICombatWeapon(tank.ammo, {
        distance: Math.abs(target.x - tank.x),
        windStrength: this.wind.value,
        difficulty: this.game.settings.aiDifficulty,
      });
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
      const difficultyName = this.game.settings.aiDifficulty === 'elite' ? '精英 AI' : '普通 AI';
      this.turnHint = { text: `${tank.name}（${difficultyName}）正在判断…`, life: 2.5 };
      this.game.mobile.clearAll();
      this.firePressed = false;
      this.weaponCyclePressed = false;
    }

    this.game.camera.followTank(tank.x, tank.y);
    this.aiThinkTimer -= dt;
    const angleDiff = this.aiPlan.angle - tank.turretAngle;
    const angleStep = 42 * dt;
    tank.turretAngle += clamp(angleDiff, -angleStep, angleStep);
    const powerDiff = this.aiPlan.power - tank.power;
    const powerStep = 150 * dt;
    tank.power += clamp(powerDiff, -powerStep, powerStep);

    const aimed = Math.abs(angleDiff) < 0.8 && Math.abs(powerDiff) < 3;
    if (this.aiThinkTimer <= 0 && aimed) {
      const plan = this.aiPlan;
      this.aiPlan = null;
      this.turnHint = { text: `${tank.name}（AI）开火！`, life: 1.1 };
      this.fire(tank);
      // 保留计划值直到进入下一位 AI 的回合，防止同一控制帧重复规划。
      this.aiPlan = plan;
    }
  }

  private fire(tank: Tank): void {
    if (this.turn.phase !== 'PLAYER_CONTROL') return;
    if (!hasAmmo(tank, tank.selectedWeaponId)) {
      audioSystem.tankHit();
      return;
    }
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    consumeAmmo(tank, tank.selectedWeaponId);
    // 计算炮口位置和初速度
    const dir = angleToVector(tank.turretAngle);
    const px = tank.x + dir.x * (TANK_CONFIG.barrelLength + 6);
    const py = tank.y - TANK_CONFIG.bodyHeight + dir.y * (TANK_CONFIG.barrelLength + 6);
    audioSystem.fire();
    this.game.particles.spawnMuzzleFlash(px, py, tank.turretAngle);
    this.projectileSystem.fire(tank, tank.turretAngle, tank.power);
    this.turn.enterProjectileFlying();
  }

  private handleClusterDetonation(): void {
    const owner = this.tanks[this.turn.currentPlayer];
    if (!owner) return;
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
      return;
    }

    const actions = this.game.mobile.consumeOneShots();
    const pauseRequested = actions.includes('pause');
    if (this.game.input.isDown('escape') || pauseRequested) {
      this.paused = true;
      this.game.gotoPause();
      return;
    }
    const spaceNow = this.game.input.isDown(' ');
    const detonateRequested = actions.includes('fire') || (spaceNow && !this.firePressed);
    this.firePressed = spaceNow;
    if (detonateRequested && this.projectileSystem.detonateCluster(owner.id)) {
      this.turnHint = { text: '集束子弹释放！', life: 1 };
      audioSystem.fire();
    }
  }

  private consumeExplosions(): void {
    const explosions = this.projectileSystem.consumePendingExplosions();
    for (const ex of explosions) {
      this.pendingExplosions.push({ ...ex, processed: false });
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
    this.game.particles.spawnDebris(ex.x, ex.y, '#5b3d24', 14);
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
      // 检查死亡 -> 触发爆炸动画
      if (r.killed) {
        this.game.particles.spawnExplosion(tank.x, tank.y - 8, 60, COLORS.Warning);
        this.game.camera.shake(20, 0.6);
      }
    }
  }

  private updateTanksSettling(dt: number): void {
    const terrain = this.game.terrain;
    let anyFalling = false;
    for (const tank of this.tanks) {
      if (!tank.isAlive) continue;
      // 应用重力直到接触地面
      const groundY = terrain.findSupportY(tank.x, tank.y);
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
                tank.health = 0;
                tank.isAlive = false;
                this.game.particles.spawnExplosion(tank.x, tank.y - 8, 60, COLORS.Warning);
              }
            }
          }
          tank.velocityY = 0;
          tank.isGrounded = true;
        }
      } else {
        // 在地表，对齐
        tank.y = groundY;
        tank.velocityY = 0;
        tank.isGrounded = true;
      }
      // 水平击退阻尼
      if (Math.abs(tank.velocityX) > 0.1) {
        tank.x += tank.velocityX * dt;
        tank.x = clamp(tank.x, 12, terrain.worldWidth - 12);
        tank.velocityX *= 0.88;
      } else {
        tank.velocityX = 0;
      }
      // 车身角度跟随
      const x0 = terrain.surfaceY(tank.x - 2);
      const x1n = terrain.surfaceY(tank.x + 2);
      tank.bodyAngle = Math.atan2((x1n - x0) / 4, 1);
    }
    // 仍有下落时延长 TERRAIN_SETTLING
    if (anyFalling) {
      this.turn.phaseTimer = Math.max(this.turn.phaseTimer, 0.4);
    }
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
    this.totalTurns += Math.min(this.turn.roundCount, MAX_TURNS_PER_GAME);
    this.tanks.forEach((tank, index) => {
      this.aggregateStats[index].damageDealt += tank.damageDealt;
      this.aggregateStats[index].hitCount += tank.hitCount;
      this.aggregateStats[index].directHitCount += tank.directHitCount;
      this.inventories[index] = { ...tank.ammo };
    });

    this.nextHealth = nextGameHealth(this.tanks, v.winnerIndex, this.game.settings.initialHealth);
    if (!v.isDraw && v.winnerIndex >= 0) {
      this.matchWins[v.winnerIndex]++;
    }
    this.lastRoundWinner = v.isDraw ? -1 : v.winnerIndex;
    this.matchComplete = hasWonMatch(this.matchWins);

    const reason = decidedByTurnLimit ? '十回合血量裁决' : '击毁对手';
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
    const fuel = settings.movementFuel;
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
      this.mouseAimPoint
    );
    // 顶部 HUD（屏幕坐标）
    const tank = this.tanks[this.turn.currentPlayer];
    if (tank) {
      // 顶部 HUD
      const phaseHint = this.getPhaseHint();
      // 使用 canvas 屏幕坐标绘制 HUD
      ctx.save();
      ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
      this.renderTopHud(ctx, game.viewportWidth);
      this.renderBottomBar(ctx, game.viewportWidth, game.viewportHeight, tank, phaseHint);
      ctx.restore();
    }
  }

  private getPhaseHint(): string {
    switch (this.turn.phase) {
      case 'TURN_START':
        return '回合开始';
      case 'PLAYER_CONTROL':
        return this.isAITurn()
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
        return '切换玩家...';
      default:
        return '';
    }
  }

  private renderTopHud(ctx: CanvasRenderingContext2D, vw: number): void {
    // 委托给 rendering/HudRenderer 的等价实现，简化在此直接绘制
    const h = 56;
    ctx.fillStyle = COLORS.HUDBackground;
    ctx.fillRect(0, 0, vw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, h, vw, 1);

    const drawPlayer = (tank: Tank, x: number, active: boolean): void => {
      const w = 220;
      const hh = 44;
      const y = 6;
      if (active) {
        ctx.strokeStyle = COLORS.Accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, hh + 2);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y, w, hh);
      const color = COLORS.P1 === '#4ec5ff' && tank.playerIndex === 0 ? COLORS.P1 : COLORS.P2;
      ctx.fillStyle = color;
      ctx.fillRect(x + 4, y + 4, 6, hh - 8);
      ctx.fillStyle = COLORS.HUDForeground;
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const role = tank.playerIndex === 1 && this.game.settings.opponentMode === 'ai'
        ? (this.game.settings.aiDifficulty === 'elite' ? '精英AI' : '普通AI')
        : `P${tank.playerIndex + 1}`;
      ctx.fillText(`${tank.name}  ${role}  ◆${this.credits[tank.playerIndex]}${tank.isAlive ? '' : ' †'}`, x + 16, y + 6);
      // 血条
      const barX = x + 16;
      const barY = y + 22;
      const barW = w - 24;
      ctx.fillStyle = '#0b1b2a';
      ctx.fillRect(barX, barY, barW, 8);
      const ratio = Math.max(0, tank.health / tank.maxHealth);
      ctx.fillStyle = ratio > 0.4 ? COLORS.Success : COLORS.Warning;
      ctx.fillRect(barX, barY, barW * ratio, 8);
      ctx.fillStyle = COLORS.HUDForeground;
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.ceil(tank.health)} / ${tank.maxHealth}`, barX, barY + 10);
    };

    drawPlayer(this.tanks[0], 12, this.turn.currentPlayer === 0);
    drawPlayer(this.tanks[1], vw - 232, this.turn.currentPlayer === 1);

    const cx = vw / 2;
    ctx.fillStyle = COLORS.HUDForeground;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`第 ${this.gameNumber}/${MATCH_MAX_GAMES} 局 · ${this.matchWins[0]}:${this.matchWins[1]}`, cx, 8);
    // 风
    const arrow = this.wind.value > 0 ? '→' : this.wind.value < 0 ? '←' : '·';
    ctx.font = '12px monospace';
    ctx.fillText(`回合 ${Math.min(this.turn.roundCount, MAX_TURNS_PER_GAME)}/${MAX_TURNS_PER_GAME} · 风 ${arrow} ${Math.abs(this.wind.value).toFixed(2)}`, cx, 26);
    ctx.fillStyle = this.turn.currentPlayer === 0 ? COLORS.P1 : COLORS.P2;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`当前：${this.tanks[this.turn.currentPlayer]?.name ?? ''}`, cx, 42);
    if (this.turn.turnTimeLimit > 0 && this.turn.phase === 'PLAYER_CONTROL') {
      ctx.fillStyle = this.turn.turnTimer < 5 ? COLORS.Warning : COLORS.Accent;
      ctx.fillText(`剩余 ${Math.ceil(this.turn.turnTimer)}s`, cx, h - 16);
    }
  }

  private renderBottomBar(
    ctx: CanvasRenderingContext2D,
    vw: number,
    vh: number,
    tank: Tank,
    hint: string
  ): void {
    const h = 70;
    const y = vh - h;
    ctx.fillStyle = COLORS.HUDBackground;
    ctx.fillRect(0, y, vw, h);
    ctx.fillStyle = COLORS.HUDForeground;
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const weapon = weaponRegistry.get(tank.selectedWeaponId);
    const ammoStr = tank.ammo[weapon.id] === -1 ? '∞' : `${tank.ammo[weapon.id]}`;
    ctx.fillText(`武器：${weapon.displayName} (${ammoStr})  ${weapon.description}`, 12, y + 8);
    ctx.fillText(`角度：${Math.round(tank.turretAngle)}°`, 12, y + 28);
    ctx.fillText(`力度`, 12, y + 46);
    const pw = vw - 200;
    ctx.fillStyle = '#0b1b2a';
    ctx.fillRect(50, y + 48, pw - 50, 8);
    const ratio = (tank.power - POWER_RANGE.min) / (POWER_RANGE.max - POWER_RANGE.min);
    ctx.fillStyle = COLORS.Accent;
    ctx.fillRect(50, y + 48, (pw - 50) * ratio, 8);
    ctx.fillStyle = COLORS.HUDForeground;
    ctx.fillText(`燃料`, 50, y + 28);
    ctx.fillStyle = '#0b1b2a';
    ctx.fillRect(80, y + 30, 100, 6);
    ctx.fillStyle = COLORS.Success;
    ctx.fillRect(80, y + 30, 100 * (tank.movementFuel / tank.maxFuel), 6);
    ctx.fillStyle = COLORS.Accent;
    ctx.font = '11px monospace';
    ctx.fillText(hint, 12, y + 60);
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    if (isFormElement(e.target)) return false;
    if (e.key === 'Escape') {
      this.paused = true;
      this.game.gotoPause();
      return true;
    }
    if (e.key.toLowerCase() === 'r' && this.turn.phase === 'GAME_OVER') {
      this.game.gotoBattle();
    }
    return false;
  }
  handleKeyUp(_e: KeyboardEvent): boolean {
    return false;
  }
  handlePointerDown(x: number, y: number, id: number): boolean {
    if (this.turn.phase !== 'PLAYER_CONTROL' || this.isAITurn()) return false;
    this.aimPointerId = id;
    this.updateMouseAim(x, y);
    return true;
  }
  handlePointerMove(x: number, y: number, id: number): boolean {
    if (this.turn.phase !== 'PLAYER_CONTROL' || this.isAITurn()) return false;
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
    if (this.turn.phase !== 'PLAYER_CONTROL' || this.isAITurn()) return false;
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
