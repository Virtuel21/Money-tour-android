import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Soundscape } from '../src/audio/synth';

const sources: { stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
const tracks: {
  src: string;
  loop: boolean;
  onended: (() => void) | null;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
}[] = [];
const contexts: {
  state: string;
  suspend: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}[] = [];
let visibility = 'visible';
let page: EventTarget;
let browser: EventTarget;
beforeEach(() => {
  sources.length = 0;
  tracks.length = 0;
  contexts.length = 0;
  visibility = 'visible';
  page = new EventTarget();
  Object.defineProperty(page, 'visibilityState', { get: () => visibility });
  browser = new EventTarget();
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', browser);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubGlobal('fetch', () => new Promise(() => {}));
  vi.stubGlobal(
    'Audio',
    class {
      loop = false;
      preload = '';
      volume = 0;
      src: string;
      onended: (() => void) | null = null;
      constructor(src: string) {
        this.src = src;
        tracks.push(this);
      }
      pause = vi.fn();
      play = vi.fn(() => Promise.resolve());
    },
  );
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      currentTime = 1;
      destination = {};
      constructor() {
        contexts.push(this);
      }
      close = vi.fn(() => {
        this.state = 'closed';
        return Promise.resolve();
      });
      suspend = vi.fn(() => {
        this.state = 'suspended';
        return Promise.resolve();
      });
      resume = vi.fn(() => {
        this.state = 'running';
        return Promise.resolve();
      });
      createGain() {
        return {
          connect() {},
          disconnect() {},
          gain: {
            setTargetAtTime() {},
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
        };
      }
      createOscillator() {
        const source = {
          type: '',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: () => {},
        };
        sources.push(source);
        return source;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

it.each(['earthquake', 'casino-slots', 'casino-roulette'])(
  'plays and cancels %s with effects preferences respected',
  async (effect) => {
    const sound = new Soundscape();
    await sound.unlock();
    sound.effect(effect);
    expect(sources.length).toBeGreaterThan(20);
    sound.stopEffects();
    sources.forEach((s) => expect(s.disconnect).toHaveBeenCalledOnce());
    const count = sources.length;
    sound.configure({ effects: false, music: false, volume: 0.4 });
    sound.effect(effect);
    expect(sources).toHaveLength(count);
    sound.close();
  },
);

it('plays all three game songs in rotation and returns to looping menu music', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  sound.setScene('game');
  const track = tracks[0]!;
  const heard = new Set<string>();
  for (let i = 0; i < 3; i++) {
    heard.add(track.src.split('/').pop()!);
    expect(track.loop).toBe(false);
    track.onended!();
  }
  expect([...heard].sort()).toEqual(['game-2.mp3', 'game-3.mp3', 'game.mp3']);
  sound.setScene('menu');
  expect(track.src).toMatch(/audio\/menu.mp3$/);
  expect(track.loop).toBe(true);
  track.onended!();
  expect(track.src).toMatch(/menu.mp3$/);
  sound.close();
  expect(track.onended).toBeNull();
});

it('cancels every scheduled game note immediately when returning home', async () => {
  const sound = new Soundscape();
  await sound.unlock();
  sound.setScene('game');
  sound.effect('dice');
  expect(sources).toHaveLength(5);
  sources.forEach((source) => source.stop.mockClear());
  sound.setScene('menu');
  sources.forEach((source) => {
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });
  sound.stopEffects();
  sources.forEach((source) => expect(source.stop).toHaveBeenCalledOnce());
  sound.close();
});

it('stops effects on pause and permits new effects after resuming', async () => {
  const sound = new Soundscape();
  await sound.unlock();
  sound.effect('move');
  sound.stopEffects();
  sound.effect('purchase');
  expect(sources).toHaveLength(5);
  expect(sources[0]!.disconnect).toHaveBeenCalledOnce();
  expect(sources[4]!.disconnect).not.toHaveBeenCalled();
  sound.close();
  expect(sources[4]!.disconnect).toHaveBeenCalledOnce();
});

it('cancels coin chimes when effects are stopped and respects mute', async () => {
  const sound = new Soundscape();
  await sound.unlock();
  sound.effect('coin-in');
  sound.effect('coin-out');
  expect(sources.length).toBeGreaterThan(0);
  sound.stopEffects();
  sources.forEach((s) => expect(s.disconnect).toHaveBeenCalledOnce());
  const count = sources.length;
  sound.configure({ effects: false, music: false, volume: 0.4 });
  sound.effect('coin-in');
  expect(sources).toHaveLength(count);
  sound.close();
});

it('pauses music and cancels scheduled effects when the browser is hidden', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  await Promise.resolve();
  sound.effect('earthquake');
  const track = tracks[0]!;
  track.pause.mockClear();
  sources.forEach((source) => source.stop.mockClear());

  visibility = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));

  expect(track.pause).toHaveBeenCalledOnce();
  expect(contexts[0]!.suspend).toHaveBeenCalledOnce();
  sources.forEach((source) => {
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
  });
  const count = sources.length;
  const plays = track.play.mock.calls.length;
  sound.effect('purchase');
  sound.setScene('game');
  sound.configure({ effects: true, music: true, volume: 0.6 });
  browser.dispatchEvent(new Event('focus'));
  track.onended!();
  await sound.unlock();
  expect(sources).toHaveLength(count);
  expect(track.play).toHaveBeenCalledTimes(plays);

  visibility = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(contexts[0]!.resume).toHaveBeenCalledOnce();
  expect(track.play).toHaveBeenCalledTimes(plays + 1);
  expect(sources).toHaveLength(count);
  sound.effect('purchase');
  expect(sources).toHaveLength(count + 3);
  sound.close();
});

it('stays silent after pagehide until pageshow even if visibility has not updated', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  await Promise.resolve();
  const track = tracks[0]!;
  const plays = track.play.mock.calls.length;

  browser.dispatchEvent(new Event('pagehide'));
  expect(track.pause).toHaveBeenCalled();
  expect(contexts[0]!.suspend).toHaveBeenCalledOnce();
  browser.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('visibilitychange'));
  await sound.unlock();
  sound.effect('dice');
  expect(track.play).toHaveBeenCalledTimes(plays);
  expect(sources).toHaveLength(0);

  browser.dispatchEvent(new Event('pageshow'));
  await Promise.resolve();
  expect(track.play).toHaveBeenCalledTimes(plays + 1);
  sound.close();
});

it('respects Android Activity suspension before WebView visibility updates', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  await Promise.resolve();
  const track = tracks[0]!;
  const plays = track.play.mock.calls.length;
  sound.effect('earthquake');
  sound.setAppActive(false);
  expect(track.pause).toHaveBeenCalled();
  expect(contexts[0]!.suspend).toHaveBeenCalledOnce();
  sources.forEach((source) => expect(source.stop).toHaveBeenCalled());
  browser.dispatchEvent(new Event('focus'));
  page.dispatchEvent(new Event('visibilitychange'));
  await sound.unlock();
  expect(track.play).toHaveBeenCalledTimes(plays);
  sound.setAppActive(true);
  await Promise.resolve();
  expect(track.play).toHaveBeenCalledTimes(plays + 1);
  sound.close();
});

it('does not unlock audio in the background or start music when returning with music disabled', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  visibility = 'hidden';
  await sound.unlock();
  expect(contexts).toHaveLength(0);
  expect(tracks).toHaveLength(0);

  visibility = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('pageshow'));
  expect(contexts).toHaveLength(0);
  await sound.unlock();
  await Promise.resolve();
  const track = tracks[0]!;
  const plays = track.play.mock.calls.length;
  visibility = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  sound.configure({ effects: true, music: false, volume: 0.4 });
  visibility = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(track.play).toHaveBeenCalledTimes(plays);
  expect(contexts[0]!.resume).toHaveBeenCalledOnce();
  sound.close();
});

it('pauses a delayed music start if the browser becomes hidden before playback resolves', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  await Promise.resolve();
  const track = tracks[0]!;
  let finishPlayback!: () => void;
  track.play.mockImplementationOnce(
    () => new Promise<void>((resolve) => (finishPlayback = resolve)),
  );
  sound.configure({ effects: true, music: true, volume: 0.4 });
  visibility = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  track.pause.mockClear();
  finishPlayback();
  await Promise.resolve();
  expect(track.pause).toHaveBeenCalledOnce();
  sound.close();
});

it('does not resume music if the browser hides again while the audio context resumes', async () => {
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  await Promise.resolve();
  const track = tracks[0]!;
  const plays = track.play.mock.calls.length;
  visibility = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  let finishResume!: () => void;
  contexts[0]!.resume.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishResume = () => {
          contexts[0]!.state = 'running';
          resolve();
        };
      }),
  );
  visibility = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  visibility = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  finishResume();
  await Promise.resolve();
  expect(track.play).toHaveBeenCalledTimes(plays);
  expect(contexts[0]!.state).toBe('suspended');
  expect(contexts[0]!.suspend).toHaveBeenCalledTimes(2);
  sound.close();
});

it('removes lifecycle listeners on close and cannot restart a closed soundscape', async () => {
  const removeDocument = vi.spyOn(page, 'removeEventListener');
  const removeWindow = vi.spyOn(browser, 'removeEventListener');
  const sound = new Soundscape();
  sound.configure({ effects: true, music: true, volume: 0.4 });
  await sound.unlock();
  await Promise.resolve();
  sound.close();
  const track = tracks[0]!;
  const plays = track.play.mock.calls.length;
  expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  for (const type of ['pagehide', 'pageshow', 'focus'])
    expect(removeWindow).toHaveBeenCalledWith(type, expect.any(Function));
  visibility = 'hidden';
  page.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('pagehide'));
  visibility = 'visible';
  page.dispatchEvent(new Event('visibilitychange'));
  browser.dispatchEvent(new Event('pageshow'));
  browser.dispatchEvent(new Event('focus'));
  await sound.unlock();
  sound.effect('dice');
  expect(track.play).toHaveBeenCalledTimes(plays);
  expect(contexts).toHaveLength(1);
  expect(contexts[0]!.close).toHaveBeenCalledOnce();
  expect(contexts[0]!.resume).not.toHaveBeenCalled();
  expect(sources).toHaveLength(0);
});
