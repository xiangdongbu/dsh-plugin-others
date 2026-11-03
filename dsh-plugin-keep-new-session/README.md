# dsh-plugin-keep-new-session

**新建的会话切走后不再从侧栏消失，且消息发出前始终是同一条**：点「新建对话」出现的那个「新会话」tab，切到别的会话再回来时仍然在列表里；此时再点「新建对话」会**回到同一条空会话**，不会越点越多。发出第一条消息后它变成普通会话，下次「新建对话」才开新的。不要了走行上已有的「…」/右键菜单里的「删除」（进回收站），与其他会话完全一致。

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
- **保留清单持久化在 localStorage**，App 重启后这些会话仍然可见；会话被删除、或
  确定已发出过消息（见下节）后自动从清单里清掉。
- 列表标签沿用宿主的 i18n「新会话」（经 locale 服务取词，取不到时退回「未命名」）。

## 消息发出前，「新建对话」始终复用同一条

视图翻转把保留的空会话呈现成了普通会话，而宿主的草稿复用扫描（`createInWorkspace`）
只认 `blank` 摘要字段——不处理的话，每点一次「新建对话」都会新开一条，保留的空会话
越积越多。所以本插件同时包住了 `uiWorkspace.createInWorkspace`，把宿主的扫描条件
原样放宽一条：**保留清单里的会话，只要还没发出过消息，也参与复用**。

「还没发出过消息」不看可被翻转的 `blank` 字段（它会被前面说的两处写回搅浑），而看
宿主自己的投影元数据 `projectionValues.sessionListMetadata`（`blank` /
`lastPromptAt`，来自会话日志的折叠前缀，schema 描述原文："Whether the folded
prefix contains no turn"）：发出过提示词的会话必然 `blank === false` 且
`lastPromptAt != null`。这个字段不经过视图翻转、也不被 `set` 克隆破坏，可以放心
作准；投影还没读过的会话按「未发过」处理（发消息前必须先打开会话，打开即会读投影）。

由此每个工作区同时至多存在一条「消息未发」的草稿：

1. 新建对话 → 创建 B1（该工作区没有可复用的空会话时）；
2. 切走 → B1 进保留清单，留在侧栏；
3. 再点新建对话 → **复用 B1**（跳回同一条，不新建）；
4. 在 B1 里发出第一条消息 → B1 变普通会话（有真实标题/内容）；
5. 此时新建对话 → 创建 B2，回到步骤 2 的循环。

删掉草稿、或草稿发了消息之后，才可能产生下一条空会话——「多个新对话」不会堆积。

## 两个有意接受的行为变化

1. 保留的空会话按普通未命名会话参与排序/置顶/多选/归档，行尾也会显示时间等普通
   会话才有的信息；再次点「新建对话」跳回它时，它按最近更新排在分组靠前的位置，
   不再像原生 blank 草稿那样固定置顶。
2. 保留的空会话因此变得**可重命名**（原生对 blank 会话禁用了重命名）——右键
   「重命名」给它起个名字，它就成了普通的已命名会话。

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

- 本插件依赖宿主 `dsh-client-ui-workspace` 的三处内部约定：会话目录快照
  store（`sessions.list`）的字段形态（`ids` / `byId` / 摘要上的 `blank`、
  `retainedBy`、`projectionValues`）、`mainSessionId` 用 `mainView` 保留计数判定
  当前会话，以及 `createInWorkspace` / `createNamed` 的草稿复用扫描。宿主大版本
  改动这些结构时，插件最差是「不生效」——视图原样返回、复用回退到宿主原生扫描
  （表现退回「切走即消失」），不会崩：所有读取都有 `undefined` 兜底，扫描拿不到
  预期形状就整体转交原方法。
- 与 `dsh-better-sidebar` 兼容：它的会话面板读的是同一个 `sessions.list` store。
- 清理积攒的空会话：装上插件后，历史上 Host 留下的 blank 会话在**被打开过一次**
  之前不会突然全冒出来（只有你真正切走的那条会保留）；想清掉某条，右键「删除」即可。
- 想让每次「新建对话」都各开一条（不合并草稿）的话：把保留的那条重命名或先发一句
  消息即可，扫描立刻放行下一条新草稿。
