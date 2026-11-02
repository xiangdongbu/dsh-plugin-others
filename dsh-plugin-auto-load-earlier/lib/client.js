/**
 * dsh-plugin-auto-load-earlier — browser half.
 *
 * The chat view renders its history pager as a React button:
 *
 *   <div class="tnXGgG_older"><button onClick={scroll.loadEarlier}>加载更早</button></div>
 *
 * `loadEarlier()` is the host's own action — it calls `viewport.beginPaging()`,
 * `reading.pauseFollowing()` and `input.loadOlder()`, i.e. the anchor-preserving
 * page fetch. Reimplementing paging would mean guessing at the host's internal
 * stores, so this plugin does the two things a reader actually wants instead:
 *
 * 1. Hides the row (both the container and the button) so the transcript starts
 *    with content, not a control.
 * 2. Clicks that same button for the user when the scroller is at the top —
 *    which keeps every bit of the host's anchor handling, "回到底部" state and
 *    hasMore gating intact.
 *
 * It also fires when the transcript still fits the viewport: there is nothing to
 * scroll at that point, so waiting for a scroll event would leave older history
 * unreachable. Loading stops by itself as soon as the content overflows.
 *
 * Selectors: the host's CSS-module hash changes between versions
 * (`tnXGgG_older` today), so the container is matched by the `_older` class
 * token and the button by its locale label (`chat.loadOlder` = 加载更早 /
 * Load earlier). Both are re-resolved on every tick, because React replaces the
 * button on each render.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-auto-load-earlier',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const PLUGIN = 'dsh-plugin-auto-load-earlier'
    const STYLE_ID = `${PLUGIN}-style`
    const HIDDEN_ATTR = 'data-dsh-auto-earlier-hidden'
    const CSS_TEXT = `
div[class*="_older"]:has(> button) { display: none !important; }
[${HIDDEN_ATTR}] { display: none !important; }
`

    /** `chat.loadOlder` in every locale we have labels for. */
    const LABELS = ['加载更早', 'Load earlier']
    /** How close to the top counts as "wants older history". */
    const TOP_ZONE_PX = 96
    /** Minimum gap between two programmatic clicks. */
    const COOLDOWN_MS = 400
    /** Hard stop for short transcripts so a stuck `hasMore` cannot spin. */
    const MAX_CHAIN = 60
    /** Scroll events fire in bursts; collapse them into one tick. */
    const TICK_MS = 120

    let timer = 0
    let lastClickAt = 0
    let chain = 0
    let lastHeight = -1

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID) !== null) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.dataset.plugin = PLUGIN
      tag.textContent = CSS_TEXT
      document.head.appendChild(tag)
    }

    function dropStyle() {
      if (typeof document === 'undefined') return
      const tag = document.getElementById(STYLE_ID)
      if (tag !== null) tag.remove()
    }

    function labelOf(node) {
      return (node.textContent || '').trim()
    }

    /**
     * The pager button, resolved structurally first and by label as a fallback
     * (the row's class hash is version-dependent; the label is not).
     */
    function findOlderButton() {
      if (typeof document === 'undefined') return null
      const boxes = document.querySelectorAll('div[class*="_older"]')
      for (const box of boxes) {
        for (const child of box.children) {
          if (child.tagName !== 'BUTTON') continue
          if (LABELS.includes(labelOf(child))) return child
        }
      }
      const buttons = document.querySelectorAll('button')
      for (const btn of buttons) {
        if (LABELS.includes(labelOf(btn))) return btn
      }
      return null
    }

    /** Hide the whole row, not just the button, so no empty gap is left behind. */
    function markHidden(btn) {
      const box = btn.closest('div[class*="_older"]')
      if (box !== null && box.getAttribute(HIDDEN_ATTR) === null) {
        box.setAttribute(HIDDEN_ATTR, '')
      }
    }

    /**
     * The scroller that owns the button. The host itself resolves it as
     * `list.closest('[data-conversation-scroll]') ?? list`; the fallback here
     * walks up to the first ancestor that actually scrolls.
     */
    function scrollportOf(btn) {
      const explicit = btn.closest('[data-conversation-scroll]')
      if (explicit !== null) return explicit
      let node = btn.parentElement
      while (node !== null) {
        const style =
          typeof getComputedStyle === 'function' ? getComputedStyle(node) : null
        const overflowY = style === null ? '' : style.overflowY
        const scrollable = /(auto|scroll)/.test(overflowY)
        if (scrollable && node.scrollHeight > node.clientHeight + 2) return node
        node = node.parentElement
      }
      return null
    }

    function tick() {
      timer = 0
      const btn = findOlderButton()
      if (btn === null) return
      markHidden(btn)
      if (btn.disabled) return

      const scroller = scrollportOf(btn)
      if (scroller === null) return

      if (scroller.scrollTop > TOP_ZONE_PX) {
        chain = 0
        return
      }

      // Short transcript: nothing to scroll toward, so keep filling until the
      // content overflows the viewport (or the hard stop is hit).
      const overflowing = scroller.scrollHeight > scroller.clientHeight + 4
      if (overflowing && scroller.scrollTop > TOP_ZONE_PX) return

      const now = Date.now()
      if (now - lastClickAt < COOLDOWN_MS) return
      // A page that changed nothing means the last fetch is still in flight.
      if (chain > 0 && scroller.scrollHeight === lastHeight) return
      if (chain >= MAX_CHAIN) return

      chain += 1
      lastClickAt = now
      lastHeight = scroller.scrollHeight
      btn.click()
    }

    function schedule() {
      if (timer !== 0) return
      timer = setTimeout(tick, TICK_MS)
    }

    exports.apply = function apply(ctx) {
      if (typeof document === 'undefined') return
      ensureStyle()

      // Scroll events do not bubble, but a capture-phase listener still sees
      // them from any descendant scroller.
      const onScroll = () => schedule()
      document.addEventListener('scroll', onScroll, true)

      let observer = null
      if (typeof MutationObserver === 'function' && document.body !== null) {
        observer = new MutationObserver(() => schedule())
        observer.observe(document.body, { childList: true, subtree: true })
      }

      schedule()

      ctx.effect(() => () => {
        document.removeEventListener('scroll', onScroll, true)
        if (observer !== null) observer.disconnect()
        if (timer !== 0) {
          clearTimeout(timer)
          timer = 0
        }
        chain = 0
        lastClickAt = 0
        lastHeight = -1
        dropStyle()
      }, 'auto-load-earlier: auto pager')
    }

    return module.exports
  },
})
