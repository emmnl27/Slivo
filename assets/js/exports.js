/* ============================================================
   DeckAI · exportación a PDF y a PowerPoint (.pptx)
   ============================================================ */

const Exports = (() => {

  /* Conversión de píxeles (lienzo 1280x720) a pulgadas y a puntos de PowerPoint.
     1280 px = 10 in  ->  1 px = 1/128 in = 0,5625 pt                          */
  const IN = px => +(px / 128).toFixed(3);
  const PT = px => +(px * 0.5625).toFixed(1);

  const hex = c => String(c || '#000000').replace('#', '').slice(0, 6).toUpperCase();
  const clean = s => String(s || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[\s(])\*([^*]+)\*/g, '$1$2').trim();

  function themeOf(id) { return Store.themeById(id); }

  const FONT = 'Segoe UI';
  const FONT_ALT = 'Georgia';

  /* ---------------- PDF ---------------- */

  function pdf() {
    if (!App.deck().slides.length) { Store.toast('No hay diapositivas que exportar.', 'err'); return; }

    const wasEditing = App.state.ui.editing;
    App.state.ui.editing = false;
    Editor.refresh({ inspector: false });

    const restore = () => {
      App.state.ui.editing = wasEditing;
      Editor.refresh({ inspector: false });
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    Store.toast('En el diálogo de impresión elige "Guardar como PDF" y pon los márgenes en "Ninguno".');
    setTimeout(() => window.print(), 220);
  }

  /* ---------------- PowerPoint ---------------- */

  /** Convierte un linear-gradient CSS (de colores hex) en un PNG 1280x720.
      PptxGenJS no entiende degradados, así que se pintan en un lienzo y se usan
      como fondo de la diapositiva. Devuelve null si el CSS no es un degradado. */
  function gradientBg(cssBg) {
    const m = /linear-gradient\(([^)]+)\)/i.exec(String(cssBg || ''));
    if (!m || typeof document === 'undefined') return null;

    const parts = m[1].split(',').map(s => s.trim()).filter(Boolean);
    let angle = 180;                                  // por defecto, de arriba abajo
    if (/^-?\d+(\.\d+)?deg$/i.test(parts[0])) angle = parseFloat(parts.shift());

    const stops = [];
    for (const p of parts) {
      const hit = /^(#[0-9a-fA-F]{3,8})(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(p);
      if (!hit) return null;                          // rgba() u otro formato: mejor color plano
      stops.push({ color: hit[1], at: hit[2] != null ? parseFloat(hit[2]) / 100 : null });
    }
    if (stops.length < 2) return null;
    stops.forEach((s, i) => { if (s.at == null) s.at = i / (stops.length - 1); });

    const c = document.createElement('canvas');
    c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d');
    const rad = (angle - 90) * Math.PI / 180;
    const len = Math.abs(1280 * Math.cos(rad)) + Math.abs(720 * Math.sin(rad));
    const dx = Math.cos(rad) * len / 2, dy = Math.sin(rad) * len / 2;
    const g = ctx.createLinearGradient(640 - dx, 360 - dy, 640 + dx, 360 + dy);
    stops.forEach(s => g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    try { return c.toDataURL('image/png').replace(/^data:/, ''); } catch (e) { return null; }
  }

  function pptx() {
    const deck = App.deck();
    if (!deck.slides.length) { Store.toast('No hay diapositivas que exportar.', 'err'); return; }
    if (typeof PptxGenJS === 'undefined') {
      Store.toast('No se pudo cargar la librería de PowerPoint (sin conexión a internet).', 'err');
      return;
    }

    const t = themeOf(deck.theme);
    const C = {
      bg: hex(t.solid),
      fg: hex(t.css['--fg']),
      accent: hex(t.css['--accent']),
      accent2: hex(t.css['--accent-2']),
      muted: hex(t.css['--muted'])
    };
    const serif = /Georgia/.test(t.css['--title-font'] || '');

    const doc = new PptxGenJS();
    doc.layout = 'LAYOUT_16x9';            // 10 x 5,625 pulgadas
    doc.author = deck.author || 'DeckAI';
    doc.company = 'DeckAI';
    doc.title = deck.title || 'Presentación';
    doc.subject = deck.subtitle || '';

    const add = (s, text, opt) => s.addText(clean(text), Object.assign({ fontFace: FONT, color: C.fg }, opt));

    deck.slides.forEach((sl, index) => {
      const s = doc.addSlide();
      const fondoDeg = gradientBg(t.css['--bg']);
      s.background = fondoDeg ? { data: fondoDeg } : { color: C.bg };
      if (sl.notes) s.addNotes(clean(sl.notes));

      switch (sl.layout) {
        case 'cover': {
          const im0 = Store.slideImages(sl)[0];
          if (im0) addImage(s, im0, 0, 0, IN(1280), IN(720));
          const k = sl.kicker ? add(s, sl.kicker, { x: IN(78), y: IN(250), w: IN(1000), h: IN(30), fontSize: PT(17), bold: true, color: C.accent, charSpacing: 3 }) : null;
          add(s, sl.title || deck.title, { x: IN(78), y: k ? IN(288) : IN(250), w: IN(1000), h: IN(140), fontSize: PT(70), bold: true, color: C.fg, fontFace: serif ? FONT_ALT : FONT });
          if (sl.subtitle || deck.subtitle) add(s, sl.subtitle || deck.subtitle, { x: IN(78), y: IN(440), w: IN(950), h: IN(70), fontSize: PT(28), color: C.muted });
          add(s, `${sl.author || deck.author || ''}${deck.date ? '   ·   ' + deck.date : ''}`.trim(), { x: IN(78), y: IN(600), w: IN(1000), h: IN(34), fontSize: PT(19), color: C.muted });
          break;
        }

        case 'section': {
          if (sl.kicker) add(s, sl.kicker, { x: IN(78), y: IN(250), w: IN(900), h: IN(30), fontSize: PT(17), bold: true, color: C.accent, charSpacing: 3 });
          add(s, sl.title, { x: IN(78), y: IN(292), w: IN(1000), h: IN(120), fontSize: PT(60), bold: true, color: C.fg, fontFace: serif ? FONT_ALT : FONT });
          if (sl.subtitle) add(s, sl.subtitle, { x: IN(78), y: IN(420), w: IN(900), h: IN(60), fontSize: PT(26), color: C.muted });
          break;
        }

        case 'agenda': {
          header(s, sl, C, serif);
          const rows = sl.bullets.slice(0, 8);
          rows.forEach((b, i) => {
            const y = 210 + i * 54;
            add(s, String(i + 1).padStart(2, '0'), { x: IN(78), y: IN(y), w: IN(60), h: IN(32), fontSize: PT(22), bold: true, color: C.accent });
            add(s, b, { x: IN(150), y: IN(y), w: IN(1000), h: IN(34), fontSize: PT(25), color: C.fg });
            s.addShape('line', { x: IN(78), y: IN(y + 44), w: IN(1124), h: 0, line: { color: C.muted, width: 0.5 } });
          });
          break;
        }

        case 'bullets': {
          header(s, sl, C, serif);
          bullets(s, sl.bullets, { x: IN(78), y: IN(230), w: IN(1124), h: IN(420), size: 27, color: C.fg });
          break;
        }

        case 'two-col': {
          header(s, sl, C, serif);
          const cols = sl.columns.slice(0, 3);
          const gap = 46, w = (1124 - gap * (cols.length - 1)) / cols.length;
          cols.forEach((c, i) => {
            const x = 78 + i * (w + gap);
            s.addShape('rect', { x: IN(x), y: IN(200), w: IN(w), h: IN(430), fill: { color: C.bg, transparency: 82 }, line: { color: C.accent, width: 1 } });
            s.addShape('rect', { x: IN(x), y: IN(200), w: IN(w), h: IN(4), fill: { color: C.accent } });
            add(s, c.heading, { x: IN(x + 20), y: IN(216), w: IN(w - 40), h: IN(40), fontSize: PT(25), bold: true, color: C.fg });
            bullets(s, c.items, { x: IN(x + 20), y: IN(264), w: IN(w - 40), h: IN(350), size: 21, color: C.fg });
          });
          break;
        }

        case 'image':
        case 'image-full': {
          const full = sl.layout === 'image-full';
          const list = Store.slideImages(sl).slice(0, Store.imgCount(sl));
          if (list.some(Boolean)) {
            if (full) addImageGrid(s, list, 0, 0, IN(1280), IN(720));
            else addImageGrid(s, list, IN(662), IN(64), IN(540), IN(592));
          }
          const tx = 78;
          const tw = full ? 900 : 540;
          if (sl.kicker) add(s, sl.kicker, { x: IN(tx), y: IN(full ? 380 : 110), w: IN(tw), h: IN(30), fontSize: PT(17), bold: true, color: full ? 'FFFFFF' : C.accent, charSpacing: 3 });
          add(s, sl.title, { x: IN(tx), y: IN(full ? 410 : 146), w: IN(tw), h: IN(90), fontSize: PT(42), bold: true, color: full ? 'FFFFFF' : C.fg, fontFace: serif ? FONT_ALT : FONT });
          if (!full) bullets(s, sl.bullets, { x: IN(tx), y: IN(250), w: IN(tw), h: IN(360), size: 21, color: C.fg });
          if (full && sl.subtitle) add(s, sl.subtitle, { x: IN(tx), y: IN(505), w: IN(tw), h: IN(60), fontSize: PT(24), color: 'DDDDDD' });
          break;
        }

        case 'gallery': {
          header(s, sl, C, serif);
          if (sl.subtitle) add(s, sl.subtitle, { x: IN(78), y: IN(198), w: IN(1124), h: IN(36), fontSize: PT(22), color: C.muted });
          addImageGrid(s, Store.slideImages(sl).slice(0, Store.imgCount(sl)), IN(78), IN(240), IN(1124), IN(400));
          break;
        }

        case 'stats': {
          header(s, sl, C, serif);
          if (sl.subtitle) add(s, sl.subtitle, { x: IN(78), y: IN(160), w: IN(1124), h: IN(50), fontSize: PT(24), color: C.muted });
          const items = sl.stats.slice(0, 4);
          const gap = 24, w = (1124 - gap * (items.length - 1)) / items.length;
          items.forEach((st, i) => {
            const x = 78 + i * (w + gap);
            s.addShape('roundRect', { x: IN(x), y: IN(260), w: IN(w), h: IN(300), fill: { color: C.bg, transparency: 84 }, line: { color: C.muted, width: 0.75 }, rectRadius: 0.08 });
            add(s, st.value, { x: IN(x + 12), y: IN(310), w: IN(w - 24), h: IN(90), fontSize: PT(58), bold: true, color: i % 2 ? C.accent2 : C.accent, align: 'center' });
            add(s, st.label, { x: IN(x + 16), y: IN(410), w: IN(w - 32), h: IN(120), fontSize: PT(20), color: C.muted, align: 'center' });
          });
          break;
        }

        case 'bars': {
          header(s, sl, C, serif);
          const items = sl.stats.slice(0, 5);
          const nums = items.map(x => {
            const m = /-?[\d]+(?:[.,][\d]+)?/.exec(String(x.value || '').replace(/\s/g, ''));
            let f = 0;
            if (m) {
              const n = m[0];
              f = parseFloat(n.indexOf(',') >= 0 && n.indexOf('.') < 0 ? n.replace(',', '.') : n.replace(/,/g, '')) || 0;
            }
            return f > 0 ? f : 0;
          });
          const max = Math.max.apply(null, [1].concat(nums));
          items.forEach((x, i) => {
            const y = 220 + i * 88;
            add(s, x.label, { x: IN(78), y: IN(y), w: IN(300), h: IN(60), fontSize: PT(20), color: C.fg });
            s.addShape('rect', { x: IN(400), y: IN(y + 10), w: IN(Math.max(30, 620 * nums[i] / max)), h: IN(28), fill: { color: i % 2 ? C.accent2 : C.accent } });
            add(s, x.value, { x: IN(1040), y: IN(y), w: IN(162), h: IN(60), fontSize: PT(22), bold: true, color: C.fg, align: 'right' });
          });
          break;
        }

        case 'table': {
          header(s, sl, C, serif);
          const cols = sl.tcols.slice(0, 4);
          const rows = sl.trows.slice(0, 6);
          const n = Math.max(cols.length, 1);
          const w = 1124 / n;
          cols.forEach((c, j) => {
            add(s, c, { x: IN(78 + j * w), y: IN(208), w: IN(w - 12), h: IN(40), fontSize: PT(18), bold: true, color: C.accent });
          });
          s.addShape('line', { x: IN(78), y: IN(252), w: IN(1124), h: 0, line: { color: C.accent, width: 1 } });
          rows.forEach((r, i) => {
            const y = 262 + i * 62;
            cols.forEach((_, j) => {
              add(s, (r || [])[j] || '', { x: IN(78 + j * w), y: IN(y), w: IN(w - 12), h: IN(54), fontSize: PT(20), color: C.fg });
            });
          });
          break;
        }

        case 'checklist': {
          header(s, sl, C, serif);
          const list = (sl.bullets || []).filter(Boolean);
          if (list.length) {
            const runs = list.map((t, i) => ({
              text: '✓  ' + clean(t),
              options: {
                breakLine: i < list.length - 1,
                fontSize: PT(25),
                color: C.fg,
                paraSpaceAfter: 12
              }
            }));
            s.addText(runs, { x: IN(78), y: IN(230), w: IN(1124), h: IN(420), valign: 'top', lineSpacingMultiple: 1.15 });
          }
          break;
        }

        case 'cards': {
          header(s, sl, C, serif);
          const list = sl.cards.slice(0, 4);
          const gap = 24, w = (1124 - gap * (Math.max(1, list.length) - 1)) / Math.max(1, list.length);
          list.forEach((c, i) => {
            const x = 78 + i * (w + gap);
            s.addShape('roundRect', { x: IN(x), y: IN(220), w: IN(w), h: IN(380), fill: { color: C.bg, transparency: 84 }, line: { color: i % 2 ? C.accent2 : C.accent, width: 1 }, rectRadius: 0.06 });
            add(s, c.heading, { x: IN(x + 20), y: IN(244), w: IN(w - 40), h: IN(70), fontSize: PT(24), bold: true, color: C.fg });
            add(s, c.text, { x: IN(x + 20), y: IN(320), w: IN(w - 40), h: IN(240), fontSize: PT(19), color: C.muted });
          });
          break;
        }

        case 'timeline': {
          header(s, sl, C, serif);
          const items = sl.steps.slice(0, 4);
          const gap = 20, w = (1124 - gap * (items.length - 1)) / items.length;
          s.addShape('line', { x: IN(78), y: IN(240), w: IN(1124), h: 0, line: { color: C.muted, width: 1 } });
          items.forEach((st, i) => {
            const x = 78 + i * (w + gap);
            s.addShape('ellipse', { x: IN(x), y: IN(232), w: IN(16), h: IN(16), fill: { color: C.accent } });
            add(s, st.title, { x: IN(x), y: IN(272), w: IN(w), h: IN(40), fontSize: PT(22), bold: true, color: C.fg });
            add(s, st.text, { x: IN(x), y: IN(316), w: IN(w), h: IN(220), fontSize: PT(19), color: C.muted });
          });
          break;
        }

        case 'quote': {
          add(s, '“', { x: IN(78), y: IN(150), w: IN(200), h: IN(120), fontSize: PT(120), bold: true, color: C.accent, fontFace: 'Georgia' });
          add(s, sl.quote, { x: IN(150), y: IN(260), w: IN(980), h: IN(230), fontSize: PT(44), bold: true, italic: true, color: C.fg, align: 'center', fontFace: serif ? FONT_ALT : FONT });
          if (sl.quoteAuthor) add(s, '— ' + sl.quoteAuthor, { x: IN(150), y: IN(510), w: IN(980), h: IN(40), fontSize: PT(21), color: C.muted, align: 'center' });
          break;
        }

        case 'closing': {
          if (sl.kicker) add(s, sl.kicker, { x: IN(78), y: IN(240), w: IN(1000), h: IN(30), fontSize: PT(17), bold: true, color: C.accent, charSpacing: 3, align: 'center' });
          add(s, sl.title || 'Gracias', { x: IN(78), y: IN(282), w: IN(1124), h: IN(110), fontSize: PT(64), bold: true, color: C.fg, align: 'center', fontFace: serif ? FONT_ALT : FONT });
          if (sl.subtitle) add(s, sl.subtitle, { x: IN(78), y: IN(400), w: IN(1124), h: IN(60), fontSize: PT(28), color: C.muted, align: 'center' });
          break;
        }

        default: {
          header(s, sl, C, serif);
          bullets(s, sl.bullets, { x: IN(78), y: IN(230), w: IN(1124), h: IN(420), size: 26, color: C.fg });
        }
      }

      // numeración y pie
      if (sl.layout !== 'cover') {
        add(s, deck.title, { x: IN(78), y: IN(672), w: IN(800), h: IN(24), fontSize: PT(15), color: C.muted });
        add(s, String(index + 1), { x: IN(1100), y: IN(672), w: IN(102), h: IN(24), fontSize: PT(16), color: C.muted, align: 'right' });
      }
    });

    const name = (deck.title || 'presentacion').replace(/[^\w\-\s]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    doc.writeFile({ fileName: name + '.pptx' })
      .then(() => Store.toast('PowerPoint descargado: ' + name + '.pptx', 'ok'))
      .catch(err => Store.toast('Error al crear el .pptx: ' + err.message, 'err'));
  }

  /* ---------------- piezas reutilizables ---------------- */

  function header(s, sl, C, serif) {
    if (sl.kicker) s.addText(clean(sl.kicker), { x: IN(78), y: IN(74), w: IN(1000), h: IN(26), fontSize: PT(17), bold: true, color: C.accent, charSpacing: 3, fontFace: FONT });
    s.addText(clean(sl.title), { x: IN(78), y: IN(102), w: IN(1124), h: IN(90), fontSize: PT(42), bold: true, color: C.fg, fontFace: serif ? FONT_ALT : FONT });
    s.addShape('rect', { x: IN(78), y: IN(190), w: IN(92), h: IN(4), fill: { color: C.accent } });
  }


  function bullets(s, items, { x, y, w, h, size, color }) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return;
    const runs = list.map((t, i) => ({
      text: clean(t),
      options: {
        bullet: { code: '25AA' },
        breakLine: i < list.length - 1,
        fontSize: PT(size),
        color,
        fontFace: FONT,
        paraSpaceAfter: 10
      }
    }));
    s.addText(runs, { x, y, w, h, valign: 'top', lineSpacingMultiple: 1.15 });
  }

  function addImage(s, dataUrl, x, y, w, h) {
    if (!dataUrl) return;
    const data = String(dataUrl).replace(/^data:/, '');
    try {
      s.addImage({ data, x, y, w, h });
    } catch (e) {
      /* imagen ilegible: la Saltamos */
    }
  }

  /** Reparte varias imágenes en una rejilla dentro del rectángulo indicado (en pulgadas). */
  function addImageGrid(s, imgs, x, y, w, h) {
    const list = (imgs || []).filter(Boolean).slice(0, 4);
    const n = list.length;
    if (!n) return;
    if (n === 1) { addImage(s, list[0], x, y, w, h); return; }
    const cols = n === 4 ? 2 : n;
    const rows = Math.ceil(n / cols);
    const gap = 0.12;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    list.forEach((img, i) => {
      const cx = x + (i % cols) * (cw + gap);
      const cy = y + Math.floor(i / cols) * (ch + gap);
      addImage(s, img, cx, cy, cw, ch);
    });
  }

  return { pdf, pptx };
})();
