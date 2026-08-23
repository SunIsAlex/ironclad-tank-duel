import modelData from '../models/elite-ai-model.json';
import type { WeaponDefinition } from '../types';
import { POWER_RANGE } from '../config/gameConfig';
import { clamp } from '../utils/math';

interface EliteModelData {
  version: number;
  architecture: { inputs: number; hidden: number; outputs: number; activation: string };
  trainedSamples: number;
  trainedWeaponProfiles: number;
  validation: { angleMae: number; powerMae: number };
  w1: number[]; b1: number[]; w2: number[]; b2: number[];
}

export interface EliteModelPrediction { elevation: number; power: number }
export const eliteAIModel = modelData as EliteModelData;
const TRAINED_POWER_MAX = 820;

export function isEliteAIModelValid(model: EliteModelData = eliteAIModel): boolean {
  const { inputs, hidden, outputs } = model.architecture;
  return model.version === 2 && inputs === 9 && outputs === 2 &&
    model.trainedSamples > 0 && model.trainedWeaponProfiles >= 16 &&
    model.w1.length === inputs * hidden && model.b1.length === hidden &&
    model.w2.length === hidden * outputs && model.b2.length === outputs &&
    [...model.w1, ...model.b1, ...model.w2, ...model.b2].every(Number.isFinite);
}

export function createEliteAIFeatures(
  distance: number,
  heightUp: number,
  windAlong: number,
  weapon: Pick<WeaponDefinition, 'projectileSpeedMultiplier' | 'gravityMultiplier' | 'windMultiplier'>
): number[] {
  const d = clamp((distance - 150) / 1000, 0, 1);
  const h = clamp(heightUp / 180, -1, 1);
  const w = clamp(windAlong / 3, -1, 1);
  const speed = clamp((weapon.projectileSpeedMultiplier - 0.8) / 0.6, 0, 1) * 2 - 1;
  const gravity = clamp((weapon.gravityMultiplier - 0.7) / 0.6, 0, 1) * 2 - 1;
  const windResponse = clamp((weapon.windMultiplier - 0.3) / 0.7, 0, 1) * 2 - 1;
  return [d * 2 - 1, h, w, d * h, d * w, h * w, speed, gravity, windResponse];
}

export function predictEliteShot(
  distance: number,
  heightUp: number,
  windAlong: number,
  weapon: WeaponDefinition,
  model: EliteModelData = eliteAIModel
): EliteModelPrediction | null {
  if (!isEliteAIModelValid(model)) return null;
  const input = createEliteAIFeatures(distance, heightUp, windAlong, weapon);
  const { inputs, hidden } = model.architecture;
  const hiddenValues = new Array<number>(hidden);
  for (let h = 0; h < hidden; h++) {
    let sum = model.b1[h];
    for (let i = 0; i < inputs; i++) sum += model.w1[h * inputs + i] * input[i];
    hiddenValues[h] = Math.tanh(sum);
  }
  const output = new Array<number>(2);
  for (let o = 0; o < 2; o++) {
    let sum = model.b2[o];
    for (let h = 0; h < hidden; h++) sum += model.w2[o * hidden + h] * hiddenValues[h];
    output[o] = 1 / (1 + Math.exp(-sum));
  }
  return {
    elevation: clamp(18 + output[0] * 62, 18, 80),
    power: clamp(POWER_RANGE.min + output[1] * (TRAINED_POWER_MAX - POWER_RANGE.min), POWER_RANGE.min, TRAINED_POWER_MAX),
  };
}
