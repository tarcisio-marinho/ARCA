#!/usr/bin/env bash
# Baixa o acervo offline da Arca (ZIMs do Kiwix + PDFs de domínio público/livre).
# Idempotente: pula o que já existe e retoma downloads parciais (curl -C -).
# Uso: ./scripts/download-content.sh [zim|pdf|all]
set -uo pipefail
cd "$(dirname "$0")/.."
ZIM_DIR=data/zim
PDF_DIR=data/pdfs
mkdir -p "$ZIM_DIR" "$PDF_DIR"

# Mirrors rápidos testados (download.kiwix.org às vezes redireciona p/ mirror lento). Tenta em ordem.
MIRRORS=(${KIWIX_MIRROR:-} https://mirrors.dotsrc.org/kiwix/zim https://ftp.fau.de/kiwix/zim https://mirror.accum.se/mirror/kiwix.org/zim https://download.kiwix.org/zim)

# Ordem = prioridade (pequenos e críticos primeiro, Wikipédia completa por último)
ZIMS=(
  "other/zimgit-water_en_*.zim"
  "other/zimgit-medicine_en_*.zim"
  "other/zimgit-knots_en_*.zim"
  "other/zimgit-post-disaster_en_*.zim"
  "wikipedia/wikipedia_pt_medicine_maxi_*.zim"
  "wikipedia/wikipedia_en_medicine_nopic_*.zim"
  "other/wikivet.net_en_all_maxi_*.zim"
  "other/gardenology.org_en_all_*.zim"
  "other/appropedia_en_all_maxi_*.zim"
  "other/energypedia_en_all_nopic_*.zim"
  "wiktionary/wiktionary_pt_all_nopic_*.zim"
  "wikibooks/wikibooks_pt_all_maxi_*.zim"
  "wikivoyage/wikivoyage_pt_all_maxi_*.zim"
  "ifixit/ifixit_pt_all_*.zim"
  "wikipedia/wikipedia_pt_all_nopic_*.zim"
)

# Resolve o arquivo mais recente que casa com o padrão olhando o índice do diretório
resolve() {
  local pat="$1" dir="${1%/*}" glob="${1##*/}"
  if [[ "$glob" != *"*"* ]]; then echo "$pat"; return; fi
  local re="^${glob//\*/.*}$"
  local m listing=""
  for m in "${MIRRORS[@]}"; do
    listing=$(curl -sfL --max-time 30 "$m/$dir/") && [[ "$listing" == *".zim"* ]] && break
  done
  echo "$listing" | grep -oE 'href="[^"]+\.zim"' | sed 's/href="//;s/"$//' \
    | grep -E "$re" | sort | tail -1 | sed "s|^|$dir/|"
}

dl_zims() {
  for p in "${ZIMS[@]}"; do
    local rel; rel=$(resolve "$p")
    [[ -z "$rel" ]] && { echo "!! não achei: $p"; continue; }
    local name="${rel##*/}"
    # já tem uma versão (qualquer data) desse livro? pula
    local base="${name%_*}"
    if ls "$ZIM_DIR/${base}_"*.zim >/dev/null 2>&1; then echo "ok  $name (já existe)"; continue; fi
    echo ">>  $name"
    local ok=0 m
    for m in "${MIRRORS[@]}"; do
      # -C - retoma o .part mesmo trocando de mirror; aborta mirror se ficar < 200KB/s por 60s
      if curl -fL -C - --retry 3 --retry-delay 5 --speed-limit 200000 --speed-time 60 \
           -o "$ZIM_DIR/$name.part" "$m/$rel"; then ok=1; break; fi
      echo "   mirror falhou ($m), tentando o próximo…"
    done
    if [[ $ok == 1 ]]; then mv "$ZIM_DIR/$name.part" "$ZIM_DIR/$name"; echo "OK  $name"; else echo "!! falhou: $name"; fi
  done
}

# PDFs: manifesto em scripts/pdfs.txt ("caminho/nome.pdf|url"). Hesperian publica seus livros
# livremente; o "Onde não há médico" em português vem capítulo por capítulo.
dl_pdfs() {
  while IFS='|' read -r name url; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    local dest="$PDF_DIR/$name"
    [[ -s "$dest" ]] && { echo "ok  $name"; continue; }
    mkdir -p "$(dirname "$dest")"
    if curl -fsL --retry 3 -o "$dest.part" "$url" && head -c 4 "$dest.part" | grep -q '%PDF'; then
      mv "$dest.part" "$dest"; echo "OK  $name"
    else rm -f "$dest.part"; echo "!! falhou: $name"; fi
  done < scripts/pdfs.txt
}

case "${1:-all}" in
  zim) dl_zims ;;
  pdf) dl_pdfs ;;
  *) dl_pdfs; dl_zims ;;
esac
echo "== fim. Reinicie o kiwix: docker compose restart kiwix"
