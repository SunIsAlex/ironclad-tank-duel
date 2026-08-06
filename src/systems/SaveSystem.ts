import type { GameSettings } from '../types';
import { DEFAULT_SETTINGS } from '../config/gameConfig';
import { STORAGE_KEYS } from '../core/Constants';
import { storage } from '../utils/device';

export class SaveSystem {
  loadSettings(): GameSettings {
    const raw = storage.get(STORAGE_KEYS.settings);
    if (!raw) return { ...DEFAULT_SETTINGS };
    try {
      const obj = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...obj };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(s: GameSettings): void {
    try {
      storage.set(STORAGE_KEYS.settings, JSON.stringify(s));
    } catch {
      // ignore
    }
  }

  loadLastSeed(): string {
    return storage.get(STORAGE_KEYS.lastSeed) || '';
  }

  saveLastSeed(seed: string): void {
    storage.set(STORAGE_KEYS.lastSeed, seed);
  }
}

export const saveSystem = new SaveSystem();
