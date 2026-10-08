'use strict';

const LEVELS = require('../data/levels.json');
const { ENTITY_CONFIG, SHOP_ITEMS, BUFF_FLAGS, LEVEL_DURATION, levelGroup, goalForLevel } = require('../data/rules');

const STEP = 1 / 120;
const HOOK_SPEED = 100;
const HOOK_SWING = 65;
const MAX_LENGTH = 230;
const SAVE_VERSION = 1;
const MAX_LEVEL = 100000;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function finite(value, min, max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
function integer(value, min, max) { return Number.isInteger(value) && value >= min && value <= max; }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }

function freshPlayer() {
  const player = { level: 1, money: 0, goal: 650, goalAddOn: 275, dynamiteCount: 0, strength: 1 };
  BUFF_FLAGS.forEach(flag => { player[flag] = false; });
  return player;
}

function freshHook() {
  return { state: 'swinging', angle: 75, swingDirection: -1, length: 0,
    originX: 158, originY: 30, x: 158, y: 30, tipX: 158, tipY: 43,
    grabbedId: null, rewardTimer: 0 };
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? clamp(((x - ax) * dx + (y - ay) * dy) / length2, 0, 1) : 0;
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

class Game {
  constructor(options = {}) {
    this.random = options.random || Math.random;
    this.onEvent = options.onEvent || (() => {});
    this.state = 'menu';
    this.fieldHeight = 240;
    this.player = freshPlayer();
    this.levelId = 'L1_1';
    this.background = LEVELS[this.levelId].background;
    this.timeLeft = LEVEL_DURATION;
    this.elapsed = 0;
    this.entities = [];
    this.hook = freshHook();
    this.effects = [];
    this.shopItems = [];
    this.result = null;
    this.startMoney = 0;
    this._accumulator = 0;
    this._saveTimer = 0;
    this._positionHook();
  }

  _emit(type, data = {}) { this.onEvent(Object.assign({ type }, data)); }
  _sound(name) { this._emit('sound', { name }); }
  _save() { this._emit('save'); }
  _setState(state) { this.state = state; this._emit('state', { state }); }
  _randomInt(min, max) { return min + Math.floor(clamp(Number(this.random()) || 0, 0, 0.999999999) * (max - min + 1)); }

  startNew() {
    this.player = freshPlayer();
    this.shopItems = [];
    this.result = null;
    this._prepareLevel();
    this._setState('ready');
    this._sound('Goal');
    this._save();
    return true;
  }

  _prepareLevel() {
    this.levelId = 'L' + levelGroup(this.player.level) + '_' + this._randomInt(1, 3);
    this.background = LEVELS[this.levelId].background;
    this.timeLeft = LEVEL_DURATION;
    this.elapsed = 0;
    this.startMoney = this.player.money;
    this.entities = LEVELS[this.levelId].entities.map((source, index) => this._createEntity(source, index));
    // Preserve sprite dimensions while spreading original level centres down a taller mine.
    this.entities.forEach(entity => {
      entity.y = 40 + (entity.y + entity.height / 2 - 40) * (this.fieldHeight - 40) / 200 - entity.height / 2;
    });
    this.hook = freshHook();
    this.effects = [];
    this._accumulator = 0;
    this._saveTimer = 0;
    this._positionHook();
  }

  _createEntity(source, id) {
    const config = ENTITY_CONFIG[source.type];
    // Lua positions mobile entities by their centre; all JS entities use top left.
    const x = source.x - (config.mobile ? config.width / 2 : 0);
    const y = source.y - (config.mobile ? config.height / 2 : 0);
    const direction = source.direction || 1;
    const end = clamp(x + direction * 135, 0, 320 - config.width);
    return { id, type: source.type, x, y, width: config.width, height: config.height,
      radius: (config.width + config.height) / 4, mass: source.type === 'QuestionBag' ? this._randomInt(1, 9) : config.mass,
      bonus: source.type === 'QuestionBag' ? this._randomInt(1, 16) * 50 : config.bonus,
      active: true, grabbed: false, destroyed: false, direction,
      moving: !!config.mobile, minX: Math.min(x, end), maxX: Math.max(x, end), idleTimer: 0,
      effectsApplied: false };
  }

  setFieldHeight(height) {
    height = clamp(Number(height) || 240, 240, 1200);
    if (Math.abs(height - this.fieldHeight) < 0.01) return;
    const ratio = (height - 40) / (this.fieldHeight - 40);
    this.entities.forEach(entity => {
      if (!entity.grabbed) entity.y = 40 + (entity.y + entity.height / 2 - 40) * ratio - entity.height / 2;
    });
    this.effects.forEach(effect => { effect.y = 40 + (effect.y - 40) * ratio; });
    // Keep in-flight cargo attached through a viewport change without awarding it again.
    const hook = this.hook;
    if (hook.length > 0) {
      const angle = hook.angle * Math.PI / 180;
      const dx = -Math.sin(angle) * hook.length, dy = Math.cos(angle) * hook.length * ratio;
      hook.angle = clamp(Math.atan2(-dx, dy) * 180 / Math.PI, -75, 75);
      hook.length = Math.hypot(dx, dy);
    }
    this.fieldHeight = height;
    hook.length = Math.min(hook.length, height === 240 ? MAX_LENGTH : Math.hypot(320, height - 30));
    this._positionHook();
  }

  startLevel() {
    if (this.state !== 'ready') return false;
    this._setState('playing');
    this._sound('HookReset');
    this._save();
    return true;
  }

  releaseHook() {
    if (this.state !== 'playing' || this.hook.state !== 'swinging') return false;
    this.hook.state = 'extending';
    this._sound('GrabStart');
    return true;
  }

  useDynamite() {
    if (this.state !== 'playing' || this.hook.state !== 'retracting' || this.player.dynamiteCount <= 0) return false;
    const entity = this.entities.find(item => item.id === this.hook.grabbedId);
    if (!entity || !entity.active) return false;
    entity.active = false;
    entity.grabbed = false;
    this.player.dynamiteCount--;
    this.hook.grabbedId = null;
    this.effects.push({ type: 'explosion', x: this.hook.tipX, y: this.hook.tipY, ttl: 0.5, duration: 0.5, radius: 32 });
    this._sound('Explosive');
    this._save();
    return true;
  }

  pause() {
    if (this.state !== 'playing') return false;
    this._setState('paused');
    this._save();
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this._accumulator = 0;
    this._setState('playing');
    this._save();
    return true;
  }

  finishLevel() {
    if (this.state !== 'playing' || this.player.money < this.player.goal) return false;
    return this._settle('manual');
  }

  _settle(reason) {
    if (this.state !== 'playing') return false;
    const success = this.player.money >= this.player.goal;
    // Unreturned cargo earns nothing. The timer is the final authority on settlement.
    const grabbed = this.entities.find(item => item.id === this.hook.grabbedId);
    if (grabbed) { grabbed.grabbed = false; grabbed.active = false; }
    this.hook = freshHook();
    this._positionHook();
    this.result = { success, money: this.player.money, goal: this.player.goal,
      earned: this.player.money - this.startMoney, level: this.player.level, reason };
    this.player.strength = 1;
    BUFF_FLAGS.forEach(flag => { this.player[flag] = false; });
    this._setState(success ? 'result' : 'gameover');
    this._sound(success ? 'MadeGoal' : 'Low');
    this._save();
    return true;
  }

  openShop() {
    if (this.state !== 'result' || !this.result || !this.result.success) return false;
    const level = this.player.level + 1;
    this.shopItems = SHOP_ITEMS.map(item => Object.assign({}, item, { price: this._price(item.id, level), purchased: false }))
      .filter(() => this._randomInt(1, 3) >= 2);
    if (!this.shopItems.length) this.shopItems.push(Object.assign({}, SHOP_ITEMS[0], { price: this._price('Dynamite', level), purchased: false }));
    this._setState('shop');
    this._save();
    return true;
  }

  _price(id, level) {
    switch (id) {
      case 'Dynamite': return this._randomInt(1, 300) + 1 + level * 2;
      case 'StrengthDrink': return this._randomInt(1, 300) + 100;
      case 'LuckyClover': return this._randomInt(1, level * 50) + 1 + level * 2;
      case 'RockCollectorsBook': return this._randomInt(1, 150) + 1;
      case 'GemPolish': return this._randomInt(1, level * 100) + 201;
      default: throw new Error('Unknown shop item');
    }
  }

  buyItem(id) {
    if (this.state !== 'shop') return { ok: false, reason: '现在不能购物' };
    const item = this.shopItems.find(candidate => candidate.id === id);
    if (!item || item.purchased) return { ok: false, reason: '这件商品已经售罄' };
    if (id === 'Dynamite' && this.player.dynamiteCount >= 12) return { ok: false, reason: '炸药已达到携带上限' };
    if (this.player.money < item.price) return { ok: false, reason: '金币不足，再接再厉！' };
    this.player.money -= item.price;
    item.purchased = true;
    if (item.flag) this.player[item.flag] = true;
    else this.player.dynamiteCount++;
    this._sound('Money');
    this._save();
    return { ok: true };
  }

  nextLevel() {
    if (this.state !== 'shop' || this.player.level >= MAX_LEVEL) return false;
    this.player.level++;
    this.player.goal = goalForLevel(this.player.level);
    this.player.goalAddOn = 275 + Math.min(this.player.level - 1, 8) * 270;
    this.result = null;
    this.shopItems = [];
    this._prepareLevel();
    this._setState('ready');
    this._sound('Goal');
    this._save();
    return true;
  }

  returnToMenu() {
    this._setState('menu');
    return true;
  }

  _positionHook() {
    const hook = this.hook;
    const radians = hook.angle * Math.PI / 180;
    const dx = -Math.sin(radians), dy = Math.cos(radians);
    hook.x = hook.originX + dx * hook.length;
    hook.y = hook.originY + dy * hook.length;
    hook.tipX = hook.originX + dx * (hook.length + 13);
    hook.tipY = hook.originY + dy * (hook.length + 13);
    if (hook.grabbedId !== null) {
      const entity = this.entities.find(item => item.id === hook.grabbedId);
      if (entity) { entity.x = hook.tipX - entity.width / 2; entity.y = hook.tipY - entity.height / 3; }
    }
  }

  update(dt) {
    if (this.state !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    // Fixed steps make hook collisions and mole movement identical on 30/60/120 Hz screens.
    this._accumulator += Math.min(dt, LEVEL_DURATION);
    while (this._accumulator + 1e-9 >= STEP && this.state === 'playing') {
      this._accumulator -= STEP;
      this._step(STEP);
    }
  }

  _step(dt) {
    const step = Math.min(dt, this.timeLeft);
    this.elapsed += step;
    this.timeLeft = Math.max(0, this.timeLeft - step);
    this.effects.forEach(effect => { effect.ttl -= step; });
    this.effects = this.effects.filter(effect => effect.ttl > 0);
    this._updateMoles(step);
    this._updateHook(step);
    if (this.timeLeft < 1e-8) { this.timeLeft = 0; this._settle('timeout'); return; }
    if (this.hook.state === 'swinging' && !this.entities.some(item => item.active)) { this._settle('empty'); return; }
    this._saveTimer += step;
    if (this._saveTimer >= 5) { this._saveTimer = 0; this._save(); }
  }

  _updateMoles(dt) {
    this.entities.forEach(entity => {
      if (!entity.active || entity.grabbed || !ENTITY_CONFIG[entity.type].mobile) return;
      if (entity.idleTimer > 0) { entity.idleTimer = Math.max(0, entity.idleTimer - dt); entity.moving = false; return; }
      entity.moving = true;
      entity.x += entity.direction * 60 * dt;
      if (entity.x <= entity.minX || entity.x >= entity.maxX) {
        entity.x = clamp(entity.x, entity.minX, entity.maxX);
        entity.direction *= -1;
        entity.idleTimer = 1;
        entity.moving = false;
      }
    });
  }

  _updateHook(dt) {
    const hook = this.hook;
    const speedScale = (this.fieldHeight - 30) / 210;
    const maxLength = this.fieldHeight === 240 ? MAX_LENGTH : Math.hypot(320, this.fieldHeight - 30);
    if (hook.state === 'swinging') {
      hook.angle += hook.swingDirection * HOOK_SWING * dt;
      if (hook.angle <= -75 || hook.angle >= 75) {
        hook.angle = clamp(hook.angle, -75, 75);
        hook.swingDirection *= -1;
      }
      this._positionHook();
      return;
    }
    if (hook.state === 'reward') {
      hook.rewardTimer -= dt;
      if (hook.rewardTimer <= 0) this._resetHook();
      return;
    }
    if (hook.state === 'extending') {
      const oldX = hook.tipX, oldY = hook.tipY;
      hook.length = Math.min(maxLength, hook.length + dt * HOOK_SPEED * speedScale);
      this._positionHook();
      const hits = this.entities.filter(entity => entity.active && !entity.grabbed &&
        segmentDistance(entity.x + entity.width / 2, entity.y + entity.height / 2, oldX, oldY, hook.tipX, hook.tipY) <= entity.radius + 6);
      hits.sort((a, b) => Math.hypot(a.x + a.width / 2 - oldX, a.y + a.height / 2 - oldY) - Math.hypot(b.x + b.width / 2 - oldX, b.y + b.height / 2 - oldY));
      if (hits.length) this._grab(hits[0]);
      else if (hook.length >= maxLength || hook.tipX <= 2 || hook.tipX >= 318 || hook.tipY >= this.fieldHeight - 2) {
        hook.state = 'retracting';
        this._sound('GrabBack');
      }
      return;
    }
    if (hook.state === 'retracting') {
      const entity = this.entities.find(item => item.id === hook.grabbedId);
      const speed = (entity ? HOOK_SPEED * this.player.strength / entity.mass : HOOK_SPEED) * speedScale;
      hook.length = Math.max(0, hook.length - speed * dt);
      this._positionHook();
      if (hook.length <= 0) {
        if (entity && entity.active) this._collect(entity);
        else this._resetHook();
      }
    }
  }

  _grab(entity) {
    entity.grabbed = true;
    if (!entity.effectsApplied) {
      if (this.player.hasStrengthDrink) entity.mass /= 1.5;
      if (this.player.hasRockCollectorsBook && /Rock$/.test(entity.type)) entity.bonus *= 3;
      if (this.player.hasGemPolish && entity.type === 'Diamond') entity.bonus *= 1.5;
      if (this.player.hasGemPolish && entity.type === 'MoleWithDiamond') entity.bonus = (entity.bonus - 2) * 1.5 + 2;
      entity.effectsApplied = true;
    }
    this.hook.grabbedId = entity.id;
    this.hook.state = 'retracting';
    this._sound(ENTITY_CONFIG[entity.type].value);
    this._sound('GrabBack');
    if (entity.type === 'TNT') this._explode(entity);
    this._positionHook();
  }

  _explode(source) {
    const queue = [source];
    const seen = new Set();
    while (queue.length) {
      const tnt = queue.shift();
      if (seen.has(tnt.id)) continue;
      seen.add(tnt.id);
      tnt.destroyed = true;
      const x = tnt.x + tnt.width / 2, y = tnt.y + tnt.height / 2;
      this.effects.push({ type: 'explosion', x, y, ttl: 0.5, duration: 0.5, radius: 50 });
      this.entities.forEach(entity => {
        if (!entity.active || seen.has(entity.id) || entity.id === source.id) return;
        if (Math.hypot(entity.x + entity.width / 2 - x, entity.y + entity.height / 2 - y) > 50 + entity.radius) return;
        if (entity.type === 'TNT') queue.push(entity);
        entity.active = false;
        entity.destroyed = true;
      });
    }
    this._sound('Explosive');
  }

  _collect(entity) {
    let text;
    if (entity.type === 'QuestionBag' && this._randomInt(1, 100) <= (this.player.hasLuckyClover ? 40 : 20)) {
      if (this._randomInt(1, 100) <= 20 && this.player.dynamiteCount < 12) {
        this.player.dynamiteCount++;
        text = '获得炸药 +1';
      } else {
        this.player.strength = Math.min(6, this.player.strength * 1.5 + 1);
        text = '力量提升！';
      }
      this._sound('High');
    } else {
      this.player.money += entity.bonus;
      text = '+' + entity.bonus;
      this._sound('Money');
    }
    this.effects.push({ type: 'bonus', x: 158, y: 34, text, ttl: 1, duration: 1 });
    entity.active = false;
    entity.grabbed = false;
    this.hook.grabbedId = null;
    this.hook.state = 'reward';
    this.hook.rewardTimer = 0.75;
    this._save();
  }

  _resetHook() {
    this.hook = freshHook();
    this._positionHook();
    this._sound('HookReset');
  }

  exportSave() {
    if (this.state === 'menu' || this.state === 'gameover') return null;
    return copy({ version: SAVE_VERSION, fieldHeight: this.fieldHeight, state: this.state, player: this.player, levelId: this.levelId,
      timeLeft: this.timeLeft, elapsed: this.elapsed, startMoney: this.startMoney,
      entities: this.entities, hook: this.hook, shopItems: this.shopItems, result: this.result });
  }

  restoreSave(data) {
    const snapshot = validateSave(data);
    if (!snapshot) return false;
    this.player = snapshot.player;
    this.fieldHeight = snapshot.fieldHeight;
    this.levelId = snapshot.levelId;
    this.background = LEVELS[this.levelId].background;
    this.timeLeft = snapshot.timeLeft;
    this.elapsed = snapshot.elapsed;
    this.startMoney = snapshot.startMoney;
    this.entities = snapshot.entities;
    this.hook = snapshot.hook;
    this.shopItems = snapshot.shopItems;
    this.result = snapshot.result;
    this.effects = [];
    this._accumulator = 0;
    this._saveTimer = 0;
    this._positionHook();
    this._setState(snapshot.state === 'playing' ? 'paused' : snapshot.state);
    return true;
  }
}

function validateSave(data) {
  // Storage is untrusted: restore known fields only and reject partial/inconsistent runs.
  if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION || !['ready', 'playing', 'paused', 'result', 'shop'].includes(data.state)) return null;
  const fieldHeight = data.fieldHeight == null ? 240 : data.fieldHeight;
  if (!finite(fieldHeight, 240, 1200)) return null;
  const p = data.player;
  if (!p || !integer(p.level, 1, MAX_LEVEL) || !integer(p.money, 0, 1e10) || p.goal !== goalForLevel(p.level)
    || p.goalAddOn !== 275 + Math.min(p.level - 1, 8) * 270 || !integer(p.dynamiteCount, 0, 12)
    || !finite(p.strength, 1, 6) || BUFF_FLAGS.some(flag => typeof p[flag] !== 'boolean')) return null;
  if (typeof data.levelId !== 'string' || !own(LEVELS, data.levelId)
    || !data.levelId.startsWith('L' + levelGroup(p.level) + '_')
    || !finite(data.timeLeft, 0, LEVEL_DURATION) || !finite(data.elapsed, 0, LEVEL_DURATION + 0.01)
    || !integer(data.startMoney, 0, 1e10)) return null;
  if (['ready', 'playing', 'paused'].includes(data.state) && data.timeLeft <= 0) return null;
  const layout = LEVELS[data.levelId].entities;
  if (!Array.isArray(data.entities) || data.entities.length !== layout.length) return null;
  const entities = [];
  for (let index = 0; index < data.entities.length; index++) {
    const e = data.entities[index];
    if (!e || e.id !== index || e.type !== layout[index].type) return null;
    const c = ENTITY_CONFIG[e.type];
    if (!finite(e.x, -50, 350) || !finite(e.y, 0, fieldHeight + 30) || !finite(e.mass, 0.5, 10) || !integer(e.bonus, 0, 1000)
      || ![-1, 1].includes(e.direction) || !finite(e.minX, -20, 320) || !finite(e.maxX, e.minX, 340)
      || !finite(e.idleTimer, 0, 1) || ['active', 'grabbed', 'destroyed', 'moving', 'effectsApplied'].some(key => typeof e[key] !== 'boolean')) return null;
    entities.push({ id: index, type: e.type, x: e.x, y: e.y, width: c.width, height: c.height,
      radius: (c.width + c.height) / 4, mass: e.mass, bonus: e.bonus, active: e.active, grabbed: e.grabbed,
      destroyed: e.destroyed, direction: e.direction, moving: e.moving, minX: e.minX, maxX: e.maxX,
      idleTimer: e.idleTimer, effectsApplied: e.effectsApplied });
  }
  const h = data.hook;
  if (!h || !['swinging', 'extending', 'retracting', 'reward'].includes(h.state) || !finite(h.angle, -75, 75)
    || ![-1, 1].includes(h.swingDirection) || !finite(h.length, 0, fieldHeight === 240 ? MAX_LENGTH : Math.hypot(320, fieldHeight - 30)) || !finite(h.rewardTimer, 0, 1)) return null;
  if (h.grabbedId !== null && (!integer(h.grabbedId, 0, entities.length - 1) || h.state !== 'retracting'
    || !entities[h.grabbedId].active || !entities[h.grabbedId].grabbed)) return null;
  if (entities.some(e => e.grabbed && e.id !== h.grabbedId)) return null;
  if ((h.state === 'swinging' || h.state === 'reward') && (h.length !== 0 || h.grabbedId !== null)) return null;
  if (!Array.isArray(data.shopItems) || data.shopItems.length > SHOP_ITEMS.length) return null;
  const shopItems = [], ids = new Set();
  for (const item of data.shopItems) {
    const config = item && SHOP_ITEMS.find(candidate => candidate.id === item.id);
    if (!config || ids.has(item.id) || !integer(item.price, 1, 1e8) || typeof item.purchased !== 'boolean') return null;
    ids.add(item.id);
    shopItems.push(Object.assign({}, config, { price: item.price, purchased: item.purchased }));
  }
  let result = null;
  if (data.state === 'result' || data.state === 'shop') {
    const r = data.result;
    if (!r || r.success !== true || r.level !== p.level || r.goal !== p.goal || !integer(r.money, p.goal, 1e10)
      || !integer(r.earned, 0, 1e10) || !['manual', 'timeout', 'empty'].includes(r.reason)) return null;
    result = { success: true, money: r.money, goal: r.goal, earned: r.earned, level: r.level, reason: r.reason };
    if (data.state === 'shop' && !shopItems.length) return null;
  } else if (data.result !== null || shopItems.length) return null;
  const player = freshPlayer();
  Object.keys(player).forEach(key => { player[key] = p[key]; });
  const hook = Object.assign(freshHook(), { state: h.state, angle: h.angle, swingDirection: h.swingDirection,
    length: h.length, grabbedId: h.grabbedId, rewardTimer: h.rewardTimer });
  return { state: data.state, fieldHeight, player, levelId: data.levelId, timeLeft: data.timeLeft, elapsed: data.elapsed,
    startMoney: data.startMoney, entities, hook, shopItems, result };
}

module.exports = { Game, ENTITY_CONFIG, SHOP_ITEMS, LEVEL_DURATION, levelGroup, goalForLevel };
