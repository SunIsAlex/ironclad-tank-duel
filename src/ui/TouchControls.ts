// 触控/鼠标按钮 DOM 面板
// 显示在屏幕底部，与 HUD 错开
import type { MobileControls } from '../systems/MobileControls';
import { isTouchDevice, isMobile } from '../utils/device';

export class TouchControls {
  root: HTMLElement;
  private mobile: MobileControls;
  private visible = true;

  constructor(parent: HTMLElement, mobile: MobileControls) {
    this.root = document.createElement('div');
    this.root.className = 'touch-controls';
    this.mobile = mobile;

    this.root.innerHTML = `
      <div class="tc-group tc-left">
        <button class="tc-btn tc-arrow" data-action="left" aria-label="向左移动">◀</button>
        <button class="tc-btn tc-arrow" data-action="right" aria-label="向右移动">▶</button>
      </div>
      <div class="tc-group tc-mid">
        <button class="tc-btn tc-small" data-action="aimDown" aria-label="减小角度">∠-</button>
        <button class="tc-btn tc-small" data-action="aimUp" aria-label="增大角度">∠+</button>
        <button class="tc-btn tc-small" data-action="powerDown" aria-label="降低力度">力-</button>
        <button class="tc-btn tc-small" data-action="powerUp" aria-label="提高力度">力+</button>
      </div>
      <div class="tc-group tc-right">
        <button class="tc-btn tc-small" data-action="switchWeapon" aria-label="切换武器">武器</button>
        <button class="tc-btn tc-fire" data-action="fire" aria-label="发射">发射</button>
        <button class="tc-btn tc-small" data-action="pause" aria-label="暂停">‖</button>
      </div>
    `;
    parent.appendChild(this.root);

    // 绑定每个按钮
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      const action = btn.dataset.action as any;
      const isOneShot = action === 'fire' || action === 'switchWeapon' || action === 'pause';
      mobile.bindButton(btn, action, isOneShot);
    });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  // 仅触控设备才默认显示，桌面可隐藏
  autoShow(): void {
    const show = isTouchDevice() || isMobile();
    this.setVisible(show);
  }

  destroy(): void {
    this.root.remove();
  }
}
