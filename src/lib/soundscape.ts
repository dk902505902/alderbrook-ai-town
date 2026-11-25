// 100% Procedural Web Audio API synthesizer for town chimes, decrees, and subtle breeze

class TownSoundscape {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private masterVolume = 0.75;
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

  public setVolume(pct: number): void {
    this.masterVolume = Math.max(0, Math.min(1, pct / 100));
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0.035 * this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  public getVolume(): number {
    return Math.round(this.masterVolume * 100);
  }

  public playTestChime(): void {
    const prev = this.enabled;
    if (!prev) {
      this.enabled = true;
    }
    this.playTone(523.25, 0.18, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.22, 'sine', 0.08, 0.08);
    this.playTone(783.99, 0.3, 'sine', 0.09, 0.16);
    if (!prev) {
      this.enabled = false;
    }
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
    gain.gain.value = 0.035 * this.masterVolume;

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

    const scaledVol = Math.max(0.0002, volume * this.masterVolume);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(scaledVol, now + 0.015);
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

  public playTrainHorn(): void {
    const prev = this.enabled;
    if (!prev) this.enabled = true;
    // Classic warm steam/express dual-tone chord (D4 + F#4 + A4)
    this.playTone(293.66, 0.48, 'sawtooth', 0.055, 0);
    this.playTone(369.99, 0.46, 'triangle', 0.06, 0.01);
    this.playTone(440.0, 0.44, 'triangle', 0.045, 0.02);
    this.playTone(293.66, 0.34, 'sawtooth', 0.045, 0.56);
    this.playTone(369.99, 0.32, 'triangle', 0.05, 0.57);
    if (!prev) this.enabled = false;
  }

  public playLaserZap(): void {
    const prev = this.enabled;
    if (!prev) this.enabled = true;
    const ctx = this.ensureContext();
    if (ctx) {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(190, now + 0.16);
      const scaled = Math.max(0.0002, 0.08 * this.masterVolume);
      gain.gain.setValueAtTime(scaled, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    }
    if (!prev) this.enabled = false;
  }

  public playCratePickup(): void {
    const prev = this.enabled;
    if (!prev) this.enabled = true;
    this.playTone(587.33, 0.14, 'triangle', 0.09, 0);
    this.playTone(880.0, 0.22, 'sine', 0.09, 0.07);
    this.playTone(1174.66, 0.26, 'sine', 0.08, 0.14);
    if (!prev) this.enabled = false;
  }

  public playElectionFanfare(): void {
    if (!this.enabled) return;
    this.playTone(392.0, 0.18, 'triangle', 0.08, 0);
    this.playTone(493.88, 0.18, 'triangle', 0.08, 0.11);
    this.playTone(587.33, 0.22, 'triangle', 0.09, 0.22);
    this.playTone(783.99, 0.45, 'sine', 0.1, 0.34);
  }

  public speakRadioHeadline(text: string, voiceEnabled: boolean): void {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.04;
      utter.pitch = 1.02;
      utter.volume = Math.max(0.15, Math.min(1, this.masterVolume));
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore browser speech synthesis restrictions
    }
  }

  public dispose(): void {
    this.stopAmbient();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

export const soundscape = new TownSoundscape();
