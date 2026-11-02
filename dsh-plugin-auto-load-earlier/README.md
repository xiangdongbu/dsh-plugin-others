# dsh-plugin-auto-load-earlier

把对话视图顶部那颗「加载更早」按钮去掉，改为**滚到顶部时自动加载**上一页历史。

## 这颗按钮是怎么来的

宿主（`@deepseek-ai/dsh-client-ui-chat`）在会话历史未加载完时会渲染一行分页控件：

```jsx
hasMore && (
  <div className={ChatView_module_css_default.older}>
    <button type="button" disabled={loadingOlder} onClick={scroll.loadEarlier}>
      {loadingOlder ? t('loading') : t('chat.loadOlder')}   {/* 加载更早 / Load earlier */}
    </button>
  </div>
)
```

点击后走的是宿主自己的 `loadEarlier()`：

```js
loadEarlier = () => {
  this.cancel();                    // 取消进行中的跳转
  this.viewport.beginPaging();      // 记录分页锚点
  this.reading.pauseFollowing();    // 暂停「跟随最新」
  this.input.loadOlder();           // 拉上一页
}
```

也就是说，按钮只是宿主分页逻辑的一个触发入口：真正的翻页、锚点补偿（保持你当前正在读的位置不动）、`hasMore` 判断都在宿主内部。`loadingOlder` 期间按钮会被 `disabled`。

## 本插件做了什么

不去重写分页（那要猜宿主的内部 store），只做两件事：

1. **隐藏这一行**（容器 + 按钮），对话从内容开始，而不是从控件开始
2. **替用户点击那颗按钮**——滚到顶部（`scrollTop ≤ 96px`）时触发，于是宿主的锚点处理、`回到底部` 状态、`hasMore` 判断全部原样保留

另外，当转录内容还没撑满视口时也会自动加载：那种情况下根本没有可滚动区间，等滚动事件会永远等不到，老历史就再也看不到。内容一旦超出视口，自动加载就会停下（因为锚点补偿会把 `scrollTop` 推离顶部），所以你翻到的位置不会被抢走。

## 选择器为什么这样写

宿主的 CSS Module 哈希前缀会随版本变（当前是 `tnXGgG_older`），所以：

- 容器按 **class token `_older`** 匹配（`div[class*="_older"]`），并校验它有一个直接子 `<button>`
- 按钮按**文案**兜底匹配 i18n `chat.loadOlder`（`加载更早` / `Load earlier`）
- 每次 tick 都重新解析，因为 React 每次渲染都会替换按钮节点

滚动容器优先用宿主自己的稳定属性 `[data-conversation-scroll]`（宿主代码里同样是 `list.closest('[data-conversation-scroll]') ?? list`），没有时退回「最近的真正可滚动祖先」。

## 调参

`lib/client.js` 顶部常量：

| 常量 | 默认 | 含义 |
| --- | --- | --- |
| `TOP_ZONE_PX` | `96` | 距顶部多少像素内算「想看更早」 |
| `COOLDOWN_MS` | `400` | 两次自动翻页的最小间隔 |
| `MAX_CHAIN` | `60` | 连续自动翻页上限（防 `hasMore` 卡住时死循环） |
| `TICK_MS` | `120` | 滚动/变更事件合并成一次检查的节流窗口 |

## 安装

```sh
dsh plugin --profile desktop add "git+ssh://git@github.com/xiangdongbu/dsh-plugin-others.git#path:/dsh-plugin-auto-load-earlier"
```

## 卸载

```sh
dsh plugin --profile desktop remove dsh-plugin-auto-load-earlier
```

卸载后按钮会恢复显示，滚动不再自动翻页。

## 注意

- 本插件依赖宿主的 DOM 结构（`_older` 行 + 文案）。宿主大改版式时如果按钮不再出现，先看 `lib/client.js` 的 `findOlderButton` 是否还能命中；文案变了就往 `LABELS` 里加。
- 自动翻页只在「已在顶部」时发生，不会在会话打开时把全部历史一次性拉完（短转录除外，见上）。
