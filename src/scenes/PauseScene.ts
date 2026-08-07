import type { Game, Scene } from '../core/Game';
import { isFormElement } from '../systems/InputManager';

export class PauseScene implements Scene {
  private game: Game;
  private overlay: HTMLElement;

  constructor(game: Game) {
    this.game = game;
    const parent = game.canvas.parentElement!;
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay pause-overlay';
    this.overlay.innerHTML = `
      <div class="modal pause-panel">
        <h2>暂停</h2>
        <div class="pause-actions">
          <button id="pp-resume" class="btn btn-primary">继续游戏</button>
          <button id="pp-restart" class="btn btn-ghost">重新开始本局</button>
          <button id="pp-menu" class="btn btn-ghost">返回主菜单</button>
          <button id="pp-help" class="btn btn-ghost">操作说明</button>
        </div>
        <div class="pause-tip">音量可在 设置 中调整</div>
      </div>
    `;
    parent.appendChild(this.overlay);
    this.bind();
  }

  private bind(): void {
    this.overlay.querySelector<HTMLButtonElement>('#pp-resume')!.addEventListener('click', () => this.resume());
    this.overlay.querySelector<HTMLButtonElement>('#pp-restart')!.addEventListener('click', () => {
      this.destroy();
      this.game.gotoBattle();
    });
    this.overlay.querySelector<HTMLButtonElement>('#pp-menu')!.addEventListener('click', () => {
      this.destroy();
      this.game.battle?.destroy();
      this.game.battle = undefined;
      this.game.gotoMenu(false);
    });
    this.overlay.querySelector<HTMLButtonElement>('#pp-help')!.addEventListener('click', () => {
      alert('←/→ 移动  鼠标与坦克连线瞄准  滚轮调力度  空格 发射  Tab 切换武器  Esc 暂停  R 游戏结束后重新开始');
    });
  }

  private resume(): void {
    this.destroy();
    this.game.battle?.resumeFromPause();
    this.game.sceneMgr.change(this.game.battle!);
  }

  update(_dt: number): void {}
  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}
  handleKeyDown(e: KeyboardEvent): boolean {
    if (isFormElement(e.target)) return false;
    if (e.key === 'Escape') {
      this.resume();
      return true;
    }
    return false;
  }
  handleKeyUp(): boolean {
    return false;
  }
  handlePointerDown(): boolean {
    return false;
  }
  handlePointerMove(): boolean {
    return false;
  }
  handlePointerUp(): boolean {
    return false;
  }
  resize(): void {}
  exit(): void {
    this.overlay.remove();
  }
  destroy(): void {
    this.overlay.remove();
  }
}
