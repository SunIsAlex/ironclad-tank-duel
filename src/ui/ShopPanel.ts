import { WEAPONS } from '../config/weaponConfig';
import { SHOP_ITEMS, SHOP_TIER_LABELS } from '../systems/ShopSystem';

export interface ShopViewState {
  playerIndex: number;
  playerName: string;
  credits: number;
  ammo: Record<string, number>;
  gameNumber: number;
}

export class ShopPanel {
  root: HTMLElement;

  constructor(
    parent: HTMLElement,
    private getState: () => ShopViewState,
    private onBuy: (weaponId: string) => void,
    private onDone: () => void
  ) {
    this.root = document.createElement('div');
    this.root.className = 'modal-overlay shop-overlay';
    parent.appendChild(this.root);
    this.render();
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const buy = target.closest<HTMLButtonElement>('[data-buy]');
      if (buy && !buy.disabled) {
        this.onBuy(buy.dataset.buy!);
        this.render();
        return;
      }
      if (target.closest('#shop-done')) this.onDone();
    });
  }

  render(): void {
    const state = this.getState();
    this.root.innerHTML = `
      <div class="modal shop-panel" role="dialog" aria-label="武器商店">
        <div class="shop-header">
          <div>
            <div class="shop-kicker">第 ${state.gameNumber} 局 · 战前购买</div>
            <h2>${escapeHtml(state.playerName)} 的军械商店</h2>
          </div>
          <div class="shop-credits">◆ ${state.credits}</div>
        </div>
        <p class="shop-tip">星火榴弹永久免费；军械按战地、进阶、精英、原型分档。购买会增加一组弹药，余额和库存跨小局保留，存点可换取后期重火力。</p>
        <div class="shop-grid">
          ${SHOP_ITEMS.map((item) => {
            const weapon = WEAPONS.find((candidate) => candidate.id === item.weaponId)!;
            const ammo = Math.max(0, state.ammo[item.weaponId] ?? 0);
            const full = ammo >= weapon.ammo * 3;
            const disabled = state.credits < item.price || full;
            return `
              <article class="shop-card shop-tier-${item.tier}" style="--weapon-color:${weapon.color}">
                <div class="shop-card-top">
                  <strong>${escapeHtml(weapon.displayName)} <small>${SHOP_TIER_LABELS[item.tier]}</small></strong>
                  <span>${item.price} 点</span>
                </div>
                <p>${escapeHtml(weapon.description)}</p>
                <div class="shop-card-bottom">
                  <span>库存 ${ammo} · 每组 ${weapon.ammo}</span>
                  <button class="btn ${disabled ? 'btn-ghost' : 'btn-primary'}" data-buy="${weapon.id}" ${disabled ? 'disabled' : ''}>
                    ${full ? '库存已满' : state.credits < item.price ? '点数不足' : '购买'}
                  </button>
                </div>
              </article>`;
          }).join('')}
        </div>
        <div class="modal-actions">
          <button id="shop-done" class="btn btn-primary">完成购买</button>
        </div>
      </div>`;
  }

  destroy(): void {
    this.root.remove();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] as string));
}

