// DeepSeek balance (B06; S09). The only destination is the official endpoint; the key resolved by OpenCode for
// this one connection stays in memory for this request. No redirects, bounded time and body, explicit failures
// that never carry the response body or the key. The server schedules reads (sharing, limit, backoff).
import { isCurrency, isDecimal } from "./rules.js"

const ENDPOINT = "https://api.deepseek.com/user/balance"
const MAX_BODY = 64 * 1024

export const failure = (reason, retryAfter) => ({ reason, ...(Number.isFinite(retryAfter) ? { retryAfter } : {}) })

// Shared with codex.js: Retry-After in ms and a size-bounded, strict UTF-8 body.
export function retryAfter(header, now) {
  const value = header?.trim()
  if (!value) return undefined
  if (/^\d{1,6}$/.test(value)) return Number(value) * 1000
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined
}

export async function boundedText(response) {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => {})
      throw failure("too-large")
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(all)
}

// `is_available` and every currency/total as documented; amounts stay decimal strings. Missing currency or
// amount is "invalid", never zero.
export function parseBalance(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  const infos = data?.balance_infos
  if (typeof data?.is_available !== "boolean" || !Array.isArray(infos) || infos.length === 0 || infos.length > 8) return undefined
  const balances = infos.map((info) => ({ currency: info?.currency, total: info?.total_balance }))
  if (!balances.every((b) => isCurrency(b.currency) && isDecimal(b.total))) return undefined
  if (new Set(balances.map((b) => b.currency)).size !== balances.length) return undefined
  return { available: data.is_available, balances }
}

// Shared with codex.js: one GET to the single `url` its reader passes, no redirects, bounded time and body. Resolves to
// the text of a 200; anything else throws an explicit failure that never carries the body or the credential.
// `statuses` maps the reader's own codes to reasons, checked after a redirect and 401 and before 429.
export async function get(send, url, headers, { signal, timeout, now, statuses = {} }) {
  const timer = AbortSignal.timeout(timeout)
  const reason = () => (timer.aborted ? "timeout" : "network")
  let response
  try {
    response = await send(url, { method: "GET", redirect: "manual", signal: AbortSignal.any([signal, timer]), headers })
  } catch {
    throw failure(reason())
  }
  try {
    const status = response.status
    if ((status >= 300 && status < 400) || response.type === "opaqueredirect") throw failure("redirect")
    if (status === 401) throw failure("auth")
    if (Object.hasOwn(statuses, status)) throw failure(statuses[status])
    if (status === 429) throw failure("rate-limit", retryAfter(response.headers?.get("retry-after"), now()))
    if (status !== 200) throw failure("http")
    return await boundedText(response)
  } catch (error) {
    throw typeof error?.reason === "string" ? error : failure(error instanceof TypeError ? "invalid" : reason())
  } finally {
    if (!response.bodyUsed && !response.body?.locked) response.body?.cancel().catch(() => {})
  }
}

// `send` is the transport: fetch in the product, a double in tests and in the HOST lab. Never a URL.
export function createDeepseekReader({ send = (...args) => globalThis.fetch(...args), now = Date.now, timeout = 5_000 } = {}) {
  return {
    source: "deepseek-balance",
    async read({ resolve, signal }) {
      const credential = await resolve()
      if (credential?.type !== "key" || typeof credential.key !== "string" || credential.key === "") throw failure("auth")
      const text = await get(send, ENDPOINT, { Authorization: `Bearer ${credential.key}`, Accept: "application/json" },
        { signal, timeout, now, statuses: { 402: "balance" } })
      const parsed = parseBalance(text)
      if (!parsed) throw failure("invalid")
      return { window: "balance", scope: "general", observedAt: now(), ...parsed }
    },
  }
}
