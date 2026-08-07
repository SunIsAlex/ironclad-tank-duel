import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'src/models/weapon-policy.json');
const profiles = [
  { id: 'basic_shell', damage: 42, radius: 52, count: 1, speed: 1, gravity: 1, wind: 1, behavior: 'standard' },
  { id: 'triple_scatter', damage: 22, radius: 38, count: 3, speed: 1, gravity: 1, wind: 1, behavior: 'scatter' },
  { id: 'air_split', damage: 18, radius: 34, count: 4, speed: 1, gravity: 1, wind: 1, behavior: 'split' },
  { id: 'bounce_shot', damage: 36, radius: 44, count: 1, speed: 1, gravity: 1, wind: 0.8, behavior: 'bounce' },
  { id: 'drill_shot', damage: 44, radius: 46, count: 1, speed: 1, gravity: 1.1, wind: 0.6, behavior: 'drill' },
  { id: 'heavy_impact', damage: 62, radius: 74, count: 1, speed: 0.85, gravity: 1.25, wind: 0.7, behavior: 'heavy' },
  { id: 'micro_cluster', damage: 14, radius: 26, count: 5, speed: 1, gravity: 1, wind: 0.6, behavior: 'cluster' },
  { id: 'aurora_needle', damage: 70, radius: 24, count: 1, speed: 1.35, gravity: 0.72, wind: 0.3, behavior: 'needle' },
  { id: 'tide_stream', damage: 13, radius: 25, count: 6, speed: 1, gravity: 1, wind: 0.85, behavior: 'stream' },
  { id: 'stone_runner', damage: 40, radius: 42, count: 1, speed: 0.9, gravity: 1.05, wind: 0.65, behavior: 'roller' },
  { id: 'sky_coordinates', damage: 19, radius: 30, count: 5, speed: 1, gravity: 1, wind: 0.8, behavior: 'airstrike' },
];
const contexts = {
  near_calm: { distance: 380, wind: 0.5 }, near_windy: { distance: 380, wind: 2.5 },
  mid_calm: { distance: 650, wind: 0.5 }, mid_windy: { distance: 650, wind: 2.5 },
  far_calm: { distance: 900, wind: 0.5 }, far_windy: { distance: 900, wind: 2.5 },
};
let state = 0x51f1a7e;
function random() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function behaviorFactor(behavior, distance, wind) {
  const range = distance < 500 ? 'near' : distance < 780 ? 'mid' : 'far';
  const factors = {
    standard: { near: 1, mid: 1, far: 0.96 }, scatter: { near: 1.2, mid: 1.1, far: 0.78 },
    split: { near: 0.72, mid: 1.18, far: 1.12 }, bounce: { near: 1.24, mid: 1.02, far: 0.82 },
    drill: { near: 1.18, mid: 1.12, far: 0.88 }, heavy: { near: 1.23, mid: 1.15, far: 0.58 },
    cluster: { near: 0.74, mid: 1.3, far: 1.04 }, needle: { near: 0.84, mid: 1.08, far: 1.38 },
    stream: { near: 1.14, mid: 1.18, far: 0.9 }, roller: { near: 1.52, mid: 1.05, far: 0.5 },
    airstrike: { near: 0.62, mid: 1.12, far: 1.48 },
  };
  let factor = factors[behavior][range];
  if (wind > 1.5 && behavior === 'needle') factor *= 1.18;
  if (wind > 1.5 && behavior === 'airstrike') factor *= 0.92;
  return factor;
}

function strength(profile, context, difficulty) {
  const maxRange = (820 * profile.speed) ** 2 / (520 * profile.gravity);
  const rangeRatio = context.distance / maxRange;
  let accuracy = clamp(0.94 - Math.max(0, rangeRatio - 0.62) * 1.25 - context.wind * profile.wind * 0.055, 0.08, 0.95);
  if (difficulty === 'normal') {
    accuracy *= 0.76;
    if (['split', 'cluster', 'bounce', 'roller', 'airstrike'].includes(profile.behavior)) accuracy *= 0.9;
  } else accuracy *= 0.94;
  const multiHit = 1 + Math.log2(profile.count) * 0.24;
  const blast = 0.68 + profile.radius / 115;
  return profile.damage * multiHit * blast * accuracy * behaviorFactor(profile.behavior, context.distance, context.wind);
}

function trainPolicy(difficulty) {
  const policy = {};
  let simulations = 0;
  for (const [contextName, context] of Object.entries(contexts)) {
    const results = {};
    for (const weapon of profiles) {
      let wins = 0;
      let games = 0;
      for (const opponent of profiles) for (let round = 0; round < 180; round++) {
        const ownScore = strength(weapon, context, difficulty) * (0.8 + random() * 0.4);
        const enemyDifficulty = random() < 0.5 ? 'normal' : 'elite';
        const enemyScore = strength(opponent, context, enemyDifficulty) * (0.8 + random() * 0.4);
        if (ownScore > enemyScore) wins++;
        games++;
      }
      results[weapon.id] = Number((wins / games).toFixed(4));
      simulations += games;
    }
    policy[contextName] = results;
  }
  return { policy, simulations };
}

const normal = trainPolicy('normal');
const elite = trainPolicy('elite');
const model = {
  version: 1,
  weaponProfiles: profiles.length,
  contexts: Object.keys(contexts),
  simulations: normal.simulations + elite.simulations,
  policies: { normal: normal.policy, elite: elite.policy },
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(model)}\n`, 'utf8');
console.log(`Weapon policy saved to ${outputPath}`);
console.log(`Simulated ${model.simulations} normal/elite AI weapon matchups across ${model.contexts.length} contexts.`);
for (const difficulty of ['normal', 'elite']) {
  console.log(`${difficulty}:`, Object.entries(model.policies[difficulty]).map(([context, rates]) => `${context}=${Object.entries(rates).sort((a,b) => b[1]-a[1])[0][0]}`).join(', '));
}

