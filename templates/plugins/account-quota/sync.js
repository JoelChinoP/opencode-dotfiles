// Single-flight snapshot loader for the TUI (B02.4). Events are live only and may be lost (S08), so every
// invalidation (open, `changed`, reconnect, location change) schedules one more read. A response is applied
// only if nothing was invalidated while it was in flight, so an older read never replaces a newer state.
export function createLoader({ read, apply, fail }) {
  let target
  let key
  let running = false
  let dirty = false
  let idle = []

  async function pump() {
    while (dirty) {
      dirty = false
      const request = target
      try {
        const value = await read(request)
        if (!dirty) apply(value)
      } catch (error) {
        if (!dirty) fail(error)
      }
    }
    running = false
    const settled = idle
    idle = []
    for (const resolve of settled) resolve()
  }

  return {
    // Resolves once a read that started after this call has been applied or has failed.
    invalidate(next) {
      if (next !== undefined) {
        const nextKey = JSON.stringify(next)
        if (nextKey !== key) {
          key = nextKey
          target = next
        }
      }
      if (target === undefined) return Promise.resolve()
      dirty = true
      const done = new Promise((resolve) => idle.push(resolve))
      if (!running) {
        running = true
        void pump()
      }
      return done
    },
  }
}

// Every location instance announces the same change with the same revision, and a client hears all locations: only
// the first copy counts. An event without a revision always counts, so no notice is ever lost; so does a lower one
// (a restarted server).
export function createDedupe() {
  let last
  return (revision) => {
    if (revision !== undefined && revision === last) return false
    last = revision
    return true
  }
}
