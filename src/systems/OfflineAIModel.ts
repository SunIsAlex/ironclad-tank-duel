import modelData from '../models/offline-ai-model.json';
import { POWER_RANGE } from '../config/gameConfig';
import { clamp } from '../utils/math';

interface OfflineModelData {
  version: number;
  architecture: { inputs: number; hidden: number; outputs: number; activation: string };
  trainedSamples: number;
  validation: { angleMae: number; powerMae: number };
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
}

export interface OfflineModelPrediction {
  elevation: number;
  power: number;
}

export const offlineAIModel = modelData as OfflineModelData;

export function isOfflineAIModelValid(model: OfflineModelData = offlineAIModel): boolean {
  const { inputs, hidden, outputs } = model.architecture;
  return model.version === 1 && inputs === 6 && outputs === 2 &&
    model.trainedSamples > 0 &&
    model.w1.length === inputs * hidden && model.b1.length === hidden &&
    model.w2.length === hidden * outputs && model.b2.length === outputs &&
    [...model.w1, ...model.b1, ...model.w2, ...model.b2].every(Number.isFinite);
}

export function createOfflineAIFeatures(distance: number, heightUp: number, windAlong: number): number[] {
  const d = clamp((distance - 150) / 1000, 0, 1);
  const h = clamp(heightUp / 180, -1, 1);
  const w = clamp(windAlong / 3, -1, 1);
  return [d * 2 - 1, h, w, d * h, d * w, h * w];
}

export function predictOfflineShot(
  distance: number,
  heightUp: number,
  windAlong: number,
  model: OfflineModelData = offlineAIModel
): OfflineModelPrediction | null {
  if (!isOfflineAIModelValid(model)) return null;
  const input = createOfflineAIFeatures(distance, heightUp, windAlong);
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
    power: clamp(POWER_RANGE.min + output[1] * (POWER_RANGE.max - POWER_RANGE.min), POWER_RANGE.min, POWER_RANGE.max),
  };
}

