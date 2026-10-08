'use strict';

const SAVE_KEY = 'goldminer-rebirth-zh-v1';
const SOUNDS = {
  Money: 'money.wav', HookReset: 'hook_reset.wav', GrabStart: 'grab_start.mp3',
  GrabBack: 'grab_back.wav', Explosive: 'explosive.wav', High: 'high_value.wav',
  Normal: 'normal_value.wav', Low: 'low_value.wav', Goal: 'goal.mp3', MadeGoal: 'made_goal.mp3',
};

/** One logical-pixel Canvas API shared by browsers, WeChat and Douyin. */
function createPlatform(kind, options) {
  kind = kind || 'web';
  options = options || {};
  const root = options.root || (kind !== 'web' && typeof GameGlobal !== 'undefined' ? GameGlobal : typeof globalThis !== 'undefined' ? globalThis : {});
  const sdk = options.sdk || (kind === 'wechat' ? (typeof wx !== 'undefined' ? wx : root.wx) : kind === 'douyin' ? (typeof tt !== 'undefined' ? tt : root.tt) : null);
  const isWeb = kind === 'web';
  if (!isWeb && !sdk) throw new Error('未找到 ' + kind + ' 小游戏运行环境');
  const doc = root.document;
  const canvas = options.canvas || (isWeb ? doc.getElementById('game-canvas') : sdk.createCanvas());
  if (!canvas) throw new Error('无法创建游戏画布');
  // DOM-backed simulators otherwise tint the entire interactive canvas on tap.
  if (canvas.style) canvas.style.webkitTapHighlightColor = 'transparent';
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前设备不支持 Canvas 2D');
  const listeners = { pointer: [], key: [], resize: [], hide: [], show: [] };
  const cleanup = [];
  const audio = new Map();
  let muted = false;
  let hidden = false;
  let disposed = false;
  const platform = {
    kind, canvas, context, width: 0, height: 0, dpr: 1, safeArea: null,
    reducedMotion: Boolean(isWeb && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches),
    createImage, loadImage, playSound, setMuted, mute: setMuted, readSave, writeSave,
    onPointer: (fn) => subscribe('pointer', fn), onKey: (fn) => subscribe('key', fn),
    onResize: (fn) => subscribe('resize', fn), onHide: (fn) => subscribe('hide', fn),
    onShow: (fn) => subscribe('show', fn), requestFrame, cancelFrame, destroy,
  };

  function subscribe(type, fn) {
    listeners[type].push(fn);
    return () => { listeners[type] = listeners[type].filter((item) => item !== fn); };
  }
  function emit(type, event) {
    if (!disposed) listeners[type].slice().forEach((fn) => fn(event));
  }
  function bind(target, name, handler, eventOptions) {
    if (!target || !target.addEventListener) return;
    target.addEventListener(name, handler, eventOptions);
    cleanup.push(() => target.removeEventListener(name, handler, eventOptions));
  }
  function bindSdk(name, handler) {
    if (typeof sdk[name] !== 'function') return;
    sdk[name](handler);
    const off = name.replace(/^on/, 'off');
    if (typeof sdk[off] === 'function') cleanup.push(() => sdk[off](handler));
  }
  function metrics(event) {
    let info = {};
    if (!isWeb) {
      try { info = typeof sdk.getWindowInfo === 'function' ? sdk.getWindowInfo() : sdk.getSystemInfoSync(); }
      catch (_) { info = {}; }
    }
    const size = event && (event.size || event);
    const width = Math.max(1, Number(isWeb ? root.innerWidth : (size && size.windowWidth) || info.windowWidth || info.screenWidth) || 960);
    const height = Math.max(1, Number(isWeb ? root.innerHeight : (size && size.windowHeight) || info.windowHeight || info.screenHeight) || 540);
    const dpr = Math.min(3, Math.max(1, Number(isWeb ? root.devicePixelRatio : info.pixelRatio) || 1));
    let area = info.safeArea || {};
    // Some Douyin versions return portrait safeArea even for landscape games.
    // Reserve both possible notch sides to support either landscape direction.
    if (width > height && area.bottom > height && area.right <= height * 1.2) {
      const portraitHeight = Math.max(info.screenWidth || width, info.screenHeight || height);
      const portraitWidth = Math.min(info.screenWidth || width, info.screenHeight || height);
      const side = Math.max(Number(area.top) || 0, portraitHeight - area.bottom, 0);
      const vertical = Math.max(Number(area.left) || 0, portraitWidth - area.right, 0);
      area = { left: side, top: vertical, right: width - side, bottom: height - vertical };
    }
    let left = Math.min(width - 1, Math.max(0, Number(area.left) || 0));
    let top = Math.min(height - 1, Math.max(0, Number(area.top) || 0));
    let right = Math.min(width, Number(area.right) || width);
    let bottom = Math.min(height, Number(area.bottom) || height);
    if (isWeb && root.getComputedStyle && doc.documentElement) {
      const style = root.getComputedStyle(doc.documentElement);
      left = Math.max(left, parseFloat(style.getPropertyValue('--safe-left')) || 0);
      top = Math.max(top, parseFloat(style.getPropertyValue('--safe-top')) || 0);
      right -= parseFloat(style.getPropertyValue('--safe-right')) || 0;
      bottom -= parseFloat(style.getPropertyValue('--safe-bottom')) || 0;
    }
    let menuBottom = isWeb ? 0 : Math.min(48, height * 0.16);
    if (!isWeb && typeof sdk.getMenuButtonBoundingClientRect === 'function') {
      try {
        const menu = sdk.getMenuButtonBoundingClientRect();
        // Keep all clickable HUD controls below the native capsule.
        if (menu && menu.width > 0 && menu.bottom > 0 && menu.bottom < height / 2) menuBottom = menu.bottom + 8;
      } catch (_) { /* Older SDKs do not expose capsule bounds. */ }
    }
    top = Math.max(top, menuBottom);
    if (right <= left) { left = 0; right = width; }
    if (bottom <= top) { top = 0; bottom = height; }
    platform.width = width;
    platform.height = height;
    platform.dpr = dpr;
    platform.safeArea = { left, top, right, bottom, width: right - left, height: bottom - top };
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (canvas.style) { canvas.style.width = width + 'px'; canvas.style.height = height + 'px'; }
    if (typeof context.setTransform === 'function') context.setTransform(dpr, 0, 0, dpr, 0, 0);
    else context.scale(dpr, dpr);
    emit('resize', { width, height, dpr, safeArea: platform.safeArea });
  }
  function createImage() { return isWeb ? new root.Image() : sdk.createImage(); }
  function loadImage(path) {
    return new Promise((resolve, reject) => {
      const img = createImage();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法加载图片：' + path));
      img.src = path;
    });
  }
  function stopAudio() {
    audio.forEach((item) => {
      try { if (typeof item.stop === 'function') item.stop(); else item.pause(); } catch (_) { /* Already released. */ }
    });
  }
  function setMuted(value) { muted = Boolean(value); if (muted) stopAudio(); }
  function playSound(name) {
    if (muted || hidden || disposed) return;
    const path = SOUNDS[name] ? 'audios/' + SOUNDS[name] : name;
    if (typeof path !== 'string' || !/^audios\/[\w-]+\.(wav|mp3)$/.test(path)) return;
    try {
      let item = audio.get(path);
      if (!item) {
        item = isWeb ? new root.Audio(path) : sdk.createInnerAudioContext();
        item.src = path;
        if (!isWeb && typeof item.onError === 'function') item.onError(() => {});
        audio.set(path, item);
      }
      if (typeof item.seek === 'function') item.seek(0);
      else item.currentTime = 0;
      const result = item.play();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (_) { /* Audio permissions or unavailable hardware must not stop gameplay. */ }
  }
  function readSave() {
    try {
      const raw = isWeb ? root.localStorage.getItem(SAVE_KEY) : sdk.getStorageSync(SAVE_KEY);
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) { return null; }
  }
  function writeSave(value) {
    try {
      const raw = JSON.stringify(value);
      if (isWeb) root.localStorage.setItem(SAVE_KEY, raw);
      else sdk.setStorageSync(SAVE_KEY, raw);
      return true;
    } catch (_) { return false; }
  }
  function requestFrame(fn) {
    if (disposed) return null;
    if (typeof root.requestAnimationFrame === 'function') return root.requestAnimationFrame(fn);
    if (typeof canvas.requestAnimationFrame === 'function') return canvas.requestAnimationFrame(fn);
    return setTimeout(() => fn(Date.now()), 1000 / 60);
  }
  function cancelFrame(id) {
    if (typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(id);
    else if (typeof canvas.cancelAnimationFrame === 'function') canvas.cancelAnimationFrame(id);
    else clearTimeout(id);
  }
  function hide() { if (!hidden) { hidden = true; stopAudio(); emit('hide'); } }
  function show() { if (hidden) { hidden = false; metrics(); emit('show'); } }
  function destroy() {
    disposed = true;
    cleanup.forEach((fn) => fn());
    stopAudio();
    audio.forEach((item) => { if (typeof item.destroy === 'function') item.destroy(); });
    audio.clear();
    Object.keys(listeners).forEach((key) => { listeners[key] = []; });
  }
  metrics();
  if (isWeb) {
    const pointer = (type) => (event) => {
      if (event.isPrimary === false || (type === 'down' && event.button !== undefined && event.button !== 0)) return;
      const rect = canvas.getBoundingClientRect();
      if (event.preventDefault) event.preventDefault();
      emit('pointer', { x: (event.clientX - rect.left) * platform.width / rect.width, y: (event.clientY - rect.top) * platform.height / rect.height, type });
    };
    bind(canvas, 'pointerdown', pointer('down'));
    bind(canvas, 'pointermove', pointer('move'));
    bind(root, 'pointerup', pointer('up'));
    bind(root, 'pointercancel', pointer('cancel'));
    ['keydown', 'keyup'].forEach((name) => bind(root, name, (event) => {
      const tag = (event.target && event.target.tagName) || '';
      if (event.repeat || /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (tag === 'BUTTON' && (event.key === 'Enter' || event.key === ' '))) return;
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
      emit('key', { key: event.key, type: name === 'keydown' ? 'down' : 'up' });
    }));
    bind(root, 'resize', metrics);
    bind(root, 'blur', hide);
    bind(root, 'focus', show);
    bind(doc, 'visibilitychange', () => { if (doc.hidden) hide(); else show(); });
  } else {
    const touch = (type) => (event) => {
      const point = (event.changedTouches && event.changedTouches[0]) || (event.touches && event.touches[0]);
      if (point) emit('pointer', { x: point.clientX === undefined ? point.x : point.clientX, y: point.clientY === undefined ? point.y : point.clientY, type });
    };
    bindSdk('onTouchStart', touch('down'));
    bindSdk('onTouchMove', touch('move'));
    bindSdk('onTouchEnd', touch('up'));
    bindSdk('onTouchCancel', touch('cancel'));
    bindSdk('onWindowResize', metrics);
    bindSdk('onDeviceOrientationChange', metrics);
    bindSdk('onHide', hide);
    bindSdk('onShow', show);
  }
  return platform;
}

module.exports = { createPlatform, SAVE_KEY, SOUNDS };
