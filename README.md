# 拾音

拾音是一个 Windows 桌面音乐播放器。它使用 Electron 显示独立窗口，保留本地 Node.js 服务，并支持网易云账号、本地播放队列、歌词和 Windows 媒体控制。

## 功能

- 搜索歌曲、专辑、歌单和 MV，浏览歌单与每日推荐。
- 使用 Chrome 登录助手、扫码或手动导入连接网易云账号。
- 顺序、随机和选择歌曲播放，调整播放队列。
- 将歌曲信息和播放控制提供给 Windows 媒体面板。
- 主题颜色、歌词及播放界面设置保存在本机。

## 服务器配置

项目不内置搜索代理或播放解析服务器。首次打开时填写你有权使用的服务地址，也可跳过并在“设置 → 服务器地址”中修改。地址只保存在本机浏览器存储中，不会自动打包到项目。

- **搜索与歌词代理**：填写提供 `/proxy` 接口的完整地址，例如 `https://example.com/proxy`。客户端将网易云接口地址放入 `url` 查询参数，并以原始 GET 或 POST 方法请求代理。没有配置时，普通搜索和依赖代理的歌词等功能不可用。
- **播放解析服务**：填写提供 `/musicstreamlink/` 接口的完整地址，例如 `https://example.com/musicstreamlink/`。播放时会附加 `platform=netease`、歌曲 `id`、`quality` 和 `vip` 参数。没有配置时无法播放歌曲。

这两项可以指向不同服务，具体接口需与上面的协议兼容；并非任意服务器地址都可直接使用。网易云账号请求继续直接访问网易云，不会将账号 Cookie 发送给所填服务。实际音频和封面地址取决于网络服务返回的结果。

## 开发运行

需要 Windows x64、Node.js 24（含 npm）和网络连接。在项目目录运行：

```powershell
npm install
npm start
```

运行前请关闭其他拾音实例。本地服务使用 `127.0.0.1:8765`；端口被占用时应用无法启动。

## 打包 Windows 版本

```powershell
npm install
npm run build:dir
```

生成的 `dist/win-unpacked` 是完整的应用目录，双击其中的 `拾音公开版.exe` 启动；分发时请保留整个目录。要生成可分发的 ZIP，可以运行 `npm run build:zip`，使用时先完整解压。

要生成 Windows 安装程序，可运行 `npm run build:installer`，生成的 `.exe` 位于 `dist`，可作为 GitHub Release 附件。构建需要下载 Electron 和构建工具，首次构建可能需要较长时间。项目没有配置代码签名。

## 连接网易云账号

1. 在 Google Chrome 中打开网易云音乐官网并登录。
2. 打开 `chrome://extensions/`，启用开发者模式，点击“加载已解压的扩展程序”。开发时选择项目根目录的 `chrome-extension`；使用打包版时选择应用目录下的 `resources/app/chrome-extension`。如果已安装旧版拾音助手，先移除旧版。
3. 在拾音中点击“连接网易云 → 从 Chrome 导入登录状态”，然后在 Chrome 中打开的页面点击确认。
4. 导入成功后返回拾音；扫码和手动导入位于连接窗口的“其他方式”。

移动应用文件夹后，需要在 Chrome 扩展页面重新加载对应路径的助手。

## 数据和网络

网易云登录凭据使用 Windows 当前用户的 DPAPI 保存在 `%LOCALAPPDATA%/ShiYinPublic/account.dpapi`，不属于源码项目；退出登录会清除播放器保存的账号状态。不要把 Cookie、账号文件或其他个人凭据提交到 GitHub。

账号和部分推荐请求直接连接网易云；普通搜索和播放依赖用户自行配置的代理、解析服务，以及对应的封面和音频地址。这些服务可能不可用或变更，使用时需要网络连接。Windows 媒体面板的具体显示由系统决定。

## 项目结构

- `desktop.cjs`、`preload.cjs`：Electron 主进程和安全桥接。
- `server.cjs`、`account.cjs`：本地 HTTP 服务、网易云请求和账号加密存储。
- `index.html`、`style.css`、`app.js`：播放器界面和交互。
- `chrome-extension/`：Chrome 登录助手。
- `vendor/`：二维码库及其许可证。
- `icon.png`、`icon.ico`：应用图标。

二维码库的许可证见 `vendor/LICENSE-qrcode.txt`。项目本身暂未指定开源许可证；发布到 GitHub 前，请由权利人决定是否添加许可证并确认相关素材的使用权。
