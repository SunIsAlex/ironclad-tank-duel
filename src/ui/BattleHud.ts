// 战斗场景顶部 HUD 信息条 + 顶部右上角暂停按钮
import type { MobileControls } from '../systems/MobileControls';

export class BattleHud {
  root: HTMLElement;
  pauseBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, mobile: MobileControls) {
    this.root = document.createElement('div');
    this.root.className = 'battle-hud';
    this.root.innerHTML = `
      <button class="hud-pause" data-action="pause" aria-label="暂停">‖</button>
    `;
    parent.appendChild(this.root);
    this.pauseBtn = this.root.querySelector<HTMLButtonElement>('.hud-pause')!;
    mobile.bindButton(this.pauseBtn, 'pause', true);
  }

  destroy(): void {
    this.root.remove();
  }
}
