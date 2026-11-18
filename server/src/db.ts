import pg from 'pg'
import { config } from './config.ts'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params as any[])
  return r.rows as T[]
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0]
}

const MIGRATIONS = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS docs (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     category TEXT NOT NULL DEFAULT 'geral',
     source_type TEXT NOT NULL,           -- guide | pdf | upload | video
     source_ref TEXT UNIQUE NOT NULL,     -- caminho/nome do arquivo
     content_hash TEXT NOT NULL,
     content TEXT NOT NULL,
     summary TEXT,
     pages INT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS chunks (
     id SERIAL PRIMARY KEY,
     doc_id INT NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
     idx INT NOT NULL,
     heading TEXT,
     text TEXT NOT NULL,
     embedding vector,
     tsv tsvector GENERATED ALWAYS AS (
       setweight(to_tsvector('portuguese', coalesce(heading,'')), 'A') ||
       setweight(to_tsvector('portuguese', text), 'B') ||
       setweight(to_tsvector('english', text), 'C')
     ) STORED
   )`,
  `CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin(tsv)`,
  `CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks(doc_id)`,
  `CREATE TABLE IF NOT EXISTS conversations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     title TEXT NOT NULL DEFAULT 'Nova conversa',
     mode TEXT NOT NULL DEFAULT 'assistant',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS messages (
     id SERIAL PRIMARY KEY,
     conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
     role TEXT NOT NULL,          -- user | assistant | tool
     content TEXT NOT NULL,
     meta JSONB NOT NULL DEFAULT '{}',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, id)`,
  `CREATE TABLE IF NOT EXISTS supplies (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL,      -- agua | comida | remedio | higiene | energia | ferramenta | outro
     quantity NUMERIC NOT NULL DEFAULT 0,
     unit TEXT NOT NULL DEFAULT 'un',
     kcal_per_unit NUMERIC,       -- comida: kcal por unidade
     liters_per_unit NUMERIC,     -- água: litros por unidade
     expires_at DATE,
     location TEXT,
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value JSONB NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS map_points (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     kind TEXT NOT NULL DEFAULT 'ponto',   -- agua | abrigo | hospital | encontro | perigo | ponto
     lat DOUBLE PRECISION NOT NULL,
     lng DOUBLE PRECISION NOT NULL,
     notes TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS notes (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     body TEXT NOT NULL DEFAULT '',
     pinned BOOLEAN NOT NULL DEFAULT false,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS btc_wallets (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     network TEXT NOT NULL DEFAULT 'mainnet',
     kind TEXT NOT NULL,                 -- mnemonic | xprv | xpub | wif
     script_type TEXT NOT NULL DEFAULT 'p2wpkh',
     account_path TEXT,
     xpub TEXT,                          -- watch-only / derivação pública
     single_address TEXT,                -- carteiras WIF (uma chave)
     encrypted_secret TEXT,              -- AES-256-GCM + scrypt (senha do usuário)
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS btc_cache (
     wallet_id INT PRIMARY KEY REFERENCES btc_wallets(id) ON DELETE CASCADE,
     data JSONB NOT NULL,
     fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS btc_outbox (
     id SERIAL PRIMARY KEY,
     wallet_id INT REFERENCES btc_wallets(id) ON DELETE SET NULL,
     network TEXT NOT NULL,
     txid TEXT NOT NULL,
     hex TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',  -- pending | broadcast | failed
     error TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     broadcast_at TIMESTAMPTZ
   )`,
  // Vídeos (mini YouTube offline). segments = transcrição limpa [[início, fim, texto], ...]; sig = cache (tamanho/mtime dos arquivos)
  `CREATE TABLE IF NOT EXISTS videos (
     id TEXT PRIMARY KEY,                -- id do YouTube
     channel TEXT NOT NULL,              -- pasta em data/youtube
     channel_title TEXT,
     title TEXT NOT NULL,
     upload_date DATE,
     duration INT,
     description TEXT,
     url TEXT,
     has_thumb BOOLEAN NOT NULL DEFAULT false,
     sub_lang TEXT,                      -- pt-orig | pt | pt-BR | NULL (sem transcrição)
     segments JSONB,
     words INT NOT NULL DEFAULT 0,
     n_chunks INT NOT NULL DEFAULT 0,
     doc_id INT REFERENCES docs(id) ON DELETE SET NULL,
     sig TEXT NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  // trechos de vídeo guardam o tempo (s); t_start NULL = trecho de guia/PDF
  `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS t_start REAL`,
  `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS t_end REAL`,
  // 1ª versão gravava o título do vídeo como heading (peso A no full-text): limpa sem perder embeddings
  `UPDATE chunks SET heading = NULL WHERE t_start IS NOT NULL AND heading IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS chunks_pending_idx ON chunks(id) WHERE embedding IS NULL`,
  // busca vetorial com índice (EmbeddingGemma = 768 dims), separada em docs e vídeos para um não afogar o outro
  `CREATE INDEX IF NOT EXISTS chunks_doc_hnsw ON chunks USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE t_start IS NULL`,
  `CREATE INDEX IF NOT EXISTS chunks_video_hnsw ON chunks USING hnsw ((embedding::vector(768)) vector_cosine_ops) WHERE t_start IS NOT NULL`,
  `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET hnsw.ef_search = 100', current_database()); END $$`,
]

export async function migrate() {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1')
      break
    } catch (e) {
      if (attempt > 30) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  for (const sql of MIGRATIONS) await pool.query(sql)
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await one<{ value: T }>('SELECT value FROM settings WHERE key=$1', [key])
  return r ? r.value : fallback
}

export async function setSetting(key: string, value: unknown) {
  await q(
    `INSERT INTO settings(key,value) VALUES($1,$2::jsonb)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, JSON.stringify(value)]
  )
}
