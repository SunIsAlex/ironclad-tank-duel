export type MapPresetId =
  | 'generated'
  | 'open_arena'
  | 'twin_hills'
  | 'central_plateau'
  | 'lowland_basin'
  | 'step_corridor'
  | 'canyon_divide'
  | 'crater_field'
  | 'rugged_peaks'
  | 'asymmetric_ridge'
  | 'training_range';

export type TerrainShape = Exclude<MapPresetId, 'generated'>;

export interface MapPreset {
  id: MapPresetId;
  displayName: string;
  description: string;
  waveScale: number;
  roughness: number;
  maxSlope: number;
  shape: TerrainShape | 'generated';
}

// 原创程序化布局：提供与大型炮术游戏相当的地貌类别，不复刻第三方地图轮廓。
export const MAP_PRESETS: MapPreset[] = [
  { id: 'generated', displayName: '随机地貌', description: '每局从多种崎岖轮廓中生成，推荐玩法。', waveScale: 1, roughness: 1, maxSlope: 0.92, shape: 'generated' },
  { id: 'open_arena', displayName: '起伏荒原', description: '宽阔但不平坦，连续丘陵会改变落点。', waveScale: 0.78, roughness: 0.7, maxSlope: 0.82, shape: 'open_arena' },
  { id: 'twin_hills', displayName: '双峰瞭望台', description: '双方高地之间隔着深鞍部。', waveScale: 0.9, roughness: 0.8, maxSlope: 0.9, shape: 'twin_hills' },
  { id: 'central_plateau', displayName: '中央高台', description: '宽阔高台与两侧坡谷形成视线遮挡。', waveScale: 0.75, roughness: 0.65, maxSlope: 0.86, shape: 'central_plateau' },
  { id: 'lowland_basin', displayName: '回声低谷', description: '中央深谷迫使玩家使用高抛弹道。', waveScale: 0.85, roughness: 0.75, maxSlope: 0.88, shape: 'lowland_basin' },
  { id: 'step_corridor', displayName: '阶梯回廊', description: '多级平台和短坡让滚动物改变路线。', waveScale: 0.72, roughness: 0.45, maxSlope: 0.95, shape: 'step_corridor' },
  { id: 'canyon_divide', displayName: '裂谷分界', description: '中央高脊与两侧峡谷阻断低角度直射。', waveScale: 0.95, roughness: 0.8, maxSlope: 0.96, shape: 'canyon_divide' },
  { id: 'crater_field', displayName: '陨坑群', description: '连续凹坑能接住滚弹，也会隐藏坦克。', waveScale: 0.8, roughness: 0.85, maxSlope: 0.94, shape: 'crater_field' },
  { id: 'rugged_peaks', displayName: '犬牙山脉', description: '随机尖峰和深谷，瞄准难度最高。', waveScale: 1.05, roughness: 1.15, maxSlope: 0.98, shape: 'rugged_peaks' },
  { id: 'asymmetric_ridge', displayName: '倾斜山脊', description: '非对称高低差让双方拥有不同弹道条件。', waveScale: 0.9, roughness: 0.9, maxSlope: 0.94, shape: 'asymmetric_ridge' },
  { id: 'training_range', displayName: '校准靶场', description: '仅供练习的低起伏地形。', waveScale: 0.2, roughness: 0.15, maxSlope: 0.5, shape: 'training_range' },
];

export function getMapPreset(id: string): MapPreset {
  return MAP_PRESETS.find((preset) => preset.id === id) ?? MAP_PRESETS[0];
}
