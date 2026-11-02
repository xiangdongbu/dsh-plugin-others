/**
 * dsh-plugin-dream-skin-fix — browser half.
 *
 * Two independent stylesheet overrides for dsh-dream-skin, merged into one
 * plugin (they were `dsh-plugin-dream-composer-fix` and
 * `dsh-plugin-statusbar-overlap-fix`). Each fix keeps its own <style> tag so
 * they can be reasoned about, and removed, separately.
 *
 * 1) Composer background lift — dream-skin paints the main composer via
 *    `[data-composer-card]::before` with a fill whose base color (#131116) is
 *    nearly the same as the dark page background, so the input area melts into
 *    the wallpaper. We stack a 10% `--dsw-alias-label-primary` layer on top of
 *    the original base/fill layer: the card becomes lighter but stays tinted,
 *    still follows dream-skin's own opacity slider, and is scoped to the dark
 *    scheme only.
 *
 * 2) Composer-seat scrim — the seat fades to `var(--dsw-alias-bg-base)` over
 *    36px so chat text appears to slide underneath it. dream-skin rewrites
 *    that token to an alpha-washed color and drops the composer card's own
 *    background, so the scrim ends translucent and the status pills
 *    (token usage / performance stats) float over chat text. We swap the
 *    color to `--dsh-dream-skin-composer-base`, dream-skin's opaque variant of
 *    the same color; without dream-skin it resolves to the vanilla token, so
 *    stock themes are a visual no-op. The fade shape, z-index layering, the
 *    "/" trigger-menu elevation and the glass card are untouched, and the rule
 *    stays phase-scoped like the vanilla seat rule (the centered hero screen
 *    remains unpainted).
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-dream-skin-fix',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const PLUGIN = 'dsh-plugin-dream-skin-fix'

    const COMPOSER_STYLE_ID = `${PLUGIN}-composer-style`
    const COMPOSER_CSS = `
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

    const SCRIM_STYLE_ID = `${PLUGIN}-scrim-style`
    const SCRIM_BASE =
      'var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base))'
    const SCRIM_CSS = `
[data-phase="active"] [data-composer-seat],
[data-content-phase="active"] [data-composer-seat] {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, ${SCRIM_BASE} 0%, transparent) 0px,
    ${SCRIM_BASE} 36px
  ) !important;
}
`

    function ensureStyle(id, css) {
      if (typeof document === 'undefined') return
      if (document.getElementById(id) !== null) return
      const tag = document.createElement('style')
      tag.id = id
      tag.dataset.plugin = PLUGIN
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function dropStyle(id) {
      if (typeof document === 'undefined') return
      const tag = document.getElementById(id)
      if (tag !== null) tag.remove()
    }

    exports.apply = function apply(ctx) {
      if (typeof document === 'undefined') return
      ensureStyle(COMPOSER_STYLE_ID, COMPOSER_CSS)
      ensureStyle(SCRIM_STYLE_ID, SCRIM_CSS)
      ctx.effect(() => () => dropStyle(COMPOSER_STYLE_ID), 'dream-skin-fix: composer background')
      ctx.effect(() => () => dropStyle(SCRIM_STYLE_ID), 'dream-skin-fix: composer seat scrim')
    }

    return module.exports
  },
})
