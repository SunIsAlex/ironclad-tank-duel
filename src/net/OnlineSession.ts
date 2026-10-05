import type { GameSettings } from '../types';

export interface OnlineStartData {
  seed: string;
  player1Name: string;
  player2Name: string;
  playerIndex: number;
  settings: Pick<GameSettings, 'mapPreset' | 'turnTime' | 'initialHealth' | 'windStrength' | 'movementFuel'> &
    Partial<Pick<GameSettings, 'gameVariant'>>;
}

/**
 * 当前操作方坦克的权威状态。对手端不再按移动方向自行模拟，而是直接采用
 * 这里的位置、血量和武器，保证双方开火时的弹道起点完全一致。
 */
export interface OnlineInput {
  /** 回合标识（局数与回合数），用于忽略上一回合遗留的状态 */
  turn: number;
  move: -1 | 0 | 1;
  x: number;
  y: number;
  angle: number;
  power: number;
  health: number;
  fuel: number;
  weaponId: string;
  /** 开火序号：每次开火 +1 */
  fire: number;
  /** 放弃回合序号：超时或坦克在操作阶段阵亡时 +1 */
  pass: number;
  /** 本次开火后已完成的弹道步数，用于同步集束弹释放时机 */
  flightTick: number;
  /** 集束弹释放所在弹道步数 + 1；0 表示尚未释放 */
  detonateAt: number;
}

type SessionMessage = Record<string, unknown> & { type: string };
type Listener = (message: SessionMessage) => void;

export class OnlineSession {
  roomCode = '';
  localPlayer = 0;
  remoteInput: OnlineInput | null = null;
  remoteInputAt = 0;
  opponentLeft = false;
  private apiUrl = import.meta.env.VITE_ONLINE_API_URL || `${location.origin}/online`;
  private token = '';
  private cursor = 0;
  private stopped = false;
  private pollController: AbortController | null = null;
  private commandQueue = Promise.resolve();
  private pendingInput: OnlineInput | null = null;
  private listeners = new Map<string, Set<Listener>>();

  /** 轮询已停止（对手离开、房间失效或本方已关闭），无法再收到对手操作。 */
  get ended(): boolean {
    return this.stopped;
  }

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

  /**
   * 每条输入都包含完整状态且序号只增不减，因此网络较慢时只需发送最新一条，
   * 避免请求在队列中无限堆积、延迟越来越大。
   */
  sendInput(input: OnlineInput, attempt = 0): void {
    const queued = this.pendingInput !== null;
    this.pendingInput = input;
    if (queued) return;
    this.commandQueue = this.commandQueue.then(async () => {
      const latest = this.pendingInput;
      this.pendingInput = null;
      if (!latest) return;
      try {
        await this.post({ type: 'input', input: latest });
      } catch (error) {
        this.emit('error', { message: error instanceof Error ? error.message : '联机消息发送失败。' });
        // 开火等关键输入之后可能不再有新输入，失败时必须重发，否则对手会一直等待。
        if (!this.stopped && attempt < 5) {
          setTimeout(() => {
            if (!this.pendingInput) this.sendInput(latest, attempt + 1);
          }, 800);
        }
      }
    });
  }

  close(): void {
    if (this.roomCode && this.token) {
      void fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'close', roomCode: this.roomCode, playerIndex: this.localPlayer, token: this.token }),
        cache: 'no-store',
        keepalive: true,
      }).catch(() => undefined);
    }
    // 只通知一次离开，避免重复 close 触发无效请求。
    this.token = '';
    this.stopped = true;
    this.pollController?.abort();
    window.removeEventListener('pagehide', this.handlePageHide);
  }

  private handlePageHide = (): void => this.close();

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
      if (this.stopped) {
        // 请求期间大厅已关闭：立即离开刚创建/加入的房间。
        this.close();
        return;
      }
      // 关闭或刷新页面时通知对手，否则对方会一直等待本方操作。
      window.addEventListener('pagehide', this.handlePageHide);
      this.emit(String(result.type), result);
      this.poll();
    } catch (error) {
      this.emit('error', { message: error instanceof Error ? error.message : '联机服务连接失败。' });
    }
  }

  private send(message: SessionMessage): void {
    this.commandQueue = this.commandQueue.then(() => this.post(message)).catch((error: unknown) => {
      this.emit('error', { message: error instanceof Error ? error.message : '联机消息发送失败。' });
    });
  }

  private async post(message: SessionMessage): Promise<void> {
    if (this.stopped || !this.roomCode || !this.token) return;
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, roomCode: this.roomCode, playerIndex: this.localPlayer, token: this.token }),
      cache: 'no-store',
    });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(result.error || `联机服务返回 ${response.status}`));
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
        if (!response.ok && [403, 404, 409].includes(response.status)) {
          // 房间已删除、过期或身份失效：重试不会恢复，停止轮询并通知界面。
          this.stopped = true;
          this.emit('disconnected', {});
          this.emit('error', { message: result.error || '联机房间已失效。' });
          return;
        }
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
    } else if (message.type === 'left') {
      this.opponentLeft = true;
      this.stopped = true;
    }
    for (const listener of this.listeners.get(message.type) ?? []) listener(message);
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    const message = { type, ...payload };
    for (const listener of this.listeners.get(type) ?? []) listener(message);
  }
}
