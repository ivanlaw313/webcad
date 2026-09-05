// T809：AI Copilot — 多供应商聊天 + 工具调用（function calling）适配层。
// OpenAI / xAI(Grok) / 本地(Ollama·LM Studio) 全部 OpenAI-compatible（/chat/completions + tools）；
// Google Gemini 用自己格式（generateContent + functionDeclarations）。全部纯浏览器 fetch、零服务器、零依赖。
// 安全：API key 系用户自己嘅、存喺自己浏览器 localStorage，直连供应商（同 webcad serverless 一致）。
export type AiProvider = 'openai' | 'grok' | 'gemini' | 'local'
export type AiConfig = { provider: AiProvider; apiKey: string; model: string; baseUrl: string }
export type ToolCall = { id: string; name: string; args: Record<string, unknown> }
export type AiMsg = { role: 'user' | 'assistant' | 'tool'; content: string; toolCalls?: ToolCall[]; toolCallId?: string; name?: string }
export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> }
export type ChatResult = { text: string; toolCalls: ToolCall[] }

// 每个供应商嘅合理默认（用户可改）。
export const PROVIDER_DEFAULTS: Record<AiProvider, { baseUrl: string; model: string; label: string; needsKey: boolean }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'OpenAI', needsKey: true },
  grok: { baseUrl: 'https://api.x.ai/v1', model: 'grok-4.3', label: 'xAI Grok', needsKey: true },   // grok-2-latest 已下架（"Model not found"）→ 改默认为 grok-4.3（实测 tool-calling OK）；更省可改 grok-4.20-0309-non-reasoning
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash', label: 'Google Gemini', needsKey: true },
  local: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', label: '本地 LLM (Ollama/LM Studio)', needsKey: false },
}

function safeJson(s: unknown): Record<string, unknown> {
  if (s && typeof s === 'object') return s as Record<string, unknown>
  try { return JSON.parse(String(s || '{}')) } catch { return {} }
}

// —— OpenAI-compatible（OpenAI / Grok / 本地）——
async function openaiChat(cfg: AiConfig, msgs: AiMsg[], tools: ToolDef[], system: string): Promise<ChatResult> {
  const oaMsgs: Record<string, unknown>[] = [{ role: 'system', content: system }]
  for (const m of msgs) {
    if (m.role === 'tool') oaMsgs.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    else if (m.role === 'assistant' && m.toolCalls?.length) oaMsgs.push({ role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } })) })
    else oaMsgs.push({ role: m.role, content: m.content })
  }
  const body: Record<string, unknown> = { model: cfg.model, messages: oaMsgs, temperature: 0.2 }
  if (tools.length) { body.tools = tools.map((t) => ({ type: 'function', function: t })); body.tool_choice = 'auto' }
  const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + (await res.text().catch(() => '')).slice(0, 240))
  const data = await res.json()
  const m = data?.choices?.[0]?.message ?? {}
  const toolCalls: ToolCall[] = (m.tool_calls ?? []).map((tc: { id: string; function: { name: string; arguments: string } }) => ({ id: tc.id, name: tc.function.name, args: safeJson(tc.function.arguments) }))
  return { text: m.content ?? '', toolCalls }
}

// —— Google Gemini ——
async function geminiChat(cfg: AiConfig, msgs: AiMsg[], tools: ToolDef[], system: string): Promise<ChatResult> {
  const contents: Record<string, unknown>[] = []
  for (const m of msgs) {
    if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] })
    else if (m.role === 'tool') contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }] })
    else if (m.role === 'assistant' && m.toolCalls?.length) contents.push({ role: 'model', parts: m.toolCalls.map((t) => ({ functionCall: { name: t.name, args: t.args } })) })
    else contents.push({ role: 'model', parts: [{ text: m.content }] })
  }
  const body: Record<string, unknown> = { contents, systemInstruction: { parts: [{ text: system }] }, generationConfig: { temperature: 0.2 } }
  if (tools.length) body.tools = [{ functionDeclarations: tools }]
  const url = cfg.baseUrl.replace(/\/$/, '') + '/v1beta/models/' + cfg.model + ':generateContent?key=' + encodeURIComponent(cfg.apiKey)
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + (await res.text().catch(() => '')).slice(0, 240))
  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  let text = ''
  const toolCalls: ToolCall[] = []
  for (const p of parts) {
    if (p.text) text += p.text
    if (p.functionCall) toolCalls.push({ id: 'g_' + toolCalls.length, name: p.functionCall.name, args: (p.functionCall.args as Record<string, unknown>) || {} })
  }
  return { text, toolCalls }
}

export function chatCompletion(cfg: AiConfig, msgs: AiMsg[], tools: ToolDef[], system: string): Promise<ChatResult> {
  return cfg.provider === 'gemini' ? geminiChat(cfg, msgs, tools, system) : openaiChat(cfg, msgs, tools, system)
}
