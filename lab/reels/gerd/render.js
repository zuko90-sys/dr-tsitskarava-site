/* Рендер рилса в MP4 (1080×1920, 30 к/с, H.264 + тихая дорожка AAC).
 *
 *   NODE_PATH=$(npm root -g) node lab/reels/gerd/render.js
 *   NODE_PATH=$(npm root -g) node lab/reels/gerd/render.js --shots 1.2,9.5,40   # только кадры в PNG
 *
 * Нужны playwright (Chromium) и ffmpeg. Страница сама считает каждый кадр
 * по времени (window.reel.render), поэтому видео идёт ровно, без рывков. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const OUT_DIR = __dirname;
const FPS = 30;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };

function serve() {
  const srv = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${srv.address().port}/lab/reels/gerd/?capture`);
  await page.evaluate(() => window.reel.ready);
  const duration = await page.evaluate(() => window.reel.duration);

  const shots = arg('--shots');
  if (shots) {
    const dir = arg('--dir') || OUT_DIR;
    for (const t of shots.split(',').map(Number)) {
      await page.evaluate((t) => window.reel.render(t), t);
      await page.screenshot({ path: path.join(dir, `shot-${t.toFixed(2)}.png`) });
    }
  } else {
    const out = path.join(OUT_DIR, arg('--out') || 'gerd-reel.mp4');
    const frames = Math.round(duration * FPS);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map', '0:v', '-map', '1:a', '-shortest',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, fail) => ff.on('close', (c) => (c ? fail(new Error('ffmpeg ' + c)) : ok())));
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.reel.render(t), i / FPS);
      const png = await page.screenshot({ type: 'png' });
      if (!ff.stdin.write(png)) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (i % 150 === 0) process.stdout.write(`кадр ${i}/${frames}\n`);
    }
    ff.stdin.end();
    await done;
    /* обложка: последний кадр хука, когда всё на месте */
    const hook = await page.evaluate(() => window.reel.scenes[0]);
    await page.evaluate((t) => window.reel.render(t), hook.start + hook.dur - 0.45);
    await page.screenshot({ path: path.join(OUT_DIR, 'cover.jpg'), type: 'jpeg', quality: 92 });
    console.log(`готово: ${out} (${duration.toFixed(1)} с, ${frames} кадров) + cover.jpg`);
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
