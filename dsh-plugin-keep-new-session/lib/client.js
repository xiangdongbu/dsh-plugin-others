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
 * Reuse: the host picks the new-chat draft by scanning for a `blank` summary
 * (`createInWorkspace`), a scan the flipped view would make it fail — every
 * click of 新建对话 would mint a fresh session and kept blanks would pile up.
 * So `uiWorkspace.createInWorkspace` is wrapped with the same scan extended by
 * one predicate: a kept id also qualifies while it is still message-less,
 * judged by the Host's own projection metadata
 * (`projectionValues.sessionListMetadata.blank / .lastPromptAt`). Until the
 * first prompt is sent, 新建对话 therefore lands back on the same session —
 * one message-less draft per workspace; after the first prompt the session is
 * ordinary and the next 新建对话 starts a fresh one. The metadata rides in the
 * summary untouched by both the view flip and the retention-write clone, so
 * it disambiguates "still blank" from the flip itself.
 *
 * The flip is view-only and safe by construction:
 *   - the wrapped `getSnapshot` memoizes on (raw snapshot identity, set
 *     version), so React's `useSyncExternalStore` keeps one stable snapshot
 *     identity between renders;
 *   - the raw Host state is never written by this plugin. Host retention
 *     writes that read the view flow back through `list.set`, which detaches
 *     a clone; the next projection rebuild restores the raw row and the view
 *     re-applies the flip — idempotent, no feedback loop;
 *   - a kept id leaves the set when its session disappears (deleted) or has
 *     definitively grown a real turn (confirmed by the Host projection
 *     metadata, which the retention-write clone never alters); until then a
 *     stale id is harmless — the flip only matches `blank === true` rows and
 *     the reuse scan re-checks message-lessness on every call.
 *
 * "Visited" tracking mirrors the host's own current-session probe
 * (`mainSessionId`): the one summary whose `retainedBy.mainView` is positive.
 * When that id changes and the previous one still reads blank, it is kept.
 * The set persists in localStorage, so kept sessions survive app restarts.
 *
 * Two accepted behavior changes, both deliberate:
 *   - a kept blank shows the localized 「新会话」 label (through the locale
 *     service, falling back to the untitled label when unavailable);
 *   - while it stays message-less it is also the new-chat draft again (the
 *     wrapped `createInWorkspace` reuses it), so clicking 新建对话 returns to
 *     it instead of accumulating look-alike rows.
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

    /**
     * Whether the session is still message-less, judged by the Host's own
     * projection metadata rather than the (view-flippable) `blank` summary
     * field: a session with a sent prompt reports `sessionListMetadata.blank
     * === false` / a non-null `lastPromptAt`. Unread projections count as
     * message-less — a session cannot take a prompt without having been
     * opened, and opening materializes its projections.
     */
    function stillMessageLess(summary) {
      const metadata = summary?.projectionValues?.sessionListMetadata
      return metadata?.blank !== false && metadata?.lastPromptAt == null
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
      // Prune kept ids whose session is gone, or that has definitively grown
      // a real turn. The turn check needs BOTH signals because the host's
      // retention writes may transiently carry this view's own flip back
      // into the raw state (getSnapshot → list.set clone), so a raw
      // `blank === false` alone does not prove a prompt was sent; the
      // projection metadata, however, rides through that clone untouched,
      // and its blank/lastPromptAt never lie. A still-blank kept session
      // stays in the set so it keeps being visible and reusable.
      let pruned = false
      for (const id of [...kept]) {
        const row = snap.byId[id]
        const reallyStarted = row !== undefined && row.blank === false && !stillMessageLess(row)
        if (row === undefined || reallyStarted) {
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

    /**
     * The host's new-chat draft scan (`createInWorkspace`), extended so a
     * kept session qualifies while it is still message-less. Mirrors the
     * host predicate field for field — first reusable member blank, in list
     * order, matching the workspace path, unarchived, preset-compatible —
     * with `summary.blank` widened to `blank || (kept && stillMessageLess)`.
     * Returns `undefined` when no member qualifies (create a fresh session)
     * and `null` when the scan cannot run safely (unexpected shapes); the
     * caller then falls back to the untouched host method.
     */
    function findReusableBlank(ui, workspace, options) {
      const sessions = ui.sessions?.list?.getSnapshot()
      const workspaces = ui.workspaces?.list?.getSnapshot()
      if (
        sessions === undefined ||
        workspaces === undefined ||
        !Array.isArray(sessions.ids) ||
        sessions.byId === undefined ||
        !Array.isArray(workspaces.archivedSessionIds) ||
        workspace === null ||
        typeof workspace !== 'object' ||
        typeof workspace.workspaceId !== 'string' ||
        typeof workspace.path !== 'string' ||
        !Array.isArray(workspace.sessionIds)
      ) {
        return null
      }
      const preset = options?.agentPreset
      return (
        sessions.ids.find((id) => {
          const summary = sessions.byId[id]
          if (summary === undefined) return false
          const listed = summary.projectionValues?.agentPreset
          const reusableBlank =
            summary.blank === true || (kept.includes(id) && stillMessageLess(summary))
          return (
            reusableBlank &&
            summary.cwd === workspace.path &&
            workspace.sessionIds.includes(id) &&
            !workspaces.archivedSessionIds.includes(id) &&
            (preset === undefined || typeof listed !== 'string' || listed === preset)
          )
        }) ?? null
      )
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

      // Reuse: widen the host's draft scan so a kept session — presented
      // non-blank by the view above — is picked again while no prompt has
      // been sent. With this, 新建对话 cycles back to the same message-less
      // session instead of minting one per click; after the first prompt the
      // session leaves the scan and the next click starts a fresh draft.
      const originalCreateInWorkspace =
        typeof ui.createInWorkspace === 'function' ? ui.createInWorkspace : null
      const canPatch =
        originalCreateInWorkspace !== null && typeof ui.createNamed === 'function'
      if (canPatch) {
        ui.createInWorkspace = function patchedCreateInWorkspace(workspace, options) {
          // `null` = scan could not run safely → untouched host behavior;
          // `undefined` = no reusable member → create a fresh session.
          const blank = findReusableBlank(ui, workspace, options)
          if (blank === null) return originalCreateInWorkspace.call(this, workspace, options)
          const preset = options?.agentPreset
          return ui.createNamed({
            workspaceId: workspace.workspaceId,
            ...blank === undefined ? {} : { sessionId: blank },
            ...preset === undefined ? {} : { agentPreset: preset },
          })
        }
      }

      ctx.effect(
        () => () => {
          disposed = true
          list.getSnapshot = rawGetSnapshot
          if (canPatch) ui.createInWorkspace = originalCreateInWorkspace
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
