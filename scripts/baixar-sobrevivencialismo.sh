#!/usr/bin/env bash
# Baixa o canal @Sobrevivencialismo (vídeos e shorts, sem lives) em 360p + legendas PT para a Arca.
#
# Pode rodar de novo quantas vezes quiser, porque o progresso fica nos próprios arquivos:
#   - o vídeo está pronto quando existe data/youtube/sobrevivencialismo/<id>.mp4
#   - a legenda está pronta quando existe <id>.*.vtt
#   - um download que parou no meio (.part) continua de onde estava
# Cada rodada lista o canal, calcula o que falta, baixa e, se algo falhou, tenta de novo
# com espera crescente. Erro de rede, 429, Ctrl+C ou o Mac desligando não perdem nada: é só rodar de novo.
#
# Uso:
#   ./scripts/baixar-sobrevivencialismo.sh            # baixa tudo o que falta
#   ./scripts/baixar-sobrevivencialismo.sh status     # só mostra o progresso
#   ATUALIZAR=0 ./scripts/baixar-sobrevivencialismo.sh   # não tenta atualizar o yt-dlp
#
# Para deixar rodando com o terminal fechado:
#   nohup ./scripts/baixar-sobrevivencialismo.sh > /dev/null 2>&1 &
#   tail -f data/youtube/sobrevivencialismo/download.log
set -uo pipefail
cd "$(dirname "$0")/.."

CANAL=https://www.youtube.com/@Sobrevivencialismo
DIR=data/youtube/sobrevivencialismo
ALTURA=${ALTURA:-360}
MAX_RODADAS=${MAX_RODADAS:-8}          # rodadas de nova tentativa por execução
MAX_TENT_LEGENDA=${MAX_TENT_LEGENDA:-3} # depois disso o vídeo é marcado como "sem legenda"
MIN_LIVRE_GB=${MIN_LIVRE_GB:-20}
PARALELO=${PARALELO:-2}                # vídeos baixando ao mesmo tempo

LOG=$DIR/download.log
IDS=$DIR/ids.txt                 # todos os IDs do canal (atualizado a cada execução)
PENDENTES=$DIR/.pendentes.txt
SEM_LEGENDA=$DIR/sem-legenda.txt # vídeos que não têm legenda PT nenhuma no YouTube
TENT_LEG=$DIR/.tentativas-legenda.txt
LOCK=$DIR/.lock

mkdir -p "$DIR/meta" "$DIR/thumbs"
touch "$SEM_LEGENDA" "$TENT_LEG"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

tem_video()   { [ -s "$DIR/$1.mp4" ]; }
tem_legenda() { compgen -G "$DIR/$1.*.vtt" > /dev/null || grep -qx "$1" "$SEM_LEGENDA"; }

status() {
  local total=0 vid=0 leg=0 semleg
  [ -s "$IDS" ] && total=$(wc -l < "$IDS" | tr -d ' ')
  while read -r id; do
    [ -z "$id" ] && continue
    tem_video "$id" && vid=$((vid + 1))
    compgen -G "$DIR/$id.*.vtt" > /dev/null && leg=$((leg + 1))
  done < <(cat "$IDS" 2> /dev/null)
  semleg=$(grep -c . "$SEM_LEGENDA" 2>/dev/null || true)
  echo "vídeos: $vid/$total | legendas: $leg/$total (sem legenda no YouTube: ${semleg:-0}) | pasta: $(du -sh "$DIR" 2>/dev/null | cut -f1) | livre no HD: $(df -h . | awk 'NR==2{print $4}')"
}

if [ "${1:-}" = status ]; then status; exit 0; fi

# ---------- pré-checagens ----------
[ -d /Volumes/ARCA ] || { echo "HD ARCA não está montado"; exit 1; }
for b in yt-dlp ffmpeg; do command -v "$b" > /dev/null || { echo "falta $b (brew install $b)"; exit 1; }; done

# só uma execução por vez
if ! mkdir "$LOCK" 2> /dev/null; then
  if [ -f "$LOCK/pid" ] && kill -0 "$(cat "$LOCK/pid")" 2> /dev/null; then
    echo "já tem um download rodando (pid $(cat "$LOCK/pid"))"; exit 1
  fi
  rm -rf "$LOCK"; mkdir "$LOCK"   # lock velho, de uma execução que morreu
fi
echo $$ > "$LOCK/pid"
trap 'pkill -TERM -P $$ 2> /dev/null; pkill -TERM -f "yt-dlp.*$DIR" 2> /dev/null; rm -rf "$LOCK"; log "interrompido; rode de novo para continuar"; exit 130' INT TERM
trap 'rm -rf "$LOCK"' EXIT

# não deixa o Mac dormir enquanto baixa
command -v caffeinate > /dev/null && { caffeinate -dimsu -w $$ & }

log "===== início (altura ${ALTURA}p) ====="

# yt-dlp desatualizado é a causa nº 1 de falha com o YouTube
if [ "${ATUALIZAR:-1}" = 1 ]; then
  if command -v brew > /dev/null && brew list yt-dlp > /dev/null 2>&1; then
    # o brew às vezes sai com erro mesmo atualizando; a versão é logada logo abaixo
    brew upgrade yt-dlp >> "$LOG" 2>&1 || true
  else
    yt-dlp -U >> "$LOG" 2>&1 || log "aviso: não consegui atualizar o yt-dlp"
  fi
fi
log "yt-dlp $(yt-dlp --version)"

espaco_ok() {
  local livre; livre=$(df -g . | awk 'NR==2{print $4}')
  [ "$livre" -ge "$MIN_LIVRE_GB" ] || { log "PARADO: só ${livre} GB livres no HD (mínimo ${MIN_LIVRE_GB})"; return 1; }
}

# ---------- 1. lista todos os vídeos do canal ----------
# Só vídeos e shorts. As lives (aba streams) ficam de fora por decisão do usuário (2026-11-17).
listar() {
  local tmp=$DIR/.ids.novo n_videos; : > "$tmp"
  yt-dlp --no-update --flat-playlist --ignore-errors --print "%(id)s" "$CANAL/videos" >> "$tmp" 2>> "$LOG" \
    || log "aviso: falha ao listar a aba videos"
  n_videos=$(grep -cE '^[A-Za-z0-9_-]{11}$' "$tmp")
  yt-dlp --no-update --flat-playlist --ignore-errors --print "%(id)s" "$CANAL/shorts" >> "$tmp" 2>> "$LOG" \
    || log "aviso: falha ao listar a aba shorts"
  if [ "$n_videos" -gt 0 ]; then
    grep -E '^[A-Za-z0-9_-]{11}$' "$tmp" | awk '!v[$0]++' > "$IDS.novo" && mv "$IDS.novo" "$IDS"
  else
    log "aviso: listagem veio vazia; mantendo a lista anterior"
  fi
  rm -f "$tmp"
  log "canal: $(wc -l < "$IDS" | tr -d ' ') vídeos na lista (sem lives)"
}

calcular_pendentes() {
  : > "$PENDENTES"
  while read -r id; do
    [ -z "$id" ] && continue
    if ! tem_video "$id" || ! tem_legenda "$id"; then echo "$id" >> "$PENDENTES"; fi
  done < "$IDS"
  wc -l < "$PENDENTES" | tr -d ' '
}

# conta as tentativas de legenda; depois de MAX_TENT_LEGENDA, marca como sem legenda
registrar_sem_legenda() {
  while read -r id; do
    tem_video "$id" || continue
    compgen -G "$DIR/$id.*.vtt" > /dev/null && continue
    echo "$id" >> "$TENT_LEG"
    if [ "$(grep -cx "$id" "$TENT_LEG")" -ge "$MAX_TENT_LEGENDA" ] && ! grep -qx "$id" "$SEM_LEGENDA"; then
      echo "$id" >> "$SEM_LEGENDA"; log "sem legenda PT no YouTube: $id"
    fi
  done < "$PENDENTES"
}

# Divide os pendentes em PARALELO listas intercaladas e roda um yt-dlp para cada, ao mesmo tempo.
baixar() {
  local k pids=()
  for k in $(seq 0 $((PARALELO - 1))); do
    awk -v n="$PARALELO" -v k="$k" '(NR - 1) % n == k' "$PENDENTES" > "$PENDENTES.$k"
    [ -s "$PENDENTES.$k" ] || continue
    baixar_lista "$PENDENTES.$k" &
    pids+=($!)
  done
  [ ${#pids[@]} -gt 0 ] && wait "${pids[@]}"
  rm -f "$PENDENTES".[0-9]*
}

baixar_lista() {
  yt-dlp --no-update --ignore-errors --no-overwrites --continue \
    --batch-file "$1" \
    --extractor-args "youtube:lang=pt" \
    -f "bv*[vcodec^=avc1]+ba[ext=m4a]/bv*+ba/b" \
    -S "res:$ALTURA,vcodec:avc1,acodec:m4a" \
    --merge-output-format mp4 \
    --write-subs --write-auto-subs --sub-langs "pt-orig,pt,pt-BR" --sub-format vtt \
    --write-thumbnail --convert-thumbnails jpg \
    -o "$DIR/%(id)s.%(ext)s" -o "thumbnail:$DIR/thumbs/%(id)s.%(ext)s" \
    --print-to-file "%(.{id,title,upload_date,duration,description,webpage_url,channel,height})j" "$DIR/meta/%(id)s.json" \
    --retries 10 --fragment-retries 10 --file-access-retries 5 --retry-sleep exp=2:120 \
    --sleep-requests 1 --sleep-subtitles 3 --sleep-interval 3 --max-sleep-interval 8 \
    --newline --progress-delta 30 \
    >> "$LOG" 2>&1
}

# ---------- 2. rodadas de download ----------
listar
[ -s "$IDS" ] || { log "não consegui listar o canal (internet? yt-dlp?)"; exit 1; }

for rodada in $(seq 1 "$MAX_RODADAS"); do
  falta=$(calcular_pendentes)
  if [ "$falta" -eq 0 ]; then log "TUDO BAIXADO ✔"; break; fi
  espaco_ok || exit 1
  log "rodada $rodada/$MAX_RODADAS: faltam $falta"
  baixar
  registrar_sem_legenda
  log "fim da rodada $rodada — $(status)"
  falta=$(calcular_pendentes)
  if [ "$falta" -gt 0 ] && [ "$rodada" -lt "$MAX_RODADAS" ]; then
    espera=$((rodada * 120))   # 2, 4, 6... min: dá tempo de o 429 do YouTube passar
    log "ainda faltam $falta; esperando ${espera}s antes de tentar de novo"
    sleep "$espera"
  fi
done

falta=$(calcular_pendentes)
[ "$falta" -gt 0 ] && log "terminou com $falta pendentes (lista em $PENDENTES) — rode de novo mais tarde para continuar"
log "===== fim — $(status) ====="
