import type { Game, Scene } from '../core/Game';
import { MainMenu } from '../ui/MainMenu';
import { SettingsPanel } from '../ui/SettingsPanel';
import type { GameSettings } from '../types';

interface HelpData {
  keys: Array<{ k: string; d: string }>;
}

const HELP: HelpData = {
  keys: [
    { k: '← / →', d: '向左 / 向右移动' },
    { k: '鼠标拖动', d: '鼠标与坦克连线控制炮管方向' },
    { k: 'Q', d: '降低发射力度' },
    { k: 'E', d: '提高发射力度' },
    { k: '空格', d: '发射' },
    { k: 'Tab', d: '切换武器' },
    { k: 'Esc', d: '暂停 / 继续' },
    { k: 'R', d: '游戏结束后重新开始' },
  ],
};

export class MainMenuScene implements Scene {
  private game: Game;
  private menu: MainMenu;
  private settings: SettingsPanel;
  private helpOverlay: HTMLElement;
  private aboutOverlay: HTMLElement;
  private landscapeHint: HTMLElement;

  constructor(game: Game) {
    this.game = game;
    const parent = game.canvas.parentElement!;
    this.menu = new MainMenu(parent, game.settings, {
      onPlay: () => this.startBattle(),
      onSettings: () => this.settings.show(),
      onHelp: () => this.showOverlay(this.helpOverlay),
      onAbout: () => this.showOverlay(this.aboutOverlay),
    });
    this.settings = new SettingsPanel(parent, game.settings, (s) => this.onSettingsChange(s));
    this.helpOverlay = this.createOverlay(this.renderHelp());
    this.aboutOverlay = this.createOverlay(this.renderAbout());
    this.landscapeHint = this.createLandscapeHint();
    parent.appendChild(this.helpOverlay);
    parent.appendChild(this.aboutOverlay);
    parent.appendChild(this.landscapeHint);
    this.menu.show();
    this.updateLandscape();
  }

  private onSettingsChange(s: GameSettings): void {
    this.game.settings = s;
    this.game.saveSettings();
    this.menu.updatePlayers(s);
  }

  private startBattle(): void {
    // 销毁 UI
    this.menu.hide();
    this.menu.destroy();
    this.settings.hide();
    this.helpOverlay.remove();
    this.aboutOverlay.remove();
    this.landscapeHint.remove();
    this.game.gotoBattle();
  }

  private createOverlay(inner: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'modal-overlay hidden';
    el.innerHTML = inner;
    el.addEventListener('click', (e) => {
      // 点击外层背景或任意 .modal-action 内按钮均可关闭
      const target = e.target as HTMLElement;
      if (e.target === el) {
        el.classList.add('hidden');
        return;
      }
      const btn = target.closest('.modal-overlay-close') as HTMLElement | null;
      if (btn) {
        el.classList.add('hidden');
      }
    });
    return el;
  }

  private showOverlay(el: HTMLElement): void {
    el.classList.remove('hidden');
  }

  private renderHelp(): string {
    return `
      <div class="modal help-panel">
        <h2>操作说明</h2>
        <table class="help-table">
          ${HELP.keys.map((k) => `<tr><td><kbd>${k.k}</kbd></td><td>${k.d}</td></tr>`).join('')}
        </table>
        <p class="help-tip">移动端可使用屏幕底部触控按钮，按钮位置对双方玩家都相同。</p>
        <div class="modal-actions">
          <button class="btn btn-primary modal-overlay-close">确定</button>
        </div>
      </div>
    `;
  }

  private renderAbout(): string {
    return `
      <div class="modal about-panel">
        <h2>关于游戏</h2>
        <p><strong>铁甲对决</strong> 是一款原创的本地双人回合制 2D 坦克炮战游戏。</p>
        <p>支持桌面浏览器与 Android Chrome，可安装为 PWA 离线运行。</p>
        <p>所有美术、武器、音效均为原创程序化生成，不涉及任何现有游戏素材。</p>
        <div class="modal-actions">
          <button class="btn btn-primary modal-overlay-close">确定</button>
        </div>
      </div>
    `;
  }

  private createLandscapeHint(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'landscape-hint hidden';
    el.innerHTML = `<div class="landscape-hint-inner"><div class="rotate-icon">⟳</div>建议横屏游戏</div>`;
    return el;
  }

  private updateLandscape(): void {
    if (window.innerHeight > window.innerWidth) {
      this.landscapeHint.classList.remove('hidden');
    } else {
      this.landscapeHint.classList.add('hidden');
    }
  }

  update(_dt: number): void {}

  render(ctx: CanvasRenderingContext2D, _alpha: number): void {
    // 背景画面：纯 CSS 渲染
    void ctx;
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      if (!this.settings.isShown()) this.settings.show();
      else this.settings.hide();
    }
    return false;
  }
  handleKeyUp(_e: KeyboardEvent): boolean {
    return false;
  }
  handlePointerDown(_x: number, _y: number, _id: number): boolean {
    return false;
  }
  handlePointerMove(_x: number, _y: number, _id: number): boolean {
    return false;
  }
  handlePointerUp(_x: number, _y: number, _id: number): boolean {
    return false;
  }
  resize(_w: number, _h: number): void {
    this.updateLandscape();
  }
  exit(): void {
    this.menu.destroy();
  }
}
