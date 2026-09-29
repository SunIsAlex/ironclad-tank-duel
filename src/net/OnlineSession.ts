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
type Listener = (message: SessionMessage) => void;

export class OnlineSession {
  roomCode = '';
  localPlayer = 0;
  remoteInput: OnlineInput = { move: 0, angle: 45, power: 400, fire: 0, switchWeapon: 0, detonate: 0 };
  remoteInputAt = 0;
  private apiUrl = import.meta.env.VITE_ONLINE_API_URL || `${location.origin}/online`;
  private token = '';
  private cursor = 0;
  private stopped = false;
  private pollController: AbortController | null = null;
  private commandQueue = Promise.resolve();
  private listeners = new Map<string, Set<Listener>>();

  on(type: string, listener: Listener): () => void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  create(name: string): void {
    void this.openRoom({ action: 'create', name });
  }

  join(code: string, name: string): void {
    void this.openRoom({ action: 'join', code: code.toUpperCase(), name });
  }

  start(seed: string, player1Name: string, player2Name: string, settings: OnlineStartData['settings']): void {
    this.send({ type: 'start', seed, player1Name, player2Name, settings });
  }

  sendInput(input: OnlineInput): void {
    this.send({ type: 'input', input });
  }

  close(): void {
    if (this.roomCode && this.token) {
      void fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'close', roomCode: this.roomCode, playerIndex: this.localPlayer, token: this.token }),
        cache: 'no-store',
      }).catch(() => undefined);
    }
    this.stopped = true;
    this.pollController?.abort();
  }

  private async openRoom(payload: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error || `联机服务返回 ${response.status}`));
      this.roomCode = String(result.code || '');
      this.localPlayer = Number(result.playerIndex || 0);
      this.token = String(result.token || '');
      this.cursor = Number(result.cursor || 0);
      this.emit(String(result.type), result);
      this.poll();
    } catch (error) {
      this.emit('error', { message: error instanceof Error ? error.message : '联机服务连接失败。' });
    }
  }

  private send(message: SessionMessage): void {
    this.commandQueue = this.commandQueue.then(async () => {
      if (this.stopped || !this.roomCode || !this.token) return;
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...message, roomCode: this.roomCode, playerIndex: this.localPlayer, token: this.token }),
        cache: 'no-store',
      });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(result.error || `联机服务返回 ${response.status}`));
    }).catch((error: unknown) => {
      this.emit('error', { message: error instanceof Error ? error.message : '联机消息发送失败。' });
    });
  }

  private async poll(): Promise<void> {
    while (!this.stopped && this.roomCode && this.token) {
      const url = new URL(this.apiUrl);
      url.searchParams.set('room', this.roomCode);
      url.searchParams.set('player', String(this.localPlayer));
      url.searchParams.set('token', this.token);
      url.searchParams.set('after', String(this.cursor));
      this.pollController = new AbortController();
      try {
        const response = await fetch(url, { cache: 'no-store', signal: this.pollController.signal });
        const result = await response.json() as { cursor?: number; events?: Array<{ seq: number; message: SessionMessage }>; error?: string };
        if (!response.ok) throw new Error(result.error || `联机服务返回 ${response.status}`);
        for (const event of result.events ?? []) {
          this.cursor = Math.max(this.cursor, event.seq);
          this.receive(event.message);
        }
        this.cursor = Math.max(this.cursor, Number(result.cursor || 0));
      } catch (error) {
        if (this.stopped) return;
        this.emit('disconnected', {});
        this.emit('error', { message: error instanceof Error ? error.message : '联机轮询失败。' });
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  private receive(message: SessionMessage): void {
    if (message.type === 'input') {
      this.remoteInput = message.input as OnlineInput;
      this.remoteInputAt = performance.now();
    }
    for (const listener of this.listeners.get(message.type) ?? []) listener(message);
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    const message = { type, ...payload };
    for (const listener of this.listeners.get(type) ?? []) listener(message);
  }
}
