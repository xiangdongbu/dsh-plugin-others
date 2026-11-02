/**
 * dsh-plugin-no-session-rename-dblclick — browser half.
 *
 * Root cause: the official sidebar (`@deepseek-ai/dsh-client-ui-workspace`)
 * renders every session row with `data-row-key="session:<id>"`, and its title
 * element (`span` whose class ends with `_title`) carries
 * `onDoubleClick → onRenameRequest(...)`. That React handler is the ONLY way
 * the rename dialog opens from the list; there is no config switch for it.
 *
 * Fix: intercept the native `dblclick` in the CAPTURE phase on `document` —
 * capture runs before React's delegated bubble listener, so calling
 * `stopPropagation()` there means the row's `onDoubleClick` never fires.
 * The interception is scoped narrowly:
 *   - only inside a session row (`[data-row-key^="session:"]`),
 *   - only on its title element (class list contains a `_title` class),
 *   - never on the row's action/overflow buttons or any nested control,
 *   - never on inputs/textareas/contenteditable (rename dialog, search box).
 *
 * Everything else keeps working: single click still opens the session, the
 * right-click menu still offers 「重命名」 (that path does not use dblclick),
 * and drag / hover / pin interactions are untouched. The listener is removed
 * when the plugin unmounts.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-no-session-rename-dblclick',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    /** The session row the event happened in, if any. */
    function sessionRowOf(target) {
      if (!(target instanceof Element)) return null
      const row = target.closest('[data-row-key^="session:"]')
      return row instanceof HTMLElement ? row : null
    }

    /** True for the row's own title element (hashed `_title` class). */
    function isSessionTitle(target, row) {
      if (!(target instanceof Element) || row === null) return false
      const title = target.closest('[class*="_title"]')
      if (!(title instanceof HTMLElement) || !row.contains(title)) return false
      // Only the row's own title span — not a title inside a nested widget.
      const classes = Array.from(title.classList)
      return classes.some((name) => name.endsWith('_title'))
    }

    /** Never swallow double-clicks aimed at editable or interactive controls. */
    function isProtectedTarget(target) {
      if (!(target instanceof Element)) return false
      return (
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !==
          null || target.closest('button, a[href], [role="button"], [role="menuitem"]') !== null
      )
    }

    const onDoubleClick = (event) => {
      const target = event.target
      if (isProtectedTarget(target)) return
      const row = sessionRowOf(target)
      if (row === null) return
      if (!isSessionTitle(target, row)) return
      // Capture phase runs before React's delegated listener: stopping here
      // keeps the row's onDoubleClick (rename) from ever being invoked.
      event.stopPropagation()
    }

    exports.apply = function apply(ctx) {
      if (typeof document === 'undefined') return
      document.addEventListener('dblclick', onDoubleClick, true)
      ctx.effect(
        () => () => {
          document.removeEventListener('dblclick', onDoubleClick, true)
        },
        'no-session-rename-dblclick: dblclick guard',
      )
    }

    return module.exports
  },
})
