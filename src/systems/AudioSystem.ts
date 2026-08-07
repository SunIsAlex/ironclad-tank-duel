// 程序化生成短音效，无外部资源
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  masterVolume = 0.8;
  sfxVolume = 0.8;
  musicVolume = 0.6;
  private muted = false;
  private initialized = false;

  init(): boolean {
    if (this.initialized) return true;
    try {
      const Ctor: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.sfxGain.gain.value = this.sfxVolume;
      this.musicGain.gain.value = this.musicVolume;
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
      return true;
    } catch {
      this.ctx = null;
      this.initialized = false;
      return false;
    }
  }

  setMasterVolume(v: number): void {
    this.masterVolume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }
  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    if (this.sfxGain) this.sfxGain.gain.value = v;
  }
  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => undefined);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.masterVolume;
  }

  isMuted(): boolean {
    return this.muted;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private playTone(opts: {
    type: OscillatorType;
    startFreq: number;
    endFreq?: number;
    duration: number;
    volume?: number;
    target?: 'sfx' | 'master';
  }): void {
    if (!this.ctx || !this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.startFreq, now);
    if (opts.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.endFreq), now + opts.duration);
    }
    const vol = opts.volume ?? 0.3;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
    osc.connect(gain);
    if (opts.target === 'master' && this.masterGain) gain.connect(this.masterGain);
    else if (this.sfxGain) gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + opts.duration + 0.02);
  }

  private playNoise(opts: {
    duration: number;
    volume?: number;
    filterType?: BiquadFilterType;
    filterFreq?: number;
    filterQ?: number;
  }): void {
    if (!this.ctx || !this.initialized || this.muted) return;
    const now = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * opts.duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(opts.volume ?? 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
    let node: AudioNode = src;
    if (opts.filterType) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = opts.filterType;
      filter.frequency.value = opts.filterFreq ?? 1000;
      filter.Q.value = opts.filterQ ?? 0.7;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + opts.duration + 0.02);
  }

  click(): void {
    this.playTone({ type: 'square', startFreq: 440, endFreq: 660, duration: 0.05, volume: 0.15 });
  }

  fire(): void {
    this.playTone({ type: 'sawtooth', startFreq: 220, endFreq: 80, duration: 0.18, volume: 0.35 });
    this.playNoise({ duration: 0.1, volume: 0.25, filterType: 'lowpass', filterFreq: 800 });
  }

  projectileFly(): void {
    // 不强求
  }

  explosion(): void {
    this.playNoise({ duration: 0.4, volume: 0.5, filterType: 'lowpass', filterFreq: 600 });
    this.playTone({ type: 'sine', startFreq: 120, endFreq: 40, duration: 0.35, volume: 0.5 });
  }

  tankMove(): void {
    this.playTone({ type: 'square', startFreq: 90, endFreq: 110, duration: 0.04, volume: 0.08 });
  }

  tankHit(): void {
    this.playTone({ type: 'square', startFreq: 300, endFreq: 120, duration: 0.15, volume: 0.25 });
  }

  turnSwitch(): void {
    this.playTone({ type: 'triangle', startFreq: 600, endFreq: 900, duration: 0.18, volume: 0.18 });
  }

  victory(): void {
    if (!this.ctx || !this.initialized) return;
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => {
      setTimeout(() => {
        this.playTone({ type: 'triangle', startFreq: f, duration: 0.25, volume: 0.4 });
      }, i * 140);
    });
  }

  dispose(): void {
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // ignore
      }
      this.ctx = null;
    }
    this.initialized = false;
  }
}

export const audioSystem = new AudioSystem();
