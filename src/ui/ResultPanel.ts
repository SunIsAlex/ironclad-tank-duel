import type { MissionStats } from '../types';

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
    const winnerText = stats.isDraw
      ? '平局！'
      : `<span style="color:var(--p${stats.winnerIndex + 1})">${escapeHtml(stats.tanks[stats.winnerIndex]?.name ?? '')} 获胜</span>`;
    this.root.innerHTML = `
      <div class="modal result-panel">
        <h2>${winnerText}</h2>
        <p class="result-rounds">最终比分：${stats.matchWins[0]} : ${stats.matchWins[1]}</p>
        <p class="result-rounds">完成 ${stats.gamesPlayed} 局 · 总操作回合 ${stats.totalRounds}</p>
        <div class="result-stats">
          ${stats.tanks
            .map(
              (t, i) => `
              <div class="result-row">
                <div class="result-name"><span class="dot" style="background:var(--p${i + 1})"></span>${escapeHtml(t.name)}${t.isAlive ? '' : ' †'}</div>
                <div>伤害 ${t.damageDealt}</div>
                <div>命中 ${t.hitCount}</div>
                <div>直击 ${t.directHitCount}</div>
              </div>`
            )
            .join('')}
        </div>
        <p class="result-seed">地图种子：<code>${escapeHtml(seed)}</code></p>
        <div class="modal-actions">
          <button id="rp-restart" class="btn btn-primary">再来一场</button>
          <button id="rp-menu" class="btn btn-ghost">返回主菜单</button>
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
