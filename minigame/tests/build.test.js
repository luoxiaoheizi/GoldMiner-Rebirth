'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { build, bundle, parseOptions, inside, readUtf8, DIST } = require('../scripts/build');

test('高清透明图集尺寸与源区域一致，所有动作帧都位于图内', () => {
  const png = fs.readFileSync(path.join(__dirname, '../../images/hd_atlas.png'));
  const atlas = require('../src/ui/hd-assets.json');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), atlas.width);
  assert.equal(png.readUInt32BE(20), atlas.height);
  assert.ok(atlas.width >= 1024 && atlas.height >= 1024);
  assert.equal(png[25], 6, 'RGBA PNG 保留透明背景');
  assert.equal(atlas.sprites.miner_sheet.length, 4);
  for (const [name, frames] of Object.entries(atlas.sprites)) for (const frame of frames) {
    assert.ok(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0, name);
    assert.ok(frame.x + frame.w <= atlas.width && frame.y + frame.h <= atlas.height, name + ' 源区域越界');
  }
});

test('AppID 仅来自显式本地参数或环境，不生成虚假 ID', () => {
  assert.deepEqual(parseOptions([], {}), { wechatAppid: '', douyinAppid: '' });
  assert.equal(parseOptions(['--wechat-appid', 'wx1234567890abcdef'], {}).wechatAppid, 'wx1234567890abcdef');
  assert.equal(parseOptions([], { DOUYIN_APPID: 'tt12345678' }).douyinAppid, 'tt12345678');
  assert.throws(() => parseOptions(['--unknown'], {}), /支持参数/);
  assert.throws(() => parseOptions(['--wechat-appid', 'invalid'], {}), /格式/);
  assert.throws(() => parseOptions(['--douyin-appid', 'invalid'], {}), /tt/);
});

test('路径边界不能匹配兄弟目录、父目录或根本身', () => {
  const parent = path.resolve('safe');
  assert.equal(inside(parent, path.join(parent, 'output')), true);
  assert.equal(inside(parent, path.resolve('safe-other')), false);
  assert.equal(inside(parent, parent), false);
  assert.equal(inside(parent, path.dirname(parent)), false);
});

test('无 eval 打包器保留 CommonJS 缓存、相对模块和入口行为', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'goldminer-bundle-'));
  try {
    fs.writeFileSync(path.join(temp, 'main.js'), "const x = require('./value.json'); const y = require('./value.json'); exports.start = p => { globalThis.observed = [x === y, x.name, p.kind]; };", 'utf8');
    fs.writeFileSync(path.join(temp, 'value.json'), JSON.stringify({ name: '黄金' }), 'utf8');
    fs.writeFileSync(path.join(temp, 'platform.js'), "exports.createPlatform = kind => ({ kind });", 'utf8');
    const result = bundle([path.join(temp, 'main.js'), path.join(temp, 'platform.js')], temp);
    assert.doesNotMatch(result, /\beval\s*\(|new\s+Function\s*\(/);
    const context = {};
    vm.runInNewContext(result, context, { timeout: 1000 });
    assert.deepEqual(Array.from(context.observed), [true, '黄金', 'web']);
    fs.writeFileSync(path.join(temp, 'main.js'), "require('../../outside')", 'utf8');
    assert.throws(() => bundle([path.join(temp, 'main.js')], temp), /超出 src/);
  } finally {
    assert.ok(inside(os.tmpdir(), temp));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('完整构建生成双端竖屏配置、中文网页和本地资源', async () => {
  const report = build();
  assert.equal(report.length, 3);
  for (const item of report) {
    assert.ok(item.bytes < 4 * 1024 * 1024);
    assert.ok(fs.existsSync(path.join(item.directory, 'images', 'gold_big.png')));
    assert.ok(fs.existsSync(path.join(item.directory, 'images', 'hd_atlas.png')));
    assert.ok(fs.existsSync(path.join(item.directory, 'audios', 'money.wav')));
    assert.equal(fs.existsSync(path.join(item.directory, 'fonts')), false);
    const app = bootBundle(item.directory);
    assert.equal(await app.ready, true);
    assert.equal(app.loaded, true);
    assert.equal(app.game.state, 'menu');
    app.act('new');
    assert.equal(app.game.state, 'ready');
    app.act('begin');
    assert.equal(app.game.state, 'playing');
    app.destroy();
    if (item.platform === 'web') continue;
    const game = JSON.parse(readUtf8(path.join(item.directory, 'game.json')));
    const project = JSON.parse(readUtf8(path.join(item.directory, 'project.config.json')));
    assert.equal(game.deviceOrientation, 'portrait');
    assert.equal(Object.hasOwn(project, 'appid'), false);
    if (item.platform === 'wechat') assert.equal(project.compileType, 'game');
    assert.match(readUtf8(path.join(item.directory, 'game.js')), new RegExp('createPlatform\\("' + item.platform + '"\\)'));
  }
  const html = readUtf8(path.join(DIST, 'web', 'index.html'));
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /id="game-controls"/);
  assert.match(html, /aria-live="polite"/);
  const web = readUtf8(path.join(DIST, 'web', 'game.js'));
  assert.doesNotMatch(web, /\beval\s*\(|new\s+Function\s*\(/);
  new vm.Script(web);
  // Every static local asset path referenced by JS must be shipped.
  for (const match of web.matchAll(/['"]((?:images|audios)\/[\w-]+\.(?:png|mp3|wav))['"]/g)) {
    assert.ok(fs.existsSync(path.join(DIST, 'web', match[1])), '缺少资源：' + match[1]);
  }
});

test('本机预览返回静态资源并拒绝越界路径和写请求', async () => {
  const { createServer } = require('../scripts/preview');
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await page.text(), /矿工模拟器/);
    const image = await fetch(base + '/images/gold_big.png');
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    await image.arrayBuffer();
    const outside = await fetch(base + '/%2e%2e%2fREADME.md');
    assert.equal(outside.status, 403);
    const windows = await fetch(base + '/..%5cREADME.md');
    assert.equal(windows.status, 403);
    const write = await fetch(base + '/', { method: 'POST' });
    assert.equal(write.status, 405);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
// Execute the actual generated JavaScript, including every compiled JSON module.
// Image and host SDK mocks validate packaged paths without emulating the game.
function bootBundle(directory) {
  const drawing = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') return text => ({ width: String(text).length * 8 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
  });
  const canvas = { style: {}, getContext: () => drawing, addEventListener() {}, removeEventListener() {} };
  class LocalImage {
    constructor() { this.width = 128; this.height = 128; }
    set src(value) {
      const exists = fs.existsSync(path.join(directory, value));
      queueMicrotask(() => { if (exists) this.onload(); else this.onerror(new Error('Missing: ' + value)); });
    }
  }
  const saved = new Map();
  const sdk = {
    createCanvas: () => canvas, createImage: () => new LocalImage(),
    getSystemInfoSync: () => ({ windowWidth: 960, windowHeight: 540, pixelRatio: 1 }),
    getStorageSync: key => saved.get(key), setStorageSync: (key, value) => saved.set(key, value),
    createInnerAudioContext: () => ({ play() {}, stop() {}, seek() {}, onError() {}, destroy() {} }),
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'WindowResize', 'DeviceOrientationChange', 'Hide', 'Show']) {
    sdk['on' + name] = () => {};
    sdk['off' + name] = () => {};
  }
  const document = {
    getElementById: id => id === 'game-canvas' ? canvas : null,
    addEventListener() {}, removeEventListener() {}, hidden: false,
  };
  const sandbox = {
    console, setTimeout, clearTimeout, document,
    innerWidth: 960, innerHeight: 540, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    Image: LocalImage, Audio: class { play() {} pause() {} },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    wx: sdk, tt: sdk, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  };
  sandbox.GameGlobal = sandbox;
  return vm.runInNewContext(readUtf8(path.join(directory, 'game.js')), sandbox, { timeout: 5000 });
}
