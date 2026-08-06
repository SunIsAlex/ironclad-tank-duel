// 通用对象池，减少 GC 压力

export class ObjectPool<T> {
  private free: T[] = [];
  private active: T[] = [];
  private factory: () => T;
  private resetFn: (obj: T) => void;

  constructor(factory: () => T, resetFn: (obj: T) => void, initialSize = 0) {
    this.factory = factory;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) {
      this.free.push(factory());
    }
  }

  acquire(): T {
    const obj = this.free.pop() ?? this.factory();
    this.active.push(obj);
    return obj;
  }

  release(obj: T): void {
    const idx = this.active.indexOf(obj);
    if (idx >= 0) {
      this.active.splice(idx, 1);
      this.resetFn(obj);
      this.free.push(obj);
    }
  }

  releaseAll(): void {
    for (const obj of this.active) {
      this.resetFn(obj);
      this.free.push(obj);
    }
    this.active.length = 0;
  }

  getActive(): T[] {
    return this.active;
  }

  getActiveCount(): number {
    return this.active.length;
  }

  forEachActive(cb: (obj: T, index: number) => void): void {
    const arr = this.active;
    for (let i = 0; i < arr.length; i++) {
      cb(arr[i], i);
    }
  }
}
