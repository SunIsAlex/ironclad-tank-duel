// 顶层游戏协调器：管理场景、循环、共享系统实例
import { GameLoop } from './GameLoop';
import { SceneManager, type Scene } from './SceneManager';
import { audioSystem } from '../systems/AudioSystem';
import { saveSystem } from '../systems/SaveSystem';
import type { GameMode, GameSettings } from '../types';
import { DEFAULT_SETTINGS } from '../config/gameConfig';
import { InputManager, isFormElement, shouldPreventDefault } from '../systems/InputManager';
import { MobileControls } from '../systems/MobileControls';
import { MainMenuScene } from '../scenes/MainMenuScene';
import { BattleScene } from '../scenes/BattleScene';
import { PauseScene } from '../scenes/PauseScene';
import { ResultScene } from '../scenes/ResultScene';
import { WORLD_CONFIG } from '../config/gameConfig';
import { CameraSystem } from '../systems/CameraSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { DamageSystem } from '../systems/DamageSystem';
import { TerrainSystem } from '../systems/TerrainSystem';
import { clampedPixelRatio } from '../utils/device';
import type { MissionStats } from '../types';

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr = 1;
  viewportWidth = 800;
  viewportHeight = 480;
  settings: GameSettings;
  loop: GameLoop;
  sceneMgr = new SceneManager();
  input = new InputManager();
  mobile = new MobileControls();
  camera: CameraSystem;
  particles = new ParticleSystem();
  collision = new CollisionSystem();
  damageSystem = new DamageSystem();
  terrain = new TerrainSystem();
  // 共享引用，便于场景间通信
  battle?: BattleScene;
  pauseScene?: PauseScene;
  resultScene?: ResultScene;
  menuScene?: MainMenuScene;
  private keyDownHandler?: (e: KeyboardEvent) => void;
  private keyUpHandler?: (e: KeyboardEvent) => void;
  private resizeHandler?: () => void;
  private pointerDownHandler?: (e: PointerEvent) => void;
  private pointerMoveHandler?: (e: PointerEvent) => void;
  private pointerUpHandler?: (e: PointerEvent) => void;
  private pointerCancelHandler?: (e: PointerEvent) => void;
  private wheelHandler?: (e: WheelEvent) => void;
  private visibilityHandler?: () => void;
  private pageHideHandler?: () => void;
  private pageShowHandler?: () => void;
  private visualViewportResizeHandler?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
    this.ctx = ctx;
    this.settings = saveSystem.loadSettings();
    this.camera = new CameraSystem(WORLD_CONFIG.worldWidth, WORLD_CONFIG.worldHeight);
    this.applySettings();
    this.loop = new GameLoop({
      fixedStep: 1 / 60,
      maxFrameSkip: 5,
      update: (c) => this.sceneMgr.callUpdate(c.dt),
      render: (a) => this.render(a),
    });

    this.bindEvents();
    this.resize();
  }

  applySettings(): void {
    audioSystem.setMasterVolume(this.settings.musicVolume);
    audioSystem.setSfxVolume(this.settings.sfxVolume);
    audioSystem.setMusicVolume(this.settings.musicVolume);
    this.camera.screenShakeEnabled = this.settings.screenShake;
    this.camera.reducedMotion = this.settings.reducedMotion;
    this.particles.setQuality(this.settings.reducedMotion ? 'low' : 'high');
  }

  start(): void {
    this.input.attach(window);
    this.gotoMenu(false);
    this.loop.start();
  }

  saveSettings(): void {
    saveSystem.saveSettings(this.settings);
    this.applySettings();
  }

  gotoMenu(fromScene = true): void {
    if (fromScene) {
      this.battle?.destroy();
      this.battle = undefined;
    }
    const menu = new MainMenuScene(this);
    this.menuScene = menu;
    this.sceneMgr.change(menu);
  }

  gotoBattle(mode: GameMode = 'duel'): void {
    audioSystem.init();
    audioSystem.resume();
    if (this.battle) {
      this.battle.destroy();
    }
    const battle = new BattleScene(this, mode);
    this.battle = battle;
    this.sceneMgr.change(battle);
  }

  gotoPause(): void {
    if (!this.battle) return;
    const pause = new PauseScene(this);
    this.pauseScene = pause;
    this.sceneMgr.change(pause);
  }

  gotoResult(stats: MissionStats, seed: string): void {
    this.battle?.destroy();
    const r = new ResultScene(this, stats, seed);
    this.resultScene = r;
    this.sceneMgr.change(r);
  }

  private bindEvents(): void {
    this.keyDownHandler = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return;
      if (shouldPreventDefault(e.key)) e.preventDefault();
      audioSystem.init();
      audioSystem.resume();
      this.sceneMgr.callKeyDown(e);
    };
    this.keyUpHandler = (e: KeyboardEvent) => {
      if (isFormElement(e.target)) return;
      this.sceneMgr.callKeyUp(e);
    };
    this.resizeHandler = () => this.resize();
    this.pointerDownHandler = (e: PointerEvent) => {
      audioSystem.init();
      audioSystem.resume();
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.sceneMgr.callPointerDown(x, y, e.pointerId);
    };
    this.pointerMoveHandler = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.sceneMgr.callPointerMove(x, y, e.pointerId);
    };
    this.pointerUpHandler = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.sceneMgr.callPointerUp(x, y, e.pointerId);
    };
    this.pointerCancelHandler = (e: PointerEvent) => {
      this.mobile.clearAll();
    };
    this.wheelHandler = (e: WheelEvent) => {
      if (this.sceneMgr.callWheel(e)) e.preventDefault();
    };

    window.addEventListener('keydown', this.keyDownHandler, { passive: false });
    window.addEventListener('keyup', this.keyUpHandler, { passive: false });
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('orientationchange', this.resizeHandler);
    window.addEventListener('pointercancel', this.pointerCancelHandler);
    this.canvas.addEventListener('pointerdown', this.pointerDownHandler);
    this.canvas.addEventListener('pointermove', this.pointerMoveHandler);
    this.canvas.addEventListener('pointerup', this.pointerUpHandler);
    this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

    // 阻止默认触摸行为
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // 熄屏/切后台时必须清空所有持续输入；Android 不一定派发 keyup 或
    // pointerup。恢复时重新测量 viewport，适配浏览器工具栏高度变化。
    this.visibilityHandler = () => {
      this.mobile.clearAll();
      this.input.clearAll();
      if (!document.hidden) this.resize();
    };
    this.pageHideHandler = () => {
      this.mobile.clearAll();
      this.input.clearAll();
    };
    this.pageShowHandler = () => {
      this.mobile.clearAll();
      this.input.clearAll();
      this.resize();
    };
    this.visualViewportResizeHandler = () => this.resize();
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pagehide', this.pageHideHandler);
    window.addEventListener('pageshow', this.pageShowHandler);
    window.visualViewport?.addEventListener('resize', this.visualViewportResizeHandler);
  }

  resize(): void {
    const host = this.canvas.parentElement ?? document.body;
    // Android Chrome 在熄屏恢复后会先恢复浏览器工具栏，此时布局视口的
    // 高度可能仍是旧值。使用 visualViewport，避免底部触控区落到屏幕外。
    const visualViewport = window.visualViewport;
    const w = Math.round(visualViewport?.width || window.innerWidth || host.clientWidth);
    const h = Math.round(visualViewport?.height || window.innerHeight || host.clientHeight);
    host.style.width = `${w}px`;
    host.style.height = `${h}px`;
    this.viewportWidth = w;
    this.viewportHeight = h;
    this.dpr = clampedPixelRatio();
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.setViewport(w, h);
    this.sceneMgr.callResize(w, h);
  }

  private render(alpha: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0c1a2b';
    ctx.fillRect(0, 0, this.viewportWidth, this.viewportHeight);
    this.sceneMgr.callRender(ctx, alpha);
  }

  destroy(): void {
    this.loop.stop();
    this.input.detach(window);
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) window.removeEventListener('keyup', this.keyUpHandler);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    if (this.pointerDownHandler) this.canvas.removeEventListener('pointerdown', this.pointerDownHandler);
    if (this.pointerMoveHandler) this.canvas.removeEventListener('pointermove', this.pointerMoveHandler);
    if (this.pointerUpHandler) this.canvas.removeEventListener('pointerup', this.pointerUpHandler);
    if (this.wheelHandler) this.canvas.removeEventListener('wheel', this.wheelHandler);
    if (this.pointerCancelHandler) window.removeEventListener('pointercancel', this.pointerCancelHandler);
    if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    if (this.pageHideHandler) window.removeEventListener('pagehide', this.pageHideHandler);
    if (this.pageShowHandler) window.removeEventListener('pageshow', this.pageShowHandler);
    if (this.visualViewportResizeHandler) {
      window.visualViewport?.removeEventListener('resize', this.visualViewportResizeHandler);
    }
    this.sceneMgr.clear();
    audioSystem.dispose();
  }
}

export type { Scene };
export { DEFAULT_SETTINGS };
