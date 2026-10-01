/* ============================================================
   DeckAI · renderizado de diapositivas
   ============================================================ */

const Render = (() => {
  const { esc, md } = Store;

  /* ---------- helpers de edición ---------- */

  /** Reduce el cuerpo de letra cuando el texto es muy largo. */
  const longCls = (text, max) => (String(text || '').length > max ? ' long' : '');

  const densityBullets = n => (n > 7 ? 'ultra' : n > 5 ? 'dense' : n > 3 ? 'tight' : '');
  const densityAgenda = n => (n > 8 ? 'dense tight' : n > 5 ? 'dense' : '');
  const densityCols = (cols) => {
    const max = Math.max(0, ...cols.map(c => (c.items || []).length));
    let cls = '';
    if (cols.length > 2) cls += ' many';
    if (max > 4 || cols.length > 2) cls += ' dense';
    return cls.trim();
  };
  const densityStats = n => (n > 5 ? 'dense' : n > 4 ? 'compact' : '');
  const densitySteps = n => (n > 4 ? 'dense' : '');

  function editable(tag, field, value, { ph = 'Escribe aquí…', cls = '', plain = false, i = null } = {}) {
    if (!App.state.ui.editing) {
      return `<${tag}${cls ? ` class="${cls}"` : ''}>${plain ? esc(value) : md(value)}</${tag}>`;
    }
    const at = i == null ? '' : ` data-i="${i}"`;
    return `<${tag}${cls ? ` class="${cls}"` : ''} contenteditable="true" spellcheck="false" ` +
      `data-f="${field}"${at} data-ph="${esc(ph)}">${plain ? esc(value) : md(value)}</${tag}>`;
  }

  /* ---------- bloques de contenido ---------- */

  function blockBullets(s, cls = '') {
    const items = (s.bullets && s.bullets.length) ? s.bullets : [''];
    const li = items.map((b, i) => {
      const inner = App.state.ui.editing
        ? `<li><span contenteditable="true" spellcheck="false" data-f="bullet" data-i="${i}" data-ph="Idea">${md(b)}</span></li>`
        : `<li>${md(b)}</li>`;
      return inner;
    }).join('');
    return `<ul class="${cls}">${li}</ul>`;
  }

  function blockColumns(s) {
    const cols = (s.columns && s.columns.length) ? s.columns : [{ heading: '', items: [''] }, { heading: '', items: [''] }];
    return `<div class="cols${densityCols(cols) ? ' ' + densityCols(cols) : ''}">` + cols.map((c, ci) => {
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
    const cls = densityStats(items.length);
    return `<div class="stats${cls ? ' ' + cls : ''}">` + items.map((st, i) => {
      const v = editable('div', 'statValue', st.value, { ph: '00%', plain: true, cls: 'v', i });
      const l = editable('div', 'statLabel', st.label, { ph: 'Descripción', i });
      return `<div class="stat${i % 2 ? ' alt' : ''}" data-stat="${i}">${v}${l}</div>`;
    }).join('') + `</div>`;
  }

  function blockSteps(s) {
    const items = (s.steps && s.steps.length) ? s.steps : [{ title: '', text: '' }];
    const cols = Math.min(items.length, 4);
    const cls = densitySteps(items.length);
    return `<div class="grid${cls ? ' ' + cls : ''}" style="--cols:${cols}">` + items.map((st, i) => {
      const t = editable('h3', 'stepTitle', st.title, { ph: 'Paso', i });
      const p = editable('p', 'stepText', st.text, { ph: 'Detalle', i });
      return `<div class="step" data-step="${i}">${t}${p}</div>`;
    }).join('') + `</div>`;
  }

  function blockImage(s, full) {
    if (s.image) {
      return `<div class="media${full ? ' full' : ''}"><img src="${s.image}" alt=""></div>`;
    }
    const hint = s.imagePrompt || 'Espacio para una imagen';
    const editable = App.state.ui.editing;
    return `<div class="img-slot media${full ? ' full' : ''}"${editable ? ' data-img-slot="1" title="Haz clic para subir una imagen"' : ''}>` +
      `<div class="ph">${esc(hint)}${editable ? '<span class="up">Subir imagen</span>' : ''}</div></div>`;
  }

  /* ---------- layouts ---------- */

  const LAYOUTS = {

    cover(s, d) {
      const art = s.image || '';
      const title = s.title || d.title;
      return `
        ${art ? `<img class="cover-img" src="${art}" alt="">` : ''}
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

    section(s) {
      return `<div class="slide-inner l-section">
        ${editable('div', 'kicker', s.kicker, { ph: 'BLOQUE 1', cls: 'kicker' })}
        ${editable('h1', 'title', s.title, { ph: 'Título de sección', cls: 'big' + longCls(s.title, 40) })}
        ${editable('p', 'subtitle', s.subtitle, { ph: 'Una frase' })}
      </div>`;
    },

    agenda(s) {
      const cls = densityAgenda(s.bullets.length);
      return `<div class="slide-inner l-agenda">
        ${editable('div', 'kicker', s.kicker, { ph: 'Índice', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Índice', cls: longCls(s.title, 40) })}
        <div class="grid${cls ? ' ' + cls : ''}">${(s.bullets.length ? s.bullets : ['', '', '', '']).map((b, i) => `
          <div class="item" data-ag="${i}">
            <span class="n">${String(i + 1).padStart(2, '0')}</span>
            ${editable('span', 'agenda', b, { ph: 'Bloque', cls: 't' + longCls(b, 42), i })}
          </div>`).join('')}</div>
      </div>`;
    },

    bullets(s) {
      return `<div class="slide-inner l-bullets">
        ${editable('div', 'kicker', s.kicker, { ph: 'Etiqueta', cls: 'kicker' })}
        ${editable('h2', 'title', s.title, { ph: 'Título', cls: longCls(s.title, 50) })}
        <div class="rule"></div>
        ${blockBullets(s, densityBullets(s.bullets.length))}
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
            ${blockBullets(s, densityBullets(s.bullets.length) || 'tight')}
          </div>
          ${blockImage(s, false)}
        </div>
      </div>`;
    },

    'image-full'(s) {
      const noImg = !s.image;
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
    const theme = 'theme-' + (d.theme || 'aurora');
    const layout = LAYOUTS[s.layout] ? s.layout : 'bullets';
    const selected = opts.selected ? ' selected' : '';
    const num = (index == null || layout === 'cover') ? '' : `<div class="num">${index + 1}</div>`;
    const foot = (index == null || layout === 'cover') ? '' :
      `<div class="foot">${esc(d.title)}</div>`;

    return `<section class="slide ${theme} l-${layout}${selected}" data-index="${index}">
      ${LAYOUTS[layout](s, d)}
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
