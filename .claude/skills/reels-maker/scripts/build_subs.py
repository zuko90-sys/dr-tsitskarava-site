"""Привязывает фразы сценария к распознанным словам и строит титры ASS + SRT.

python3 -I build_subs.py script.txt words.json out.ass out.srt [--report]

Формат script.txt (одна строка — один экран титров):
  !TITLE Верхняя строка | нижняя строка      — заставка-хук (если произносится — по голосу)
  #1 Заголовок раздела                       — плашка раздела сверху до следующего #
  обычная фраза / вторая строка             — «/» = перенос строки, *слово* = акцент
"""
import difflib
import json
import re
import sys

LAT = {"helicobacter": "хеликобактер", "pylori": "пилори", "h": "аш", "c": "ц", "ii": "два"}

WHITE, MINT, GREEN, INK = "&H00FFFFFF", "&H00A7CD71", "&H0040520E", "&H001B1F17"


def norm(t):
    t = t.lower().replace("ё", "е")
    t = re.sub(r"[^a-zа-я0-9]", "", t)
    return LAT.get(t, t)


def parse(path):
    items = []
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        kind, text, num = "cap", line, None
        if line.startswith("!TITLE"):
            kind, text = "title", line[6:].strip()
        elif m := re.match(r"#(\d+)\s+(.*)", line):
            kind, num, text = "head", m.group(1), m.group(2)
        items.append({"kind": kind, "num": num, "text": text})
    return items


def tokens_of(items):
    """Слова для отображения и токены для сопоставления (дефис режем)."""
    toks = []
    for ii, it in enumerate(items):
        it["words"] = []
        for w in it["text"].replace("|", " / ").split():
            if w == "/":
                it["words"].append({"br": True})
                continue
            dw = {"text": w, "parts": []}
            it["words"].append(dw)
            for p in re.split(r"[-–]", w.replace("*", "")):
                n = norm(p)
                if n:
                    dw["parts"].append(len(toks))
                    toks.append({"n": n, "item": ii})
    return toks


def align(st, asr):
    """Глобальное выравнивание (Нидлман — Вунш) по похожести слов."""
    n, m = len(st), len(asr)
    GAP = -0.6

    def sim(a, b):
        return difflib.SequenceMatcher(None, a, b).ratio()

    S = [[0.0] * (m + 1) for _ in range(n + 1)]
    B = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        S[i][0], B[i][0] = i * GAP, 1
    for j in range(1, m + 1):
        S[0][j], B[0][j] = j * GAP, 2
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            r = sim(st[i - 1]["n"], asr[j - 1]["n"])
            d = S[i - 1][j - 1] + (2 * r - 1 if r >= 0.5 else -0.8)
            u, l = S[i - 1][j] + GAP, S[i][j - 1] + GAP
            S[i][j], B[i][j] = max((d, 0), (u, 1), (l, 2))
    pairs, i, j = [], n, m
    while i or j:
        b = B[i][j] if i and j else (1 if i else 2)
        if b == 0:
            pairs.append((i - 1, j - 1)); i -= 1; j -= 1
        elif b == 1:
            pairs.append((i - 1, None)); i -= 1
        else:
            pairs.append((None, j - 1)); j -= 1
    return pairs[::-1]


def ts(t, srt=False):
    t = max(0, t)
    h, r = divmod(t, 3600)
    mi, s = divmod(r, 60)
    if srt:
        return "%02d:%02d:%02d,%03d" % (h, mi, int(s), round((s - int(s)) * 1000) % 1000)
    return "%d:%02d:%05.2f" % (h, mi, s)


def esc(t):
    return t.replace("{", "(").replace("}", ")")


def render_words(words, accent_color, base_color):
    out, in_acc = [], False
    for w in words:
        if w.get("br"):
            out.append("\\N")
            continue
        segs = esc(w["text"]).split("*")
        t = segs[0]
        for seg in segs[1:]:  # каждая «*» переключает акцентный цвет
            in_acc = not in_acc
            t += "{\\c%s}" % (accent_color if in_acc else base_color) + seg
        out.append(t)
    return " ".join(out).replace(" \\N ", "\\N")


HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Golos Text ExtraBold,{cap_size},&H00FFFFFF,&H00FFFFFF,&H00111613,&H8C000000,0,0,0,0,100,100,0,0,1,{cap_outline},3,2,90,90,{cap_margin},204
Style: Head,Piazzolla SemiBold,60,&H00FBFBF9,&H00FBFBF9,&H1A40520E,&H1A40520E,0,0,0,0,100,100,0,0,3,18,0,8,90,90,{head_margin},204
Style: HeadNum,Golos Text Bold,40,&H00A7CD71,&H00A7CD71,&H1A40520E,&H1A40520E,0,0,0,0,100,100,2,0,3,14,0,8,90,90,{headnum_margin},204
Style: Title,Piazzolla Bold,96,&H00FFFFFF,&H00FFFFFF,&H00111613,&H8C000000,0,0,0,0,100,100,0,0,1,5,4,5,80,80,0,204
Style: Sub,Golos Text Bold,52,&H00FFFFFF,&H00FFFFFF,&H00111613,&H8C000000,0,0,0,0,100,100,0,0,1,4,3,5,90,90,0,204

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def main(script, words_path, out_ass, out_srt, report=False, cfg=None):
    cfg = cfg or {}
    items = parse(script)
    st = tokens_of(items)
    asr = json.load(open(words_path))
    for a in asr:
        a["n"] = norm(a["w"])
    pairs = align(st, asr)

    extra = [asr[j]["w"] for i, j in pairs if i is None]
    for i, j in pairs:
        if i is not None and j is not None:
            st[i]["start"], st[i]["end"] = asr[j]["start"], asr[j]["end"]
            st[i]["asr"] = asr[j]["w"]
    # непроизнесённые слова сценария — равномерно между соседями
    k = 0
    while k < len(st):
        if "start" in st[k]:
            k += 1
            continue
        e = k
        while e < len(st) and "start" not in st[e]:
            e += 1
        t0 = st[k - 1]["end"] if k else (st[e]["start"] if e < len(st) else 0)
        t1 = st[e]["start"] if e < len(st) else t0 + 0.4 * (e - k)
        for q in range(k, e):
            st[q]["start"] = t0 + (t1 - t0) * (q - k) / (e - k)
            st[q]["end"] = t0 + (t1 - t0) * (q - k + 1) / (e - k)
            st[q]["missing"] = True
        k = e

    for it in items:
        ps = [p for w in it["words"] if not w.get("br") for p in w["parts"]]
        it["start"] = min(st[p]["start"] for p in ps)
        it["end"] = max(st[p]["end"] for p in ps)
        it["spoken"] = sum(not st[p].get("missing") for p in ps) / len(ps)

    if report:
        for it in items:
            ps = [p for w in it["words"] if not w.get("br") for p in w["parts"]]
            heard = " ".join(st[p].get("asr", "·") for p in ps)
            print("%6.2f–%6.2f %-5s %3d%% | %s\n%21s| %s" % (it["start"], it["end"], it["kind"], it["spoken"] * 100,
                                                        it["text"], "", heard))
        print("\nЛишние слова в речи (нет в сценарии):", " ".join(extra) or "—")

    lead, tail = cfg.get("lead", 0.08), cfg.get("tail", 0.45)
    total = cfg.get("duration", items[-1]["end"] + 1.5)
    ev, srt = [], []

    caps = [it for it in items if it["kind"] == "cap" or (it["kind"] == "head" and cfg.get("head_as_cap"))]
    for n, it in enumerate(caps):
        s = it["start"] - lead
        nxt = caps[n + 1]["start"] - lead if n + 1 < len(caps) else total
        e = nxt if nxt - it["end"] < cfg.get("hold_gap", 1.5) else it["end"] + tail
        e = max(e, s + 0.6)
        txt = render_words(it["words"], MINT, WHITE)
        ev.append("Dialogue: 1,%s,%s,Cap,,0,0,0,,{\\fad(70,0)\\fscx94\\fscy94\\t(0,110,\\fscx100\\fscy100)}%s"
                  % (ts(s), ts(e), txt))
        srt.append((s, e, re.sub(r"\{[^}]*\}", "", txt).replace("\\N", "\n")))

    heads = [it for it in items if it["kind"] == "head"]
    for n, it in enumerate(heads):
        s = it["start"] - 0.15
        e = heads[n + 1]["start"] - 0.25 if n + 1 < len(heads) else total
        num = "{\\fad(150,0)}%s" % ("ПРИЧИНА %s" % it["num"] if cfg.get("head_word") is None else cfg["head_word"] % it["num"])
        ttl = "{\\fad(150,0)}" + render_words(it["words"], MINT, "&H00FBFBF9")
        ev.append("Dialogue: 2,%s,%s,HeadNum,,0,0,0,,%s" % (ts(s), ts(e), num))
        ev.append("Dialogue: 2,%s,%s,Head,,0,0,0,,%s" % (ts(s), ts(e), ttl))

    for it in [i for i in items if i["kind"] == "title"]:
        top, _, bottom = it["text"].partition("|")
        s = 0 if it["start"] < 2 else it["start"] - 0.1
        e = cfg.get("title_end", it["end"] + 0.3)
        ev.append("Dialogue: 3,%s,%s,Title,,0,0,0,,{\\pos(540,%d)\\fad(0,200)}%s"
                  % (ts(s), ts(e), cfg.get("title_y", 760), render_words(
                      [{"text": w} if w != "/" else {"br": True} for w in top.split()], MINT, WHITE)))
        if bottom.strip():
            ev.append("Dialogue: 3,%s,%s,Sub,,0,0,0,,{\\pos(540,%d)\\fad(0,200)}%s"
                      % (ts(s), ts(e), cfg.get("title_y", 760) + cfg.get("sub_dy", 250), render_words(
                          [{"text": w} if w != "/" else {"br": True} for w in bottom.split()], MINT, WHITE)))

    hdr = HEADER.format(cap_size=cfg.get("cap_size", 74), cap_outline=cfg.get("cap_outline", 5),
                        cap_margin=cfg.get("cap_margin", 470), head_margin=cfg.get("head_margin", 300),
                        headnum_margin=cfg.get("head_margin", 300) - 80)
    open(out_ass, "w", encoding="utf-8").write(hdr + "\n".join(ev) + "\n")
    with open(out_srt, "w", encoding="utf-8") as f:
        for n, (s, e, t) in enumerate(srt, 1):
            f.write("%d\n%s --> %s\n%s\n\n" % (n, ts(s, True), ts(e, True), t))
    return items


if __name__ == "__main__":
    a = sys.argv[1:]
    cfg = json.load(open(a[a.index("--cfg") + 1])) if "--cfg" in a else {}
    main(a[0], a[1], a[2], a[3], report="--report" in a, cfg=cfg)
