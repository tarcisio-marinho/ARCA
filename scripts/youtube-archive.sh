#!/usr/bin/env bash
# Arquiva um canal do YouTube na Arca: metadados + legendas (sempre) e, opcionalmente, vídeo em baixa qualidade.
# Incremental: --download-archive lembra o que já foi baixado; rodar de novo só pega vídeos novos.
#
# Uso:
#   ./scripts/youtube-archive.sh subs  <url-do-canal> [pasta]     # só legendas + info (MBs)
#   ./scripts/youtube-archive.sh video <url-do-canal> [pasta] [altura]   # vídeo (padrão 144p) + legendas
#
# Ex.: ./scripts/youtube-archive.sh subs https://www.youtube.com/@Sobrevivencialismo/videos sobrevivencialismo
set -uo pipefail
cd "$(dirname "$0")/.."
MODE=${1:?subs|video}
URL=${2:?url do canal}
NAME=${3:-$(echo "$URL" | sed -E 's#.*/@([^/]+).*#\1#' | tr 'A-Z' 'a-z')}
HEIGHT=${4:-144}
DIR=data/youtube/$NAME
mkdir -p "$DIR"

COMMON=(
  --no-update --ignore-errors --no-overwrites
  --extractor-args "youtube:lang=pt"        # títulos/descrição no idioma original, não traduzidos
  --no-write-playlist-metafiles
  # metadados enxutos (o info.json completo tem ~1,5 MB/vídeo por causa da lista de formatos)
  --print-to-file "%(.{id,title,upload_date,duration,description,webpage_url,channel})j" "$DIR/videos.jsonl"
  --write-subs --write-auto-subs --sub-langs "pt-orig,pt-BR" --sub-format vtt
  --sleep-requests 1 --sleep-subtitles 2     # evita 429 do YouTube
  -o "$DIR/%(id)s.%(ext)s"
)

case "$MODE" in
  subs)
    yt-dlp "${COMMON[@]}" --skip-download \
      --download-archive "$DIR/.archive-subs.txt" "$URL"
    ;;
  video)
    # vídeo de menor bitrate até a altura pedida + áudio mais leve, remuxado em mp4 (toca em qualquer navegador)
    yt-dlp "${COMMON[@]}" \
      -f "bv*[height<=$HEIGHT][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=$HEIGHT]+ba/b[height<=$HEIGHT]/w" \
      -S "+size,+br" --merge-output-format mp4 \
      --sleep-interval 2 --max-sleep-interval 6 \
      --download-archive "$DIR/.archive-video.txt" "$URL"
    ;;
  *) echo "modo inválido: $MODE"; exit 1 ;;
esac
echo "== fim: $(wc -l < "$DIR/videos.jsonl" 2>/dev/null) vídeos com metadados, $(ls "$DIR"/*.vtt 2>/dev/null | wc -l) legendas, $(du -sh "$DIR" | cut -f1)"
