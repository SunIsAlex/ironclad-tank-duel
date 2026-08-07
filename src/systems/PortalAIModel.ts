import modelData from '../models/portal-ai-model.json';
import type { WeaponDefinition } from '../types';
import { POWER_RANGE } from '../config/gameConfig';
import { clamp } from '../utils/math';

interface PortalModelData {
  version: number;
  architecture: { inputs: number; hidden: number; outputs: number };
  trainedSamples: number;
  weaponProfiles: number;
  validation: { angleMae: number; powerMae: number };
  w1: number[]; b1: number[]; w2: number[]; b2: number[];
}
export const portalAIModel = modelData as PortalModelData;

export function isPortalAIModelValid(model: PortalModelData = portalAIModel): boolean {
  const { inputs, hidden, outputs } = model.architecture;
  return model.version === 1 && inputs === 10 && outputs === 2 && model.trainedSamples >= 1000 &&
    model.w1.length === inputs * hidden && model.b1.length === hidden &&
    model.w2.length === outputs * hidden && model.b2.length === outputs;
}

export function predictPortalShot(
  distance: number, heightUp: number, windAlong: number,
  entryX: number, entryY: number, exitX: number, exitY: number,
  weapon: WeaponDefinition,
  model: PortalModelData = portalAIModel
): { elevation: number; power: number } | null {
  if (!isPortalAIModelValid(model)) return null;
  const d = clamp((distance - 150) / 1000, 0, 1);
  const input = [d * 2 - 1, clamp(heightUp / 180, -1, 1), clamp(windAlong / 3, -1, 1),
    clamp(entryX / 1100, 0, 1) * 2 - 1, clamp(entryY / 320, -1, 1),
    clamp(exitX / 1300, 0, 1) * 2 - 1, clamp(exitY / 320, -1, 1),
    clamp((weapon.projectileSpeedMultiplier - 0.8) / 0.6, 0, 1) * 2 - 1,
    clamp((weapon.gravityMultiplier - 0.7) / 0.6, 0, 1) * 2 - 1,
    clamp((weapon.windMultiplier - 0.3) / 0.7, 0, 1) * 2 - 1];
  const hiddenValues = new Array<number>(model.architecture.hidden);
  for (let h = 0; h < hiddenValues.length; h++) {
    let sum = model.b1[h];
    for (let i = 0; i < input.length; i++) sum += model.w1[h * input.length + i] * input[i];
    hiddenValues[h] = Math.tanh(sum);
  }
  const output = [0, 0];
  for (let o = 0; o < 2; o++) {
    let sum = model.b2[o];
    for (let h = 0; h < hiddenValues.length; h++) sum += model.w2[o * hiddenValues.length + h] * hiddenValues[h];
    output[o] = 1 / (1 + Math.exp(-sum));
  }
  return { elevation: clamp(18 + output[0] * 62, 18, 80), power: clamp(POWER_RANGE.min + output[1] * 670, POWER_RANGE.min, POWER_RANGE.max) };
}

