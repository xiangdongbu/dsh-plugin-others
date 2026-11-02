# dsh-plugin-statusbar-overlap-fix

Local CSS override plugin: makes the bottom status bar of the chat composer
readable again.

## Problem

With **dsh-dream-skin** active, the composer seat's bottom scrim fades from
transparent into `var(--dsw-alias-bg-base)` — but the wallpaper wash rewrites
that token to an alpha-washed color, and dream-skin also drops the composer
card's own background. The status pills (`40M tok · 缓存命中 98% · …` /
`0.5s · 221 步 · 145 tok/s`) then float over scrolling chat text with no
backdrop and become illegible.

## Fix

Rebuilds the seat's scrim gradient with
`var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base))` — dream-skin's
opaque variant of the same color. The vanilla fade shape, z-index layering,
trigger-menu elevation and glass composer card are untouched; without
dream-skin the rule resolves to the same vanilla token (no-op).

## Install

```sh
dsh plugin --profile desktop add link:/Users/bu/Documents/deepseek-harness/default-workspace/dsh-plugin-statusbar-overlap-fix
```

Remove:

```sh
dsh plugin --profile desktop remove dsh-plugin-statusbar-overlap-fix
```
