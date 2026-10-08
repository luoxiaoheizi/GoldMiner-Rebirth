'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Renderer, computeLayout } = require('../src/ui/renderer');
const { Game } = require('../src/core/game');
const theme = require('../src/ui/theme');

function fakeContext() {
  return new Proxy({ font: '16px sans-serif', measureText(value) {
    const size = parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/)[1]);
    return { width: Array.from(String(value)).reduce((sum, char) => sum + (/[^\x00-\x7f]/.test(char) ? size : size * 0.58), 0) };
  } }, { get(object, name) { return name in object ? object[name] : () => {}; } });
}

test('高清矿物按原碰撞尺寸绘制，矿工动画读取高清帧而非放大旧像素', () => {
  const draws = [], context = fakeContext();
  context.drawImage = (...args) => draws.push(args);
  const renderer = new Renderer({ width: 390, height: 844, context, dpr: 3 });
  const atlas = { width: 2048, height: 2048 };
  renderer.images = { hd_atlas: atlas, gold_big: { width: 32, height: 29 }, miner_sheet: { width: 256, height: 40 } };
  renderer.image('gold_big', 10, 20);
  assert.equal(draws[0][0], atlas, '应读取高清图集');
  assert.deepEqual(draws[0].slice(-4), [10, 20, 32, 29], '清晰度变化不应放大碰撞尺寸');
  assert.ok(draws[0][3] > 128 && draws[0][4] > 128, '采样来自高清源图');
  draws.length = 0;
  renderer.sprite('miner_sheet', 0, 32, 40, 100, 0, 80, 100);
  renderer.sprite('miner_sheet', 1, 32, 40, 100, 0, 80, 100);
  assert.equal(draws[0][0], atlas);
  assert.equal(draws[1][0], atlas);
  assert.notDeepEqual(draws[0].slice(1, 5), draws[1].slice(1, 5), '回收动作需要不同高清帧');
  assert.deepEqual(draws[0].slice(-4), [100, 0, 80, 100]);
});

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: '844 landscape safe', width: 844, height: 390, safeArea: { left: 47, top: 48, right: 797, bottom: 369 } },
  { name: '812 landscape safe', width: 812, height: 375, safeArea: { left: 44, top: 44, right: 768, bottom: 354 } },
  { name: '568 landscape', width: 568, height: 320 },
  { name: '568 landscape 240 usable', width: 568, height: 320, safeArea: { left: 0, top: 60, right: 568, bottom: 300 } },
  { name: '390 portrait', width: 390, height: 844 },
  { name: '375 portrait', width: 375, height: 667 },
  { name: '375 portrait safe', width: 375, height: 667, safeArea: { left: 0, top: 48, right: 375, bottom: 646 } },
];

function appFor(platform, state, hasRun = false) {
  const game = new Game({ random: () => 0.5 });
  game.startNew(); game.startLevel();
  game.player.money = 1500;
  game.player.dynamiteCount = 2;
  game.finishLevel();
  game.openShop();
  game.state = ['help', 'restart'].includes(state) ? 'menu' : state;
  if (state === 'gameover') game.result = { success: false, earned: 300 };
  return { platform, game, loaded: true, muted: false, hasRun, best: { money: 6000, level: 4 }, shopIndex: 0,
    modal: ['help', 'restart'].includes(state) ? state : null, notice: '' };
}

function intersects(a, b) {
  return a.x < b.x + b.w - 0.1 && a.x + a.w > b.x + 0.1 && a.y < b.y + b.h - 0.1 && a.y + a.h > b.y + 0.1;
}

for (const viewport of viewports) {
  test(viewport.name + ': every state keeps full-size controls in the safe area', () => {
    const platform = { ...viewport, context: fakeContext(), dpr: 1, kind: 'web' };
    const safe = viewport.safeArea || { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    for (const state of ['menu', 'ready', 'playing', 'paused', 'result', 'gameover', 'shop', 'help', 'restart']) {
      for (const hasRun of [false, true]) {
        const renderer = new Renderer(platform), app = appFor(platform, state, hasRun);
        const buttons = renderer.draw(app);
        assert.ok(buttons.length, state);
        for (const button of buttons) {
          const name = state + '/' + button.id;
          assert.ok(button.w >= 44 && button.h >= 48, name + ' touch size');
          assert.ok(button.x >= safe.left && button.y >= safe.top, name + ' top/left');
          assert.ok(button.x + button.w <= safe.right + 0.01, name + ' right');
          assert.ok(button.y + button.h <= safe.bottom + 0.01, name + ' bottom');
          for (const other of buttons) if (other !== button) assert.equal(intersects(button, other), false, name + ' overlaps ' + other.id);
        }
        if (state === 'playing') {
          assert.ok(buttons.some(button => button.id === 'bomb'));
          assert.ok(buttons.some(button => button.id === 'finish'));
        }
        if (state === 'shop') assert.ok(buttons.some(button => button.id === 'next-level'));
      }
    }
  });
}

test('portrait mining fills the available width and most of the screen; desktop keeps a compact board', () => {
  for (const viewport of viewports) {
    const layout = computeLayout(viewport.width, viewport.height, viewport.safeArea);
    if (viewport.height > viewport.width) {
      assert.equal(layout.board.w, viewport.width);
      assert.ok(layout.board.h >= viewport.height * 0.65);
      const renderer = new Renderer({ ...viewport, context: fakeContext(), dpr: 1, kind: 'wechat' });
      const buttons = renderer.draw(appFor(renderer.platform, 'playing'));
      assert.equal(buttons.some(button => button.id === 'drop'), false);
    } else assert.ok(Math.abs(layout.board.w / layout.board.h - 4 / 3) < 1e-10);
    if (viewport.width > viewport.height) assert.equal(layout.landscape, true);
    assert.ok(layout.board.y + layout.board.h <= layout.y + layout.h);
    assert.ok(layout.panel.y + layout.panel.h <= layout.y + layout.h);
  }
});

test('all shop descriptions fit above the wallet on the shortest supported board', () => {
  const viewport = viewports.find(item => item.name === '568 landscape 240 usable');
  const platform = { ...viewport, context: fakeContext(), dpr: 1, kind: 'web' };
  const renderer = new Renderer(platform), app = appFor(platform, 'shop');
  const records = [];
  const originalText = renderer.text.bind(renderer);
  renderer.text = (value, x, y, size, color, options) => { records.push({ value, x, y, size }); originalText(value, x, y, size, color, options); };
  for (let index = 0; index < app.game.shopItems.length; index++) {
    app.shopIndex = index; records.length = 0; renderer.shop(app);
    const wallet = records.find(item => item.value.startsWith('钱包：'));
    const board = renderer.layout.board;
    const descriptions = records.filter(item => item.x === board.x + 12 && item.y > board.y + 65 && item !== wallet);
    descriptions.forEach(item => assert.ok(item.y + item.size <= wallet.y, app.game.shopItems[index].id + ': description/wallet overlap'));
  }
});

test('竖屏商店的商品名称、说明与钱包不被操作按钮遮挡', () => {
  for (const viewport of viewports.filter(item => item.height > item.width)) {
    const platform = { ...viewport, context: fakeContext(), dpr: 1, kind: 'web' };
    const renderer = new Renderer(platform), app = appFor(platform, 'shop');
    const text = [], originalText = renderer.text.bind(renderer), originalButton = renderer.button.bind(renderer);
    let buttonLabel = false;
    renderer.text = (value, x, y, size, color, options) => {
      originalText(value, x, y, size, color, options);
      if (!buttonLabel) text.push({ value, x, y, w: platform.context.measureText(value).width, h: size });
    };
    renderer.button = (...args) => { buttonLabel = true; originalButton(...args); buttonLabel = false; };
    for (let index = 0; index < app.game.shopItems.length; index++) {
      app.shopIndex = index; text.length = 0; renderer.buttons = []; renderer.shop(app);
      for (const item of text) for (const button of renderer.buttons) {
        assert.equal(intersects(item, button), false, viewport.name + '/' + item.value + ' 被 ' + button.id + ' 遮挡');
      }
    }
  }
});

test('modal explanatory copy never overlaps the action column or buttons', () => {
  for (const viewport of viewports) {
    const platform = { ...viewport, context: fakeContext(), dpr: 1, kind: 'web' };
    for (const state of ['help', 'restart', 'paused']) {
      const renderer = new Renderer(platform), app = appFor(platform, state), text = [];
      const originalText = renderer.text.bind(renderer), originalButton = renderer.button.bind(renderer);
      let buttonLabel = false;
      renderer.text = (value, x, y, size, color, options) => {
        originalText(value, x, y, size, color, options);
        if (!buttonLabel) text.push({ x, y, w: platform.context.measureText(value).width, h: size });
      };
      renderer.button = (...args) => { buttonLabel = true; originalButton(...args); buttonLabel = false; };
      renderer.modal(app, state);
      text.forEach(item => renderer.buttons.forEach(button => assert.equal(intersects(item, button), false, viewport.name + '/' + state + ' text/button overlap')));
    }
  }
});

test('theme colors and shared dimensions stay aligned with DESIGN.md', () => {
  const design = fs.readFileSync(path.join(__dirname, '../../DESIGN.md'), 'utf8');
  for (const [name, value] of Object.entries(theme.colors)) {
    assert.ok(design.includes(name + ': "' + value + '"'), 'DESIGN color drift: ' + name);
  }
  assert.equal(theme.target, 48);
  assert.equal(theme.radius, 12);
});


test('purchase and storage notices do not obscure actionable buttons', () => {
  for (const viewport of viewports) {
    const platform = { ...viewport, context: fakeContext(), dpr: 1, kind: 'web' };
    for (const state of ['shop', 'playing', 'paused', 'restart']) {
      const renderer = new Renderer(platform), app = appFor(platform, state), notices = [];
      app.notice = '暂时无法保存进度，请勿关闭游戏。';
      const original = renderer.panel.bind(renderer);
      renderer.panel = (rect, fill, stroke, radius) => {
        if (stroke === theme.colors.primary) notices.push(rect);
        original(rect, fill, stroke, radius);
      };
      renderer.draw(app);
      assert.equal(notices.length, 1, viewport.name + '/' + state + ': notice is visible');
      notices.forEach(rect => renderer.buttons.forEach(button => assert.equal(intersects(rect, button), false, viewport.name + '/' + state + ': notice obscures ' + button.id)));
    }
  }
});
