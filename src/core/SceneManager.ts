// 场景管理器
export interface Scene {
  enter?(...args: any[]): void;
  exit?(): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, alpha: number): void;
  handlePointerDown?(x: number, y: number, id: number): boolean;
  handlePointerMove?(x: number, y: number, id: number): boolean;
  handlePointerUp?(x: number, y: number, id: number): boolean;
  handleWheel?(e: WheelEvent): boolean;
  handleKeyDown?(e: KeyboardEvent): boolean;
  handleKeyUp?(e: KeyboardEvent): boolean;
  resize?(w: number, h: number): void;
}

export class SceneManager {
  private current: Scene | null = null;
  private next: Scene | null = null;
  private nextArgs: any[] = [];

  get currentScene(): Scene | null {
    return this.current;
  }

  change(scene: Scene, ...args: any[]): void {
    this.next = scene;
    this.nextArgs = args;
  }

  flush(): void {
    if (this.next) {
      if (this.current?.exit) this.current.exit();
      this.current = this.next;
      if (this.current.enter) this.current.enter(...this.nextArgs);
      this.next = null;
      this.nextArgs = [];
    }
  }

  callUpdate(dt: number): void {
    this.flush();
    if (this.current) this.current.update(dt);
  }

  callRender(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (this.current) this.current.render(ctx, alpha);
  }

  callResize(w: number, h: number): void {
    if (this.current?.resize) this.current.resize(w, h);
  }

  callKeyDown(e: KeyboardEvent): boolean {
    return this.current?.handleKeyDown ? this.current.handleKeyDown(e) : false;
  }

  callKeyUp(e: KeyboardEvent): boolean {
    return this.current?.handleKeyUp ? this.current.handleKeyUp(e) : false;
  }

  callPointerDown(x: number, y: number, id: number): boolean {
    return this.current?.handlePointerDown ? this.current.handlePointerDown(x, y, id) : false;
  }

  callPointerMove(x: number, y: number, id: number): boolean {
    return this.current?.handlePointerMove ? this.current.handlePointerMove(x, y, id) : false;
  }

  callPointerUp(x: number, y: number, id: number): boolean {
    return this.current?.handlePointerUp ? this.current.handlePointerUp(x, y, id) : false;
  }

  callWheel(e: WheelEvent): boolean {
    return this.current?.handleWheel ? this.current.handleWheel(e) : false;
  }

  clear(): void {
    if (this.current?.exit) this.current.exit();
    this.current = null;
    this.next = null;
  }
}
