# Mention Code

Mention Code 是一个轻量、友好的浏览器代码编辑器。它使用原生 HTML、CSS 和 JavaScript 构建，结合 CodeMirror 提供代码编辑能力，适合直接在浏览器中编辑单个文件或组织一个小型项目。

![Preview](./res/Screenshot%201.jpg)

## 功能

- 文件和文件夹树视图
- 新建、打开、重命名、删除文件及文件夹
- 浏览器文件系统访问：打开文件夹并直接保存文件（浏览器支持时）
- 不支持文件系统访问时自动回退为浏览器下载
- 多标签编辑和未保存状态提示
- 代码搜索与替换，支持区分大小写和正则表达式
- JavaScript、TypeScript、HTML、CSS、SCSS、JSON、YAML、Markdown、C/C++、C#、Java、Kotlin、Scala、Go、Rust、Swift、Dart、Python、PHP、Ruby、Perl、Lua、R、Shell、Batch、PowerShell、VBScript、SQL 和 Dockerfile 等语言模式
- Markdown、HTML 和 SVG 预览
- 代码语言图标、语法高亮和状态栏统计
- 深色/浅色主题 ![Preview Theme](./res/Screenshot%202.jpg)
- 可配置界面语言、字体、字号、行高、编辑器背景和语法高亮配色
- 工作区自动保存到浏览器，并在下次打开时恢复
- 工作区导入和导出
- 菜单栏可在标题栏与侧边栏之间移动
- 可通过右键菜单快速访问文件、标签页、菜单栏和布局操作
- 简体中文、繁体中文和 English (US) 界面

![Preview Settings](./res/Screenshot%203.jpg)

## 快速开始

### 使用本地静态服务器（推荐）

推荐通过本地 HTTP 服务器启动，因为文件系统访问、HTML 预览和部分浏览器 API 在 `file://` 页面下可能受浏览器安全策略限制。

在项目根目录执行：

```bash
npm start
```

服务器默认监听 `http://localhost:7080`，然后在浏览器中打开：

<http://localhost:7080>

也可以通过环境变量修改监听地址和端口：

```powershell
$env:HOST="127.0.0.1"
$env:PORT="3000"
npm start
```

服务器入口为 [`server.js`](./server.js)，根路径会显示 [`src/index.html`](./src/index.html)，其他请求会从 `src` 目录提供静态资源。

### 直接打开

可以直接打开 [`src/index.html`](./src/index.html)，但此方式下部分文件系统功能可能不可用。若要获得完整体验，请使用本地服务器，并优先使用 Chromium 内核浏览器。

## 开发

项目暂时不包含打包流程，修改 `src` 下的文件后刷新浏览器即可看到效果。

安装项目依赖 *（当前暂无所需依赖）*：

```powershell
npm install
```

> 依赖主要用于项目中已本地化的 CodeMirror 和 Marked 资源。当前 `package.json` 没有定义开发服务器或构建脚本，因此运行项目不需要执行 `npm run build`。

## 常用快捷键

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl/Cmd + O` | 打开文件 |
| `Ctrl/Cmd + Shift + O` | 打开文件夹 |
| `Ctrl/Cmd + E` | 导出项目 |
| `Ctrl/Cmd + S` | 保存当前文件 |
| `Ctrl/Cmd + Shift + S` | 另存为 |
| `Ctrl/Cmd + F` | 查找 |
| `Ctrl/Cmd + H` | 查找并替换 |
| `Ctrl/Cmd + Shift + P` | 打开搜索面板 |
| `Ctrl/Cmd + Shift + V` | 切换预览 |
| `Ctrl/Cmd + ,` | 打开设置 |
| `Ctrl/Cmd + =` | 增大字号 |
| `Ctrl/Cmd + -` | 减小字号 |
| `Ctrl/Cmd + 0` | 重置字号 |
| `Esc` | 关闭查找框或返回设置 |

编辑器还保留浏览器和 CodeMirror 提供的常用编辑快捷键，例如撤销、重做、复制、剪切、粘贴和全选。

在 macOS 上，`Cmd` 对应表格中的 `Ctrl`。

## 浏览器能力

文件系统读写使用浏览器的 File System Access API。浏览器不支持该 API 时，编辑、导入和导出仍可使用，但保存文件会回退为下载方式。

工作区和用户设置保存在当前浏览器的 `localStorage` 中，不会自动上传到服务器。清除浏览器站点数据会同时清除自动保存的工作区、最近项目和界面设置；也可以在设置页面中清除上次项目。

## 项目结构

```text
.
├── src/
│   ├── index.html                 应用入口
│   ├── css/
│   │   └── style.css              应用样式
│   ├── js/
│   │   └── app.js                 编辑器核心逻辑
│   ├── languages/                 界面语言资源
│   │   ├── language-en-US.js
│   │   ├── language-zh-Hans.js
│   │   └── language-zh-Hant.js
│   ├── assets/                    图标和背景资源
│   └── libs/                      CodeMirror、Marked 等本地依赖
├── package.json
├── package-lock.json
└── LICENSE
```

## 本地化

界面语言资源位于 [`src/languages/`](./src/languages/)。新增用户可见文本时，应同时：

1. 在 `language-en-US.js` 和 `language-zh-Hant.js` 中添加对应翻译；
2. 使用稳定的原文作为翻译键；
3. 检查菜单、右键菜单、状态栏、按钮的动态文本是否通过统一的翻译函数生成。

简体中文资源作为默认语言，未翻译的文本会保留原始中文。

## 许可证

本项目使用 MIT License，详见 [`LICENSE`](./LICENSE)。

## 感谢

- [致美化](https://zhutix.com)：提供了编辑器壁纸
- [CodeMirror 5](https://codemirror.net/5/)：代码编辑器和语言模式
- [Marked](https://marked.js.org/)：用于 Markdown 解析
- [DOMPurify](https://github.com/cure53/DOMPurify)：预览内容清理
- [VSCode](https://code.visualudio.com)：编辑代码
- [Deepseek](https://deepseek.com) 和 [Github Copilot](https://github.com/features/copilot)：检查代码，编写README *（我的文笔真的不好啊啊啊）*

---

*ps: 这是我的第一个真正意义上完成的项目，还请多多支持哈哈哈喵喵喵* 😺

*Star me pls ⭐*
