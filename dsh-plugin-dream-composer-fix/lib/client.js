/**
 * dsh-plugin-dream-composer-fix — browser half.
 *
 * Adds a subtle theme-colored light layer on top of dsh-dream-skin's composer
 * fill so the main chat input reads as a distinct surface instead of melting
 * into the wallpaper. Scoped to Dream Skin's dark scheme; other themes (and
 * Dream Skin's own opacity slider + backdrop blur) remain untouched.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-dream-composer-fix',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const STYLE_ID = 'dsh-plugin-dream-composer-fix-style'
    const CSS_TEXT = `
html[data-dsh-dream-skin-scheme="dark"] [data-composer-card]::before {
  background:
    linear-gradient(
      color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent),
      color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent)
    ),
    color-mix(
      in srgb,
      var(--dsh-dream-skin-glass-tint, var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base)))
        var(--dsh-dream-skin-composer-fill, 85%),
      transparent
    ) !important;
}
`

    function ensureStyle() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID) !== null) return
      const tag = document.createElement('style')
      tag.id = STYLE_ID
      tag.dataset.plugin = 'dsh-plugin-dream-composer-fix'
      tag.textContent = CSS_TEXT
      document.head.appendChild(tag)
    }

    exports.apply = function apply(ctx) {
      if (typeof document === 'undefined') return
      ensureStyle()
      ctx.effect(() => () => {
        const tag = document.getElementById(STYLE_ID)
        if (tag !== null) tag.remove()
      }, 'dream-composer-fix: stylesheet')
    }

    return module.exports
  },
})
