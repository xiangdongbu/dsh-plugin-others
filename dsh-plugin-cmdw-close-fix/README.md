# dsh-plugin-cmdw-close-fix

本地运行时修复插件：在 macOS Desktop 上，右侧边栏已展开时按 **⌘W**，即使当前焦点还在左侧
列表/对话里，也应关闭右侧活动标签，而不是直接关闭 DeepSeek Harness 窗口。

## 根因

DSH 官方 `@deepseek-ai/dsh-client-ui-sidebar-right` 注册的 `page.close`（⌘W）命令：

- 先用 `sidebar.focusedTarget(element)` 找“当前焦点所在的右侧页面”；
- 如果焦点不在右侧边栏内，返回 `undefined`；
- 在 Desktop 运行时下，`target === undefined` 会走兜底：`closeWindow()`，即关闭 App 窗口。

所以“点列表打开右侧面板后、不点右侧内容就按 ⌘W”会关掉整个程序；先点一下右侧内容后焦点
进入侧栏，才会走 `closeTarget(target)` 关闭标签。

## 修复方式

本插件不修改官方包，只在运行时包装 `page.close` 命令的 `resolve`：

```js
if (右侧边栏已展开 && 焦点不在右侧边栏) {
  const target = sidebar.commandTarget(element) // 官方已有的“外部打开时找活动面板”方法
  if (target && sidebar.canCloseTarget(target)) {
    return { status: 'handled', run: () => sidebar.closeTarget(target) }
  }
}
return originalResolve(context)
```

- 只在右侧边栏**已展开**时生效；没有右侧面板时 ⌘W 仍是原行为；
- 只影响 `page.close`，不改变 ⌘R 等其他快捷键；
- 卸载插件即恢复官方行为。

## 安装 / 卸载

```sh
dsh plugin --profile desktop add link:/absolute/path/to/dsh-plugin-cmdw-close-fix
dsh plugin --profile desktop remove dsh-plugin-cmdw-close-fix
```
