// Codex legacy usage (E06; S18–S20). EXPERIMENTAL and off by default. GET https://chatgpt.com/backend-api/wham/usage
// is the internal ChatGPT usage endpoint that OpenCode Quota v6.3.0 reads: not a public API, and no authorization for
// this use is claimed. The server enables it only with the plugin option `experimentalCodexUsage: true` and reads only
// on an explicit Refresh of one saved connection, active or not: `r` on the selected account, or `a` (Refresh all),
// which asks once per eligible connection. Reading never switches the active account. The login itself must
// say it is Codex legacy through its native methodID and name its ChatGPT account; its token stays in memory for this
// one request. No redirects, bounded time and body, one fixed destination, explicit failures without the body or token.
import { failure, get } from "./deepseek.js"
import { isNumber, isTime } from "./rules.js"

const ENDPOINT = "https://chatgpt.com/backend-api/wham/usage"
// Native OpenCode method IDs of the two Codex legacy logins (`/connect` → OpenAI → Codex browser / device code).
// Sign in with ChatGPT (`chatgpt-token-sharing`), API keys and any other or missing method are never read.
const LEGACY = new Set(["chatgpt-browser", "chatgpt-headless"])
// Windows are named by their duration, never by their position in the response.
const WINDOWS = new Map([[18_000, "5h"], [604_800, "weekly"]])

// What the stored login says about itself: a Codex legacy method and the ChatGPT account it belongs to. Nothing is
// inferred from the label, the generic "oauth" method or the token's content.
function legacy(login) {
  const account = login?.metadata?.accountID
  if (login?.type !== "oauth" || !LEGACY.has(login.methodID)) return undefined
  if (typeof account !== "string" || account === "" || account.length > 200) return undefined
  if (typeof login.access !== "string" || login.access === "") return undefined
  return { methodID: login.methodID, account, access: login.access, expires: login.expires }
}

// `rate_limit.primary_window` / `secondary_window`: `used_percent` 0–100 and `limit_window_seconds`, with the reset
// from `reset_at` (epoch seconds) or else `reset_after_seconds`. Unknown durations are ignored; a duration seen twice
// with different values, or a reset field that is not a valid time, is ambiguous and dropped. No window, no sample.
export function parseUsage(text, observedAt) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return undefined
  }
  const found = new Map()
  const ambiguous = new Set()
  for (const w of [data?.rate_limit?.primary_window, data?.rate_limit?.secondary_window]) {
    const window = WINDOWS.get(w?.limit_window_seconds)
    if (!window) continue
    const used = w.used_percent
    const resetsAt = w.reset_at != null ? (isNumber(w.reset_at) ? w.reset_at * 1000 : NaN)
      : w.reset_after_seconds != null ? (isNumber(w.reset_after_seconds) && w.reset_after_seconds >= 0 ? observedAt + w.reset_after_seconds * 1000 : NaN)
      : undefined
    if (!isNumber(used) || used < 0 || used > 100 || (resetsAt !== undefined && !isTime(resetsAt))) {
      ambiguous.add(window)
      continue
    }
    const sample = { window, scope: "general", observedAt, used, ...(resetsAt !== undefined ? { resetsAt } : {}) }
    const prior = found.get(window)
    if (prior && (prior.used !== used || prior.resetsAt !== sample.resetsAt)) ambiguous.add(window)
    found.set(window, sample)
  }
  const samples = [...found.values()].filter((s) => !ambiguous.has(s.window))
  return samples.length > 0 ? samples : undefined
}

// `send` is the transport: fetch in the product, a double in tests and in the HOST lab. Never a URL.
export function createCodexReader({ send = (...args) => globalThis.fetch(...args), now = Date.now, timeout = 5_000 } = {}) {
  return {
    source: "codex-usage",
    // Only an explicit Refresh: never when the panel opens, at a turn end or on load.
    manual: true,
    // Bound to one login: the server checks that the reference is still listed the same way when its turn in the
    // queue comes (before resolving) and after the answer; this reader checks the login behind it (method, account).
    bound: true,
    async read({ connection, resolve, signal }) {
      if (connection?.method !== "oauth") throw failure("login") // an API key is not even resolved
      const login = legacy(await resolve())
      if (!login) throw failure("login")
      if (isNumber(login.expires) && login.expires <= now()) throw failure("auth")
      const text = await get(send, ENDPOINT, { Authorization: `Bearer ${login.access}`, "ChatGPT-Account-Id": login.account, Accept: "application/json" },
        { signal, timeout, now })
      // The observation time is taken once the body has been read.
      const samples = parseUsage(text, now())
      if (!samples) throw failure("invalid")
      // A re-login or another account under the same reference while the request was out makes the answer ambiguous;
      // so does a reference that no longer resolves (removed) or cannot be checked.
      if (signal.aborted) throw failure("network")
      const after = legacy(await resolve().catch(() => undefined))
      if (after?.methodID !== login.methodID || after.account !== login.account) throw failure("changed")
      return samples
    },
  }
}
