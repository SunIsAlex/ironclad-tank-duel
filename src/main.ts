import './styles/reset.css';
import './styles/game.css';
import './styles/mobile.css';
import { Game } from './core/Game';
import { audioSystem } from './systems/AudioSystem';

function bootstrap(): void {
  // 创建应用容器
  let app = document.getElementById('app');
  if (!app) {
    app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
  }
  // 创建 canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.setAttribute('aria-label', '坦克对战游戏画面');
  app.appendChild(canvas);

  try {
    const game = new Game(canvas);
    game.start();
    (window as any).__game = game;
  } catch (err) {
    console.error('游戏初始化失败', err);
    const fallback = document.createElement('div');
    fallback.style.padding = '20px';
    fallback.style.color = '#fff';
    fallback.textContent = '游戏初始化失败，请刷新或更换浏览器。';
    app.appendChild(fallback);
  }

  // 首次用户交互解锁音频
  const unlock = (): void => {
    audioSystem.init();
    audioSystem.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service Worker 注册失败', err);
      });
    });
  }
}

bootstrap();
