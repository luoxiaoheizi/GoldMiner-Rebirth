'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const DIST = path.join(ROOT, 'dist');
const MARKER = '.goldminer-generated';

function inside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function assertRegularTree(directory) {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('不允许构建路径包含符号链接：' + directory);
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('不允许构建路径包含符号链接：' + file);
    if (item.isDirectory()) assertRegularTree(file);
  }
}
function readUtf8(file) {
  return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)).replace(/^\uFEFF/, '');
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
function writeJson(file, value) { write(file, JSON.stringify(value, null, 2) + '\n'); }

/** Static CommonJS modules become ordinary functions; no runtime eval or Function. */
function bundle(entryPoints, sourceRoot, kind) {
  const modules = new Map();
  function visit(file) {
    const resolved = path.resolve(file);
    if (!inside(sourceRoot, resolved)) throw new Error('模块超出 src 目录：' + file);
    const id = path.relative(sourceRoot, resolved).split(path.sep).join('/');
    if (modules.has(id)) return id;
    const raw = readUtf8(resolved);
    const source = path.extname(resolved) === '.json' ? 'module.exports = ' + JSON.stringify(JSON.parse(raw)) + ';' : raw;
    const dependencies = {};
    modules.set(id, { source, dependencies });
    const pattern = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;
    let match;
    while ((match = pattern.exec(source))) {
      const request = match[2];
      if (!request.startsWith('.')) throw new Error('浏览器不支持外部依赖：' + request);
      let target = path.resolve(path.dirname(resolved), request);
      if (!path.extname(target)) target = fs.existsSync(target + '.js') ? target + '.js' : path.join(target, 'index.js');
      dependencies[request] = visit(target);
    }
    return id;
  }
  const entries = entryPoints.map(visit);
  const definitions = Array.from(modules, ([id, item]) => JSON.stringify(id) + ': [function(module, exports, require) {\n' + item.source + '\n}, ' + JSON.stringify(item.dependencies) + ']').join(',\n');
  return '(function() {\n"use strict";\nconst modules = {\n' + definitions + '\n};\n' +
    'const cache = Object.create(null);\nfunction load(id) {\n' +
    '  if (cache[id]) return cache[id].exports;\n' +
    '  const definition = modules[id];\n' +
    '  if (!definition) throw new Error("Unknown module: " + id);\n' +
    '  const module = cache[id] = { exports: {} };\n' +
    '  definition[0](module, module.exports, function(request) { return load(definition[1][request]); });\n' +
    '  return module.exports;\n}\n' +
    'return load(' + JSON.stringify(entries[0]) + ').start(load(' + JSON.stringify(entries[1]) + ').createPlatform(' + JSON.stringify(kind || 'web') + '));\n})();\n';
}

function copyAssets(destination) {
  for (const group of ['images', 'audios']) {
    const source = path.join(REPO, group);
    assertRegularTree(source);
    fs.mkdirSync(path.join(destination, group), { recursive: true });
    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
      if (!item.isFile() || !/\.(png|wav|mp3)$/.test(item.name)) continue;
      fs.copyFileSync(path.join(source, item.name), path.join(destination, group, item.name));
    }
  }
}
function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(directory, item.name);
    return item.isDirectory() ? listFiles(file) : [file];
  });
}
function prepareOutput(target) {
  if (!inside(DIST, target)) throw new Error('构建输出必须位于 minigame/dist 内');
  if (fs.existsSync(DIST)) assertRegularTree(DIST);
  if (fs.existsSync(target)) {
    if (!fs.existsSync(path.join(target, MARKER))) throw new Error('拒绝覆盖非构建目录：' + target);
    // Both absolute containment and every symlink are checked before this removal.
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.mkdirSync(target, { recursive: true });
  write(path.join(target, MARKER), '由 minigame/scripts/build.js 生成，可重新构建。\n');
}
function parseOptions(args, env) {
  const options = { wechatAppid: env.WECHAT_APPID || '', douyinAppid: env.DOUYIN_APPID || '' };
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i];
    const key = name === '--wechat-appid' ? 'wechatAppid' : name === '--douyin-appid' ? 'douyinAppid' : null;
    if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('支持参数：--wechat-appid <真实ID> --douyin-appid <真实ID>');
    options[key] = args[++i];
  }
  if (options.wechatAppid && !/^wx[a-zA-Z0-9]{16}$/.test(options.wechatAppid)) throw new Error('微信 AppID 格式不正确');
  if (options.douyinAppid && !/^tt[a-zA-Z0-9]+$/.test(options.douyinAppid)) throw new Error('抖音 AppID 应为平台分配的 tt 开头 ID');
  return options;
}
function build(options) {
  options = options || {};
  const sourceRoot = path.join(ROOT, 'src');
  assertRegularTree(sourceRoot);
  const bundles = {};
  for (const kind of ['wechat', 'douyin', 'web']) bundles[kind] = bundle([path.join(sourceRoot, 'main.js'), path.join(sourceRoot, 'platform.js')], sourceRoot, kind);
  const report = [];
  for (const kind of ['wechat', 'douyin', 'web']) {
    const target = path.resolve(DIST, kind);
    prepareOutput(target);
    copyAssets(target);
    write(path.join(target, 'LICENSE'), readUtf8(path.join(REPO, 'LICENSE')));
    write(path.join(target, 'ASSET-NOTICE.txt'), '代码依据随包 LICENSE 中的 MIT 许可证分发。原图片和音频继承自 GoldMiner-Rebirth；原作者说明素材来自互联网并经过修改，未声明其全部可商用。公开运营前请核实或替换素材授权。\n原项目：https://github.com/zzxzzk115/GoldMiner-Rebirth\n');
    write(path.join(target, 'game.js'), bundles[kind]);
    if (kind === 'web') {
      write(path.join(target, 'index.html'), readUtf8(path.join(ROOT, 'templates', 'web.html')));
    } else {

      writeJson(path.join(target, 'game.json'), { deviceOrientation: 'landscape', showStatusBar: false });
      const project = {
        description: '黄金矿工·重生：中文版单机小游戏',
        projectname: 'goldminer-rebirth-' + kind,
        miniprogramRoot: './',
        setting: { es6: true, minified: true, urlCheck: true },
      };
      if (kind === 'wechat') project.compileType = 'game';
      const appid = kind === 'wechat' ? options.wechatAppid : options.douyinAppid;
      if (appid) project.appid = appid;
      writeJson(path.join(target, 'project.config.json'), project);
    }
    const files = listFiles(target);
    const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    if (bytes >= 4 * 1024 * 1024) throw new Error(kind + ' 包体超过本项目设置的 4 MiB 构建预算');
    report.push({ platform: kind, directory: target, files: files.length, bytes });
  }
  return report;
}
if (require.main === module) {
  try {
    const result = build(parseOptions(process.argv.slice(2), process.env));
    result.forEach((item) => console.log(item.platform + ': ' + item.files + ' 个文件，' + (item.bytes / 1024).toFixed(1) + ' KiB → ' + item.directory));
    console.log('未指定 AppID 的构建请在对应开发者工具导入时填写自己的真实小游戏 AppID。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { build, bundle, parseOptions, inside, readUtf8, DIST };
