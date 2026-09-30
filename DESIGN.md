---
version: alpha
name: 黄金矿工 · 重生
description: 保留掌机像素矿区，为触摸设备重新设计的中文单机小游戏。
colors:
  background: "#241B16"
  surface: "#35271E"
  raised: "#493426"
  border: "#765339"
  primary: "#F5C451"
  primaryHover: "#FFDA75"
  onPrimary: "#302114"
  text: "#FFF4D8"
  muted: "#D1BA94"
  success: "#A4CD85"
  danger: "#FF9B82"
  overlay: "rgba(22, 16, 12, 0.88)"
typography:
  title:
    fontFamily: '"STKaiti", "KaiTi", "Noto Serif CJK SC", serif'
  body:
    fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
  number:
    fontFamily: '"Consolas", "Menlo", monospace'
rounded:
  DEFAULT: "12px"
spacing:
  gap: "16px"
  target: "48px"
components:
  button:
    height: "48px"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.onPrimary}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
---

# 黄金矿工 · 重生

## Overview

面向微信、抖音中短时游玩的中文用户，核心任务是看准摆动的钩爪，及时放钩，达成每关金币目标。玩法来源于原项目 `Entities.lua`、`GameStates.lua`、`levels.lua`，本轮需求仅包含双端中文单机游戏。

视觉参考是原游戏的沙金矿层、木质工具箱和掌机像素角色。矿区保持像素采样；外部操作面板用清晰中文和可触摸尺寸重新排布。标志性元素是置于矿工木框中的原始像素矿区。菜单、商店与结算采用同一套按钮和面板，避免后台仪表盘式统计卡堆叠。

`minigame/src/ui/theme.js` 为运行时 token 唯一所有者，本文件镜像其值。`minigame/tests/ui.test.js` 检查颜色漂移。渲染器直接消费 token，浏览器无障碍控件只覆盖交互语义，不复制视觉皮肤。中文字体使用设备字体，不下载字体、不复用原英文字体。

## Colors

深棕 background/surface/raised 区分背景、面板和按钮。primary 为金色主动作，onPrimary 为其深色文字；text 与 muted 用于正文和说明。success 表达达标，danger 表达倒计时或不足，并始终附有中文文字。原像素图片颜色不重绘为界面 token。

## Typography

title 用楷体风格强调中文游戏名称，仅用于标题；正文使用中文无衬线回退。number 用于金币和倒计时。正文常用 14–18px，按钮 16px，标题随可用高度取 28–48px。中文按字测量换行，数值不依赖 Intl。

## Layout

小游戏默认横屏；浏览器同时支持竖屏。横屏矿区在左、操作面板在右，竖屏矿区在上、操作面板在下。矿区保持原始 320:240 比例，实体和碰撞坐标不随设备比例改变。布局使用逻辑像素，DPR 只影响画布清晰度。可见内容限制在平台 safeArea 内，触摸坐标与绘图共用布局，胶囊避让由平台层负责。

交互按钮至少 48px 高，说明文字为按钮留出固定空间。没有表格、输入框、下拉框、网络请求或滚动长页。短屏商店每页只展示一个商品，通过上一件/下一件切换，避免无法触达的滚动区域。

## Elevation & Depth

矿区使用一层边框与木框。暂停、说明和重新开始确认使用统一遮罩；弹窗不推动底层布局。没有高开销模糊或反复投影。

## Shapes

界面 12px 圆角，矿区图片内部保持锐利像素；矩形大按钮配合浅色描边与可见键盘焦点。图标只有与文字同现的矿物和道具图片。

## Components

`ui/renderer.js` 所有屏幕共用 panel、button、text、wrapText 和 feedback。按钮覆盖默认、hover、按下、键盘 focus、disabled 状态；禁用动作带状态说明。浏览器使用原生 button 覆盖 Canvas 点击区域并保持 Tab/Enter/Space 行为；小游戏使用同一按钮区域命中测试。

`main.js` 统一管理读档、加载失败重试、存档失败提示、暂停和确认。只有确认重新开局会覆盖已有进度。切后台自动暂停并保存，回前台仍保持暂停。商店购买后立即反馈并保存，未购买可以直接出发。纪录仅为本机最高金币/关卡，不是联网排行榜。

动效用于钩爪、角色、金币入账与爆炸；菜单不做闪烁、视差和大幅位移。用户偏好减少动态时取消装饰性反馈，但保留判断玩法所必需的钩爪运动。音效可关闭并持久化。

## Do's and Don'ts

- 保留矿区比例、熟悉的矿物与核心数值，让文字和操作适合手机。
- 所有按钮显示中文动作，资金不足与道具用完同时提供文字解释。
- 不把广告、联网排行、登录、支付或后端引入本次范围。
- 不将已有图片/音频的来源声明改成已取得商用授权；沿用原项目的素材边界。
