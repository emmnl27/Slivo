/* ============================================================
   DeckAI · renderizado de diapositivas
   ============================================================ */

const Render = (() => {
  const { esc, md } = Store;

  /* ---------- helpers de edición ---------- */

  /** Reduce el cuerpo de letra cuando el texto es muy largo. */
  const longCls = (text, max) => (String(text || '').length > max ? ' long' : '');

  /**
   * Cuánto texto hay de verdad, no solo cuántos elementos: en nivel "detallado"
   * caben 25 palabras por viñeta, y el conteo de elementos no lo detecta. Aquí se
   * mira también el tamaño del texto para apretar la diapositiva cuando hace falta.
   */
  const chars = arr => (arr || []).reduce((n, x) => n + String(x || '').length, 0);

  const densityBullets = (items) => {
    const n = items.length;
    const c = chars(items);
    if (n > 7 || c > 820) return 'ultra';
    if (n > 5 || c > 520) return 'dense';
    if (n > 3 || c > 250) return 'tight';
    return '';
  };
  const densityAgenda = (items) => {
    const n = items.length;
    if (n > 8 || chars(items) > 220) return 'dense tight';
    if (n > 5 || chars(items) > 130) return 'dense';
    return '';
  };
  const densityCols = (cols) => {
    const max = Math.max(0, ...cols.map(c => (c.items || []).length));
    const largo = Math.max(0, ...cols.map(c => chars(c.items || [])));
    let cls = '';
    if (cols.length > 2) cls += ' many';
    if (max > 4 || cols.length > 2 || largo > 300) cls += ' dense';
    return cls.trim();
  };
  const densityStats = (items) => {
    const largo = chars(items.map(x => x.label));
    if (items.length > 5 || largo > 130) return 'dense';
    if (items.length > 4 || largo > 80) return 'compact';
    return '';
  };
  const densitySteps = (items) => {
    const largo = chars(items.map(x => x.text));
    if (items.length > 4 || largo > 420) return 'dense';
    return '';
  };
  const densityBars = (items) => {
    const largo = chars(items.map(x => x.label));
    if (items.length > 5 || largo > 160) return 'dense';
    if (items.length > 4 || largo > 100) return 'tight';
    return '';
  };

  /** Saca el número de un "45%", "12,5 millones" o "3 de cada 4". */
  const numDe = v => {
    const m = /-?[\d]+(?:[.,][\d]+)?/.exec(String(v || '').replace(/\s/g, ''));
    if (!m) return 0;
    let n = m[0];
    if (n.indexOf(',') >= 0 && n.indexOf('.') < 0) n = n.replace(',', '.');
    else n = n.replace(/,/g, '');
    const f = parseFloat(n);
    return (isFinite(f) && f > 0) ? f : 0;
  };

  function editable(tag, field, value, { ph = 'Escribe aquí…', cls = '', plain = false, i = null, j = null } = {}) {
    if (!App.state.ui.editing) {
      return `<${tag}${cls ? ` class="${cls}"` : ''}>${plain ? esc(value) : md(value)}</${tag}>`;
    }
    const at = (i == null ? '' : ` data-i="${i}"`) + (j == null ? '' : ` data-j="${j}"`);
    return `<${tag}${cls ? ` class="${cls}"` : ''} contenteditable="true" spellcheck="false" ` +
      `data-f="${field}"${at} data-ph="${esc(ph)}">${plain ? esc(value) : md(value)}</${tag}>`;
  }

  /* ---------- bloques de contenido ---------- */

  /** Icono inline (lo pinta Icons a partir del cuerpo SVG guardado). */
  const icoSpan = (icon, cls) =>
    (icon && icon.body) ? `<span class="${cls || 'bullet-ico'}">${Icons.svg(icon)}</span>` : '';

  function blockBullets(s, cls = '') {
    const items = (s.bullets && s.bullets.length) ? s.bullets : [''];
    const icons = Store.bulletIcons(s);
    const li = items.map((b, i) => {
      const ic = icoSpan(icons[i]);
      const inner = App.state.ui.editing
        ? `<span contenteditable="true" spellcheck="false" data-f="bullet" data-i="${i}" data-ph="Idea">${md(b)}</span>`
        : `<span>${md(b)}</span>`;
      return `<li class="${ic ? 'iconed' : ''}">${ic}${inner}</li>`;
    }).join('');
    return `<ul class="${cls}">${li}</ul>`;
  }

  function blockColumns(s) {
    const cols = (s.columns && s.columns.length) ? s.columns : [{ heading: '', items: [''] }, { heading: '', items: [''] }];
    return `<div class="cols${densityCols(cols) ? ' ' + densityCols(cols) : ''}" style="--cols:${cols.length}">` + cols.map((c, ci) => {
      const items = (c.items && c.items.length) ? c.items : [''];
      const head = editable('h3', `colHead`, c.heading, { ph: 'Subtítulo', i: ci });
      const lis = items.map((it, ii) => App.state.ui.editing
        ? `<li><span contenteditable="true" spellcheck="false" data-f="colItem" data-i="${ci}" data-j="${ii}" data-ph="Punto">${md(it)}</span></li>`
        : `<li>${md(it)}</li>`).join('');
      return `<div class="col" data-col="${ci}">${head}<ul>${lis}</ul></div>`;
    }).join('') + `</div>`;
  }

  function blockStats(s) {
    const items = (s.stats && s.stats.length) ? s.stats : [{ value: '', label: '' }];
    const cls = densityStats(items);
    return `<div class="stats${cls ? ' ' + cls : ''}">` + items.map((st, i) => {
      const v = editable('div', 'statValue', st.value, { ph: '00%', plain: true, cls: 'v', i });
      const l = editable('div', 'statLabel', st.label, { ph: 'Descripción', i });
      return `<div class="stat${i % 2 ? ' alt' : ''}" data-stat="${i}">` +
        icoSpan(st.icon, 'stat-ico') + `${v}${l}</div>`;
    }).join('') + `</div>`;
  }

  function blockSteps(s) {
    const items = (s.steps && s.steps.length) ? s.steps : [{ title: '', text: '' }];
    const cols = Math.min(items.length, 4);
    const cls = densitySteps(items);
    return `<div class="grid${cls ? ' ' + cls : ''}" style="--cols:${cols}">` + items.map((st, i) => {
      const t = editable('h3', 'stepTitle', st.title, { ph: 'Paso', i });
      const p = editable('p', 'stepText', st.text, { ph: 'Detalle', i });
      return `<div class="step${st.icon && st.icon.body ? ' iconed' : ''}" data-step="${i}">` +
        icoSpan(st.icon, 'step-ico') + `${t}${p}</div>`;
    }).join('') + `</div>`;
  }

  /** Un hueco de imagen (relleno o vacío): sirve tanto al editor como a la presentación. */
  function imgSlot(s, i, full) {
    const src = Store.slideImages(s)[i] || '';
    const hint = Store.slidePrompts(s)[i] || '';
    const editing = App.state.ui.editing;
    const cls = 'media' + (full ? ' full' : '');
    if (src) return `<div class="${cls}" data-img-slot data-slot="${i}"><img src="${esc(src)}" alt="${esc(hint || s.title || 'Imagen de la diapositiva')}"></div>`;
    return `<div class="img-slot ${cls}" data-img-slot data-slot="${i}"${editing ? ' title="Haz clic para subir una imagen"' : ''}>` +
      `<div class="ph">${esc(hint || 'Espacio para una imagen')}${editing ? '<span class="up">Subir imagen</span>' : ''}</div></div>`;
  }

  /** Uno o varios huecos de imagen en una rejilla. */
  function blockImage(s, full) {
    const n = Store.imgCount(s);
    if (n <= 1) return imgSlot(s, 0, full);
    return `<div class="img-grid n${n}${full ? ' full' : ''}" style="--n:${n}">` +
      Array.from({ length: n }, (_, i) => imgSlot(s, i, full)).join('') + `</div>`;
  }

  /* ---------- layouts ---------- */

  const LAYOUTS = {

    cover(s, d) {
      const art = Store.slideImages(s)[0] || '';
      const title = s.title || d.title;
      return `
        ${art ? `<img class="cover-img" src="${art}" alt="${esc(s.title || d.title || 'Imagen de portada')}">` : ''}
        <div class="slide-inner l-cover${art ? ' cover-art' : ''}">
          ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
          ${editable('h1', 'title', title, { ph: 'Título de la presentación', cls: 'big' + longCls(title, 44) })}
          ${editable('p', 'subtitle', s.subtitle || d.subtitle, { ph: 'Subtítulo', cls: 'lead' + longCls(s.subtitle || d.subtitle, 78) })}
          <div class="meta">
            ${editable('span', 'author', s.author || d.author, { ph: 'Tu nombre', plain: true })}
            ${editable('span', 'date', s.date || d.date, { ph: 'Fecha', plain: true })}
          </div>
        </div>`;
    },

    section(s, d, index) {
      const num = (index == null) ? '' : `<div class="sec-num" aria-hidden="true">${String(index).padStart(2, '0')}</div>`;
      return `<div class="slide-inner l-section">
        ${num}
        <div class="sec-body">
          ${editable('div', 'kicker', s.kicker, { ph: 'BLOQUE 1', cls: 'kicker' })}
          ${editable('h1', 'title', s.title, { ph: 'Título de sección', cls: 'big' + longCls(s.title, 40) })}
          ${editable('p', 'subtitle', s.subtitle, { ph: 'Una frase' })}
        </div>
      </div>`;
    },

    agenda(s) {
      const cls = densityAgenda(s.bullets);
      return `<div class="slide-inner l-agenda">
        ${editable('div', 'kicker', s.kicker, { ph: 'Índice', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Índice', cls: longCls(s.title, 40) })}
        <div class="grid${cls ? ' ' + cls : ''}">${(s.bullets.length ? s.bullets : ['', '', '', '']).map((b, i) => {
          const ic = Store.agendaIcons(s)[i];
          const marca = (ic && ic.body)
            ? `<span class="item-ico">${Icons.svg(ic)}</span>`
            : `<span class="n">${String(i + 1).padStart(2, '0')}</span>`;
          return `
          <div class="item${(ic && ic.body) ? ' iconed' : ''}" data-ag="${i}">
            ${marca}
            ${editable('span', 'agenda', b, { ph: 'Bloque', cls: 't' + longCls(b, 42), i })}
          </div>`;
        }).join('')}</div>
      </div>`;
    },

    bullets(s) {
      return `<div class="slide-inner l-bullets">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        <div class="rule"></div>
        ${blockBullets(s, densityBullets(s.bullets))}
      </div>`;
    },

    'two-col'(s) {
      return `<div class="slide-inner l-two-col">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        ${blockColumns(s)}
      </div>`;
    },

    image(s) {
      return `<div class="slide-inner l-image">
        <div class="grid">
          <div class="text">
            ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
            ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 34) })}
            ${blockBullets(s, densityBullets(s.bullets) || 'tight')}
          </div>
          ${blockImage(s, false)}
        </div>
      </div>`;
    },

    'image-full'(s) {
      const noImg = !Store.slideImages(s)[0];
      return `<div class="slide-inner l-image full${noImg ? ' no-img' : ''}">
        <div class="grid">
          ${blockImage(s, true)}
          <div class="text">
            ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
            ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 58) })}
            ${editable('p', 'subtitle', s.subtitle, { ph: 'Una frase' })}
          </div>
        </div>
      </div>`;
    },

    gallery(s) {
      return `<div class="slide-inner l-gallery">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        ${editable('p', 'subtitle', s.subtitle, { ph: 'Una frase' })}
        <div class="gallery-body">${blockImage(s, false)}</div>
      </div>`;
    },

    stats(s) {
      return `<div class="slide-inner l-stats">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        ${editable('p', 'subtitle', s.subtitle, { ph: 'Frase de apoyo' })}
        ${blockStats(s)}
      </div>`;
    },

    timeline(s) {
      return `<div class="slide-inner l-timeline">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Cómo funciona', cls: longCls(s.title, 50) })}
        ${blockSteps(s)}
      </div>`;
    },

    bars(s) {
      const items = (s.stats && s.stats.length) ? s.stats : [{ value: '', label: '' }, { value: '', label: '' }, { value: '', label: '' }];
      const nums = items.map(x => numDe(x.value));
      const max = Math.max(1, ...nums);
      return `<div class="slide-inner l-bars">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        ${editable('p', 'subtitle', s.subtitle, { ph: 'Frase de apoyo' })}
        <div class="bars${densityBars(items) ? ' ' + densityBars(items) : ''}">${items.map((x, i) => `
          <div class="bar-row">
            <span class="bar-label">${icoSpan(x.icon, 'bar-ico')}${editable('span', 'statLabel', x.label, { ph: 'Indicador', i })}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round(nums[i] / max * 100)}%"></span></span>
            ${editable('span', 'statValue', x.value, { ph: '00', plain: true, cls: 'bar-value', i })}
          </div>`).join('')}</div>
      </div>`;
    },

    table(s) {
      const cols = (s.tcols && s.tcols.length) ? s.tcols : ['', '', ''];
      const rows = (s.trows && s.trows.length) ? s.trows : [['', '', ''], ['', '', ''], ['', '', '']];
      const n = cols.length;
      const cls = (rows.length > 5 || n > 3) ? 'dense' : '';
      return `<div class="slide-inner l-table">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        <table class="tbl${cls ? ' ' + cls : ''}">
          <thead><tr>${cols.map((c, j) => `<th>${editable('span', 'thead', c, { ph: 'Columna', j })}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r, i) => `<tr>${cols.map((_, j) => `<td>${editable('span', 'tcell', (r || [])[j] || '', { ph: 'Dato', i, j })}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;
    },

    checklist(s) {
      return `<div class="slide-inner l-checklist">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        <div class="rule"></div>
        ${blockBullets(s, ('checklist ' + densityBullets(s.bullets)).trim())}
      </div>`;
    },

    cards(s) {
      const list = (s.cards && s.cards.length) ? s.cards : [{ heading: '', text: '' }, { heading: '', text: '' }];
      const cls = list.length > 4 ? 'many' : '';
      return `<div class="slide-inner l-cards">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        <div class="cards${cls ? ' ' + cls : ''}">${list.map((c, i) => `
          <div class="card">
            ${icoSpan(c.icon, 'card-ico')}
            ${editable('h3', 'cardHead', c.heading, { ph: 'Ventaja', i })}
            ${editable('p', 'cardText', c.text, { ph: 'Por qué importa' })}
          </div>`).join('')}</div>
      </div>`;
    },

    quote(s) {
      return `<div class="slide-inner l-quote">
        <div class="mark">&ldquo;</div>
        ${editable('blockquote', 'quote', s.quote, { ph: 'Cita memorable', plain: true, cls: longCls(s.quote, 120) })}
        ${editable('div', 'quoteAuthor', s.quoteAuthor, { ph: 'Autor', cls: 'by' })}
      </div>`;
    },

    closing(s, d) {
      return `<div class="slide-inner l-closing">
        ${editable('div', 'kicker', s.kicker, { ph: 'Gracias', cls: 'kicker' })}
        ${editable('h1', 'title', s.title || 'Gracias', { ph: '¡Gracias!', cls: 'big' + longCls(s.title, 34) })}
        ${editable('p', 'subtitle', s.subtitle, { ph: '¿Preguntas?' })}
        <div class="cta">${esc(s.kicker || 'Q&A')}</div>
      </div>`;
    }
  };

  /* ---------- API pública ---------- */

  function slide(s, d, index, opts = {}) {
    const t = Store.themeById(d.theme || 'aurora');
    const themeCls = t.custom ? ' theme-custom' : ' theme-' + t.id;
    const themeStyle = t.custom ? ` style="${esc(Store.cssText(t.css))}"` : '';
    const layout = LAYOUTS[s.layout] ? s.layout : 'bullets';
    const selected = opts.selected ? ' selected' : '';
    const num = (index == null || layout === 'cover') ? '' : `<div class="num">${index + 1}</div>`;
    const foot = (index == null || layout === 'cover') ? '' :
      `<div class="foot">${esc(d.title)}</div>`;

    const tituloLector = s.title || d.title || '';
    const etiqueta = index == null ? '' :
      ` aria-label="Diapositiva ${index + 1}${tituloLector ? ': ' + esc(tituloLector) : ''}"`;
    return `<section class="slide${themeCls} l-${layout}${selected}" data-index="${index}" role="group" aria-roledescription="diapositiva"${etiqueta}${themeStyle}>
      <div class="deco" aria-hidden="true"><span></span><span></span><span></span></div>
      ${LAYOUTS[layout](s, d, index)}
      ${foot}${num}
    </section>`;
  }

  /** Sustituye el contenido de un contenedor con todas las diapositivas. */
  function deck(container, d, { selected = -1 } = {}) {
    container.className = 'deck' + (App.state.ui.editing ? ' editing' : '');
    container.innerHTML = d.slides.map((s, i) =>
      slide(s, d, i, { selected: i === selected })
    ).join('');
  }

  function one(container, d, index) {
    container.className = 'deck';
    container.innerHTML = slide(d.slides[index], d, index);
  }

  return { slide, deck, one, LAYOUTS };
})();
