# dsh-plugin-dream-skin-fix

`dsh-dream-skin` 的两处可读性修复，合并为一个插件（原 `dsh-plugin-dream-composer-fix` +
`dsh-plugin-statusbar-overlap-fix`）。不修改 dream-skin 本体，只在其之上追加两份独立的
`<style>`，卸载即全部移除。

| 修复 | 解决的问题 |
| --- | --- |
| 输入框背景提亮 | 深色主题下主 composer 填充基色 `#131116` 与页面底色几乎一致，输入区融进壁纸 |
| 底部状态栏遮挡 | seat 底部渐变用的是被壁纸冲淡的 `--dsw-alias-bg-base`，状态栏药丸（token 用量 / 性能统计）浮在对话文字上不可读 |

## 1. 输入框背景提亮

Dream Skin 的 composer 填充由 `[data-composer-card]::before` 绘制，默认 base 与深色页面底色
过于接近。本插件在原有 base/fill 层之上叠一层 `--dsw-alias-label-primary` 的 10% 透明色：

```css
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
```

- 输入框变浅、边界清晰，但不会变成刺眼的纯灰块
- 仍然跟随 Dream Skin 的「输入框透明度」滑杆
- 换浅色主题或卸载 Dream Skin 时不生效 / 自动失效

## 2. 底部状态栏遮挡

把 composer seat 底部渐变的颜色 token 换成 `--dsh-dream-skin-composer-base`——dream-skin 为
这个用途专门发布的**不透明**变体；没有 dream-skin 时回落到原 token，对原生主题是 no-op。

```css
[data-phase="active"] [data-composer-seat],
[data-content-phase="active"] [data-composer-seat] {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base)) 0%, transparent) 0px,
    var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base)) 36px
  ) !important;
}
```

渐变形状、层级、`/` 触发菜单的浮起和 dream-skin 的玻璃卡片都保持不变；规则与原生一样只在
`active` 阶段生效，所以居中的欢迎页不会被涂色。

## 安装

从合集仓库单独装（`#path:` 选择器）：

```sh
dsh plugin --profile desktop add "git+ssh://git@github.com/xiangdongbu/dsh-plugin-others.git#path:/dsh-plugin-dream-skin-fix"
```

或本地开发目录软链：

```sh
dsh plugin --profile desktop add link:/absolute/path/to/dsh-plugin-dream-skin-fix
```

## 卸载

```sh
dsh plugin --profile desktop remove dsh-plugin-dream-skin-fix
```

移除后两份样式都不残留。

## 迁移提示

本插件取代了原来的两个插件，安装前先卸掉旧的，避免同一份 CSS 被注入两次：

```sh
dsh plugin --profile desktop remove dsh-plugin-dream-composer-fix
dsh plugin --profile desktop remove dsh-plugin-statusbar-overlap-fix
```
