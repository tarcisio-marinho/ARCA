#!/bin/sh
# Registra todos os .zim de /data numa library e fica de olho em arquivos novos a cada 60s.
# kiwix-serve --monitorLibrary recarrega sozinho: baixou um ZIM novo → aparece na Arca, sem restart.
LIB=/tmp/library.xml
SEEN=/tmp/seen.txt
echo '<?xml version="1.0" encoding="UTF-8"?><library version="20110515"></library>' > "$LIB"
: > "$SEEN"
add_new() {
  for f in /data/*.zim; do
    [ -f "$f" ] || continue
    grep -qxF "$f" "$SEEN" && continue
    if kiwix-manage "$LIB" add "$f" >/dev/null 2>&1; then echo "$f" >> "$SEEN"; echo "[kiwix] + $f"; fi
  done
}
add_new
( while sleep 60; do add_new; done ) &
exec kiwix-serve --port=8080 --urlRootLocation=/kiwix --monitorLibrary --library "$LIB"
