// Покадровый рендер анимационных вставок из <проект>/anim/anim.html (+ lib.js, scenes.js).
//   node render.js <проект>/anim stills 7.5,10,13.8      → <проект>/anim/stills/s_<t>.png
//   node render.js <проект>/anim frames <кадров> [fps]   → <проект>/anim/frames/%05d.png
// Вне вставок пишется прозрачный кадр. Шрифты берутся из $REELS_KIT/fonts.
const {chromium} = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KIT = process.env.REELS_KIT || path.join(os.homedir(), '.cache', 'reels-kit');
const FONTS = `
@font-face{font-family:'Golos';src:url('file://${KIT}/fonts/GolosText-ExtraBold.ttf');font-weight:800}
@font-face{font-family:'Golos';src:url('file://${KIT}/fonts/GolosText-Bold.ttf');font-weight:700}
@font-face{font-family:'Piazzolla';src:url('file://${KIT}/fonts/Piazzolla-SemiBold.ttf');font-weight:600}`;

(async () => {
  const [dir, mode, arg, fpsArg] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}});
  await page.goto('file://' + path.resolve(dir, 'anim.html'));
  await page.addStyleTag({content: FONTS});
  await page.evaluate(async () => {
    // шрифты грузятся лениво — заставляем загрузить до замера ширины ярлыков
    await Promise.all(['800 40px Golos', '700 40px Golos', '600 40px Piazzolla'].map(f => document.fonts.load(f)));
    await document.fonts.ready;
    window.fitLabels();
  });
  if (mode === 'stills') {
    fs.mkdirSync(path.join(dir, 'stills'), {recursive: true});
    for (const t of arg.split(',').map(Number)) {
      await page.evaluate(t => window.renderAt(t), t);
      await page.screenshot({path: path.join(dir, 'stills', `s_${t}.png`), omitBackground: true});
    }
  } else {
    const n = Number(arg), fps = Number(fpsArg || 30);
    const out = path.join(dir, 'frames');
    fs.rmSync(out, {recursive: true, force: true});
    fs.mkdirSync(out, {recursive: true});
    await page.evaluate(() => window.renderAt(-1));
    const blank = path.join(out, 'blank.png');
    await page.screenshot({path: blank, omitBackground: true});
    for (let i = 0; i < n; i++) {
      const t = i / fps, f = path.join(out, String(i).padStart(5, '0') + '.png');
      if (await page.evaluate(t => window.activeAt(t), t)) {
        await page.evaluate(t => window.renderAt(t), t);
        await page.screenshot({path: f, omitBackground: true});
      } else {
        fs.copyFileSync(blank, f);
      }
      if (i % 150 === 0) console.log('кадр', i, 'из', n);
    }
    fs.rmSync(blank);
  }
  await browser.close();
})();
