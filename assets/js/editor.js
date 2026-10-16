/* ============================================================
   DeckAI · edición en el lienzo, miniaturas e inspector
   ============================================================ */

const Editor = (() => {
  const { esc, md } = Store;
  const $ = id => document.getElementById(id);

  let dragFrom = -1;

  /* ---------- historial (deshacer cambios manuales) ---------- */
  const MAX_HISTORIAL = 30;
  let historial = [];

  /** Foto del estado antes de un cambio estructural, para poder deshacerlo. */
  function snapshot() {
    historial.push({ deck: JSON.parse(JSON.stringify(App.deck())), selected: App.state.ui.selected });
    while (historial.length > MAX_HISTORIAL) historial.shift();
  }

  /** Deshace el último cambio manual (no los del asistente, que tienen el suyo). */
  function undoEdit() {
    const h = historial.pop();
    if (!h) { Store.toast('No hay cambios manuales que deshacer.', 'err'); return; }
    Store.state.deck = h.deck;
    App.state.ui.selected = Math.max(0, Math.min(h.selected, h.deck.slides.length - 1));
    Store.save();
    refresh();
    Store.toast('Cambio deshecho.', 'ok');
  }

  /* ---------- lectura de los campos editables ---------- */

  function current() { return App.deck().slides[App.state.ui.selected] || null; }

  function writeField(el) {
    const s = current();
    if (!s) return;
    const f = el.dataset.f;
    const val = el.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '').trim();

    const idx = n => (n == null ? -1 : parseInt(n, 10));
    // agenda / stats / steps guardan el índice en el elemento padre
    let col = idx(el.dataset.i);
    if (col < 0) {
      const host = el.closest('[data-ag],[data-stat],[data-step]');
      if (host) col = idx(host.dataset.ag != null ? host.dataset.ag : host.dataset.stat != null ? host.dataset.stat : host.dataset.step);
    }
    const item = idx(el.dataset.j);

    switch (f) {
      case 'title': s.title = val; break;
      case 'subtitle': s.subtitle = val; break;
      case 'kicker': s.kicker = val; break;
      case 'quote': s.quote = val; break;
      case 'quoteAuthor': s.quoteAuthor = val; break;
      case 'imgPrompt': {
        const j = idx(el.dataset.i);
        const arr = Store.slidePrompts(s);
        if (j >= 0) { arr[j] = val; s.imagePrompts = arr; }
        break;
      }
      case 'notes': s.notes = val; break;
      case 'author': App.deck().author = val; break;
      case 'date': App.deck().date = val; break;
      case 'bullet': if (s.bullets[col] != null) s.bullets[col] = val; break;
      case 'agenda': if (s.bullets[col] != null) s.bullets[col] = val; break;
      case 'colHead': if (s.columns[col]) s.columns[col].heading = val; break;
      case 'colItem': if (s.columns[col] && s.columns[col].items[item] != null) s.columns[col].items[item] = val; break;
      case 'statValue': if (s.stats[col]) s.stats[col].value = val; break;
      case 'statLabel': if (s.stats[col]) s.stats[col].label = val; break;
      case 'stepTitle': if (s.steps[col]) s.steps[col].title = val; break;
      case 'stepText': if (s.steps[col]) s.steps[col].text = val; break;
      case 'thead': { const jj = idx(el.dataset.j); if (s.tcols[jj] != null) s.tcols[jj] = val; break; }
      case 'tcell': if (s.trows[col] && s.trows[col][item] != null) s.trows[col][item] = val; break;
      case 'cardHead': if (s.cards[col]) s.cards[col].heading = val; break;
      case 'cardText': if (s.cards[col]) s.cards[col].text = val; break;
    }
    App.state.ui.dirty = true;
    Store.paintSaveState('pendiente');
    Store.saveSoon();
    refreshThumbsSoon();
  }

  // Al teclear solo cambia la diapositiva seleccionada: refrescamos su miniatura,
  // no las demás (en presentaciones largas, rehacerlas todas se notaba).
  const refreshThumbsSoon = Store.debounce(() => updateThumb(App.state.ui.selected), 600);

  /* ---------- render principal ---------- */

  /** ¿La presentación está realmente vacía (ni una diapositiva con contenido)? */
  function estaVacia() {
    const s = App.deck().slides;
    if (!s.length) return true;
    if (s.length > 1) return false;
    const u = s[0];
    return !String(u.title || '').trim() && !String(u.subtitle || '').trim() && !u.bullets.length;
  }

  function refresh({ thumbs = true, inspector = true } = {}) {
    const deck = App.deck();
    const vacia = estaVacia() && App.state.ui.guia !== false;
    $('emptyState').hidden = !vacia;
    $('deckWrap').hidden = vacia;
    $('counter').textContent = deck.slides.length + (deck.slides.length === 1 ? ' diapositiva' : ' diapositivas');
    $('thumbCount').textContent = deck.slides.length;

    Render.deck($('deck'), deck, { selected: App.state.ui.selected });

    if (thumbs) buildThumbs();
    if (inspector) buildInspector();
    App.fit();
  }

  /** Cierra la guía de inicio y se centra en escribir la primera diapositiva. */
  function escribir() {
    App.state.ui.guia = false;
    refresh();
    setTimeout(() => focusText(App.state.ui.selected), 40);
  }

  /** Pone el cursor en el texto editable de una diapositiva. */
  function focusText(i) {
    const el = document.querySelector(`#deck .slide[data-index="${i}"] [data-f="title"]`);
    if (!el) return;
    el.focus();
    const r = document.createRange();
    r.selectNodeContents(el);
    const sl = getSelection();
    sl.removeAllRanges();
    sl.addRange(r);
  }

  /* ---------- miniaturas ---------- */

  function buildThumbs() {
    const deck = App.deck();
    const box = $('thumbs');
    const scroll = box.scrollTop;

    box.innerHTML = deck.slides.map((s, i) => `
      <div class="thumb${i === App.state.ui.selected ? ' on' : ''}" data-i="${i}" draggable="true" role="button" tabindex="0" aria-label="Diapositiva ${i + 1}: ${esc(s.title || (LAYOUTS.find(l => l.id === s.layout) || {}).name || '')}" title="Diapositiva ${i + 1}: ${esc(s.title || (LAYOUTS.find(l => l.id === s.layout) || {}).name || '')}">
        <div class="thumb-num" aria-hidden="true">${i + 1}</div>
        <div class="thumb-frame"><div class="deck">${Render.slide(s, deck, i)}</div></div>
        <div class="thumb-tools">
          <button data-act="up" title="Subir" aria-label="Subir diapositiva"><svg class="ic" aria-hidden="true"><use href="#i-up"></use></svg></button>
          <button data-act="down" title="Bajar" aria-label="Bajar diapositiva"><svg class="ic" aria-hidden="true"><use href="#i-down"></use></svg></button>
          <button data-act="dup" title="Duplicar" aria-label="Duplicar diapositiva"><svg class="ic" aria-hidden="true"><use href="#i-copy"></use></svg></button>
          <button data-act="del" title="Eliminar" aria-label="Eliminar diapositiva"><svg class="ic" aria-hidden="true"><use href="#i-trash"></use></svg></button>
        </div>
      </div>`).join('');

    box.scrollTop = scroll;
    scaleThumbs();
  }

  function scaleThumbs() {
    const box = $('thumbs');
    const w = box.clientWidth;
    if (!w) return;
    const k = w / CONFIG.slideW;
    box.querySelectorAll('.thumb .deck').forEach(d => {
      d.style.transform = `scale(${k})`;
    });
  }

  /** Rehace solo la miniatura de una diapositiva (no toda la lista). */
  function updateThumb(i) {
    const t = $('thumbs').querySelector(`.thumb[data-i="${i}"]`);
    if (!t) { buildThumbs(); return; }
    const s = App.deck().slides[i];
    if (!s) { buildThumbs(); return; }
    const frame = t.querySelector('.thumb-frame');
    if (frame) frame.innerHTML = `<div class="deck">${Render.slide(s, App.deck(), i)}</div>`;
    t.title = `Diapositiva ${i + 1}: ${esc(s.title || (LAYOUTS.find(l => l.id === s.layout) || {}).name || '')}`;
    scaleThumbs();
  }

  /** Repinta una sola diapositiva del lienzo (y su miniatura) sin tocar el resto. */
  function refreshSlide(i) {
    const deck = App.deck();
    const s = deck.slides[i];
    if (!s) { refresh(); return; }
    const sec = $('deck').querySelector(`.slide[data-index="${i}"]`);
    if (sec) {
      const tmp = document.createElement('div');
      tmp.innerHTML = Render.slide(s, deck, i, { selected: i === App.state.ui.selected });
      sec.replaceWith(tmp.firstElementChild);
    }
    updateThumb(i);
    if (i === App.state.ui.selected) buildInspector();
    App.fit();
  }

  /** Como refreshSlide, pero buscando el índice a partir del objeto diapositiva. */
  function refreshOf(slide) {
    const i = App.deck().slides.indexOf(slide);
    if (i >= 0) refreshSlide(i); else refresh();
  }

  /* ---------- inspector ---------- */

  function buildInspector() {
    Chat.refreshHint();                 // el asistente va viendo la selección
    const s = current();
    const deck = App.deck();
    const box = $('inspectorBody');

    // la cabecera dice siempre sobre qué diapositiva se está trabajando
    if (!s) {
      $('inspTitle').textContent = 'Inspector';
      box.innerHTML = '<p class="hint">Selecciona una diapositiva de la lista para editarla.</p>';
      return;
    }
    const lay = LAYOUTS.find(l => l.id === s.layout) || { name: 'Diseño' };
    const n = App.state.ui.selected + 1;
    $('inspTitle').textContent = `Diapositiva ${n} · ${lay.name}`;

    const layoutBtns = LAYOUTS.map(l =>
      `<button data-layout="${l.id}" class="${s.layout === l.id ? 'on' : ''}" title="${esc(l.name)}">${l.name}</button>`).join('');

    const isText = ['bullets', 'image', 'agenda', 'checklist'].includes(s.layout);
    const isCols = s.layout === 'two-col';
    const isStats = ['stats', 'bars'].includes(s.layout);
    const isSteps = s.layout === 'timeline';
    const isTable = s.layout === 'table';
    const isCards = s.layout === 'cards';
    const nImg = s.layout === 'cover' ? 1 : Store.imgCount(s);
    const gridLay = ['image', 'image-full', 'gallery'].includes(s.layout);
    const imgs = Store.slideImages(s);
    const proms = Store.slidePrompts(s);
    const canImg = Images.CON_IMAGEN.includes(s.layout);
    const bIcons = Store.bulletIcons(s);
    const aIcons = Store.agendaIcons(s);
    const iconKind = s.layout === 'agenda' ? 'agenda' : 'bullet';

    /** Fila por elemento con su icono actual y botones para poner/quitar. */
    const iconRows = (kind, items, icons, vacio) => {
      if (!items.length) return '';
      return `<div class="icon-rows">` + items.map((it, i) => {
        const has = icons[i] && icons[i].body;
        const label = String(it || '').trim() || (vacio + ' ' + (i + 1));
        return `<div class="icon-row">
          <span class="icon-prev">${has ? Icons.svg(icons[i]) : '<em>—</em>'}</span>
          <span class="icon-name">${esc(label.slice(0, 34))}</span>
          <button class="btn btn-sm" data-act="icon" data-ikind="${kind}" data-iindex="${i}">${has ? 'Cambiar' : 'Icono'}</button>
          ${has ? `<button class="btn btn-sm btn-danger" data-act="icon-del" data-ikind="${kind}" data-iindex="${i}" title="Quitar icono">×</button>` : ''}
        </div>`;
      }).join('') + `</div>`;
    };

    box.innerHTML = `
      <div class="insp-head-note">
        <svg class="ic"><use href="#i-slides"></use></svg>
        <span>Estás editando la <b>diapositiva ${n} de ${deck.slides.length}</b></span>
      </div>

      <div class="insp-row">
        <button class="btn btn-sm" data-act="up" title="Mover esta diapositiva arriba"${n === 1 ? ' disabled' : ''}>
          <svg class="ic"><use href="#i-up"></use></svg><span>Subir</span></button>
        <button class="btn btn-sm" data-act="down" title="Mover esta diapositiva abajo"${n === deck.slides.length ? ' disabled' : ''}>
          <svg class="ic"><use href="#i-down"></use></svg><span>Bajar</span></button>
        <button class="btn btn-sm" data-act="dup"><svg class="ic"><use href="#i-copy"></use></svg><span>Duplicar</span></button>
        <button class="btn btn-sm btn-danger" data-act="del"><svg class="ic"><use href="#i-trash"></use></svg><span>Eliminar</span></button>
      </div>
      <div class="insp-row">
        <button class="btn btn-sm btn-primary insp-grow" data-act="redo" title="Pedir a la IA otra versión de esta diapositiva">
          <svg class="ic"><use href="#i-magic"></use></svg><span>Rehacer con IA</span></button>
      </div>

      <div class="insp-label">Diseño de la diapositiva</div>
      <div class="seg" data-group="layout">${layoutBtns}</div>

      ${isText ? `<div class="insp-label">Puntos</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="add-bullet">+ Punto</button>
          <button class="btn btn-sm" data-act="del-item">− Último</button>
        </div>
        <div class="insp-label">Icono de cada punto <span class="muted">Iconify</span></div>
        ${iconRows(iconKind, s.bullets, iconKind === 'agenda' ? aIcons : bIcons, 'Punto')}` : ''}

      ${isCols ? `<div class="insp-label">Columnas</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="col-3">3 columnas</button>
          <button class="btn btn-sm" data-act="col-2">2 columnas</button>
          <button class="btn btn-sm" data-act="col-item+">+ Punto en col. 1</button>
        </div>` : ''}

      ${isStats ? `<div class="insp-label">Datos</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="stat+">+ Dato</button>
          <button class="btn btn-sm" data-act="stat-">− Último</button>
        </div>
        <div class="insp-label">Icono de cada dato <span class="muted">Iconify</span></div>
        ${iconRows('stat', s.stats, s.stats.map(x => x.icon), 'Dato')}` : ''}

      ${isSteps ? `<div class="insp-label">Pasos</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="step+">+ Paso</button>
          <button class="btn btn-sm" data-act="step-">− Último</button>
        </div>
        <div class="insp-label">Icono de cada paso <span class="muted">Iconify</span></div>
        ${iconRows('step', s.steps, s.steps.map(x => x.icon), 'Paso')}` : ''}

      ${isTable ? `<div class="insp-label">Tabla</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="trow+">+ Fila</button>
          <button class="btn btn-sm" data-act="trow-">− Fila</button>
          <button class="btn btn-sm" data-act="tcol+">+ Columna</button>
          <button class="btn btn-sm" data-act="tcol-">− Columna</button>
        </div>
        <p class="hint">Las celdas se editan directamente sobre la diapositiva.</p>` : ''}

      ${isCards ? `<div class="insp-label">Tarjetas</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="card+">+ Tarjeta</button>
          <button class="btn btn-sm" data-act="card-">− Última</button>
        </div>
        <div class="insp-label">Icono de cada tarjeta <span class="muted">Iconify</span></div>
        ${iconRows('card', s.cards.map(c => c.heading), s.cards.map(c => c.icon), 'Tarjeta')}` : ''}

      <div class="insp-label">Imágenes <span class="muted">${nImg} hueco${nImg > 1 ? 's' : ''}</span></div>
      ${s.layout === 'cover' ? '' : `<div class="seg" data-group="imgcount">
        ${[1, 2, 3, 4].map(k => `<button data-act="img-count" data-n="${k}" class="${nImg === k ? 'on' : ''}" title="${k} hueco${k > 1 ? 's' : ''}">${k}</button>`).join('')}
      </div>`}
      ${Array.from({ length: nImg }, (_, i) => `
        <div class="img-slot-field" data-slot="${i}">
          <label class="field"><span>Hueco ${i + 1}${imgs[i] ? ' · con imagen' : ''}</span>
            <textarea data-imgprompt="${i}" rows="2" placeholder="Ej. escritorio con un cuaderno y una taza de café, luz natural">${esc(proms[i] || '')}</textarea>
          </label>
          <div class="insp-row">
            <button class="btn btn-sm" data-act="img-web" data-slot="${i}" title="Buscar una foto real en internet"><svg class="ic"><use href="#i-search"></use></svg><span>Buscar</span></button>
            <button class="btn btn-sm" data-act="img-upload" data-slot="${i}"><svg class="ic"><use href="#i-image"></use></svg><span>Subir</span></button>
            <button class="btn btn-sm btn-primary" data-act="img-gen" data-slot="${i}"><svg class="ic"><use href="#i-magic"></use></svg><span>Generar</span></button>
            ${imgs[i] ? `<button class="btn btn-sm" data-act="img-del" data-slot="${i}">Quitar</button>` : ''}
          </div>
        </div>`).join('')}
      <p class="hint"${canImg ? '' : ' style="color:#f0b866"'}>
        ${!gridLay && canImg ? 'La portada usa la imagen como fondo.'
          : gridLay ? 'Arrastra imágenes desde tu escritorio hasta el hueco que quieras.'
          : 'Este diseño no tiene huecos: al subir una imagen, pasa a «Galería».'}
      </p>
      <input type="file" id="inspFile" accept="image/*" hidden>

      <div class="insp-label">Notas del orador</div>
      <label class="field">
        <textarea id="inspNotes" rows="4" placeholder="Guion para esta diapositiva…">${esc(s.notes)}</textarea>
      </label>

      ${s.layout === 'cover' ? `
        <div class="insp-label">Datos de la portada</div>
        <label class="field"><span>Autor</span><input type="text" id="inspAuthor" value="${esc(deck.author)}"></label>
        <label class="field"><span>Fecha</span><input type="text" id="inspDate" value="${esc(deck.date)}"></label>` : ''}
    `;
  }

  /* ---------- acciones ---------- */

  /** Abre el explorador de archivos para el hueco indicado de la diapositiva. */
  function elegirImagen(sec, slot) {
    const i = parseInt(sec.dataset.index, 10);
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (f) Images.useFile(f, App.deck().slides[i], slot || 0);
    };
    inp.click();
  }

  /* ---------- buscador de fotos e iconos ---------- */

  let webResults = [];
  let iconResults = [];
  let iconTarget = null;

  function abrirWebImg(slot) {
    const s = current();
    if (!s) return;
    App.state.ui.webSlot = parseInt(slot, 10) || 0;
    $('webImgQuery').value = Images.query(s, App.state.ui.webSlot);
    $('webImgResults').innerHTML = '<div class="pick-empty">Escribe y pulsa Buscar.</div>';
    $('dlgWebImg').showModal();
    buscarWebImg();
  }

  async function buscarWebImg() {
    const s = current();
    if (!s) return;
    const q = $('webImgQuery').value.trim();
    const box = $('webImgResults');
    if (!q) { box.innerHTML = '<div class="pick-empty">Escribe qué foto buscas.</div>'; return; }
    box.innerHTML = '<div class="pick-empty">Buscando fotos…</div>';
    try {
      webResults = await Web.buscar(q, { n: 24 });
      if (!webResults.length) { box.innerHTML = '<div class="pick-empty">Sin resultados. Prueba otras palabras.</div>'; return; }
      box.innerHTML = webResults.map((x, i) =>
        `<button type="button" class="pick" data-web="${i}" title="${esc(x.title || '')}">
          <img src="${esc(x.thumb)}" alt="${esc(x.title || 'Foto')}" loading="lazy" referrerpolicy="no-referrer">
          <span class="cred">${esc(x.source)}${x.author ? ' · ' + esc(x.author) : ''}${x.license ? ' · ' + esc(x.license) : ''}</span>
        </button>`).join('');
    } catch (e) {
      box.innerHTML = '<div class="pick-empty">No se pudo buscar: ' + esc(e.message) + '</div>';
    }
  }

  async function usarWeb(i) {
    const s = current();
    const res = webResults[i];
    if (!s || !res) return;
    const slot = App.state.ui.webSlot || 0;
    $('dlgWebImg').close();
    Store.toast('Descargando la foto…');
    try {
      const cambiado = await Web.usar(s, slot, res);
      Store.toast('Foto añadida · ' + res.source + (cambiado ? ' · pasé a «Galería»' : ''), 'ok');
    } catch (e) {
      Store.toast('No se pudo añadir la foto: ' + e.message, 'err');
    }
  }

  function tieneIcono(kind, index) {
    const s = current();
    if (!s) return false;
    if (kind === 'stat') return !!(s.stats[index] && s.stats[index].icon);
    if (kind === 'step') return !!(s.steps[index] && s.steps[index].icon);
    const list = kind === 'agenda' ? Store.agendaIcons(s) : Store.bulletIcons(s);
    return !!(list[index] && list[index].body);
  }

  function abrirIconos(kind, index) {
    const s = current();
    if (!s || !kind) return;
    iconTarget = { kind, index };
    const def = kind === 'stat' ? (s.stats[index] || {}).label
      : kind === 'step' ? (s.steps[index] || {}).title
        : (s.bullets[index] || '');
    $('iconQuery').value = String(def || '').slice(0, 40);
    $('btnIconClear').style.display = tieneIcono(kind, index) ? '' : 'none';
    $('iconResults').innerHTML = '<div class="pick-empty">Cargando iconos…</div>';
    $('dlgIcon').showModal();
    buscarIconosDlg();
  }

  async function buscarIconosDlg() {
    const box = $('iconResults');
    const q = $('iconQuery').value.trim();
    box.innerHTML = '<div class="pick-empty">Cargando iconos…</div>';
    try {
      iconResults = q ? await Icons.buscarIconos(q, 60) : await Icons.comunes();
      if (!iconResults.length) { box.innerHTML = '<div class="pick-empty">Sin iconos. Prueba en inglés (rocket, users…).</div>'; return; }
      box.innerHTML = iconResults.map((x, i) =>
        `<button type="button" class="pick" data-icon="${i}" title="${esc(x.name)}">${Icons.svg(x)}</button>`).join('');
    } catch (e) {
      box.innerHTML = '<div class="pick-empty">No se pudo cargar: ' + esc(e.message) + '</div>';
    }
  }

  /** Pone (o quita, con icon === null) el icono de un elemento. */
  function aplicarIcono(kind, index, icon) {
    const s = current();
    if (!s || !kind) return;
    snapshot();
    if (kind === 'stat') { if (s.stats[index]) s.stats[index].icon = icon; }
    else if (kind === 'step') { if (s.steps[index]) s.steps[index].icon = icon; }
    else if (kind === 'card') { if (s.cards[index]) s.cards[index].icon = icon; }
    else if (kind === 'agenda') {
      const list = Store.agendaIcons(s).slice();
      list[index] = icon;
      s.agendaIcons = list;
    } else {
      const list = Store.bulletIcons(s).slice();
      list[index] = icon;
      s.bulletIcons = list;
    }
    Store.save();
    refresh();
    Store.toast(icon ? 'Icono aplicado' : 'Icono quitado', 'ok');
  }

  /** Enter dentro de una viñeta: crea la siguiente y deja el cursor en ella. */
  function addSiblingItem(el) {
    const s = current();
    if (!s) return;
    snapshot();
    const i = parseInt(el.dataset.i, 10);
    const j = parseInt(el.dataset.j, 10);
    const f = el.dataset.f;
    let target = -1;

    if (f === 'bullet' || f === 'agenda') {
      s.bullets.splice(i + 1, 0, '');
      target = i + 1;
    } else if (f === 'colItem') {
      const col = s.columns[i];
      if (!col) return;
      col.items.splice(j + 1, 0, '');
      target = j + 1;
    }
    Store.save();
    refresh();
    const sel = f === 'colItem'
      ? `#deck .slide[data-index="${App.state.ui.selected}"] [data-f="colItem"][data-i="${i}"][data-j="${target}"]`
      : `#deck .slide[data-index="${App.state.ui.selected}"] [data-f="${f}"][data-i="${target}"]`;
    const el2 = document.querySelector(sel);
    if (el2) { el2.focus(); const r = document.createRange(); r.selectNodeContents(el2); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  }


  function move(from, to) {
    const list = App.deck().slides;
    if (to < 0 || to >= list.length || from === to) return;
    snapshot();
    list.splice(to, 0, list.splice(from, 1)[0]);
    App.state.ui.selected = to;
    Store.paintSaveState('pendiente');
    Store.saveSoon();
    refresh();
  }

  /** Salta a otra diapositiva y la deja a la vista. */
  function goTo(i) {
    const list = App.deck().slides;
    const n = Math.max(0, Math.min(i, list.length - 1));
    if (n === App.state.ui.selected) return;
    App.state.ui.selected = n;
    refresh();
    const t = document.querySelector(`.thumb[data-i="${n}"]`);
    if (t) t.scrollIntoView({ block: 'nearest' });
    const s = document.querySelector(`#deck .slide[data-index="${n}"]`);
    if (s) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const go = delta => goTo(App.state.ui.selected + delta);

  function remove(i) {
    const list = App.deck().slides;
    if (list.length <= 1) { Store.toast('La presentación necesita al menos una diapositiva.', 'err'); return; }
    if (!confirm('¿Eliminar esta diapositiva?')) return;
    snapshot();
    list.splice(i, 1);
    App.state.ui.selected = Math.max(0, Math.min(i, list.length - 1));
    Store.save();
    refresh();
  }

  function duplicate(i) {
    const list = App.deck().slides;
    snapshot();
    const copy = Store.normalizeDeck({ slides: [list[i]] }).slides[0];
    copy.id = Store.uid();
    list.splice(i + 1, 0, copy);
    App.state.ui.selected = i + 1;
    Store.save();
    refresh();
  }

  function add(layout) {
    const list = App.deck().slides;
    snapshot();
    const s = Store.blankSlide(layout || 'bullets');
    if (layout === 'bullets' || !layout) s.title = 'Nueva diapositiva';
    list.splice(App.state.ui.selected + 1, 0, s);
    App.state.ui.selected += 1;
    Store.save();
    refresh();
    const el = document.querySelector(`#deck .slide[data-index="${App.state.ui.selected}"] [data-f="title"]`);
    if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  }

  function setLayout(id) {
    const s = current();
    if (!s) return;
    snapshot();
    s.layout = id;
    if (id === 'two-col' && s.columns.length !== 2) s.columns = [{ heading: 'A', items: ['', '', ''] }, { heading: 'B', items: ['', '', ''] }];
    if (id === 'stats' && !s.stats.length) s.stats = [{ value: '00%', label: 'Indicador' }, { value: '00', label: 'Indicador' }, { value: '00%', label: 'Indicador' }];
    if (id === 'timeline' && !s.steps.length) s.steps = [{ title: 'Paso 1', text: '' }, { title: 'Paso 2', text: '' }, { title: 'Paso 3', text: '' }];
    if (id === 'bullets' && !s.bullets.length) s.bullets = ['Punto clave', 'Segunda idea', 'Tercera idea'];
    if (id === 'agenda' && !s.bullets.length) s.bullets = ['Bloque 1', 'Bloque 2', 'Bloque 3', 'Bloque 4'];
    if (id === 'image' && !s.bullets.length) s.bullets = ['Punto clave', 'Segunda idea', 'Tercera idea'];
    if (id === 'gallery') Store.fitSlots(s, Math.max(2, Store.imgCount(s)));
    if (id === 'image' || id === 'image-full') {
      Store.fitSlots(s, Store.imgCount(s));
      const pr = Store.slidePrompts(s);
      if (!pr[0]) { pr[0] = s.title || ''; s.imagePrompts = pr; }
    }
    Store.save();
    refresh();
  }

  function act(name, num, btn) {
    const s = current();
    if (!s) return;
    const i = App.state.ui.selected;
    const slot = parseInt(num, 10) || 0;

    // up/down/dup/del ya guardan su propia foto en move/duplicate/remove; el resto
    // de cambios de contenido o de imágenes se apuntan aquí.
    const delega = name === 'up' || name === 'down' || name === 'dup' || name === 'del';
    if (!delega && !['redo', 'img-upload', 'img-gen', 'img-web', 'icon', 'icon-del'].includes(name)) snapshot();

    switch (name) {
      case 'up': move(i, i - 1); break;
      case 'down': move(i, i + 1); break;
      case 'dup': duplicate(i); break;
      case 'del': remove(i); break;

      case 'add-bullet': s.bullets.push(''); break;
      case 'del-item':
        if (s.bullets.length > 1) s.bullets.pop(); else s.bullets = [''];
        break;

      case 'col-2': s.columns = s.columns.slice(0, 2); break;
      case 'col-3': while (s.columns.length < 3) s.columns.push({ heading: '', items: ['', '', ''] }); s.columns = s.columns.slice(0, 3); break;
      case 'col-item+': if (s.columns[0]) s.columns[0].items.push(''); break;

      case 'stat+': s.stats.push({ value: '00', label: 'Indicador' }); break;
      case 'stat-': if (s.stats.length > 1) s.stats.pop(); break;

      case 'step+': s.steps.push({ title: 'Paso ' + (s.steps.length + 1), text: '' }); break;
      case 'step-': if (s.steps.length > 1) s.steps.pop(); break;

      case 'trow+': {
        const n = Math.max(2, (s.tcols.length || 3));
        s.trows.push(Array.from({ length: n }, () => ''));
        break;
      }
      case 'trow-': if (s.trows.length > 1) s.trows.pop(); break;
      case 'tcol+': {
        if ((s.tcols.length || 0) >= 5) break;
        s.tcols.push('');
        s.trows.forEach(r => r.push(''));
        break;
      }
      case 'tcol-': {
        if ((s.tcols.length || 0) <= 2) break;
        s.tcols.pop();
        s.trows.forEach(r => r.pop());
        break;
      }

      case 'card+': if (s.cards.length < 6) s.cards.push({ heading: '', text: '', icon: null }); break;
      case 'card-': if (s.cards.length > 1) s.cards.pop(); break;

      case 'img-gen': Images.generate(i, slot); return;
      case 'img-web': abrirWebImg(slot); return;
      case 'icon':
        abrirIconos(btn && btn.dataset.ikind, parseInt(btn && btn.dataset.iindex, 10));
        return;
      case 'icon-del':
        aplicarIcono(btn && btn.dataset.ikind, parseInt(btn && btn.dataset.iindex, 10), null);
        return;
      case 'img-del': {
        const arr = Store.slideImages(s);
        arr[slot] = '';
        s.images = arr;
        break;
      }
      case 'img-upload': {
        const f = $('inspFile');
        if (f) { f.dataset.slot = String(slot); f.click(); }
        return;
      }
      case 'img-count': {
        if (!['image', 'image-full', 'gallery'].includes(s.layout)) s.layout = 'gallery';
        Store.fitSlots(s, slot);
        break;
      }
      case 'redo': App.redoSlide(); return;
    }
    Store.save();
    refresh();
  }

  /* ---------- eventos ---------- */

  function init() {
    const deckEl = $('deck');

    deckEl.addEventListener('input', e => {
      const el = e.target.closest('[data-f]');
      if (el) writeField(el);
    });

    deckEl.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.target.blur(); return; }
      if (e.key !== 'Enter' || e.shiftKey) return;
      const el = e.target.closest('[data-f]');
      if (!el) return;
      if (['bullet', 'agenda', 'colItem'].includes(el.dataset.f)) {
        e.preventDefault();
        addSiblingItem(el);
      } else {
        e.preventDefault();
        el.blur();
      }
    });

    // El clic selecciona la diapositiva (sin interferir con la edición)
    deckEl.addEventListener('mousedown', e => {
      const s = e.target.closest('.slide');
      if (!s) return;
      const i = parseInt(s.dataset.index, 10);
      if (i !== App.state.ui.selected) {
        App.state.ui.selected = i;
        $('deck').querySelectorAll('.slide.selected').forEach(n => n.classList.remove('selected'));
        s.classList.add('selected');
        buildThumbs();
        buildInspector();
      }
    });
    // Clic en un hueco de imagen: abre el explorador de archivos para ese hueco
    deckEl.addEventListener('click', e => {
      const slotEl = e.target.closest('[data-img-slot]');
      if (!slotEl) return;
      const sec = e.target.closest('.slide');
      if (sec) elegirImagen(sec, parseInt(slotEl.dataset.slot, 10) || 0);
    });

    // Arrastrar una imagen desde el escritorio hasta cualquier diapositiva
    const esArchivo = e => Array.from(e.dataTransfer.types || []).includes('Files');

    deckEl.addEventListener('dragover', e => {
      if (!esArchivo(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const s = e.target.closest('.slide');
      deckEl.querySelectorAll('.slide.drop-img').forEach(n => n.classList.toggle('drop-img', n === s));
    });

    deckEl.addEventListener('dragleave', e => {
      if (e.target === deckEl || !deckEl.contains(e.relatedTarget)) {
        deckEl.querySelectorAll('.slide.drop-img').forEach(n => n.classList.remove('drop-img'));
      }
    });

    deckEl.addEventListener('drop', async e => {
      if (!esArchivo(e)) return;                 // el reordenado de miniaturas usa su propia zona
      e.preventDefault();
      const sec = e.target.closest('.slide');
      deckEl.querySelectorAll('.slide.drop-img').forEach(n => n.classList.remove('drop-img'));
      if (!sec) return;
      const i = parseInt(sec.dataset.index, 10);
      const file = Array.from(e.dataTransfer.files || []).find(f => /^image\//.test(f.type));
      if (!file) { Store.toast('Suelta un archivo de imagen (JPG, PNG, WebP…).', 'err'); return; }
      App.state.ui.selected = i;
      sec.classList.add('selected');
      buildThumbs();
      buildInspector();
      const slotEl = e.target.closest('[data-img-slot]');
      const slot = slotEl ? (parseInt(slotEl.dataset.slot, 10) || 0) : 0;
      await Images.useFile(file, App.deck().slides[i], slot);
    });

    // Inspector
    $('inspectorBody').addEventListener('click', e => {
      const lay = e.target.closest('[data-layout]');
      if (lay) { setLayout(lay.dataset.layout); return; }
      const b = e.target.closest('[data-act]');
      if (b) act(b.dataset.act, b.dataset.n != null ? b.dataset.n : b.dataset.slot, b);
    });

    $('inspectorBody').addEventListener('change', e => {
      const s = current();
      if (!s) return;
      const pr = e.target.closest('[data-imgprompt]');
      if (pr) {
        const arr = Store.slidePrompts(s);
        arr[parseInt(pr.dataset.imgprompt, 10)] = e.target.value;
        s.imagePrompts = arr;
        Store.save();
        return;
      }
      switch (e.target.id) {
        case 'inspNotes': s.notes = e.target.value; break;
        case 'inspAuthor': App.deck().author = e.target.value; break;
        case 'inspDate': App.deck().date = e.target.value; break;
        case 'inspFile':
          if (e.target.files && e.target.files[0]) Images.useFile(e.target.files[0], s, parseInt(e.target.dataset.slot, 10) || 0);
          return;
      }
      Store.save();
    });
    $('inspectorBody').addEventListener('input', e => {
      if (e.target.closest('[data-imgprompt]') || ['inspNotes', 'inspAuthor', 'inspDate'].includes(e.target.id)) {
        e.target.dispatchEvent(new Event('change'));
      }
    });

    // Buscador de fotos de internet
    $('btnWebImgSearch').onclick = buscarWebImg;
    $('webImgResults').addEventListener('click', e => {
      const b = e.target.closest('[data-web]');
      if (b) usarWeb(parseInt(b.dataset.web, 10));
    });
    $('webImgQuery').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); buscarWebImg(); }
    });

    // Buscador de iconos
    $('btnIconSearch').onclick = buscarIconosDlg;
    $('iconResults').addEventListener('click', e => {
      const b = e.target.closest('[data-icon]');
      if (!b || !iconTarget) return;
      const ic = iconResults[parseInt(b.dataset.icon, 10)];
      if (!ic) return;
      const t = iconTarget;
      $('dlgIcon').close();
      aplicarIcono(t.kind, t.index, ic);
    });
    $('btnIconClear').onclick = () => {
      if (!iconTarget) return;
      const t = iconTarget;
      $('dlgIcon').close();
      aplicarIcono(t.kind, t.index, null);
    };
    $('iconQuery').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); buscarIconosDlg(); }
    });

    // Miniaturas: selección, arrastre y botones
    const box = $('thumbs');
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const i = parseInt(b.closest('.thumb').dataset.i, 10);
        App.state.ui.selected = i;
        act(b.dataset.act);
        return;
      }
      const t = e.target.closest('.thumb');
      if (t) { App.state.ui.selected = parseInt(t.dataset.i, 10); refresh(); }
    });

    // La misma acción con el teclado (Enter o espacio), para quien no usa ratón
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest('.thumb');
      if (!t) return;
      e.preventDefault();
      const b = e.target.closest('[data-act]');
      App.state.ui.selected = parseInt(t.dataset.i, 10);
      if (b) act(b.dataset.act); else refresh();
    });

    box.addEventListener('dragstart', e => {
      const t = e.target.closest('.thumb');
      if (!t) return;
      dragFrom = parseInt(t.dataset.i, 10);
      t.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragend', () => {
      dragFrom = -1;
      box.querySelectorAll('.thumb').forEach(n => n.classList.remove('dragging', 'drag-over'));
    });
    box.addEventListener('dragover', e => {
      e.preventDefault();
      const t = e.target.closest('.thumb');
      box.querySelectorAll('.thumb').forEach(n => n.classList.toggle('drag-over', n === t));
    });
    box.addEventListener('drop', e => {
      e.preventDefault();
      const t = e.target.closest('.thumb');
      if (!t || dragFrom < 0) return;
      move(dragFrom, parseInt(t.dataset.i, 10));
      box.querySelectorAll('.thumb').forEach(n => n.classList.remove('drag-over'));
    });

    /* Reordenar con el dedo: los navegadores móviles no disparan drag&drop HTML5.
       Se exige una pulsación breve (250 ms) para no robar el scroll de la lista. */
    let touchFrom = -1, touchY = 0, touchTimer = null, touchDrag = false;

    const finTouch = () => {
      clearTimeout(touchTimer); touchTimer = null;
      touchFrom = -1; touchDrag = false;
      box.querySelectorAll('.thumb').forEach(n => n.classList.remove('dragging', 'drag-over'));
    };

    box.addEventListener('touchstart', e => {
      const t = e.target.closest('.thumb');
      if (!t || e.target.closest('[data-act]')) return;
      touchFrom = parseInt(t.dataset.i, 10);
      touchY = e.touches[0].clientY;
      touchDrag = false;
      clearTimeout(touchTimer);
      touchTimer = setTimeout(() => { touchDrag = true; t.classList.add('dragging'); }, 250);
    }, { passive: true });

    box.addEventListener('touchmove', e => {
      if (touchFrom < 0) return;
      if (!touchDrag) {
        // si el dedo se desplaza antes de tiempo, era scroll: no reordenamos
        if (Math.abs(e.touches[0].clientY - touchY) > 10) { clearTimeout(touchTimer); touchTimer = null; touchFrom = -1; }
        return;
      }
      if (e.cancelable) e.preventDefault();
      const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
      const t = el && el.closest('.thumb');
      box.querySelectorAll('.thumb').forEach(n => n.classList.toggle('drag-over', n === t));
    }, { passive: false });

    box.addEventListener('touchend', () => {
      const desde = touchFrom;
      const over = touchDrag ? box.querySelector('.thumb.drag-over') : null;
      finTouch();
      if (over) {
        const hasta = parseInt(over.dataset.i, 10);
        if (hasta !== desde) move(desde, hasta);
      }
    });
    box.addEventListener('touchcancel', finTouch);

    // Mantener el tamaño correcto de las miniaturas al redimensionar
    if (window.ResizeObserver) new ResizeObserver(scaleThumbs).observe(box);
    window.addEventListener('resize', Store.debounce(scaleThumbs, 150));
  }

  return { init, refresh, refreshSlide, refreshOf, updateThumb, buildThumbs, buildInspector, current, setLayout, add, scaleThumbs, go, goTo, estaVacia, focusText, escribir, undoEdit, snapshot, setIcon: aplicarIcono };
})();
