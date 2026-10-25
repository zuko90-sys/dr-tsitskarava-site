"""Лёгкие звуки к анимации — синтез, без сторонних сэмплов (никаких проблем с авторскими правами).

python3 -I sfx.py <проект>/sfx.json <проект>/in/sfx.wav <длительность ролика, с>

sfx.json — список [время в ролике, звук, громкость дБ], например:
  [[6.03, "whoosh", -24], [7.58, "boing", -22], [10.83, "stamp", -19], [36.52, "ding:1320", -24]]
Звуки: whoosh (переход), whoosh:soft (лёгкий сдвиг), pop (появление), stamp (ярлык-штамп),
boing (персонаж выскочил), knock (удар), drip (капля), tick (галочка), ding[:частота] (звон), drain (разрядка).
Громкости подобраны «по полной шкале»: make_reel.py поднимает дорожку на +6 дБ после нормализации голоса.
"""
import json
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, attack=0.004, decay=8.0):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    return a * np.exp(-t * decay)


def sweep(f0, f1, dur, shape="exp"):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur) if shape == "exp" else np.linspace(f0, f1, n)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def bandnoise(dur, lo, hi):
    n = int(dur * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    spec[(fr < lo) | (fr > hi)] = 0
    x = np.fft.irfft(spec, n)
    return x / (np.abs(x).max() + 1e-9)


def pop(dur=0.09):
    return sweep(620, 240, dur) * env(int(dur * SR), decay=34)


def stamp():
    d = 0.16
    return 0.8 * sweep(330, 150, d) * env(int(d * SR), decay=22) + 0.25 * bandnoise(d, 800, 4000) * env(int(d * SR), 0.002, 40)


def boing():
    d = 0.38
    n = int(d * SR)
    t = np.arange(n) / SR
    f = 260 + 220 * (1 - np.exp(-t * 9)) + 30 * np.sin(2 * np.pi * 14 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, decay=9)


def whoosh(d=0.34, strength=1.0):
    n = int(d * SR)
    t = np.arange(n) / SR
    x = bandnoise(d, 300, 3500)
    shape = np.sin(np.pi * t / d) ** 2
    return strength * 0.7 * x * shape


def drip():
    d = 0.13
    return sweep(1500, 420, d) * env(int(d * SR), decay=30)


def knock():
    d = 0.07
    return 0.9 * sweep(180, 90, d) * env(int(d * SR), 0.001, 45) + 0.2 * bandnoise(d, 200, 1500) * env(int(d * SR), 0.001, 70)


def ding(f=1320):
    d = 0.45
    n = int(d * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t)) * env(n, 0.002, 9)


def tick():
    d = 0.03
    return bandnoise(d, 1500, 6000) * env(int(d * SR), 0.0005, 120)


def drain(d=1.7):
    n = int(d * SR)
    t = np.arange(n) / SR
    f = 640 * (190 / 640) ** (t / d)
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * np.cumsum(f) / SR))
    return tri * np.sin(np.pi * t / d) ** 2 * 0.6


def db(x):
    return 10 ** (x / 20)


KINDS = {
    "whoosh": lambda p: whoosh(0.3, .6) if p == "soft" else whoosh(),
    "pop": lambda p: pop(), "stamp": lambda p: stamp(), "boing": lambda p: boing(), "knock": lambda p: knock(),
    "drip": lambda p: drip(), "tick": lambda p: tick(), "ding": lambda p: ding(float(p) if p else 1320),
    "drain": lambda p: drain(float(p) if p else 1.7),
}


def main(events_path, out, dur):
    track = np.zeros(int(float(dur) * SR) + SR)
    for t, kind, g in json.load(open(events_path)):
        name, _, param = kind.partition(":")
        snd = KINDS[name](param)
        i = int(t * SR)
        track[i:i + len(snd)] += snd[: max(0, len(track) - i)] * db(g)
    track = track[: int(float(dur) * SR)]
    pcm = (np.clip(track, -1, 1) * 32767).astype(np.int16)
    w = wave.open(out, "w")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
    w.close()
    print("пик дорожки, dBFS: %.1f" % (20 * np.log10(np.abs(track).max() + 1e-9)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
