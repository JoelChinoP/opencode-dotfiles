// Plain-text presentation of a validated snapshot (B04, B05). Every state is a word, never only a color; the
// tone only picks a theme token. Native labels cannot inject terminal controls. The modal is laid out here as
// lines of a known width (two panels when it is wide, one column otherwise), so node tests read the text the TUI
// draws.
import { refKey } from "./inventory.js"
import { targetKey, validTarget } from "./preferences.js"
import { catalogModel, dataOf, decideRoute, nextChange, routeModelID } from "./routing.js"
import { freshness, isDecimal, percent, recommend, sampleState, selectionKey, windowLabel } from "./rules.js"

const control = /[\u0000-\u001f\u007f-\u009f]/g
export const clean = (text) => String(text).replace(control, " ")

const NAMES = { openai: "OpenAI", deepseek: "DeepSeek", anthropic: "Anthropic API", "claude-agent": "Claude Code" }
// Logins come before API keys (user decision); in each section OpenAI, then Claude Code and Anthropic, then the rest
// as listed. The sections are not called subscriptions: an OAuth login proves no billed plan (S16).
const FIRST = ["openai", "claude-agent", "anthropic"]
// Plain Unicode marks in a theme color: decoration only, the provider is always named in words.
const ICONS = { openai: "◎", "claude-agent": "✻", anthropic: "✻", deepseek: "◆" }
const TYPES = { key: "API key", oauth: "OAuth login", external: "External (unverified)" }
// When no saved connection is the one in use: the short tag of the provider row and the detail's `In use`.
const USE = { environment: ["env", "Environment variable"], none: ["none", "None"], unknown: ["unknown", "Unknown"] }
// Currencies of the DeepSeek low-balance notice (S09). One minimum per currency for every DeepSeek account of
// this server; an absent currency is off.
const CURRENCIES = ["USD", "CNY"]
const NOTICE = "Informational only, not a spending limit: when a turn ends, a notice appears if the active" +
  " DeepSeek account has a fresh balance at or below this amount in the same currency. Usage is never blocked" +
  " and accounts are never switched."
// The experimental Codex legacy reader (E06) is not a public API: its figures and its offer carry an Experimental
// chip and this source. While it is off (the default) nothing experimental is offered or shown.
const CODEX = "ChatGPT, not a public API"
// Claude's usage (E02) belongs to the one Claude Code profile OpenCode uses, never to the connection's alias:
// OpenCode does not verify the account behind it and the CLI can switch accounts on its own. With that usage on and a
// single login, the row is named by the profile. A manual refresh reads Claude Code `/usage` once (same option).
const PROFILE = "Claude"
const REASONS = {
  auth: "authentication failed (401)", balance: "insufficient balance (402)", "rate-limit": "rate limited (429)",
  timeout: "timed out", network: "network error", redirect: "redirect refused", "too-large": "response too large",
  invalid: "unrecognized response", http: "server error", login: "not a verified Codex legacy login",
  changed: "the account changed during the read; data discarded", unknown: "unknown error",
  profile: "not the single Claude Code profile", missing: "Claude Code not found", exit: "Claude Code exited with an error",
  busy: "a /usage read is already running", model: "/usage was not answered locally; data discarded",
}
// Label column of the detail's table and the split threshold of the modal (text columns).
const LABEL = 14
const SPLIT = 84
// Lines the host and the modal keep around the body: the host's top padding, the title, two rules, the bottom
// padding and two spare lines so the centered dialog never touches the terminal edges.
const CHROME = 7
const label = (connection) => clean(connection.label).trim() || "(no alias)"
// English words (the UI language) with the 12 or 24 hour clock of the user's locale.
const hour12 = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 ?? false
const clock = { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12 }
const time = (ms) => new Date(ms).toLocaleTimeString("en-US", clock)
const weekdayTime = (ms) => new Date(ms).toLocaleString("en-US", { weekday: "short", ...clock })
// A reset across midnight names its weekday even when it is less than 24 hours away.
const when = (ms, now) => new Date(ms).toDateString() === new Date(now).toDateString() ? `at ${time(ms)}` : weekdayTime(ms)
const age = (ms, now) => {
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000))
  return minutes < 1 ? "just now" : minutes < 120 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`
}
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)
// Cut to `room` columns with an ellipsis; text that fits is left alone.
const clip = (text, room) => (text.length <= room ? text : room <= 1 ? "…" : `${text.slice(0, room - 1).trimEnd()}…`)
const join = (parts) => parts.map((part) => part.text).join("")
const size = (parts) => parts.reduce((n, part) => n + part.text.length, 0)

// Every sample the server holds for a connection is on screen with its state. Past its freshness or its reset it says
// Stale and keeps its last percentage and age (`Updated`); it never turns current or 0%. Claude's figures are the last
// ones attributable to its single profile: what makes them unattributable (another login, a credential event, a
// sign-in to redo) drops them in the server, never the clock alone. Samples and failures get their owner IDs with
// routing.dataOf.
// The freshness of the snapshot's own server instance, its location: `usageFreshnessSeconds` of the DTO, the default
// when a server sends none. Everything the TUI shows or advises from a snapshot is evaluated with it.
export const freshnessOf = (snapshot) => freshness(snapshot?.usageFreshnessSeconds)
const profiled = (integration) => integration.passive === true && integration.connections?.length === 1
const title = (integration, connection) => (profiled(integration) ? PROFILE : label(connection))
// What `r` says on an account without a reader.
export const NO_REFRESH = "Refresh is not available for this account."
const isCodexLogin = (integration, connection) => integration.id === "openai" && connection.method === "oauth"
// These are candidates from the visible inventory; each reader verifies the native login before accessing it.
const manualUsageLogin = (integration, connection) => integration.refreshable && integration.manual && !connection.reconnectRequired &&
  (isCodexLogin(integration, connection) ||
    (integration.id === "claude-agent" && integration.connections.length === 1 && connection.method === "external"))

// Measures of one connection: [{ kind, text, state, tone, label?, window?, used?, renews?, amounts?, lines? }].
// `text` is a one-line form ("5 h: 64% used · Fresh"); the modal draws quota windows as meters from the same fields.
// Model-scoped windows show only for the exact current selection. Absence is a word, never an empty meter. `ttl` is the
// freshness table of the snapshot (freshnessOf); the default one when left out.
export function measures(integration, connection, now, { threshold = 95, selection, ttl } = {}) {
  const { samples, failure } = dataOf(integration, connection)
  const scope = selection && selectionKey(selection)
  // Only a failure of the sample's own source makes it undecidable, as in rules.js and routing.js: a failed Claude
  // /usage read leaves the turn's figure standing, and the detail's Error row tells of the failure.
  const same = (s) => failure && failure.source === s.source
  const failed = (s) => (same(s) ? failure : undefined)
  const out = []
  for (const s of samples.filter((x) => x.scope === "general" || x.scope === scope)) {
    const state = sampleState(s, failed(s), now, ttl)
    const tone = state === "Refresh failed" ? "error" : state === "Stale" ? "muted"
      : (s.used !== undefined && s.used >= threshold) || s.available === false ? "warning" : "base"
    if (s.balances) {
      const lines = s.balances.map((b) => `${clean(b.currency)} ${isDecimal(b.total) ? b.total : "?"}`)
      const amounts = lines.join(" · ")
      let text = "Balance: " + amounts
      if (!s.available) text += " · not available for API calls"
      out.push({ kind: "balance", text: `${text} · ${state}`, amounts, lines, available: s.available, state, tone })
      continue
    }
    const name = windowLabel(clean(s.window), clean(s.scope))
    out.push({
      kind: "quota", label: name, window: s.window, used: s.used, state, tone,
      text: `${name}: ${percent(s.used)} used · ${state}`,
      // A renewal is shown only while the window's data is fresh and the reset still ahead (confirmed).
      ...(s.resetsAt > now && state === "Fresh" ? { renews: s.resetsAt } : {}),
    })
  }
  if (failure && !samples.some(same)) {
    out.push({ kind: "none", text: "No data · Refresh failed", state: "Refresh failed", tone: "error" })
  }
  if (out.length === 0) out.push({ kind: "none", text: "No data", state: "No data", tone: "muted" })
  return out
}

// "USD 0.20 · CNY off": the minimum as stored, never converted or summed; "0" is a minimum, absent is off.
const amount = (minimums, currency) => (isDecimal(minimums?.[currency]) ? minimums[currency] : "off")
export const minimumText = (minimums) => CURRENCIES.map((c) => `${c} ${amount(minimums, c)}`).join(" · ")

// Inner text width of the modal: the host draws an "xlarge" dialog min(116, columns − 2) wide and the modal pads two
// columns on each side, as native dialogs do (DIALOG_INSET).
export const modalWidth = (columns) => Math.max(20, Math.min(116, columns - 2) - 4)

// Word wrap to `width` columns; continuation lines start with `indent`. A word longer than a line is cut, not lost.
// A percentage keeps its unit on the same line ("95% used"), so it never reads as a bare number.
export function wrap(text, width, indent = "") {
  const lead = text.match(/^ */)[0]
  const out = []
  let line = lead
  let empty = true
  const words = []
  for (const word of text.slice(lead.length).split(/ +/).filter(Boolean)) {
    if (word.startsWith("used") && words.at(-1)?.endsWith("%")) words[words.length - 1] += ` ${word}`
    else words.push(word)
  }
  for (let word of words) {
    while (word) {
      const join = empty ? word : ` ${word}`
      if (line.length + join.length <= width) {
        line += join
        empty = false
        word = ""
      } else if (!empty) {
        out.push(line)
        line = indent
        empty = true
      } else {
        const room = Math.max(1, width - line.length)
        out.push(line + word.slice(0, room))
        word = word.slice(room)
        line = indent
      }
    }
  }
  if (!empty || out.length === 0) out.push(line)
  return out
}

// The list compares like with like: 5 h usage, never a weekly substitute; balances stay in their own currencies.
function figure(connection, list) {
  if (connection.reconnectRequired) return { text: "Sign in again", tone: "warning" }
  const balance = list.find((m) => m.kind === "balance")
  if (balance) {
    if (balance.state === "Fresh") return { text: balance.amounts, tone: balance.tone, balance: true }
    return balance.state === "Refresh failed" ? { text: "Failed", tone: "error" } : { text: "Stale", tone: "muted" }
  }
  const five = list.filter((m) => m.window === "5h")
  const top = five.filter((m) => m.state === "Fresh" && m.used !== undefined).sort((a, b) => b.used - a.used)[0]
  if (top) return { text: `${top.label}  ${percent(top.used)} used`, tone: top.tone }
  if (list.some((m) => m.state === "Refresh failed")) return { text: "Failed", tone: "error" }
  if (five.some((m) => m.state === "Stale")) return { text: "Stale", tone: "muted" }
  return { text: "—", tone: "muted" }
}

// The groups of the list in screen order: Logins (OAuth and external) before API keys; a provider with both kinds is
// in both, each group with its own accounts in the saved (legacy) priority order. A provider without a saved account
// is alone in API keys.
function sections(snapshot) {
  const integrations = snapshot?.inventory === "available" ? snapshot.integrations ?? [] : []
  const rank = (id) => (FIRST.includes(id) ? FIRST.indexOf(id) : FIRST.length)
  const ordered = integrations.map((integration, index) => ({ integration, index }))
    .sort((a, b) => rank(a.integration.id) - rank(b.integration.id) || a.index - b.index).map(({ integration }) => integration)
  const of = (keys) => ordered.map((integration) => ({ integration, connections: integration.connections.filter((c) => (c.method === "key") === keys) }))
  return [
    { name: "Logins", groups: of(false).filter((g) => g.connections.length > 0) },
    { name: "API keys", groups: of(true).filter((g) => g.connections.length > 0 || g.integration.connections.length === 0) },
  ].filter((section) => section.groups.length > 0)
}

// Account rows in screen order: what ↑↓, the wheel and the initial cursor move through.
export const accountRefs = (snapshot) =>
  sections(snapshot).flatMap((s) => s.groups.flatMap((g) => g.connections.map((c) => refKey(g.integration.id, c.id))))

// The account in use for the selected model, where the modal's cursor starts.
export function sessionRef(snapshot, selection) {
  const id = activeAccount(snapshot, selection)
  return id === undefined ? undefined : refKey(selection.providerID, id)
}

// A fixed categorical step of the theme per provider for its icon; OpenAI in the main text color.
function iconTone(snapshot, id) {
  if (id === "openai") return "base"
  if (id === "claude-agent" || id === "anthropic") return "icon:0"
  if (id === "deepseek") return "icon:1"
  const rest = (snapshot?.integrations ?? []).map((i) => i.id).filter((other) => !(other in ICONS))
  return `icon:${2 + Math.max(0, rest.indexOf(id))}`
}

// A provider row: icon, name in bold and, at the right, a chip with its accounts in this group, or which kind of
// connection is in use when it is not a saved one (env, none, unknown). Clicking it selects its first account.
function groupRow(snapshot, integration, connections, { width }) {
  const icon = { text: ICONS[integration.id] ?? "◇", tone: iconTone(snapshot, integration.id) }
  const name = NAMES[integration.id] ?? clean(integration.id)
  const use = integration.active === "connection" ? undefined : USE[integration.active] ?? USE.unknown
  const tag = use?.[0] ?? ""
  const parts = [icon, { text: ` ${clip(name, width - 3 - tag.length).padEnd(width - 2 - tag.length)}`, tone: "base" }, { text: tag, tone: "muted" }]
  return { text: join(parts), parts, bold: true, ...(connections.length > 0 ? { click: { kind: "group", ref: refKey(integration.id, connections[0].id) } } : {}) }
}

// The focus margin is independent of the active dot.
function accountLines({ name, active, selected, fig, column, width, cut }) {
  const lead = [
    selected ? { text: "┃", tone: "focus", keep: true } : { text: " ", tone: "base" },
    active ? { text: "●", tone: "success", keep: true } : { text: "○", tone: "faint", keep: true },
    { text: " ", tone: "base" },
  ]
  const indent = size(lead)
  // A balance wider than the column is cut in a split panel; one column gives it a line instead.
  const wide = fig.balance && fig.text.length > column
  const right = [{ text: " " + (wide ? clip(fig.text, column) : fig.text).padStart(column), tone: fig.tone }]
  const room = width - indent - size(right)
  if ((name.length <= room && (cut || !wide)) || (cut && room >= 4)) return [[...lead, { text: clip(name, room).padEnd(room), tone: "base" }, ...right]]
  const short = [{ text: fig.text, tone: fig.tone }]
  if (indent + name.length + 2 + size(short) <= width) return [[...lead, { text: name.padEnd(width - indent - size(short)), tone: "base" }, ...short]]
  const pad = { text: " ".repeat(indent), tone: "base" }
  const names = wrap(name, width - indent).map((line, i) => [...(i === 0 ? lead : [pad]), { text: line.padEnd(width - indent), tone: "base" }])
  const tails = size(short) <= width ? [[{ text: " ".repeat(width - size(short)), tone: "base" }, ...short]]
    : wrap(fig.text, width).map((line) => [{ text: line.padStart(width), tone: fig.tone }])
  return [...names, ...tails]
}

// States of the inventory and preferences, above the list.
function messages(snapshot, width) {
  const rows = []
  const add = (text, tone) => {
    for (const line of wrap(text, width, "  ")) rows.push({ text: line, tone })
  }
  const prefs = snapshot?.preferences
  if (snapshot?.inventory !== "available") add("Inventory unavailable.", "error")
  else {
    if (prefs?.state !== "available") add(prefs?.state === "unsupported" ? "Preferences use an unknown format; not changed." : "Preferences unavailable.", "warning")
    if (snapshot.integrations.length === 0) add("No saved connections.", "muted")
  }
  return rows
}

// The list: Logins, then API keys, each with its providers and their accounts. `cursor` is a refKey; the focused
// account's lines carry `selected` and `anchor`, and every line of an account or provider row says what a click picks.
function listRows(snapshot, { now = Date.now(), cursor, minimum, selection, width, cut = false }) {
  const threshold = snapshot?.preferences?.threshold ?? 95
  const ttl = freshnessOf(snapshot)
  const all = sections(snapshot)
  const figures = new Map()
  for (const { integration, connections } of all.flatMap((section) => section.groups)) {
    for (const c of connections) figures.set(refKey(integration.id, c.id), figure(c, measures(integration, c, now, { threshold, selection, ttl })))
  }
  // Leave a gutter after the figures, inside the focus band and click target.
  const gutter = { text: " ", tone: "base" }
  const accountWidth = width - gutter.text.length
  const widest = Math.max(0, ...[...figures.values()].map((f) => f.text.length))
  const column = Math.min(Math.max(13, widest), Math.max(13, accountWidth - 4 - 10))
  const rows = []
  for (const [index, section] of all.entries()) {
    if (section.name) {
      if (index > 0) rows.push({ text: "" })
      rows.push({ text: section.name.padEnd(width), tone: "muted", bold: true })
    }
    for (const { integration, connections } of section.groups) {
      rows.push(groupRow(snapshot, integration, connections, { width }))
      for (const connection of connections) {
        const key = refKey(integration.id, connection.id)
        const selected = key === cursor && !minimum
        const lines = accountLines({
          name: title(integration, connection), active: connection.active, selected,
          fig: figures.get(key), column, width: accountWidth, cut,
        })
        lines.forEach((line, n) => {
          const parts = [...line, gutter]
          rows.push({ text: join(parts), parts, click: { kind: "account", ref: key },
            ...(selected ? { selected: true, anchor: true } : {}), ...(n === 0 ? { ref: key } : {}) })
        })
      }
    }
  }
  return rows
}

// A row of the detail's table: the label dimmed in its column, the value in the main color or its state's tone; a
// long value wraps under its column.
function field(name, value, width, tone = "base", extra = {}) {
  const room = Math.max(1, width - LABEL)
  const own = name.length < LABEL
  const lines = wrap(value, room).map((line, i) => {
    const lead = (i === 0 && own ? name : "").padEnd(LABEL)
    return { text: lead + line, parts: [{ text: lead, tone: "muted" }, { text: line, tone }], ...extra }
  })
  return own ? lines : [{ text: clip(name, width), parts: [{ text: clip(name, width), tone: "muted" }], ...extra }, ...lines]
}

// A name at the left and its value at the right of one line, or the value right-aligned below when narrow.
function spread(name, value, width, tone) {
  if (name.length + 2 + value.length <= width) {
    const head = name.padEnd(width - value.length)
    return [{ text: head + value, parts: [{ text: head, tone: "base" }, { text: value, tone }] }]
  }
  return [{ text: name, tone: "base" }, ...wrap(value, width).map((line) => ({ text: line.padStart(width), parts: [{ text: line.padStart(width), tone }] }))]
}

// Both patterns occupy the full height of one cell, so fill and track meet even without color.
function meter(m, width, threshold) {
  const late = m.state === "Fresh" ? "" : ` · ${m.state}`
  const tone = m.state === "Refresh failed" ? "error" : late ? "muted" : m.used >= threshold ? "warning" : "base"
  const value = `${percent(m.used)} used${late}`
  const name = m.label.padEnd(6) + " "
  const track = width - name.length - value.length - 1
  if (track < 1) return spread(m.label, value, width, tone)
  const fill = Math.floor((m.used / 100) * track)
  const bar = m.used >= threshold ? "warning" : late ? "muted" : m.window === "5h" ? "success" : "accent"
  const parts = [{ text: name, tone: "base" }, { text: "█".repeat(fill), tone: bar },
    { text: "░".repeat(track - fill), tone: "faint" }, { text: ` ${value}`, tone }]
  return [{ text: join(parts), parts }]
}

// The detail's first line: icon and title in bold (the alias, or Claude for the profile), its chips at the right or
// below it when they do not fit.
function heading(snapshot, integration, connection, { width, codex }) {
  const icon = { text: ICONS[integration.id] ?? "◇", tone: iconTone(snapshot, integration.id) }
  const name = title(integration, connection)
  const chips = [
    ...(connection.reconnectRequired ? [{ text: " Sign in again ", tone: "warning", chip: true }] : []),
    ...(codex ? [{ text: " Experimental ", tone: "info", chip: true }] : []),
  ]
  const spaced = (list) => list.flatMap((chip, i) => (i > 0 ? [{ text: " ", tone: "base" }, chip] : [chip]))
  const row = (parts) => ({ text: join(parts), parts, bold: true, keep: true })
  const beside = size(spaced(chips))
  if (2 + name.length + (chips.length > 0 ? 1 + beside : 0) <= width) {
    return [row([icon, { text: ` ${name.padEnd(width - 2 - beside)}`, tone: "base" }, ...spaced(chips)])]
  }
  const rows = wrap(name, width - 2).map((line, i) => row([i === 0 ? icon : { text: " ", tone: "base" }, { text: ` ${line}`, tone: "base" }]))
  let line = []
  for (const chip of chips) {
    if (line.length > 0 && 2 + size(spaced([...line, chip])) > width) {
      rows.push(row([{ text: "  ", tone: "base" }, ...spaced(line)]))
      line = []
    }
    line.push(chip)
  }
  if (line.length > 0) rows.push(row([{ text: "  ", tone: "base" }, ...spaced(line)]))
  return rows
}

// Each window owns its renewal. Account-wide facts follow the usage block.
function accountDetail(snapshot, integration, connection, { now, width, selection }) {
  const prefs = snapshot.preferences
  const threshold = prefs?.threshold ?? 95
  const list = measures(integration, connection, now, { threshold, selection, ttl: freshnessOf(snapshot) })
  const { samples, failure } = dataOf(integration, connection)
  const reader = integration.refreshable === true && integration.manual === true
  // Active or not, a Codex read is bound to this login and never switches the active account.
  const codex = samples.some((s) => s.source === "codex-usage") || (isCodexLogin(integration, connection) && reader)
  const rows = [...heading(snapshot, integration, connection, { width, codex }), { text: "" }]
  const quotas = list.filter((m) => m.kind === "quota")
  const balance = list.find((m) => m.kind === "balance")
  if (quotas.length > 0) {
    for (const [i, m] of quotas.entries()) {
      if (i) rows.push({ text: "", spare: true })
      rows.push(...meter(m, width, threshold).map((row) => ({ ...row, measure: true })))
      if (m.renews !== undefined) {
        const caption = `Resets ${when(m.renews, now)}`
        rows.push({ text: caption.padStart(Math.min(width, Math.max(6, m.label.length) + 1 + caption.length)), tone: "muted" })
      }
    }
  } else if (balance) {
    const late = balance.state === "Fresh" ? "" : ` · ${balance.state}`
    const tone = balance.state === "Refresh failed" ? "error" : late ? "muted" : balance.tone
    balance.lines.forEach((line, i) => rows.push(...field(i === 0 ? "Balance" : "", i === 0 ? line + late : line, width, tone)))
  } else {
    const ask = !failure && manualUsageLogin(integration, connection)
    rows.push(...field("Usage", ask ? "Press r to read" : "—", width, ask ? "base" : "muted"))
  }
  rows.push({ text: "" })
  if (failure) rows.push(...field("Error", `${capital(REASONS[failure.reason] ?? REASONS.unknown)} at ${time(failure.at)}`, width, "error"))
  if (failure?.retryAt > now) rows.push(...field("Retry", `After ${time(failure.retryAt)}`, width))
  if (balance?.available === false) rows.push(...field("API calls", "Not available", width, "warning"))
  const latest = samples.length > 0 ? Math.max(...samples.map((s) => s.observedAt)) : undefined
  if (latest !== undefined) rows.push(...field("Updated", age(latest, now), width))
  // Kept when a low terminal cuts the table: experimental figures always say they are not a public API.
  if (codex) rows.push(...field("Source", CODEX, width, "base", { keep: true }))
  // One source: that of the most recent sample on screen.
  const newest = samples.reduce((a, b) => (b.observedAt > (a?.observedAt ?? -Infinity) ? b : a), undefined)
  if (integration.passive) rows.push(...field("Source", newest?.source === "claude-usage" ? "Claude Code /usage" : "Claude Code turns", width))
  if (integration.id === "deepseek") rows.push(...field("Notice at", prefs?.state === "available" ? minimumText(prefs.minimums) : "Unavailable", width))
  if (integration.active !== "connection") rows.push(...field("In use", (USE[integration.active] ?? USE.unknown)[1], width))
  rows.push(...field("Type", TYPES[connection.method] ?? clean(connection.method), width))
  return rows
}

// The DeepSeek low-balance notice editor, shown where the detail is while it is open: it is the focus then, so
// it is anchored and the list shows no account cursor. The current currency has the focus margin and band.
function minimumRows(draft, width) {
  return [
    { text: "Low-balance notice", tone: "base", bold: true },
    { text: "" },
    ...CURRENCIES.map((c) => {
      const selected = c === draft.currency
      const parts = [selected ? { text: "┃", tone: "focus", keep: true } : { text: " ", tone: "base" },
        { text: `${c.padEnd(7)}${amount(draft.minimums, c)}`.padEnd(width - 1), tone: "base" }]
      return { text: join(parts), parts, click: { kind: "currency", currency: c }, ...(selected ? { selected: true } : {}) }
    }),
    { text: "" },
    ...wrap(NOTICE, width).map((text) => ({ text, tone: "muted" })),
    ...wrap("esc discards changes.", width).map((text) => ({ text, tone: "muted" })),
  ].map((row) => ({ ...row, anchor: true }))
}

function picked(snapshot, cursor) {
  if (snapshot?.inventory !== "available" || typeof cursor !== "string") return undefined
  let ref
  try {
    ref = JSON.parse(cursor)
  } catch {
    return undefined
  }
  const integration = snapshot.integrations.find((i) => i.id === ref?.[0])
  const connection = integration?.connections.find((c) => c.id === ref?.[1])
  return connection && { integration, connection }
}

// ---- Route order and next-turn preview (rotation plan R3) -----------------------------------------------------------
// The list of destinations is edited locally until Save; the preview evaluates it against the snapshot held here, the
// session's selection and the clock. Opening, editing or previewing reads nothing, switches nothing and sends nothing.
const providerName = (id) => NAMES[id] ?? clean(id)
function routeAccount(snapshot, t, withProvider = true) {
  const provider = providerName(t.providerID)
  if (t.binding === "current") return `${provider} · Active account`
  const i = snapshot.integrations.find((i) => i.id === t.integrationID)
  const c = i?.connections.find((c) => c.id === t.connectionID)
  const name = c ? title(i, c) : "(removed)"
  return withProvider ? `${name} · ${provider}` : name
}
export function accountChoices(snapshot) {
  return snapshot.integrations.flatMap((i) => {
    const base = { integrationID: i.id, providerID: i.id }
    const category = providerName(i.id)
    return [...i.connections.map((c) => ({ title: title(i, c), category, value: { ...base, binding: "exact", connectionID: c.id } })),
      { title: "Active account", category, description: "Follows /connect", value: { ...base, binding: "current" } }]
  })
}
// Empty string is an explicit Keep choice (IDs cannot be empty); undefined from a native picker is cancellation.
export function modelChoices(catalog, providerID) {
  return [{ title: "Keep current model", description: `When already using ${providerName(providerID)}`, value: "" },
    ...(catalog ?? []).filter((m) => m.enabled && m.providerID === providerID).map((m) => ({ title: clean(m.name || m.id), value: m.id }))]
}
export function effortChoices(catalog, t, selection) {
  const model = catalogModel(catalog, t.providerID, routeModelID(t, selection))
  return [{ title: "Automatic", description: "Keep effort on the same model; otherwise use its default", value: "" },
    ...(model?.variants ?? []).map((v) => ({ title: clean(v.id), value: v.id }))]
}

// Work on one copy. Cancel at any step discards that entire row edit, including any preceding account/model choice.
export async function pickDestination({ snapshot, target, edit, selection, catalog, pick }) {
  let row = { ...target }
  if (edit === "add" || edit === "account") {
    const account = await pick({ title: "Choose account", options: accountChoices(snapshot) })
    if (!account) return
    if (edit === "account" && account.providerID === row.providerID) {
      return { ...account, ...(row.modelID ? { modelID: row.modelID } : {}), ...(row.variant ? { variant: row.variant } : {}) }
    }
    row = { ...account }
  }
  const models = await catalog()
  if (edit !== "effort") {
    const options = modelChoices(models, row.providerID)
    const modelID = await pick({ title: "Choose model", options, current: row.modelID ?? "",
      placeholder: options.length === 1 ? "No models listed here" : "Find a model" })
    if (modelID === undefined) return
    if (modelID !== (row.modelID ?? "")) delete row.variant
    if (modelID) row.modelID = modelID
    else delete row.modelID
  }
  const options = effortChoices(models, row, selection)
  if (edit === "effort" || row.variant || options.length > 1) {
    const variant = await pick({ title: "Choose effort", options, current: options.some((o) => o.value === row.variant) ? row.variant : "",
      placeholder: options.length > 1 ? "Find an effort" : !routeModelID(row, selection) ? "Choose a model to set an effort" : "No efforts listed here" })
    if (variant === undefined) return
    if (variant) row.variant = variant
    else delete row.variant
  }
  return row
}

const modelName = (snapshot, providerID, id) => clean(catalogModel(snapshot.catalog, providerID, id)?.name || id)

export function startRoute(snapshot) {
  const routing = snapshot?.routing
  if (routing?.state !== "available") return undefined
  return { revision: routing.revision, targets: routing.targets.map((t) => ({ ...t })), index: 0 }
}
const at = (draft, targets, index = draft.index) => ({ ...draft, targets, index: Math.max(0, Math.min(Math.max(0, targets.length - 1), index)) })
export function putRoute(draft, target, index = draft.targets.length) {
  if (!validTarget(target) || index >= 64 || draft.targets.some((t, i) => i !== index && targetKey(t) === targetKey(target))) return undefined
  const targets = [...draft.targets]
  targets[index] = target
  return at(draft, targets, index)
}
export function routeMove(draft, delta) {
  const to = draft.index + delta
  if (to < 0 || to >= draft.targets.length) return draft
  const targets = [...draft.targets]
  targets.splice(to, 0, ...targets.splice(draft.index, 1))
  return at(draft, targets, to)
}
export const routeStep = (draft, delta) => at(draft, draft.targets, draft.index + delta)
export const routeRemove = (draft) => (draft.targets.length ? at(draft, draft.targets.filter((_, i) => i !== draft.index)) : draft)
export const routeProposal = (draft) => ({ revision: draft.revision, targets: draft.targets })

// The engine on held data only: no policy reader, so whatever needs data says so instead of being read.
export function routePreview(snapshot, targets, selection, now) {
  if (snapshot?.inventory !== "available" || snapshot.preferences?.state !== "available") return undefined
  return decideRoute({ selection, targets, catalog: snapshot.catalog, integrations: snapshot.integrations, threshold: snapshot.preferences.threshold,
    minimums: snapshot.preferences.minimums, now, readable: new Set(), visited: new Set(), budget: { origin: 0, candidates: 0 },
    paid: snapshot.routing?.session?.paid === true, ttl: freshnessOf(snapshot) })
}

function nextTurn(snapshot, targets, d) {
  if (!d) return ["Unavailable", "muted"]
  if (d.kind === "keep") return [d.reason ? `Keep current model · ${d.reason}` : "Keep current model", d.reason ? "muted" : "base"]
  if (d.kind === "suggest") {
    const m = d.model
    return [`Suggested: ${d.target + 1}. ${routeAccount(snapshot, targets[d.target])} · ${modelName(snapshot, m.providerID, m.modelID)}${m.variant ? ` #${clean(m.variant)}` : ""}`, "warning"]
  }
  if (d.kind === "needRead") return [`Refresh required: ${d.read.purpose === "origin" ? "the account in use" : "a destination"}`, "muted"]
  return [`No destination · ${d.reason}`, "warning"]
}
const manualText = (d) => d?.kind === "suggest" ? `Manual: ${d.reason} · ${d.reason === "Account switch is global" ? "/connect" : "/models"}` : undefined

function routeListRows(snapshot, draft, width) {
  const rows = [{ text: "Route order".padEnd(width), tone: "base", bold: true }]
  if (draft.targets.length === 0) {
    for (const line of wrap("Add an account to start.", width)) rows.push({ text: line, tone: "muted" })
    return rows
  }
  draft.targets.forEach((t, i) => {
    const selected = i === draft.index
    const lead = selected ? { text: "┃", tone: "focus", keep: true } : { text: " ", tone: "base" }
    const fixed = t.modelID || t.variant
    const detail = fixed ? ` · ${t.modelID ? modelName(snapshot, t.providerID, t.modelID) : "Current model"}${t.variant ? ` #${clean(t.variant)}` : ""}` : ""
    const name = clip(`${i + 1}. ${routeAccount(snapshot, t, !fixed)}${detail}`, width - 1)
    const parts = [lead, { text: name.padEnd(width - 1), tone: "base" }]
    rows.push({ text: join(parts), parts, click: { kind: "route", index: i }, ...(selected ? { selected: true, anchor: true } : {}) })
  })
  return rows
}

function routePreviewRows(snapshot, draft, { now, selection, width }) {
  const d = routePreview(snapshot, draft.targets, selection, now)
  const [next, tone] = nextTurn(snapshot, draft.targets, d)
  const rows = [{ text: "Preview next turn", tone: "base", bold: true, keep: true }]
  const lines = (value, tone, keep = false) => wrap(value, width).map((text) => ({ text, tone, keep }))
  rows.push(...lines(!selection ? "Open a chat to preview its next turn." : next, tone, true))
  if (d?.trigger) rows.push(...lines(d.trigger, "muted"))
  const manual = manualText(d)
  if (manual) rows.push(...lines(manual, "muted"))
  const t = draft.targets[draft.index]
  if (t) {
    const status = d?.rows[draft.index]
    rows.push({ text: "" }, ...wrap(routeAccount(snapshot, t), width).map((text) => ({ text, bold: true })),
      ...field("Model", t.modelID ? modelName(snapshot, t.providerID, t.modelID) : "Keep current model", width),
      ...field("Effort", t.variant ? clean(t.variant) : "Automatic", width))
    if (status?.reason) rows.push(...lines(status.reason, "muted"))
  }
  return rows
}

// The right panel (below the list in one column): the route preview, the open notice editor or the selected account.
function detailRows(snapshot, { now = Date.now(), cursor, minimum, route, selection, width }) {
  if (route) return routePreviewRows(snapshot, route, { now, selection, width })
  if (minimum) return minimumRows(minimum, width)
  const found = picked(snapshot, cursor)
  return found ? accountDetail(snapshot, found.integration, found.connection, { now, width, selection }) : []
}

// The body in one column, each row at most `width`: the list, then (zone "detail") a dotted rule and the detail.
// Without accounts, the state and the single pointer to native account management.
export function modalRows(snapshot, options = {}) {
  const { width = 72 } = options
  const list = [...messages(snapshot, width), ...(options.route ? routeListRows(snapshot, options.route, width) : listRows(snapshot, { ...options, width }))]
  const detail = detailRows(snapshot, { ...options, width })
  const ready = snapshot?.inventory === "available" && snapshot.integrations.length > 0
  const tail = detail.length > 0 ? [{ text: "┄".repeat(width), tone: "faint", rule: true, keep: true }, ...detail]
    : ready ? [] : [{ text: "", spare: true }, { text: "Manage accounts: /connect", tone: "muted", spare: true }]
  return [...list, ...tail.map((row) => ({ tone: "muted", ...row, zone: "detail" }))]
}

// The first line to show so that the anchored lines stay visible: the top of the list when they fit there,
// otherwise as little movement as possible from the previous position; when they are taller than the room, their
// start wins (with one line of context above, unless that would leave no room for the anchored line itself).
export function scrollStart(rows, room, previous = 0) {
  if (rows.length <= room) return 0
  let start = Math.max(0, Math.min(previous, rows.length - room))
  const first = rows.findIndex((row) => row.anchor)
  if (first < 0) return start
  const last = rows.findLastIndex((row) => row.anchor)
  if (last < room) return 0
  const context = room > 1 ? 1 : 0
  if (last >= start + room) start = last - room + 1
  if (first - context < start) start = Math.max(0, first - context)
  return Math.min(start, rows.length - room)
}

// What fits in `height` lines: everything, or a scrolled window with a line above and below saying how many more
// (with fewer than 3 lines, just the window). A single hidden line is shown in its slot instead of "1 more".
// `previous` is the last start, so moving scrolls only as needed.
export function windowRows(rows, height, previous = 0) {
  if (rows.length <= height) return { start: 0, rows }
  if (height < 3) {
    const start = scrollStart(rows, height, previous)
    return { start, rows: rows.slice(start, start + height) }
  }
  const room = height - 2
  const start = scrollStart(rows, room, previous)
  const hidden = rows.length - start - room
  return {
    start,
    rows: [
      start === 1 ? rows[0] : { text: start > 0 ? `↑ ${start} more` : "", tone: "muted" },
      ...rows.slice(start, start + room),
      hidden === 1 ? rows.at(-1) : { text: hidden > 0 ? `↓ ${hidden} more` : "", tone: "muted" },
    ],
  }
}

// What fits of a detail in `room` lines: blank spacing gives way first, then lines from the end (spare ones first).
// Rows that must stay (the heading, the source of experimental figures) are kept in order while they fit. Never
// ends on a blank line.
function trim(rows, room) {
  if (room <= 0) return []
  let out = rows.length > room ? rows.filter((row) => !row.spare) : [...rows]
  for (let i = out.length - 1; i > 0 && out.length > room; i -= 1) if (out[i].text.trim() === "" && !out[i].keep) out.splice(i, 1)
  // Captions and metadata give way before the measurements they explain.
  for (const cutMeasures of [false, true]) {
    for (let i = out.length - 1; i >= 0 && out.length > room; i--) if (!out[i].keep && (cutMeasures || !out[i].measure)) out.splice(i, 1)
  }
  out = out.slice(0, room)
  while (out.length > 1 && out.at(-1).text.trim() === "") out.pop()
  return out
}

// The one-column body in `height` physical lines (every row is at most the width, so one row is one line). The list
// scrolls to keep the focused account visible; when both need the room they split it, with the odd line for detail.
// With one line, only the focused account. While the notice editor is
// open it is the focus, so the detail goes first.
export function fitBody(rows, height, previous = 0) {
  const h = Math.max(1, height)
  const split = rows.findIndex((row) => row.zone === "detail")
  const list = split < 0 ? rows : rows.slice(0, split)
  let detail = split < 0 ? [] : rows.slice(split)
  if (list.length + detail.length <= h) return { start: 0, rows }
  detail = detail.filter((row) => !row.spare)
  if (list.length + detail.length <= h) return { start: 0, rows: [...list, ...detail] }
  const focus = detail.some((row) => row.anchor)
  const listMin = Math.min(list.length, focus ? 0 : h < 4 ? h : h < 6 ? 1 : Math.floor(h / 2))
  let room = Math.min(detail.length, h - listMin)
  if (focus && room < detail.length) {
    // Editor taller than the room: from its first anchored line.
    const first = detail.findIndex((row) => row.anchor)
    detail = detail.slice(Math.max(0, first - 1))
    room = Math.min(detail.length, h)
  }
  // The editor takes every line: no list above it, and so no rule either.
  const whole = focus && room >= h
  if (whole && detail[0]?.rule) {
    detail = detail.slice(1)
    room = Math.min(detail.length, h)
  }
  // A rule with one line under it says little: below two lines the list keeps the room.
  const below = room < 2 && !focus ? [] : trim(detail, room)
  const fit = windowRows(list, h - below.length, previous)
  return { start: fit.start, rows: [...(whole || h - below.length <= 0 ? [] : fit.rows), ...below] }
}

// Keys of the current mode only, never Esc (named once, at the top right): { key, label, action }, shortened in a
// narrow modal. `action` names what a click on it runs, the same as the key. Every entry is an action: ↑↓, the wheel
// and clicks still move the focus in every mode (row, currency or destination), but the footer does not spell them
// out. Edits and the turn-end notice never share one line with another mode's keys.
const entry = (key, label, action) => ({ key, label, action })
export function legend({ minimum, route, notice, deepseek, refreshAll } = {}, width = 110) {
  const narrow = width < 50
  if (route) {
    return [entry("a", narrow ? "Add" : "Add account", "routeAdd"), ...(route.targets?.length ? [entry("Enter", "Edit", "routeEdit")] : []),
      entry("o", "Options", "routeOptions"), entry("s", "Save", "save")]
  }
  if (minimum) return [entry("e", narrow ? "Amount" : "Edit amount", "amount"), entry("o", "Off", "off"), entry("s", "Save", "save")]
  return [
    entry("r", "Refresh", "refresh"), ...(refreshAll ? [entry("a", narrow ? "All" : "Refresh all", "refreshAll")] : []),
    entry("o", narrow ? "Route" : "Route order", "route"),
    ...(deepseek ? [entry("m", narrow ? "Notice" : "Balance notice", "notice")] : []),
    ...(notice ? [entry("x", "Dismiss", "dismiss")] : []),
  ]
}

// What each key of the modal runs per mode; one key may mean different things in different modes. `legend` shows
// only the current mode's keys.
export const KEYS = {
  r: { other: "refresh" }, a: { other: "refreshAll", route: "routeAdd" }, m: { other: "notice" },
  e: { minimum: "amount" }, o: { minimum: "off", other: "route", route: "routeOptions" },
  return: { route: "routeEdit" }, s: { minimum: "save", route: "save" }, x: { other: "dismiss" },
}
// The action of a key in the current mode: the route editor has only its own; the notice editor falls back to the
// keys of the list. An unknown key runs nothing.
export function keyAction(bind, { route, minimum } = {}) {
  if (!Object.hasOwn(KEYS, bind)) return undefined
  const key = KEYS[bind]
  return route ? key.route : minimum ? key.minimum ?? key.other : key.other
}
// A save refused because the stored data changed since it was read (the RPC error type or the server's message).
export const conflicted = (error) =>
  /conflict|changed\. Reload/.test(`${error?.type ?? ""} ${error?.name ?? ""} ${error?.message ?? ""} ${error?.data?.type ?? ""}`)

// A centered grid of clickable key/label pairs. Both starts align down each column (keys right-aligned). The grid is
// centered as a whole: a shorter last row sits under the first columns, at the same `left`, never centered alone.
export function modalFooter(items, width) {
  const gap = width < 50 ? 2 : 3
  for (let n = items.length; n > 0; n--) {
    if (n > Math.ceil(items.length / Math.ceil(items.length / n))) continue
    const cols = Array.from({ length: n }, (_, col) => {
      const cells = items.filter((_, i) => i % n === col)
      const key = Math.max(...cells.map((c) => c.key.length))
      return { key, width: key + 1 + Math.max(...cells.map((c) => c.label.length)) }
    })
    const gridWidth = cols.reduce((total, col) => total + col.width, gap * (n - 1))
    if (gridWidth > width) continue
    const left = Math.floor((width - gridWidth) / 2)
    const lines = []
    for (let i = 0; i < items.length; i += n) {
      const row = items.slice(i, i + n)
      const cells = row.map((item, j) => ({ ...item, keyText: item.key.padStart(cols[j].key), width: cols[j].width }))
      const content = cells.map((c) => `${c.keyText} ${c.label}`.padEnd(c.width)).join(" ".repeat(gap))
      lines.push({ items: row, cells, gap, left, text: " ".repeat(left) + content })
    }
    return lines
  }
  return []
}

// The turn-end notice and the last message, between the body and the bottom rule, wrapped to the width.
export function alertRows(snapshot, { notice, message } = {}, width = 110) {
  const rows = []
  for (const [text, tone] of [[notice && noticeText(snapshot, notice), "warning"], [message, "warning"]]) {
    if (text) for (const line of wrap(text, width, "  ")) rows.push({ text: line, tone })
  }
  return rows
}

const UNAVAILABLE = [{ text: "Account data is unavailable.", tone: "error" }, { text: "Manage accounts: /connect", tone: "muted" }]

// The whole modal for a terminal of `columns` × `rows`: { mode: "split" | "stacked", width, header, left, right,
// alerts, footer, start }. Split (84 text columns or more): the list at the left, a divider and the detail at the
// right, each cut to the body's height (the list scrolls with its focus, the detail loses its end). Stacked: one
// column, the list over the detail. `start` is the scroll position to pass back next time.
export function modalLayout(snapshot, { now = Date.now(), cursor, minimum, route, selection, columns = 120, rows: lines = 40,
  start = 0, notice, message, flags = {} } = {}) {
  const width = modalWidth(columns)
  const failed = flags.failed === true
  const header = { title: "Accounts", text: "Accounts".padEnd(width - 3) + "esc" }
  const keys = legend({ minimum, route, notice, deepseek: !!snapshot?.integrations?.some((i) => i.id === "deepseek"),
    refreshAll: batchRefs(snapshot).length > 0 }, width)
  const footer = failed ? [] : modalFooter(keys, width)
  const room = Math.min(lines - 2, 22) - (CHROME - 2) - footer.length
  const alerts = failed ? [] : alertRows(snapshot, { notice, message }, width).slice(0, Math.max(0, room - 1))
  const height = Math.max(1, room - alerts.length)
  const options = { now, cursor, minimum, route, selection }
  const ready = !failed && snapshot?.inventory === "available" && (snapshot.integrations?.length ?? 0) > 0
  if (!ready || width < SPLIT) {
    const fit = fitBody(failed ? UNAVAILABLE : modalRows(snapshot, { ...options, width }), height, start)
    return { mode: "stacked", width, height, header, left: { width, rows: fit.rows }, right: { width: 0, rows: [] }, alerts, footer, start: fit.start }
  }
  const left = Math.round((width - 3) / 3)
  const right = width - left - 3
  const fit = windowRows([...messages(snapshot, left), ...(route ? routeListRows(snapshot, route, left)
    : listRows(snapshot, { ...options, width: left, cut: true }))], height, start)
  return {
    mode: "split", width, height, header, left: { width: left, rows: fit.rows },
    right: { width: right, rows: trim(detailRows(snapshot, { ...options, width: right }), height) }, alerts, footer, start: fit.start,
  }
}

// The modal as plain text, line by line, as a terminal shows it (no trailing blanks): for tests and synthetic screens.
export function screenText(layout) {
  const rule = "─".repeat(layout.width)
  const body = layout.mode === "split"
    ? Array.from({ length: layout.height }, (_, i) =>
      `${(layout.left.rows[i]?.text ?? "").padEnd(layout.left.width)} │ ${layout.right.rows[i]?.text ?? ""}`)
    : Array.from({ length: layout.height }, (_, i) => layout.left.rows[i]?.text ?? "")
  return [layout.header.text, rule, ...body, ...layout.alerts.map((row) => row.text), rule, ...layout.footer.map((line) => line.text)]
    .map((line) => line.trimEnd())
}

// `a` asks once per saved OpenAI OAuth login and once for a sole Claude Code login. The server verifies the
// Codex method and the Claude profile; each read keeps its own scheduler slot, result and retry wait.
export function batchRefs(snapshot) {
  return (snapshot?.integrations ?? []).flatMap((i) => i.connections.filter((c) => manualUsageLogin(i, c))
    .map((c) => ({ integrationID: i.id, connectionID: c.id })))
}

// One line for the result of `a`: how many accounts were read, failed (each says why in its own detail) or were
// deferred by a running wait. Counts only; no account names, IDs or provider text.
// Only fixed categories and HTTP codes reach the screen, never server messages or response bodies.
export function refreshRpcError(error) {
  if ([error?.type, error?.data?.type].includes("not_found")) return "RPC: unknown account reference"
  const code = [error?.status, error?.statusCode, error?.response?.status].find(n => Number.isInteger(n) && n >= 400 && n <= 599)
  if (code) return `RPC: HTTP ${code}`
  if (error?.name === "TimeoutError") return "RPC: timed out"
  if (error?.name === "AbortError") return "RPC: cancelled"
  return "RPC: refresh call failed"
}

export function batchSummary(statuses) {
  const count = (status) => statuses.filter((s) => s === status).length
  const parts = ["read", "failed", "deferred", "unsupported"].filter(s => statuses.includes(s)).map(s => `${count(s)} ${s}`)
  for (const reason of new Set(statuses.filter(s => s.startsWith("RPC: ")))) parts.push(`${reason} (${count(reason)})`)
  return `Refresh all: ${parts.join(" · ")}.`
}

export function noticeText(snapshot, notice) {
  const { result } = notice
  const head = (notice.afterFailure ? "Last turn failed. " : "") + result.trigger.text
  // From the global engine: the preview's own `Next turn` and `Manual` texts; nothing is switched.
  if (result.route) return `${head}. ${result.next}${result.manual ? `. ${result.manual}` : ""}`
  return `${head}. No confirmed alternative: ${result.reason}`
}

// The line above the composer exists only while a turn-end notice is up: the account in use, what crossed (in the
// warning tone), what to do and where. Without a notice there is nothing to draw; the modal shows the account.
export function compactParts(snapshot, selection, notice) {
  const integration = notice && selection && snapshot?.integrations?.find((i) => i.id === selection.providerID)
  const active = integration?.connections.find((c) => c.active)
  if (!active) return undefined
  const result = notice.result
  const next = result.route ? result.next : "No confirmed alternative"
  return [
    { text: `${title(integration, active)} · `, tone: "muted" },
    { text: result.trigger.text, tone: "warning" },
    { text: ` · ${next} · /quota`, tone: "muted" },
  ]
}
export const compactLine = (snapshot, selection, notice) => {
  const parts = compactParts(snapshot, selection, notice)
  return parts && join(parts)
}

export const activeAccount = (snapshot, selection) =>
  snapshot?.integrations?.find((i) => i.id === selection?.providerID)?.connections.find((c) => c.active)?.id

// The next instant at which a held sample stops being fresh (TTL or reset), if any: when a notice needs to be
// revalidated by the clock alone. With a saved route order, also a known reset that ends a "Waiting for reset" mark
// of the global engine (routing.nextChange).
export const nextExpiry = (snapshot, now) => nextChange(snapshot?.integrations, now, freshnessOf(snapshot), routesSaved(snapshot))

// A saved, readable route order with at least one destination: then the global engine decides the turn-end advice.
export const routesSaved = (snapshot) => snapshot?.routing?.state === "available" && Array.isArray(snapshot.routing.targets) &&
  snapshot.routing.targets.length > 0

// The advice for the session's selection from the snapshot the TUI already holds: evaluating a turn never reads,
// switches or sends anything. Without a saved route order: rules.recommend() inside the selection's integration, over
// the legacy saved order, as before. With one: the same routePreview() the modal's `Preview next turn` shows, over the
// stored order (what the route editor opens with), so the notice names the same destination, provider and reason.
// The trigger and its recovery keys are the recommendation's own (both engines measure the trigger alike), so an
// episode ends only on a fresh sample of what triggered.
export function decide(snapshot, selection, now) {
  const integration = snapshot?.integrations?.find((i) => i.id === selection?.providerID)
  if (!integration || snapshot.preferences?.state !== "available") return { kind: "idle" }
  const all = integration.connections.map((c) => dataOf(integration, c))
  const legacy = recommend({
    integration: { id: integration.id, connections: integration.connections },
    selection, threshold: snapshot.preferences.threshold, minimums: snapshot.preferences.minimums, now,
    samples: all.flatMap((a) => a.samples), failures: all.flatMap((a) => (a.failure ? [a.failure] : [])), ttl: freshnessOf(snapshot),
  })
  if (!routesSaved(snapshot)) return legacy
  const targets = snapshot.routing.targets
  const d = routePreview(snapshot, targets, selection, now)
  if (!d?.trigger) return { kind: "idle", ...(legacy.kind === "idle" && legacy.measured ? { measured: legacy.measured } : {}) }
  const [next] = nextTurn(snapshot, targets, d)
  return {
    kind: d.kind, route: true, next, ...(manualText(d) ? { manual: manualText(d) } : {}),
    // What the advice is about, for the advisor's motive: the destination row and why it is manual, or the reason.
    ...(d.kind === "suggest" ? { to: JSON.stringify([d.target, targets[d.target], d.reason]) } : { reason: d.reason ?? next }),
    trigger: { text: d.trigger, keys: legacy.trigger?.keys ?? [JSON.stringify(["route", d.trigger])] },
  }
}

// Accounts the view may read when it opens: refreshable, connected, without fresh data and not waiting. A manual
// usage reader is never among them: it reads only on an explicit refresh.
export function staleRefs(snapshot, now) {
  const ttl = freshnessOf(snapshot)
  return (snapshot?.integrations ?? []).filter((i) => i.refreshable && !i.manual).flatMap((integration) =>
    integration.connections.filter((c) => !c.reconnectRequired && !(c.failure?.retryAt > now) &&
      !measures(integration, c, now, { ttl }).some((m) => m.state === "Fresh"))
      .map((c) => ({ integrationID: integration.id, connectionID: c.id })))
}

// The DeepSeek low-balance notice, edited locally until Save; it starts from the stored minimums.
export function startMinimum(snapshot) {
  if (snapshot?.preferences?.state !== "available" || !snapshot.integrations?.some((i) => i.id === "deepseek")) return undefined
  return { revision: snapshot.preferences.revision, minimums: { ...snapshot.preferences.minimums }, currency: CURRENCIES[0] }
}

export function shiftCurrency(draft, delta) {
  const index = Math.max(0, Math.min(CURRENCIES.length - 1, CURRENCIES.indexOf(draft.currency) + delta))
  return { ...draft, currency: CURRENCIES[index] }
}

// A click on a currency row of the editor: that currency, if it is one of the notice's.
export const pickCurrency = (draft, currency) => (CURRENCIES.includes(currency) ? { ...draft, currency } : draft)

// Exact decimal text as typed, never a float: digits with an optional dot ("0.20", "5", "0"). Anything else,
// including a sign, a comma or an exponent, is rejected and leaves the draft unchanged.
export function setAmount(draft, text) {
  const value = typeof text === "string" ? text.trim() : ""
  if (!isDecimal(value) || value.startsWith("-")) return undefined
  return { ...draft, minimums: { ...draft.minimums, [draft.currency]: value } }
}

export function turnOff(draft) {
  const { [draft.currency]: _, ...minimums } = draft.minimums
  return { ...draft, minimums }
}

// Complete proposal with the revision the draft was read at (`snapshot.preferences.revision`): every integration
// keeps its saved (legacy) order as shown, which the modal no longer edits; the threshold or the notice minimums
// change only when the draft carries them, the rest stays as stored.
export function proposalFrom(snapshot, draft) {
  const order = {}
  for (const integration of snapshot.integrations) order[integration.id] = integration.connections.map((c) => c.id)
  return { revision: draft.revision, threshold: draft.threshold ?? snapshot.preferences.threshold, minimums: draft.minimums ?? snapshot.preferences.minimums, order }
}
