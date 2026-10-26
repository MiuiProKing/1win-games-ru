import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const htmlFiles = () => ['index.html', 'okoknew.html', ...fs.readdirSync(path.join(ROOT, 'games')).filter(name => name.endsWith('.html')).map(name => 'games/' + name)];
function walk(directory) {
  if (!fs.existsSync(path.join(ROOT, directory))) return [];
  return fs.readdirSync(path.join(ROOT, directory), {withFileTypes: true}).flatMap(item => {
    const file = path.posix.join(directory, item.name);
    return item.isDirectory() ? walk(file) : [file];
  });
}
function textFiles() {
  return [...htmlFiles(), ...walk('assets'), 'sw.js', 'manifest.webmanifest'].filter(file => /\.(?:html|css|m?js|json|webmanifest|svg)$/.test(file));
}
function catalog() {
  const source = read('assets/catalog-data.js');
  const array = source.match(/Object\.freeze\((\[[\s\S]*?\])\)/)?.[1];
  assert.ok(array, 'catalog must expose its explicit JSON-compatible game list');
  return JSON.parse(array);
}
function assertLocalReference(reference, from) {
  const target = reference.trim();
  if (!target || /^(?:https?:|data:|blob:|mailto:|tel:|about:blank|#|var\()/i.test(target)) return;
  assert.ok(!target.startsWith('/'), `${from}: root-relative URL breaks a repository Pages subpath: ${target}`);
  const clean = target.split(/[?#]/, 1)[0];
  if (!clean) return;
  const resolved = path.resolve(ROOT, path.dirname(from), decodeURIComponent(clean));
  const relative = path.relative(ROOT, resolved);
  assert.ok(relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), `${from}: reference escapes publication root: ${target}`);
  assert.ok(fs.existsSync(resolved), `${from}: missing local resource ${target}`);
  assert.ok(fs.statSync(resolved).isFile() || fs.existsSync(path.join(resolved, 'index.html')), `${from}: directory URL needs an index document: ${target}`);
}

test('both Russian entry pages and every distinct catalog route are present', () => {
  const games = catalog();
  assert.equal(games.length, 14);
  assert.equal(new Set(games.map(game => game.key)).size, 14);
  assert.equal(new Set(games.map(game => game.href)).size, 14);
  for (const file of htmlFiles()) {
    const source = read(file).replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
    assert.match(source, /<!doctype html>/i, file);
    assert.match(source, /<html\b[^>]*\blang=["']ru["']/i, `${file}: Russian document language`);
    assert.match(source, /<meta\b[^>]*name=["']viewport["']/i, `${file}: responsive viewport`);
    assert.doesNotMatch(source, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:["',\s>]|$)/i, `${file}: do not disable mobile zoom`);
  }
  assert.notEqual(read('index.html'), read('okoknew.html'), 'the two launches must be meaningful separate entry documents');
  for (const game of games) {
    assert.match(game.title, /[А-Яа-яЁё]/, `${game.key}: localized catalog title`);
    assertLocalReference(game.href, 'index.html');
    assertLocalReference(game.image, 'index.html');
  }
});

test('catalog images contain actual local image bytes rather than hotlinked pages or error HTML', () => {
  for (const game of catalog()) {
    assert.ok(!/^https?:|^\//i.test(game.image), game.key);
    const bytes = fs.readFileSync(path.join(ROOT, game.image));
    assert.ok(bytes.length > 100, `${game.key}: suspiciously empty image`);
    if (game.image.endsWith('.webp')) {
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF', game.key);
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP', game.key);
    } else if (game.image.endsWith('.png')) {
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', game.key);
    }
  }
});

test('HTML, CSS and module references stay functional under a GitHub Pages repository subpath', () => {
  for (const file of htmlFiles()) {
    const source = read(file).replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
    for (const match of source.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) assertLocalReference(match[1], file);
  }
  for (const file of walk('assets').filter(file => file.endsWith('.css'))) {
    for (const match of read(file).matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) assertLocalReference(match[1], file);
  }
  for (const file of walk('assets').filter(file => /\.m?js$/.test(file))) {
    const source = read(file);
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)["']([^"']+)["']/g)) {
      if (/^(?:\.|\/)/.test(match[1])) assertLocalReference(match[1], file);
    }
  }
});

test('publication omits source authentication, subscription, payment and tracker machinery', () => {
  const forbidden = [
    /bnukeemtscvanogetqdn\.supabase\.co/i,
    /data-context-token\s*=/i,
    /~flock\.js/i,
    /\/__l5e\/events\./i,
    /wa\.me\/2250575155654/i,
    /one-vv1469\.com/i,
    /w1_device_id/,
    /98%\s+de\s+r[ée]ussite/i,
    /GeniusPay/i,
  ];
  for (const file of textFiles()) {
    const source = read(file);
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file}: copied source runtime or unverified claim`);
    if (file !== 'sw.js') assert.doesNotMatch(source, /\/_serverFn\//i, `${file}: copied source server-function calls`);
    assert.doesNotMatch(source, /\bsess\s*:\s*["'][^"']{70,}["']/i, `${file}: embedded source session`);
    assert.doesNotMatch(source, /(?:session-id|customer-id)["']?\s*:\s*["'][^"']{20,}["']/i, `${file}: embedded game account header`);
    assert.doesNotMatch(source, /(?:sb_secret_|sb_service_role_|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIzaSy[\w-]{20})/, `${file}: credential-like material`);
  }
  assert.ok(!fs.existsSync(path.join(ROOT, 'source-assets')), 'raw third-party evidence must stay outside the publication root');
  assert.ok(!fs.existsSync(path.join(ROOT, 'source-index.html')), 'raw tracking shell must stay outside publication');
});

test('Russian catalog exposes distinct live and demonstration modes without an asserted success rate', () => {
  const games = catalog();
  assert.equal(games.filter(game => game.mode === 'live').length, 2);
  assert.equal(games.filter(game => game.mode === 'demo').length, 12);
  for (const game of games) assert.ok(['live', 'demo'].includes(game.mode), game.key);
  const ui = ['index.html','okoknew.html','assets/catalog.js','assets/game.js'].filter(file => fs.existsSync(path.join(ROOT, file))).map(read).join('\n');
  assert.match(ui, /ДЕМО|демонстрац|демо/, 'catalog must disclose demonstration mechanics');
  assert.match(ui, /LIVE|реальн|источник/i, 'live source must be distinguished');
  assert.doesNotMatch(ui, /(?:95|96|97|98|99|100)\s*%\s*(?:точност|успех|попадани|гарант)/i, 'do not replace the source unsupported success claim with Russian copy');
});

test('manifest uses relative launch and actual local icons', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(manifest.lang === 'ru' || manifest.lang === 'ru-RU', 'Russian PWA language');
  assert.ok(typeof manifest.name === 'string' && manifest.name.length > 0);
  assert.ok(manifest.start_url && !manifest.start_url.startsWith('/'), 'PWA start URL must retain repository subpath');
  assert.ok(manifest.scope == null || !manifest.scope.startsWith('/'), 'PWA scope must retain repository subpath');
  assert.ok(manifest.icons?.length >= 1, 'PWA needs a real local icon');
  for (const icon of manifest.icons) assertLocalReference(icon.src, 'manifest.webmanifest');
});

test('every static HTML document has unique markup IDs', () => {
  for (const file of htmlFiles()) {
    const markup = read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const ids = [...markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${file}: duplicate static DOM IDs`);
  }
});
