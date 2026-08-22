/**
 * SoundManager — Audio manager integrating authentic Rise of Nations WAV sounds
 * with Web Audio API procedural synthesis fallbacks.
 */
export class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = true;
    this.masterGain = null;
    this._initialized = false;
    this.soundBuffers = {};

    this.soundFiles = {
      tankFire: ['/assets/ron/audio/tankfire1.wav', '/assets/ron/audio/tankfire2.wav'],
      cannon: ['/assets/ron/audio/cannon1_new.wav', '/assets/ron/audio/cannon2_new.wav'],
      rifle: ['/assets/ron/audio/machinegunm161.wav', '/assets/ron/audio/machinegunak471.wav'],
      explosion: [
        '/assets/ron/audio/explo1.wav',
        '/assets/ron/audio/explo2.wav',
        '/assets/ron/audio/explo3.wav',
        '/assets/ron/audio/explo4.wav',
      ],
      jet: ['/assets/ron/audio/airplaneackjetsmall.wav'],
      airRaid: ['/assets/ron/audio/airraid.wav'],
    };
  }

  init() {
    if (this._initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this._initialized = true;
      this._preloadAudio();
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  async _preloadAudio() {
    for (const [key, paths] of Object.entries(this.soundFiles)) {
      this.soundBuffers[key] = [];
      for (const p of paths) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            const arr = await res.arrayBuffer();
            const buf = await this.ctx.decodeAudioData(arr);
            this.soundBuffers[key].push(buf);
          }
        } catch {
          // ignore fallback
        }
      }
    }
  }

  _playBuffer(key, volume = 0.5) {
    if (this.isMuted || !this._initialized || !this.ctx) return false;
    const bufs = this.soundBuffers[key];
    if (!bufs || bufs.length === 0) return false;

    const buf = bufs[Math.floor(Math.random() * bufs.length)];
    const source = this.ctx.createBufferSource();
    source.buffer = buf;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    return true;
  }

  toggleMute() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  playLaser(freq = 880) {
    if (this._playBuffer('rifle', 0.25)) return;
    if (this.isMuted || !this._initialized || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playCannon() {
    if (this._playBuffer('cannon', 0.45)) return;
    if (this._playBuffer('tankFire', 0.45)) return;
    if (this.isMuted || !this._initialized || !this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.3);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  playExplosion(intensity = 1) {
    if (this._playBuffer('explosion', Math.min(0.6, 0.3 * intensity))) return;
    if (this.isMuted || !this._initialized || !this.ctx) return;

    const t = this.ctx.currentTime;
    const dur = 0.3 * Math.min(intensity, 3);
    const bufSize = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(60, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4 * Math.min(intensity, 2), t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
  }

  playLiquidation() {
    if (this._playBuffer('airRaid', 0.5)) return;
    if (this._playBuffer('jet', 0.45)) return;
    if (this.isMuted || !this._initialized || !this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.3, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.4);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.4);
    });
  }

  playCoin() {
    if (this.isMuted || !this._initialized || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, t);
    osc.frequency.exponentialRampToValueAtTime(3000, t + 0.08);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }
}

export const soundManager = new SoundManager();
