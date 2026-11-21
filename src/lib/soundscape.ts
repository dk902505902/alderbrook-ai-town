// 100% Procedural Web Audio API synthesizer for town chimes, decrees, and subtle breeze

class TownSoundscape {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private ambientGain: GainNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      const ctx = this.ensureContext();
      if (ctx) {
        this.startAmbient(ctx);
        this.playTone(523.25, 0.14, 'sine', 0.08);
      }
    } else {
      this.stopAmbient();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private startAmbient(ctx: AudioContext): void {
    if (this.ambientSource) return;
    // Soft filtered pink-ish noise breeze
    const sampleRate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2) * 0.18;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;

    const gain = ctx.createGain();
    gain.gain.value = 0.035;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    this.ambientSource = src;
    this.ambientGain = gain;
  }

  private stopAmbient(): void {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
        this.ambientSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.ambientSource = null;
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playAgentChime(rank: 1 | 2 | 3): void {
    if (!this.enabled) return;
    if (rank === 1) {
      // Mayor Sterling: noble two-note fifth
      this.playTone(392.0, 0.28, 'triangle', 0.09, 0);
      this.playTone(587.33, 0.36, 'sine', 0.08, 0.09);
    } else if (rank === 2) {
      // Managers: crisp bell chime
      this.playTone(523.25, 0.22, 'sine', 0.075, 0);
      this.playTone(659.25, 0.26, 'sine', 0.06, 0.07);
    } else {
      // Workers: warm wooden marimba tap
      this.playTone(440.0, 0.16, 'triangle', 0.07, 0);
    }
  }

  public playDecreeGong(): void {
    if (!this.enabled) return;
    this.playTone(196.0, 0.65, 'triangle', 0.12, 0);
    this.playTone(293.66, 0.55, 'sine', 0.08, 0.04);
    this.playTone(392.0, 0.45, 'sine', 0.06, 0.08);
  }

  public playBuildCompleteChime(): void {
    if (!this.enabled) return;
    this.playTone(523.25, 0.24, 'triangle', 0.08, 0);
    this.playTone(659.25, 0.26, 'sine', 0.08, 0.08);
    this.playTone(783.99, 0.42, 'sine', 0.09, 0.16);
  }

  public dispose(): void {
    this.stopAmbient();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const soundscape = new TownSoundscape();
