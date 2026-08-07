import type { GameSettings } from '../types';

// 输入管理器：统一键盘连续按键状态
// 不直接处理 UI 事件，仅维护"哪些键被按下"
export class InputManager {
  private pressed = new Set<string>();
  private listeners: Array<() => void> = [];
  private keyDownHandler?: (e: KeyboardEvent) => void;
  private keyUpHandler?: (e: KeyboardEvent) => void;
  private blurHandler?: () => void;

  attach(target: Window): void {
    this.keyDownHandler = (e: KeyboardEvent) => {
      this.pressed.add(e.key.toLowerCase());
    };
    this.keyUpHandler = (e: KeyboardEvent) => {
      this.pressed.delete(e.key.toLowerCase());
    };
    this.blurHandler = () => {
      this.pressed.clear();
    };
    target.addEventListener('keydown', this.keyDownHandler, { passive: false });
    target.addEventListener('keyup', this.keyUpHandler, { passive: false });
    window.addEventListener('blur', this.blurHandler);
  }

  detach(target: Window): void {
    if (this.keyDownHandler) target.removeEventListener('keydown', this.keyDownHandler);
    if (this.keyUpHandler) target.removeEventListener('keyup', this.keyUpHandler);
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);
    this.pressed.clear();
  }

  isDown(key: string): boolean {
    return this.pressed.has(key.toLowerCase());
  }

  clearAll(): void {
    this.pressed.clear();
  }
}

// 阻止滚动等默认行为的相关按键
export function shouldPreventDefault(key: string): boolean {
  const k = key.toLowerCase();
  return k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === 'tab';
}

export function isFormElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

// 移动控制映射的辅助
export function readMovementInput(input: InputManager): -1 | 0 | 1 {
  if (input.isDown('arrowleft')) return -1;
  if (input.isDown('arrowright')) return 1;
  return 0;
}

export function readAimInput(input: InputManager): -1 | 0 | 1 {
  void input;
  return 0;
}

export function shouldFire(input: InputManager): boolean {
  return input.isDown(' ');
}

export function shouldCycleWeapon(input: InputManager, settings: GameSettings): boolean {
  void settings;
  return input.isDown('tab');
}
