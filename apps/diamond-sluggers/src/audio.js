// audio.js — tiny procedural sound engine built on the Web Audio API.
// No audio files: every effect is synthesized, so the game stays self-contained.

export class Audio {
  constructor() {
    this.ctx = null;
    this.crowd = null;
    this.crowdGain = null;
  }

  // Must be called from a user gesture (the PLAY BALL click) to satisfy
  // browser autoplay policies.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this._startCrowd();
  }

  _now() {
    return this.ctx.currentTime;
  }

  // A continuous filtered-noise bed that we swell for big plays.
  _startCrowd() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.value = 0.04;

    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.crowd = src;
    this.crowdGain = gain;
  }

  // Swell crowd noise for `ms`, peaking at `level`.
  cheer(level = 0.22, ms = 1400) {
    if (!this.crowdGain) return;
    const g = this.crowdGain.gain;
    const t = this._now();
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + 0.08);
    g.linearRampToValueAtTime(0.04, t + ms / 1000);
  }

  _tone(freq, dur, type = "sine", vol = 0.3, glideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this._now());
    if (glideTo)
      osc.frequency.exponentialRampToValueAtTime(
        glideTo,
        this._now() + dur,
      );
    gain.gain.setValueAtTime(vol, this._now());
    gain.gain.exponentialRampToValueAtTime(0.0001, this._now() + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(this._now() + dur + 0.02);
  }

  // Sharp transient = bat on ball. Harder contact -> brighter, louder crack.
  batCrack(power = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.18;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 3);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1200 + power * 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.5 + power * 0.4;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    // a woody knock under the crack
    this._tone(180 + power * 120, 0.09, "triangle", 0.4, 90);
  }

  swingMiss() {
    this._tone(900, 0.12, "sawtooth", 0.12, 300);
  }

  pitchThrow() {
    this._tone(420, 0.18, "sine", 0.16, 140);
  }

  catchBall() {
    this._tone(220, 0.06, "square", 0.18, 120);
  }

  uiSelect() {
    this._tone(660, 0.05, "square", 0.12);
  }

  // Rising arpeggio for ON FIRE.
  fire() {
    [330, 440, 550, 660, 880].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.16, "sawtooth", 0.18), i * 70),
    );
  }
}
