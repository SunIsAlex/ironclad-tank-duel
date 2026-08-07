// 全局常量
import { WORLD_CONFIG } from '../config/gameConfig';

export const STORAGE_KEYS = {
  settings: 'tank-duel:settings',
  lastSeed: 'tank-duel:lastSeed',
  highScore: 'tank-duel:highScore',
};

export const COLORS = {
  P1: '#4ec5ff', // 蓝青色
  P1Dark: '#1f6ea8',
  P2: '#ff7a4d', // 橙红色
  P2Dark: '#a83a17',
  HUDBackground: 'rgba(13, 24, 38, 0.82)',
  HUDForeground: '#e7f1ff',
  Accent: '#ffd166',
  Warning: '#ef476f',
  Success: '#06d6a0',
};

export const PLAYER_COLORS = [COLORS.P1, COLORS.P2];
export const PLAYER_DARK_COLORS = [COLORS.P1Dark, COLORS.P2Dark];
export const PLAYER_LABELS = ['P1', 'P2'];

export const WORLD_WIDTH = WORLD_CONFIG.worldWidth;
export const WORLD_HEIGHT = WORLD_CONFIG.worldHeight;
export const GROUND_THICKNESS = 240;
