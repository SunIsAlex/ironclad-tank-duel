// 历史弹道：记录每一发炮弹的真实飞行轨迹，供玩家下一回合对照修正。
// 只记录显示用的采样点，不参与任何物理或联机判定。

export interface ShotPoint {
  x: number;
  y: number;
}

export interface ShotRecord {
  playerIndex: number;
  angle: number;
  power: number;
  weaponId: string;
  /** 每枚弹体一条折线；分裂、散射与集束弹会产生多条 */
  paths: ShotPoint[][];
}

interface TrackedProjectile {
  id: number;
  x: number;
  y: number;
}

/** 两个采样点之间的最小间距，控制点数 */
const SAMPLE_SPACING = 6;
const MAX_POINTS_PER_PATH = 600;
const MAX_PATHS_PER_SHOT = 16;
/** 爆炸点距离折线末端在此范围内才视为该弹体的落点 */
const IMPACT_SNAP_DISTANCE = 60;

export class ShotHistory {
  private shots: ShotRecord[][] = [];
  private active: { record: ShotRecord; byId: Map<number, ShotPoint[]> } | null = null;

  constructor(readonly maxPerPlayer = 3) {}

  begin(playerIndex: number, angle: number, power: number, weaponId: string): void {
    this.end();
    this.active = {
      record: { playerIndex, angle, power, weaponId, paths: [] },
      byId: new Map(),
    };
  }

  sample(projectiles: readonly TrackedProjectile[]): void {
    if (!this.active) return;
    const { record, byId } = this.active;
    for (const p of projectiles) {
      let path = byId.get(p.id);
      if (!path) {
        if (record.paths.length >= MAX_PATHS_PER_SHOT) continue;
        path = [];
        byId.set(p.id, path);
        record.paths.push(path);
      }
      const last = path[path.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < SAMPLE_SPACING) continue;
      if (path.length >= MAX_POINTS_PER_PATH) continue;
      path.push({ x: p.x, y: p.y });
    }
  }

  /** 弹体在两次采样之间消失时，用爆炸位置补齐最近折线的终点。 */
  addImpact(x: number, y: number): void {
    if (!this.active) return;
    let best: ShotPoint[] | null = null;
    let bestDistance = IMPACT_SNAP_DISTANCE;
    for (const path of this.active.record.paths) {
      const last = path[path.length - 1];
      if (!last) continue;
      const distance = Math.hypot(x - last.x, y - last.y);
      if (distance <= bestDistance) {
        best = path;
        bestDistance = distance;
      }
    }
    best?.push({ x, y });
  }

  end(): void {
    if (!this.active) return;
    const { record } = this.active;
    this.active = null;
    record.paths = record.paths.filter((path) => path.length >= 2);
    if (record.paths.length === 0) return;
    const list = (this.shots[record.playerIndex] ??= []);
    list.unshift(record);
    if (list.length > this.maxPerPlayer) list.length = this.maxPerPlayer;
  }

  /** 按新到旧排列 */
  get(playerIndex: number): readonly ShotRecord[] {
    return this.shots[playerIndex] ?? [];
  }

  clear(): void {
    this.shots = [];
    this.active = null;
  }
}
