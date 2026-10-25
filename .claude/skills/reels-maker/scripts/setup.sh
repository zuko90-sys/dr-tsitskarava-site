#!/usr/bin/env bash
# Ставит всё нужное для монтажа рилсов в $REELS_KIT (по умолчанию ~/.cache/reels-kit):
#   python-пакеты, три модели распознавания русской речи (с GitHub-релизов sherpa-onnx —
#   HuggingFace в облачных сессиях обычно закрыт) и шрифты Golos Text / Piazzolla в TTF.
# Повторный запуск ничего не перекачивает. Запускай в фоне сразу, пока ждёшь видео.
set -euo pipefail
KIT="${REELS_KIT:-$HOME/.cache/reels-kit}"
mkdir -p "$KIT/models" "$KIT/fonts"

pip install -q sherpa-onnx numpy pillow fonttools 2>&1 | grep -vi "running pip as the 'root'" || true

REL=https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models
for m in sherpa-onnx-zipformer-ru-2024-09-18 \
         sherpa-onnx-nemo-transducer-giga-am-v2-russian-2025-04-19 \
         sherpa-onnx-whisper-turbo; do
  if [ ! -d "$KIT/models/$m" ]; then
    echo "модель $m…"
    curl -sSL "$REL/$m.tar.bz2" | tar xj -C "$KIT/models"
    rm -rf "$KIT/models/$m/test_wavs"
  fi
done

# Шрифты: CSS Google Fonts со «старым» User-Agent отдаёт ссылки на TTF (libass не читает woff2)
if [ ! -f "$KIT/fonts/GolosText-ExtraBold.ttf" ]; then
  cd "$KIT/fonts"
  for fam in "Golos+Text:wght@400;500;600;700;800;900" "Piazzolla:ital,wght@0,500;0,600;0,700;1,500"; do
    curl -sS -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=$fam"
  done | grep -oE "https://fonts.gstatic.com[^)]+\.ttf" | nl -nln | while read -r i u; do
    curl -sS -o "dl$i.ttf" "$u"
  done
  python3 -I - <<'EOF'
import glob, os
from fontTools.ttLib import TTFont
for p in glob.glob("dl*.ttf"):
    n = TTFont(p)["name"]
    fam = n.getDebugName(16) or n.getDebugName(1)
    sub = n.getDebugName(17) or n.getDebugName(2)
    os.replace(p, (fam + "-" + sub).replace(" ", "") + ".ttf")
EOF
fi

node -e "require('playwright')" 2>/dev/null || echo "ВНИМАНИЕ: нет playwright для node — анимационные вставки не отрендерить"
ls "$KIT/models" "$KIT/fonts"
echo "готово: $KIT"
