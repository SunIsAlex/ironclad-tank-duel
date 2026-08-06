export type MapPresetId =
  | 'open_arena'
  | 'twin_hills'
  | 'central_plateau'
  | 'lowland_basin'
  | 'step_corridor'
  | 'training_range';

export interface MapPreset {
  id: MapPresetId;
  displayName: string;
  description: string;
  waveScale: number;
}

// 原创程序化布局：名称和轮廓均不复用第三方地图。
export const MAP_PRESETS: MapPreset[] = [
  { id: 'open_arena', displayName: '开阔竞技场', description: '起伏温和，适合练习直线与抛物线弹道。', waveScale: 0.45 },
  { id: 'twin_hills', displayName: '双峰瞭望台', description: '两侧高地，双方拥有清晰的高低差。', waveScale: 0.65 },
  { id: 'central_plateau', displayName: '中央高台', description: '中央高地适合争夺视野，边缘有安全落脚区。', waveScale: 0.5 },
  { id: 'lowland_basin', displayName: '回声低谷', description: '中部低谷让高角度炮弹更有价值。', waveScale: 0.55 },
  { id: 'step_corridor', displayName: '阶梯回廊', description: '连续缓坡与平台，适合调整角度后推进。', waveScale: 0.4 },
  { id: 'training_range', displayName: '校准靶场', description: '整体平坦，双方开局距离与高度都更容易判断。', waveScale: 0.22 },
];

export function getMapPreset(id: string): MapPreset {
  return MAP_PRESETS.find((preset) => preset.id === id) ?? MAP_PRESETS[0];
}
