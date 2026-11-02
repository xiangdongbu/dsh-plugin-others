# dsh-plugin-no-session-rename-dblclick

本地小修复插件：**去掉左侧栏会话标题的「双击重命名」手势**，其余行为保持不变。

## 为什么会有双击重命名

官方侧栏插件 `@deepseek-ai/dsh-client-ui-workspace` 在渲染会话行时，给标题 `span`
挂了 `onDoubleClick → onRenameRequest(...)`：

- 行容器带 `data-row-key="session:<id>"`；
- 标题是类名以 `_title` 结尾的 `span`；
- 双击它 → 弹出重命名对话框。

这是硬编码行为，**没有开关**，所以用一个小客户端插件拦掉。

## 做法

在 `document` 的 **捕获阶段** 监听原生 `dblclick`，命中「会话行 + 标题元素」时
`stopPropagation()`。捕获阶段先于 React 的委托监听器执行，因此该行的
`onDoubleClick` 不会触发，重命名对话框不弹。

拦截范围很窄：

- 只在 `[data-row-key^="session:"]` 会话行内；
- 只在该行自己的标题（`class` 含 `_title`）上；
- 不碰按钮 / 链接 / 菜单项；
- 不碰输入框、`textarea`、`contenteditable`（重命名对话框、搜索框等）。

因此：

- 单击仍然打开会话；
- **右键菜单里的「重命名」仍然可用**（那条路径不走双击）；
- 拖拽、悬停、置顶等交互不受影响。

## 安装（本地 link 进 desktop profile）

```sh
# 在 profile 目录里把本仓库作为本地依赖挂上
cd ~/.dsh/profiles/desktop
pnpm add link:/Users/bu/Documents/deepseek-harness/default-workspace/dsh-plugin-no-session-rename-dblclick
```

再把包名加进 `package.json` 的 `dsh.profile.bundles`（本包自带
`cordis.patch.yml`，插入一行即可），最后重启 App。

## 卸载

```sh
cd ~/.dsh/profiles/desktop
pnpm remove dsh-plugin-no-session-rename-dblclick
```

并从 `dsh.profile.bundles` 中移除该包名，重启 App。

## License

MIT
