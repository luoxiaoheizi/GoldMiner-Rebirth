'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { App } = require('../src/main');
const { Game } = require('../src/core/game');

function fixture(options = {}) {
  const callbacks = {};
  let saved = options.saved || null;
  const context = new Proxy({ measureText: value => ({ width: String(value).length * 8 }) }, {
    get(target, key) { return key in target ? target[key] : () => {}; },
  });
  const platform = {
    kind: 'wechat', context, canvas: {}, width: 960, height: 600, dpr: 2,
    safeArea: { left: 0, top: 0, right: 960, bottom: 600 },
    loadImage: async () => { if (options.failImages) throw new Error('missing image'); return { width: 320, height: 240 }; },
    readSave: () => saved,
    writeSave: data => { if (options.failStorage) return false; saved = JSON.parse(JSON.stringify(data)); return true; },
    setMuted: value => { platform.muted = value; }, playSound: () => {},
    requestFrame: fn => { callbacks.frame = fn; return 1; }, cancelFrame: () => {}, destroy: () => {},
  };
  for (const name of ['Pointer', 'Key', 'Resize', 'Hide', 'Show']) {
    platform[`on${name}`] = fn => { callbacks[name] = fn; return () => {}; };
  }
  const app = new App(platform);
  return { app, platform, callbacks, read: () => saved, options };
}

test('完整中文入口能开局、暂停、保存返回首页并恢复同一局', async t => {
  const f = fixture(); t.after(() => f.app.destroy());
  assert.equal(await f.app.ready, true);
  assert.equal(f.app.progress, 100);
  f.app.act('new'); assert.equal(f.app.game.state, 'ready');
  f.app.act('begin'); f.app.game.update(0.2);
  f.app.act('pause');
  const remaining = f.app.game.timeLeft;
  f.app.act('menu');
  assert.equal(f.app.game.state, 'menu');
  assert.equal(f.app.hasRun, true);
  f.app.act('continue');
  assert.equal(f.app.game.state, 'paused');
  assert.equal(f.app.game.timeLeft, remaining);
  f.app.act('resume'); assert.equal(f.app.game.state, 'playing');
  assert.equal(f.read().run.state, 'playing');
});

test('读档只恢复已验证进度和合法本机纪录，声音设置跨启动保留', async t => {
  const game = new Game(); game.startNew(); game.startLevel(); game.update(0.25);
  const f = fixture({ saved: { version: 1, muted: true, best: { money: 750, level: 2 }, run: game.exportSave() } });
  t.after(() => f.app.destroy()); await f.app.ready;
  assert.equal(f.platform.muted, true); assert.equal(f.app.best.money, 750);
  f.app.act('continue'); assert.equal(f.app.game.state, 'paused');
  f.app.act('sound'); assert.equal(f.read().muted, false);
  const corrupt = fixture({ saved: { version: 1, best: { money: -20, level: Infinity }, run: { version: 1 } } });
  t.after(() => corrupt.app.destroy()); await corrupt.app.ready;
  assert.equal(corrupt.app.hasRun, false); assert.equal(corrupt.app.best.money, 0);
  assert.match(corrupt.app.notice, /无法读取/);
});

test('切后台立即暂停保存，回前台保持暂停避免丢失倒计时', async t => {
  const f = fixture(); t.after(() => f.app.destroy()); await f.app.ready;
  f.app.act('new'); f.app.act('begin');
  f.callbacks.Hide();
  assert.equal(f.app.game.state, 'paused'); assert.equal(f.read().run.state, 'paused');
  const timeLeft = f.app.game.timeLeft;
  f.callbacks.Show();
  assert.equal(f.app.game.state, 'paused'); assert.equal(f.app.game.timeLeft, timeLeft);
});

test('资源失败提供重试，成功后恢复可操作菜单', async t => {
  const f = fixture({ failImages: true }); t.after(() => f.app.destroy());
  assert.equal(await f.app.ready, false); assert.equal(f.app.loadError, true);
  assert.ok(f.app.renderer.buttons.some(button => button.action === 'retry'));
  f.options.failImages = false; f.app.act('retry');
  assert.equal(await f.app.ready, true); assert.equal(f.app.loaded, true);
});

test('存储不可用时游戏继续运行并提示用户，恢复写入后保留进度', async t => {
  const f = fixture({ failStorage: true }); t.after(() => f.app.destroy()); await f.app.ready;
  f.app.act('new'); f.app.act('begin');
  assert.equal(f.app.game.state, 'playing'); assert.match(f.app.notice, /无法保存/);
  f.options.failStorage = false; assert.equal(f.app.persist(), true);
  assert.equal(f.read().run.state, 'playing');
});

test('系统取消触摸不会放钩，正常点击可以放钩', async t => {
  const f = fixture(); t.after(() => f.app.destroy()); await f.app.ready;
  f.app.act('new'); f.app.act('begin');
  const drop = f.app.renderer.buttons.find(button => button.id === 'drop');
  const point = { x: drop.x + 8, y: drop.y + 8 };
  f.callbacks.Pointer({ ...point, type: 'down' });
  f.callbacks.Pointer({ ...point, type: 'cancel' });
  f.callbacks.Pointer({ ...point, type: 'up' });
  assert.equal(f.app.game.hook.state, 'swinging');
  f.callbacks.Pointer({ ...point, type: 'down' }); f.callbacks.Pointer({ ...point, type: 'up' });
  assert.equal(f.app.game.hook.state, 'extending');
});

test('已有进度重新开局需确认，取消保留原快照', async t => {
  const f = fixture(); t.after(() => f.app.destroy()); await f.app.ready;
  f.app.act('new'); f.app.act('menu');
  const save = JSON.stringify(f.read().run);
  f.app.act('new'); assert.equal(f.app.modal, 'restart');
  f.app.act('close'); assert.equal(JSON.stringify(f.read().run), save);
  f.app.act('new'); f.app.act('restart');
  assert.equal(f.app.game.state, 'ready'); assert.equal(f.app.modal, null);
});

test('游戏失败清除进行中进度，但保留历史纪录和设置', async t => {
  const f = fixture(); t.after(() => f.app.destroy()); await f.app.ready;
  f.app.act('new'); f.app.act('begin'); f.app.act('sound');
  f.app.game.player.money = 50;
  for (let i = 0; i < 241; i++) f.app.game.update(0.25);
  assert.equal(f.app.game.state, 'gameover'); assert.equal(f.read().run, null);
  assert.equal(f.read().best.money, 50); assert.equal(f.read().muted, true);
  f.app.act('menu'); assert.equal(f.app.hasRun, false);
});
