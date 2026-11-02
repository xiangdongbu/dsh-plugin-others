/**
 * dsh-plugin-cmdw-close-fix — browser half.
 *
 * Wraps the official `page.close` command so that, while the right sidebar is
 * expanded, a Cmd+W whose focus is still outside the sidebar closes the active
 * right-sidebar tab instead of falling through to the desktop "close window"
 * path.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-cmdw-close-fix',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    exports.inject = ['shortcuts', 'sidebarRight']

    exports.apply = function apply(ctx) {
      const shortcuts = ctx.shortcuts
      const sidebar = ctx.sidebarRight
      const registry = shortcuts === undefined ? undefined : shortcuts.registry
      if (shortcuts === undefined || sidebar === undefined) return

      const originalResolve = new WeakMap()
      let patchedCommand = null

      const tryPatch = () => {
        const commands = registry === undefined ? undefined : registry.commands
        if (commands === undefined || typeof commands.get !== 'function') return false
        const command = commands.get('page.close')
        if (command === undefined || typeof command.resolve !== 'function') return false
        if (command.__dshCmdwCloseFix === true) return true

        const resolve = command.resolve
        originalResolve.set(command, resolve)
        const patchedResolve = (context) => {
          const element = context === undefined ? undefined : context.target
          try {
            const expanded = typeof sidebar.isExpanded === 'function' && sidebar.isExpanded() === true
            if (expanded) {
              const focused = typeof sidebar.focusedTarget === 'function'
                ? sidebar.focusedTarget(element)
                : undefined
              if (focused === undefined && typeof sidebar.commandTarget === 'function') {
                const target = sidebar.commandTarget(element)
                if (target !== undefined && typeof sidebar.canCloseTarget === 'function' && sidebar.canCloseTarget(target)) {
                  return {
                    status: 'handled',
                    run: () => {
                      if (typeof sidebar.isTargetCurrent === 'function' && sidebar.isTargetCurrent(target) !== true) return
                      sidebar.closeTarget(target)
                    },
                  }
                }
              }
            }
          } catch {
            // Any mismatch in the host API falls back to the official behavior.
          }
          return resolve(context)
        }

        command.resolve = patchedResolve
        command.__dshCmdwCloseFix = true
        patchedCommand = command
        window.__dshCmdwCloseFix = { patched: true, commandId: 'page.close' }
        return true
      }

      // `page.close` is registered by the sidebar-right plugin; allow a short
      // retry in case this bundle's apply happens between its service
      // provisioning and its command registration.
      if (!tryPatch()) {
        let tries = 0
        const retry = setInterval(() => {
          tries += 1
          if (tryPatch() || tries >= 40) clearInterval(retry)
        }, 100)
        ctx.effect(() => () => clearInterval(retry), 'cmdw-close-fix: retry')
      }

      ctx.effect(() => () => {
        const command = patchedCommand
        if (command === null || command.__dshCmdwCloseFix !== true) return
        const resolve = originalResolve.get(command)
        if (resolve !== undefined) command.resolve = resolve
        delete command.__dshCmdwCloseFix
        patchedCommand = null
        delete window.__dshCmdwCloseFix
      }, 'cmdw-close-fix: page.close fallback')
    }

    return module.exports
  },
})
