"""Расшифровка русской речи тремя моделями.

python3 -I transcribe.py <видео> <папка проекта>

Пишет в <проект>/in/:
  audio.wav        — 16 кГц моно
  words.json       — слова с таймкодами (Zipformer): по ним титры встают под голос
  transcript.md    — по каждому куску речи три версии (Zipformer / GigaAM / Whisper),
                     чтобы по большинству выбрать спорные слова и окончания
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np
import sherpa_onnx

KIT = os.environ.get("REELS_KIT", os.path.expanduser("~/.cache/reels-kit"))
M = KIT + "/models/"
SR = 16000


def load(path):
    w = wave.open(path)
    return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def silences(wav, noise="-32dB", d=0.12):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "silencedetect=noise=%s:d=%s" % (noise, d),
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    st = [float(x.split()[-1]) for x in err.splitlines() if "silence_start" in x]
    en = [float(x.split("silence_end:")[1].split()[0]) for x in err.splitlines() if "silence_end" in x]
    return list(zip(st, en))


def chunks(total, sil, max_len=16.0):
    """Куски речи, разрезанные в паузах ≥ 0.3 с, не длиннее max_len
    (Zipformer падает на кусках длиннее ~20 с, Whisper принимает до 30 с)."""
    cuts = [(s + e) / 2 for s, e in sil if e - s >= 0.3]
    out, start = [], 0.0
    for i, c in enumerate(cuts):
        nxt = cuts[i + 1] if i + 1 < len(cuts) else total
        if nxt - start > max_len:
            out.append((start, c))
            start = c
    out.append((start, total))
    return out


def decode(rec, a, s0, s1):
    st = rec.create_stream()
    st.accept_waveform(SR, a[int(s0 * SR):int(s1 * SR)])
    rec.decode_stream(st)
    return st.result


def main(video, proj):
    os.makedirs(proj + "/in", exist_ok=True)
    wav = proj + "/in/audio.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", wav], check=True)
    a = load(wav)
    total = len(a) / SR
    sil = silences(wav)
    parts = chunks(total, sil)

    z = M + "sherpa-onnx-zipformer-ru-2024-09-18/"
    zr = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=z + "encoder.onnx", decoder=z + "decoder.onnx", joiner=z + "joiner.onnx", tokens=z + "tokens.txt",
        num_threads=4, decoding_method="modified_beam_search", max_active_paths=8)
    g = M + "sherpa-onnx-nemo-transducer-giga-am-v2-russian-2025-04-19/"
    gr = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=g + "encoder.int8.onnx", decoder=g + "decoder.onnx", joiner=g + "joiner.onnx", tokens=g + "tokens.txt",
        model_type="nemo_transducer", num_threads=4)
    w = M + "sherpa-onnx-whisper-turbo/"
    wr = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=w + "turbo-encoder.int8.onnx", decoder=w + "turbo-decoder.int8.onnx", tokens=w + "turbo-tokens.txt",
        language="ru", task="transcribe", num_threads=4) if os.path.isdir(w) else None

    words, md = [], ["# Расшифровка: %s (%.1f с)\n" % (os.path.basename(video), total)]
    for s0, s1 in parts:
        r = decode(zr, a, s0, s1)
        for tok, t in zip(r.tokens, r.timestamps):
            if tok.startswith((" ", "▁")) or not words:
                words.append({"w": tok.strip(" ▁"), "start": round(s0 + t, 3)})
            else:
                words[-1]["w"] += tok
        md.append("## %.2f–%.2f\n- Zipformer: %s\n- GigaAM: %s" % (s0, s1, r.text.strip(), decode(gr, a, s0, s1).text.strip()))
        if wr:
            md.append("- Whisper: %s" % decode(wr, a, s0, s1).text.strip())
        md.append("")
    words = [x for x in words if x["w"]]
    # конец слова — начало следующего или начало паузы ≥ 0.22 с (короткие «провалы» бывают внутри слова)
    for i, x in enumerate(words):
        nxt = words[i + 1]["start"] if i + 1 < len(words) else total
        stop = min([s for s, e in sil if s > x["start"] + 0.08 and e - s >= 0.22] + [nxt])
        x["end"] = round(min(nxt, stop), 3)
    json.dump(words, open(proj + "/in/words.json", "w"), ensure_ascii=False, indent=0)
    md.append("## Паузы ≥ 0.25 с (места для склеек)\n" + ", ".join("%.2f–%.2f" % p for p in sil if p[1] - p[0] >= 0.25))
    open(proj + "/in/transcript.md", "w", encoding="utf-8").write("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
