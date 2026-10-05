// 主菜单 DOM
import type { GameSettings, GameVariantId } from '../types';
import { GAME_VARIANTS, getGameVariant, variantIconSvg } from '../config/gameVariants';

export interface MainMenuCallbacks {
  onPlay: () => void;
  onOnline: () => void;
  onTraining: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onAbout: () => void;
  onVariantChange: (id: GameVariantId) => void;
}

export class MainMenu {
  root: HTMLElement;
  private cb: MainMenuCallbacks;

  constructor(parent: HTMLElement, settings: GameSettings, cb: MainMenuCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'main-menu';
    this.root.innerHTML = `
      <div class="mm-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="mm-inner">
        <header class="mm-header">
          <div class="mm-kicker"><span></span> TACTICAL ARTILLERY SYSTEM <span></span></div>
          <h1 class="mm-title" data-text="铁甲对决">铁甲对决</h1>
          <div class="mm-version">IRONCLAD // DUEL PROTOCOL</div>
        </header>
        <div class="mm-players">
          <div class="mm-card p1">
            <span class="mm-tag">P1</span>
            <span class="mm-name" id="mm-p1">${escapeHtml(settings.player1Name)}</span>
          </div>
          <div class="mm-vs">VS</div>
          <div class="mm-card p2">
            <span class="mm-tag" id="mm-p2-tag"></span>
            <span class="mm-name" id="mm-p2">${escapeHtml(settings.player2Name)}</span>
          </div>
        </div>
        <section class="mm-modes" aria-labelledby="mm-modes-title">
          <div class="mm-section-title" id="mm-modes-title"><span>选择玩法</span><small>GAME MODE</small></div>
          <div class="mm-mode-grid" role="radiogroup" aria-labelledby="mm-modes-title">
            ${GAME_VARIANTS.map((variant) => `
              <button class="mm-mode" role="radio" data-variant="${variant.id}" style="--mode-accent:${variant.accent}">
                <span class="mm-mode-icon">${variantIconSvg(variant, 22)}</span>
                <span class="mm-mode-text">
                  <strong>${variant.displayName}</strong>
                  <small>${variant.englishName}</small>
                </span>
                <span class="mm-mode-tagline">${variant.tagline}</span>
              </button>`).join('')}
          </div>
          <div class="mm-rules" id="mm-rules" aria-live="polite"></div>
        </section>
        <div class="mm-actions">
          <div class="mm-primary-actions">
            <button id="mm-play" class="btn btn-primary btn-large"></button>
            <button id="mm-online" class="btn btn-large">配对码联机</button>
            <button id="mm-training" class="btn btn-training btn-large">进入训练场</button>
          </div>
          <div class="mm-secondary-actions">
            <button id="mm-settings" class="btn btn-ghost">游戏设置</button>
            <button id="mm-help" class="btn btn-ghost">操作说明</button>
            <button id="mm-about" class="btn btn-ghost">关于游戏</button>
          </div>
        </div>
        <p class="mm-hint" id="mm-hint"></p>
      </div>
    `;
    parent.appendChild(this.root);
    this.bind();
    this.updatePlayers(settings);
    this.setVariant(settings.gameVariant);
  }

  updatePlayers(settings: GameSettings): void {
    const p1 = this.root.querySelector<HTMLElement>('#mm-p1');
    const p2 = this.root.querySelector<HTMLElement>('#mm-p2');
    if (p1) p1.textContent = settings.player1Name;
    if (p2) p2.textContent = settings.player2Name;
    const tag = this.root.querySelector<HTMLElement>('#mm-p2-tag');
    const play = this.root.querySelector<HTMLButtonElement>('#mm-play');
    const hint = this.root.querySelector<HTMLElement>('#mm-hint');
    const ai = settings.opponentMode === 'ai';
    if (tag) tag.textContent = ai ? (settings.aiDifficulty === 'elite' ? '精英 AI' : 'AI') : 'P2';
    if (play) play.textContent = ai ? '开始人机对战' : '开始本地双人';
    if (hint) hint.textContent = ai
      ? `你是 P1，${settings.aiDifficulty === 'elite' ? '精英 AI 会按武器与风向独立判断弹道' : '普通 AI 保留较明显的人类化误差'} · 可在设置中切换对手`
      : '两人共用同一套按键 / 触控按钮轮流操作';
  }

  setVariant(id: string): void {
    const variant = getGameVariant(id);
    this.root.style.setProperty('--mode-accent', variant.accent);
    this.root.querySelectorAll<HTMLButtonElement>('.mm-mode').forEach((button) => {
      const selected = button.dataset.variant === variant.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
    });
    const rules = this.root.querySelector<HTMLElement>('#mm-rules');
    if (rules) {
      rules.innerHTML = `<b>${variant.displayName}</b>${variant.rules.map((rule) => `<span>${rule}</span>`).join('')}`;
    }
  }

  private bind(): void {
    this.root.querySelector<HTMLButtonElement>('#mm-play')!.addEventListener('click', () => this.cb.onPlay());
    this.root.querySelector<HTMLButtonElement>('#mm-online')!.addEventListener('click', () => this.cb.onOnline());
    this.root.querySelector<HTMLButtonElement>('#mm-training')!.addEventListener('click', () => this.cb.onTraining());
    this.root.querySelector<HTMLButtonElement>('#mm-settings')!.addEventListener('click', () => this.cb.onSettings());
    this.root.querySelector<HTMLButtonElement>('#mm-help')!.addEventListener('click', () => this.cb.onHelp());
    this.root.querySelector<HTMLButtonElement>('#mm-about')!.addEventListener('click', () => this.cb.onAbout());
    const grid = this.root.querySelector<HTMLElement>('.mm-mode-grid')!;
    grid.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.mm-mode');
      if (!button?.dataset.variant) return;
      this.select(button.dataset.variant as GameVariantId);
    });
    // 单选组的方向键切换
    grid.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>('.mm-mode'));
      const current = buttons.findIndex((button) => button.classList.contains('selected'));
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const next = buttons[(current + step + buttons.length) % buttons.length];
      this.select(next.dataset.variant as GameVariantId);
      next.focus();
    });
  }

  private select(id: GameVariantId): void {
    this.setVariant(id);
    this.cb.onVariantChange(id);
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
