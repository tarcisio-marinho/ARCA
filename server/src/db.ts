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
     source_type TEXT NOT NULL,           -- guide | pdf | upload
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
