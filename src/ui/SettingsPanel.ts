import type { GameSettings } from '../types';
import { DEFAULT_SETTINGS } from '../config/gameConfig';
import { MAP_PRESETS } from '../config/mapConfig';

// 设置面板（模态）
export class SettingsPanel {
  root: HTMLElement;
  private settings: GameSettings;
  private onChange: (s: GameSettings) => void;

  constructor(parent: HTMLElement, settings: GameSettings, onChange: (s: GameSettings) => void) {
    this.settings = { ...settings };
    this.onChange = onChange;
    this.root = document.createElement('div');
    this.root.className = 'modal-overlay hidden';
    this.root.innerHTML = this.renderHtml();
    parent.appendChild(this.root);
    this.bindEvents();
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  isShown(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private renderHtml(): string {
    const s = this.settings;
    return `
      <div class="modal settings-panel" role="dialog" aria-label="游戏设置">
        <h2>游戏设置</h2>
        <div class="settings-grid">
          <label>玩家 1 名称<input type="text" id="set-p1" value="${escapeAttr(s.player1Name)}" /></label>
          <label>玩家 2 名称<input type="text" id="set-p2" value="${escapeAttr(s.player2Name)}" /></label>
          <label>地图种子<input type="text" id="set-seed" value="${escapeAttr(s.mapSeed)}" placeholder="留空随机" /></label>
          <label>地图布局
            <select id="set-map">
              ${MAP_PRESETS.map((preset) => `<option value="${preset.id}" ${s.mapPreset === preset.id ? 'selected' : ''}>${preset.displayName} · ${preset.description}</option>`).join('')}
            </select>
          </label>
          <label>每回合时间
            <select id="set-turn">
              <option value="0" ${s.turnTime === 0 ? 'selected' : ''}>无限</option>
              <option value="30" ${s.turnTime === 30 ? 'selected' : ''}>30 秒</option>
              <option value="45" ${s.turnTime === 45 ? 'selected' : ''}>45 秒</option>
              <option value="60" ${s.turnTime === 60 ? 'selected' : ''}>60 秒</option>
            </select>
          </label>
          <label>初始生命值<input type="number" id="set-hp" min="50" max="300" step="10" value="${s.initialHealth}" /></label>
          <label>风力强度
            <select id="set-wind">
              <option value="0" ${s.windStrength === 0 ? 'selected' : ''}>无风</option>
              <option value="1" ${s.windStrength === 1 ? 'selected' : ''}>微风</option>
              <option value="2" ${s.windStrength === 2 ? 'selected' : ''}>中等</option>
              <option value="3" ${s.windStrength === 3 ? 'selected' : ''}>强风</option>
            </select>
          </label>
          <label>移动燃料<input type="number" id="set-fuel" min="0" max="600" step="20" value="${s.movementFuel}" /></label>
          <label class="checkbox"><input type="checkbox" id="set-shake" ${s.screenShake ? 'checked' : ''} /> 屏幕震动</label>
          <label class="checkbox"><input type="checkbox" id="set-traj" ${s.showTrajectory ? 'checked' : ''} /> 显示预测轨迹</label>
          <label class="checkbox"><input type="checkbox" id="set-reduced" ${s.reducedMotion ? 'checked' : ''} /> 降低动画</label>
          <label>音乐音量<input type="range" id="set-music" min="0" max="1" step="0.05" value="${s.musicVolume}" /></label>
          <label>音效音量<input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${s.sfxVolume}" /></label>
        </div>
        <div class="modal-actions">
          <button id="set-reset" class="btn btn-ghost">恢复默认</button>
          <button id="set-close" class="btn btn-primary">确定</button>
        </div>
      </div>
    `;
  }

  // 注意：update 不持有任何外部引用，每次都从当前 DOM 实时读取，因此
  // 即使重置后 innerHTML 被重建，旧监听器调用 update 仍能正确读取新 DOM
  // 因为 update 内部通过 this.root.querySelector 重新查找
  private bindEvents(): void {
    const update = (): void => {
      const root = this.root;
      const p1El = root.querySelector<HTMLInputElement>('#set-p1');
      const p2El = root.querySelector<HTMLInputElement>('#set-p2');
      const seedEl = root.querySelector<HTMLInputElement>('#set-seed');
      const mapEl = root.querySelector<HTMLSelectElement>('#set-map');
      const turnEl = root.querySelector<HTMLSelectElement>('#set-turn');
      const hpEl = root.querySelector<HTMLInputElement>('#set-hp');
      const windEl = root.querySelector<HTMLSelectElement>('#set-wind');
      const fuelEl = root.querySelector<HTMLInputElement>('#set-fuel');
      const shakeEl = root.querySelector<HTMLInputElement>('#set-shake');
      const trajEl = root.querySelector<HTMLInputElement>('#set-traj');
      const reducedEl = root.querySelector<HTMLInputElement>('#set-reduced');
      const musicEl = root.querySelector<HTMLInputElement>('#set-music');
      const sfxEl = root.querySelector<HTMLInputElement>('#set-sfx');
      if (!p1El || !p2El || !seedEl || !mapEl || !turnEl || !hpEl || !windEl || !fuelEl || !shakeEl || !trajEl || !reducedEl || !musicEl || !sfxEl) {
        return; // DOM 尚未就绪
      }
      let seed = seedEl.value.trim();
      if (seed.length > 32) seed = seed.slice(0, 32);
      const turnTime = parseInt(turnEl.value, 10) || 0;
      const hp = clampNum(parseInt(hpEl.value, 10), 50, 300, DEFAULT_SETTINGS.initialHealth);
      const wind = parseInt(windEl.value, 10);
      const fuel = clampNum(parseInt(fuelEl.value, 10), 0, 600, DEFAULT_SETTINGS.movementFuel);
      const music = parseFloat(musicEl.value);
      const sfx = parseFloat(sfxEl.value);
      this.settings = {
        player1Name: p1El.value || DEFAULT_SETTINGS.player1Name,
        player2Name: p2El.value || DEFAULT_SETTINGS.player2Name,
        mapSeed: seed,
        mapPreset: mapEl.value,
        turnTime,
        initialHealth: hp,
        windStrength: wind,
        movementFuel: fuel,
        screenShake: shakeEl.checked,
        musicVolume: music,
        sfxVolume: sfx,
        showTrajectory: trajEl.checked,
        reducedMotion: reducedEl.checked,
      };
      this.onChange(this.settings);
    };
    // 委托到 root：input/change/click 事件冒泡，单次注册即可
    // 重置后内部 DOM 重建，监听器仍然作用，update 总是从当前 DOM 读取
    if (!this.root.dataset.bound) {
      this.root.addEventListener('input', update);
      this.root.addEventListener('change', update);
      this.root.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const close = target.closest('#set-close');
        if (close) {
          update();
          this.hide();
          // 收起 Android 软键盘
          (document.activeElement as HTMLElement | null)?.blur?.();
          return;
        }
        const reset = target.closest('#set-reset');
        if (reset) {
          this.settings = { ...DEFAULT_SETTINGS };
          this.root.innerHTML = this.renderHtml();
          this.onChange(this.settings);
          update();
        }
      });
      this.root.dataset.bound = '1';
    }
  }
}

function clampNum(v: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
