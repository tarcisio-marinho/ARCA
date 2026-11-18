import { config } from './config.ts'
import { getSetting } from './db.ts'

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string; name?: string }

export type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type ToolDef = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export async function currentChatModel() {
  return getSetting<string>('chat_model', config.chatModel)
}

export async function listModels(): Promise<string[]> {
  const r = await fetch(`${config.llmBaseUrl}/models`, { signal: AbortSignal.timeout(5000) })
  if (!r.ok) throw new Error(`model runner HTTP ${r.status}`)
  const j = (await r.json()) as { data: { id: string }[] }
  return j.data.map((m) => m.id)
}

/** Embeddings em lote. Retorna null se o modelo não estiver disponível (busca cai pra full-text). */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return []
  try {
    const r = await fetch(`${config.embedBaseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.embedModel, input: texts }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = (await r.json()) as { data: { embedding: number[]; index: number }[] }
    return j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  } catch (e) {
    console.warn('[embed] indisponível:', (e as Error).message)
    return null
  }
}

// Quantas gerações estão rodando agora (chat, tradutor…). Trabalho pesado de fundo (embeddings dos vídeos)
// espera a IA ficar livre para não roubar CPU de quem está esperando resposta.
let active = 0
let lastActive = 0
export const llmBusy = (coolDownMs = 8000) => active > 0 || Date.now() - lastActive < coolDownMs

export type StreamDelta = { content?: string; reasoning?: string; toolCalls?: ToolCall[]; finish?: string }

/**
 * Chat completion em streaming. Faz o parse do SSE e acumula tool_calls fragmentados.
 * Chama onDelta a cada pedaço de texto; devolve a mensagem final consolidada.
 */
export async function chatStream(
  messages: ChatMessage[],
  opts: { tools?: ToolDef[]; temperature?: number; maxTokens?: number; signal?: AbortSignal; think?: boolean; model?: string; toolChoice?: 'auto' | 'required'; presencePenalty?: number; topP?: number },
  onDelta: (d: StreamDelta) => void
): Promise<{ content: string; reasoning: string; toolCalls: ToolCall[]; finish: string }> {
  active++
  try {
    return await chatStreamInner(messages, opts, onDelta)
  } finally {
    active--
    lastActive = Date.now()
  }
}

async function chatStreamInner(
  messages: ChatMessage[],
  opts: Parameters<typeof chatStream>[1],
  onDelta: (d: StreamDelta) => void
): Promise<{ content: string; reasoning: string; toolCalls: ToolCall[]; finish: string }> {
  const model = opts.model ?? (await currentChatModel())
  const think = opts.think ?? false
  // Parâmetros recomendados pela Qwen para 3.5 (thinking vs. instruct)
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: opts.temperature ?? (think ? 0.6 : 0.7),
    top_p: opts.topP ?? (think ? 0.95 : 0.8),
    top_k: 20,
    presence_penalty: opts.presencePenalty ?? (think ? 0 : 1.0),
    max_tokens: opts.maxTokens ?? 4096,
    chat_template_kwargs: { enable_thinking: think },
  }
  if (opts.tools?.length) {
    body.tools = opts.tools
    if (opts.toolChoice) body.tool_choice = opts.toolChoice
  }

  const r = await fetch(`${config.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!r.ok || !r.body) throw new Error(`IA respondeu HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)

  let content = ''
  let reasoning = ''
  let finish = ''
  const calls = new Map<number, ToolCall>()
  const decoder = new TextDecoder()
  let buf = ''

  for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let j: any
      try {
        j = JSON.parse(data)
      } catch {
        continue
      }
      const choice = j.choices?.[0]
      if (!choice) continue
      const d = choice.delta ?? {}
      if (d.reasoning_content) {
        reasoning += d.reasoning_content
        onDelta({ reasoning: d.reasoning_content })
      }
      if (d.content) {
        content += d.content
        onDelta({ content: d.content })
      }
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? 0
        const cur = calls.get(i) ?? { id: tc.id ?? `call_${i}`, type: 'function', function: { name: '', arguments: '' } }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.function.name += tc.function.name
        if (tc.function?.arguments) cur.function.arguments += tc.function.arguments
        calls.set(i, cur)
      }
      if (choice.finish_reason) finish = choice.finish_reason
    }
  }
  return { content, reasoning, toolCalls: [...calls.values()], finish }
}

/** Chamada simples sem streaming (títulos, resumos). */
export async function complete(prompt: string, maxTokens = 64): Promise<string> {
  let out = ''
  const r = await chatStream(
    [{ role: 'user', content: prompt }],
    { maxTokens, temperature: 0.3, think: false },
    () => {}
  )
  out = r.content
  return out.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}
