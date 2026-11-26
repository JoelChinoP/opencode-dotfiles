import { Plugin } from "@opencode/plugin/tui"
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, Index, onMount, Show } from "solid-js"
import { contract } from "./rpc.js"
import { createAdvisor, TURN_END } from "./rules.js"
import { createDedupe, createLoader } from "./sync.js"
import {
  accountRefs, activeAccount, batchRefs, batchSummary, compactParts, conflicted, decide, KEYS, keyAction, modalLayout, nextExpiry, NO_REFRESH, refreshRpcError,
  pickCurrency, pickDestination, proposalFrom, putRoute, routeMove, routeProposal, routeRemove, routeStep,
  sessionRef, setAmount, shiftCurrency, staleRefs, startMinimum, startRoute, turnOff,
} from "./view.js"

// The command keeps its descriptive name in the palette; the modal itself has a short title.
const title = "Account quota and routing"

export default Plugin.define({
  id: "account-quota.tui",
  setup(context) {
    let opening = false
    let shown = false
    let asking = false
    let batching = false
    let target: unknown
    const [snapshot, setSnapshot] = createSignal<any>()
    const [failed, setFailed] = createSignal(false)
    const [now, setNow] = createSignal(Date.now())
    const [cursor, setCursor] = createSignal<string>()
    const [minimum, setMinimum] = createSignal<any>()
    // The route order draft (rotation plan R3), edited locally until Save; its preview reads nothing.
    const [route, setRoute] = createSignal<any>()
    const [message, setMessage] = createSignal<string>()
    const [tick, setTick] = createSignal(0)
    const advisor = createAdvisor()
    // All the advisor may look at: the snapshot held here, at one instant. Never a request.
    const view = (held: any, at: number) => ({
      account: (sel: any) => activeAccount(held, sel),
      evaluate: (sel: any) => decide(withCatalog(held), sel, at),
    })
    // While a notice is up, one timeout at the next instant a held sample reaches its TTL or reset, so the notice
    // is revalidated then and not at the next turn. Not a per-second countdown.
    let expiry: ReturnType<typeof setTimeout> | undefined
    const revise = () => {
      clearTimeout(expiry)
      expiry = undefined
      const at = advisor.pending() ? nextExpiry(snapshot(), Date.now()) : undefined
      if (at !== undefined) {
        expiry = setTimeout(() => {
          const moment = Date.now()
          setNow(moment)
          advisor.observe(view(snapshot(), moment))
          revise()
        }, Math.max(0, at - Date.now()) + 25)
      }
      setTick((n) => n + 1)
    }
    // `context.client` is read per call: it changes when the TUI reconnects to a restarted server.
    const rpc = () => context.client.rpc(contract)
    // The route order and this session's routing mode travel with the snapshot. A server without `routingView` (an
    // older plugin) leaves it unavailable; the accounts still load.
    const sessionOnScreen = () => {
      const route = context.ui.router.current()
      return route.type === "session" ? route.sessionID : undefined
    }
    const loader = createLoader({
      read: async (location) => {
        const sessionID = sessionOnScreen()
        const [value, routing] = await Promise.all([rpc().snapshot({}, { location }),
          rpc().routingView(sessionID ? { sessionID } : {}, { location }).catch(() => ({ state: "unavailable" }))])
        return { ...value, routing }
      },
      apply: (value) => {
        const at = Date.now()
        // The data held until now is checked at this instant before it is replaced: a notice whose sample went
        // stale or failed meanwhile is withdrawn and cannot come back with the new read. Then the new data.
        advisor.observe(view(snapshot(), at))
        setSnapshot(value)
        setFailed(false)
        setNow(at)
        advisor.observe(view(value, at))
        revise()
      },
      fail: () => setFailed(true),
    })
    // Freshness changes with time; minute-level text, no per-second countdown. Only the modal's relative texts ("3 min
    // ago", Stale) need it, so it runs while the modal is open; otherwise each reload (`apply`) and the notice's expiry
    // timer (`revise`) move `now`.
    let clock: ReturnType<typeof setInterval> | undefined

    function location() {
      const route = context.ui.router.current()
      return route.type === "session"
        ? context.data.session.get(route.sessionID)?.location
        : context.location ?? context.data.location.default()
    }
    const load = (where = location()) => {
      if (where) target = where
      return loader.invalidate(where)
    }
    const selection = () => context.ui.model.current()
    const withCatalog = (held: any) => held && { ...held, catalog: context.data.location.model.list(location()) }
    async function pickerCatalog() {
      const where = location()
      const models = context.data.location.model
      if (models.list(where) === undefined) await models.sync(where).catch(() => {})
      return models.list(where)
    }
    // The notice of the session on screen, revalidated with the held snapshot and the clock on every render.
    const notice = () => {
      tick()
      const route = context.ui.router.current()
      const sel = selection()
      const held = snapshot()
      if (route.type !== "session" || !sel || !held || failed()) return undefined
      const current = advisor.current({ sessionID: route.sessionID, selection: sel, ...view(held, now()) })
      return current && { ...current, integrationID: current.selection.providerID }
    }

    let stopChanged = () => {}
    const listen = () => {
      stopChanged()
      // A new subscription starts afresh: a copy of a change seen before it still reloads.
      const first = createDedupe()
      try {
        stopChanged = context.client.rpc(contract).events.on("changed", (event: any) => {
          // A repeated copy is dropped first, so a revision that does not reload is seen too. Without the modal, a notice
          // or an episode nobody uses the snapshot until the next turn end or opening, and both read it again.
          if (first(event?.data?.revision) && (shown || opening || advisor.watching())) void loader.invalidate()
        })
      } catch {
        stopChanged = () => {}
      }
    }
    listen()
    const stops: Array<() => void> = []
    try {
      // Events missed while disconnected are not replayed: resubscribe and read the current snapshot.
      stops.push(context.data.on("server.connected" as never, () => {
        listen()
        void loader.invalidate()
      }))
    } catch {}
    // Turn end of the session on screen first reads the plugin's own snapshot again, so the usage of that turn's last
    // step counts, then evaluates it: a local read, no provider queried, no switch, no prompt (B03.5). It is the only
    // place a notice is born. A failed read evaluates whatever snapshot is held.
    const onTurn = async (event: any) => {
      const before = context.ui.router.current()
      if (before.type !== "session" || event?.data?.sessionID !== before.sessionID) return
      await load()
      // Route, selection and snapshot may have changed during the read.
      const route = context.ui.router.current()
      const sel = selection()
      const held = snapshot()
      if (route.type !== "session" || !sel || !held) return
      advisor.turnEnded(event, { sessionID: route.sessionID, selection: sel, ...view(held, Date.now()) })
      revise()
    }
    for (const type of TURN_END) {
      try {
        stops.push(context.data.on(type as never, (event: any) => void onTurn(event).catch(() => {})))
      } catch {}
    }

    // Native theme roles only, no fixed colors; color only adds to the words. Feedback tokens are state objects
    // (`text.feedback.error.base`); some may be missing in older hosts, so every role falls back to the main text.
    // The dialog surface, when the host offers it, is what native dialogs draw on; the focused row uses the host's own
    // list focus (`background/text.action.primary.focused`, `text.formfield.focused` for its margin).
    const theme: any = context.theme
    const surface = () => {
      try {
        return (typeof theme.surface === "function" && theme.surface("dialog")) || theme
      } catch {
        return theme
      }
    }
    const focusBg = () => surface().background?.action?.primary?.focused
    const focusFg = () => (focusBg() ? surface().text?.action?.primary?.focused : undefined) ?? tone("base")
    function tone(name?: string): any {
      const text = surface().text ?? theme.text
      const role = (read: (t: any) => any) => read(text) ?? read(theme.text)
      if (name?.startsWith("icon:")) {
        const scale = (surface().categorical ?? theme.categorical)?.[Number(name.slice(5))]
        return scale?.[400] ?? text.action?.primary?.base ?? text.base ?? theme.text.base
      }
      return (name === "error" ? role((t) => t?.feedback?.error?.base)
        : name === "warning" ? role((t) => t?.feedback?.warning?.base)
        : name === "success" ? role((t) => t?.feedback?.success?.base)
        : name === "info" ? role((t) => t?.feedback?.info?.base) ?? role((t) => t?.muted)
        : name === "muted" ? role((t) => t?.muted)
        : name === "faint" ? role((t) => t?.faint) ?? role((t) => t?.muted)
        : name === "accent" ? text.action?.primary?.base
        : name === "focus" ? role((t) => t?.formfield?.focused) ?? focusFg()
        : undefined) ?? text.base ?? theme.text.base
    }
    // Chips: a key of the footer or a count on the raised background; a state on its feedback background.
    const chipBg = (name?: string) => {
      const background = surface().background ?? theme.background
      return name === "key" ? background?.raised?.high ?? theme.background?.raised?.high
        : background?.feedback?.[name ?? ""]?.base ?? theme.background?.feedback?.[name ?? ""]?.base
    }
    const chipFg = (name?: string) => (name === "key" ? tone("base") : tone(name))
    const rule = () => surface().border?.base ?? theme.border?.base ?? tone("muted")
    // In the focused row the words take the focus color; marks and chips keep theirs.
    const partFg = (part: any, focused: boolean) => (part.chip ? chipFg(part.tone) : focused && !part.keep ? focusFg() : tone(part.tone))
    const partBg = (part: any, focused: boolean) => (part.chip ? chipBg(part.tone) : focused ? focusBg() : undefined)

    const idle = () => !minimum() && !route() && !asking
    // Account rows in screen order.
    const refs = () => accountRefs(snapshot())
    const step = (delta: number) => {
      const list = refs()
      if (list.length === 0) return
      const index = list.indexOf(cursor() ?? "")
      setCursor(list[index < 0 ? 0 : Math.max(0, Math.min(list.length - 1, index + delta))])
    }
    const selected = () => (cursor() ? (JSON.parse(cursor() as string) as [string, string]) : undefined)

    // `manual` marks a read the user asked for; reads started by opening the view never carry it.
    async function refresh(integrationID: string, connectionID: string, manual: boolean) {
      try {
        return (await rpc().refresh({ integrationID, connectionID, ...(manual ? { manual: true } : {}) }, { location: target })).status
      } catch (error) {
        return refreshRpcError(error)
      }
    }
    async function refreshSelected() {
      const ref = selected()
      if (!ref || minimum() || route()) return
      const integration = snapshot()?.integrations.find((i: any) => i.id === ref[0])
      // An account without a reader: one short line says so, nothing is called. With `experimentalClaudeUsage`, `r` on
      // Claude reads Claude Code `/usage` once (manual reader).
      if (!integration?.refreshable) {
        setMessage(NO_REFRESH)
        return
      }
      setMessage("Refreshing…")
      const status = await refresh(ref[0], ref[1], true)
      setMessage(status === "read" ? undefined
        : status.startsWith("RPC: ") ? status
        : status === "deferred" ? "Refresh deferred after a failure. Try again later."
        : status === "unsupported" ? NO_REFRESH
        : "Refresh failed.")
      await load(target)
    }
    // Each manual read goes through the same per-account RPC and shared scheduler as `r`.
    async function refreshAll() {
      if (batching || minimum()) return
      const due = batchRefs(snapshot())
      if (due.length === 0) {
        setMessage("No accounts available to refresh.")
        return
      }
      batching = true
      setMessage("Refreshing accounts…")
      try {
        const statuses = await Promise.all(due.map((ref) => refresh(ref.integrationID, ref.connectionID, true)))
        setMessage(batchSummary(statuses))
      } finally {
        batching = false
      }
      await load(target)
    }
    function beginMinimum() {
      const next = startMinimum(snapshot())
      setMessage(next ? undefined : "The low-balance notice cannot be edited now.")
      if (next) setMinimum(next)
    }
    // Native dialogs replace their parent. Keep the draft alive for the whole picker sequence and restore it once.
    async function subdialog<T>(run: () => Promise<T>): Promise<T | undefined> {
      if (asking || !shown) return
      asking = true
      try {
        const value = await run()
        return shown ? value : undefined
      } catch {
        if (shown) setMessage("Could not open the dialog.")
      } finally {
        asking = false
        if (shown) showModal()
      }
    }
    const pick = (options: any) => shown ? context.ui.dialog.select<any>(options) : Promise.resolve(undefined)
    async function editAmount() {
      const draft = minimum()
      if (!draft || asking) return
      const value = await subdialog(() => context.ui.dialog.prompt({ title: `DeepSeek ${draft.currency} low-balance notice`, placeholder: "Amount, for example 0.20" }))
      if (minimum() !== draft) return
      if (typeof value !== "string" || value.trim() === "") {
        setMessage("Amount unchanged.")
        return
      }
      const next = setAmount(draft, value)
      setMessage(next ? undefined : "Use digits and an optional dot, like 0.20.")
      if (next) setMinimum(next)
    }
    // Route order: `o` opens a draft of the stored list; Save sends it whole with the route order's own revision.
    function beginRoute() {
      const next = startRoute(snapshot())
      setMessage(next ? undefined : "The route order cannot be edited now.")
      if (next) setRoute(next)
    }
    const changeRoute = (next: any, failure?: string) => {
      if (next) setRoute(next)
      setMessage(next ? undefined : failure)
    }
    async function editRoute(add = false) {
      const draft = route()
      if (!draft || asking) return
      const item = draft.targets[draft.index]
      await subdialog(async () => {
        const edit = add || !item ? "add" : await pick({ title: "Edit destination", options: [
          { title: "Model", value: "model" }, { title: "Effort", value: "effort" }, { title: "Change account", value: "account" },
          ...(draft.index > 0 ? [{ title: "Move up", value: "up" }] : []),
          ...(draft.index + 1 < draft.targets.length ? [{ title: "Move down", value: "down" }] : []),
          { title: "Remove from order", value: "remove" },
        ] })
        if (!edit || route() !== draft) return
        if (edit === "up" || edit === "down") return changeRoute(routeMove(draft, edit === "up" ? -1 : 1))
        if (edit === "remove") return changeRoute(routeRemove(draft))
        const row = await pickDestination({ snapshot: snapshot(), target: item, edit, selection: sessionOnScreen() ? selection() : undefined, catalog: pickerCatalog, pick })
        if (row && route() === draft) changeRoute(putRoute(draft, row, edit === "add" ? draft.targets.length : draft.index),
          "Already in this order, or the list is full.")
      })
    }
    async function routeOptions() {
      const prefs = snapshot()?.preferences
      const sess = snapshot()?.routing?.session
      const watching = sess?.mode === "preview"
      const last = sess?.decision
      const draft = route()
      if (!draft || asking) return
      const choice = await subdialog(async () => {
        const what = await pick({ title: "Order options", options: [
          { title: "Quota threshold", value: "threshold", footer: `${prefs?.threshold ?? "—"}%`, disabled: prefs?.state !== "available" },
          ...(sess ? [{ title: watching ? "Stop watching turns" : "Watch turn ends", value: "watch",
            description: last ? `Last turn: ${last.kind === "suggest" ? `choice ${last.target + 1}` : last.kind}${last.reason ? ` · ${last.reason}` : ""}` : undefined },
            { title: sess.paid ? "Exclude metered API" : "Allow metered API", value: "paid",
              description: watching ? "For this session's turn previews" : "Also starts watching this session" }] : []),
        ] })
        if (what !== "threshold") return what
        return pick({ title: "Quota threshold", current: prefs.threshold, options: Array.from({ length: 11 }, (_, i) => ({ title: `${90 + i}% used`, value: 90 + i })) })
      })
      if (choice === undefined || route() !== draft) return
      if (choice === "watch") return sessionMode((s) => ({ mode: s.mode === "preview" ? "off" : "preview", paid: s.mode === "preview" ? false : s.paid }))
      if (choice === "paid") return sessionMode((s) => ({ mode: "preview", paid: !s.paid }))
      try {
        await rpc().savePreferences(proposalFrom(snapshot(), { revision: prefs.revision, threshold: choice }), { location: target })
        setMessage(`Threshold saved: ${choice}% used.`)
      } catch (error: any) {
        setMessage(conflicted(error) ? "Preferences changed. Reload before saving." : "Threshold was not saved.")
      }
      await load(target)
    }
    // Watching and paid consent belong to the session on screen, in the server's memory only; they apply at once.
    async function sessionMode(change: (session: any) => any) {
      const sessionID = sessionOnScreen()
      const session = snapshot()?.routing?.session
      if (!route() || !sessionID || !session) return setMessage("Open a session to watch its turns.")
      const next = change(session)
      try {
        await rpc().setSessionRouting({ sessionID, mode: next.mode, paid: next.paid }, { location: target })
        setMessage(next.mode === "preview" ? `Watching this session's turns · Paid API ${next.paid ? "allowed" : "not allowed"}.` : "Not watching this session.")
      } catch {
        setMessage("The session mode was not changed.")
      }
      await load(target)
    }
    async function saveRoute() {
      const draft = route()
      if (!draft || asking) return
      try {
        await rpc().saveRouting(routeProposal(draft), { location: target })
        setMessage("Route order saved.")
        setRoute(undefined)
      } catch (error: any) {
        setMessage(conflicted(error) ? "Order changed elsewhere. Reopen it to load the latest order." : "Route order was not saved.")
      }
      await load(target)
    }
    // The notice minimum goes through the preferences flow (`snapshot.preferences.revision`), keeping the stored order
    // and threshold.
    async function save() {
      if (route()) return saveRoute()
      const draft = minimum()
      if (!draft || asking) return
      try {
        await rpc().savePreferences(proposalFrom(snapshot(), draft), { location: target })
        setMessage("Low-balance notice saved.")
      } catch (error: any) {
        setMessage(conflicted(error) ? "Preferences changed. Reload before saving." : "Low-balance notice was not saved.")
      }
      setMinimum(undefined)
      await load(target)
    }
    // Esc cancels an open edit and keeps the modal; otherwise it lets the host close the modal (return false).
    function escape() {
      if (!minimum() && !route()) return false
      setMinimum(undefined)
      setRoute(undefined)
      setMessage(undefined)
    }
    // A click on `esc` at the top right does what the key does.
    const close = () => {
      if (escape() === false) context.ui.dialog.clear()
    }
    // One table of actions for the keys and the clicks on the footer, so both always run the same with the same guards.
    const actions: Record<string, () => void> = {
      refresh: () => void refreshSelected(),
      refreshAll: () => { if (idle()) void refreshAll() },
      notice: () => { if (idle()) beginMinimum() },
      amount: () => void editAmount(),
      off: () => { if (minimum() && !asking) setMinimum(turnOff(minimum())) },
      save: () => void save(),
      dismiss: () => { if (notice()) { advisor.dismiss(); revise() } },
      route: () => { if (idle()) beginRoute() },
      routeAdd: () => void editRoute(true),
      routeEdit: () => void editRoute(),
      routeOptions: () => void routeOptions(),
    }
    const perform = (action?: string) => {
      if (action && actions[action]) actions[action]()
    }
    // A click on a row: an account or a provider's first account moves the cursor (never while the notice editor is
    // open); a currency row of the editor selects it; a destination row of the route order selects that row.
    function choose(click: any) {
      if (!click || asking) return
      if (route()) {
        if (click.kind === "route") {
          setRoute({ ...route(), index: click.index })
          void editRoute()
        }
        return
      }
      const draft = minimum()
      if (click.kind === "currency") {
        if (draft) setMinimum(pickCurrency(draft, click.currency))
        return
      }
      if (draft) return
      setCursor(click.ref)
    }
    // The wheel over the list moves the cursor as the arrow keys do.
    const wheel = (event: any) => {
      if (minimum() || asking) return
      const direction = event?.scroll?.direction
      if (direction === "up") arrow(-1)
      else if (direction === "down") arrow(1)
    }
    const left = (event: any) => event?.button === 0
    // ↑↓ and the wheel: the route row in the route editor, the currency in the notice editor, otherwise the account.
    function arrow(delta: number) {
      if (route()) setRoute(routeStep(route(), delta))
      else if (minimum()) setMinimum(shiftCurrency(minimum(), delta))
      else step(delta)
    }

    function AccountModal() {
      context.ui.dialog.set({ size: "xlarge", centered: true })
      const size = useTerminalDimensions()
      // Keys of the modal only, gone with it; above the host's own dialog keys so Esc can cancel an edit first.
      context.keymap.layer(() => ({
        mode: "modal",
        priority: 10,
        commands: [
          { bind: "escape", run: escape },
          { bind: "up", run: () => arrow(-1) },
          { bind: "down", run: () => arrow(1) },
          ...Object.keys(KEYS).map((bind) => ({ bind, run: () => perform(keyAction(bind, { route: route(), minimum: minimum() })) })),
        ],
      }))
      // Two panels when wide, one column otherwise. The list scrolls with the focused account (or the open editor) and
      // moves only as far as needed; every row is at most its panel's width, so one row is one physical line.
      let start = 0
      const layout = createMemo(() => {
        const value = modalLayout(route() ? withCatalog(snapshot()) : snapshot(), {
          now: now(), cursor: cursor(), minimum: minimum(), route: route(), selection: route() && !sessionOnScreen() ? undefined : selection(), columns: size().width,
          rows: size().height, start, notice: notice(), message: message(), flags: { failed: failed() },
        })
        start = value.start
        return value
      })
      const divider = () => Array.from({ length: layout().height }, () => " │ ")
      // A row is drawn as its parts (margin, dot, alias, chips, figure, meter fill and track) in their own roles; the
      // focused row in the host's list focus colors, bold, with its ┃ margin, so it reads without color too. A click
      // on any line of an account, provider or currency row picks it.
      const Line = (props: { row: () => any }) => {
        const parts = () => props.row().parts ?? [{ text: props.row().text, tone: props.row().tone }]
        const focused = () => !!props.row().selected
        return (
          <text fg={focused() ? focusFg() : tone(props.row().tone)} bg={focused() ? focusBg() : undefined}
            attributes={props.row().bold || focused() ? TextAttributes.BOLD : 0} wrapMode="none"
             onMouseDown={(event: any) => { if (left(event) && props.row().click?.kind !== "route") choose(props.row().click) }}
             onMouseUp={(event: any) => { if (left(event) && props.row().click?.kind === "route") choose(props.row().click) }}>
            <Index each={parts()}>
              {(part: () => any) => <span style={{ fg: partFg(part(), focused()), bg: partBg(part(), focused()) }}>{part().text}</span>}
            </Index>
          </text>
        )
      }
      // One line of keys, centered; each key with its action is one text that runs it on a click.
      const Keys = (props: { line: () => any }) => (
        <box flexDirection="row" height={1} gap={props.line().gap} paddingLeft={props.line().left}>
          <Index each={props.line().cells}>
            {(item: () => any) => (
              <text width={item().width} height={1} wrapMode="none" onMouseUp={(event: any) => { if (left(event)) perform(item().action) }}>
                <span style={{ fg: tone("base"), attributes: TextAttributes.BOLD }}>{item().keyText}</span>
                <span style={{ fg: tone("muted") }}>{` ${item().label}`}</span>
              </text>
            )}
          </Index>
        </box>
      )
      const List = (props: { rows: () => any[] }) => <Index each={props.rows()}>{(row: () => any) => <Line row={row} />}</Index>
      return (
        <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={tone("base")} wrapMode="none"><b>{layout().header.title}</b></text>
            <text fg={tone("muted")} wrapMode="none" onMouseUp={(event: any) => { if (left(event)) close() }}>esc</text>
          </box>
          <text fg={rule()} wrapMode="none">{"─".repeat(layout().width)}</text>
          {/* One text node per line position, updated in place: a new snapshot changes words, not the node tree. */}
          <Show when={layout().mode === "split"} fallback={
            <box flexDirection="column" height={layout().height} onMouseScroll={wheel}><List rows={() => layout().left.rows} /></box>
          }>
            <box flexDirection="row">
              <box flexDirection="column" width={layout().left.width} flexShrink={0} onMouseScroll={wheel}>
                <List rows={() => layout().left.rows} />
              </box>
              <box flexDirection="column" width={3} flexShrink={0}>
                <Index each={divider()}>{(line: () => string) => <text fg={rule()} wrapMode="none">{line()}</text>}</Index>
              </box>
              <box flexDirection="column" flexGrow={1}><List rows={() => layout().right.rows} /></box>
            </box>
          </Show>
          <List rows={() => layout().alerts} />
          <text fg={rule()} wrapMode="none">{"─".repeat(layout().width)}</text>
          <Index each={layout().footer}>{(line: () => any) => <Keys line={line} />}</Index>
        </box>
      )
    }
    // Only our own child dialogs retain the draft when the parent is replaced.
    function showModal() {
      // Also called when a child dialog returns: never a second interval.
      clock ??= setInterval(() => setNow(Date.now()), 30_000)
      context.ui.dialog.show(() => <AccountModal />, () => {
        if (asking) return
        clearInterval(clock)
        clock = undefined
        shown = false
        setMinimum(undefined)
        setRoute(undefined)
        setMessage(undefined)
      })
    }

    // `/quota`, the palette and a click on the composer line. The cursor starts on the account in use for the
    // session's model, so the detail shows at once what the composer line used to say; otherwise where it was, or the
    // first account.
    async function open() {
      if (opening || shown) return
      opening = true
      try {
        const where = location()
        if (!where) throw new Error("Unknown location")
        listen()
        await load(where)
        if (failed()) throw new Error("Account data is unavailable")
        const list = refs()
        const session = sessionRef(snapshot(), selection())
        setCursor(session && list.includes(session) ? session : list.includes(cursor() ?? "") ? cursor() : list[0])
        shown = true
        showModal()
        // Reads only accounts whose data is missing or stale, once per opening (B06.1). A manual reader (the
        // experimental Codex one, Claude's /usage) is never listed: it reads only when the user presses r or a.
        const due = staleRefs(snapshot(), Date.now())
        if (due.length > 0) void Promise.all(due.map((ref) => refresh(ref.integrationID, ref.connectionID, false))).then(() => load(target))
      } catch {
        context.ui.toast.show({ title, message: "Account data is unavailable.", variant: "error" })
      } finally {
        opening = false
      }
    }

    function CompactLine() {
      // Local inventory and preferences only; no provider is queried by showing this line. It stays mounted with
      // nothing to draw: its first load is the snapshot a turn end is evaluated against.
      onMount(() => void load())
      const parts = () => (failed() ? undefined : compactParts(snapshot(), selection(), notice()))
      const lineTone = (name: string) => (name === "warning" ? theme.text.feedback?.warning?.base ?? theme.text.base : theme.text.muted)
      // Only while a turn-end notice is up; a click on it opens the modal.
      return (
        <Show when={parts()}>
          {(list: () => any[]) => (
            <text fg={context.theme.text.muted} wrapMode="word" onMouseUp={(event: any) => { if (left(event)) void open() }}>
              <Index each={list()}>{(part: () => any) => <span style={{ fg: lineTone(part().tone) }}>{part().text}</span>}</Index>
            </text>
          )}
        </Show>
      )
    }
    const removeLine = context.ui.slot({ append: "session.composer.top", render: () => <CompactLine /> })

    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "account-quota.accounts.open",
        title,
        palette: true,
        slash: { name: "quota" },
        run: open,
      }],
    }))

    return () => {
      clearInterval(clock)
      clearTimeout(expiry)
      if (shown) { shown = false; context.ui.dialog.clear() }
      removeLine()
      stopChanged()
      for (const stop of stops) stop()
    }
  },
})
