import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'src/models/offline-ai-model.json');
const INPUTS = 6;
const HIDDEN = 16;
const OUTPUTS = 2;
const GRAVITY = 520;
const WIND_SCALE = 55;
const POWER_MIN = 150;
const POWER_MAX = 820;

let randomState = 0x5eed1234;
function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4294967296;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function features(distance, heightUp, windAlong) {
  const d = clamp((distance - 150) / 1000, 0, 1);
  const h = clamp(heightUp / 180, -1, 1);
  const w = clamp(windAlong / 3, -1, 1);
  return [d * 2 - 1, h, w, d * h, d * w, h * w];
}

function expertShot(distance, heightUp, windAlong) {
  // 固定为连续的“中弹道”风格，再只搜索力度。这样不会因多个等价抛物线
  // 随机切换标签，小网络也能学到玩家逐渐校准力度的规律。
  const lineOfSightAngle = Math.atan2(heightUp, distance) * 180 / Math.PI;
  const angle = clamp(46 + lineOfSightAngle * 0.45, 32, 66);
  const radians = angle * Math.PI / 180;
  let best = { angle, power: 500, score: Infinity };
  for (let power = 170; power <= POWER_MAX; power += 10) {
    let x = 0;
    let y = 0;
    let vx = Math.cos(radians) * power;
    let vy = Math.sin(radians) * power;
    let nearest = Infinity;
    const dt = 0.04;
    for (let time = 0; time < 5; time += dt) {
      vx += windAlong * WIND_SCALE * dt;
      vy -= GRAVITY * dt;
      x += vx * dt;
      y += vy * dt;
      nearest = Math.min(nearest, Math.hypot(x - distance, y - heightUp));
      if (x > distance + 100 || x < -50 || y < -450) break;
    }
    if (nearest < best.score) best = { angle, power, score: nearest };
  }
  return [
    (best.angle - 18) / 62,
    (best.power - POWER_MIN) / (POWER_MAX - POWER_MIN),
  ];
}

function makeDataset(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const distance = 180 + random() * 970;
    const heightUp = -150 + random() * 300;
    const windAlong = -3 + random() * 6;
    rows.push({
      x: features(distance, heightUp, windAlong),
      y: expertShot(distance, heightUp, windAlong),
    });
  }
  return rows;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function createParameters() {
  const scale1 = Math.sqrt(2 / (INPUTS + HIDDEN));
  const scale2 = Math.sqrt(2 / (HIDDEN + OUTPUTS));
  return {
    w1: Array.from({ length: HIDDEN * INPUTS }, () => (random() * 2 - 1) * scale1),
    b1: Array(HIDDEN).fill(0),
    w2: Array.from({ length: OUTPUTS * HIDDEN }, () => (random() * 2 - 1) * scale2),
    b2: Array(OUTPUTS).fill(0),
  };
}

function forward(parameters, input) {
  const hidden = Array(HIDDEN);
  for (let h = 0; h < HIDDEN; h++) {
    let sum = parameters.b1[h];
    for (let i = 0; i < INPUTS; i++) sum += parameters.w1[h * INPUTS + i] * input[i];
    hidden[h] = Math.tanh(sum);
  }
  const output = Array(OUTPUTS);
  for (let o = 0; o < OUTPUTS; o++) {
    let sum = parameters.b2[o];
    for (let h = 0; h < HIDDEN; h++) sum += parameters.w2[o * HIDDEN + h] * hidden[h];
    output[o] = sigmoid(sum);
  }
  return { hidden, output };
}

function train(parameters, rows, epochs = 70) {
  const names = ['w1', 'b1', 'w2', 'b2'];
  const moment1 = Object.fromEntries(names.map((name) => [name, parameters[name].map(() => 0)]));
  const moment2 = Object.fromEntries(names.map((name) => [name, parameters[name].map(() => 0)]));
  let step = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let n = 0; n < rows.length; n++) {
      const row = rows[Math.floor(random() * rows.length)];
      const { hidden, output } = forward(parameters, row.x);
      const delta2 = output.map((value, o) => (value - row.y[o]) * value * (1 - value));
      const gradients = {
        w1: Array(HIDDEN * INPUTS).fill(0),
        b1: Array(HIDDEN).fill(0),
        w2: Array(OUTPUTS * HIDDEN).fill(0),
        b2: [...delta2],
      };
      for (let o = 0; o < OUTPUTS; o++) {
        for (let h = 0; h < HIDDEN; h++) gradients.w2[o * HIDDEN + h] = delta2[o] * hidden[h];
      }
      for (let h = 0; h < HIDDEN; h++) {
        let downstream = 0;
        for (let o = 0; o < OUTPUTS; o++) downstream += parameters.w2[o * HIDDEN + h] * delta2[o];
        const delta = downstream * (1 - hidden[h] * hidden[h]);
        gradients.b1[h] = delta;
        for (let i = 0; i < INPUTS; i++) gradients.w1[h * INPUTS + i] = delta * row.x[i];
      }

      step++;
      const learningRate = 0.0025;
      for (const name of names) {
        for (let i = 0; i < parameters[name].length; i++) {
          const gradient = clamp(gradients[name][i], -1, 1);
          moment1[name][i] = 0.9 * moment1[name][i] + 0.1 * gradient;
          moment2[name][i] = 0.999 * moment2[name][i] + 0.001 * gradient * gradient;
          const m = moment1[name][i] / (1 - 0.9 ** step);
          const v = moment2[name][i] / (1 - 0.999 ** step);
          parameters[name][i] -= learningRate * m / (Math.sqrt(v) + 1e-8);
        }
      }
    }
  }
}

function validate(parameters, rows) {
  let angleError = 0;
  let powerError = 0;
  for (const row of rows) {
    const prediction = forward(parameters, row.x).output;
    angleError += Math.abs(prediction[0] - row.y[0]) * 62;
    powerError += Math.abs(prediction[1] - row.y[1]) * (POWER_MAX - POWER_MIN);
  }
  return {
    angleMae: angleError / rows.length,
    powerMae: powerError / rows.length,
  };
}

const trainingRows = makeDataset(1800);
const validationRows = makeDataset(240);
const parameters = createParameters();
train(parameters, trainingRows);
const metrics = validate(parameters, validationRows);
const rounded = Object.fromEntries(
  Object.entries(parameters).map(([name, values]) => [name, values.map((value) => Number(value.toFixed(6)))])
);
const model = {
  version: 1,
  architecture: { inputs: INPUTS, hidden: HIDDEN, outputs: OUTPUTS, activation: 'tanh/sigmoid' },
  trainedSamples: trainingRows.length,
  validation: {
    angleMae: Number(metrics.angleMae.toFixed(2)),
    powerMae: Number(metrics.powerMae.toFixed(2)),
  },
  ...rounded,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(model)}\n`, 'utf8');
console.log(`Offline AI model saved to ${outputPath}`);
console.log(`Validation MAE: ${model.validation.angleMae}° / ${model.validation.powerMae} power`);
