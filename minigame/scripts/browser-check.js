'use strict';

// Optional real-browser verification. Uses an existing Playwright installation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createServer } = require('./preview');
const { Game } = require('../src/core/game');
const { SAVE_KEY } = require('../src/platform');

async function run() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const output = path.resolve(__dirname, '../artifacts/browser');
  fs.mkdirSync(output, { recursive: true });
  let browser;
  const errors = [], checks = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    let page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('button', { name: '开始挖矿', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'menu-desktop.png') });
    await page.getByRole('button', { name: '开始挖矿', exact: true }).click();
    await page.getByRole('button', { name: '开始本关', exact: true }).click();
    await page.getByRole('button', { name: '放下钩爪', exact: true }).click();
    await page.getByRole('button', { name: '钩爪回收中', exact: true }).waitFor();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '保存并返回首页', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '继续挖矿', exact: true }).click();
    await page.getByRole('dialog', { name: '游戏已暂停' }).waitFor();
    await page.getByRole('button', { name: '继续挖矿', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: '游戏已暂停' }).waitFor();
    checks.push('菜单、开局、放钩、暂停、保存、刷新续玩及按钮焦点下Esc快捷键');

    async function injectRun(game) {
      const viewport = page.viewportSize();
      await page.close();
      page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.addInitScript(({ key, run }) => localStorage.setItem(key, JSON.stringify({ version: 1, muted: true, best: { money: 0, level: 1 }, run })), { key: SAVE_KEY, run: game.exportSave() });
      await page.goto(url);
      await page.getByRole('button', { name: '继续挖矿', exact: true }).click();
    }
    // A valid game snapshot enters the completed-level flow without test hooks in shipped code.
    const won = new Game({ random: () => 0.9 });
    won.startNew(); won.startLevel(); won.player.money = 1600; won.finishLevel();
    await injectRun(won);
    await page.getByRole('button', { name: '下一关', exact: true }).waitFor();
    await page.getByRole('button', { name: /金币$/ }).first().click();
    assert.equal(await page.getByRole('button', { name: /已购买$/ }).first().isDisabled(), true);
    await page.screenshot({ path: path.join(output, 'shop-desktop.png') });
    await page.getByRole('button', { name: '下一关', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    checks.push('有效过关存档进入结算→商店→购买→下一关，购买按钮防重复');

    const playing = new Game({ random: () => 0.2 }); playing.startNew(); playing.startLevel(); playing.pause();
    for (const size of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      await injectRun(playing);
      await page.getByRole('button', { name: '继续挖矿', exact: true }).click();
      await page.screenshot({ path: path.join(output, `game-${size.width}x${size.height}.png`) });
      if (size.height > size.width) {
        assert.equal(await page.getByRole('button', { name: '放下钩爪', exact: true }).count(), 0);
        await page.mouse.click(size.width * 0.5, size.height * 0.65);
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        const hookState = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).run.hook.state, SAVE_KEY);
        assert.ok(['extending', 'retracting'].includes(hookState), '轻点矿区应立即出钩');
        await page.getByRole('button', { name: '继续挖矿', exact: true }).click();
      }
      const bounds = await page.locator('#game-controls button').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return { label: node.textContent, x: r.x, y: r.y, right: r.right, bottom: r.bottom };
      }));
      for (const r of bounds) assert.ok(r.x >= 0 && r.y >= 0 && r.right <= size.width + 1 && r.bottom <= size.height + 1, JSON.stringify({ size, r }));
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '保存并返回首页', exact: true }).click();
      await page.getByRole('button', { name: '重新开始', exact: true }).click();
      await page.getByRole('dialog', { name: '重新开局确认' }).waitFor();
      await page.getByRole('button', { name: '继续当前进度', exact: true }).click();
      await page.getByRole('button', { name: '玩法', exact: true }).click();
      await page.screenshot({ path: path.join(output, `help-${size.width}x${size.height}.png`) });
      await page.keyboard.press('Escape');
    }
    checks.push('4种窄横屏/竖屏：按钮可触达、重新开局确认、玩法弹窗、减少动态偏好');
    checks.push('竖屏矿区直接点击出钩，无独立放钩按钮');

    await page.setViewportSize({ width: 844, height: 390 });
    await injectRun(won);
    await page.getByRole('button', { name: '下一关', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'shop-mobile.png') });
    assert.equal(await page.getByRole('button', { name: '邀请好友', exact: true }).count(), 1);
    await page.getByRole('button', { name: '下一关', exact: true }).click();
    checks.push('窄横屏货架、邀请好友按钮和进入下一关');

    await page.setViewportSize({ width: 390, height: 844 });
    await injectRun(won);
    await page.screenshot({ path: path.join(output, 'victory-portrait.png') });
    await page.getByRole('button', { name: '下一关', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'shop-portrait.png') });
    assert.equal(await page.getByRole('button', { name: '邀请好友', exact: true }).count(), 1);
    await page.getByRole('button', { name: /金币$/ }).first().click();
    assert.equal(await page.getByRole('button', { name: /已购买$/ }).first().isDisabled(), true);
    await page.getByRole('button', { name: '下一关', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'ready-portrait.png') });
    checks.push('竖屏过关金块页面自动跳转，货架购买扣款、邀请按钮及下一关可用');

    const hdContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const hdPage = await hdContext.newPage();
    hdPage.on('pageerror', error => errors.push(error.message));
    await hdPage.goto(url);
    await hdPage.getByRole('button', { name: '开始挖矿', exact: true }).click();
    await hdPage.screenshot({ path: path.join(output, 'ready-hd-390x844.png') });
    await hdPage.getByRole('button', { name: '开始本关', exact: true }).click();
    const pixels = await hdPage.locator('#game-canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
    assert.deepEqual(pixels, { width: 1170, height: 2532 });
    await hdPage.screenshot({ path: path.join(output, 'game-hd-390x844.png') });
    await hdContext.close();
    checks.push('三倍像素密度下使用1170×2532画布，高清素材正常加载与绘制');

    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(url);
    const highlight = await touchPage.locator('#game-canvas').evaluate(canvas => getComputedStyle(canvas).webkitTapHighlightColor);
    assert.equal(highlight, 'rgba(0, 0, 0, 0)', '整块画布的系统触摸高亮必须透明');
    await touchPage.getByRole('button', { name: '开始挖矿', exact: true }).tap();
    await touchPage.getByRole('button', { name: '开始本关', exact: true }).tap();
    const touchSession = await touchContext.newCDPSession(touchPage);
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 550 }] });
    await touchPage.screenshot({ path: path.join(output, 'game-touch-pressed.png') });
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.getByRole('button', { name: '暂停', exact: true }).tap();
    const touchHook = await touchPage.evaluate(key => JSON.parse(localStorage.getItem(key)).run.hook.state, SAVE_KEY);
    assert.ok(['extending', 'retracting'].includes(touchHook), '触摸结束仍需直接出钩');
    await touchContext.close();
    checks.push('手机触摸画布无系统蓝色高亮，按住画面与轻点出钩正常');

    await page.route('**/images/hd_atlas.png', route => route.abort());
    await page.reload();
    await page.getByRole('button', { name: '继续挖矿', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '重新加载', exact: true }).count(), 0);
    await page.unroute('**/images/hd_atlas.png');
    await page.reload();
    await page.getByRole('button', { name: '继续挖矿', exact: true }).waitFor();
    checks.push('高清图集单独加载失败时自动回退原素材，仍可进入游戏');

    await page.route('**/images/bg_top.png', route => route.abort());
    await page.reload();
    await page.getByRole('button', { name: '重新加载', exact: true }).waitFor();
    await page.unroute('**/images/bg_top.png');
    await page.getByRole('button', { name: '重新加载', exact: true }).click();
    await page.getByRole('button', { name: '继续挖矿', exact: true }).waitFor();
    checks.push('资源加载失败与重试恢复');
    assert.deepEqual(errors, []);
    const report = { passed: true, checks, runtimeErrors: errors, screenshots: fs.readdirSync(output).filter(file => file.endsWith('.png')) };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
