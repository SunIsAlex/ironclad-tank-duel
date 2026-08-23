// 全局常量
import { GROUND_THICKNESS as TERRAIN_GROUND_THICKNESS, WORLD_CONFIG } from '../config/gameConfig';

export const STORAGE_KEYS = {
  settings: 'tank-duel:settings',
  lastSeed: 'tank-duel:lastSeed',
  highScore: 'tank-duel:highScore',
};

export const COLORS = {
  P1: '#36ddff', // 电弧蓝
  P1Dark: '#087ba5',
  P2: '#ff7847', // 等离子橙
  P2Dark: '#b83217',
  HUDBackground: 'rgba(4, 13, 25, 0.9)',
  HUDForeground: '#eafaff',
  Accent: '#71efff',
  Warning: '#ef476f',
  Success: '#06d6a0',
};

export const PLAYER_COLORS = [COLORS.P1, COLORS.P2];
export const PLAYER_DARK_COLORS = [COLORS.P1Dark, COLORS.P2Dark];
export const PLAYER_LABELS = ['P1', 'P2'];

export const WORLD_WIDTH = WORLD_CONFIG.worldWidth;
export const WORLD_HEIGHT = WORLD_CONFIG.worldHeight;
export const GROUND_THICKNESS = TERRAIN_GROUND_THICKNESS;
