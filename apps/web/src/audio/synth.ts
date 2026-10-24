import type { GameEvent } from '@money-tour/engine';

export interface AudioPreferences {
  effects: boolean;
  music: boolean;
  volume: number;
}
export function loadAudio(): AudioPreferences {
  try {
    const value = JSON.parse(
      localStorage.getItem('money-tour.audio') ?? 'null',
    ) as AudioPreferences | null;
    if (
      value &&
      typeof value.effects === 'boolean' &&
      typeof value.music === 'boolean' &&
      Number.isFinite(value.volume)
    )
      return { ...value, volume: Math.max(0, Math.min(1, value.volume)) };
  } catch {
    /* Use defaults when storage is unavailable. */
  }
  return { effects: true, music: false, volume: 0.4 };
}
const melodies: Record<string, number[]> = {
  dice: [392, 523, 440, 659, 523],
  move: [330, 440],
  purchase: [523, 659, 784],
  payment: [440, 330],
  build: [392, 523, 784],
  card: [587, 740, 880, 1174],
  victory: [523, 659, 784, 1047, 784, 1047],
  bankruptcy: [440, 392, 330, 220],
};
/** User-supplied music, CC0 interface samples and original synthesis for remaining effects. */
export class Soundscape {
  private closed = false;
  private appActive = true;
  private pageHidden = false;
  private readonly onVisibilityChange = () => {
    if (this.isForeground()) void this.resumeForeground();
    else this.suspendBackground();
  };
  private readonly onPageHide = () => {
    this.pageHidden = true;
    this.suspendBackground();
  };
  private readonly onPageShow = () => {
    this.pageHidden = false;
    void this.resumeForeground();
  };
  private readonly onFocus = () => {
    if (this.isForeground()) void this.resumeForeground();
  };
  constructor() {
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
      window.addEventListener('pageshow', this.onPageShow);
      window.addEventListener('focus', this.onFocus);
    }
  }
  private isForeground(): boolean {
    return (
      !this.closed &&
      this.appActive &&
      !this.pageHidden &&
      (typeof document === 'undefined' || document.visibilityState !== 'hidden')
    );
  }
  /** Android Activity lifecycle can precede the WebView visibility event. */
  setAppActive(active: boolean): void {
    this.appActive = active;
    if (active) void this.resumeForeground();
    else this.suspendBackground();
  }
  private suspendBackground(): void {
    this.track?.pause();
    this.stopEffects();
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {});
  }
  private async resumeForeground(): Promise<void> {
    if (!this.isForeground() || !this.unlocked || (!this.prefs.effects && !this.prefs.music))
      return;
    try {
      if (this.context?.state === 'suspended') await this.context.resume();
      // Visibility can change again while the browser is resuming its audio device.
      if (!this.isForeground()) {
        this.suspendBackground();
        return;
      }
      this.syncMusic();
    } catch {
      /* A fresh user interaction can unlock audio if automatic resumption is blocked. */
    }
  }
  private sources = new Set<AudioScheduledSourceNode>();
  stopEffects(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    this.sources.clear();
  }
  private track: HTMLAudioElement | null = null;
  private scene: 'menu' | 'game' = 'menu';
  private gameTrack = 0;
  private gameTracks = ['game.mp3', 'game-2.mp3', 'game-3.mp3'];
  private trackUrl() {
    return (
      import.meta.env.BASE_URL +
      'audio/' +
      (this.scene === 'menu' ? 'menu.mp3' : this.gameTracks[this.gameTrack])
    );
  }
  private unlocked = false;
  private samples = new Map<string, AudioBuffer>();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private prefs: AudioPreferences = loadAudio();
  async unlock(): Promise<void> {
    if (!this.isForeground() || (!this.prefs.effects && !this.prefs.music)) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.musicBus = this.context.createGain();
        this.musicBus.connect(this.master);
        for (const [type, file] of Object.entries({
          dice: 'switch_001',
          move: 'drop_001',
          card: 'select_001',
          build: 'confirmation_001',
        })) {
          void fetch(`${import.meta.env.BASE_URL}audio/${file}.ogg`)
            .then((r) => r.arrayBuffer())
            .then((data) => this.context?.decodeAudioData(data))
            .then((buffer) => {
              if (buffer) this.samples.set(type, buffer);
            })
            .catch(() => {});
        }
      }
      if (this.context.state === 'suspended') await this.context.resume();
      if (!this.isForeground()) {
        this.suspendBackground();
        return;
      }
      this.unlocked = true;
      this.configure(this.prefs);
    } catch {
      /* Audio is optional; blocked autoplay must never stop a game. */
    }
  }
  configure(prefs: AudioPreferences): void {
    this.prefs = prefs;
    try {
      localStorage.setItem('money-tour.audio', JSON.stringify(prefs));
    } catch {
      /* Optional preference. */
    }
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(prefs.volume, this.context.currentTime, 0.04);
    if (this.musicBus && this.context)
      this.musicBus.gain.setTargetAtTime(prefs.music ? 0.22 : 0, this.context.currentTime, 0.15);
    if (!prefs.effects) this.stopEffects();
    this.syncMusic();
  }
  setScene(scene: 'menu' | 'game'): void {
    if (scene === this.scene) return;
    this.scene = scene;
    this.stopEffects();
    if (this.track) {
      this.track.pause();
      if (scene === 'game') this.gameTrack = Math.floor(Math.random() * this.gameTracks.length);
      this.track.src = this.trackUrl();
      this.track.loop = scene === 'menu';
    }
    this.syncMusic();
  }
  private syncMusic(): void {
    if (!this.unlocked || !this.isForeground() || !this.prefs.music) {
      this.track?.pause();
      return;
    }
    if (!this.track) {
      this.track = new Audio(this.trackUrl());
      this.track.loop = this.scene === 'menu';
      this.track.onended = () => {
        if (!this.isForeground() || this.scene !== 'game' || !this.track) return;
        this.gameTrack = (this.gameTrack + 1) % this.gameTracks.length;
        this.track.src = this.trackUrl();
        this.syncMusic();
      };
      this.track.preload = 'none';
    }
    this.track.volume = this.prefs.volume * 0.45;
    const track = this.track;
    void track
      .play()
      .then(() => {
        if (!this.isForeground() || !this.prefs.music || track !== this.track) track.pause();
      })
      .catch(() => {});
  }
  private tone(
    frequency: number,
    start: number,
    length: number,
    gain: number,
    type: OscillatorType,
    bus: GainNode,
  ): void {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator(),
      envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + length);
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(start);
    this.sources.add(oscillator);
    oscillator.stop(start + length + 0.03);
    oscillator.onended = () => {
      this.sources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  effect(type: string): void {
    if (
      !this.isForeground() ||
      !this.prefs.effects ||
      !this.context ||
      this.context.state !== 'running' ||
      !this.master
    )
      return;
    const now = this.context.currentTime;
    if (type === 'earthquake') {
      // Layered low-frequency impacts: original procedural rumble, no downloaded asset.
      for (let i = 0; i < 22; i++) {
        this.tone(
          35 + ((i * 17) % 49),
          now + i * 0.12,
          0.48,
          0.13 * (1 - i / 26),
          'sawtooth',
          this.master,
        );
        this.tone(110 + ((i * 31) % 150), now + i * 0.12, 0.16, 0.035, 'triangle', this.master);
      }
      return;
    }
    if (type === 'casino-slots' || type === 'casino-roulette') {
      for (let i = 0; i < 24; i++) {
        const time = type === 'casino-roulette' ? i * 0.045 + i * i * 0.0035 : i * 0.1;
        this.tone(
          type === 'casino-slots' ? 180 + (i % 3) * 85 : 850 + (i % 4) * 70,
          now + time,
          0.045,
          0.08,
          'triangle',
          this.master,
        );
      }
      if (type === 'casino-slots')
        [440, 554, 659].forEach((f, i) =>
          this.tone(f, now + 2.5 + i * 0.3, 0.18, 0.12, 'square', this.master!),
        );
      return;
    }
    if (type === 'coin-in' || type === 'coin-out') {
      const now = this.context.currentTime;
      const notes = type === 'coin-in' ? [1568, 2093, 2637, 3136] : [2637, 2093, 1760, 1319];
      notes.forEach((frequency, i) => {
        this.tone(frequency, now + i * 0.115, 0.28, 0.13, 'sine', this.master!);
        this.tone(frequency * 2.76, now + i * 0.115, 0.09, 0.035, 'sine', this.master!);
      });
      return;
    }
    const sample = this.samples.get(type);
    if (sample) {
      const source = this.context.createBufferSource();
      source.buffer = sample;
      source.connect(this.master);
      source.start();
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
      };
      return;
    }
    const notes = melodies[type];
    if (!notes) return;
    notes.forEach((frequency, index) =>
      this.tone(
        frequency,
        now + index * 0.075,
        type === 'victory' ? 0.5 : 0.18,
        0.14,
        type === 'dice' ? 'triangle' : 'sine',
        this.master!,
      ),
    );
  }
  events(events: GameEvent[]): void {
    // Prefer the meaningful arrival sound over stacking every transfer in one transition.
    const order = ['victory', 'bankruptcy', 'card', 'build', 'purchase', 'payment', 'dice', 'move'];
    const type = order.find((type) => events.some((event) => event.type === type));
    if (type) this.effect(type);
  }
  close(): void {
    this.closed = true;
    this.unlocked = false;
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
      window.removeEventListener('focus', this.onFocus);
    }
    this.stopEffects();
    this.track?.pause();
    if (this.track) this.track.onended = null;
    this.track = null;
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.musicBus = null;
  }
}
