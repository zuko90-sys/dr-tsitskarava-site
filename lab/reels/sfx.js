/* Звуки для рилсов. Всё синтезируется здесь же, без сэмплов, поэтому
 * никаких лицензий: страница рилса отдаёт список событий window.reel.sfx
 * ([время, звук, громкость]), а synth() собирает из них WAV под длину видео. */
const SR = 48000;
const TAU = Math.PI * 2;

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const len = (d) => Math.round(d * SR);
const noise = (d, seed = 1) => { const r = rng(seed), a = new Float32Array(len(d)); for (let i = 0; i < a.length; i++) a[i] = r() * 2 - 1; return a; };

/* тон с плавающей частотой: f(t) и огибающая e(t); wave — форма волны */
function tone(d, f, e, wave = 'sine') {
  const a = new Float32Array(len(d)); let ph = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR; ph += TAU * f(t) / SR;
    const p = (ph / TAU) % 1;
    const v = wave === 'sine' ? Math.sin(ph) : wave === 'saw' ? 2 * p - 1 : wave === 'square' ? (p < .5 ? 1 : -1) : (p < .25 ? 1 : -1);
    a[i] = v * e(t);
  }
  return a;
}
const env = (x, e) => { for (let i = 0; i < x.length; i++) x[i] *= e(i / SR); return x; };
const add = (x, y, g = 1, at = 0) => { const o = len(at); for (let i = 0; i < y.length && i + o < x.length; i++) x[i + o] += y[i] * g; return x; };
function lowpass(x, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }
function highpass(x, fc) { const a = 1 - Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; } return x; }
/* полосовой фильтр RBJ; fc может меняться во времени */
function bandpass(x, fc, q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, a0, a1, a2;
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) {
      const f = typeof fc === 'function' ? fc(i / SR) : fc, w = TAU * Math.min(f, SR * .45) / SR, al = Math.sin(w) / (2 * q);
      b0 = al; a0 = 1 + al; a1 = -2 * Math.cos(w); a2 = 1 - al;
    }
    const y = (b0 * x[i] - b0 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
const fade = (d, a = .005, r = .03) => (t) => Math.min(1, t / a, Math.max(0, (d - t) / r));
function bell(f, d = .9) {
  return tone(d, () => f, (t) => Math.min(1, t / .002) * Math.exp(-t * 5)).map((v, i) => {
    const t = i / SR; return v + .35 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 11) + .2 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 7);
  });
}

const SOUNDS = {
  /* «вжух» шторки между сценами */
  whoosh: () => { const d = .62; return env(bandpass(noise(d, 3), (t) => 260 * Math.pow(11, Math.sin(Math.PI * t / d)), 1.3), (t) => Math.pow(Math.sin(Math.PI * t / d), 2) * 2.4); },
  swipe: () => { const d = .34; return env(bandpass(noise(d, 5), (t) => 900 + 3200 * (t / d), 1.6), (t) => Math.pow(Math.sin(Math.PI * t / d), 2) * 2.2); },
  /* «буп» появления */
  pop: () => tone(.11, (t) => 430 + 760 * Math.exp(-t * 60), (t) => Math.min(1, t / .002) * Math.exp(-t * 38)),
  /* «боинг» маскота */
  boing: () => tone(.5, (t) => 240 * (1 + .28 * Math.sin(TAU * 13 * t) * Math.exp(-t * 6)), (t) => Math.min(1, t / .004) * Math.exp(-t * 6.5))
    .map((v, i) => v + .25 * Math.sin(2 * Math.asin(Math.max(-1, Math.min(1, v))))),
  /* удар штампа: низкий «бум» + шлепок */
  stamp: () => {
    const x = tone(.42, (t) => 46 + 90 * Math.exp(-t * 28), (t) => Math.min(1, t / .002) * Math.exp(-t * 9));
    add(x, env(lowpass(noise(.08, 7), 2600), (t) => Math.exp(-t * 55)), .9);
    return add(x, env(bandpass(noise(.05, 8), 1700, 1), (t) => Math.exp(-t * 80)), 1.4);
  },
  thud: () => {
    const x = tone(.22, (t) => 70 + 110 * Math.exp(-t * 35), (t) => Math.min(1, t / .002) * Math.exp(-t * 16));
    return add(x, env(bandpass(noise(.04, 9), 1400, 1), (t) => Math.exp(-t * 90)), 1.1);
  },
  /* «динь» правильного ответа */
  ding: () => { const x = new Float32Array(len(1.1)); add(x, bell(1318.5), .5); return add(x, bell(1760), .5, .09); },
  chime: () => { const x = new Float32Array(len(1.3)); [1046.5, 1318.5, 1568].forEach((f, i) => add(x, bell(f), .4, i * .09)); return x; },
  tick: () => add(tone(.03, () => 2600, (t) => Math.exp(-t * 260)), env(highpass(noise(.01, 11), 3000), (t) => Math.exp(-t * 900)), .7),
  /* звонок будильника: молоточек 24 раза в секунду */
  ring: (d = 2) => { const e = fade(d, .02, .08); return new Float32Array(len(d)).map((_, i) => {
    const t = i / SR, hammer = Math.sin(TAU * 24 * t) > 0 ? 1 : .35;
    return (Math.sin(TAU * 2100 * t) + .55 * Math.sin(TAU * 3170 * t) + .3 * Math.sin(TAU * 4420 * t)) * hammer * e(t) * .45;
  }); },
  /* «бурп»: хриплый низкий импульс с вибрато и форматой */
  burp: () => {
    const d = .62, r = rng(13);
    let x = tone(d, (t) => 104 - 30 * t / d + 7 * Math.sin(TAU * 6.5 * t) + (r() - .5) * 18,
      (t) => Math.min(1, t / .03) * Math.pow(Math.max(0, 1 - t / d), .6) * (.7 + .3 * Math.sin(TAU * 21 * t)), 'pulse');
    const f = bandpass(Float32Array.from(x), 480, 2.5);
    x = lowpass(x, 850);
    return x.map((v, i) => (v * .8 + f[i] * 1.6));
  },
  /* шипение соды: потрескивание + шум */
  fizz: (d = 1.9) => {
    const r = rng(17), x = new Float32Array(len(d)); let amp = 0;
    for (let i = 0; i < x.length; i++) { if (r() < .004) amp = .4 + r() * .6; amp *= .985; x[i] = (r() * 2 - 1) * (amp + .12); }
    return env(highpass(x, 2800), fade(d, .12, .5));
  },
  fire: () => {
    const d = .8, r = rng(19), x = new Float32Array(len(d)); let amp = 0;
    for (let i = 0; i < x.length; i++) { if (r() < .002) amp = .5 + r() * .5; amp *= .992; x[i] = (r() * 2 - 1) * (amp * .6 + .5); }
    return env(lowpass(x, 1500), (t) => Math.min(1, t / .06) * Math.exp(-t * 2.6));
  },
  steam: () => env(highpass(noise(.5, 23), 2200), (t) => Math.min(1, t / .03) * Math.exp(-t * 6)),
  /* «плюх» капли */
  plop: () => {
    const x = tone(.2, (t) => 320 * Math.pow(5, Math.min(1, t / .05)), (t) => Math.min(1, t / .003) * Math.exp(-t * 22));
    return add(x, env(bandpass(noise(.12, 29), 1600, 1.2), (t) => Math.exp(-t * 30)), .35, .025);
  },
  glug: () => tone(.09, (t) => 160 + 140 * t / .09, (t) => Math.sin(Math.PI * t / .09)),
  buzz: () => { const d = .42; const x = tone(d, () => 140, fade(d, .01, .05), 'square'); add(x, tone(d, () => 147, fade(d, .01, .05), 'square')); return lowpass(x, 1300).map((v) => v * .5); },
  /* гром: треск + низкий раскат */
  thunder: () => {
    const d = 1.6, x = env(lowpass(lowpass(noise(d, 41), 260), 260), (t) => Math.min(1, t / .03) * Math.exp(-t * 2.2) * (.8 + .2 * Math.sin(TAU * 3 * t)));
    return add(x.map((v) => v * 3), env(bandpass(noise(.25, 43), 1800, .9), (t) => Math.exp(-t * 18)), .5);
  },
  /* шаг */
  step: () => add(tone(.09, (t) => 95 + 60 * Math.exp(-t * 40), (t) => Math.min(1, t / .002) * Math.exp(-t * 45)), env(lowpass(noise(.04, 47), 1800), (t) => Math.exp(-t * 120)), .5),
  /* сирена «уи-у»: плавающий тон с обертоном */
  siren: () => { const d = 1.5, e = fade(d, .03, .35); let ph = 0; return new Float32Array(len(d)).map((_, i) => {
    const t = i / SR, f = 720 + 330 * (.5 + .5 * Math.sin(TAU * 1.6 * t - Math.PI / 2)); ph += TAU * f / SR;
    return (Math.sin(ph) + .35 * Math.sin(2 * ph) + .15 * Math.sin(3 * ph)) * e(t) * .6; }); },
  /* глитч: «битый» шум + цифровые писки */
  glitch: () => { const d = .26, r = rng(53); let hold = 0, cnt = 0, blip = 0; return new Float32Array(len(d)).map((_, i) => {
    const t = i / SR; if (cnt-- <= 0) { hold = r() * 2 - 1; cnt = 20 + Math.floor(r() * 160); blip = r() < .3 ? 600 + r() * 2400 : 0; }
    const v = hold * .7 + (blip ? .5 * Math.sign(Math.sin(TAU * blip * t)) : 0);
    return v * fade(d, .005, .08)(t); }); },
  /* росчерк ручки / зачёркивание */
  pen: () => { const d = .2, r = rng(31); return env(bandpass(noise(d, 37), (t) => 3000 + 1500 * Math.sin(TAU * 9 * t), 2), (t) => fade(d, .01, .05)(t) * (.6 + .4 * Math.abs(Math.sin(TAU * 14 * t + r())))); },
};

/* каждый звук — к пику 1, громкость задают события */
const norm = (x) => { let m = 1e-9; for (const v of x) m = Math.max(m, Math.abs(v)); return x.map((v) => v / m); };

/* events: [[время, звук, громкость], …] → WAV 16 бит, стерео, 48 кГц */
function synth(events, duration) {
  const n = len(duration), L = new Float32Array(n), R = new Float32Array(n), cache = {};
  for (const [t, name, gain = 1] of events) {
    if (!SOUNDS[name] || t >= duration) continue;
    const s = cache[name] || (cache[name] = norm(SOUNDS[name]()));
    const pan = Math.sin(t * 12.9898) * .25, gl = gain * (1 - pan), gr = gain * (1 + pan), o = len(Math.max(0, t));
    for (let i = 0; i < s.length && i + o < n; i++) { L[i + o] += s[i] * gl; R[i + o] += s[i] * gr; }
  }
  let peak = 1e-9; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = .7 / peak, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.tanh(L[i] * k) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.tanh(R[i] * k) * 32767), 46 + i * 4);
  }
  return buf;
}

module.exports = { synth, SOUNDS };
