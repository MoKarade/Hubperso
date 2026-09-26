#!/usr/bin/env bash
# Captures des maquettes (Chrome sans fenêtre) : ./capturer.sh [page ...]  -> captures/<page>-<largeur>.png
C="/c/Program Files/Google/Chrome/Application/chrome.exe"
cd "$(dirname "$0")" || exit 1
mkdir -p captures
D="$(pwd -W)"
pages="${*:-accueil app attention couts administration etats login}"
for p in $pages; do
  for s in "360 1600" "768 1700" "1440 1400"; do
    set -- $s
    if [ "$1" = "360" ]; then
      # Chrome sans fenêtre impose ~500 px de large minimum : on cadre la page dans une iframe de 360 px.
      printf '<body style="margin:0;background:#333"><iframe src="%s.html" style="width:360px;height:%spx;border:0;display:block"></iframe>' "$p" "$2" > _cadre360.html
      "$C" --headless=new --disable-gpu --hide-scrollbars --window-size="500,$2" --virtual-time-budget=4000 \
        --screenshot="$D/captures/$p-360.png" "file:///$D/_cadre360.html" >/dev/null 2>&1
    else
      "$C" --headless=new --disable-gpu --hide-scrollbars --window-size="$1,$2" --virtual-time-budget=4000 \
        --screenshot="$D/captures/$p-$1.png" "file:///$D/$p.html" >/dev/null 2>&1
    fi
  done
done
rm -f _cadre360.html
ls captures | wc -l
