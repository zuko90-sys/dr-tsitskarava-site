// Складывает сборку Vite в один HTML-файл: так прототип открывается
// двойным кликом, пересылается одним вложением и публикуется артефактом.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(web, 'dist');
const out = join(dirname(web), 'app-engine.html');

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
  .replace(/<script type="module"[^>]*src="\.\/app\.js"[^>]*><\/script>/, () => `<script type="module">\n${js}\n</script>`);

for (const leftover of [/href="\.\/app\.css"/, /src="\.\/app\.js"/]) {
  if (leftover.test(html)) throw new Error(`не удалось встроить ресурс: ${leftover}`);
}

writeFileSync(out, html, 'utf8');
console.log(`app-engine.html собран, ${Math.round(html.length / 1024)} КБ`);
