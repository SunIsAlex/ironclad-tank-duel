import type { MissionStats } from '../types';
import { getGameVariant, variantIconSvg } from '../config/gameVariants';

export interface ResultCallbacks {
  onRestart: () => void;
  onMenu: () => void;
}

export class ResultPanel {
  root: HTMLElement;
  private cb: ResultCallbacks;

  constructor(parent: HTMLElement, stats: MissionStats, seed: string, cb: ResultCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'modal-overlay';
    const variant = getGameVariant(stats.variantId);
    const winner = stats.tanks[stats.winnerIndex];
    const winColor = stats.isDraw ? 'var(--accent)' : `var(--p${stats.winnerIndex + 1})`;
    const rows: Array<{ label: string; values: number[] }> = [
      { label: '总伤害', values: stats.tanks.map((t) => t.damageDealt) },
      { label: '命中', values: stats.tanks.map((t) => t.hitCount) },
      { label: '直击', values: stats.tanks.map((t) => t.directHitCount) },
    ];
    this.root.innerHTML = `
      <div class="modal result-panel" style="--win-color:${winColor}">
        <div class="result-banner">
          <div class="result-kicker">${stats.isDraw ? 'DRAW · 平局' : 'VICTORY · 胜利'}</div>
          <h2>${stats.isDraw ? '平局！' : `${escapeHtml(winner?.name ?? '')} 获胜`}</h2>
          <div class="result-mode" style="color:${variant.accent}">${variantIconSvg(variant, 16)}<span>${variant.displayName}</span></div>
        </div>
        <div class="result-score">
          <div class="result-side p1"><span class="result-dot"></span>${escapeHtml(stats.tanks[0]?.name ?? '')}</div>
          <div class="result-digits"><b class="p1">${stats.matchWins[0]}</b><i>:</i><b class="p2">${stats.matchWins[1]}</b></div>
          <div class="result-side p2">${escapeHtml(stats.tanks[1]?.name ?? '')}<span class="result-dot"></span></div>
        </div>
        <p class="result-rounds">完成 ${stats.gamesPlayed} 局 · 总操作回合 ${stats.totalRounds}</p>
        <div class="result-compare">
          ${rows.map((row) => {
            const total = Math.max(1, row.values[0] + row.values[1]);
            const left = (row.values[0] / total) * 100;
            return `
              <div class="result-stat">
                <span class="result-val p1">${row.values[0]}</span>
                <div class="result-bar">
                  <span class="p1" style="width:${left.toFixed(1)}%"></span>
                  <span class="p2" style="width:${(100 - left).toFixed(1)}%"></span>
                  <em>${row.label}</em>
                </div>
                <span class="result-val p2">${row.values[1]}</span>
              </div>`;
          }).join('')}
        </div>
        <p class="result-seed">地图种子：<code>${escapeHtml(seed)}</code></p>
        <div class="modal-actions">
          <button id="rp-menu" class="btn btn-ghost">返回主菜单</button>
          <button id="rp-restart" class="btn btn-primary">再来一场</button>
        </div>
      </div>
    `;
    parent.appendChild(this.root);
    this.bind();
  }

  private bind(): void {
    this.root.querySelector<HTMLButtonElement>('#rp-restart')!.addEventListener('click', () => this.cb.onRestart());
    this.root.querySelector<HTMLButtonElement>('#rp-menu')!.addEventListener('click', () => this.cb.onMenu());
  }

  destroy(): void {
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
