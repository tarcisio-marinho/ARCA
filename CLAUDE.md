# Arca — contexto para agentes

Kit offline de sobrevivência (~30 dias sem energia/internet) rodando em Docker no Mac do usuário. Visão geral de serviços, dados, IA e Bitcoin: **README.md** (leia primeiro). Este arquivo guarda o que não está no README: restrições, decisões, histórico e pendências.

Responder sempre em PT-BR informal e direto (dev sênior falando com dev).

## Onde mora / como rodar

- Projeto em `/Volumes/ARCA/arca` (HD externo WD Elements 750 GB, HFS+, mecânico ~21 MB/s), symlink em `~/Documents/Projects/arca`. Project NOMAD antigo em `/Volumes/ARCA/nomad` (dados reaproveitados por hardlink). **Não é repositório git.**
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

- `server/src/`: `index.ts` (Fastify, registra rotas/proxies), `config.ts`, `db.ts`, `kb.ts` (ingestão de `content/` + PDFs, chunks, embeddings; sync a cada 2 min), `llm.ts` (cliente OpenAI-compatible com streaming; `chatStream` aceita `temperature/topP/presencePenalty/think/maxTokens`), `agent.ts` (assistente RAG + agente dev), `kiwix.ts`, `toolkit.ts`, `btc.ts`, `find.ts` (busca literal), `routes/{core,chat,btc,translate}.ts`.
- `web/src/`: React 19 + Vite + Tailwind 4 + react-router 7 + TanStack Query + Phosphor. `main.tsx` (rotas lazy), `components/{Layout,ui,FindBar}.tsx`, `lib/{api,highlight}.ts`, `pages/*`. Visual: dark + dourado (estilo CRM TM). Componentes prontos em `components/ui.tsx` (Button, Card, Badge, Input, Textarea, Select, Tabs, PageHeader, Empty, Modal, CopyButton, Spinner…). SSE no front: `sse()` de `lib/api.ts`.
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

## Pendências / ideias já oferecidas (aguardando o usuário)

- **Conversa sobre o modelo de IA** (capacidade, qual usar, rodar nativo com Metal fora do Docker para ganhar velocidade). O usuário pediu explicitamente para ter essa conversa.
- Retomar o download da Wikipedia PT (`data/zim/wikipedia_pt_all_nopic_2026-05.zim.part` está com 0 bytes).
- Extrair os PDFs de dentro dos ZIMs zimgit e indexar; busca por título nos ZIMs sem índice full-text.
- Busca em PDFs em inglês com termo em português: hoje "torniquete" não acha o FM 21-76; dá para expandir a busca com tradução automática.
- Arquivar canais do YouTube: **só se pedirem**.
- **[PEDIDO 2026-11-18, a fazer] Área "Vídeos" (mini YouTube) com o canal Sobrevivencialismo.** Os dados já estão baixados (histórico item 7). Falta fazer:
  1. Uma tela com a lista de vídeos (thumb, título, data, duração, busca por título) e um player HTML5 no browser, com a legenda acompanhando e clicável para pular.
  2. Um "Ctrl+F" nas falas: busca literal nas legendas de todos os vídeos e no vídeo aberto, que leva ao momento exato (`currentTime`).
  3. Indexar as falas em trechos de ~30–60 s, **com o tempo inicial**, no RAG (`docs`/`chunks`, embeddings + full-text) e no `find.ts`. A IA cita `[V1 12:34]` com link que abre o vídeo naquele segundo.
  - Opcionais combinados: baixar os 4 vídeos com restrição de idade usando cookies e transcrever com Whisper os 56 vídeos sem legenda.
