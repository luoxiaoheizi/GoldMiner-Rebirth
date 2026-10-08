'use strict';

const { Game } = require('./core/game');
const { Renderer, ASSETS, inside } = require('./ui/renderer');

const STATE_NAMES = { menu: '首页', ready: '准备下矿', playing: '挖矿中', paused: '已暂停', result: '过关结算', shop: '矿工补给站', gameover: '本轮结束' };

class App {
  constructor(platform) {
    this.platform = platform;
    this.renderer = new Renderer(platform);
    this.loaded = false;
    this.loadError = false;
    this.progress = 0;
    this.loadingGeneration = 0;
    this.modal = null;
    this.notice = '';
    this.noticeUntil = 0;
    this.storageFailed = false;
    this.muted = false;
    this.best = { money: 0, level: 1 };
    this.savedRun = null;
    this.shopIndex = 0;
    this.resultElapsed = 0;
    this.lastTime = null;
    this.hidden = false;
    this.destroyed = false;
    this.frame = null;
    this.domButtons = new Map();
    this.cleanup = [];
    this.game = new Game({ onEvent: event => this.onGameEvent(event) });
    this.readSave();
    platform.setMuted(this.muted);
    this.setupBrowserControls();
    this.cleanup.push(platform.onPointer(event => this.onPointer(event)));
    this.cleanup.push(platform.onKey(event => this.onKey(event)));
    this.cleanup.push(platform.onResize(() => { this.renderer.resize(); this.syncField(); this.render(); }));
    this.cleanup.push(platform.onHide(() => {
      this.hidden = true;
      this.game.pause();
      this.persist();
      if (this.frame != null) platform.cancelFrame(this.frame);
      this.frame = null;
      this.lastTime = null;
      this.render();
    }));
    this.cleanup.push(platform.onShow(() => {
      this.hidden = false;
      this.lastTime = null;
      this.schedule();
    }));
    this.render();
    this.ready = this.loadAssets();
    this.schedule();
  }

  get hasRun() { return this.savedRun !== null; }

  syncField() { this.game.setFieldHeight(this.renderer.layout.fieldHeight || 240); }

  readSave() {
    const data = this.platform.readSave();
    if (!data || data.version !== 1) return;
    this.muted = data.muted === true;
    if (data.best && Number.isSafeInteger(data.best.money) && data.best.money >= 0 &&
        Number.isInteger(data.best.level) && data.best.level >= 1 && data.best.level <= 100000) {
      this.best = { money: data.best.money, level: data.best.level };
    }
    if (data.run) {
      const validator = new Game();
      if (validator.restoreSave(data.run)) this.savedRun = validator.exportSave();
      else this.notify('上次进度无法读取，可以重新开局。');
    }
  }

  persist() {
    if (this.game.state !== 'menu') {
      this.savedRun = this.game.exportSave();
      const { money, level } = this.game.player;
      if (money > this.best.money || (money === this.best.money && level > this.best.level)) this.best = { money: Math.floor(money), level };
    }
    const saved = this.platform.writeSave({ version: 1, muted: this.muted, best: this.best, run: this.savedRun });
    if (!saved && !this.storageFailed) this.notify('暂时无法保存进度，请勿关闭游戏。', 8000);
    this.storageFailed = !saved;
    return saved;
  }

  onGameEvent(event) {
    if (event.type === 'sound') this.platform.playSound(event.name);
    if (event.type === 'message') this.notify(event.text);
    if (event.type === 'save') this.persist();
    if (event.type === 'state') {
      this.lastTime = null;
      this.renderer.pressedId = null;
      this.shopIndex = 0;
      this.resultElapsed = 0;
      this.announce(`${STATE_NAMES[event.state]}。第 ${this.game.player.level} 关，${this.game.player.money} 金币。`);
      if (this.document) this.document.title = `${STATE_NAMES[event.state]} · 矿工模拟器`;
    }
  }

  async loadAssets() {
    const generation = ++this.loadingGeneration;
    this.loadError = false;
    this.loaded = false;
    this.progress = 0;
    let completed = 0;
    const images = {};
    const results = await Promise.allSettled(ASSETS.map(async name => {
      let timeout;
      try {
        images[name] = await Promise.race([
          this.platform.loadImage(`images/${name}.png`),
          new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('资源加载超时')), 12000); }),
        ]);
      } finally {
        clearTimeout(timeout);
        completed++;
        if (generation === this.loadingGeneration && !this.destroyed) this.progress = Math.round(completed / ASSETS.length * 100);
      }
    }));
    if (generation !== this.loadingGeneration || this.destroyed) return false;
    if (results.some((result, index) => result.status === 'rejected' && ASSETS[index] !== 'hd_atlas')) {
      this.loadError = true;
      this.announce('矿区资源加载失败，请选择重新加载。');
      this.render();
      return false;
    }
    this.renderer.images = images;
    this.loaded = true;
    this.announce(this.hasRun ? '矿区准备好了，可以继续上次的进度。' : '矿区准备好了，开始挖矿吧。');
    this.render();
    return true;
  }

  notify(message, duration = 3200) {
    this.notice = String(message);
    this.noticeUntil = Date.now() + duration;
    this.announce(this.notice);
  }

  announce(message) {
    if (this.statusNode) this.statusNode.textContent = message;
  }

  act(action) {
    if (this.destroyed) return;
    if (action === 'retry') { this.ready = this.loadAssets(); this.render(); return; }
    if (!this.loaded) return;
    switch (action) {
      case 'sound':
        this.muted = !this.muted; this.platform.setMuted(this.muted); this.persist();
        this.announce(this.muted ? '声音已关闭' : '声音已开启'); break;
      case 'help': this.modal = 'help'; this.announce('下矿小贴士'); break;
      case 'close': this.modal = null; break;
      case 'new':
        if (this.hasRun) this.modal = 'restart';
        else this.game.startNew();
        break;
      case 'restart': this.modal = null; this.game.startNew(); break;
      case 'continue':
        if (!this.savedRun || !this.game.restoreSave(this.savedRun)) {
          this.savedRun = null; this.notify('进度无法读取，请重新开始。'); this.persist();
        }
        break;
      case 'begin': this.game.startLevel(); break;
      case 'drop': this.game.releaseHook(); break;
      case 'bomb': this.game.useDynamite(); break;
      case 'pause': this.game.pause(); break;
      case 'resume': this.game.resume(); break;
      case 'finish': this.game.finishLevel(); break;
      case 'shop': this.game.openShop(); break;
      case 'next-level': if (this.game.nextLevel()) this.game.startLevel(); break;
      case 'invite':
        if (this.game.state !== 'shop') break;
        Promise.resolve(this.platform.shareGame ? this.platform.shareGame() : 'unsupported').then(status => {
          if (this.destroyed) return;
          if (status === 'opened') this.notify('请在分享面板中选择好友。');
          else if (status === 'unsupported') this.notify('请在微信中打开小游戏后邀请好友。');
          else if (status === 'failed') this.notify('暂时无法打开分享，请稍后重试。');
          this.render();
        }).catch(() => { if (!this.destroyed) { this.notify('暂时无法打开分享，请稍后重试。'); this.render(); } });
        break;
      case 'prev-item': this.shopIndex = (this.shopIndex + this.game.shopItems.length - 1) % this.game.shopItems.length; break;
      case 'next-item': this.shopIndex = (this.shopIndex + 1) % this.game.shopItems.length; break;
      case 'menu': this.modal = null; this.persist(); this.game.returnToMenu(); break;
      default:
        if (action.startsWith('buy:')) {
          const result = this.game.buyItem(action.slice(4));
          this.notify(result.ok ? '已放入背包，下一关用得上。' : result.reason);
        }
    }
    this.syncField();
    this.render();
  }

  onPointer(event) {
    if (event.type === 'cancel') {
      this.renderer.pressedId = null;
      this.boardPressed = false;
      return;
    }
    const button = this.renderer.buttons.find(item => inside(item, event.x, event.y));
    if (event.type === 'move') {
      this.renderer.hoverId = button && !button.disabled ? button.id : null;
      if (this.platform.canvas.style) this.platform.canvas.style.cursor = button && !button.disabled ? 'pointer' : 'default';
      return;
    }
    if (event.type === 'down') {
      this.renderer.pressedId = button && !button.disabled ? button.id : null;
      this.boardPressed = !button && !this.modal && this.game.state === 'playing' && inside(this.renderer.layout.board, event.x, event.y);
    }
    if (event.type === 'up') {
      const id = this.renderer.pressedId;
      this.renderer.pressedId = null;
      if (button && !button.disabled && id === button.id) this.act(button.action);
      else if (this.boardPressed && !this.modal && inside(this.renderer.layout.board, event.x, event.y)) this.act('drop');
      this.boardPressed = false;
    }
  }

  onKey(event) {
    if (event.type !== 'down' || !this.loaded) return;
    if (event.key === 'Escape') {
      if (this.modal) this.act('close');
      else if (this.game.state === 'playing') this.act('pause');
      else if (this.game.state === 'paused') this.act('resume');
      return;
    }
    if (this.modal) return;
    if (this.game.state === 'playing') {
      if (event.key === ' ' || event.key === 'ArrowDown') this.act('drop');
      if (event.key === 'ArrowUp') this.act('bomb');
    } else if (this.game.state === 'shop') {
      if (event.key === 'ArrowLeft') this.act('prev-item');
      if (event.key === 'ArrowRight') this.act('next-item');
    } else if (event.key === 'Enter') {
      const actions = { menu: this.hasRun ? 'continue' : 'new', ready: 'begin', paused: 'resume', result: 'shop', gameover: 'restart' };
      if (actions[this.game.state]) this.act(actions[this.game.state]);
    }
  }

  setupBrowserControls() {
    if (this.platform.kind !== 'web' || typeof document === 'undefined') return;
    this.document = document;
    this.controlsNode = document.getElementById('game-controls');
    this.statusNode = document.getElementById('game-status');
    if (!this.controlsNode) return;
    this.controlsNode.setAttribute('aria-label', '游戏操作');
    const trapFocus = event => {
      if (event.key !== 'Tab' || (!this.modal && this.game.state !== 'paused')) return;
      const buttons = Array.from(this.domButtons.values()).filter(node => !node.disabled);
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    this.controlsNode.addEventListener('keydown', trapFocus);
    this.cleanup.push(() => this.controlsNode.removeEventListener('keydown', trapFocus));
  }

  syncBrowserControls(buttons) {
    if (!this.controlsNode) return;
    const modal = this.modal || (this.game.state === 'paused' ? 'paused' : null);
    const enteredModal = modal && !this.browserModal;
    const leftModal = !modal && this.browserModal;
    if (enteredModal) this.focusBeforeModal = this.document.activeElement && this.document.activeElement.id;
    if (modal) {
      this.controlsNode.setAttribute('role', 'dialog');
      this.controlsNode.setAttribute('aria-modal', 'true');
      this.controlsNode.setAttribute('aria-label', modal === 'help' ? '下矿小贴士' : modal === 'restart' ? '重新开局确认' : '游戏已暂停');
    } else {
      this.controlsNode.removeAttribute('role'); this.controlsNode.removeAttribute('aria-modal');
      this.controlsNode.setAttribute('aria-label', '游戏操作');
    }
    const ids = new Set(buttons.map(button => button.id));
    let removedFocused = false;
    this.domButtons.forEach((node, id) => {
      if (!ids.has(id)) {
        if (this.document.activeElement === node) removedFocused = true;
        node.remove(); this.domButtons.delete(id);
      }
    });
    buttons.forEach(button => {
      let node = this.domButtons.get(button.id);
      if (!node) {
        node = this.document.createElement('button');
        node.type = 'button'; node.id = `control-${button.id}`; node.className = 'game-control';
        node.addEventListener('click', () => this.act(node.dataset.action));
        node.addEventListener('focus', () => { this.renderer.focusId = button.id; });
        node.addEventListener('blur', () => { if (this.renderer.focusId === button.id) this.renderer.focusId = null; });
        node.addEventListener('pointerenter', () => { this.renderer.hoverId = button.id; });
        node.addEventListener('pointerleave', () => { this.renderer.hoverId = null; this.renderer.pressedId = null; });
        node.addEventListener('pointerdown', () => { this.renderer.pressedId = button.id; });
        node.addEventListener('pointerup', () => { this.renderer.pressedId = null; });
        this.controlsNode.appendChild(node); this.domButtons.set(button.id, node);
      }
      if (node.textContent !== button.label) node.textContent = button.label;
      node.disabled = button.disabled;
      node.dataset.action = button.action;
      const geometry = `${button.x},${button.y},${button.w},${button.h}`;
      if (node.dataset.geometry !== geometry) {
        node.style.left = `${button.x}px`; node.style.top = `${button.y}px`;
        node.style.width = `${button.w}px`; node.style.height = `${button.h}px`;
        node.dataset.geometry = geometry;
      }
    });
    if (enteredModal || removedFocused || leftModal) {
      const restore = leftModal && this.focusBeforeModal ? this.document.getElementById(this.focusBeforeModal) : null;
      const preferred = modal === 'restart' ? 'cancel-restart' : modal === 'help' ? 'close-help' : modal ? 'resume' : this.game.state === 'ready' ? 'begin' : this.game.state === 'playing' ? 'drop' : this.game.state === 'menu' ? 'start' : this.game.state === 'shop' ? 'next-level' : 'result-next';
      const target = restore || this.domButtons.get(preferred) || Array.from(this.domButtons.values()).find(node => !node.disabled);
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
    this.browserModal = modal;
  }

  render() {
    if (this.destroyed) return;
    if (this.notice && Date.now() > this.noticeUntil) this.notice = '';
    this.syncBrowserControls(this.renderer.draw(this));
  }

  schedule() {
    if (this.destroyed || this.hidden || this.frame != null) return;
    this.frame = this.platform.requestFrame(time => {
      this.frame = null;
      if (this.destroyed || this.hidden) return;
      const now = Number.isFinite(time) ? time : Date.now();
      const dt = this.lastTime == null ? 0 : Math.max(0, (now - this.lastTime) / 1000);
      this.lastTime = now;
      if (this.loaded) {
        const wasResult = this.game.state === 'result';
        this.game.update(dt);
        if (wasResult && this.game.state === 'result' && !this.modal) {
          this.resultElapsed += dt;
          if (this.resultElapsed >= 1.5) this.game.openShop();
        }
      }
      this.render();
      this.schedule();
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.persist();
    this.destroyed = true;
    this.loadingGeneration++;
    if (this.frame != null) this.platform.cancelFrame(this.frame);
    this.cleanup.forEach(unsubscribe => unsubscribe());
    this.domButtons.forEach(node => node.remove());
    this.domButtons.clear();
    this.platform.destroy();
  }
}

function start(platform) { return new App(platform); }

module.exports = { start, App };
