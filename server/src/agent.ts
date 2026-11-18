import { spawn } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { decodeTx, verifyMessage, type Network } from './btc.ts'
import { config } from './config.ts'
import { one, q } from './db.ts'
import { searchKb } from './kb.ts'
import { readArticle, searchAll } from './kiwix.ts'
import { chatStream, type ChatMessage, type ToolCall, type ToolDef } from './llm.ts'
import { listOps, runOp } from './toolkit.ts'

export type Mode = 'assistant' | 'agent'
export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'think'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_end'; id: string; name: string; result: string; ok: boolean }
  | { type: 'sources'; sources: Source[] }
  | { type: 'done'; messageId: number }
  | { type: 'error'; message: string }

export type Source = { ref: string; kind: 'doc' | 'wiki'; title: string; subtitle?: string; url: string }

const SYSTEM_BASE = `Você é a ARCA, uma assistente que roda 100% offline numa máquina local, feita para ajudar uma família a atravessar um período sem energia elétrica e sem internet (cenário de ~30 dias).
Responda SEMPRE em português do Brasil, direto ao ponto, com passos numerados quando for procedimento.

Regras:
- Para qualquer pergunta factual (saúde, primeiros socorros, remédios, doenças, água, comida, sobrevivência, reparos, técnica), CHAME search_knowledge antes de responder. Use read_article/read_document para aprofundar quando o trecho não bastar.
- Baseie a resposta nas fontes e cite-as no texto com o marcador entre colchetes, ex: [D2] ou [W5]. Não invente fontes.
- Saúde: dê primeiro o que fazer AGORA, depois sinais de alarme que exigem atendimento profissional. Doses de remédio só com fonte, informando dose por peso/idade e dose máxima diária. Deixe claro que não substitui um profissional quando houver um disponível.
- Se as fontes não cobrirem, diga isso e responda com seu conhecimento geral, sinalizando que não veio do acervo.
- Em contas (doses, litros, watts, autonomia), escreva a fórmula com as unidades e confira se o resultado faz sentido antes de responder.
- Seja econômico: no cenário de sobrevivência a energia é limitada. Respostas objetivas, até ~300 palavras, salvo se o usuário pedir detalhes.`

const SYSTEM_AGENT = `

MODO AGENTE DEV: você também é um engenheiro de software. Você tem um workspace em /workspace com ferramentas para listar, ler, criar e editar arquivos e executar comandos (bash, node, python3, git).
- Antes de editar, leia o arquivo. Prefira edit_file (troca exata de trecho) a reescrever arquivos inteiros.
- Depois de mudar código, rode/teste com run_command e corrija até funcionar.
- Explique brevemente o que fez ao final.`

const TOOLS_KNOWLEDGE: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description:
        'Busca no acervo offline: guias curados em português, PDFs/documentos enviados e enciclopédias (Wikipédia PT, MedlinePlus, CDC, WikiMed, manuais militares de medicina, culinária, DIY, etc.). Retorna trechos com referência.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Termos de busca em português (curtos, palavras-chave)' },
          query_en: { type: 'string', description: 'Os mesmos termos traduzidos para inglês (muitas fontes médicas são em inglês)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_article',
      description: 'Lê o texto de um artigo de enciclopédia retornado por search_knowledge (refs W*).',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Referência do resultado, ex: W3' },
          focus: { type: 'string', description: 'Termos para focar nos parágrafos relevantes' },
        },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_document',
      description: 'Lê mais de um guia/documento do acervo (refs D*), opcionalmente focando em termos.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string', description: 'Referência, ex: D2' }, focus: { type: 'string' } },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toolkit',
      description: `Executa uma ferramenta de codificação/cripto/utilidade. Operações: ${listOps()
        .map((o) => o.id)
        .join(', ')}`,
      parameters: {
        type: 'object',
        properties: {
          op: { type: 'string' },
          input: { type: 'string' },
          params: { type: 'object', description: 'Parâmetros opcionais (ex: {"alg":"sha256"})' },
        },
        required: ['op'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bitcoin_inspect',
      description: 'Decodifica uma transação Bitcoin (hex) ou PSBT (base64), ou verifica uma assinatura de mensagem Bitcoin.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['decode', 'verify_message'] },
          data: { type: 'string', description: 'hex/PSBT para decode' },
          network: { type: 'string', enum: ['mainnet', 'testnet', 'signet'] },
          address: { type: 'string' },
          message: { type: 'string' },
          signature: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
]

const TOOLS_DEV: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Lista arquivos e pastas (relativo a /workspace).',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Pasta, padrão "."' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Lê um arquivo de texto do workspace com números de linha.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, offset: { type: 'number', description: 'linha inicial (1-based)' }, limit: { type: 'number' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Cria ou sobrescreve um arquivo no workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Substitui um trecho EXATO (único) de um arquivo por outro.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Procura um padrão (regex) no conteúdo dos arquivos do workspace (grep -rn).',
      parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Executa um comando bash em /workspace (node, python3, git, etc). Retorna saída e código de saída.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
]

// ───────────── ferramentas de workspace (sandbox no diretório montado) ─────────────

function wsPath(p = '.') {
  const root = path.resolve(config.workspaceDir)
  const full = path.resolve(root, p.replace(/^\/workspace\/?/, ''))
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('caminho fora do workspace')
  return full
}

function runCommand(command: string, timeoutMs = config.agentCommandTimeoutMs): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { cwd: wsPath(), env: { ...process.env, HOME: wsPath() } })
    let out = ''
    const cap = (b: Buffer) => {
      if (out.length < 40_000) out += b.toString()
    }
    child.stdout.on('data', cap)
    child.stderr.on('data', cap)
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      out += `\n[tempo esgotado após ${timeoutMs / 1000}s]`
    }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      const trimmed = out.length > 12_000 ? out.slice(0, 4000) + '\n…[saída cortada]…\n' + out.slice(-8000) : out
      resolve(`exit code: ${code}\n${trimmed}`)
    })
    child.on('error', (e) => resolve(`erro: ${e.message}`))
  })
}

// ───────────── execução de ferramentas ─────────────

type Ctx = { refs: Map<string, any>; sources: Map<string, Source>; counter: { d: number; w: number } }

async function execTool(name: string, args: any, ctx: Ctx): Promise<string> {
  switch (name) {
    case 'search_knowledge': {
      const query = String(args.query ?? '').trim()
      if (!query) return 'query vazia'
      const qEn = args.query_en ? String(args.query_en) : ''
      const [kbPt, kbEn, wikiPt, wikiEn] = await Promise.all([
        searchKb(query, 6),
        // PDFs em inglês (ex.: FM 21-76) quase não aparecem para busca em português — busca nas duas línguas
        qEn ? searchKb(qEn, 5) : Promise.resolve([]),
        searchAll(query, { langs: ['por'], perBook: 3, limit: 6 }).catch(() => []),
        args.query_en ? searchAll(String(args.query_en), { langs: ['eng'], perBook: 2, limit: 8 }).catch(() => []) : Promise.resolve([]),
      ])
      // intercala PT/EN sem repetir trechos (máx. 8)
      const kb: typeof kbPt = []
      const seen = new Set<number>()
      for (let i = 0; i < Math.max(kbPt.length, kbEn.length); i++)
        for (const h of [kbPt[i], kbEn[i]]) if (h && !seen.has(h.chunkId) && kb.length < 8) (seen.add(h.chunkId), kb.push(h))
      const lines: string[] = []
      for (const h of kb) {
        const ref = `D${++ctx.counter.d}`
        ctx.refs.set(ref, { kind: 'doc', docId: h.docId, title: h.title })
        ctx.sources.set(ref, { ref, kind: 'doc', title: h.title, subtitle: h.heading ?? h.category, url: `/docs/${h.docId}` })
        lines.push(`[${ref}] ${h.title}${h.heading ? ' › ' + h.heading : ''}\n${h.text.slice(0, 700)}`)
      }
      for (const h of [...wikiPt, ...wikiEn]) {
        const ref = `W${++ctx.counter.w}`
        ctx.refs.set(ref, { kind: 'wiki', book: h.book, path: h.path, title: h.title })
        ctx.sources.set(ref, { ref, kind: 'wiki', title: h.title, subtitle: h.bookTitle, url: `/kiwix/content/${h.book}/${h.path}` })
        lines.push(`[${ref}] ${h.title} — ${h.bookTitle} (${h.lang})\n${h.snippet}`)
      }
      return lines.length ? lines.join('\n\n') : 'Nada encontrado no acervo. Tente outros termos (sinônimos, termo técnico, inglês).'
    }
    case 'read_article': {
      const r = ctx.refs.get(String(args.ref))
      if (!r || r.kind !== 'wiki') return 'referência inválida (use um W* retornado pela busca)'
      const a = await readArticle(r.book, r.path, { focus: args.focus, maxChars: 5000 })
      return `# ${a.title}\n${a.text}`
    }
    case 'read_document': {
      const r = ctx.refs.get(String(args.ref))
      if (!r || r.kind !== 'doc') return 'referência inválida (use um D* retornado pela busca)'
      const doc = await one<{ title: string; content: string }>('SELECT title, content FROM docs WHERE id=$1', [r.docId])
      if (!doc) return 'documento não encontrado'
      let text = doc.content
      if (text.length > 5000 && args.focus) {
        const hits = await q<{ text: string; heading: string }>(
          `SELECT heading, text FROM chunks WHERE doc_id=$1 AND tsv @@ plainto_tsquery('portuguese', $2) ORDER BY ts_rank(tsv, plainto_tsquery('portuguese',$2)) DESC LIMIT 5`,
          [r.docId, args.focus]
        )
        if (hits.length) text = hits.map((h) => `## ${h.heading ?? ''}\n${h.text}`).join('\n\n')
      }
      return `# ${doc.title}\n${text.slice(0, 5000)}${text.length > 5000 ? '\n[…truncado]' : ''}`
    }
    case 'toolkit':
      return String(await runOp(String(args.op), String(args.input ?? ''), args.params ?? {}))
    case 'bitcoin_inspect':
      if (args.action === 'verify_message') return JSON.stringify(verifyMessage(args.address, args.message, args.signature), null, 2)
      return JSON.stringify(decodeTx(String(args.data ?? ''), (args.network ?? 'mainnet') as Network), null, 2)
    case 'list_files': {
      const dir = wsPath(args.path)
      const entries = await readdir(dir, { withFileTypes: true })
      const rows = await Promise.all(
        entries
          .filter((e) => !['node_modules', '.git'].includes(e.name))
          .slice(0, 300)
          .map(async (e) => (e.isDirectory() ? `${e.name}/` : `${e.name}  (${(await stat(path.join(dir, e.name))).size} B)`))
      )
      return rows.join('\n') || '(vazio)'
    }
    case 'read_file': {
      const lines = (await readFile(wsPath(args.path), 'utf8')).split('\n')
      const start = Math.max(1, Number(args.offset ?? 1))
      const lim = Math.min(800, Number(args.limit ?? 400))
      const slice = lines.slice(start - 1, start - 1 + lim)
      const body = slice.map((l, i) => `${String(start + i).padStart(5)}  ${l}`).join('\n')
      return body + (lines.length > start - 1 + lim ? `\n… (${lines.length} linhas no total)` : '')
    }
    case 'write_file': {
      const f = wsPath(args.path)
      await mkdir(path.dirname(f), { recursive: true })
      await writeFile(f, String(args.content ?? ''))
      return `arquivo salvo: ${args.path} (${String(args.content ?? '').length} chars)`
    }
    case 'edit_file': {
      const f = wsPath(args.path)
      const src = await readFile(f, 'utf8')
      const n = src.split(String(args.old_string)).length - 1
      if (n === 0) return 'ERRO: old_string não encontrado (leia o arquivo e copie o trecho exato)'
      if (n > 1) return `ERRO: old_string aparece ${n} vezes — inclua mais contexto para ficar único`
      await writeFile(f, src.replace(String(args.old_string), () => String(args.new_string)))
      return `editado: ${args.path}`
    }
    case 'search_files':
      return runCommand(`grep -rnI --exclude-dir=node_modules --exclude-dir=.git -E ${JSON.stringify(String(args.pattern))} ${JSON.stringify(String(args.path ?? '.'))} | head -100`, 20_000)
    case 'run_command':
      return runCommand(String(args.command))
    default:
      return `ferramenta desconhecida: ${name}`
  }
}

// ───────────── parser de stream: separa <think> e <tool_call> do texto ─────────────

class StreamSplitter {
  private buf = ''
  private mode: 'text' | 'think' | 'tool' = 'text'
  toolBlocks: string[] = []
  private toolBuf = ''
  constructor(private emit: (e: AgentEvent) => void) {}
  feed(s: string) {
    this.buf += s
    for (;;) {
      const tag = this.mode === 'text' ? /<think>|<tool_call>/ : this.mode === 'think' ? /<\/think>/ : /<\/tool_call>/
      const m = this.buf.match(tag)
      if (m && m.index !== undefined) {
        this.out(this.buf.slice(0, m.index))
        this.buf = this.buf.slice(m.index + m[0].length)
        if (this.mode === 'tool') {
          this.toolBlocks.push(this.toolBuf)
          this.toolBuf = ''
        }
        this.mode = m[0] === '<think>' ? 'think' : m[0] === '<tool_call>' ? 'tool' : 'text'
        continue
      }
      // segura um possível começo de tag cortado no fim do buffer
      const keep = this.buf.lastIndexOf('<')
      if (keep >= 0 && this.buf.length - keep < 12) {
        this.out(this.buf.slice(0, keep))
        this.buf = this.buf.slice(keep)
      } else {
        this.out(this.buf)
        this.buf = ''
      }
      break
    }
  }
  flush() {
    this.out(this.buf)
    this.buf = ''
    if (this.mode === 'tool' && this.toolBuf.trim()) this.toolBlocks.push(this.toolBuf)
  }
  private out(s: string) {
    if (!s) return
    if (this.mode === 'text') this.emit({ type: 'text', text: s })
    else if (this.mode === 'think') this.emit({ type: 'think', text: s })
    else this.toolBuf += s
  }
}

function parseToolBlocks(blocks: string[]): ToolCall[] {
  const out: ToolCall[] = []
  blocks.forEach((b, i) => {
    try {
      const j = JSON.parse(b.trim())
      out.push({ id: `tc_${Date.now()}_${i}`, type: 'function', function: { name: j.name, arguments: JSON.stringify(j.arguments ?? j.parameters ?? {}) } })
    } catch {}
  })
  return out
}

function stripTags(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim()
}

// ───────────── loop principal ─────────────

export async function runAgent(opts: {
  conversationId: string
  userMessage: string
  mode: Mode
  think: boolean
  signal: AbortSignal
  emit: (e: AgentEvent) => void
}) {
  const { conversationId, mode, emit } = opts
  await q('INSERT INTO messages(conversation_id, role, content) VALUES($1,$2,$3)', [conversationId, 'user', opts.userMessage])
  const conv = await one<{ title: string }>('SELECT title FROM conversations WHERE id=$1', [conversationId])
  if (conv?.title === 'Nova conversa') {
    const t = opts.userMessage.replace(/\s+/g, ' ').trim()
    await q('UPDATE conversations SET title=$2 WHERE id=$1', [conversationId, t.length > 60 ? t.slice(0, 57) + '…' : t])
  }
  await q('UPDATE conversations SET updated_at=now(), mode=$2 WHERE id=$1', [conversationId, mode])

  // histórico enxuto: só user/assistant finais, últimas 12 mensagens
  const history = await q<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM (SELECT role, content, id FROM messages WHERE conversation_id=$1 AND role IN ('user','assistant') ORDER BY id DESC LIMIT 12) t ORDER BY id`,
    [conversationId]
  )
  const sys = SYSTEM_BASE + (mode === 'agent' ? SYSTEM_AGENT : '')
  const messages: ChatMessage[] = [
    { role: 'system', content: sys },
    ...history.map((m) => ({ role: m.role, content: m.content.length > 4000 ? m.content.slice(0, 4000) + '…' : m.content }) as ChatMessage),
  ]

  const tools = mode === 'agent' ? [...TOOLS_KNOWLEDGE, ...TOOLS_DEV] : TOOLS_KNOWLEDGE
  const ctx: Ctx = { refs: new Map(), sources: new Map(), counter: { d: 0, w: 0 } }
  const toolLog: { name: string; args: unknown; result: string }[] = []
  let finalText = ''
  let thinkText = ''
  const maxSteps = mode === 'agent' ? 25 : 8

  for (let step = 0; step < maxSteps; step++) {
    let stepText = ''
    const splitter = new StreamSplitter((e) => {
      if (e.type === 'text') stepText += e.text
      if (e.type === 'think') thinkText += e.text
      emit(e)
    })
    const res = await chatStream(messages, {
        tools,
        signal: opts.signal,
        maxTokens: mode === 'agent' ? 4096 : 1800,
        think: opts.think,
        // Assistente: o primeiro passo SEMPRE consulta o acervo (modelos pequenos às vezes respondem "de cabeça")
        toolChoice: mode === 'assistant' && step === 0 ? 'required' : 'auto',
      }, (d) => {
      if (d.reasoning) {
        thinkText += d.reasoning
        emit({ type: 'think', text: d.reasoning })
      }
      if (d.content) splitter.feed(d.content)
    })
    splitter.flush()
    const calls = res.toolCalls.length ? res.toolCalls : parseToolBlocks(splitter.toolBlocks)
    finalText += stepText

    if (!calls.length) break

    messages.push({ role: 'assistant', content: stripTags(res.content) || null, tool_calls: calls })
    for (const call of calls) {
      let args: any = {}
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {}
      emit({ type: 'tool_start', id: call.id, name: call.function.name, args })
      let result: string
      let ok = true
      try {
        result = await execTool(call.function.name, args, ctx)
      } catch (e) {
        ok = false
        result = `ERRO: ${(e as Error).message}`
      }
      toolLog.push({ name: call.function.name, args, result: result.slice(0, 1500) })
      emit({ type: 'tool_end', id: call.id, name: call.function.name, result: result.slice(0, 4000), ok })
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result.slice(0, 7000) })
    }
    if (ctx.sources.size) emit({ type: 'sources', sources: [...ctx.sources.values()] })
    if (finalText && !finalText.endsWith('\n')) {
      finalText += '\n\n'
      emit({ type: 'text', text: '\n\n' })
    }
  }

  // só guarda fontes realmente citadas (ou todas, se o modelo não citou nenhuma)
  const cited = [...ctx.sources.values()].filter((s) => finalText.includes(`[${s.ref}]`))
  const sources = cited.length ? cited : [...ctx.sources.values()].slice(0, 6)
  const saved = await one<{ id: number }>(
    'INSERT INTO messages(conversation_id, role, content, meta) VALUES($1,$2,$3,$4) RETURNING id',
    [conversationId, 'assistant', finalText.trim(), JSON.stringify({ sources, tools: toolLog, think: thinkText.slice(0, 20000) })]
  )
  emit({ type: 'sources', sources })
  emit({ type: 'done', messageId: saved!.id })
}
