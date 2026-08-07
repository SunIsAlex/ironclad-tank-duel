// 固定逻辑步长 + 渲染插值的主循环
// 使用 requestAnimationFrame，离开页面时暂停

export interface LoopContext {
  dt: number; // 固定步长（秒）
  alpha: number; // 插值系数 [0,1]
  totalDelta: number; // 实际帧时间
}

export class GameLoop {
  private running = false;
  private rafId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private readonly fixedDt: number;
  private readonly maxFrameSkip: number;
  private updateFn: (ctx: LoopContext) => void;
  private renderFn: (alpha: number) => void;
  private paused = false;
  private visibilityHandler?: () => void;
  private pageHideHandler?: () => void;
  private pageShowHandler?: () => void;

  constructor(opts: {
    fixedStep: number; // 秒
    maxFrameSkip: number;
    update: (ctx: LoopContext) => void;
    render: (alpha: number) => void;
  }) {
    this.fixedDt = opts.fixedStep;
    this.maxFrameSkip = opts.maxFrameSkip;
    this.updateFn = opts.update;
    this.renderFn = opts.render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    // 页面可能在启动前就处于后台（例如从最近任务恢复），先保持暂停，
    // 等 visibilitychange/pageshow 再以新的时间基准继续。
    this.paused = document.hidden;
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.pause();
      } else {
        // Android Chrome 通常会暂停 rAF，恢复后若不清零时间基准，
        // 首帧会积累一大段过期时间并把回合状态机推进到异常状态。
        this.resume();
      }
    };
    this.pageHideHandler = () => this.pause();
    this.pageShowHandler = () => {
      if (!document.hidden) this.resume();
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('pagehide', this.pageHideHandler);
    window.addEventListener('pageshow', this.pageShowHandler);
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
    if (this.pageHideHandler) {
      window.removeEventListener('pagehide', this.pageHideHandler);
      this.pageHideHandler = undefined;
    }
    if (this.pageShowHandler) {
      window.removeEventListener('pageshow', this.pageShowHandler);
      this.pageShowHandler = undefined;
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    // 某些 Android WebView 在熄屏期间会丢弃待执行的 rAF；确保恢复时
    // 至少重新挂起一帧，避免循环永久停在 paused 状态。
    if (this.running && this.rafId === null) {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  private tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);
    if (this.paused) {
      this.renderFn(1);
      return;
    }
    const now = performance.now();
    let frameDelta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameDelta > 0.25) frameDelta = 0.25; // 防止切后台后超大帧

    this.accumulator += frameDelta;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxFrameSkip) {
      this.updateFn({ dt: this.fixedDt, alpha: 0, totalDelta: frameDelta });
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps === this.maxFrameSkip) {
      this.accumulator = 0;
    }
    const alpha = this.accumulator / this.fixedDt;
    this.renderFn(alpha);
  };
}
