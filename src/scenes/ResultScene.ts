import type { Game, Scene } from '../core/Game';
import { ResultPanel } from '../ui/ResultPanel';
import type { MissionStats } from '../types';
import { isFormElement } from '../systems/InputManager';

export class ResultScene implements Scene {
  private game: Game;
  private panel: ResultPanel;
  private stats: MissionStats;
  private seed: string;

  constructor(game: Game, stats: MissionStats, seed: string) {
    this.game = game;
    this.stats = stats;
    this.seed = seed;
    const parent = game.canvas.parentElement!;
    this.panel = new ResultPanel(parent, stats, seed, {
      onRestart: () => {
        this.panel.destroy();
        // 重置玩家名为当前设置（防止改了名字后未更新）
        game.battle?.destroy();
        game.battle = undefined;
        game.gotoBattle();
      },
      onMenu: () => {
        this.panel.destroy();
        game.battle?.destroy();
        game.battle = undefined;
        game.gotoMenu(false);
      },
    });
  }

  update(_dt: number): void {}
  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}

  handleKeyDown(e: KeyboardEvent): boolean {
    if (isFormElement(e.target)) return false;
    if (e.key.toLowerCase() === 'r') {
      this.panel.destroy();
      this.game.battle?.destroy();
      this.game.battle = undefined;
      this.game.gotoBattle();
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
    this.panel.destroy();
  }
}
