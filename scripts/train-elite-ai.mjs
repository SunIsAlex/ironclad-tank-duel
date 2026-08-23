import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'src/models/elite-ai-model.json');
const INPUTS = 9;
const HIDDEN = 24;
const OUTPUTS = 2;
const GRAVITY = 520;
const WIND_SCALE = 55;
const POWER_MIN = 150;
const POWER_MAX = 820;
const WEAPON_PHYSICS = [
  [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 0.8], [1, 1.1, 0.6],
  [0.85, 1.25, 0.7], [1, 1, 0.6], [1.35, 0.72, 0.3], [1, 1, 0.85],
  [0.9, 1.05, 0.65], [1, 1, 0.8],
  [1.02, 1, 0.9], [1, 0.95, 0.75], [0.96, 0.9, 0.7], [0.9, 1.12, 0.55], [0.78, 1.35, 0.45],
];

let state = 0xe11e7a1;
function random() {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return (state >>> 0) / 4294967296;
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sigmoid = (value) => 1 / (1 + Math.exp(-value));

function features(distance, heightUp, windAlong, speed, gravity, windMultiplier) {
  const d = clamp((distance - 150) / 1000, 0, 1);
  const h = clamp(heightUp / 180, -1, 1);
  const w = clamp(windAlong / 3, -1, 1);
  return [
    d * 2 - 1, h, w, d * h, d * w, h * w,
    clamp((speed - 0.8) / 0.6, 0, 1) * 2 - 1,
    clamp((gravity - 0.7) / 0.6, 0, 1) * 2 - 1,
    clamp((windMultiplier - 0.3) / 0.7, 0, 1) * 2 - 1,
  ];
}

function expertShot(distance, heightUp, windAlong, speedMultiplier, gravityMultiplier, windMultiplier) {
  const sightAngle = Math.atan2(heightUp, distance) * 180 / Math.PI;
  // 精英 AI 使用略低的中弹道，并严格复现游戏中炮弹从炮管前方 30px
  // 出生的坐标；旧训练从坦克中心起算，会把这段高度重复计算而系统性偏高。
  const angle = clamp(43.5 + sightAngle * 0.5, 30, 64);
  const radians = angle * Math.PI / 180;
  let bestPower = 500;
  let bestScore = Infinity;
  for (let power = 150; power <= POWER_MAX; power += 5) {
    let x = Math.cos(radians) * 30;
    let y = Math.sin(radians) * 30;
    let vx = Math.cos(radians) * power * speedMultiplier;
    let vy = Math.sin(radians) * power * speedMultiplier;
    let nearest = Infinity;
    const dt = 0.04;
    for (let time = 0; time < 5; time += dt) {
      vx += windAlong * WIND_SCALE * windMultiplier * dt;
      vy -= GRAVITY * gravityMultiplier * dt;
      x += vx * dt; y += vy * dt;
      nearest = Math.min(nearest, Math.hypot(x - distance, y - heightUp));
      if (x > distance + 110 || x < -60 || y < -500) break;
    }
    if (nearest < bestScore) { bestScore = nearest; bestPower = power; }
  }
  return [(angle - 18) / 62, (bestPower - POWER_MIN) / (POWER_MAX - POWER_MIN)];
}

function dataset(count) {
  return Array.from({ length: count }, (_, index) => {
    const physics = WEAPON_PHYSICS[index % WEAPON_PHYSICS.length];
    const distance = 180 + random() * 970;
    const heightUp = -150 + random() * 300;
    const windAlong = -3 + random() * 6;
    return {
      x: features(distance, heightUp, windAlong, ...physics),
      y: expertShot(distance, heightUp, windAlong, ...physics),
    };
  });
}

function parameters() {
  const scale1 = Math.sqrt(2 / (INPUTS + HIDDEN));
  const scale2 = Math.sqrt(2 / (HIDDEN + OUTPUTS));
  return {
    w1: Array.from({ length: HIDDEN * INPUTS }, () => (random() * 2 - 1) * scale1),
    b1: Array(HIDDEN).fill(0),
    w2: Array.from({ length: OUTPUTS * HIDDEN }, () => (random() * 2 - 1) * scale2),
    b2: Array(OUTPUTS).fill(0),
  };
}

function forward(p, input) {
  const hidden = Array(HIDDEN);
  for (let h = 0; h < HIDDEN; h++) {
    let sum = p.b1[h];
    for (let i = 0; i < INPUTS; i++) sum += p.w1[h * INPUTS + i] * input[i];
    hidden[h] = Math.tanh(sum);
  }
  const output = Array(OUTPUTS);
  for (let o = 0; o < OUTPUTS; o++) {
    let sum = p.b2[o];
    for (let h = 0; h < HIDDEN; h++) sum += p.w2[o * HIDDEN + h] * hidden[h];
    output[o] = sigmoid(sum);
  }
  return { hidden, output };
}

function train(p, rows, epochs = 80) {
  const names = ['w1', 'b1', 'w2', 'b2'];
  const m1 = Object.fromEntries(names.map((name) => [name, p[name].map(() => 0)]));
  const m2 = Object.fromEntries(names.map((name) => [name, p[name].map(() => 0)]));
  let step = 0;
  for (let epoch = 0; epoch < epochs; epoch++) for (let n = 0; n < rows.length; n++) {
    const row = rows[Math.floor(random() * rows.length)];
    const { hidden, output } = forward(p, row.x);
    const d2 = output.map((value, o) => (value - row.y[o]) * value * (1 - value));
    const g = { w1: Array(HIDDEN * INPUTS).fill(0), b1: Array(HIDDEN).fill(0), w2: Array(OUTPUTS * HIDDEN).fill(0), b2: [...d2] };
    for (let o = 0; o < OUTPUTS; o++) for (let h = 0; h < HIDDEN; h++) g.w2[o * HIDDEN + h] = d2[o] * hidden[h];
    for (let h = 0; h < HIDDEN; h++) {
      let downstream = 0;
      for (let o = 0; o < OUTPUTS; o++) downstream += p.w2[o * HIDDEN + h] * d2[o];
      const delta = downstream * (1 - hidden[h] ** 2);
      g.b1[h] = delta;
      for (let i = 0; i < INPUTS; i++) g.w1[h * INPUTS + i] = delta * row.x[i];
    }
    step++;
    for (const name of names) for (let i = 0; i < p[name].length; i++) {
      const gradient = clamp(g[name][i], -1, 1);
      m1[name][i] = 0.9 * m1[name][i] + 0.1 * gradient;
      m2[name][i] = 0.999 * m2[name][i] + 0.001 * gradient ** 2;
      const m = m1[name][i] / (1 - 0.9 ** step);
      const v = m2[name][i] / (1 - 0.999 ** step);
      p[name][i] -= 0.0023 * m / (Math.sqrt(v) + 1e-8);
    }
  }
}

function validate(p, rows) {
  let angle = 0, power = 0;
  for (const row of rows) {
    const prediction = forward(p, row.x).output;
    angle += Math.abs(prediction[0] - row.y[0]) * 62;
    power += Math.abs(prediction[1] - row.y[1]) * (POWER_MAX - POWER_MIN);
  }
  return { angleMae: angle / rows.length, powerMae: power / rows.length };
}

const training = dataset(3200);
const validation = dataset(440);
const p = parameters();
train(p, training);
const metrics = validate(p, validation);
const rounded = Object.fromEntries(Object.entries(p).map(([name, values]) => [name, values.map((value) => Number(value.toFixed(6)))]));
const model = {
  version: 2,
  architecture: { inputs: INPUTS, hidden: HIDDEN, outputs: OUTPUTS, activation: 'tanh/sigmoid' },
  trainedSamples: training.length,
  trainedWeaponProfiles: WEAPON_PHYSICS.length,
  validation: { angleMae: Number(metrics.angleMae.toFixed(2)), powerMae: Number(metrics.powerMae.toFixed(2)) },
  ...rounded,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(model)}\n`, 'utf8');
console.log(`Elite AI model saved to ${outputPath}`);
console.log(`Profiles: ${model.trainedWeaponProfiles}; validation MAE: ${model.validation.angleMae}° / ${model.validation.powerMae} power`);
