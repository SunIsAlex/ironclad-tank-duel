// 统一的触控/鼠标按钮状态管理
// 与 DOM UI 配合：每个按钮元素挂载数据 key，按下时记录状态

export type ControlAction =
  | 'left'
  | 'right'
  | 'aimUp'
  | 'aimDown'
  | 'powerUp'
  | 'powerDown'
  | 'fire'
  | 'switchWeapon'
  | 'pause';

export interface PointerRecord {
  pointerId: number;
  action: ControlAction;
  target: HTMLElement;
}

export class MobileControls {
  private active = new Map<number, PointerRecord>();
  private actionSet = new Set<ControlAction>();
  // 单次触发记录（每帧消费）
  private oneShotQueue: ControlAction[] = [];
  private listeners: Array<() => void> = [];
  private bound = false;

  // 注册一个按钮元素
  bindButton(el: HTMLElement, action: ControlAction, isOneShot: boolean): void {
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      this.active.set(e.pointerId, { pointerId: e.pointerId, action, target: el });
      if (isOneShot) {
        this.oneShotQueue.push(action);
      } else {
        this.actionSet.add(action);
      }
      this.notify();
    };
    const onUp = (e: PointerEvent) => {
      e.preventDefault();
      const rec = this.active.get(e.pointerId);
      if (rec) {
        this.actionSet.delete(rec.action);
        this.active.delete(e.pointerId);
        this.notify();
      }
    };
    const onCancel = (e: PointerEvent) => {
      const rec = this.active.get(e.pointerId);
      if (rec) {
        this.actionSet.delete(rec.action);
        this.active.delete(e.pointerId);
        this.notify();
      }
    };
    el.addEventListener('pointerdown', onDown as EventListener);
    el.addEventListener('pointerup', onUp as EventListener);
    el.addEventListener('pointercancel', onCancel as EventListener);
    // 离开按钮也算释放
    el.addEventListener('pointerleave', (e: PointerEvent) => {
      if (this.active.has(e.pointerId)) {
        const rec = this.active.get(e.pointerId)!;
        this.actionSet.delete(rec.action);
        this.active.delete(e.pointerId);
        this.notify();
      }
    });
    // 防止上下文菜单
    el.addEventListener('contextmenu', (e: Event) => e.preventDefault());
  }

  isActionDown(a: ControlAction): boolean {
    return this.actionSet.has(a);
  }

  // 消费一次触发的动作
  consumeOneShots(): ControlAction[] {
    const a = this.oneShotQueue;
    this.oneShotQueue = [];
    return a;
  }

  clearAll(): void {
    this.active.clear();
    this.actionSet.clear();
    this.oneShotQueue.length = 0;
    this.notify();
  }

  onChange(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
