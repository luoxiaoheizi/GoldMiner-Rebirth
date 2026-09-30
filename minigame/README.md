# 黄金矿工 · 重生（中文版小游戏）

同一套原生 Canvas 2D / JavaScript 代码生成微信小游戏、抖音小游戏和浏览器预览版本。无需安装 Cocos 或其他引擎，也没有第三方 npm 依赖。原 Lua / LÖVE 工程保留在仓库根目录。

## 本地构建与预览

需要 Node.js 22 或更新版本。在本目录执行：

```powershell
cd D:\MyAgent\Empower\GoldMiner-Rebirth\minigame
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

浏览器打开 <http://127.0.0.1:4173>。预览服务只监听本机回环地址，终端按 `Ctrl+C` 停止。可用 `npm.cmd run preview -- --port 4174` 更换端口。修改源码后重新执行构建并刷新页面；这里没有自动监听或热更新。macOS / Linux 可直接使用 `npm`。

构建输出：

| 目录 | 用途 |
| --- | --- |
| `dist/wechat` | 微信开发者工具导入目录 |
| `dist/douyin` | 抖音小游戏开发者工具导入目录 |
| `dist/web` | 浏览器预览静态文件 |

`dist` 是可重建产物，不提交到 Git。构建仅清理带有生成标记的对应输出目录，不修改根目录的原版资源。三端统一在构建期将 CommonJS 和 JSON 关卡数据编译为一个可读的 `game.js`，不依赖小游戏运行时解析 JSON 模块，也不使用 `eval` 或 `new Function`。产物只有入口脚本、平台配置和资源，无需复制 `src`。所有文本文件使用 UTF-8，代码、图片和音频均在本地包内，不访问远程资源。

## 导入微信小游戏

1. 运行 `npm.cmd run build`。
2. 在微信开发者工具中选择**小游戏**，导入 `dist/wechat`，填写你自己的小游戏 AppID。
3. 编译并在模拟器中体验；使用自己的 AppID 进行手机预览。
4. 检查横屏方向、刘海与胶囊避让、触摸、音频、返回前台暂停和存档恢复。

## 导入抖音小游戏

1. 运行 `npm.cmd run build`。
2. 在抖音小游戏开发者工具中导入 `dist/douyin`，选择小游戏项目并填写开放平台分配的真实 AppID。
3. 编译，再使用平台的手机预览能力检查 Android / iOS 实机。

两端都生成 `game.js`、`game.json`、`project.config.json`，小游戏方向配置为 `landscape`。没有 AppID 时，构建不会生成虚假 ID。若工具要求导入前已有 ID，可在本机用参数构建：

```powershell
node scripts/build.js --wechat-appid <你的微信AppID> --douyin-appid <你的抖音AppID>
```

将尖括号占位文字替换为真实 ID，或设置当前终端环境变量 `WECHAT_APPID` / `DOUYIN_APPID` 后构建。AppID 只进入本机构建产物；不要在源码中填写 AppSecret、访问令牌或其他密钥。每次重新构建会替换产物，在开发者工具中手动改过的产物配置也会重置，因此推荐通过构建参数传入 AppID。

## 玩法与输入

- 找准钩爪方向后点击操作按钮放钩，等待矿物自动收回；在时限内达到关卡目标。
- 通过结算进入商店，按自己的策略购买道具后继续下一关。
- 支持触摸和浏览器键盘操作，具体键位在游戏内说明中显示。
- 设置、个人最好成绩和可继续的进度保存在当前平台的本机存储。微信、抖音和浏览器各自独立；浏览器清理站点数据或平台清理缓存会移除存档。
- 切到后台会暂停游戏并停止音频，回到前台后由游戏界面恢复操作，避免离开期间损失倒计时。

本阶段实现本地单机玩法；广告、联网排行榜、账号和云存档不在当前版本中。

## 源码组织

```text
src/            共享游戏逻辑、中文界面和平台接口
scripts/        零依赖构建与本机静态预览服务
templates/     浏览器预览 HTML 和无障碍控件容器
tests/         Node.js 内置测试运行器测试
dist/          构建后生成的三端目录
```

平台适配统一提供逻辑像素坐标、DPR（最高 3）、系统安全区域与胶囊避让、图片加载、触摸 / 键盘、音效静音、本地存档、前后台通知和动画帧。小游戏环境只使用 `wx` 或 `tt`，不依赖浏览器 DOM。网页提供原生按钮覆盖层、键盘焦点和读屏状态区域。

执行 `npm.cmd test` 会验证游戏规则及平台适配，同时重新构建产物，在 Node.js VM 和 SDK 模拟环境中实际启动三端 `game.js`，等待资源加载、开局并开始关卡，检查双端配置、本地资源和包体预算。测试发现仅匹配源码测试文件，生成的 `dist` 内没有测试文件，不会重复执行。包体检查采用项目自设的 4 MiB 上限，实际可上传大小仍以平台工具当前校验为准。SDK mock 和浏览器验证不能代替微信 / 抖音开发者工具与真实手机验收。

## 可选浏览器回归

`npm.cmd run test:browser` 使用已有的 Playwright 安装运行真实浏览器检查，覆盖开局、放钩、暂停、刷新续玩、结算、商店购买、下一关、失败重试及 4 种手机视口。它启动临时本机服务器并在结束后关闭，截图和报告写入被 Git 忽略的 `artifacts/browser/`。

本项目没有绑定 Playwright 依赖。已有安装不在当前模块路径时，可在当前终端把 `PLAYWRIGHT_MODULE` 设为其模块目录；没有 Playwright 自带浏览器时，可把 `BROWSER_EXECUTABLE` 设为已安装 Chrome / Chromium 的可执行文件绝对路径。常规 `npm test` 和构建不需要这些工具。最近一次验证范围见 [VALIDATION.md](./VALIDATION.md)。

## 资源与发布

继承原项目 `images/` 和 `audios/` 内的图片、音频；中文使用设备系统字体，不打包原英文字体。每个生成包携带原 `LICENSE` 和素材来源说明 `ASSET-NOTICE.txt`。原项目 MIT 许可覆盖代码，原作者关于互联网来源素材的说明仍然适用。正式公开运营前，需要核实美术和音频的商用权，必要时替换为自有或明确授权资源。

本仓库不自动发布到微信或抖音。小游戏主体、真实 AppID、平台资质与审核材料由对应平台开发者账号管理。

官方配置参考（核对日期：2026-09-30）：

- [微信官方小游戏示例及项目配置](https://github.com/wechat-miniprogram/minigame-demo)
- [微信官方横屏小游戏配置示例](https://github.com/wechat-miniprogram/minigame-lockstep-demo/blob/master/game.json)
- [抖音小游戏开发指南](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/dev-guide/bytedance-mini-game)
- [抖音小游戏配置](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/framework/mini-game-configuration)
