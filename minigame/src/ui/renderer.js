'use strict';

const theme = require('./theme');
const HD_ASSETS = require('./hd-assets.json');
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
  'miner_sheet', 'hook_sheet', 'shopkeeper_sheet', 'explosive_fx_sheet', 'tnt_destroyed', 'hd_atlas', 'game_logo',
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
  if (height > width) {
    const w = right - left, h = bottom - top;
    const groundY = Math.min(top + h * 0.28, top + Math.max(130, w * 0.38));
    const board = { x: left, y: groundY, w, h: bottom - groundY };
    const panelW = Math.min(380, w - 32);
    return { x: left, y: top, w, h, gap: 12, landscape: false, portrait: true,
      header: { x: left + 12, y: top + 6, w: w - 24, h: 48 }, board,
      fieldHeight: Math.max(240, Math.min(1200, 40 + board.h * 320 / w)),
      panel: { x: left + (w - panelW) / 2, y: groundY + Math.max(16, (board.h - 310) / 2), w: panelW, h: Math.min(310, board.h - 32) } };
  }
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
    if (this.atlas(name, 0, x, y, w == null && image ? image.width : w, h == null && image ? image.height : h)) return;
    if (image) this.ctx.drawImage(image, x, y, w == null ? image.width : w, h == null ? image.height : h);
  }

  atlas(name, frame, x, y, w, h, flip = false) {
    const atlas = this.images.hd_atlas, frames = HD_ASSETS.sprites[name];
    if (!atlas || !frames || !Number.isFinite(w) || !Number.isFinite(h)) return false;
    const source = frames[Math.max(0, frame) % frames.length], ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); x = 0; y = 0; }
    ctx.drawImage(atlas, source.x * atlas.width / HD_ASSETS.width, source.y * atlas.height / HD_ASSETS.height,
      source.w * atlas.width / HD_ASSETS.width, source.h * atlas.height / HD_ASSETS.height, x, y, w, h);
    ctx.restore();
    return true;
  }

  sprite(name, frame, fw, fh, x, y, w = fw, h = fh, flip = false) {
    if (this.atlas(name, frame, x, y, w, h, flip)) return;
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

  hook(grabbed) {
    const ctx = this.ctx, spread = grabbed ? 3 : 6;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 2, 2);
      ctx.lineTo(side * spread, 7); ctx.lineTo(side * (spread - 1), 11); ctx.lineTo(side * 2, 14);
      ctx.strokeStyle = '#5C626B'; ctx.lineWidth = 2.7; ctx.stroke();
      ctx.strokeStyle = '#D8DFE5'; ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 2, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ADB5BE'; ctx.fill();
    ctx.strokeStyle = '#5C626B'; ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore();
  }

  drawBoard(game, decorative) {
    if (this.layout.portrait) { this.drawPortraitBoard(game, decorative); return; }
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
      this.hook(hook.grabbedId != null);
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

  drawPortraitBoard(game, decorative) {
    const { board, fieldHeight } = this.layout, ctx = this.ctx, scale = board.w / 320;
    const ground = board.y, center = board.x + board.w / 2;
    this.terrain({ ...board, h: this.platform.height - ground }, game.background);
    ctx.fillStyle = '#E9C35C'; ctx.fillRect(board.x, ground - 3, board.w, 4);
    ctx.fillStyle = '#4C61AF'; ctx.beginPath();
    ctx.ellipse(center, ground, board.w * 0.205, board.w * 0.235, 0, Math.PI, Math.PI * 2); ctx.fill();
    const moving = game.hook && ['retracting', 'extending'].includes(game.hook.state);
    const minerScale = Math.min(scale * 2.6, (ground - this.layout.header.y - this.layout.header.h - 6) / 40);
    this.sprite('miner_sheet', moving ? Math.floor((game.elapsed || 0) / 0.13) % 3 : 0, 32, 40,
      center - 16 * minerScale, ground - 40 * minerScale, 32 * minerScale, 40 * minerScale);
    ctx.save();
    ctx.beginPath(); ctx.rect(board.x, ground - 22 * scale, board.w, board.h + 22 * scale); ctx.clip();
    ctx.translate(board.x, ground - 40 * scale); ctx.scale(scale, scale);
    const entities = decorative ? [
      { type: 'BigGold', x: 45, y: 40 + (fieldHeight - 40) * 0.28 },
      { type: 'NormalGoldPlus', x: 237, y: 40 + (fieldHeight - 40) * 0.48 },
      { type: 'NormalRock', x: 166, y: 40 + (fieldHeight - 40) * 0.59 },
      { type: 'NormalGold', x: 76, y: 40 + (fieldHeight - 40) * 0.77 },
      { type: 'Diamond', x: 254, y: 40 + (fieldHeight - 40) * 0.2 },
    ] : game.entities || [];
    entities.forEach(entity => {
      if (entity.active === false) return;
      const name = entity.destroyed ? 'tnt_destroyed' : ENTITY_IMAGES[entity.type];
      if (entity.type === 'Mole' || entity.type === 'MoleWithDiamond') {
        this.sprite(name, Math.floor((game.elapsed || 0) / 0.15) % 7, 18, 13, entity.x, entity.y, 18, 13, entity.direction > 0);
      } else this.image(name, entity.x, entity.y);
    });
    if (!decorative && game.hook) {
      const hook = game.hook;
      ctx.strokeStyle = '#352515'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(hook.originX, hook.originY); ctx.lineTo(hook.x, hook.y); ctx.stroke();
      ctx.save(); ctx.translate(hook.x, hook.y); ctx.rotate(hook.angle * Math.PI / 180);
      this.hook(hook.grabbedId != null); ctx.restore();
      (game.effects || []).forEach(effect => {
        if (effect.type === 'explosion') this.sprite('explosive_fx_sheet', Math.floor((1 - effect.ttl / effect.duration) * 12), 64, 64, effect.x - 32, effect.y - 32);
        else this.text(effect.text || '', effect.x, effect.y - 12, 13, C.text, { bold: true, align: 'center' });
      });
    }
    ctx.restore();
    if (decorative) return;
    const pad = Math.max(10, board.w * 0.022), size = Math.min(20, board.w * 0.045);
    const y = ground - 64, right = board.x + board.w - pad;
    this.text('金币', board.x + pad, y + 3, size * 0.8, C.text, { bold: true });
    this.text(Math.floor(game.player.money), board.x + pad + size * 2.2, y, size, C.success, { bold: true });
    this.text('目标', board.x + pad, y + 33, size * 0.8, C.text, { bold: true });
    this.text(game.player.goal, board.x + pad + size * 2.2, y + 30, size, C.danger, { bold: true });
    this.text('第 ' + game.player.level + ' 关', right, y, size, C.text, { bold: true, align: 'right' });
    this.text('时间 ' + Math.ceil(game.timeLeft), right, y + 30, size, C.danger, { bold: true, align: 'right' });
  }

  terrain(rect, background) {
    const ctx = this.ctx, { x, y, w, h } = rect;
    const gradient = (colors, left, right) => {
      const fill = ctx.createLinearGradient(left, y, right, y + h);
      if (!fill || typeof fill.addColorStop !== 'function') return colors[0];
      colors.forEach((color, index) => fill.addColorStop(index / (colors.length - 1), color));
      return fill;
    };
    ctx.save();
    ctx.fillStyle = gradient(['#C59442', '#FFF0CB', '#DCC287'], x, x);
    ctx.fillRect(x, y, w, h);
    const offset = ((background || 'LevelB').charCodeAt(5) - 66) * 0.025;
    const px = n => x + w * n, py = n => y + h * (n + offset);
    ctx.beginPath(); ctx.moveTo(px(0), py(0.18));
    ctx.bezierCurveTo(px(0.13), py(0.22), px(0.18), py(0.15), px(0.30), py(0.25));
    ctx.bezierCurveTo(px(0.43), py(0.35), px(0.44), py(0.29), px(0.58), py(0.28));
    ctx.bezierCurveTo(px(0.72), py(0.27), px(0.81), py(0.36), px(1), py(0.29));
    ctx.lineTo(px(1), py(0.70));
    ctx.bezierCurveTo(px(0.86), py(0.64), px(0.94), py(0.91), px(0.75), py(0.89));
    ctx.bezierCurveTo(px(0.65), py(0.91), px(0.57), py(0.95), px(0.42), py(0.87));
    ctx.bezierCurveTo(px(0.25), py(0.84), px(0.13), py(0.90), px(0), py(0.85));
    ctx.closePath();
    ctx.fillStyle = gradient(['#DABE73', '#BDA13D', '#9D8215'], x, x + w); ctx.fill();
    ctx.strokeStyle = '#E9CC88'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  header(app) {
    const r = this.layout.header;
    if (this.layout.portrait) {
      if (['playing', 'paused'].includes(app.game.state)) {
        this.button('pause', '暂停', { x: r.x, y: r.y, w: 72, h: 48 }, 'pause', { primary: true });
      } else this.button('help', '玩法', { x: r.x, y: r.y, w: 72, h: 48 }, 'help', { primary: true });
      this.button('sound', app.muted ? '声音关' : '声音开', { x: r.x + 84, y: r.y, w: 80, h: 48 }, 'sound', { primary: true });
      return;
    }
    this.text('矿工模拟器', r.x, r.y + 9, 23, C.primary, { font: 'title', bold: true });
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
    this.ctx.save(); this.ctx.imageSmoothingEnabled = true;
    this.image('game_logo', p.x + p.w - 52, y, 48, 48); this.ctx.restore();
    this.text('矿工模拟器', p.x, y, compact ? 29 : 42, C.primary, { font: 'title', bold: true });
    if (!compact) this.text('看准方向，开采矿藏', p.x + 3, y + 51, 20, C.text, { font: 'title' });
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
    if (this.layout.portrait) {
      const board = this.layout.board;
      const canBomb = game.player.dynamiteCount > 0 && game.hook.grabbedId != null && game.hook.state === 'retracting';
      const bomb = { x: board.x + 12, y: board.y + 20, w: 74, h: 58 };
      this.button('bomb', '× ' + game.player.dynamiteCount, bomb, 'bomb', { disabled: !canBomb, fontSize: 18 });
      this.image('dynamite', bomb.x + 6, bomb.y + 10, 16, 38);
      if (game.player.money >= game.player.goal) this.button('finish', '收工', { x: board.x + board.w - 86, y: board.y + 20, w: 74, h: 48 }, 'finish', { primary: true });
      if (game.elapsed < 5) this.text('轻点矿区，找准时机出钩', board.x + board.w / 2, board.y + board.h - 30, 13, C.text, { align: 'center' });
      return;
    }
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
      this.button('result-next', '再挖一次', { x: p.x, y: y + 116, w: half, h: 48 }, 'restart', { primary: true, fontSize: 14 });
      this.button('result-menu', '返回首页', { x: p.x + half + 8, y: y + 116, w: half, h: 48 }, 'menu', { fontSize: 14 });
    } else {
      this.wrapText(result.success ? '本关挖到 ' + result.earned + ' 金币，去商店挑件好工具吧。' : '目标是 ' + game.player.goal + ' 金币。小金块回收快，钻石价值高，再试一次吧。', p.x, y + 124, p.w, 15, C.muted, 23);
      this.button('result-next', '再挖一次', { x: p.x, y: y + 196, w: p.w, h: 48 }, 'restart', { primary: true });
      this.button('result-menu', '返回首页', { x: p.x, y: y + 256, w: p.w, h: 48 }, 'menu');
    }
  }

  goldWall() {
    const ctx = this.ctx, width = this.platform.width, height = this.platform.height;
    ctx.fillStyle = '#FFCE1E'; ctx.fillRect(0, 0, width, height);
    const size = Math.max(100, Math.min(width * 0.44, 240));
    for (let row = -1; row < height / size + 1; row++) {
      for (let col = -1; col < width / size + 1; col++) {
        const x = col * size + (row % 2 ? size / 2 : 0), y = row * size;
        const fill = ctx.createLinearGradient(x, y, x + size, y + size);
        if (fill && fill.addColorStop) {
          fill.addColorStop(0, '#FFF366'); fill.addColorStop(0.4, '#FFDA22'); fill.addColorStop(1, '#B8880C');
        }
        ctx.beginPath(); ctx.moveTo(x + size * 0.15, y);
        ctx.bezierCurveTo(x + size * 0.25, y - size * 0.14, x + size * 0.4, y - size * 0.03, x + size * 0.58, y);
        ctx.bezierCurveTo(x + size * 0.93, y - size * 0.07, x + size * 1.13, y + size * 0.2, x + size, y + size * 0.46);
        ctx.bezierCurveTo(x + size * 1.08, y + size * 0.7, x + size * 0.97, y + size * 1.1, x + size * 0.64, y + size);
        ctx.bezierCurveTo(x + size * 0.4, y + size * 1.08, x + size * 0.07, y + size * 1.07, x, y + size * 0.75);
        ctx.bezierCurveTo(x - size * 0.13, y + size * 0.6, x - size * 0.05, y + size * 0.46, x, y + size * 0.35);
        ctx.bezierCurveTo(x - size * 0.04, y + size * 0.12, x + size * 0.01, y + size * 0.03, x + size * 0.15, y); ctx.closePath();
        ctx.fillStyle = fill || '#FFDA22'; ctx.fill();
        ctx.strokeStyle = '#95700F'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
  }

  victory(app) {
    this.goldWall();
    const l = this.layout, w = Math.min(l.w * 0.88, 700), h = Math.min(l.h * 0.26, 240);
    const x = l.x + (l.w - w) / 2, y = l.y + (l.h - h) / 2;
    this.panel({ x, y, w, h }, '#995009', '#EF8D00', 0);
    this.ctx.strokeStyle = '#EF8D00'; this.ctx.lineWidth = 7; this.ctx.strokeRect(x, y, w, h);
    this.text('恭喜你顺利过关', x + w / 2, y + h / 2 - 19, Math.min(32, w / 9.5), '#FFE57B', { align: 'center' });
  }

  woodWall() {
    const ctx = this.ctx, w = this.platform.width, h = this.platform.height, plank = Math.max(54, w / 7);
    ctx.fillStyle = '#784628'; ctx.fillRect(0, 0, w, h);
    for (let x = 0, index = 0; x < w; x += plank, index++) {
      ctx.fillStyle = index % 2 ? '#7D482A' : '#704027'; ctx.fillRect(x + 2, 0, plank - 4, h);
      ctx.fillStyle = '#8F5431'; ctx.fillRect(x + 3, 0, 2, h);
      ctx.strokeStyle = '#6B3B23'; ctx.lineWidth = 1;
      for (let grain = 0; grain < 3; grain++) {
        const gx = x + 13 + grain * plank / 4;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx - 5, h * 0.3, gx + 6, h * 0.6, gx, h); ctx.stroke();
      }
    }
  }

  shopIcon(id, x, y, size) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
    ctx.lineWidth = 2; ctx.strokeStyle = '#352B37';
    if (id === 'Dynamite') {
      this.image('dynamite', 24, 4, 52, 90);
    } else if (id === 'RockCollectorsBook') {
      this.panel({ x: 17, y: 8, w: 65, h: 82 }, '#2D64C5', '#203866', 3);
      this.panel({ x: 23, y: 3, w: 65, h: 7 }, '#F5F0DD', '#203866', 1);
      this.text('矿石', 50, 19, 18, '#FFFFFF', { align: 'center', bold: true });
      this.image('rock_normal', 29, 48, 44, 32);
    } else if (id === 'LuckyClover') {
      ctx.strokeStyle = '#236A26'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(50, 48); ctx.bezierCurveTo(73, 60, 64, 77, 47, 93); ctx.stroke();
      for (const [cx, cy] of [[35, 26], [62, 26], [35, 49], [62, 49]]) {
        ctx.beginPath(); ctx.ellipse(cx, cy, 17, 17, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#39B34B'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx - 5, cy - 6, 4, 0, Math.PI * 2); ctx.fillStyle = '#75DE61'; ctx.fill();
      }
    } else {
      const gem = id === 'GemPolish';
      ctx.beginPath(); ctx.moveTo(38, 12); ctx.lineTo(38, 29);
      ctx.bezierCurveTo(28, 49, 14, 68, 25, 89); ctx.quadraticCurveTo(50, 100, 75, 89);
      ctx.bezierCurveTo(86, 68, 72, 49, 62, 29); ctx.lineTo(62, 12); ctx.closePath();
      ctx.fillStyle = gem ? '#4C7DEE' : '#E8BE50'; ctx.fill(); ctx.stroke();
      this.panel({ x: 34, y: 7, w: 32, h: 8 }, gem ? '#91B4FF' : '#FDE07A', '#352B37', 3);
      this.panel({ x: 30, y: 53, w: 40, h: 29 }, '#FFF2CC', null, 7);
      if (gem) this.image('diamond', 38, 57, 25, 20);
      else this.text('力', 50, 57, 24, '#8F4B20', { align: 'center', bold: true });
      ctx.beginPath(); ctx.moveTo(33, 44); ctx.lineTo(25, 70); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.restore();
  }

  shop(app) {
    this.woodWall();
    const game = app.game, l = this.layout, wide = l.w > l.h;
    const pad = 12, x = l.x + pad, w = l.w - pad * 2;
    const balanceY = l.y + (wide ? 4 : Math.min(44, l.h * 0.055));
    this.text('$ ' + game.player.money, l.x + l.w / 2, balanceY, wide ? 24 : 34, '#64CF36', { align: 'center', bold: true });
    const bubbleY = balanceY + (wide ? 32 : 62), bubbleH = wide ? 32 : 74;
    this.panel({ x, y: bubbleY, w, h: bubbleH }, '#FFFDF6', '#332619', 2);
    this.wrapText('点击货架上的道具即可购买，买好后点击下一关继续游戏。', x + 12, bubbleY + 8, w - 24, wide ? 12 : 18, '#282018', wide ? 16 : 26);
    const actionY = bubbleY + bubbleH + 16, half = (w - 24) / 2;
    this.button('invite', '邀请好友', { x: x + 6, y: actionY, w: half - 6, h: 48 }, 'invite', { primary: true, fontSize: 20 });
    this.button('next-level', '下一关', { x: x + half + 24, y: actionY, w: half - 6, h: 48 }, 'next-level', { primary: true, fontSize: 20 });
    const goodsY = actionY + 64, goodsBottom = l.y + l.h - 64;
    const columns = wide ? Math.max(1, game.shopItems.length) : 2;
    const rows = Math.max(1, Math.ceil(game.shopItems.length / columns));
    const cellW = w / columns, cellH = Math.max(48, (goodsBottom - goodsY) / rows);
    game.shopItems.forEach((item, index) => {
      const col = index % columns, row = Math.floor(index / columns);
      const card = { x: x + col * cellW + 5, y: goodsY + row * cellH, w: cellW - 10, h: cellH - (cellH > 60 ? 8 : 0) };
      const enough = game.player.money >= item.price;
      const label = item.name + ' · ' + (item.purchased ? '已购买' : item.price + ' 金币');
      const disabled = item.purchased || !enough || (item.id === 'Dynamite' && game.player.dynamiteCount >= 12);
      this.buttons.push({ id: 'buy-' + item.id, label, ...card, action: 'buy:' + item.id, disabled });
      if (this.focusId === 'buy-' + item.id || this.hoverId === 'buy-' + item.id) this.panel(card, '#8D542D', '#F9DA69', 8);
      const image = this.images[PROP_IMAGES[item.id]];
      const iconSize = Math.min(card.w * 0.63, Math.max(0, card.h - 64), 140);
      if (image && iconSize > 0) {
        this.shopIcon(item.id, card.x + (card.w - iconSize) / 2, card.y + card.h - 54 - iconSize, iconSize);
      }
      const shelfY = card.y + card.h - 27;
      this.panel({ x: card.x - 5, y: shelfY, w: cellW, h: 26 }, '#DEB77A', '#9F733C', 0);
      this.text(item.name, card.x + card.w / 2, shelfY - 24, wide ? 12 : 15, '#FFF2CB', { align: 'center' });
      this.text(item.purchased ? '已购买' : '$ ' + item.price, card.x + card.w / 2, shelfY + 2, wide ? 15 : 20,
        item.purchased || !enough ? '#71502A' : '#37891B', { align: 'center', bold: true });
    });
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
      const message = type === 'help' ? '看准方向，轻点矿区放钩。金块越重，回收越慢；钻石轻而值钱。抓到重物可用炸药。每关 60 秒，金币累计达标就过关。' : type === 'restart' ? '将从第 1 关重新开始，当前进度会被覆盖。本机最佳纪录会保留。' : '游戏已暂停，倒计时也停住了。';
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
      this.wrapText('看准方向，轻点矿区放钩。\n金块越重，回收越慢；钻石轻而值钱。\n抓到重物时，可用炸药。\n每关 60 秒，金币累计达标就过关。', x, y + 49, contentW, 15, C.text, 24);
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
    this.text('矿工模拟器', x, y, 34, C.primary, { font: 'title', align: 'center', bold: true });
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
      const fullScreen = ['result', 'shop'].includes(app.game.state);
      if (!fullScreen) {
        this.header(app);
        this.drawBoard(app.game, app.game.state === 'menu');
        if (this.layout.portrait && ['menu', 'ready', 'gameover'].includes(app.game.state)) {
          const p = this.layout.panel;
          this.panel({ x: p.x - 8, y: p.y - 16, w: p.w + 16, h: p.h + 32 }, C.surface, C.border, 16);
        }
      }
      switch (app.game.state) {
        case 'menu': this.menu(app); break;
        case 'ready': this.ready(app); break;
        case 'playing': case 'paused': this.playing(app); break;
        case 'result': this.victory(app); break;
        case 'gameover': this.result(app); break;
        case 'shop': this.shop(app); break;
      }
      if (app.modal) this.modal(app, app.modal);
      else if (app.game.state === 'paused') this.modal(app, 'paused');
    }
    if (app.notice) {
      const l = this.layout, board = ['shop', 'result'].includes(app.game.state) ? { x: l.x, y: l.y, w: l.w, h: l.h } : l.board;
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
