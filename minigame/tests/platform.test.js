'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlatform, SAVE_KEY } = require('../src/platform');

function sdkMock() {
  const events = {};
  const transforms = [];
  const saved = new Map();
  const sounds = [];
  const info = { windowWidth: 812, windowHeight: 375, pixelRatio: 3, safeArea: { left: 44, top: 0, right: 768, bottom: 354 } };
  const canvas = { getContext: () => ({ setTransform: (...args) => transforms.push(args) }) };
  const sdk = {
    createCanvas: () => canvas,
    getSystemInfoSync: () => info,
    getMenuButtonBoundingClientRect: () => ({ width: 88, bottom: 36 }),
    getStorageSync: (key) => saved.get(key),
    setStorageSync: (key, value) => saved.set(key, value),
    createImage: () => ({}),
    createInnerAudioContext: () => {
      const audio = { playCount: 0, stopped: false, destroyed: false, play() { this.playCount += 1; }, stop() { this.stopped = true; }, seek() {}, onError() {}, destroy() { this.destroyed = true; } };
      sounds.push(audio);
      return audio;
    },
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'WindowResize', 'DeviceOrientationChange', 'Hide', 'Show']) {
    sdk['on' + name] = (fn) => { events[name] = fn; };
    sdk['off' + name] = (fn) => { if (events[name] === fn) delete events[name]; };
  }
  return { sdk, canvas, events, info, transforms, saved, sounds };
}

for (const kind of ['wechat', 'douyin']) {
  test(kind + ': 逻辑坐标、DPR、安全区域和触摸统一', () => {
    const mock = sdkMock();
    const platform = createPlatform(kind, { sdk: mock.sdk, root: {} });
    assert.equal(platform.width, 812);
    assert.equal(mock.canvas.width, 2436);
    assert.equal(mock.canvas.height, 1125);
    assert.deepEqual(mock.transforms[0], [3, 0, 0, 3, 0, 0]);
    assert.deepEqual(platform.safeArea, { left: 44, top: 44, right: 768, bottom: 354, width: 724, height: 310 });
    const received = [];
    const off = platform.onPointer((event) => received.push(event));
    mock.events.TouchStart({ changedTouches: [{ clientX: 200, clientY: 120 }] });
    mock.events.TouchEnd({ changedTouches: [{ x: 204, y: 121 }] });
    assert.deepEqual(received, [{ x: 200, y: 120, type: 'down' }, { x: 204, y: 121, type: 'up' }]);
    mock.events.TouchCancel({ changedTouches: [{ clientX: 204, clientY: 121 }] });
    assert.equal(received[2].type, 'cancel');
    off();
    mock.events.TouchStart({ changedTouches: [{ clientX: 3, clientY: 4 }] });
    assert.equal(received.length, 3);
    platform.destroy();
    assert.deepEqual(Object.keys(mock.events), []);
  });
}

test('窗口变化使用事件尺寸，前后台事件不重复通知且停止音频', () => {
  const mock = sdkMock();
  const platform = createPlatform('wechat', { sdk: mock.sdk, root: {} });
  let resize;
  let hides = 0;
  let shows = 0;
  platform.onResize((event) => { resize = event; });
  platform.onHide(() => { hides += 1; });
  platform.onShow(() => { shows += 1; });
  mock.events.WindowResize({ size: { windowWidth: 900, windowHeight: 400 } });
  assert.equal(resize.width, 900);
  assert.equal(platform.height, 400);
  platform.playSound('Money');
  assert.equal(mock.sounds[0].src, 'audios/money.wav');
  mock.events.Hide();
  mock.events.Hide();
  platform.playSound('Money');
  assert.equal(mock.sounds[0].playCount, 1);
  assert.equal(mock.sounds[0].stopped, true);
  assert.equal(hides, 1);
  mock.events.Show();
  mock.events.Show();
  assert.equal(shows, 1);
  platform.playSound('Money');
  assert.equal(mock.sounds[0].playCount, 2);
  platform.mute(true);
  platform.playSound('Money');
  assert.equal(mock.sounds[0].playCount, 2);
  platform.destroy();
  assert.equal(mock.sounds[0].destroyed, true);
});

test('存档容错：损坏、异常和存储拒绝均不影响游戏', () => {
  const mock = sdkMock();
  const platform = createPlatform('douyin', { sdk: mock.sdk, root: {} });
  assert.equal(platform.readSave(), null);
  assert.equal(platform.writeSave({ version: 1, best: 3200 }), true);
  assert.deepEqual(platform.readSave(), { version: 1, best: 3200 });
  mock.saved.set(SAVE_KEY, '{broken');
  assert.equal(platform.readSave(), null);
  mock.saved.set(SAVE_KEY, '[]');
  assert.equal(platform.readSave(), null);
  mock.sdk.setStorageSync = () => { throw new Error('quota'); };
  assert.equal(platform.writeSave({}), false);
  platform.destroy();
});

test('图片异步成功和失败均可被调用方处理', async () => {
  const mock = sdkMock();
  let lastImage;
  mock.sdk.createImage = () => { lastImage = {}; return lastImage; };
  const platform = createPlatform('wechat', { sdk: mock.sdk, root: {} });
  const success = platform.loadImage('images/gold_big.png');
  assert.equal(lastImage.src, 'images/gold_big.png');
  lastImage.onload();
  assert.equal(await success, lastImage);
  const failure = platform.loadImage('images/missing.png');
  lastImage.onerror();
  await assert.rejects(failure, /无法加载图片/);
  platform.destroy();
});

function domTarget() {
  const events = {};
  return { events, addEventListener: (type, fn) => { events[type] = fn; }, removeEventListener: (type) => { delete events[type]; } };
}
test('浏览器坐标缩放、键盘与页面隐藏适配', () => {
  const canvas = Object.assign(domTarget(), {
    style: {}, getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 200 }),
  });
  const doc = Object.assign(domTarget(), { hidden: false, getElementById: () => canvas });
  const storage = new Map();
  const root = Object.assign(domTarget(), {
    document: doc, innerWidth: 800, innerHeight: 400, devicePixelRatio: 2,
    matchMedia: () => ({ matches: true }),
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    requestAnimationFrame: () => 12, cancelAnimationFrame: (id) => { root.cancelled = id; },
  });
  const platform = createPlatform('web', { root });
  assert.equal(platform.reducedMotion, true);
  let pointer;
  let key;
  let hidden = false;
  platform.onPointer((event) => { pointer = event; });
  platform.onKey((event) => { key = event; });
  platform.onHide(() => { hidden = true; });
  canvas.events.pointerdown({ clientX: 210, clientY: 120, button: 0, preventDefault() {} });
  assert.deepEqual(pointer, { x: 400, y: 200, type: 'down' });
  root.events.pointercancel({ clientX: 210, clientY: 120, preventDefault() {} });
  assert.equal(pointer.type, 'cancel');
  root.events.keydown({ key: ' ', target: { tagName: 'BODY' }, preventDefault() {} });
  assert.deepEqual(key, { key: ' ', type: 'down' });
  key = null;
  root.events.keydown({ key: ' ', target: { tagName: 'BUTTON' } });
  assert.equal(key, null);
  root.events.keydown({ key: 'Escape', target: { tagName: 'BUTTON' } });
  assert.deepEqual(key, { key: 'Escape', type: 'down' });
  root.events.keydown({ key: 'ArrowDown', target: { tagName: 'BUTTON' }, preventDefault() {} });
  assert.deepEqual(key, { key: 'ArrowDown', type: 'down' });
  doc.hidden = true;
  doc.events.visibilitychange();
  assert.equal(hidden, true);
  assert.equal(platform.writeSave({ score: 100 }), true);
  assert.deepEqual(platform.readSave(), { score: 100 });
  assert.equal(platform.requestFrame(() => {}), 12);
  platform.cancelFrame(12);
  assert.equal(root.cancelled, 12);
  platform.destroy();
  assert.deepEqual(Object.keys(root.events), []);
});

test('抖音横屏兼容竖屏安全区域和缺失胶囊 API', () => {
  const mock = sdkMock();
  mock.info.screenWidth = 375;
  mock.info.screenHeight = 812;
  mock.info.safeArea = { left: 0, top: 44, right: 375, bottom: 778 };
  delete mock.sdk.getMenuButtonBoundingClientRect;
  const platform = createPlatform('douyin', { sdk: mock.sdk, root: {} });
  assert.deepEqual(platform.safeArea, { left: 44, top: 48, right: 768, bottom: 375, width: 724, height: 327 });
  mock.info.windowWidth = 844;
  mock.events.DeviceOrientationChange({ value: 'landscapeReverse' });
  assert.equal(platform.width, 844);
  platform.destroy();
});