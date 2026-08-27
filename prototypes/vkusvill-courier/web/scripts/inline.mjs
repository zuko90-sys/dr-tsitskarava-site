// Складывает сборку Vite в отдельные файлы прототипа:
//   ../app-engine.html          — один самодостаточный файл, открывается двойным
//                                 кликом, пересылается вложением, кладётся на хостинг;
//   ../app-engine.artifact.html — то же без обёртки html/head/body и фавиконки:
//                                 Claude Artifacts добавляет скелет и иконку сами.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(web, 'dist');
const out = join(dirname(web), 'app-engine.html');
const outArtifact = join(dirname(web), 'app-engine.artifact.html');

if (!existsSync(join(dist, 'index.html'))) {
  throw new Error('dist/index.html не найден — сначала npm run build');
}

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = readFileSync(join(dist, 'app.css'), 'utf8');
const js = readFileSync(join(dist, 'app.js'), 'utf8');

// Подстановка только функцией: в строке-замене «$&», «$'» и подобные
// последовательности имеют для String.replace особый смысл, и собранный JS
// на них уже наступал — тег скрипта возвращался на место вместо кода.
html = html
  .replace(/<link rel="stylesheet"[^>]*href="\.\/app\.css"[^>]*>/, () => `<style>\n${css}\n</style>`)
  // data-cfasync="false" выключает Cloudflare Rocket Loader для этого скрипта:
  // иначе оптимизатор может переписать тег, и страница останется без логики.
  .replace(/<script type="module"[^>]*src="\.\/app\.js"[^>]*><\/script>/, () => `<script type="module" data-cfasync="false">\n${js}\n</script>`);

for (const leftover of [/href="\.\/app\.css"/, /src="\.\/app\.js"/]) {
  if (leftover.test(html)) throw new Error(`не удалось встроить ресурс: ${leftover}`);
}

writeFileSync(out, html, 'utf8');
console.log(`app-engine.html собран, ${Math.round(html.length / 1024)} КБ`);

// ── Артефактная версия: без каркаса документа ──
let art = html;
for (const re of [
  /^\s*<!doctype html>\n/i,
  /^\s*<html lang="ru">\n/im,
  /^\s*<head>\n/im,
  /^\s*<\/head>\n/im,
  /^\s*<body>\n/im,
  /^\s*<\/body>\n/im,
  /^\s*<\/html>\n?/im,
  /^\s*<meta charset[^>]*>\n/im,
  /^\s*<meta name="viewport"[^>]*>\n/im,
  /^\s*<meta name="robots"[^>]*>\n/im,
  /^\s*<link rel="icon"[^>]*>\n/im, // иконку артефакту задаёт параметр favicon
]) {
  art = art.replace(re, '');
}
art = art.trimStart();

if (!art.startsWith('<title>')) throw new Error('артефакт: <title> должен остаться первой строкой');
if (/<!doctype|<html|<head>|<body>/i.test(art)) throw new Error('артефакт: обёртка снята не полностью');

writeFileSync(outArtifact, art, 'utf8');
console.log(`app-engine.artifact.html собран, ${Math.round(art.length / 1024)} КБ`);
