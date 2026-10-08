'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('回收结束保持出钩角度和摆动方向，不跳回左侧', () => {
  const game = running();
  game.hook.angle = -28; game.hook.swingDirection = 1;
  game.hook.state = 'reward'; game.hook.rewardTimer = 0.001;
  game._updateHook(1 / 120);
  assert.equal(game.hook.state, 'swinging');
  assert.equal(game.hook.angle, -28); assert.equal(game.hook.swingDirection, 1);
  game._updateHook(1 / 120); assert.ok(game.hook.angle > -28);
});

test('基础力量为1.2，四种金块质量降低至0.8倍，旧存档仅转换一次', () => {
  const game = running();
  assert.equal(game.player.strength, 1.2);
  const masses = { MiniGold: 2, NormalGold: 3.5, NormalGoldPlus: 5, BigGold: 7 };
  for (const [type, original] of Object.entries(masses)) {
    assert.ok(Math.abs(game._createEntity({ type, x: 10, y: 100 }, 0).mass - original * 0.8) < 1e-10);
  }
  const legacy = game.exportSave(); delete legacy.balanceVersion;
  legacy.player.strength = 1;
  legacy.entities.filter(e => /Gold/.test(e.type)).forEach(e => { e.mass /= 0.8; });
  const restored = new Game(); assert.ok(restored.restoreSave(legacy));
  assert.equal(restored.player.strength, 1.2);
  const once = restored.exportSave();
  assert.ok(restored.restoreSave(once)); assert.deepEqual(restored.exportSave(), once);
});
const fs = require('node:fs');
const path = require('node:path');
const { Game, ENTITY_CONFIG, SHOP_ITEMS, goalForLevel, levelGroup } = require('../src/core/game');
const LEVELS = require('../src/data/levels.json');

test('后续关卡重新开始固定第一张地图并清空矿物和钩爪状态', () => {
  const game = running(() => 0.99);
  game.player.level = 5; game._prepareLevel();
  game.player.money = 9000; game.player.dynamiteCount = 4; game.player.hasGemPolish = true;
  game.hook.state = 'extending'; game.hook.length = 80;
  game.effects.push({ type: 'bonus', ttl: 1 });
  game.startNew();
  assert.equal(game.levelId, 'L1_1'); assert.equal(game.player.level, 1);
  assert.equal(game.player.goal, 650); assert.equal(game.player.money, 0);
  assert.equal(game.player.dynamiteCount, 0); assert.equal(game.player.hasGemPolish, false);
  assert.equal(game.hook.state, 'swinging'); assert.equal(game.hook.length, 0);
  assert.deepEqual(game.effects, []); assert.deepEqual(game.shopItems, []); assert.equal(game.result, null);
  assert.deepEqual(game.entities.map(e => ({ type: e.type, x: e.x, y: e.y })), LEVELS.L1_1.entities);
  game.startNew(); assert.equal(game.levelId, 'L1_1');
});

function running(random = () => 0.5) {
  const game = new Game({ random });
  game.startNew();
  game.startLevel();
  return game;
}

function advance(game, seconds, hz = 60) {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) game.update(1 / hz);
}

function arrange(game, objects) {
  game.entities = objects.map((object, index) => game._createEntity(object, index));
  game.hook.angle = 0;
  game._positionHook();
}

function catchObject(game, type, extra = {}) {
  arrange(game, [Object.assign({ type, x: 153, y: 80 }, extra), { type: 'MiniGold', x: 20, y: 220 }]);
  assert.equal(game.releaseHook(), true);
  advance(game, 12);
}

function shopGame() {
  const game = running(() => 0.5);
  game.player.money = 5000;
  game.finishLevel();
  game.openShop();
  return game;
}

test('竖屏矿区延伸后深处金块可抓取并结算，素材尺寸不变', () => {
  const game = running();
  game.setFieldHeight(600);
  arrange(game, [{ type: 'MiniGold', x: 153, y: 520 }, { type: 'MiniGold', x: 20, y: 580 }]);
  assert.equal(game.entities[0].width, 10);
  assert.equal(game.releaseHook(), true);
  advance(game, 6);
  assert.equal(game.player.money, 50);
});

test('竖屏存档及旧版存档均可恢复，缩放矿区不会丢失进度或抓取状态', () => {
  const game = running();
  const legacy = game.exportSave(); delete legacy.fieldHeight;
  assert.equal(new Game().restoreSave(legacy), true);
  game.setFieldHeight(600);
  game.hook.angle = 0; game._positionHook();
  game.releaseHook(); advance(game, 0.1);
  const snapshot = game.exportSave();
  const restored = new Game();
  assert.equal(restored.restoreSave(snapshot), true);
  assert.equal(restored.fieldHeight, 600);
  assert.equal(restored.timeLeft, game.timeLeft);
  const remaining = restored.timeLeft;
  restored.setFieldHeight(480);
  assert.equal(restored.timeLeft, remaining);
  assert.equal(restored.hook.state, game.hook.state);
  assert.equal(restored.entities.length, game.entities.length);
});

test('钩爪到达竖屏底部后转回横屏，仍能保存并继续回收', () => {
  const game = running(() => 0);
  game.setFieldHeight(610.9128205128205);
  game.hook.angle = -13; game._positionHook(); game.releaseHook();
  for (let frame = 0; frame < 600 && game.hook.state === 'extending'; frame++) game.update(1 / 120);
  assert.equal(game.hook.state, 'retracting');
  game.setFieldHeight(240);
  const restored = new Game();
  assert.equal(restored.restoreSave(game.exportSave()), true);
  assert.equal(restored.hook.state, 'retracting');
});

test('all 30 original layouts and all 579 entities are migrated without coordinate loss', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../levels.lua'), 'utf8');
  const blocks = [...source.matchAll(/    \['(L\d+_\d+)'\] = \{/g)];
  assert.equal(blocks.length, 30);
  assert.equal(Object.keys(LEVELS).length, 30);
  let total = 0;
  blocks.forEach((block, index) => {
    const section = source.slice(block.index, index + 1 < blocks.length ? blocks[index + 1].index : source.indexOf('function levels.loadLevel'));
    const entities = [...section.matchAll(/\{ \['type'\] = '(\w+)', \['pos'\] = \{ \['x'\] = (\d+), \['y'\] = (\d+)\s*\}([^\n]*)/g)].map(match => {
      const entity = { type: match[1], x: Number(match[2]), y: Number(match[3]) };
      const direction = match[4].match(/\['dir'\] = '(Left|Right)'/);
      if (direction) entity.direction = direction[1] === 'Left' ? -1 : 1;
      assert.ok(ENTITY_CONFIG[entity.type]);
      return entity;
    });
    assert.deepEqual(LEVELS[block[1]].entities, entities);
    total += entities.length;
  });
  assert.equal(total, 579);
});

test('construction has no callbacks; new game waits on ready screen', () => {
  const events = [];
  const game = new Game({ onEvent: event => events.push(event) });
  assert.equal(events.length, 0);
  assert.equal(game.exportSave(), null);
  game.startNew();
  assert.equal(game.state, 'ready');
  assert.equal(game.player.goal, 650);
  game.update(10);
  assert.equal(game.timeLeft, 60);
  assert.equal(game.releaseHook(), false);
  assert.equal(game.startLevel(), true);
  assert.equal(game.startLevel(), false);
});

test('gold is credited only after the hook returns, exactly once', () => {
  const game = running();
  arrange(game, [{ type: 'MiniGold', x: 153, y: 100 }, { type: 'MiniGold', x: 20, y: 220 }]);
  assert.equal(game.releaseHook(), true);
  assert.equal(game.releaseHook(), false);
  advance(game, 0.75);
  assert.equal(game.hook.state, 'retracting');
  assert.equal(game.player.money, 0);
  advance(game, 3);
  assert.equal(game.player.money, 50);
  assert.equal(game.entities[0].active, false);
  advance(game, 3);
  assert.equal(game.player.money, 50);
});

test('fixed stepping produces the same hook and mole motion at 30, 60 and 120 Hz', () => {
  const outcomes = [30, 60, 120].map(hz => {
    const game = running();
    arrange(game, [{ type: 'Mole', x: 260, y: 180, direction: -1 }, { type: 'MiniGold', x: 20, y: 220 }]);
    advance(game, 4, hz);
    return [game.hook.angle, game.entities[0].x, game.entities[0].direction, game.timeLeft];
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test('hook rebounds at visible screen boundary and returns without a catch', () => {
  const game = running();
  arrange(game, [{ type: 'MiniGold', x: 300, y: 220 }]);
  game.hook.angle = 75;
  game._positionHook();
  game.releaseHook();
  advance(game, 2);
  assert.equal(game.hook.state, 'retracting');
  assert.ok(game.hook.length < 160);
  advance(game, 2);
  assert.equal(game.hook.state, 'swinging');
  assert.equal(game.player.money, 0);
});

test('pause freezes the timer, moving objects, hook and reward effects', () => {
  const game = running();
  game.releaseHook();
  advance(game, 0.5);
  assert.equal(game.pause(), true);
  const saved = game.exportSave();
  game.update(500);
  assert.deepEqual(game.exportSave(), saved);
  assert.equal(game.releaseHook(), false);
  assert.equal(game.useDynamite(), false);
  assert.equal(game.resume(), true);
  advance(game, 0.5);
  assert.ok(game.timeLeft < saved.timeLeft);
});

test('time limit does not credit an unfinished catch and settlement is idempotent', () => {
  const events = [];
  const game = running();
  game.onEvent = event => events.push(event);
  arrange(game, [{ type: 'BigGold', x: 142, y: 90 }]);
  game.releaseHook();
  advance(game, 1);
  assert.notEqual(game.hook.grabbedId, null);
  game.timeLeft = 0.25;
  advance(game, 1);
  assert.equal(game.state, 'gameover');
  assert.equal(game.player.money, 0);
  assert.equal(game.timeLeft, 0);
  assert.equal(game.hook.grabbedId, null);
  assert.equal(game.exportSave(), null);
  const result = Object.assign({}, game.result);
  game.update(60);
  assert.equal(game.finishLevel(), false);
  assert.deepEqual(game.result, result);
  assert.equal(events.filter(event => event.type === 'state' && event.state === 'gameover').length, 1);
});

test('dynamite requires cargo, consumes one item and gives no reward', () => {
  const game = running();
  game.player.dynamiteCount = 2;
  assert.equal(game.useDynamite(), false);
  arrange(game, [{ type: 'BigRock', x: 142, y: 90 }, { type: 'MiniGold', x: 20, y: 220 }]);
  game.releaseHook();
  advance(game, 1);
  assert.equal(game.useDynamite(), true);
  assert.equal(game.useDynamite(), false);
  assert.equal(game.player.dynamiteCount, 1);
  assert.equal(game.entities[0].active, false);
  advance(game, 2);
  assert.equal(game.player.money, 0);
  assert.equal(game.hook.state, 'swinging');
});

test('TNT detonates neighbouring barrels once and destroys nearby treasure without money', () => {
  const game = running();
  arrange(game, [
    { type: 'TNT', x: 145, y: 90 },
    { type: 'TNT', x: 195, y: 90 },
    { type: 'Diamond', x: 250, y: 98 },
    { type: 'MiniGold', x: 20, y: 220 }
  ]);
  game.releaseHook();
  advance(game, 1);
  assert.equal(game.entities[0].destroyed, true);
  assert.equal(game.entities[1].active, false);
  assert.equal(game.entities[2].active, false);
  assert.equal(game.entities[3].active, true);
  advance(game, 2);
  assert.equal(game.player.money, 2);
});

test('all four next-level buffs apply and expire on settlement', () => {
  const game = running();
  game.player.hasStrengthDrink = true;
  game.player.hasRockCollectorsBook = true;
  catchObject(game, 'MiniRock');
  assert.equal(game.player.money, 33);
  assert.equal(game.entities[0].mass, 5.5 / 1.5);
  game.player.hasGemPolish = true;
  catchObject(game, 'Diamond');
  assert.equal(game.player.money, 933);
  assert.equal(game.finishLevel(), true);
  assert.equal(game.player.hasRockCollectorsBook, false);
  assert.equal(game.player.hasGemPolish, false);
  assert.equal(game.player.hasStrengthDrink, false);
  assert.equal(game.player.hasLuckyClover, false);
  assert.equal(game.player.strength, 1.2);
});

test('gem polish increases only the diamond component of a diamond mole', () => {
  const game = running();
  game.player.hasGemPolish = true;
  arrange(game, [{ type: 'MoleWithDiamond', x: 158, y: 90, direction: -1 }]);
  const mole = game.entities[0];
  game._grab(mole);
  game.hook.length = 10;
  advance(game, 1);
  assert.equal(game.player.money, 902);
});

test('fortune bags provide money, dynamite or strength; clover doubles the special-effect range', () => {
  const money = running();
  catchObject(money, 'QuestionBag');
  assert.equal(money.player.money, 450);
  const dynamite = running();
  dynamite.random = () => 0;
  catchObject(dynamite, 'QuestionBag');
  assert.equal(dynamite.player.money, 0);
  assert.equal(dynamite.player.dynamiteCount, 1);
  const strength = running();
  strength.player.hasLuckyClover = true;
  strength.random = () => 0.3;
  catchObject(strength, 'QuestionBag');
  assert.equal(strength.player.money, 0);
  assert.equal(strength.player.strength, 1.2 * 1.5 + 1);
  const noClover = running();
  noClover.random = () => 0.3;
  catchObject(noClover, 'QuestionBag');
  assert.equal(noClover.player.money, 250);
});

test('shop spends cumulative money, prevents double purchases and preserves next goal', () => {
  const game = shopGame();
  assert.equal(game.shopItems.length, 5);
  const item = game.shopItems.find(candidate => candidate.id === 'StrengthDrink');
  assert.equal(game.buyItem(item.id).ok, true);
  assert.equal(game.player.money, 5000 - item.price);
  assert.equal(game.buyItem(item.id).ok, false);
  assert.equal(game.player.hasStrengthDrink, true);
  assert.equal(game.nextLevel(), true);
  assert.equal(game.state, 'ready');
  assert.equal(game.player.level, 2);
  assert.equal(game.player.goal, 1195);
  assert.equal(game.player.money, 5000 - item.price);
  assert.equal(game.player.hasStrengthDrink, true);
  assert.equal(game.nextLevel(), false);
});

test('shop disallows unaffordable items, unknown items and capped dynamite', () => {
  const game = shopGame();
  game.player.money = 0;
  assert.equal(game.buyItem('GemPolish').ok, false);
  assert.equal(game.buyItem('__proto__').ok, false);
  assert.equal(game.player.money, 0);
  game.player.money = 5000;
  game.player.dynamiteCount = 12;
  assert.equal(game.buyItem('Dynamite').ok, false);
  assert.equal(game.player.money, 5000);
  assert.equal(game.player.dynamiteCount, 12);
});

test('all five shop items have Chinese copy and retain original random price bounds', () => {
  assert.deepEqual(SHOP_ITEMS.map(item => item.id), ['Dynamite', 'StrengthDrink', 'LuckyClover', 'RockCollectorsBook', 'GemPolish']);
  for (const item of SHOP_ITEMS) assert.match(item.description, /[\u4e00-\u9fff]/);
  const game = new Game({ random: () => 0 });
  assert.equal(game._price('Dynamite', 2), 6);
  assert.equal(game._price('StrengthDrink', 2), 101);
  assert.equal(game._price('LuckyClover', 2), 6);
  assert.equal(game._price('RockCollectorsBook', 2), 2);
  assert.equal(game._price('GemPolish', 2), 202);
});

test('goals keep the original cumulative curve and all ten groups are reachable before cycling', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(goalForLevel), [650, 1195, 2010, 3095, 4450]);
  assert.equal(goalForLevel(10) - goalForLevel(9), 2435);
  assert.equal(goalForLevel(30) - goalForLevel(29), 2435);
  assert.deepEqual(Array.from({ length: 18 }, (_, index) => levelGroup(index + 1)), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 4, 5, 6, 7, 8, 9, 10, 4]);
});

test('snapshots round-trip on every legal layout and never alias live state', () => {
  for (let level = 1; level <= 18; level++) {
    for (const random of [0, 0.5, 0.999]) {
      const game = running(() => random);
      game.player.level = level;
      game.player.goal = goalForLevel(level);
      game.player.goalAddOn = 275 + Math.min(level - 1, 8) * 270;
      game._prepareLevel();
      advance(game, 1);
      const saved = game.exportSave();
      const restored = new Game();
      assert.equal(restored.restoreSave(saved), true, game.levelId);
      assert.equal(restored.state, 'paused');
      assert.equal(restored.timeLeft, game.timeLeft);
      saved.player.money = 123456;
      assert.equal(game.player.money, 0);
      assert.equal(restored.player.money, 0);
    }
  }
});

test('an in-flight catch resumes without duplicated rewards or lost cargo', () => {
  const game = running(() => 0);
  // Aim at an existing original map object so strict layout validation remains active.
  const target = game.entities.find(item => item.type === 'BigGold');
  game._grab(target);
  game.hook.length = 80;
  game._positionHook();
  const saved = game.exportSave();
  const restored = new Game({ random: () => 0.5 });
  assert.equal(restored.restoreSave(saved), true);
  assert.equal(restored.hook.grabbedId, target.id);
  assert.equal(restored.releaseHook(), false);
  restored.resume();
  advance(restored, 8);
  assert.equal(restored.player.money, 500);
  advance(restored, 2);
  assert.equal(restored.player.money, 500);
});

test('ready, result and shop progress restore exactly, including stable stock and spent money', () => {
  const ready = new Game();
  ready.startNew();
  const restoredReady = new Game();
  assert.equal(restoredReady.restoreSave(ready.exportSave()), true);
  assert.equal(restoredReady.state, 'ready');
  const game = running();
  game.player.money = 5000;
  game.finishLevel();
  const restoredResult = new Game();
  assert.equal(restoredResult.restoreSave(game.exportSave()), true);
  assert.equal(restoredResult.state, 'result');
  game.openShop();
  game.buyItem('GemPolish');
  const save = game.exportSave();
  const restored = new Game();
  assert.equal(restored.restoreSave(save), true);
  assert.equal(restored.state, 'shop');
  assert.deepEqual(restored.shopItems, game.shopItems);
  assert.equal(restored.player.money, game.player.money);
  assert.equal(restored.buyItem('GemPolish').ok, false);
  restored.nextLevel();
  assert.equal(restored.player.hasGemPolish, true);
});

test('invalid or incompatible saves are rejected atomically', () => {
  const source = running();
  const valid = source.exportSave();
  const destination = new Game();
  const mutations = [
    data => { data.version = 2; },
    data => { data.state = 'unknown'; },
    data => { data.player.money = -1; },
    data => { data.player.goal = 0; },
    data => { data.player.level = Infinity; },
    data => { data.timeLeft = NaN; },
    data => { data.timeLeft = 0; },
    data => { data.levelId = '__proto__'; },
    data => { data.entities[0].type = 'NotAnEntity'; },
    data => { data.entities[0].id = 1; },
    data => { data.entities[0].x = Infinity; },
    data => { data.entities.pop(); },
    data => { data.entities[0].grabbed = true; },
    data => { data.hook.grabbedId = 999; },
    data => { data.hook.length = -10; },
    data => { data.shopItems = [{ id: '__proto__', price: 1, purchased: false }]; }
  ];
  assert.equal(destination.restoreSave(null), false);
  mutations.forEach(mutate => {
    const broken = JSON.parse(JSON.stringify(valid));
    mutate(broken);
    assert.equal(destination.restoreSave(broken), false);
    assert.equal(destination.state, 'menu');
    assert.equal(destination.player.money, 0);
  });
});

test('returning to menu does not silently overwrite a resumable snapshot', () => {
  const game = running();
  const saved = game.exportSave();
  game.returnToMenu();
  assert.equal(game.exportSave(), null);
  assert.equal(game.restoreSave(saved), true);
  assert.equal(game.state, 'paused');
});
