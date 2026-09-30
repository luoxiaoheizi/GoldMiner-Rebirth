'use strict';

const theme = require('./theme');
const C = theme.colors;
const ENTITY_IMAGES = {
  MiniGold: 'gold_mini', NormalGold: 'gold_normal', NormalGoldPlus: 'gold_normal_plus',
  BigGold: 'gold_big', MiniRock: 'rock_mini', NormalRock: 'rock_normal', BigRock: 'rock_big',
  Diamond: 'diamond', QuestionBag: 'question_bag', Skull: 'skull', Bone: 'bone', TNT: 'tnt',
  Mole: 'mole_sheet', MoleWithDiamond: 'mole_with_diamond_sheet',
};
const PROP_IMAGES = {
  Dynamite: 'dynamite', StrengthDrink: 'strength_drink', LuckyClover: 'lucky_clover',
  RockCollectorsBook: 'rock_collectors_book', GemPolish: 'gem_polish',
};
const ASSETS = Array.from(new Set(Object.values(ENTITY_IMAGES).concat(Object.values(PROP_IMAGES), [
  'bg_level_A', 'bg_level_B', 'bg_level_C', 'bg_level_D', 'bg_level_E', 'bg_top',
  'miner_sheet', 'hook_sheet', 'shopkeeper_sheet', 'explosive_fx_sheet', 'tnt_destroyed',
])));

function inside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function computeLayout(width, height, safeArea) {
  const safe = safeArea || { left: 0, top: 0, right: width, bottom: height };
  const left = Math.max(0, safe.left || 0);
  const top = Math.max(0, safe.top || 0);
  const right = Math.min(width, safe.right == null ? width : safe.right);
  const bottom = Math.min(height, safe.bottom == null ? height : safe.bottom);
  const w = Math.min(1280, right - left);
  const h = Math.min(850, bottom - top);
  const x = left + (right - left - w) / 2;
  const y = top + (bottom - top - h) / 2;
  const gap = w < 700 ? 12 : 20;
  const header = { x: x + gap, y: y + 4, w: w - gap * 2, h: 48 };
  const contentY = y + 60;
  const contentH = h - 68;
  const landscape = w >= 480 && w > h;
  let board, panel;
  if (landscape) {
    const side = Math.max(200, Math.min(360, w * 0.34));
    const bh = Math.min(contentH, (w - side - gap * 3) * 0.75);
    board = { x: x + gap, y: contentY + (contentH - bh) / 2, w: bh * 4 / 3, h: bh };
    panel = { x: board.x + board.w + gap, y: contentY, w: w - board.w - gap * 3, h: contentH };
  } else {
    const bw = Math.min(w - gap * 2, Math.max(110, contentH - 280 - gap) * 4 / 3);
    board = { x: x + (w - bw) / 2, y: contentY, w: bw, h: bw * 0.75 };
    panel = { x: x + gap, y: board.y + board.h + gap, w: w - gap * 2,
      h: y + h - (board.y + board.h + gap) - 8 };
  }
  return { x, y, w, h, gap, header, board, panel, landscape };
}

class Renderer {
  constructor(platform) {
    this.platform = platform;
    this.ctx = platform.context;
    this.images = {};
    this.buttons = [];
    this.hoverId = null;
    this.pressedId = null;
    this.focusId = null;
    this.layout = computeLayout(platform.width, platform.height, platform.safeArea);
  }

  resize() {
    this.layout = computeLayout(this.platform.width, this.platform.height, this.platform.safeArea);
  }

  path(x, y, w, h, r = theme.radius) {
    const ctx = this.ctx;
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  panel(rect, fill = C.surface, stroke = C.border, radius = theme.radius) {
    this.path(rect.x, rect.y, rect.w, rect.h, radius);
    this.ctx.fillStyle = fill; this.ctx.fill();
    if (stroke) { this.ctx.strokeStyle = stroke; this.ctx.lineWidth = 1; this.ctx.stroke(); }
  }

  text(value, x, y, size = 16, color = C.text, options = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `${options.bold ? '700 ' : ''}${size}px ${theme.fonts[options.font || 'body']}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = options.align || 'left';
    ctx.fillText(String(value), x, y);
    ctx.textAlign = 'left';
  }

  wrapText(value, x, y, maxWidth, size = 15, color = C.muted, lineHeight = 23) {
    const ctx = this.ctx;
    ctx.font = `${size}px ${theme.fonts.body}`;
    let line = '', row = 0;
    for (const char of String(value)) {
      if (char === '\n' || (line && ctx.measureText(line + char).width > maxWidth)) {
        this.text(line, x, y + row * lineHeight, size, color); row++; line = char === '\n' ? '' : char;
      } else line += char;
    }
    if (line) this.text(line, x, y + row++ * lineHeight, size, color);
    return row * lineHeight;
  }

  button(id, label, rect, action, options = {}) {
    const disabled = !!options.disabled;
    const primary = options.primary;
    const active = this.hoverId === id || this.focusId === id;
    const down = this.pressedId === id && !disabled;
    const fill = disabled ? C.surface : primary ? (active ? C.primaryHover : C.primary) : (active ? C.raised : C.surface);
    this.panel({ ...rect, y: rect.y + (down ? 2 : 0) }, fill, primary && !disabled ? null : C.border);
    this.text(label, rect.x + rect.w / 2, rect.y + (rect.h - 19) / 2 + (down ? 2 : 0), options.fontSize || 16,
      disabled ? C.muted : primary ? C.onPrimary : C.text, { bold: !!primary, align: 'center' });
    if (this.focusId === id) {
      this.path(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6, theme.radius + 2);
      this.ctx.strokeStyle = C.primary; this.ctx.lineWidth = 2; this.ctx.stroke();
    }
    this.buttons.push({ id, label, ...rect, action, disabled });
  }

  image(name, x, y, w, h) {
    const image = this.images[name];
    if (image) this.ctx.drawImage(image, x, y, w == null ? image.width : w, h == null ? image.height : h);
  }

  sprite(name, frame, fw, fh, x, y, w = fw, h = fh, flip = false) {
    const image = this.images[name];
    if (!image) return;
    const ctx = this.ctx;
    const cols = Math.max(1, Math.floor(image.width / fw));
    const count = cols * Math.max(1, Math.floor(image.height / fh));
    frame = Math.max(0, frame) % count;
    ctx.save();
    if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); x = 0; y = 0; }
    ctx.drawImage(image, (frame % cols) * fw, Math.floor(frame / cols) * fh, fw, fh, x, y, w, h);
    ctx.restore();
  }

  drawBoard(game, decorative) {
    const { board } = this.layout;
    const ctx = this.ctx;
    this.panel({ x: board.x - 5, y: board.y - 5, w: board.w + 10, h: board.h + 10 }, C.raised, C.border);
    ctx.save();
    this.path(board.x, board.y, board.w, board.h, 8); ctx.clip();
    ctx.translate(board.x, board.y); ctx.scale(board.w / 320, board.h / 240);
    ctx.imageSmoothingEnabled = false;
    const background = game.background ? `bg_level_${game.background.slice(-1)}` : 'bg_level_B';
    this.image(background, 0, 0, 320, 240);
    this.image('bg_top', 0, 0, 320, 40);
    const entities = decorative ? [
      { type: 'BigGold', x: 42, y: 120 }, { type: 'NormalGold', x: 199, y: 97 },
      { type: 'BigGold', x: 258, y: 161 }, { type: 'NormalRock', x: 101, y: 180 },
      { type: 'Diamond', x: 251, y: 83 }, { type: 'QuestionBag', x: 75, y: 205 },
      { type: 'NormalGoldPlus', x: 176, y: 205 }, { type: 'MiniRock', x: 160, y: 133 },
    ] : game.entities || [];
    entities.forEach(entity => {
      if (entity.active === false) return;
      const name = entity.destroyed ? 'tnt_destroyed' : ENTITY_IMAGES[entity.type];
      if (entity.type === 'Mole' || entity.type === 'MoleWithDiamond') {
        this.sprite(name, Math.floor((game.elapsed || 0) / 0.15) % 7, 18, 13, entity.x, entity.y, 18, 13, entity.direction > 0);
      } else this.image(name, entity.x, entity.y);
    });
    const hook = decorative ? { originX: 158, originY: 30, x: 124, y: 74, angle: 36, state: 'swinging' } : game.hook;
    const moving = hook && (hook.state === 'retracting' || hook.state === 'extending');
    this.sprite('miner_sheet', moving ? Math.floor((game.elapsed || 0) / 0.13) % 3 : 0, 32, 40, 149, -1);
    if (hook) {
      ctx.strokeStyle = C.onPrimary; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(hook.originX, hook.originY); ctx.lineTo(hook.x, hook.y); ctx.stroke();
      ctx.save(); ctx.translate(hook.x, hook.y); ctx.rotate(hook.angle * Math.PI / 180);
      this.sprite('hook_sheet', hook.grabbedId == null ? 0 : 1, 13, 15, -6.5, 0);
      ctx.restore();
    }
    if (!decorative) (game.effects || []).forEach(effect => {
      if (effect.type === 'explosion') {
        const frame = Math.floor((1 - effect.ttl / effect.duration) * 12);
        this.sprite('explosive_fx_sheet', frame, 64, 64, effect.x - 32, effect.y - 32);
      } else {
        const rise = this.platform.reducedMotion ? 0 : (1 - effect.ttl / effect.duration) * 12;
        this.text(effect.text || '', effect.x, effect.y - 10 - rise, 9, C.onPrimary, { align: 'center', bold: true });
      }
    });
    this.text('黄金矿区', 8, 9, 9, C.onPrimary, { bold: true });
    this.text(decorative ? '好运，矿工！' : `第 ${game.player.level} 关`, 310, 9, 9, C.onPrimary, { align: 'right' });
    ctx.restore();
  }

  header(app) {
    const r = this.layout.header;
    this.text('黄金矿工', r.x, r.y + 9, 23, C.primary, { font: 'title', bold: true });
    const soundX = r.x + r.w - (app.game.state === 'playing' ? 174 : 86);
    this.button('sound', app.muted ? '声音：关' : '声音：开', { x: soundX, y: r.y, w: 86, h: 48 }, 'sound');
    if (app.game.state === 'playing') {
      this.button('pause', '暂停', { x: r.x + r.w - 76, y: r.y, w: 76, h: 48 }, 'pause');
    } else if (app.game.state === 'menu') {
      this.button('help', '玩法', { x: soundX - 78, y: r.y, w: 68, h: 48 }, 'help');
    }
  }

  menu(app) {
    const p = this.layout.panel, compact = p.h < 300;
    const blockH = compact ? (app.hasRun ? 166 : 146) : (app.hasRun ? 290 : 236);
    const y = p.y + Math.max(0, (p.h - blockH) / 2);
    this.text('黄金矿工' + (compact ? ' · 重生' : ''), p.x, y, compact ? 29 : 42, C.primary, { font: 'title', bold: true });
    if (!compact) this.text('重 生', p.x + 3, y + 51, 20, C.text, { font: 'title' });
    this.text('看准时机，一钩好运。', p.x, y + (compact ? 37 : 88), 14, C.muted);
    const startY = y + (compact ? 62 : 124);
    this.button('start', app.hasRun ? '继续挖矿' : '开始挖矿', { x: p.x, y: startY, w: p.w, h: 48 }, app.hasRun ? 'continue' : 'new', { primary: true });
    if (app.hasRun) this.button('new', '重新开始', { x: p.x, y: startY + 56, w: p.w, h: 48 }, 'new');
    if (!compact || !app.hasRun) {
      const recordY = startY + (app.hasRun ? 122 : 66), best = app.best;
      this.text(best.money ? '本机最佳  ' + best.money + ' 金币 · 第 ' + best.level + ' 关' : '无需登录，随时开挖', p.x, recordY, 12, C.muted);
    }
  }

  stats(game, rect) {
    this.text('已获金币', rect.x, rect.y, 13, C.muted);
    this.text(`${Math.floor(game.player.money)}`, rect.x, rect.y + 22, 30, C.primary, { font: 'number', bold: true });
    this.text(`目标 ${game.player.goal}`, rect.x + rect.w, rect.y + 3, 14, C.muted, { align: 'right' });
    this.text(`${Math.ceil(game.timeLeft)} 秒`, rect.x + rect.w, rect.y + 27, 22,
      game.timeLeft <= 10 ? C.danger : C.text, { align: 'right', font: 'number', bold: true });
    const progress = Math.min(1, game.player.money / game.player.goal);
    this.panel({ x: rect.x, y: rect.y + 65, w: rect.w, h: 7 }, C.raised, null, 3);
    if (progress > 0) this.panel({ x: rect.x, y: rect.y + 65, w: rect.w * progress, h: 7 }, C.primary, null, 3);
  }

  playing(app) {
    const game = app.game, p = this.layout.panel;
    const compact = p.h < 300;
    const y = p.y + Math.max(0, (p.h - (compact ? 164 : 294)) / 2);
    const canDrop = game.hook.state === 'swinging';
    const canBomb = game.player.dynamiteCount > 0 && game.hook.grabbedId != null && game.hook.state === 'retracting';
    const reached = game.player.money >= game.player.goal;
    if (compact) {
      this.text('金币 ' + Math.floor(game.player.money), p.x, y, 22, C.primary, { font: 'number', bold: true });
      this.text(Math.ceil(game.timeLeft) + ' 秒', p.x + p.w, y + 2, 20, game.timeLeft <= 10 ? C.danger : C.text, { align: 'right' });
      this.text('目标 ' + game.player.goal + (reached ? ' · 已达成' : ''), p.x, y + 30, 14, C.muted);
      this.button('drop', canDrop ? '放下钩爪' : game.hook.state === 'extending' ? '钩爪已出发' : '钩爪回收中', { x: p.x, y: y + 60, w: p.w, h: 48 }, 'drop', { primary: true, disabled: !canDrop });
      const half = (p.w - 8) / 2;
      this.button('bomb', '炸药 × ' + game.player.dynamiteCount, { x: p.x, y: y + 116, w: reached ? half : p.w, h: 48 }, 'bomb', { disabled: !canBomb, fontSize: 14 });
      if (reached) this.button('finish', '提前收工', { x: p.x + half + 8, y: y + 116, w: half, h: 48 }, 'finish', { fontSize: 14 });
      return;
    }
    this.stats(game, { ...p, y });
    const status = canDrop ? '钩爪摆动中，看准再出手' : game.hook.state === 'extending' ? '钩爪已出发…' : '正在回收，请稍等';
    this.text(status, p.x, y + 88, 14, C.muted);
    this.button('drop', canDrop ? '放下钩爪' : '钩爪回收中', { x: p.x, y: y + 120, w: p.w, h: 54 }, 'drop', { primary: true, disabled: !canDrop });
    this.button('bomb', '使用炸药 × ' + game.player.dynamiteCount, { x: p.x, y: y + 186, w: p.w, h: 48 }, 'bomb', { disabled: !canBomb });
    if (reached) this.button('finish', '目标达成，提前收工', { x: p.x, y: y + 246, w: p.w, h: 48 }, 'finish');
    else this.wrapText(game.player.dynamiteCount ? '抓到重物后，可用炸药快速脱钩。' : '也可轻点矿区放钩；炸药在商店购买。', p.x, y + 246, p.w, 13, C.muted, 20);
  }

  ready(app) {
    const p = this.layout.panel, game = app.game, compact = p.h < 270;
    const y = p.y + Math.max(0, (p.h - (compact ? 164 : 245)) / 2);
    this.text('第 ' + game.player.level + ' 关 · 新的矿脉', p.x, y, compact ? 23 : 28, C.primary, { font: 'title', bold: true });
    this.text('目标 ' + game.player.goal + ' 金币', p.x, y + (compact ? 35 : 52), compact ? 21 : 25, C.text, { bold: true });
    this.text('当前持有 ' + game.player.money + ' 金币', p.x, y + (compact ? 66 : 93), 14, C.muted);
    this.text('60 秒内累计达标即可过关', p.x, y + (compact ? 88 : 123), 13, C.muted);
    this.button('begin', '开始本关', { x: p.x, y: y + (compact ? 116 : 188), w: p.w, h: 48 }, 'begin', { primary: true });
  }

  result(app) {
    const p = this.layout.panel, game = app.game, result = game.result || { success: false, earned: 0 };
    const compact = p.h < 310;
    const y = p.y + Math.max(0, (p.h - (compact ? 164 : 304)) / 2);
    this.text(result.success ? '收工大吉' : '这次差一点', p.x, y, compact ? 27 : 34, result.success ? C.primary : C.text, { font: 'title', bold: true });
    this.text('第 ' + game.player.level + ' 关 · ' + (result.success ? '目标达成' : '未达目标'), p.x, y + (compact ? 34 : 49), 14, C.muted);
    this.text(game.player.money + ' 金币', p.x, y + (compact ? 59 : 82), compact ? 25 : 30, C.primary, { font: 'number', bold: true });
    if (compact) {
      this.text(result.success ? '本关挖到 ' + result.earned + ' 金币' : '本关目标 ' + game.player.goal + ' 金币', p.x, y + 92, 13, C.muted);
      const half = (p.w - 8) / 2;
      this.button('result-next', result.success ? '前往商店' : '再挖一次', { x: p.x, y: y + 116, w: half, h: 48 }, result.success ? 'shop' : 'restart', { primary: true, fontSize: 14 });
      this.button('result-menu', '返回首页', { x: p.x + half + 8, y: y + 116, w: half, h: 48 }, 'menu', { fontSize: 14 });
    } else {
      this.wrapText(result.success ? '本关挖到 ' + result.earned + ' 金币，去商店挑件好工具吧。' : '目标是 ' + game.player.goal + ' 金币。小金块回收快，钻石价值高，再试一次吧。', p.x, y + 124, p.w, 15, C.muted, 23);
      this.button('result-next', result.success ? '前往商店' : '再挖一次', { x: p.x, y: y + 196, w: p.w, h: 48 }, result.success ? 'shop' : 'restart', { primary: true });
      this.button('result-menu', '返回首页', { x: p.x, y: y + 256, w: p.w, h: 48 }, 'menu');
    }
  }

  shop(app) {
    const game = app.game, p = this.layout.panel, board = this.layout.board;
    const item = game.shopItems[app.shopIndex % game.shopItems.length];
    if (!item) return;
    this.panel(board, C.surface, C.border);
    const compact = board.h < 220, pad = compact ? 12 : 20;
    const x = board.x + pad, contentW = board.w - pad * 2;
    const contentH = compact ? 154 : 196;
    const y = board.y + Math.max(pad, (board.h - contentH) / 2);
    this.text('矿工补给站 · ' + (app.shopIndex + 1) + ' / ' + game.shopItems.length, x, y, compact ? 12 : 15, C.muted);
    if (!compact) this.sprite('shopkeeper_sheet', 0, 80, 80, board.x + board.w - pad - 42, y - 7, 42, 42);
    const image = this.images[PROP_IMAGES[item.id]], size = compact ? 28 : 38;
    if (image) {
      const scale = Math.min(size / image.width, size / image.height);
      this.image(PROP_IMAGES[item.id], x, y + 29, image.width * scale, image.height * scale);
    }
    this.text(item.name, x + size + 9, y + 31, compact ? 20 : 23, C.text, { bold: true });
    this.wrapText(item.description, x, y + (compact ? 67 : 86), contentW, compact ? 12 : 14, C.muted, compact ? 17 : 22);
    this.text('钱包：' + game.player.money + ' 金币', x, board.y + board.h - pad - 17, 14, C.primary, { bold: true });
    const navY = p.y + Math.max(0, (p.h - 160) / 2), half = (p.w - 12) / 2;
    this.button('prev-item', '上一件', { x: p.x, y: navY, w: half, h: 48 }, 'prev-item');
    this.button('next-item', '下一件', { x: p.x + half + 12, y: navY, w: half, h: 48 }, 'next-item');
    const enough = game.player.money >= item.price;
    this.button('buy', item.purchased ? '已购买' : enough ? '购买 · ' + item.price + ' 金币' : '金币不足 · 需要 ' + item.price, { x: p.x, y: navY + 56, w: p.w, h: 48 }, 'buy:' + item.id, { primary: true, disabled: item.purchased || !enough });
    this.button('next-level', '准备下一关', { x: p.x, y: navY + 112, w: p.w, h: 48 }, 'next-level');
  }

  modal(app, type) {
    const ctx = this.ctx, l = this.layout;
    ctx.fillStyle = C.overlay; ctx.fillRect(0, 0, this.platform.width, this.platform.height);
    this.buttons = [];
    const compact = l.h < 380;
    const w = Math.min(compact ? 650 : 420, l.w - 24), h = Math.min(type === 'help' ? 362 : 310, l.h - 16);
    const r = { x: l.x + (l.w - w) / 2, y: l.y + (l.h - h) / 2, w, h };
    this.panel(r, C.surface, C.border, 16);
    const pad = compact ? 16 : 24, x = r.x + pad, y = r.y + pad, contentW = r.w - pad * 2;
    if (compact) {
      const columnGap = 24, actionW = Math.min(224, contentW * 0.42), copyW = contentW - actionW - columnGap;
      const actionX = x + copyW + columnGap;
      this.text(type === 'help' ? '下矿小贴士' : type === 'restart' ? '重新开局？' : '歇一会儿', x, y + 3, 27, C.primary, { font: 'title', bold: true });
      const message = type === 'help' ? '看准方向，点击矿区或按钮放钩。金块越重，回收越慢；钻石轻而值钱。抓到重物可用炸药。每关 60 秒，金币累计达标就过关。' : type === 'restart' ? '将从第 1 关重新开始，当前进度会被覆盖。本机最佳纪录会保留。' : '游戏已暂停，倒计时也停住了。';
      this.wrapText(message, x, y + 46, copyW, 14, C.text, 21);
      if (type === 'help') {
        if (app.platform && app.platform.kind === 'web') this.wrapText('键盘：↓ / 空格放钩\n↑ 炸药，Esc 暂停', actionX, y + 12, actionW, 13, C.muted, 22);
        this.button('close-help', '知道了，开挖', { x: actionX, y: r.y + r.h - pad - 48, w: actionW, h: 48 }, 'close');
      } else if (type === 'restart') {
        const by = r.y + r.h - pad - 104;
        this.button('cancel-restart', '继续当前进度', { x: actionX, y: by, w: actionW, h: 48 }, 'close', { primary: true });
        this.button('confirm-restart', '确认重新开始', { x: actionX, y: by + 56, w: actionW, h: 48 }, 'restart');
      } else {
        const by = r.y + (r.h - 160) / 2;
        this.button('resume', '继续挖矿', { x: actionX, y: by, w: actionW, h: 48 }, 'resume', { primary: true });
        this.button('paused-sound', app.muted ? '开启声音' : '关闭声音', { x: actionX, y: by + 56, w: actionW, h: 48 }, 'sound');
        this.button('save-menu', '保存并返回首页', { x: actionX, y: by + 112, w: actionW, h: 48 }, 'menu', { fontSize: 14 });
      }
      return;
    }
    if (type === 'help') {
      this.text('下矿小贴士', x, y, 27, C.primary, { font: 'title', bold: true });
      this.wrapText('看准方向，点击矿区或按钮放钩。\n金块越重，回收越慢；钻石轻而值钱。\n抓到重物时，可用炸药。\n每关 60 秒，金币累计达标就过关。', x, y + 49, contentW, 15, C.text, 24);
      if (app.platform && app.platform.kind === 'web') this.text('键盘：↓ / 空格放钩，↑ 炸药，Esc 暂停', x, r.y + r.h - 95, 12, C.muted);
      this.button('close-help', '知道了，开挖', { x, y: r.y + r.h - 72, w: contentW, h: 48 }, 'close');
    } else if (type === 'restart') {
      this.text('重新开局？', x, y, 27, C.primary, { font: 'title', bold: true });
      this.wrapText('将从第 1 关重新开始，当前进度会被覆盖。本机最佳纪录会保留。', x, y + 49, contentW, 16, C.text, 25);
      this.button('cancel-restart', '继续当前进度', { x, y: r.y + r.h - 128, w: contentW, h: 48 }, 'close', { primary: true });
      this.button('confirm-restart', '确认重新开始', { x, y: r.y + r.h - 68, w: contentW, h: 48 }, 'restart');
    } else {
      this.text('歇一会儿', x, y, 30, C.primary, { font: 'title', bold: true });
      this.wrapText('游戏已暂停，倒计时也停住了。', x, y + 48, contentW, 16);
      this.button('resume', '继续挖矿', { x, y: r.y + r.h - 182, w: contentW, h: 48 }, 'resume', { primary: true });
      this.button('paused-sound', app.muted ? '开启声音' : '关闭声音', { x, y: r.y + r.h - 120, w: contentW, h: 48 }, 'sound');
      this.button('save-menu', '保存并返回首页', { x, y: r.y + r.h - 60, w: contentW, h: 48 }, 'menu');
    }
  }

  loading(app) {
    const l = this.layout;
    const x = l.x + l.w / 2, y = l.y + l.h / 2 - 64;
    this.text('黄金矿工 · 重生', x, y, 34, C.primary, { font: 'title', align: 'center', bold: true });
    this.text(app.loadError ? '矿区资源加载失败' : `正在准备矿区… ${app.progress}%`, x, y + 58, 16, C.text, { align: 'center' });
    if (app.loadError) {
      this.text('请检查资源文件，然后重试。', x, y + 89, 14, C.muted, { align: 'center' });
      this.button('retry', '重新加载', { x: x - 110, y: y + 125, w: 220, h: 50 }, 'retry', { primary: true });
    }
  }

  draw(app) {
    const ctx = this.ctx;
    ctx.setTransform(this.platform.dpr, 0, 0, this.platform.dpr, 0, 0);
    ctx.fillStyle = C.background; ctx.fillRect(0, 0, this.platform.width, this.platform.height);
    ctx.imageSmoothingEnabled = false;
    this.buttons = [];
    if (!app.loaded) this.loading(app);
    else {
      this.header(app);
      this.drawBoard(app.game, app.game.state === 'menu');
      switch (app.game.state) {
        case 'menu': this.menu(app); break;
        case 'ready': this.ready(app); break;
        case 'playing': case 'paused': this.playing(app); break;
        case 'result': case 'gameover': this.result(app); break;
        case 'shop': this.shop(app); break;
      }
      if (app.modal) this.modal(app, app.modal);
      else if (app.game.state === 'paused') this.modal(app, 'paused');
    }
    if (app.notice) {
      const l = this.layout, board = l.board;
      const w = Math.min(board.w - 16, 470), h = 48;
      const candidates = [
        { x: board.x + (board.w - w) / 2, y: board.y + board.h - h - 6, w, h },
        { x: board.x + (board.w - w) / 2, y: board.y + 6, w, h },
        { x: l.x + 12, y: l.y + 4, w, h },
      ];
      // Feedback must never cover a purchase, next-level or modal action.
      const box = candidates.find(rect => this.buttons.every(button =>
        rect.x + rect.w <= button.x || rect.x >= button.x + button.w || rect.y + rect.h <= button.y || rect.y >= button.y + button.h));
      if (box) {
        this.panel(box, C.raised, C.primary);
        this.wrapText(app.notice, box.x + 10, box.y + 7, box.w - 20, 12, C.text, 17);
      }
    }
    return this.buttons;
  }
}

module.exports = { Renderer, ASSETS, ENTITY_IMAGES, PROP_IMAGES, computeLayout, inside };
