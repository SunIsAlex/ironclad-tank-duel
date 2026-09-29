import type { GameSettings } from '../types';

export interface OnlineStartData {
  seed: string;
  player1Name: string;
  player2Name: string;
  playerIndex: number;
  settings: Pick<GameSettings, 'mapPreset' | 'turnTime' | 'initialHealth' | 'windStrength' | 'movementFuel'>;
}

export interface OnlineInput {
  move: -1 | 0 | 1;
  angle: number;
  power: number;
  fire: number;
  switchWeapon: number;
  detonate: number;
}

type SessionMessage = Record<string, unknown> & { type: string };

export class OnlineSession {
  socket: WebSocket;
  roomCode = '';
  localPlayer = 0;
  remoteInput: OnlineInput = { move: 0, angle: 45, power: 400, fire: 0, switchWeapon: 0, detonate: 0 };
  remoteInputAt = 0;
  private listeners = new Map<string, Set<(message: SessionMessage) => void>>();

  constructor() {
    const configuredUrl = import.meta.env.VITE_ONLINE_WS_URL;
    const url = configuredUrl || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/online`;
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event) => {
      let message: SessionMessage;
      try {
        message = JSON.parse(String(event.data)) as SessionMessage;
      } catch {
        return;
      }
      if (message.type === 'input') {
        this.remoteInput = message.input as OnlineInput;
        this.remoteInputAt = performance.now();
      }
      for (const listener of this.listeners.get(message.type) ?? []) listener(message);
    });
    this.socket.addEventListener('close', () => this.emit('disconnected', {}));
    this.socket.addEventListener('error', () => this.emit('error', { message: '联机连接失败，请检查 EdgeOne Pages 部署配置。' }));
  }

  on(type: string, listener: (message: SessionMessage) => void): () => void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  create(name: string): void {
    this.send({ type: 'create', name });
  }

  join(code: string, name: string): void {
    this.send({ type: 'join', code: code.toUpperCase(), name });
  }

  start(seed: string, player1Name: string, player2Name: string, settings: OnlineStartData['settings']): void {
    this.send({ type: 'start', seed, player1Name, player2Name, settings });
  }

  sendInput(input: OnlineInput): void {
    this.send({ type: 'input', input });
  }

  close(): void {
    this.socket.close();
  }

  private send(message: SessionMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
    else this.socket.addEventListener('open', () => this.socket.send(JSON.stringify(message)), { once: true });
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, ...payload });
  }
}
