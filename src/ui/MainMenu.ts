// 主菜单 DOM
import type { GameSettings } from '../types';

export interface MainMenuCallbacks {
  onPlay: () => void;
  onTraining: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onAbout: () => void;
}

export class MainMenu {
  root: HTMLElement;
  private cb: MainMenuCallbacks;

  constructor(parent: HTMLElement, settings: GameSettings, cb: MainMenuCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'main-menu';
    this.root.innerHTML = `
      <div class="mm-inner">
        <div class="mm-kicker"><span></span> TACTICAL ARTILLERY SYSTEM <span></span></div>
        <h1 class="mm-title">铁甲对决</h1>
        <div class="mm-version">IRONCLAD // DUEL PROTOCOL</div>
        <p class="mm-subtitle" id="mm-subtitle">${settings.opponentMode === 'ai' ? `单人挑战${settings.aiDifficulty === 'elite' ? '精英' : '普通'} AI` : '本地双人回合制坦克炮战'}</p>
        <div class="mm-players">
          <div class="mm-card p1">
            <div class="mm-tag">P1</div>
            <div class="mm-name" id="mm-p1">${escapeHtml(settings.player1Name)}</div>
          </div>
          <div class="mm-vs"><small>DUEL</small>VS</div>
          <div class="mm-card p2">
            <div class="mm-tag" id="mm-p2-tag">${settings.opponentMode === 'ai' ? 'AI' : 'P2'}</div>
            <div class="mm-name" id="mm-p2">${escapeHtml(settings.player2Name)}</div>
          </div>
        </div>
        <div class="mm-actions">
          <div class="mm-primary-actions">
            <button id="mm-play" class="btn btn-primary btn-large">${settings.opponentMode === 'ai' ? '开始人机对战' : '开始本地双人游戏'}</button>
            <button id="mm-training" class="btn btn-training btn-large">进入训练场</button>
          </div>
          <div class="mm-secondary-actions">
            <button id="mm-settings" class="btn btn-ghost">游戏设置</button>
            <button id="mm-help" class="btn btn-ghost">操作说明</button>
            <button id="mm-about" class="btn btn-ghost">关于游戏</button>
          </div>
        </div>
        <p class="mm-hint" id="mm-hint">${settings.opponentMode === 'ai' ? '你是 P1，AI 将自动操作 P2' : '两人共用同一套按键 / 触控按钮轮流操作'}</p>
      </div>
    `;
    parent.appendChild(this.root);
    this.bind();
  }

  updatePlayers(settings: GameSettings): void {
    const p1 = this.root.querySelector<HTMLElement>('#mm-p1');
    const p2 = this.root.querySelector<HTMLElement>('#mm-p2');
    if (p1) p1.textContent = settings.player1Name;
    if (p2) p2.textContent = settings.player2Name;
    const tag = this.root.querySelector<HTMLElement>('#mm-p2-tag');
    const subtitle = this.root.querySelector<HTMLElement>('#mm-subtitle');
    const play = this.root.querySelector<HTMLButtonElement>('#mm-play');
    const hint = this.root.querySelector<HTMLElement>('#mm-hint');
    const ai = settings.opponentMode === 'ai';
    if (tag) tag.textContent = ai ? 'AI' : 'P2';
    if (subtitle) subtitle.textContent = ai ? `单人挑战${settings.aiDifficulty === 'elite' ? '精英' : '普通'} AI` : '本地双人回合制坦克炮战';
    if (play) play.textContent = ai ? '开始人机对战' : '开始本地双人游戏';
    if (hint) hint.textContent = ai
      ? `你是 P1，${settings.aiDifficulty === 'elite' ? '精英 AI 会按武器与风向独立判断弹道' : '普通 AI 保留较明显的人类化误差'}`
      : '两人共用同一套按键 / 触控按钮轮流操作';
  }

  private bind(): void {
    this.root.querySelector<HTMLButtonElement>('#mm-play')!.addEventListener('click', () => this.cb.onPlay());
    this.root.querySelector<HTMLButtonElement>('#mm-training')!.addEventListener('click', () => this.cb.onTraining());
    this.root.querySelector<HTMLButtonElement>('#mm-settings')!.addEventListener('click', () => this.cb.onSettings());
    this.root.querySelector<HTMLButtonElement>('#mm-help')!.addEventListener('click', () => this.cb.onHelp());
    this.root.querySelector<HTMLButtonElement>('#mm-about')!.addEventListener('click', () => this.cb.onAbout());
  }

  show(): void {
    this.root.style.display = '';
  }
  hide(): void {
    this.root.style.display = 'none';
  }
  destroy(): void {
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
