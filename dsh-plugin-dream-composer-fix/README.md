# dsh-plugin-dream-composer-fix

本地 CSS 覆盖插件：针对 `dsh-dream-skin` 深色主题下**底部聊天输入框（主 composer）**背景
与页面底色过于接近的问题，在不修改 `dsh-dream-skin` 本体的前提下，给输入框加一层很克制的
浅色填充。

## 做法

Dream Skin 的 composer 填充由 `[data-composer-card]::before` 绘制：

```css
background: color-mix(
  in srgb,
  var(--dsh-dream-skin-composer-base, ...) var(--dsh-dream-skin-composer-fill, 85%),
  transparent
);
```

它的默认 base 是 `#131116`，与深色页面底色几乎相同，所以填充后仍看不出边界。

本插件在它之上叠一层 `--dsw-alias-label-primary` 的 10% 透明色，并保留原先的
composer base/fill 层，因此：

- 输入框变浅、边界清晰，但不会变成刺眼的纯灰块；
- 仍然跟随 Dream Skin 的「输入框透明度」滑杆；
- 换浅色主题或卸载 Dream Skin 时不生效 / 自动失效。

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

## 安装（Desktop profile）

```sh
dsh plugin --profile desktop add link:/absolute/path/to/dsh-plugin-dream-composer-fix
```

## 卸载

```sh
dsh plugin --profile desktop remove dsh-plugin-dream-composer-fix
```

移除后不残留任何样式。
