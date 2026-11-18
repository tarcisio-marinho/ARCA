# Arca

Kit offline para atravessar ~30 dias sem energia da rua e sem internet: guias de sobrevivência em PT-BR, enciclopédias, mapas, IA local com RAG e modo agente, ferramentas de cripto/codificação e carteira Bitcoin com assinatura offline.

```bash
docker compose up -d --build     # sobe tudo
open http://localhost:8088
./scripts/download-content.sh    # baixa/atualiza acervo (ZIMs + PDFs); idempotente e retoma downloads parciais
```

## Serviços (`compose.yml`)

| Serviço | O quê | RAM aprox. |
|---|---|---|
| `app` | Node 22 + Fastify (API, SPA React, mapas, vídeos, proxy) — bundle único | ~200 MB |
| `db` | PostgreSQL 16 + pgvector (docs, chunks/embeddings, conversas, suprimentos, carteiras) | ~50 MB |
| `kiwix` | kiwix-serve; registra sozinho qualquer `.zim` novo em `data/zim` a cada 60 s | ~50 MB |
| `llm` | llama.cpp em *router mode*: cada `.gguf` em `data/models/chat` é um modelo selecionável na UI | ~4 GB (4B) |
| `embed` | llama.cpp com EmbeddingGemma 300M (busca semântica) | ~400 MB |
| `cyberchef` | CyberChef (em `/cyberchef`) | ~10 MB |

## Dados (`data/`, fora do git)

- `zim/` — enciclopédias Kiwix (parte reaproveitada do Project NOMAD via *hardlink*: zero espaço extra)
- `maps/` — PMTiles do Brasil (z15) e do mundo + fontes/sprites (também hardlink do NOMAD)
- `pdfs/` — referências (Hesperian "Onde não há médico" PT, FM 21-76…), manifesto em `scripts/pdfs.txt`
- `models/chat`, `models/embed` — GGUFs
- `youtube/<canal>/` — vídeos offline (`<id>.mp4`, legendas `<id>.pt-orig|pt|pt-BR.vtt`, `thumbs/`, `meta/`); montado read-only no `app`
- `uploads/` — arquivos enviados pela UI; `workspace/` — área de trabalho do Agente dev

Guias curados ficam em `content/` (Markdown com frontmatter). Editou/adicionou → reindexa sozinho em até 2 min.

## IA

- **Assistente**: busca híbrida (pgvector + full-text PT/EN, fusão RRF) nos guias/PDFs e nas falas dos vídeos + busca full-text em todos os ZIMs; cita fontes `[D1]`/`[W3]` e vídeos com o minuto, `[V1 12:34]` (clicável, abre o vídeo naquele ponto).
- **Agente dev**: + `list_files`, `read_file`, `write_file`, `edit_file`, `search_files`, `run_command` (bash/node/python3/git) restritos a `/workspace`.
- Trocar modelo: coloque outro `.gguf` em `data/models/chat/` e escolha no seletor da tela de IA.
- Usar GPU/Metal (mais rápido): atualize o Docker Desktop e aponte `LLM_BASE_URL=http://model-runner.docker.internal/engines/v1` + `CHAT_MODEL=<modelo>` no `.env`.

## Vídeos

Mini YouTube offline em `/videos`: grade com busca por título e ordenação, player no browser (seek via HTTP Range), legenda opcional e transcrição ao lado que acompanha o vídeo — clique numa fala para pular. Link com tempo: `/videos/<id>?t=754`.

- **Ctrl+F nas falas**: dentro do vídeo (⌘F, Enter/Shift+Enter pula entre as ocorrências) e em todos os vídeos de uma vez (aba "Buscar nas falas" e grupo "Vídeos" em `/busca`). API: `GET /api/videos/find?q=`.
- **IA**: as falas viram trechos de ~45 s com o tempo inicial no RAG. Os embeddings são gerados em segundo plano (~1 h para o canal todo, retomável, pausa enquanto a IA responde); progresso e botão de pausa na tela **Sistema**.
- Canal novo: crie `data/youtube/<canal>/` no mesmo formato — a Arca encontra sozinha em até 10 min. Vídeo sem legenda toca normal, mas fica fora da busca e da IA.

## Busca e tradutor

- **Buscar em tudo** (`/busca`, caixa na sidebar, ⌘K ou `/`): Ctrl+F literal em guias, PDFs, uploads, notas e falas dos vídeos, sem diferenciar acento ou maiúscula, mais o full-text das enciclopédias. Abre o resultado já destacado (guias) ou na página certa (PDFs). API: `GET /api/find?q=`.
- **Tradutor** (`/tradutor`): PT, EN, ES, IT, FR e DE com a IA local, detecção automática de idioma e glossário de termos de sobrevivência. API: `POST /api/translate` (SSE).

## Bitcoin

Semente BIP39 (gerada aqui, com entropia extra opcional) ou importada, watch-only por xpub/ypub/zpub, ou WIF. Chaves cifradas no banco com AES-256-GCM + scrypt (senha local). Monta PSBT a partir de UTXOs em cache (funciona offline), assina offline, decodifica tx/PSBT, assina/verifica mensagens (BIP137) e mantém fila de transmissão que reenvia sozinha quando a internet volta. Backends Esplora com fallback: mempool.space → blockstream.info (`ESPLORA_MAINNET` etc. aceitam lista separada por vírgula, inclusive um nó próprio).

## Dev

```bash
cd server && npm i && npm run typecheck && npm run build
cd web && npm i && npm run dev        # proxy para o app em :8088
```
