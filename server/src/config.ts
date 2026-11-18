const env = process.env

export const config = {
  port: Number(env.PORT ?? 8080),
  databaseUrl: env.DATABASE_URL ?? 'postgres://arca:arca@localhost:5432/arca',
  // Qualquer servidor OpenAI-compatible. Padrão: container llama.cpp (router mode, troca de modelo por request).
  // Alternativa com GPU/Metal: Docker Model Runner → http://model-runner.docker.internal/engines/v1
  llmBaseUrl: (env.LLM_BASE_URL ?? 'http://llm:8080/v1').replace(/\/$/, ''),
  embedBaseUrl: (env.EMBED_BASE_URL ?? 'http://embed:8080/v1').replace(/\/$/, ''),
  chatModel: env.CHAT_MODEL ?? 'Qwen3.5-4B-Q4_K_M',
  embedModel: env.EMBED_MODEL ?? 'embeddinggemma-300M-Q8_0',
  kiwixUrl: (env.KIWIX_URL ?? 'http://kiwix:8080/kiwix').replace(/\/$/, ''),
  cyberchefUrl: env.CYBERCHEF_URL ?? 'http://cyberchef:80',
  // Diretórios montados no container
  webDir: env.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname,
  contentDir: env.CONTENT_DIR ?? new URL('../../content', import.meta.url).pathname,
  pdfDir: env.PDF_DIR ?? new URL('../../data/pdfs', import.meta.url).pathname,
  uploadDir: env.UPLOAD_DIR ?? new URL('../../data/uploads', import.meta.url).pathname,
  mapsDir: env.MAPS_DIR ?? new URL('../../data/maps', import.meta.url).pathname,
  zimDir: env.ZIM_DIR ?? new URL('../../data/zim', import.meta.url).pathname,
  workspaceDir: env.WORKSPACE_DIR ?? new URL('../../data/workspace', import.meta.url).pathname,
  // Bitcoin: API Esplora (mempool.space / blockstream / sua própria instância). Só usada quando há internet.
  // Lista separada por vírgula = fallback em ordem (se um cair/limitar, tenta o próximo).
  esplora: {
    mainnet: (env.ESPLORA_MAINNET ?? 'https://mempool.space/api,https://blockstream.info/api').split(','),
    testnet: (env.ESPLORA_TESTNET ?? 'https://mempool.space/testnet/api,https://blockstream.info/testnet/api').split(','),
    signet: (env.ESPLORA_SIGNET ?? 'https://mempool.space/signet/api,https://blockstream.info/signet/api').split(','),
  } as Record<string, string[]>,
  agentCommandTimeoutMs: Number(env.AGENT_CMD_TIMEOUT_MS ?? 120_000),
}
