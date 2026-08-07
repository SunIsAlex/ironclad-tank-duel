# 铁甲对决 · 坦克炮战

支持人机对战与本地双人模式的 2D 坦克炮战游戏。玩家可以挑战离线 AI 小模型，也可以让两名玩家使用**同一台设备**轮流操作。比赛采用五局三胜：小局胜者继承剩余血量，败者恢复初始血量；每局最多 10 个操作回合，第 11 回合开始时按血量裁决。炮弹受重力与风力影响飞行，命中后会爆炸、修改地形并造成范围伤害。

## 项目概述

- **游戏名称**：铁甲对决（原创名称，与任何现有游戏无关）
- **核心玩法**：本地 Hot-seat 双人回合制 2D 炮战；可破坏地形；多种原创武器；风力影响弹道
- **技术栈**：Vite + TypeScript + HTML5 Canvas 2D + CSS3 + Web Audio API + Pointer Events + localStorage + PWA Service Worker
- **无后端 / 无联网 / 无账号**
- **双层离线 AI**：普通 AI 使用 `6→16→2` 人类化模型；精英 AI 使用按 11 种武器、风向、距离和高差训练的 `9→24→2` 多武器模型
- **自对战武器策略**：普通/精英 AI 在六类距离与风况中模拟超过 26 万场武器对局，按条件胜率购买和选用武器
- **双向黑洞**：部分回合随机出现蓝/红黑洞，炮弹进入一端后从另一端反向平行射出；AI 使用专门的黑洞模型和传送弹道搜索
- **局间军械商店**：每局双方获得 700 点，胜者额外获得 350 点；可购买十种特殊武器，点数与剩余弹药跨局保留
- **主动集束释放**：萤雨集束弹飞行时再次按空格或发射键释放子弹，AI 会在母弹抵达目标上方时自动释放
- **多彩曳光拖影**：每种炮弹拥有独立的尾迹颜色、持续时间、宽度与发光强度，高速弹与重型弹呈现不同轨迹质感
- **架构**：
  - `core/`：Game、GameLoop、SceneManager、EventBus、Constants
  - `scenes/`：MainMenu、Battle、Pause、Result（状态机驱动的回合流程）
  - `systems/`：Terrain、Projectile、Collision、Damage、Camera、Particle、Audio、Turn、Input、MobileControls、Save
  - `entities/`：Tank、Projectile、Particle
  - `weapons/`：WeaponDefinition、WeaponRegistry
  - `rendering/`：Renderer、BackgroundRenderer、TerrainRenderer、HudRenderer
  - `ui/`：MainMenu、BattleHud、TouchControls、SettingsPanel、ResultPanel
  - `config/`：gameConfig、weaponConfig
  - `types/`：核心数据结构
  - `utils/`：math、random、geometry、device、objectPool
- **地形破坏方案**：
  1. 离屏 Canvas 保存实体地形像素（草层 / 土层 + 高光线 + 草点装饰）
  2. 1D `heightMap` 记录每列地表 Y
  3. 低分辨率 `mask`（4×4 像素 / 格）用于快速碰撞检测
  4. 爆炸时用 `globalCompositeOperation = 'destination-out'` 擦除圆形 / 不规则形状
  5. 受影响 x 区间重新计算 `heightMap`，避免整张 `getImageData`
  6. 坦克落地用 `findSupportY` 在掩码上从上向下查找
- **移动端适配方案**：
  - Pointer Events 统一鼠标与触摸
  - 底部触控面板（左移动 / 中瞄准力度 / 右武器发射），按钮 ≥ 48×48
  - `env(safe-area-inset-*)` 适配刘海屏与底部手势条
  - `devicePixelRatio` 限制最大为 2
  - 横屏为主，竖屏显示半透明提示
  - 首次 pointerdown / keydown 解锁 AudioContext
  - `touch-action: none` + `overscroll-behavior: none` 阻止页面滚动与双击缩放
  - `visibilitychange` 清空所有持续输入状态

## 目录结构

```
tank/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ MANUAL_TEST.md
├─ README.md
├─ prompt.md
├─ public/
│  ├─ favicon.png
│  ├─ manifest.webmanifest
│  ├─ sw.js
│  └─ icons/
│     ├─ icon-192.png
│     └─ icon-512.png
├─ tests/
│  ├─ ballistics.test.ts
│  ├─ damage.test.ts
│  ├─ projectile.test.ts
│  ├─ terrain.test.ts
│  ├─ turn.test.ts
│  └─ weapons.test.ts
└─ src/
   ├─ main.ts
   ├─ styles/
   │  ├─ reset.css
   │  ├─ game.css
   │  └─ mobile.css
   ├─ core/
   │  ├─ Game.ts
   │  ├─ GameLoop.ts
   │  ├─ SceneManager.ts
   │  ├─ EventBus.ts
   │  └─ Constants.ts
   ├─ scenes/
   │  ├─ MainMenuScene.ts
   │  ├─ BattleScene.ts
   │  ├─ PauseScene.ts
   │  └─ ResultScene.ts
   ├─ entities/
   │  ├─ Tank.ts
   │  ├─ Projectile.ts
   │  └─ Particle.ts
   ├─ systems/
   │  ├─ TurnManager.ts
   │  ├─ InputManager.ts
   │  ├─ MobileControls.ts
   │  ├─ TerrainSystem.ts
   │  ├─ ProjectileSystem.ts
   │  ├─ CollisionSystem.ts
   │  ├─ DamageSystem.ts
   │  ├─ CameraSystem.ts
   │  ├─ ParticleSystem.ts
   │  ├─ AudioSystem.ts
   │  └─ SaveSystem.ts
   ├─ weapons/
   │  ├─ WeaponDefinition.ts
   │  └─ WeaponRegistry.ts
   ├─ rendering/
   │  ├─ Renderer.ts
   │  ├─ BackgroundRenderer.ts
   │  ├─ TerrainRenderer.ts
   │  └─ HudRenderer.ts
   ├─ ui/
   │  ├─ MainMenu.ts
   │  ├─ BattleHud.ts
   │  ├─ TouchControls.ts
   │  ├─ SettingsPanel.ts
   │  └─ ResultPanel.ts
   ├─ config/
   │  ├─ gameConfig.ts
   │  └─ weaponConfig.ts
   ├─ types/
   │  └─ index.ts
   └─ utils/
      ├─ math.ts
      ├─ random.ts
      ├─ geometry.ts
      ├─ device.ts
      └─ objectPool.ts
```

## 安装和运行

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 重新生成训练样本并训练离线 AI 权重
npm run train:ai

# 重新训练精英多武器 AI
npm run train:ai:elite

# 重新模拟 AI 武器对战并训练购买/选弹策略
npm run train:ai:weapons

# 重新训练黑洞入口瞄准模型
npm run train:ai:portals

# 预览生产构建
npm run preview

# 运行单元测试
npm test
```

开发服务器启动后，按提示在桌面 Chrome / Edge 或 Android Chrome 中打开。

## 测试说明

### 自动测试

```bash
npm test
```

Vitest 覆盖：
- 离线 AI 模型完整性、参数规模与推理输出（`tests/ai.test.ts`）
- 角度与力度转换为初速度（`tests/ballistics.test.ts`）
- 风力影响（`tests/ballistics.test.ts`、`tests/turn.test.ts` 中 windStrength 边界）
- 爆炸伤害距离衰减与直接命中奖励（`tests/damage.test.ts`）
- 武器弹药扣除与无限弹药（`tests/weapons.test.ts`）
- 回合切换与跳过死亡坦克（`tests/turn.test.ts`）
- 胜负判断与平局（`tests/turn.test.ts`）
- 随机地图种子复现（`tests/terrain.test.ts`）
- 世界边界处理与炮弹超时销毁（`tests/projectile.test.ts`）
- 分段碰撞检测（`tests/projectile.test.ts`）

### 桌面端测试方式

1. `npm run dev`
2. 在 Chrome 打开 `http://localhost:5173/`
3. 按 `MANUAL_TEST.md` 逐项验证

### Android Chrome 测试方式

1. `npm run dev -- --host`
2. 让手机与电脑同 Wi-Fi，在手机 Chrome 打开 `http://<电脑IP>:5173/`
3. 或：`npm run build && npm run preview -- --host` 后访问预览地址
4. 横屏使用，按 `MANUAL_TEST.md` 第三节与第十三节验证触控

### PWA 离线测试方式

1. `npm run build`
2. `npm run preview`
3. 首次完整加载一次
4. 打开 DevTools → Application → Service Workers 确认注册成功
5. 在 DevTools → Network 勾选 Offline
6. 刷新页面，仍可进入主菜单并完整对战

## 人工验收清单

见 `MANUAL_TEST.md`。
