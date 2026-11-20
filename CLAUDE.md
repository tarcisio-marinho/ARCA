# Arca — contexto para agentes

Kit offline de sobrevivência (~30 dias sem energia/internet) rodando em Docker no Mac do usuário. Visão geral de serviços, dados, IA e Bitcoin: **README.md** (leia primeiro). Este arquivo guarda o que não está no README: restrições, decisões, histórico e pendências.

Responder sempre em PT-BR informal e direto (dev sênior falando com dev).

## Onde mora / como rodar

- Projeto em `/Volumes/ARCA/arca` (HD externo WD Elements 750 GB, HFS+, mecânico ~21 MB/s), symlink em `~/Documents/Projects/arca`. Project NOMAD antigo em `/Volumes/ARCA/nomad` (dados reaproveitados por hardlink). **Git**: `main` em `github.com/tarcisio-marinho/ARCA` (repo **público**: `data/` e `.env` ficam fora pelo `.gitignore`; antes de commitar, conferir que não entra segredo nem dado pessoal). Backups manuais antigos em `data/backups/`.
- `docker compose up -d --build app` após mudar código (server + web viram uma imagem só). App em http://localhost:8088.
- Typecheck: `cd server && npx tsc --noEmit -p .` e `cd web && npx tsc --noEmit -p .`.
- Verificação visual: Chrome headless — `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --window-size=1440,900 --virtual-time-budget=4000 --screenshot=<arquivo>.png http://localhost:8088/<rota>` (não renderiza PDF).

## Restrições de ambiente (importantes)

- Mac M4 Pro 24 GB, mas a **VM do Docker tem só 7,6 GB** e às vezes há outros containers rodando junto (um cluster com Kafka ~3 GB). O `llm` (Qwen3.5-4B Q4_K_M, ctx 32768) usa ~4,5–6,4 GB; o processo-filho do llama.cpp já caiu por memória e recarrega sozinho em ~30 s.
- Docker Desktop 4.40 (mar/2025): Model Runner não carrega qwen3+, por isso a IA é o container `ghcr.io/ggml-org/llama.cpp` **só CPU** (~9 tokens/s de geração, ~100 tokens/s de prompt). Rodar nativo com Metal seria 4–6× mais rápido — assunto da conversa pendente sobre o modelo.
- HFS+ devolve nomes acentuados em NFD → normalizar caminhos para NFC quando virarem chave.
- Mirror padrão do Kiwix é lento daqui; usar dotsrc/fau.
- **Não iniciar downloads em massa sem pedido explícito.** Quando o usuário pedir estimativa, só estimar.

## Mapa do código

- `server/src/`: `index.ts` (Fastify, registra rotas/proxies), `config.ts`, `db.ts`, `kb.ts` (ingestão de `content/` + PDFs, chunks, embeddings; sync a cada 2 min), `llm.ts` (cliente OpenAI-compatible com streaming; `chatStream` aceita `temperature/topP/presencePenalty/think/maxTokens`), `agent.ts` (assistente RAG + agente dev), `kiwix.ts`, `toolkit.ts`, `btc.ts`, `find.ts` (busca literal; vídeos ficam fora do cache dele e entram via `findVideos`), `vtt.ts` (VTT → falas limpas, trechos de ~45 s, VTT limpo pro `<track>`), `videos.ts` (varredura de `data/youtube`, catálogo, Ctrl+F nas falas em memória, worker de embeddings dos vídeos), `routes/{core,chat,btc,translate,videos}.ts`.
- `llm.ts` exporta `llmBusy()`: trabalho pesado de fundo espera a IA terminar de gerar. `searchKb(q, limit, scope)`: `'docs'` (guias/PDFs/envios, `t_start IS NULL`) ou `'videos'` (trechos com tempo); a busca vetorial usa os índices HNSW parciais com a mesma expressão `embedding::vector(768)`.
- `web/src/`: React 19 + Vite + Tailwind 4 + react-router 7 + TanStack Query + Phosphor. `main.tsx` (rotas lazy), `components/{Layout,ui,FindBar,Highlighted,VideoCards}.tsx`, `lib/{api,highlight,video}.ts`, `pages/*` (Vídeos: `Videos.tsx` = grade + busca nas falas, `VideoPlayer.tsx` = player + transcrição). Visual: dark + dourado (estilo CRM TM). Componentes prontos em `components/ui.tsx` (Button, Card, Badge, Input, Textarea, Select, Tabs, PageHeader, Empty, Modal, CopyButton, Spinner…). SSE no front: `sse()` de `lib/api.ts`.
- Guias: `content/<NN-categoria>/*.md` com frontmatter `title`/`category`; reindexa sozinho.

## Histórico (o que já foi feito)

1. **Arca criada** (2026-11-03) substituindo o Project NOMAD: guias PT-BR, Kiwix (~40 ZIMs, 15 GB), mapas PMTiles Brasil z15 + mundo (20 GB), IA local com RAG (pgvector + full-text, RRF) e modo agente dev, CyberChef, toolkit cripto, carteira Bitcoin com PSBT offline, suprimentos, diário/notas, tela Sistema.
2. **Estimativa de arquivar canais do YouTube**: só estimativa; existe `scripts/youtube-archive.sh` (modos `subs`/`video`), mas nada foi baixado — só rodar se o usuário pedir.
3. **Migração para o HD externo** (2026-11-15): tudo, inclusive Postgres (`data/pg`), mora no HD.
4. **Guia "Apagão total — passo a passo das primeiras 72 horas"** (`content/06-planos/apagao-total-72-horas.md`), resumo de um debate em vídeo: 12 passos + linha do tempo + checklist.
5. **Busca global "Ctrl+F"** (`/busca`, caixa no topo da sidebar, atalhos ⌘K e `/`):
   - `GET /api/find?q=` (`server/src/find.ts`): busca literal em memória sobre a tabela `docs` (guias, PDFs, uploads) + `notes`; ignora acento, maiúscula e quebra de linha; se a frase exata não existe, cai para "todas as palavras". Markdown é convertido em texto limpo, guardando as seções; PDF guarda as páginas (`[página N]`). Cache invalidado pela assinatura da tabela docs. Primeira busca ~0,5 s, depois ~3 ms.
   - Aba Enciclopédias usa o `/api/library/search` (full-text do Kiwix, só ZIMs com índice).
   - Abrir resultado: guia/doc Markdown ganha destaque + `FindBar` (Enter/Shift+Enter/Esc); PDF abre em `#page=N&search=termo`; nota abre por `/notas?id=N`.
6. **Tradutor** (`/tradutor`, em Conhecimento) PT/EN/ES/IT/FR/DE:
   - `POST /api/translate` (SSE: `lang`, `same`, `status`, `delta`, `done`, `error`) em `server/src/routes/translate.ts`, usando o mesmo modelo do chat (temp 0.2, presence_penalty 0, sem thinking).
   - Detecção de idioma **sem IA** (palavras funcionais + marcas ortográficas); só pergunta à IA quando fica ambíguo. Antes, pedir pro 4B detectar e traduzir ao mesmo tempo falhava (devolvia o original).
   - Segurança de termos: `FORCE` troca no texto, antes da IA, termos perigosos ("água sanitária" → bleach/lejía/candeggina…, "soro caseiro"); `GLOSSARY` injeta no prompt o termo do idioma de destino (hipoclorito, torniquete, falsos cognatos). Motivo: o modelo traduziu "água sanitária" como "água potável".
   - Se o modelo cair (HTTP 5xx/proxy error), tenta de novo uma vez. Front: escolha de idiomas, inverter, tom (neutro/formal/informal), ouvir (speechSynthesis), copiar, histórico em localStorage. Tempos: frase ~4 s, parágrafo ~7 s, página ~1 min.
7. **Canal @Sobrevivencialismo baixado** (2026-11-17, 17:24 → 23:50) com `scripts/baixar-sobrevivencialismo.sh`:
   - **Escopo** (decisão do usuário): só abas `videos` + `shorts`, **sem lives**. São 1.372 IDs em `ids.txt`. Baixados **1.368 vídeos (~500 h), 95 GB**, em `data/youtube/sobrevivencialismo/`.
   - **Formato**: 360p H.264 + AAC em `.mp4` (formatos 18 ou 134/135+140, todos tocam no browser).
   - **Arquivos por vídeo**: `<id>.mp4`, `<id>.pt-orig.vtt` (1.308) e/ou `<id>.pt.vtt` (1.311), alguns `<id>.pt-BR.vtt` (5), `thumbs/<id>.jpg`, `meta/<id>.json`. O `pt-orig` e o `pt` das auto-legendas são iguais: usar um só, preferindo `pt-orig` > `pt` > `pt-BR`.
   - **`meta/<id>.json`**: JSON com `id, title, upload_date (AAAAMMDD), duration (s), description, webpage_url, channel, height`. **Atenção**: 58 arquivos têm mais de uma linha (o yt-dlp reescreveu a cada rodada), então ler só a 1ª linha.
   - **VTT**: são auto-legendas do YouTube, com o texto repetido em "rolagem" (cada frase aparece em 2–3 cues seguidos, com tags `<00:00:01.280><c>`). Precisa tirar as tags e deduplicar as linhas antes de indexar.
   - **Ficaram de fora**: 4 vídeos com restrição de idade (`HrYceqkqffs`, `kIN7O0GEHJg`, `qXaPRyx7QXM`, `xxGyz-OBa48`), que só baixam com `--cookies-from-browser` e o usuário logado. Também ficaram 56 vídeos (~31 h, 37 de 2021) que **não têm legenda PT nenhuma no YouTube** (lista: mp4 sem `.vtt`). Esses são candidatos a transcrever com Whisper local.
   - **Lixo deixado pelo yt-dlp** (não apagado, apagar só com o OK do usuário): ~50 `.jpg` soltos na raiz da pasta (duplicatas de `thumbs/`), `I7kdYWa3Wr0.f134.mp4` e `I7kdYWa3Wr0.f140.m4a.part` (o `I7kdYWa3Wr0.mp4` final existe). Também `download.log`, `nohup.out`, `sem-legenda.txt`, `.tentativas-legenda.txt`.
   - **Como o script funciona**: o progresso é a existência dos arquivos (retoma sozinho); `status` mostra o andamento; `PARALELO=N` divide os pendentes em N listas e roda um yt-dlp para cada; faz até 8 rodadas com espera crescente (para o 429); `MIN_LIVRE_GB=20`; usa `caffeinate`. Para rodar de novo: `PARALELO=3 ATUALIZAR=0 nohup ./scripts/baixar-sobrevivencialismo.sh &`. Para contar vídeos prontos, contar só arquivos `<id>.mp4` (o yt-dlp cria `.temp.mp4`/`.fNNN.mp4`/`.part` no meio). Há IDs que começam com `-`, então usar `--`/`./`.
   - **Velocidade real**: ~19 GB/h com 3 em paralelo (internet 300–400 Mbps). O gargalo foi o YouTube, não o HD.

8. **Área Vídeos — mini YouTube offline** (2026-11-18), canal Sobrevivencialismo (item 7):
   - **Telas**: `/videos` (grade com thumb/título/data/duração, filtro por título, ordenação novos/antigos/longos/curtos, rolagem infinita; aba "Buscar nas falas" = `/videos?aba=falas&q=`) e `/videos/<id>?t=<s>&q=<termo>` (player HTML5 + transcrição ao lado que acompanha o vídeo, clique pula, legenda opcional, "Link neste momento", ⌘F/Enter/Shift+Enter na transcrição). 56 vídeos sem legenda tocam normal com aviso "sem transcrição".
   - **Mídia**: `./data/youtube` montado read-only em `/data/youtube` (`VIDEOS_DIR`); servido em `/media/youtube/<canal>/<id>.mp4` e `.../thumbs/<id>.jpg` pelo `@fastify/static` com HTTP Range (206). Legenda limpa gerada em `GET /api/videos/:id/captions.vtt`.
   - **Transcrição** (`vtt.ts`): tira tags `<00:..><c>`, descarta linhas repetidas da rolagem (janela de 2 linhas), 1 segmento por fala nova; prioridade `pt-orig > pt > pt-BR` (os 4 vídeos com `pt-BR` manual também têm auto, então usam a auto — trocar a ordem em `SUB_PRIORITY` se quiser a manual). Resultado: 1.312 vídeos, 588 mil falas, 455 h de fala.
   - **Cache/idempotência**: tabela `videos` (meta + `segments` JSONB + `sig` = tamanhos/mtimes de mp4/vtt/meta + `PARSER_V`). Varredura no boot (+5 s) e a cada 10 min; sig igual = pula. Mudou o parser → suba `PARSER_V`. Vídeo some do disco → some do banco (só se a pasta do canal foi lida). `meta/<id>.json`: só a 1ª linha; 2 metas sem `channel` herdam o nome do canal.
   - **RAG**: cada vídeo vira 1 linha em `docs` (`source_type='video'`, `source_ref='video:<canal>/<id>'`) e trechos em `chunks` com `t_start/t_end` (34.641 trechos de 30–60 s, mediana 46 s), **sem heading** (heading tem peso A no full-text e o título "Como purificar PRATA?" afogava as falas). Full-text de vídeo: só PT e "todas as palavras" antes do OR. Índices `chunks_doc_hnsw`/`chunks_video_hnsw` (parciais) + `chunks_pending_idx`; `hnsw.ef_search=100` no banco.
   - **Embeddings dos vídeos**: worker próprio (`embedVideos`), lotes de 16, ~10 trechos/s com a máquina livre (~1 h no total; medido: EmbeddingGemma ~2.000 tok/s, 179 tok/trecho), retomável (`embedding IS NULL`), pausa sozinho enquanto `llmBusy()` e pode ser pausado na tela Sistema (`PUT /api/videos/index {paused}`; setting `videos_index_paused`). O backfill dos guias ignora vídeo (`t_start IS NULL`), então guia novo não espera na fila. Banco foi de 40 MB para ~505 MB (chunks 460 MB, dos quais o índice HNSW de vídeos é 135 MB; tabela videos 23 MB).
   - **Busca**: `GET /api/videos/find?q=&per=` (índice em memória: falas concatenadas normalizadas + offsets; ~15–25 ms por busca; monta em ~1,3 s; app foi de ~120 para ~180–290 MB). `/api/find` devolve também `videos` (aba/grupo "Vídeos" em `/busca`).
   - **IA**: `search_knowledge` traz até 3 trechos de vídeo (máx. 2 por vídeo, de 20 candidatos) como `[V1]`; o modelo cita `[V1 12:34]`; o servidor normaliza o tempo pro tempo real do trecho antes de salvar; o chip abre `/videos/<id>?t=`. `read_document` com `V*` lê ~1 min antes/3 min depois.
   - **Robustez do assistente**: no 1º passo o Qwen 4B às vezes ignora o `tool_choice: required` e "finge" chamadas em texto (`[search_knowledge] query: …`) até estourar os tokens — aconteceu com prompt antigo e novo. Agora o texto do 1º passo não vai pro usuário, o passo tem limite de 400 tokens e, sem chamada válida, a Arca busca com a própria pergunta.

9. **Categoria de guias "Veículos e realocação"** (2026-11-20), `content/08-veiculos/`: `bateria-12v-e-partida` (multímetro, diagnóstico de partida, chupeta, booster, fuga de corrente, carro parado, fusíveis/relés, segunda bateria), `consertos-de-emergencia` (luzes/OBD2, pneu, superaquecimento, óleo, correias, freio, combustível/sangria diesel, enchente, atolado, reboque, kit), `hibridos-e-eletricos` (MHEV/HEV/PHEV/EREV/BEV, alta tensão, 12 V nos eletrificados, autonomia e recarga em tomada comum, V2L/inversor, incêndio/enchente/reboque, qual carro para realocar) e `realocacao-de-carro` (gatilhos, regra do meio tanque, autonomia, galão/validade, rotas, carga, kit, comboio, pernoite, plano B, elétrico na fuga, checklist de saída em 2 h). Os guias linkam vídeos do canal no minuto certo (`/videos/<id>?t=`) e outros guias (`/guias/<slug>`). `como-usar-a-arca.md` ganhou a página Vídeos e as citações `[V…]`. Valores técnicos são gerais e com ressalva ("veja o manual"); conferir modelo a modelo antes de tratar como regra.

## Pendências / ideias já oferecidas (aguardando o usuário)

- **Conversa sobre o modelo de IA** (capacidade, qual usar, rodar nativo com Metal fora do Docker para ganhar velocidade). O usuário pediu explicitamente para ter essa conversa.
- Retomar o download da Wikipedia PT (`data/zim/wikipedia_pt_all_nopic_2026-05.zim.part` está com 0 bytes).
- Extrair os PDFs de dentro dos ZIMs zimgit e indexar; busca por título nos ZIMs sem índice full-text.
- Busca em PDFs em inglês com termo em português: hoje "torniquete" não acha o FM 21-76; dá para expandir a busca com tradução automática.
- Arquivar canais do YouTube: **só se pedirem**.
- Vídeos (item 8), opcionais combinados e ainda não feitos: baixar os 4 vídeos com restrição de idade (cookies) e transcrever com Whisper local os 56 vídeos sem legenda (entrariam sozinhos: basta gerar `<id>.pt.vtt` na pasta). Limpeza do lixo do yt-dlp na pasta do canal (item 7) segue aguardando OK.
