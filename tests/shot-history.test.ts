import { describe, expect, it } from 'vitest';
import { ShotHistory } from '../src/systems/ShotHistory';

function fly(history: ShotHistory, player: number, angle: number, steps = 10): void {
  history.begin(player, angle, 500, 'basic_shell');
  for (let i = 0; i < steps; i++) history.sample([{ id: 1, x: i * 20, y: 100 + i * 5 }]);
  history.end();
}

describe('历史弹道', () => {
  it('按玩家分别记录，新到旧排列且最多保留 3 发', () => {
    const history = new ShotHistory(3);
    for (let angle = 10; angle <= 50; angle += 10) fly(history, 0, angle);
    fly(history, 1, 120);
    expect(history.get(0).map((shot) => shot.angle)).toEqual([50, 40, 30]);
    expect(history.get(1).map((shot) => shot.angle)).toEqual([120]);
  });

  it('多弹体各自成线，爆炸点补到最近的折线末端', () => {
    const history = new ShotHistory();
    history.begin(0, 45, 600, 'triple_scatter');
    history.sample([{ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 0 }]);
    history.sample([{ id: 1, x: 50, y: 0 }, { id: 2, x: 0, y: 50 }]);
    history.addImpact(70, 0);
    history.end();
    const [shot] = history.get(0);
    expect(shot.paths).toHaveLength(2);
    expect(shot.paths[0][shot.paths[0].length - 1]).toEqual({ x: 70, y: 0 });
    expect(shot.paths[1]).toHaveLength(2);
  });

  it('间距过小的采样被合并，空射击不进入历史', () => {
    const history = new ShotHistory();
    history.begin(0, 45, 600, 'basic_shell');
    history.sample([{ id: 1, x: 0, y: 0 }]);
    history.sample([{ id: 1, x: 2, y: 2 }]);
    history.end();
    expect(history.get(0)).toHaveLength(0);
    fly(history, 0, 30);
    history.clear();
    expect(history.get(0)).toHaveLength(0);
  });
});
