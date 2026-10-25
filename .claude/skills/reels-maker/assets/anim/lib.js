// Библиотека мультяшной анимации для вставок в рилс (SVG 1080×1920, покадровый рендер через Playwright).
// Сцены пишутся в scenes.js и регистрируются через setupTimeline([...]). Подробности: references/animation.md
const INK = '#16362B', MINT = '#71CDA7', GREEN = '#0E5240', RED = '#E5484D', LIME = '#B9D24A';
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const E = {
  outBack: (x, s = 1.9) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inCubic: x => x * x * x,
  inOut: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outElastic: x => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI / 3)) + 1,
};
function mix(c1, c2, x) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(x))).toString(16).padStart(2, '0')).join('');
}
const tf = (x, y, s = 1, r = 0) => `translate(${x} ${y}) rotate(${r}) scale(${s})`;
// мигание: закрыты на 0.12 с раз в period секунд
const blink = (t, period = 2.6, off = 0) => ((t + off) % period) < 0.12;

/* ---------- персонажи ---------- */

function Face(parent, o) {
  // o: {lx, rx, y, r, mouthY, w}
  const g = el('g', {}, parent);
  const eyes = [o.lx, o.rx].map(x => {
    const eg = el('g', {}, g);
    const white = el('ellipse', {cx: x, cy: o.y, rx: o.r, ry: o.r * 1.15, fill: '#fff', stroke: INK, 'stroke-width': 5}, eg);
    const pupil = el('circle', {cx: x, cy: o.y, r: o.r * .55, fill: INK}, eg);
    const glint = el('circle', {cx: x + o.r * .2, cy: o.y - o.r * .3, r: o.r * .18, fill: '#fff'}, eg);
    const shut = el('path', {d: '', fill: 'none', stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round'}, eg);
    return {x, eg, white, pupil, glint, shut};
  });
  const brows = [0, 1].map(() => el('path', {d: '', fill: 'none', stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round'}, g));
  const mouth = el('path', {d: '', fill: INK, stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}, g);
  const cheeks = [o.lx - o.r * 1.1, o.rx + o.r * 1.1].map(x => el('ellipse', {cx: x, cy: o.mouthY - o.r * .3, rx: o.r * .75, ry: o.r * .45, fill: '#F27B86', opacity: .45}, g));
  return {
    g,
    set(mood, t = 0, look = [0, 0], blinkOn = false) {
      const r = o.r, y = o.y, my = o.mouthY, w = o.w;
      const closed = blinkOn || mood === 'pain' || mood === 'tired';
      eyes.forEach((e, i) => {
        const vis = !closed;
        e.white.style.display = e.pupil.style.display = e.glint.style.display = vis ? '' : 'none';
        e.pupil.setAttribute('cx', e.x + look[0] * r * .35); e.pupil.setAttribute('cy', y + look[1] * r * .35);
        e.glint.setAttribute('cx', e.x + look[0] * r * .35 + r * .2); e.glint.setAttribute('cy', y + look[1] * r * .35 - r * .3);
        let d = '';
        if (mood === 'pain') d = i ? `M${e.x + r * .7},${y - r * .7} L${e.x - r * .6},${y} L${e.x + r * .7},${y + r * .7}`
                                  : `M${e.x - r * .7},${y - r * .7} L${e.x + r * .6},${y} L${e.x - r * .7},${y + r * .7}`;
        else if (closed) d = `M${e.x - r * .8},${y + r * .1} Q${e.x},${y + r * .7} ${e.x + r * .8},${y + r * .1}`;
        e.shut.setAttribute('d', d);
      });
      const bset = {
        happy: [-.15, -.15], neutral: [0, 0], worried: [.45, -.45], pain: [.5, -.5], sad: [.45, -.45], tired: [.2, -.2], sly: [-.5, .5],
      }[mood] || [0, 0];
      brows.forEach((b, i) => {
        const x = eyes[i].x, s = i ? -1 : 1, by = y - r * 1.7;
        // наклон бровей: внутренние концы выше/ниже
        const inner = by - bset[0] * r * s * (i ? -1 : 1), outer = by - bset[1] * r * s * (i ? -1 : 1);
        const xi = x + s * r * .9, xo = x - s * r * .9;
        b.setAttribute('d', `M${xo},${outer} Q${x},${Math.min(inner, outer) - r * .25} ${xi},${inner}`);
        b.style.display = (mood === 'neutral' || mood === 'happy') ? 'none' : '';
      });
      let md;
      const wob = Math.sin(t * 18) * 3;
      if (mood === 'happy') md = `M${-w},${my} Q0,${my + w * 1.1} ${w},${my} Q0,${my + w * .35} ${-w},${my} Z`;
      else if (mood === 'neutral') md = `M${-w * .7},${my + 2} Q0,${my + w * .55} ${w * .7},${my + 2} Q0,${my + w * .3} ${-w * .7},${my + 2} Z`;
      else if (mood === 'worried') md = `M${-w * .6},${my + 8} Q${-w * .3},${my - 4 + wob} 0,${my + 6} Q${w * .3},${my + 14 - wob} ${w * .6},${my + 4} Q0,${my + 6} ${-w * .6},${my + 8} Z`;
      else if (mood === 'pain') md = `M${-w * .8},${my + 6} Q0,${my - w * .5} ${w * .8},${my + 6} Q0,${my + w * .9 + wob} ${-w * .8},${my + 6} Z`;
      else if (mood === 'sad' || mood === 'tired') md = `M${-w * .6},${my + 14} Q0,${my - w * .35} ${w * .6},${my + 14} Q0,${my} ${-w * .6},${my + 14} Z`;
      else if (mood === 'sly') md = `M${-w * .9},${my - 4} Q0,${my + w * 1.05} ${w * .9},${my - 10} Q${w * .1},${my + w * .35} ${-w * .9},${my - 4} Z`;
      mouth.setAttribute('d', md);
      cheeks.forEach(c => c.style.display = (mood === 'happy' || mood === 'neutral' || mood === 'sly') ? '' : 'none');
    }
  };
}

const STOMACH_D = 'M-46,-330 L-46,-205 C-170,-238 -270,-150 -268,-20 C-266,140 -130,250 50,250 C190,250 285,185 325,95 ' +
  'L398,72 C416,66 424,52 420,36 L413,6 C409,-9 397,-14 383,-10 L318,8 C270,40 210,56 150,38 C85,18 46,-50 46,-205 ' +
  'L46,-330 C46,-352 -46,-352 -46,-330 Z';

function Stomach(parent, id) {
  const g = el('g', {}, parent);
  el('ellipse', {cx: 40, cy: 290, rx: 300, ry: 26, fill: INK, opacity: .10}, g);
  const clip = el('clipPath', {id: 'stc' + id}, g);
  el('path', {d: STOMACH_D}, clip);
  const body = el('path', {d: STOMACH_D, fill: '#F7B3AC', stroke: INK, 'stroke-width': 9, 'stroke-linejoin': 'round'}, g);
  const inner = el('g', {'clip-path': `url(#stc${id})`}, g);
  el('path', {d: 'M-215,10 C-160,80 -60,110 60,100', fill: 'none', stroke: '#E58F8A', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: .7}, inner);
  el('path', {d: 'M-175,120 C-110,175 0,195 120,165', fill: 'none', stroke: '#E58F8A', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: .7}, inner);
  el('ellipse', {cx: -170, cy: -90, rx: 52, ry: 88, fill: '#fff', opacity: .32, transform: 'rotate(-25 -170 -90)'}, inner);
  const hot = el('g', {opacity: 0}, inner);
  [[110, 150, 120], [-170, -110, 110], [20, 200, 110], [-235, 60, 95], [215, 95, 100], [-60, 30, 120]].forEach(([x, y, r]) =>
    el('circle', {cx: x, cy: y, r, fill: 'url(#hot)'}, hot));
  const ulcer = el('g', {transform: 'translate(150 135) scale(0)'}, inner);
  el('ellipse', {cx: 0, cy: 0, rx: 66, ry: 40, fill: '#D24A4C', stroke: INK, 'stroke-width': 6}, ulcer);
  el('ellipse', {cx: 0, cy: 4, rx: 46, ry: 25, fill: '#7E1A24'}, ulcer);
  el('ellipse', {cx: -10, cy: 0, rx: 18, ry: 8, fill: '#A82B35'}, ulcer);
  const face = Face(g, {lx: -158, rx: -62, y: 10, r: 26, mouthY: 78, w: 34});
  const pains = el('g', {opacity: 0}, g);
  [[-300, -150, -20], [-310, 30, 10], [370, -60, 25], [300, 210, -10]].forEach(([x, y, r]) => {
    const p = el('g', {transform: `translate(${x} ${y}) rotate(${r})`}, pains);
    el('path', {d: 'M0,-34 L12,-8 L-6,4 L8,34', fill: 'none', stroke: RED, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, p);
  });
  const kids = el('g', {}, g); // бактерии «на» желудке двигаются вместе с ним
  return {
    g, kids,
    set({x, y, s = 1, r = 0, inflam = 0, mood = 'neutral', t = 0, look = [0, 0], ulcerS = 0, pain = 0}) {
      // анатомически: дно желудка справа от зрителя, привратник слева
      g.setAttribute('transform', tf(x, y, s, r) + ' scale(-1 1)');
      body.setAttribute('fill', mix('#F7B3AC', '#F2837A', inflam));
      hot.setAttribute('opacity', inflam * (.85 + .15 * Math.sin(t * 7)));
      ulcer.setAttribute('transform', `translate(150 135) scale(${ulcerS})`);
      pains.setAttribute('opacity', pain * (.6 + .4 * Math.abs(Math.sin(t * 9))));
      face.set(mood, t, [-look[0], look[1]], blink(t, 2.4, 0.7));
    }
  };
}

function Bacterium(parent) {
  const g = el('g', {}, parent);
  const fl = [0, 1, 2, 3].map(() => el('path', {d: '', fill: 'none', stroke: INK, 'stroke-width': 7, 'stroke-linecap': 'round'}, g));
  const out = el('path', {d: '', fill: 'none', stroke: INK, 'stroke-width': 86, 'stroke-linecap': 'round'}, g);
  const body = el('path', {d: '', fill: 'none', stroke: LIME, 'stroke-width': 72, 'stroke-linecap': 'round'}, g);
  const hl = el('path', {d: '', fill: 'none', stroke: '#DDEB8E', 'stroke-width': 14, 'stroke-linecap': 'round'}, g);
  const spots = [[-50, 4], [-10, 12], [-70, -10]].map(([x, y]) => el('circle', {cx: x, cy: y, r: 7, fill: '#93AE2C'}, g));
  const fg = el('g', {}, g);
  const face = Face(fg, {lx: 62, rx: 98, y: -8, r: 13, mouthY: 18, w: 20});
  return {
    g,
    set({x, y, s = 1, r = 0, t = 0, mood = 'sly', look = [.6, 0], vis = 1, sx = 1}) {
      g.setAttribute('transform', tf(x, y, s, r) + ` scale(${sx} 1)`);
      g.setAttribute('opacity', vis);
      g.style.display = s <= 0.001 || vis <= 0 ? 'none' : '';
      const a = 26 + 10 * Math.sin(t * 9);
      const d = `M-100,0 C-70,${a} -40,${a} -10,0 C20,${-a} 50,${-a} 80,0`;
      out.setAttribute('d', d); body.setAttribute('d', d);
      hl.setAttribute('d', `M-88,${-12 + a * .25} C-70,${a * .5 - 14} -50,${a * .55 - 14} -30,${a * .2 - 16}`);
      spots.forEach((sp, i) => sp.setAttribute('cy', [4, 12, -10][i] + (i === 1 ? -a * .6 : a * .55)));
      fl.forEach((f, j) => {
        const ang = (-34 + j * 22) * Math.PI / 180;
        let pts = [];
        for (let k = 0; k <= 14; k++) {
          const L = k * 8.5, w = 9 * Math.sin(t * 14 + k * .75 + j);
          pts.push([-136 - Math.cos(ang) * L - Math.sin(ang) * w * -1, Math.sin(ang) * L + Math.cos(ang) * w]);
        }
        f.setAttribute('d', 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' L'));
      });
      face.set(mood, t, look, blink(t, 2.1, x * .01));
    }
  };
}

function FeBall(parent) {
  const g = el('g', {}, parent);
  el('circle', {r: 36, fill: '#C9773E', stroke: INK, 'stroke-width': 6}, g);
  el('circle', {cx: -12, cy: -14, r: 9, fill: '#fff', opacity: .45}, g);
  el('text', {y: 11, 'text-anchor': 'middle', 'font-size': 30, fill: '#fff'}, g).textContent = 'Fe';
  return {g, set({x, y, s = 1, o = 1, r = 0}) { g.setAttribute('transform', tf(x, y, s, r)); g.setAttribute('opacity', o); g.style.display = o <= 0 || s <= 0 ? 'none' : ''; }};
}

function RBC(parent) {
  const g = el('g', {}, parent);
  const outer = el('ellipse', {rx: 82, ry: 74, fill: '#E5484D', stroke: INK, 'stroke-width': 7}, g);
  const dimple = el('ellipse', {cx: 0, cy: -6, rx: 46, ry: 36, fill: '#F27C78'}, g);
  const face = Face(g, {lx: -28, rx: 28, y: -6, r: 14, mouthY: 28, w: 20});
  const zz = el('text', {x: 70, y: -70, 'font-size': 38, fill: INK, opacity: 0}, g);
  zz.textContent = 'z z';
  return {
    g,
    set({x, y, s = 1, pale = 0, t = 0, o = 1, mood}) {
      g.setAttribute('transform', tf(x, y, s * lerp(1, .8, pale)));
      g.setAttribute('opacity', o); g.style.display = o <= 0 || s <= 0 ? 'none' : '';
      outer.setAttribute('fill', mix('#E5484D', '#F7CFCB', pale));
      dimple.setAttribute('fill', mix('#F27C78', '#FCEAE8', pale));
      face.set(mood || (pale > .6 ? 'tired' : pale > .25 ? 'worried' : 'happy'), t, [0, pale * .5], blink(t, 2.3, x * .013));
      zz.setAttribute('opacity', clamp((pale - .7) * 3.3) * (.6 + .4 * Math.sin(t * 4)));
      zz.setAttribute('y', -70 - 10 * Math.sin(t * 2));
    }
  };
}

function Label(parent, text, {fill = RED, color = '#fff', size = 58, padX = 34, h = 96} = {}) {
  const g = el('g', {}, parent);
  const t = el('text', {x: 0, y: size * .36, 'text-anchor': 'middle', 'font-size': size, fill: color}, null);
  t.textContent = text;
  const w = text.length * size * .66 + padX * 2;   // уточняется после загрузки шрифтов
  const r = el('rect', {x: -w / 2, y: -h / 2, width: w, height: h, rx: h / 2, fill, stroke: INK, 'stroke-width': 6}, g);
  g.appendChild(t);
  return {
    g, fit() { const bw = t.getBBox().width + padX * 2; r.setAttribute('x', -bw / 2); r.setAttribute('width', bw); },
    set({x, y, s = 1, r: rot = 0, o = 1}) { g.setAttribute('transform', tf(x, y, s, rot)); g.setAttribute('opacity', o); g.style.display = s <= 0 || o <= 0 ? 'none' : ''; }
  };
}

function Burst(parent, color = INK) {
  const g = el('g', {}, parent);
  const ls = [...Array(8)].map((_, i) => el('line', {stroke: color, 'stroke-width': 8, 'stroke-linecap': 'round'}, g));
  return {
    g, set(x, y, p, R = 120) {
      g.style.display = p <= 0 || p >= 1 ? 'none' : '';
      g.setAttribute('transform', `translate(${x} ${y})`);
      ls.forEach((l, i) => {
        const a = i / 8 * Math.PI * 2 + .2, r0 = R * (.55 + .5 * E.outCubic(p)), r1 = r0 + 34 * (1 - p);
        l.setAttribute('x1', Math.cos(a) * r0); l.setAttribute('y1', Math.sin(a) * r0);
        l.setAttribute('x2', Math.cos(a) * r1); l.setAttribute('y2', Math.sin(a) * r1);
        l.setAttribute('opacity', 1 - p);
      });
    }
  };
}

function Drop(parent) {
  const g = el('g', {}, parent);
  el('path', {d: 'M0,-34 C16,-10 26,4 26,17 A26,26 0 1 1 -26,17 C-26,4 -16,-10 0,-34 Z', fill: '#D7313A', stroke: INK, 'stroke-width': 5}, g);
  el('ellipse', {cx: -9, cy: 12, rx: 6, ry: 10, fill: '#fff', opacity: .5}, g);
  return {g, set({x, y, s = 1, o = 1}) { g.setAttribute('transform', tf(x, y, s)); g.setAttribute('opacity', o); g.style.display = o <= 0 || s <= 0 ? 'none' : ''; }};
}

/* ---------- фон ---------- */
const bub = document.getElementById('bubbles');
const BUBS = [[120, 700, 90], [930, 560, 130], [880, 1420, 110], [160, 1350, 150], [520, 1700, 120], [980, 1050, 60], [70, 1050, 50], [700, 300, 70]]
  .map(([x, y, r], i) => ({x, y, r, i, e: el('circle', {r, fill: MINT, opacity: .16}, bub)}));
function bubbles(t) { BUBS.forEach(b => { b.e.setAttribute('cx', b.x + 18 * Math.sin(t * .7 + b.i)); b.e.setAttribute('cy', b.y - 14 * t % 40 + 12 * Math.cos(t * .5 + b.i)); }); }


const root = document.getElementById('scenes');

/* ---------- таймлайн ---------- */
// inserts: [{t0, t1, sc}] — время в секундах готового ролика; sc = {g, labels, update(u, t)}
function setupTimeline(inserts, {iris = .32, irisCenter = [540, 900]} = {}) {
  const ic = document.getElementById('irisC');
  ic.setAttribute('cx', irisCenter[0]); ic.setAttribute('cy', irisCenter[1]);
  window.fitLabels = () => inserts.forEach(i => (i.sc.labels || []).forEach(l => l.fit()));
  window.activeAt = t => inserts.some(i => t >= i.t0 && t < i.t1);
  window.renderAt = t => {
    const cur = inserts.find(i => t >= i.t0 && t < i.t1);
    document.getElementById('root').style.display = cur ? '' : 'none';
    if (!cur) return;
    const u = t - cur.t0, d = cur.t1 - cur.t0;
    // «ирис»: круг раскрывается в начале вставки и схлопывается в конце, под ним видно видео
    const r = 1250 * Math.min(E.outCubic(prog(u, 0, iris)), 1 - E.inCubic(prog(u, d - iris, d)));
    ic.setAttribute('r', Math.max(0, r));
    inserts.forEach(i => i.sc.g.style.display = i === cur ? '' : 'none');
    bubbles(t);
    cur.sc.update(u, t);
  };
}
