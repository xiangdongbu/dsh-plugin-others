/**
 * dsh-plugin-keep-new-session — browser half.
 *
 * Root cause: a freshly created conversation (「新会话」) is a *blank* session —
 * its log holds no turn yet. The official workspace sidebar
 * (`@deepseek-ai/dsh-client-ui-workspace`) deliberately lists blank sessions
 * only while one of them is selected:
 *
 *     function sessionVisible(session, current, archived, archivedFilter) {
 *       if (session.origin === "subagent") return false;
 *       if (session.blank && session.id !== current) return false;   // ← here
 *       ...
 *     }
 *
 * So the moment you switch to another session, the new one drops out of the
 * sidebar. It is NOT deleted: the Host keeps blank sessions and reuses the
 * first reusable one for the next new-conversation click (`createInWorkspace`).
 * The row is merely filtered from view.
 *
 * Fix: wrap the client session catalog's snapshot store
 * (`ctx.uiWorkspace.sessions.list`) and present blank sessions that the user
 * has *visited and then left* as ordinary rows (`blank` → `false`). Everything
 * downstream — the visibility filter, ordering, the row's 「…」/right-click
 * menu, and the session-delete plugin's 「删除」 — then treats them like any
 * untitled session: they stay listed, stay clickable, and can be deleted with
 * the stock menu item. No delete UI of its own is needed.
 *
 * The flip is view-only and safe by construction:
 *   - the wrapped `getSnapshot` memoizes on (raw snapshot identity, set
 *     version), so React's `useSyncExternalStore` keeps one stable snapshot
 *     identity between renders;
 *   - the raw Host state is never written by this plugin. Host retention
 *     writes that read the view flow back through `list.set`, which detaches
 *     a clone; the next projection rebuild restores the raw row and the view
 *     re-applies the flip — idempotent, no feedback loop;
 *   - a kept id leaves the set as soon as its session grows a real turn (it
 *     is visible on its own from then on) or disappears (deleted).
 *
 * "Visited" tracking mirrors the host's own current-session probe
 * (`mainSessionId`): the one summary whose `retainedBy.mainView` is positive.
 * When that id changes and the previous one still reads blank, it is kept.
 * The set persists in localStorage, so kept sessions survive app restarts.
 *
 * Two accepted behavior changes, both deliberate:
 *   - a kept blank shows the localized 「新会话」 label (through the locale
 *     service, falling back to the untitled label when unavailable);
 *   - a kept blank is no longer eligible as the new-chat draft
 *     (`createInWorkspace` reuses only blank summaries), so clicking
 *     新建对话 opens a fresh draft instead of jumping back to the kept one.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-keep-new-session',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    exports.inject = ['uiWorkspace', 'locale']

    const PLUGIN = 'dsh-plugin-keep-new-session'
    const STORAGE_KEY = `${PLUGIN}:kept`

    /** Kept session ids, in first-kept order (only for stable persistence). */
    let kept = []
    /** Bumped on every membership change so the memoized view rebuilds. */
    let version = 0
    /** The id the host currently retains as the main view, per the last read. */
    let prevCurrent
    /** Memoization of the last presented view. */
    let viewSource = null
    let viewVersion = -1
    let view = null
    /** Bound locale translator for the workspace namespace, when available. */
    let tWorkspace = null
    let disposed = false

    function loadKept() {
      if (typeof localStorage === 'undefined') return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw === null) return
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          kept = parsed.filter((id) => typeof id === 'string' && id !== '')
          version += 1
        }
      } catch (error) {
        console.warn(`${PLUGIN}: kept-list rehydration failed:`, error)
      }
    }

    function saveKept() {
      if (typeof localStorage === 'undefined') return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(kept))
      } catch (error) {
        console.warn(`${PLUGIN}: kept-list persistence failed:`, error)
      }
    }

    function keep(sessionId) {
      if (kept.includes(sessionId)) return
      kept = [...kept, sessionId]
      version += 1
      saveKept()
    }

    function drop(sessionId) {
      if (!kept.includes(sessionId)) return
      kept = kept.filter((id) => id !== sessionId)
      version += 1
      saveKept()
    }

    /**
     * The session the main view currently retains, resolved exactly like the
     * host's own `mainSessionId`: the first summary with a positive
     * `mainView` retention count.
     */
    function currentIdOf(snapshot) {
      for (const row of Object.values(snapshot.byId)) {
        if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
      }
      return undefined
    }

    /**
     * The localized New-Session label. `translate` falls back to the key
     * itself when a namespace lookup misses, so the key string is rejected.
     */
    function newSessionLabel() {
      if (tWorkspace === null) return undefined
      try {
        const label = tWorkspace('session.new')
        return typeof label === 'string' && label !== '' && !label.includes('.') ? label : undefined
      } catch {
        return undefined
      }
    }

    /**
     * Present the snapshot with kept blanks shown as ordinary sessions.
     * Returns the raw snapshot untouched when there is nothing to flip.
     */
    function present(snap) {
      // Prune kept ids whose session is gone. Deliberately NOT on
      // `blank !== true`: the host's retention writes may transiently carry
      // this view's own flip back into the raw state (getSnapshot → list.set
      // clone), so a raw false here does not prove a real turn arrived; the
      // next projection rebuild restores the raw row either way. Pruning on
      // blankness could drop a kept session between those two writes and let
      // it vanish from the sidebar — exactly what this plugin prevents.
      let pruned = false
      for (const id of [...kept]) {
        if (snap.byId[id] === undefined) {
          kept = kept.filter((keptId) => keptId !== id)
          pruned = true
        }
      }
      if (pruned) {
        version += 1
        saveKept()
      }

      if (kept.length === 0) return snap
      if (snap === viewSource && version === viewVersion && view !== null) return view

      const label = newSessionLabel()
      let changed = false
      const byId = {}
      for (const id of Object.keys(snap.byId)) {
        const row = snap.byId[id]
        if (kept.includes(id) && row.blank === true) {
          byId[id] = { ...row, blank: false, title: label ?? row.title }
          changed = true
        } else {
          byId[id] = row
        }
      }
      view = changed ? { ...snap, byId } : snap
      viewSource = snap
      viewVersion = version
      return view
    }

    exports.apply = function apply(ctx) {
      const ui = ctx.uiWorkspace
      const list = ui?.sessions?.list
      if (ui === undefined || list === undefined || typeof list.getSnapshot !== 'function') return

      try {
        const locale = ctx.locale
        if (locale !== undefined && typeof locale.bind === 'function') {
          tWorkspace = locale.bind('workspace')
        }
        // Re-label kept rows when the active locale changes; the catalog
        // itself does not rebuild on a locale switch.
        if (typeof locale?.subscribe === 'function') {
          const onLocaleChange = () => {
            version += 1
          }
          const disposeLocale = locale.subscribe(onLocaleChange)
          ctx.effect(() => () => {
            if (typeof disposeLocale === 'function') disposeLocale()
            else locale.unsubscribe?.(onLocaleChange)
          }, 'keep-new-session: locale label refresh')
        }
      } catch {
        // Labeling is cosmetic; the flip itself never needs the locale.
      }

      const rawGetSnapshot = list.getSnapshot
      loadKept()

      list.getSnapshot = function patchedGetSnapshot() {
        if (disposed) return rawGetSnapshot.call(this)
        const snap = rawGetSnapshot.call(this)
        if (snap?.byId === undefined) return snap

        // A blank session the user just left becomes kept. The main view's
        // retention writes always publish a new snapshot object, so the
        // transition is observed here on the first read after the switch.
        const current = currentIdOf(snap)
        if (current !== prevCurrent) {
          const previous = prevCurrent
          prevCurrent = current
          if (previous !== undefined && snap.byId[previous]?.blank === true) keep(previous)
        }

        return present(snap)
      }

      ctx.effect(
        () => () => {
          disposed = true
          list.getSnapshot = rawGetSnapshot
          kept = []
          version += 1
          prevCurrent = undefined
          viewSource = null
          viewVersion = -1
          view = null
          tWorkspace = null
        },
        'keep-new-session: snapshot view',
      )
    }

    return module.exports
  },
})
