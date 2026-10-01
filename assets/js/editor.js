/* ============================================================
   DeckAI · edición en el lienzo, miniaturas e inspector
   ============================================================ */

const Editor = (() => {
  const { esc, md } = Store;
  const $ = id => document.getElementById(id);

  let dragFrom = -1;

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
      case 'imagePrompt': s.imagePrompt = val; break;
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
    }
    App.state.ui.dirty = true;
    Store.paintSaveState('pendiente');
    Store.saveSoon();
    refreshThumbsSoon();
  }

  const refreshThumbsSoon = Store.debounce(() => buildThumbs(), 600);

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
      <div class="thumb${i === App.state.ui.selected ? ' on' : ''}" data-i="${i}" draggable="true" title="Diapositiva ${i + 1}: ${esc(s.title || (LAYOUTS.find(l => l.id === s.layout) || {}).name || '')}">
        <div class="thumb-num">${i + 1}</div>
        <div class="thumb-frame"><div class="deck">${Render.slide(s, deck, i)}</div></div>
        <div class="thumb-tools">
          <button data-act="up" title="Subir"><svg class="ic"><use href="#i-up"></use></svg></button>
          <button data-act="down" title="Bajar"><svg class="ic"><use href="#i-down"></use></svg></button>
          <button data-act="dup" title="Duplicar"><svg class="ic"><use href="#i-copy"></use></svg></button>
          <button data-act="del" title="Eliminar"><svg class="ic"><use href="#i-trash"></use></svg></button>
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

    const isText = ['bullets', 'image', 'agenda'].includes(s.layout);
    const isCols = s.layout === 'two-col';
    const isStats = s.layout === 'stats';
    const isSteps = s.layout === 'timeline';

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
        </div>` : ''}

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
        </div>` : ''}

      ${isSteps ? `<div class="insp-label">Pasos</div>
        <div class="insp-row">
          <button class="btn btn-sm" data-act="step+">+ Paso</button>
          <button class="btn btn-sm" data-act="step-">− Último</button>
        </div>` : ''}

      <div class="insp-label">Imagen</div>
      <label class="field"><span>Describe la imagen que quieres</span>
        <textarea id="inspPrompt" rows="2" placeholder="Ej. escritorio con un cuaderno y una taza de café, luz natural">${esc(s.imagePrompt)}</textarea>
      </label>
      <div class="insp-row">
        <button class="btn btn-sm" data-act="img-upload"><svg class="ic"><use href="#i-image"></use></svg><span>Subir imagen</span></button>
        <button class="btn btn-sm btn-primary" data-act="img-gen"><svg class="ic"><use href="#i-magic"></use></svg><span>Generar con IA</span></button>
        ${s.image ? '<button class="btn btn-sm" data-act="img-del">Quitar</button>' : ''}
      </div>
      <p class="hint"${Images.CON_IMAGEN.includes(s.layout) ? '' : ' style="color:#f0b866"'}>
        ${Images.CON_IMAGEN.includes(s.layout)
          ? (s.image ? 'Puedes arrastrar otra imagen encima de la diapositiva.' : 'Arrastra una imagen desde tu escritorio hasta la diapositiva.')
          : 'Este diseño no tiene hueco para la imagen: al subirla, el diseño pasa a «Imagen».'}
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

  /** Abre el explorador de archivos para la diapositiva indicada. */
  function elegirImagen(sec) {
    const i = parseInt(sec.dataset.index, 10);
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (f) Images.useFile(f, App.deck().slides[i]);
    };
    inp.click();
  }

  /** Enter dentro de una viñeta: crea la siguiente y deja el cursor en ella. */
  function addSiblingItem(el) {
    const s = current();
    if (!s) return;
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
    list.splice(i, 1);
    App.state.ui.selected = Math.max(0, Math.min(i, list.length - 1));
    Store.save();
    refresh();
  }

  function duplicate(i) {
    const list = App.deck().slides;
    const copy = Store.normalizeDeck({ slides: [list[i]] }).slides[0];
    copy.id = Store.uid();
    list.splice(i + 1, 0, copy);
    App.state.ui.selected = i + 1;
    Store.save();
    refresh();
  }

  function add(layout) {
    const list = App.deck().slides;
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
    s.layout = id;
    if (id === 'two-col' && s.columns.length !== 2) s.columns = [{ heading: 'A', items: ['', '', ''] }, { heading: 'B', items: ['', '', ''] }];
    if (id === 'stats' && !s.stats.length) s.stats = [{ value: '00%', label: 'Indicador' }, { value: '00', label: 'Indicador' }, { value: '00%', label: 'Indicador' }];
    if (id === 'timeline' && !s.steps.length) s.steps = [{ title: 'Paso 1', text: '' }, { title: 'Paso 2', text: '' }, { title: 'Paso 3', text: '' }];
    if (id === 'bullets' && !s.bullets.length) s.bullets = ['Punto clave', 'Segunda idea', 'Tercera idea'];
    if (id === 'agenda' && !s.bullets.length) s.bullets = ['Bloque 1', 'Bloque 2', 'Bloque 3', 'Bloque 4'];
    if (id === 'image' && !s.bullets.length) s.bullets = ['Punto clave', 'Segunda idea', 'Tercera idea'];
    if (id === 'image-full' && !s.imagePrompt) s.imagePrompt = s.title || '';
    Store.save();
    refresh();
  }

  function act(name) {
    const s = current();
    if (!s) return;
    const i = App.state.ui.selected;

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

      case 'img-gen': Images.generate(i); return;
      case 'img-del': s.image = ''; break;
      case 'img-upload': {
        const f = $('inspFile');
        if (f) f.click();
        return;
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
    // Clic en el hueco de imagen: abre el explorador de archivos
    deckEl.addEventListener('click', e => {
      if (!e.target.closest('[data-img-slot]')) return;
      const sec = e.target.closest('.slide');
      if (sec) elegirImagen(sec);
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
      await Images.useFile(file, App.deck().slides[i]);
    });

    // Inspector
    $('inspectorBody').addEventListener('click', e => {
      const lay = e.target.closest('[data-layout]');
      if (lay) { setLayout(lay.dataset.layout); return; }
      const b = e.target.closest('[data-act]');
      if (b) act(b.dataset.act);
    });

    $('inspectorBody').addEventListener('change', e => {
      const s = current();
      if (!s) return;
      switch (e.target.id) {
        case 'inspPrompt': s.imagePrompt = e.target.value; break;
        case 'inspNotes': s.notes = e.target.value; break;
        case 'inspAuthor': App.deck().author = e.target.value; break;
        case 'inspDate': App.deck().date = e.target.value; break;
        case 'inspFile':
          if (e.target.files && e.target.files[0]) Images.useFile(e.target.files[0], s);
          return;
      }
      Store.save();
    });
    $('inspectorBody').addEventListener('input', e => {
      if (['inspPrompt', 'inspNotes', 'inspAuthor', 'inspDate'].includes(e.target.id)) {
        e.target.dispatchEvent(new Event('change'));
      }
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

    // Mantener el tamaño correcto de las miniaturas al redimensionar
    if (window.ResizeObserver) new ResizeObserver(scaleThumbs).observe(box);
    window.addEventListener('resize', Store.debounce(scaleThumbs, 150));
  }

  return { init, refresh, buildThumbs, buildInspector, current, setLayout, add, scaleThumbs, go, goTo, estaVacia, focusText, escribir };
})();
