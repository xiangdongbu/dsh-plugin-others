/**
 * dsh-plugin-statusbar-overlap-fix — browser half.
 *
 * Rebuilds the composer seat's bottom scrim with an OPAQUE base color.
 *
 * Root cause: the vanilla seat fades from transparent to
 * `var(--dsw-alias-bg-base)` over 36px so chat text appears to slide
 * underneath it. dsh-dream-skin's wallpaper wash rewrites
 * `--dsw-alias-bg-base` to an alpha-washed color, and dream-skin
 * intentionally drops the composer card's own background, so the seat scrim
 * ends translucent — the status pills (token usage / performance stats) then
 * float directly over chat text and become illegible.
 *
 * Fix: swap the gradient's color token to
 * `--dsh-dream-skin-composer-base`, the OPAQUE variant of the same color
 * that dream-skin already publishes for exactly this purpose. Without
 * dream-skin the fallback resolves to the same vanilla token, making this a
 * visual no-op for stock themes. The fade shape, z-index layering, the
 * "/" trigger-menu elevation and dream-skin's glass composer card are all
 * left untouched. The rule is phase-scoped (`[data-phase=active]` /
 * `[data-content-phase=active]`) to mirror the vanilla seat rule, so the
 * centered hero screen stays unpainted.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-statusbar-overlap-fix',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const STYLE_ID = 'dsh-plugin-statusbar-overlap-fix-style'
    const BASE =
      'var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base))'
    const CSS_TEXT = `
[data-phase="active"] [data-composer-seat],
[data-content-phase="active"] [data-composer-seat] {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, ${BASE} 0%, transparent) 0px,
    ${BASE} 36px
  ) !important;
}
`

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID) !== null) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.dataset.plugin = 'dsh-plugin-statusbar-overlap-fix'
      tag.textContent = CSS_TEXT
      document.head.appendChild(tag)
    }

    exports.apply = function apply(ctx) {
      if (typeof document === 'undefined') return
      ensureStyle()
      ctx.effect(() => () => {
        const tag = document.getElementById(STYLE_ID)
        if (tag !== null) tag.remove()
      }, 'statusbar-overlap-fix: stylesheet')
    }

    return module.exports
  },
})
