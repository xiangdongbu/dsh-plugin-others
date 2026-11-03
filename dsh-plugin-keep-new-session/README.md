# dsh-plugin-keep-new-session

**新建的会话切走后不再从侧栏消失**：点「新建对话」出现的那个「新会话」tab，切到别的会话再回来时仍然在列表里，可以随时点开继续用；不要了就走行上已有的「…」/右键菜单里的「删除」（进回收站），与其他会话完全一致。

## 为什么新会话会消失

新建的对话是一个 **blank 会话**——日志里还没有任何 turn。官方侧栏插件
`@deepseek-ai/dsh-client-ui-workspace` 在推导可见行时，只展示「当前选中」的那一个
blank 会话：

```js
function sessionVisible(session, current, archived, archivedFilter) {
  if (session.origin === "subagent") return false;
  if (session.blank && session.id !== current) return false;   // ← 就是这一行
  ...
}
```

所以一旦切到别的会话（`current` 变了），这个 blank 会话就被过滤出列表。
**它并没有被删除**：Host 会一直留着 blank 会话，下一次点「新建对话」时还会优先复用
它（`createInWorkspace` 里按 `summary.blank` 找第一个可复用的）。消失只是列表层的
展示策略，没有开关。

## 本插件做了什么

包住客户端会话目录的快照 store（`ctx.uiWorkspace.sessions.list`），把**用户打开过、
又切走了的** blank 会话在快照视图里呈现成普通会话（`blank` → `false`）。这样下游的
可见性过滤、排序、行的「…」/右键菜单（含 `@xrn1997/dsh-session-delete` 注入的
「删除」）全都把它当成一条普通的未命名会话：留在列表里、可以点开、可以用原生的
「删除」删掉。**本插件不做自己的删除入口**，删除就是截图里那颗。

细节：

- **只翻转视图，不写宿主状态**。包住的 `getSnapshot` 以（原始快照对象、清单版本号）
  做记忆化，保证 React `useSyncExternalStore` 在两次渲染之间拿到稳定的快照对象；
  宿主自己的保留计数写入（`publishRetention` → `list.set`）读到的视图会被 `set`
  克隆落回原始状态，下一次投影重建又会还原原始行、视图再叠一次翻转——幂等，无回环。
- **「打开过」的判定**与宿主自己的 `mainSessionId` 完全一致：`retainedBy.mainView > 0`
  的那一条。当前选中的 id 发生变化时，若前一个仍是 blank，就收进保留清单。
- **保留清单持久化在 localStorage**，App 重启后这些会话仍然可见；会话被删除后会
  自动从清单里清掉（清单里可能残留几条已经产生 turn 的 id，无害——翻转条件只认
  `blank === true` 的行）。
- 列表标签沿用宿主的 i18n「新会话」（经 locale 服务取词，取不到时退回「未命名」）。

## 两个有意接受的行为变化

1. 保留的 blank 会话**不再充当「新建对话」的草稿**：宿主复用草稿时只认 `blank`
   摘要，翻转后每次点「新建对话」都会开一个全新的空会话，而不是跳回旧的那条——
   旧的留在原地，正好符合「切走不消失」的预期。
2. 保留的 blank 会话按普通未命名会话参与排序/置顶/多选/归档，行尾也会显示时间等
   普通会话才有的信息。

## 安装

- **market「从 GitHub 安装」**：填 `xiangdongbu/dsh-plugin-others`，market 会自动
  展开安装合集里的全部插件。
- **单独安装本插件**：

  ```sh
  dsh plugin --profile desktop add "git+ssh://git@github.com/xiangdongbu/dsh-plugin-others.git#path:/dsh-plugin-keep-new-session"
  ```

- **手动**：把目录拷贝（或软链）到 `~/.dsh/profiles/desktop/node_modules/`，并把包名
  加进该 profile `package.json` 的 `dsh.profile.bundles`，重启 App。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-plugin-keep-new-session
```

卸载后侧栏恢复宿主默认行为：未选中的 blank 会话重新被隐藏（它们仍在 Host 里，
下次「新建对话」会照旧复用）。保留清单留在 localStorage
（`dsh-plugin-keep-new-session:kept`），不放心可以手动清掉。

## 注意

- 本插件依赖宿主 `dsh-client-ui-workspace` 的两处内部约定：会话目录快照
  store（`sessions.list`）的字段形态（`ids` / `byId` / 摘要上的 `blank`、
  `retainedBy`），以及 `mainSessionId` 用 `mainView` 保留计数判定当前会话。宿主
  大版本改动这些结构时，插件最差是「不生效」（视图原样返回），不会崩——所有读取
  都有 `undefined` 兜底。
- 与 `dsh-better-sidebar` 兼容：它的会话面板读的是同一个 `sessions.list` store。
- 清理积攒的空会话：装上插件后，历史上 Host 留下的 blank 会话在**被打开过一次**
  之前不会突然全冒出来（只有你真正切走的那条会保留）；想清掉某条，右键「删除」即可。
