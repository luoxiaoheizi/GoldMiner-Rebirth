---
version: alpha
name: 矿工模拟器
description: 保留经典矿工素材，以黄色顶部信息和全屏矿区提供竖屏直接触摸体验。
colors:
  background: "#FFDA2E"
  surface: "#FFF0A8"
  raised: "#FFE36B"
  border: "#B9942B"
  primary: "#EAB51A"
  primaryHover: "#F9CE43"
  onPrimary: "#563C12"
  text: "#684A1A"
  muted: "#977128"
  success: "#459B33"
  danger: "#D32238"
  overlay: "rgba(64, 43, 10, 0.45)"
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

# 矿工模拟器

## Overview

面向微信、抖音中短时游玩的中文用户，核心任务是看准摆动的钩爪，及时放钩，达成每关金币目标。玩法来源于原项目 `Entities.lua`、`GameStates.lua`、`levels.lua`，本轮需求仅包含双端中文单机游戏。

视觉采用黄色顶部、蓝色矿工背景和沙金矿层。手机矿区铺满屏幕宽度，金币、目标、关卡和倒计时分列矿工两侧。矿工与主要矿物读取高清透明图集，地形和钩爪使用 Canvas 路径绘制。过关显示全屏金块背景与“恭喜你顺利过关”，停留 1.5 秒后自动进入独立木质货架商店；商品可直接点击购买，有邀请好友和下一关按钮。首页 logo 与正式发布头像使用同一张图片。

`minigame/src/ui/theme.js` 为运行时 token 唯一所有者，本文件镜像其值。`minigame/tests/ui.test.js` 检查颜色漂移。渲染器直接消费 token，浏览器无障碍控件只覆盖交互语义，不复制视觉皮肤。中文字体使用设备字体，不下载字体、不复用原英文字体。

## Colors

黄色 background 与浅金 surface/raised 区分背景、面板和按钮。primary 为金色主动作，onPrimary 为其深色文字；text 与 muted 用于正文和说明。success 表达金币，danger 表达目标和倒计时，并始终附有中文文字。原图片颜色不重绘为界面 token。

## Typography

title 用楷体风格强调中文游戏名称，仅用于标题；正文使用中文无衬线回退。number 用于金币和倒计时。正文常用 14–18px，按钮 16px，标题随可用高度取 28–48px。中文按字测量换行，数值不依赖 Intl。

## Layout

小游戏默认竖屏，手机无需旋转。竖屏黄色顶部显示信息与暂停/声音控制，下方矿区铺满宽度和剩余高度，轻点矿区直接出钩。浏览器横屏保留辅助操作面板。矿区逻辑宽度为 320，高度由竖屏可用空间决定；沿原关卡纵向展开实体中心，保持图片尺寸与碰撞尺寸一致，钩爪长度和速度随矿区高度适配。存档保存矿区高度，并兼容旧版 320×240 存档。DPR 只影响画布清晰度，按钮保留在平台 safeArea 内，胶囊避让由平台层负责。

交互按钮至少 48px 高，说明文字为按钮留出固定空间。没有表格、输入框、下拉框、网络请求或滚动长页。短屏商店每页只展示一个商品，通过上一件/下一件切换，避免无法触达的滚动区域。

## Elevation & Depth

竖屏矿区不使用外围木框或侧面操作区。暂停、说明和重新开始确认使用统一遮罩；弹窗不推动底层布局。没有高开销模糊或反复投影。

## Shapes

界面 12px 圆角，矿区图片等比平滑绘制；矩形大按钮配合浅色描边与可见键盘焦点。图标只有与文字同现的矿物和道具图片。

## Components

`ui/renderer.js` 所有屏幕共用 panel、button、text、wrapText 和 feedback。按钮覆盖默认、hover、按下、键盘 focus、disabled 状态；禁用动作带状态说明。浏览器使用原生 button 覆盖 Canvas 点击区域并保持 Tab/Enter/Space 行为；小游戏使用同一按钮区域命中测试。

`main.js` 统一管理读档、加载失败重试、存档失败提示、暂停和确认。只有确认重新开局会覆盖已有进度。切后台自动暂停并保存，回前台仍保持暂停。商店购买后立即反馈并保存，未购买可以直接出发。纪录仅为本机最高金币/关卡，不是联网排行榜。

动效用于钩爪、角色、金币入账与爆炸；菜单不做闪烁、视差和大幅位移。用户偏好减少动态时取消装饰性反馈，但保留判断玩法所必需的钩爪运动。音效可关闭并持久化。

## Do's and Don'ts

- 保留熟悉的矿物、图像比例与核心数值，优先竖屏直接触摸体验。
- 所有按钮显示中文动作，资金不足与道具用完同时提供文字解释。
- 不把广告、联网排行、登录、支付或后端引入本次范围。
- 不将已有图片/音频的来源声明改成已取得商用授权；沿用原项目的素材边界。
