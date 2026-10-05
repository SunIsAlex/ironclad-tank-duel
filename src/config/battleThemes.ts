// 战场视觉主题：每种玩法拥有独立的天空、地形与环境粒子配色。
// 地形颜色在生成时烘焙进离屏 Canvas，爆炸仅擦除像素，因此无需额外同步。

export type BattleThemeId = 'nebula' | 'storm' | 'neon' | 'volcano' | 'lunar' | 'dusk';

export type AmbientEffect = 'none' | 'embers' | 'dust' | 'sparks' | 'motes';

export interface BattleTheme {
  id: BattleThemeId;
  /** 自上而下四段天空渐变 */
  sky: [string, string, string, string];
  starCount: number;
  starColor: string;
  /** 天体：x 为世界宽度比例 */
  planet: { x: number; y: number; r: number; core: string; rim: string; ring?: string } | null;
  grid: string;
  /** 天际线光晕 RGB（不含 alpha） */
  horizon: string;
  mountains: [string, string];
  cloud: string;
  terrain: {
    stops: Array<[number, string]>;
    rim: string;
    rimGlow: string;
    crystal: string;
    crystalDim: string;
    debris: string;
  };
  ambient: AmbientEffect;
  ambientColor: string;
  /** 屏幕四周暗角颜色 RGB */
  vignette: string;
}

export const BATTLE_THEMES: Record<BattleThemeId, BattleTheme> = {
  nebula: {
    id: 'nebula',
    sky: ['#020812', '#071a2d', '#10334a', '#172b38'],
    starCount: 60,
    starColor: '255,255,255',
    planet: { x: 0.78, y: 108, r: 64, core: 'rgba(3, 10, 20, .96)', rim: '57, 220, 255' },
    grid: 'rgba(74, 213, 255, .045)',
    horizon: '20, 174, 214',
    mountains: ['#142a3d', '#0b1927'],
    cloud: 'rgba(91, 171, 203, 0.10)',
    terrain: {
      stops: [[0, '#2f7184'], [0.025, '#173f51'], [0.14, '#172d3b'], [0.55, '#101d28'], [1, '#070d14']],
      rim: 'rgba(79, 222, 255, 0.72)',
      rimGlow: '#35d6ff',
      crystal: 'rgba(89, 229, 255, .7)',
      crystalDim: 'rgba(144, 188, 200, .24)',
      debris: '#2c4b5c',
    },
    ambient: 'motes',
    ambientColor: '120, 230, 255',
    vignette: '1, 6, 14',
  },
  storm: {
    id: 'storm',
    sky: ['#05040f', '#151233', '#2b2357', '#2a1f3f'],
    starCount: 24,
    starColor: '214,206,255',
    planet: { x: 0.24, y: 120, r: 46, core: 'rgba(14, 10, 32, .96)', rim: '255, 214, 92' },
    grid: 'rgba(170, 150, 255, .05)',
    horizon: '154, 120, 255',
    mountains: ['#221c45', '#140f2c'],
    cloud: 'rgba(140, 120, 220, 0.16)',
    terrain: {
      stops: [[0, '#6a5bd6'], [0.025, '#352a7a'], [0.14, '#241d4f'], [0.55, '#160f33'], [1, '#09061a']],
      rim: 'rgba(255, 220, 110, 0.8)',
      rimGlow: '#ffd35c',
      crystal: 'rgba(255, 224, 120, .75)',
      crystalDim: 'rgba(190, 170, 255, .26)',
      debris: '#3b2f74',
    },
    ambient: 'sparks',
    ambientColor: '255, 226, 120',
    vignette: '8, 4, 20',
  },
  neon: {
    id: 'neon',
    sky: ['#0b0016', '#2a0638', '#5a0f4e', '#ff6a3d'],
    starCount: 40,
    starColor: '255,200,240',
    planet: { x: 0.5, y: 330, r: 120, core: 'rgba(255, 120, 70, .9)', rim: '255, 70, 160', ring: 'rgba(255, 196, 92, .5)' },
    grid: 'rgba(255, 64, 196, .08)',
    horizon: '255, 70, 160',
    mountains: ['#3a0b45', '#1f0630'],
    cloud: 'rgba(255, 120, 200, 0.10)',
    terrain: {
      stops: [[0, '#ff4fd8'], [0.02, '#7a1b8f'], [0.14, '#3a0d4f'], [0.55, '#1d0630'], [1, '#0c0218']],
      rim: 'rgba(255, 92, 220, 0.85)',
      rimGlow: '#ff4fd8',
      crystal: 'rgba(80, 245, 255, .8)',
      crystalDim: 'rgba(255, 150, 230, .3)',
      debris: '#5c1670',
    },
    ambient: 'motes',
    ambientColor: '255, 120, 230',
    vignette: '12, 0, 22',
  },
  volcano: {
    id: 'volcano',
    sky: ['#0d0302', '#2a0905', '#5c160a', '#8a2a0c'],
    starCount: 12,
    starColor: '255,190,150',
    planet: { x: 0.7, y: 120, r: 52, core: 'rgba(40, 6, 2, .92)', rim: '255, 120, 40' },
    grid: 'rgba(255, 120, 60, .035)',
    horizon: '255, 90, 30',
    mountains: ['#2c0c07', '#170504'],
    cloud: 'rgba(60, 20, 14, 0.38)',
    terrain: {
      stops: [[0, '#5a2a1e'], [0.025, '#36160f'], [0.14, '#24100b'], [0.55, '#160906'], [1, '#080302']],
      rim: 'rgba(255, 128, 48, 0.78)',
      rimGlow: '#ff6a1f',
      crystal: 'rgba(255, 170, 60, .8)',
      crystalDim: 'rgba(160, 90, 70, .3)',
      debris: '#3a1a12',
    },
    ambient: 'embers',
    ambientColor: '255, 140, 50',
    vignette: '18, 2, 0',
  },
  lunar: {
    id: 'lunar',
    sky: ['#000000', '#03050b', '#080d18', '#0f1522'],
    starCount: 160,
    starColor: '235,240,255',
    planet: { x: 0.2, y: 130, r: 58, core: 'rgba(30, 90, 170, .95)', rim: '120, 200, 255' },
    grid: 'rgba(200, 220, 255, .03)',
    horizon: '160, 190, 230',
    mountains: ['#1c222c', '#11151c'],
    cloud: 'rgba(0, 0, 0, 0)',
    terrain: {
      stops: [[0, '#b9c0c9'], [0.025, '#7d8591'], [0.14, '#4d535d'], [0.55, '#2a2e35'], [1, '#121418']],
      rim: 'rgba(235, 242, 255, 0.7)',
      rimGlow: '#d8e6ff',
      crystal: 'rgba(160, 220, 255, .7)',
      crystalDim: 'rgba(60, 64, 72, .5)',
      debris: '#6c727c',
    },
    ambient: 'dust',
    ambientColor: '210, 220, 240',
    vignette: '0, 0, 0',
  },
  dusk: {
    id: 'dusk',
    sky: ['#140b1e', '#3b1a2e', '#8a3b2c', '#e0873e'],
    starCount: 18,
    starColor: '255,230,200',
    planet: { x: 0.82, y: 160, r: 70, core: 'rgba(255, 196, 110, .95)', rim: '255, 150, 70' },
    grid: 'rgba(255, 190, 120, .035)',
    horizon: '255, 170, 90',
    mountains: ['#4a2230', '#2c1520'],
    cloud: 'rgba(255, 170, 130, 0.14)',
    terrain: {
      stops: [[0, '#e0a25a'], [0.025, '#a8642f'], [0.14, '#6b3b22'], [0.55, '#3a1f14'], [1, '#1a0d08']],
      rim: 'rgba(255, 214, 140, 0.75)',
      rimGlow: '#ffc06a',
      crystal: 'rgba(255, 236, 170, .75)',
      crystalDim: 'rgba(120, 70, 40, .35)',
      debris: '#7a4a2a',
    },
    ambient: 'dust',
    ambientColor: '255, 200, 140',
    vignette: '20, 8, 4',
  },
};

export function getBattleTheme(id: BattleThemeId | undefined): BattleTheme {
  return (id && BATTLE_THEMES[id]) || BATTLE_THEMES.nebula;
}
