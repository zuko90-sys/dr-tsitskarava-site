// Пример сцен: рилс «Helicobacter pylori и анемия» (4 вставки, 41 с). Скопируй в проект как scenes.js и перепиши под свой ролик.
// Время вставок — в секундах готового ролика; оно же должно стоять в reel.json → inserts.
// AB: лупа находит H. pylori → гастрит → железо не усваивается → бледные эритроциты
const AB = (() => {
  const g = el('g', {}, root);
  const rbcs = [0, 1, 2].map(() => RBC(g));
  const fes = [0, 1, 2, 3, 4].map(() => FeBall(g));
  const crosses = fes.map(() => { const c = el('g', {}, g); el('path', {d: 'M-22,-22 L22,22 M22,-22 L-22,22', stroke: RED, 'stroke-width': 13, 'stroke-linecap': 'round'}, c); return c; });
  const st = Stomach(g, 'ab');
  const bs = [0, 1, 2].map(() => Bacterium(st.kids));
  const lens = el('g', {}, g);
  el('rect', {x: 92, y: -22, width: 190, height: 44, rx: 22, fill: GREEN, stroke: INK, 'stroke-width': 7, transform: 'rotate(45)'}, lens);
  el('circle', {r: 118, fill: '#fff', 'fill-opacity': .28, stroke: INK, 'stroke-width': 16}, lens);
  el('path', {d: 'M-70,-40 A82,82 0 0 1 -30,-78', fill: 'none', stroke: '#fff', 'stroke-width': 12, 'stroke-linecap': 'round', opacity: .9}, lens);
  const burst = Burst(g, INK);
  const lbHp = Label(g, 'H. pylori', {fill: LIME, color: INK});
  const lbGas = Label(g, 'ГАСТРИТ', {fill: RED});
  const lbAn = Label(g, 'АНЕМИЯ', {fill: RED});
  const BPOS = [[115, 150, -12], [-170, -115, 20], [-5, 200, 4]];
  return {
    g, labels: [lbHp, lbGas, lbAn],
    update(u, t) {
      // желудок: появляется, потом уезжает вверх и уменьшается (бит про анемию)
      const pop = E.outBack(prog(u, .05, .5));
      const up = E.inOut(prog(u, 6.05, 6.6));
      const sx = 540, sy = lerp(960, 800, up), ss = lerp(.95, .68, up) * pop;
      const inflam = E.inOut(prog(u, 3.6, 5.0));
      const mood = u < 2.05 ? 'happy' : u < 4.7 ? 'worried' : u < 6.2 ? 'pain' : 'sad';
      const look = u < 1.5 ? [0, 0] : u < 4.6 ? [-.8, .6] : [0, 0];
      st.set({x: sx, y: sy, s: ss, inflam, mood, t: u, look, pain: prog(u, 4.7, 5.0) * (1 - prog(u, 6.0, 6.3))});
      // бактерии
      const appear = [1.55, 3.3, 3.5];
      bs.forEach((b, i) => {
        const p = prog(u, appear[i], appear[i] + .55);
        const [bx, by, br] = BPOS[i];
        const nib = u > 3.6 ? 6 * Math.sin(u * 16 + i) : 0;
        b.set({x: bx + nib, y: by, s: .7 * E.outElastic(p), r: br + 6 * Math.sin(u * 3 + i), t: u + i, mood: 'sly', look: [.6, .3]});
      });
      // лупа
      let lx, ly;
      if (u < .95) { const p = E.outCubic(prog(u, .45, .95)); lx = lerp(1300, 720, p); ly = lerp(700, 820, p); }
      else if (u < 1.6) { const p = E.inOut(prog(u, .95, 1.6)); lx = lerp(720, 580, p); ly = lerp(820, 990, p); }
      else { const p = E.inOut(prog(u, 1.6, 2.0)); lx = lerp(580, 431, p); ly = lerp(990, 1100, p); }
      const out = E.inCubic(prog(u, 2.6, 3.0));
      lens.setAttribute('transform', tf(lx + out * 700, ly - out * 120, .95));
      lens.style.display = u < .45 || u > 3.0 ? 'none' : '';
      burst.set(431, 1102, prog(u, 1.55, 1.95));
      // ярлыки (верхний правый угол, где у желудка вогнутость)
      const lp = (a, b) => E.outBack(prog(u, a, a + .35)) * (1 - E.inCubic(prog(u, b, b + .25)));
      lbHp.set({x: 290, y: 690, s: lp(1.9, 3.0), r: -5});
      lbGas.set({x: 280, y: 700, s: lp(4.8, 6.0), r: -6});
      lbAn.set({x: 300, y: 615, s: lp(7.55, 9), r: -5});
      // эритроциты и железо
      const RX = [300, 540, 780];
      rbcs.forEach((rb, i) => {
        const p = E.outBack(prog(u, 6.45 + i * .1, 6.85 + i * .1));
        rb.set({x: RX[i], y: 1148, s: p * 1.15, pale: E.inOut(prog(u, 7.2 + i * .12, 7.9 + i * .12)), t: u + i, o: p > 0 ? 1 : 0});
      });
      fes.forEach((f, i) => {
        const t0 = 6.6 + i * .2, p = prog(u, t0, t0 + .55);
        const x = lerp(285 + (i - 2) * 8, 330 + i * 105, p), y = lerp(850, 1010, E.inCubic(p) * .6 + p * .4);
        const dead = prog(u, t0 + .5, t0 + .75);
        f.set({x, y, s: (p > 0 ? .9 : 0) * (1 - dead * .3), o: p > 0 ? 1 - dead : 0, r: p * 90});
        crosses[i].setAttribute('transform', tf(x, y - 4, E.outBack(prog(u, t0 + .45, t0 + .65)) * (1 - prog(u, t0 + .85, t0 + 1.05))));
        crosses[i].style.display = u < t0 + .45 || u > t0 + 1.05 ? 'none' : '';
      });
    }
  };
})();

// C: бактерия «сверлит» стенку → язва → капли крови → «незаметно»
const C = (() => {
  const g = el('g', {}, root);
  const st = Stomach(g, 'c');
  const drops = [0, 1, 2, 3, 4].map(() => Drop(st.kids));
  const b = Bacterium(st.kids);
  const dust = [0, 1, 2, 3].map(() => el('circle', {r: 9, fill: '#E58F8A', stroke: INK, 'stroke-width': 3}, st.kids));
  const burst = Burst(g, RED);
  const lbU = Label(g, 'ЯЗВА', {fill: '#B3262E'});
  const eye = el('g', {}, g);
  el('circle', {r: 74, fill: '#fff', stroke: INK, 'stroke-width': 7}, eye);
  el('path', {d: 'M-48,0 Q0,-40 48,0 Q0,40 -48,0 Z', fill: '#fff', stroke: INK, 'stroke-width': 6}, eye);
  el('circle', {r: 16, fill: INK}, eye);
  el('line', {x1: -46, y1: 46, x2: 46, y2: -46, stroke: RED, 'stroke-width': 11, 'stroke-linecap': 'round'}, eye);
  const lbHid = Label(g, 'незаметно', {fill: '#fff', color: INK, size: 40, h: 66, padX: 24});
  return {
    g, labels: [lbU, lbHid],
    update(u) {
      const pop = E.outBack(prog(u, .05, .45));
      const ul = E.outBack(prog(u, 2.05, 2.4));
      st.set({x: 540, y: 960, s: .95 * pop, inflam: .3 + .15 * prog(u, 2, 2.5), mood: u < 0.9 ? 'worried' : u < 2.6 ? 'pain' : 'sad', t: u + 3,
              look: [-.6, .9], ulcerS: ul, pain: prog(u, .9, 1.1) * (1 - prog(u, 2.5, 2.8))});
      // бактерия: прыгает и долбит стенку, потом отходит к краю язвы
      const bp = E.outElastic(prog(u, .15, .7));
      let bx = 150, by = 40, br = 70;
      if (u > .7 && u < 2.05) { const k = ((u - .7) / .25) % 1; by = 40 + 40 * Math.abs(Math.sin(k * Math.PI)); }
      if (u >= 2.05) { const p = E.inOut(prog(u, 2.05, 2.6)); bx = lerp(150, 255, p); by = lerp(40, 92, p); br = lerp(70, -15, p); }
      b.set({x: bx, y: by, s: .62 * bp, r: br, t: u, mood: 'sly', look: [.6, .6]});
      dust.forEach((d, i) => {
        const k = u > .7 && u < 2.05 ? ((u - .7) / .25) % 1 : 1;
        const a = -2.4 + i * .5 - Math.PI / 2 * 0;
        d.setAttribute('cx', 150 + Math.cos(a) * 60 * k + (i - 1.5) * 18); d.setAttribute('cy', 105 - 50 * Math.sin(k * Math.PI));
        d.setAttribute('opacity', u > .7 && u < 2.05 ? 1 - k : 0);
      });
      burst.set(540 - 150 * .95, 960 + 135 * .95, prog(u, 2.05, 2.4), 90);
      drops.forEach((d, i) => {
        const t0 = 3.55 + i * .6, p = prog(u, t0, t0 + .7);
        d.set({x: 150, y: 145 + 85 * E.inCubic(p), s: (p > 0 ? .55 + .3 * E.outCubic(prog(u, t0, t0 + .2)) : 0), o: p > 0 ? 1 - prog(u, t0 + .45, t0 + .7) : 0});
      });
      const lp = (a, b) => E.outBack(prog(u, a, a + .35)) * (1 - E.inCubic(prog(u, b, b + .25)));
      lbU.set({x: 270, y: 690, s: lp(2.15, 9), r: -6});
      const ep = lp(4.25, 9);
      eye.setAttribute('transform', tf(860, 1065, ep, -8)); eye.style.display = ep <= 0 ? 'none' : '';
      lbHid.set({x: 860, y: 1175, s: lp(4.45, 9), r: -4});
    }
  };
})();

// D: бледные эритроциты → «батарейка» железа разряжается, железо утекает
const D = (() => {
  const g = el('g', {}, root);
  const rbcs = [0, 1, 2].map(() => RBC(g));
  const lbAn = Label(g, 'АНЕМИЯ', {fill: RED});
  const bat = el('g', {}, g);
  const clip = el('clipPath', {id: 'batc'}, bat);
  el('rect', {x: -104, y: -194, width: 208, height: 388, rx: 26}, clip);
  el('rect', {x: -52, y: -238, width: 104, height: 40, rx: 12, fill: GREEN, stroke: INK, 'stroke-width': 7}, bat);
  el('rect', {x: -124, y: -214, width: 248, height: 428, rx: 40, fill: '#fff', stroke: INK, 'stroke-width': 9}, bat);
  const lvl = el('rect', {x: -104, y: 0, width: 208, height: 0, fill: MINT, 'clip-path': 'url(#batc)'}, bat);
  const wave = el('path', {d: '', fill: '#fff', opacity: .35, 'clip-path': 'url(#batc)'}, bat);
  el('text', {y: -110, 'text-anchor': 'middle', 'font-size': 64, fill: INK}, bat).textContent = 'Fe';
  const face = Face(bat, {lx: -40, rx: 40, y: 10, r: 20, mouthY: 70, w: 28});
  const leaks = [0, 1, 2, 3].map(() => FeBall(g));
  const lbStore = Label(g, 'ЗАПАСЫ ЖЕЛЕЗА', {fill: GREEN, size: 50, h: 88});
  const lbFer = Label(g, 'ферритин ↓', {fill: '#F2A33A', color: INK, size: 48, h: 84});
  return {
    g, labels: [lbAn, lbStore, lbFer],
    update(u) {
      const RX = [290, 540, 790];
      const gone = E.inCubic(prog(u, 1.15, 1.45));
      rbcs.forEach((rb, i) => {
        const p = E.outBack(prog(u, .1 + i * .15, .5 + i * .15));
        rb.set({x: RX[i], y: 960 + 30 * Math.sin(u * 2 + i), s: p * 1.45 * (1 - gone), pale: 1, t: u + i, o: p > 0 ? 1 - gone : 0});
      });
      const lp = (a, b) => E.outBack(prog(u, a, a + .35)) * (1 - E.inCubic(prog(u, b, b + .25)));
      lbAn.set({x: 540, y: 690, s: lp(.45, 1.15), r: -4});
      const bp = E.outBack(prog(u, 1.3, 1.7));
      bat.setAttribute('transform', tf(540, 900, bp * 1.15)); bat.style.display = bp <= 0 ? 'none' : '';
      const level = lerp(.78, .08, E.inOut(prog(u, 1.6, 3.3)));
      const H = 388 * level, top = 194 - H;
      const col = level > .45 ? mix('#F2A33A', MINT, (level - .45) / .33) : mix(RED, '#F2A33A', level / .45);
      const blinkLow = level < .2 ? (Math.sin(u * 16) > 0 ? 1 : .45) : 1;
      lvl.setAttribute('y', top); lvl.setAttribute('height', H); lvl.setAttribute('fill', col); lvl.setAttribute('opacity', blinkLow);
      let wd = `M-104,${top}`;
      for (let x = -104; x <= 104; x += 8) wd += ` L${x},${top + 6 * Math.sin(x * .06 + u * 8)}`;
      wave.setAttribute('d', wd + ` L104,${top + 22} L-104,${top + 22} Z`);
      face.set(level > .5 ? 'worried' : 'sad', u, [0, .4], blink(u, 2.2));
      leaks.forEach((f, i) => {
        const t0 = 1.85 + i * .4, p = prog(u, t0, t0 + .6);
        f.set({x: 540 + (i % 2 ? 30 : -30), y: 1165 + 90 * E.inCubic(p), s: p > 0 ? .75 : 0, o: p > 0 ? 1 - prog(u, t0 + .35, t0 + .6) : 0});
      });
      lbStore.set({x: 540, y: 565, s: lp(1.45, 9), r: 0});
      lbFer.set({x: 850, y: 800, s: lp(2.3, 9), r: -8});
    }
  };
})();

// E: чек-лист — желудок ✓, H. pylori ✓
const EE = (() => {
  const g = el('g', {}, root);
  const board = el('g', {filter: 'url(#soft)'}, g);
  el('rect', {x: -270, y: -320, width: 540, height: 640, rx: 34, fill: GREEN, stroke: INK, 'stroke-width': 9}, board);
  el('rect', {x: -232, y: -262, width: 464, height: 548, rx: 18, fill: '#FBFBF9', stroke: INK, 'stroke-width': 6}, board);
  el('rect', {x: -90, y: -350, width: 180, height: 70, rx: 22, fill: MINT, stroke: INK, 'stroke-width': 8}, board);
  const rows = [['Желудок', -100], ['H. pylori', 110]].map(([txt, y]) => {
    el('rect', {x: -190, y: y - 44, width: 88, height: 88, rx: 18, fill: '#fff', stroke: INK, 'stroke-width': 8}, board);
    const tx = el('text', {x: -78, y: y + 18, 'font-size': 56, fill: INK, 'font-weight': 800}, board); tx.textContent = txt;
    const ck = el('path', {d: `M-176,${y} L-150,${y + 28} L-96,${y - 40}`, fill: 'none', stroke: '#2FA67A', 'stroke-width': 18, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': 160, 'stroke-dashoffset': 160}, board);
    return ck;
  });
  const bursts = [Burst(g, '#2FA67A'), Burst(g, '#2FA67A')];
  const st = Stomach(g, 'e');
  return {
    g, labels: [],
    update(u) {
      const p = E.outBack(prog(u, .05, .5));
      board.setAttribute('transform', tf(540, 905, p * .95, -2));
      const C1 = 1.9, C2 = 3.45;
      rows[0].setAttribute('stroke-dashoffset', 160 * (1 - E.outCubic(prog(u, C1, C1 + .3))));
      rows[1].setAttribute('stroke-dashoffset', 160 * (1 - E.outCubic(prog(u, C2, C2 + .3))));
      bursts[0].set(540 + (-136) * .95, 905 + (-100) * .95, prog(u, C1 + .15, C1 + .55), 70);
      bursts[1].set(540 + (-136) * .95, 905 + 110 * .95, prog(u, C2 + .15, C2 + .55), 70);
      const sp = E.outBack(prog(u, .6, 1.0));
      const happy = u > C1 + .2;
      st.set({x: 860, y: 1140 + 8 * Math.sin(u * 5), s: .36 * sp, r: 10, inflam: 0, mood: happy ? 'happy' : 'neutral', t: u + 1, look: [-.8, -.6]});
    }
  };
})();
setupTimeline([
  {t0: 6.03, t1: 14.43, sc: AB},
  {t0: 16.40, t1: 22.80, sc: C},
  {t0: 25.80, t1: 29.50, sc: D},
  {t0: 34.60, t1: 38.90, sc: EE},
]);
