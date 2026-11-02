# dsh-plugin-others

DeepSeek Harness 插件合集仓库（collection repo）：仓库根没有 `dsh` manifest，通过 market 从 git 安装本仓库时，会自动把下面 4 个插件子目录逐个识别并安装（`#path:` 选择器，见 `dshmarket` 的 `retargetCollections` 逻辑）。

## 包含的插件

| 目录 | 作用 |
| --- | --- |
| `dsh-plugin-cmdw-close-fix` | cmdw 关闭行为修复 |
| `dsh-plugin-dream-composer-fix` | dream 皮肤下输入框（composer）问题修复 |
| `dsh-plugin-no-session-rename-dblclick` | 禁用侧栏会话标题双击重命名（保留右键菜单重命名） |
| `dsh-plugin-statusbar-overlap-fix` | 状态条（token 用量 / 性能统计）悬浮遮挡对话文字的 CSS 修复 |

## 安装

- **market「从 GitHub 安装」**：填 `xiangdongbu/dsh-plugin-others`（或完整 git 地址），market 会自动展开安装全部 4 个插件。
- **手动安装**：把需要的插件目录拷贝（或软链）到 `~/.dsh/profiles/desktop/node_modules/` 下，重启 DSH 即可。

## 单独安装某一个

pnpm 的 `#path:` 片段选择器可以只装其中一个子目录，例如：

```
github:xiangdongbu/dsh-plugin-others#path:/dsh-plugin-statusbar-overlap-fix
```

## 更新

各插件目录内为构建产物（`index.js` / `lib/` / `cordis.patch.yml` / `package.json` / `README.md`），与本机 `~/.dsh/profiles/desktop/node_modules/` 中安装的版本保持一致。
