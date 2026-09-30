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
    await page.getByRole('button', { name: '前往商店', exact: true }).click();
    await page.getByRole('button', { name: /^购买 ·/ }).click();
    assert.equal(await page.getByRole('button', { name: '已购买', exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(output, 'shop-desktop.png') });
    await page.getByRole('button', { name: '准备下一关', exact: true }).click();
    await page.getByRole('button', { name: '开始本关', exact: true }).waitFor();
    checks.push('有效过关存档进入结算→商店→购买→下一关，购买按钮防重复');

    const playing = new Game({ random: () => 0.2 }); playing.startNew(); playing.startLevel(); playing.pause();
    for (const size of [{ width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(size);
      await injectRun(playing);
      await page.getByRole('button', { name: '继续挖矿', exact: true }).click();
      await page.screenshot({ path: path.join(output, `game-${size.width}x${size.height}.png`) });
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

    await page.setViewportSize({ width: 844, height: 390 });
    await injectRun(won);
    await page.getByRole('button', { name: '前往商店', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'shop-mobile.png') });
    await page.getByRole('button', { name: '下一件', exact: true }).click();
    await page.getByRole('button', { name: '准备下一关', exact: true }).click();
    checks.push('窄横屏商店切换商品和进入下一关');

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
