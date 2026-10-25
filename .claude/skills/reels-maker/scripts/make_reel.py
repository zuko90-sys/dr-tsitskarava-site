"""Собирает рилс по <проект>/reel.json: обрезка, «прыжки» приближения, анимационные вставки,
титры и плашки (ASS), голос −14 LUFS + звуки.

python3 -I make_reel.py <проект>                     → <проект>/out/reel.mp4 и out/reel.srt
python3 -I make_reel.py <проект> --preview 2,10.5    → <проект>/preview/p_<t>.png (без звука, быстро)

Формат reel.json — references/config.md. Все времена в конфиге — секунды ГОТОВОГО ролика,
кроме cut/end (это точки в исходнике).
"""
import glob
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_subs as bs  # noqa: E402

KIT = os.environ.get("REELS_KIT", os.path.expanduser("~/.cache/reels-kit"))
FONTS = KIT + "/fonts"
SOFT = "{\\bord16\\blur12\\3c&H000000&\\3a&H90&\\1a&HFF&\\shad0\\fad(70,0)"


class Reel:
    def __init__(self, proj):
        self.p = os.path.abspath(proj)
        c = json.load(open(self.path("reel.json"), encoding="utf-8"))
        self.c = c
        self.src = self.path(c["src"])
        self.cut, self.end = c["cut"], c["end"]
        self.dur = self.end - self.cut
        self.fps = c.get("fps", 30)
        self.inserts = [tuple(x) for x in c.get("inserts", [])]
        self.anim = self.path(c["anim_frames"]) if c.get("anim_frames") else None
        self.sfx = self.path(c["sfx"]) if c.get("sfx") else None
        self.style = dict({"cap_size": 76, "cap_outline": 5, "cap_margin": 500, "soft": True, "head_margin": 370},
                          **c.get("style", {}))

    def path(self, rel):
        return os.path.join(self.p, rel)

    # ---------- титры ----------
    def silences(self):
        err = subprocess.run(["ffmpeg", "-hide_banner", "-i", self.path("in/audio.wav"), "-af",
                              "silencedetect=noise=-32dB:d=0.12", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        st = [float(x.split()[-1]) for x in err.splitlines() if "silence_start" in x]
        en = [float(x.split("silence_end:")[1].split()[0]) for x in err.splitlines() if "silence_end" in x]
        return list(zip(st, en))

    def words_cut(self):
        """Слова в шкале готового ролика; начало слова, попавшее в паузу, сдвигается на её конец
        (метки Zipformer бывают на 0.2–0.4 с раньше звука)."""
        words = [w for w in json.load(open(self.path("in/words.json"))) if self.cut <= w["start"] < self.end]
        sil = self.silences()
        for w in words:
            for s, e in sil:
                if s - 0.02 <= w["start"] < e:
                    w["start"] = e
        for i, w in enumerate(words):
            nxt = words[i + 1]["start"] if i + 1 < len(words) else self.end
            stop = min([s for s, e in sil if s > w["start"] + 0.08 and e - s >= 0.22] + [nxt])
            w["start"], w["end"] = round(w["start"] - self.cut, 3), round(min(nxt, stop) - self.cut, 3)
        json.dump(words, open(self.path("in/words_cut.json"), "w"), ensure_ascii=False, indent=0)

    def overlay_events(self):
        ev, t = [], bs.ts
        words = lambda txt: [{"text": w} if w != "/" else {"br": True} for w in txt.split()]
        ti = self.c.get("title")
        if ti:
            ev.append("Dialogue: 3,%s,%s,Title,,0,0,0,,{\\an8\\pos(540,%d)\\fad(0,180)}%s"
                      % (t(ti["from"]), t(ti["to"]), ti.get("y", 250), bs.render_words(words(ti["text"]), bs.MINT, bs.WHITE)))
            if ti.get("sub"):
                ev.append("Dialogue: 3,%s,%s,Sub,,0,0,0,,{\\an8\\pos(540,%d)\\fad(0,180)}%s"
                          % (t(ti["from"]), t(ti["to"]), ti.get("sub_y", 500), bs.render_words(words(ti["sub"]), bs.MINT, bs.WHITE)))
        for pl in self.c.get("plaques", []):
            ev.append("Dialogue: 2,%s,%s,HeadNum,,0,0,0,,{\\fad(160,120)}%s" % (t(pl["from"]), t(pl["to"]), pl["label"]))
            ev.append("Dialogue: 2,%s,%s,Head,,0,0,0,,{\\fad(160,120)}%s"
                      % (t(pl["from"]), t(pl["to"]), bs.render_words(words(pl["text"]), bs.MINT, "&H00FBFBF9")))
        return ev

    def build_ass(self):
        self.words_cut()
        cfg = dict(self.style, duration=self.dur, lead=0.06, tail=0.35)
        ass, srt = self.path("out/reel.ass"), self.path("out/reel.srt")
        bs.main(self.path(self.c.get("captions", "captions.txt")), self.path("in/words_cut.json"), ass, srt,
                report=True, cfg=cfg)
        lines = open(ass, encoding="utf-8").read().splitlines()
        if self.style.get("soft"):
            # мягкая тёмная подложка под титрами — только поверх живого видео; на светлой анимации она грязнит
            sec = lambda s: sum(float(x) * m for x, m in zip(s.split(":"), (3600, 60, 1)))
            for l in [l for l in lines if l.startswith("Dialogue: 1,")]:
                _, s, e, rest = l.split(",", 3)
                pieces, cur = [], sec(s)
                for a, b in self.inserts:
                    if a < sec(e) and b > cur:
                        if a > cur:
                            pieces.append((cur, a))
                        cur = max(cur, b)
                if cur < sec(e):
                    pieces.append((cur, sec(e)))
                for a, b in pieces:
                    lines.append("Dialogue: 0,%s,%s,%s" % (bs.ts(a), bs.ts(b), rest.replace("{\\fad(70,0)", SOFT)))
        lines += self.overlay_events()
        open(ass, "w", encoding="utf-8").write("\n".join(lines) + "\n")

    # ---------- видео и звук ----------
    def loudness(self, voice):
        err = subprocess.run(["ffmpeg", "-hide_banner", "-i", self.src, "-filter_complex",
                              voice + ",loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                             capture_output=True, text=True).stderr
        return json.loads(err[err.rindex("{"):err.rindex("}") + 1])

    def filtergraph(self, audio=True):
        z = self.c.get("zoom", {})
        segs = z.get("segments", [[0, 1.0]])
        ax, ay = z.get("anchor", [540, 900])
        bounds = [s for s, _ in segs] + [self.dur]
        norm = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=%s" % self.fps
        parts, labels = [], []
        for i, (s, k) in enumerate(segs):
            f = "[0:v]%s,trim=start=%.3f:end=%.3f,setpts=PTS-STARTPTS" % (norm, s + self.cut, bounds[i + 1] + self.cut)
            if k != 1.0:
                w, h = int(1080 / k) // 2 * 2, int(1920 / k) // 2 * 2
                f += ",crop=%d:%d:%d:%d,scale=1080:1920:flags=lanczos" % (w, h, int(ax * (1 - 1 / k)), int(ay * (1 - 1 / k)))
            parts.append(f + ",setsar=1[v%d]" % i)
            labels.append("[v%d]" % i)
        chain = "%sconcat=n=%d:v=1:a=0" % ("".join(labels), len(segs))
        if self.anim:
            chain += "[base];[base][1:v]overlay=0:0:eof_action=pass"
        parts.append(chain + ",format=yuv420p,ass=%s:fontsdir=%s[vout]" % (self.path("out/reel.ass"), FONTS))
        if audio:
            voice = "[0:a]atrim=start=%.3f:end=%.3f,asetpts=PTS-STARTPTS" % (self.cut, self.end)
            m = self.loudness(voice)
            parts.append(voice + ",loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:measured_I=%s:measured_TP=%s:"
                         "measured_LRA=%s:measured_thresh=%s:offset=%s,aresample=48000,afade=t=in:d=0.08,"
                         "afade=t=out:st=%.3f:d=0.25%s" % (m["input_i"], m["input_tp"], m["input_lra"], m["input_thresh"],
                                                         m["target_offset"], self.dur - 0.25, "[voice]" if self.sfx else ",alimiter=limit=0.89:level=false[aout]"))
            if self.sfx:
                # звуки синтезированы «по полной шкале»; после подъёма голоса до −14 LUFS им нужно +6 дБ, иначе не слышно
                parts.append("[%d:a]aresample=48000,volume=%sdB[fx];[voice][fx]amix=inputs=2:normalize=0:duration=first,"
                             "alimiter=limit=0.89:level=false[aout]" % (2 if self.anim else 1, self.c.get("sfx_gain_db", 6)))
        return ";".join(parts)

    def inputs(self, audio=True):
        args = ["-i", self.src]
        if self.anim:
            args += ["-framerate", str(self.fps), "-i", self.anim]
        if audio and self.sfx:
            args += ["-i", self.sfx]
        return args

    def rgba_frames(self):
        """Chromium сохраняет непрозрачные кадры как RGB; смена формата посреди ряда PNG обрывает ролик в ffmpeg."""
        if not self.anim:
            return
        from PIL import Image
        for f in glob.glob(self.anim.replace("%05d", "*")):
            im = Image.open(f)
            if im.mode != "RGBA":
                im.convert("RGBA").save(f, compress_level=1)

    def render(self, preview=None):
        os.makedirs(self.path("out"), exist_ok=True)
        self.rgba_frames()
        self.build_ass()
        if preview:
            os.makedirs(self.path("preview"), exist_ok=True)
            fg = self.filtergraph(audio=False)
            for t in preview:
                subprocess.run(["ffmpeg", "-v", "error", "-y"] + self.inputs(False) + ["-filter_complex", fg, "-map", "[vout]",
                                "-ss", t, "-frames:v", "1", self.path("preview/p_%s.png" % t)], check=True)
            return
        out = self.path(self.c.get("out", "out/reel.mp4"))
        subprocess.run(["ffmpeg", "-v", "error", "-y"] + self.inputs() + [
            "-filter_complex", self.filtergraph(), "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.1",
            "-r", str(self.fps), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out], check=True)
        print("готово:", out)


if __name__ == "__main__":
    a = sys.argv[1:]
    Reel(a[0]).render(a[a.index("--preview") + 1].split(",") if "--preview" in a else None)
