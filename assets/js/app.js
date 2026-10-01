/* ============================================================
   DeckAI · arranque y coordinación de la interfaz
   ============================================================ */

const App = (() => {
  const $ = id => document.getElementById(id);

  const deck = () => Store.state.deck;
  const state = Store.state;

  /* ---------- pistas de uso ---------- */

  const EJEMPLOS = [
    'El cambio climático en los centros educativos',
    'Cómo montar una startup en 2026',
    'Historia del arte español para secundaria',
    'Ventajas y riesgos de la inteligencia artificial',
    'Onboarding para nuevos empleados',
    'La dieta mediterránea en la escuela'
  ];

  function buildExamples() {
    $('examples').innerHTML = EJEMPLOS.map(t =>
      `<button class="chip" type="button" data-topic="${Store.esc(t)}">${Store.esc(t)}</button>`).join('');
  }

  /** Enciende los pasos del panel izquierdo según lo que ya está rellenado. */
  function paintSteps() {
    const hayTema = !!form().topic;
    const pasos = [...$('panelLeft').querySelectorAll('.step')];

    pasos.forEach(el => {
      const n = el.dataset.step;
      el.classList.toggle('listo', n === '1' ? hayTema : n === '2' ? !!deck().theme : hayTema);
      el.classList.remove('activo');
    });

    // solo el primer paso pendiente queda resaltado: dice dónde seguir
    const pendiente = pasos.find(el => !el.classList.contains('listo'));
    if (pendiente) pendiente.classList.add('activo');
  }

  /** Aviso bajo el estado inicial: falta la clave o ya hay todo listo. */
  function paintEmptyHint() {
    const el = $('emptyHint');
    if (!el) return;
    if (hayProveedor()) {
      el.classList.remove('warn');
      el.textContent = form().topic
        ? 'Ya tienes un tema escrito: pulsa «Generar presentación» cuando quieras.'
        : 'Truco: puedes pedirle cada cambio al asistente en lugar de escribirlo todo.';
      return;
    }
    el.classList.add('warn');
    el.textContent = 'Antes de empezar necesitas una clave de IA. Pulsa «Generar presentación» y te llevo a Ajustes.';
  }

  /* ---------- escalado del lienzo ---------- */

  function fit() {
    const scroll = $('stageScroll');
    const wrap = $('deckWrap');
    const d = $('deck');
    if (!scroll || !d) return;

    const avail = Math.max(320, scroll.clientWidth - 46);
    const k = Math.min(1, avail / CONFIG.slideW);

    d.style.transform = `scale(${k})`;
    wrap.style.width = CONFIG.slideW * k + 'px';
    wrap.style.height = CONFIG.slideH * k + 'px';
  }

  function fitPresent() {
    const wrap = $('presentWrap');
    const d = $('presentDeck');
    if (!d || !d.childElementCount) return;

    const k = Math.min(window.innerWidth / CONFIG.slideW, window.innerHeight / CONFIG.slideH);
    d.style.transform = `scale(${k})`;
    wrap.style.width = CONFIG.slideW * k + 'px';
    wrap.style.height = CONFIG.slideH * k + 'px';
  }

  /* ---------- formulario ---------- */

  function form() {
    return {
      topic: $('fTopic').value.trim(),
      count: parseInt($('fCount').value, 10) || 10,
      language: $('fLanguage').value,
      audience: $('fAudience').value.trim(),
      tone: $('fTone').value,
      style: $('fStyle').value.trim(),
      notes: $('fNotes').value.trim()
    };
  }

  /* ---------- generación ---------- */

  let busy = false;

  /** Algún proveedor listo para generar (clave o local) con un modelo elegido. */
  function hayProveedor() {
    return Providers.chain().length > 0;
  }

  async function generate() {
    if (busy) return;
    const f = form();

    if (!f.topic) {
      Store.toast('Escribe primero el tema de la presentación.', 'err');
      $('fTopic').focus();
      return;
    }
    if (!hayProveedor()) {
      Store.toast('Necesitas al menos una clave de IA (Gemini, OpenRouter, Groq o Mistral). Abrimos Ajustes.', 'err');
      openSettings();
      return;
    }

    busy = true;
    $('btnGenerate').disabled = true;
    const bar = $('genProgress');
    bar.hidden = false;
    const ptext = bar.querySelector('.progress-text');
    const intentos = [];
    // el equipo reparte por proveedor: hacen falta dos proveedores distintos, no dos modelos del mismo
    const equipo = state.settings.cooperativo !== false && Providers.equipoSize() > 1;
    ptext.textContent = equipo
      ? 'Un modelo escribe el guion y varios redactan las diapositivas…'
      : 'La IA está escribiendo la presentación…';

    try {
      const raw = await Providers.createDeck(f, {
        onIntentos: (c, extra) => {
          intentos.push(c);
          ptext.textContent = 'Escribiendo con ' + c.model + ' (' + (Providers.byId(c.provider).short || Providers.byId(c.provider).name) + ')…' + extra;
        }
      });
      const next = Store.normalizeDeck(raw);
      next.theme = deck().theme;              // respetamos la plantilla elegida

      Store.state.deck = next;
      state.ui.selected = 0;
      Store.save();
      Editor.refresh();

      const n = next.slides.length;
      const usados = raw._equipo || [];
      ptext.textContent = usados.length > 1
        ? `Listo: ${n} diapositivas escritas por ${usados.length} modelos.`
        : `Listo: ${n} diapositivas.`;
      const con = raw._usado;
      const rep = raw._reparadas || 0;
      const vacias = raw._vacias || 0;
      Store.toast(`Presentación creada con ${n} diapositivas` +
        (usados.length > 1
          ? ` · en equipo: ${usados.map(u => u.model).join(' + ')}`
          : ` · ${con ? con.model : ''}`) +
        (rep ? ` (${rep} completadas por la IA)` : '') +
        (vacias ? ` · ${vacias} siguen vacías: usa "Rehacer con IA"` : ''), vacias ? 'warn' : 'ok');
      if (intentos.length > 1) {
        console.warn('Proveedores intentados:', intentos, 'errores:', raw._errores);
      }

      if ($('fImages').checked) setTimeout(() => Images.all(), 400);
    } catch (e) {
      ptext.textContent = 'Error al generar.';
      Store.toast(e.message, 'err');
      if (e._errores) console.warn('Errores por proveedor:', e._errores);
    } finally {
      busy = false;
      $('btnGenerate').disabled = false;
      setTimeout(() => { bar.hidden = true; }, 2600);
    }
  }

  /** Reescribe solo la diapositiva seleccionada. */
  async function redoSlide() {
    const f = form();
    const i = state.ui.selected;
    if (!f.topic) f.topic = deck().title;
    if (!hayProveedor()) { Store.toast('Necesitas una clave de IA.', 'err'); openSettings(); return; }

    Store.toast('Reescribiendo la diapositiva ' + (i + 1) + '…');
    try {
      const raw = await Providers.redoSlide(deck(), i, f);
      const fresh = Store.normalizeDeck({ slides: [raw] }).slides[0];
      fresh.id = deck().slides[i].id;
      fresh.image = deck().slides[i].image;     // conservamos la imagen ya generada
      deck().slides[i] = fresh;
      Store.save();
      Editor.refresh();
      Store.toast('Diapositiva actualizada', 'ok');
    } catch (e) {
      Store.toast(e.message, 'err');
    }
  }

  /* ---------- ajustes ---------- */

  const CUSTOM = '__custom__';
  const liveModels = {};        // liveModels[proveedor] = modelos que devuelve su API
  const liveImgModels = {};     // liveImgModels[proveedor] = modelos de imagen que devuelve su API
  const pendingKeys = {};       // claves escritas en el diálogo, aún sin guardar
  let uiProvider = 'gemini';    // proveedor de texto abierto en Ajustes
  let uiImgProvider = 'gemini'; // proveedor de imágenes abierto en Ajustes

  const isImageSelect = sel => sel.id === 'fImgModel';

  /** Rellena un <select> con el catálogo, la lista real de la clave y la opción manual. */
  function fillModelSelect(sel, catalog, current, live, catalogLabel) {
    const known = catalog.map(m => m.id);
    const opt = (id, label) => `<option value="${Store.esc(id)}">${Store.esc(label)}</option>`;

    // los modelos sin coste se agrupan aparte: es lo primero que se busca
    const gratis = catalog.filter(m => m.gratis);
    const pago = catalog.filter(m => !m.gratis);
    const grupo = (titulo, lista) => lista.length
      ? `<optgroup label="${Store.esc(titulo)}">` + lista.map(m => opt(m.id, `${m.label} — ${m.note} [${m.id}]`)).join('') + '</optgroup>'
      : '';

    // si el catálogo es mixes, los sin coste van primero; si todo es gratuito, ese grupo basta
    let html = (gratis.length ? grupo('GRATIS', gratis) : '') +
      grupo(catalogLabel || 'Catálogo recomendado', pago);

    // lo que tu clave puede usar y no está en el catálogo
    // (la lista de imágenes ya viene filtrada por la propia API)
    const extra = (live || []).filter(id => !known.includes(id) &&
      (isImageSelect(sel) || Gemini.isTextModel(id)));
    if (extra.length) {
      html += '<optgroup label="Disponibles con tu clave">' + extra.map(id => opt(id, id)).join('') + '</optgroup>';
    }
    html += '<optgroup label="Manual">' + opt(CUSTOM, 'Otro modelo (escribir el ID)…') + '</optgroup>';

    sel.innerHTML = html;
    if (known.includes(current) || (live || []).includes(current)) sel.value = current;
    else {
      sel.value = CUSTOM;
      customInput(sel).value = current;
    }
    toggleCustom(sel);
  }

  function customInput(sel) {
    return $(isImageSelect(sel) ? 'fImgModelCustom' : 'fModelCustom');
  }

  function toggleCustom(sel) {
    $(isImageSelect(sel) ? 'wrapImgCustom' : 'wrapTextCustom')
      .classList.toggle('is-hidden', sel.value !== CUSTOM);
  }

  /** Nota descriptiva del modelo elegido. */
  function modelNote(sel) {
    const esImg = isImageSelect(sel);
    const id = chosenModel(sel, esImg
      ? (CONFIG.defaultImageModel[uiImgProvider] || '')
      : CONFIG.defaultModel[uiProvider]);
    const cat = esImg ? Providers.imageCatalogo(uiImgProvider) : Providers.catalogo(uiProvider);
    const hit = cat.find(m => m.id === id);
    return hit ? `${hit.label}: ${hit.note}` : id;
  }

  /* --- proveedor abierto en el diálogo --- */

  function fillProviders() {
    $('fProvider').innerHTML = Providers.textoProviders().map(p =>
      `<option value="${p.id}">${Store.esc(p.name)}</option>`).join('');
    $('fProvider').value = uiProvider;
    paintProvider();
  }

  function paintProvider() {
    const p = Providers.byId(uiProvider);

    $('keyLabel').textContent = p.keyLabel;
    $('fKey').placeholder = p.keyPlaceholder || '';
    $('fKey').value = pendingKeys[uiProvider] != null ? pendingKeys[uiProvider] : (state.settings.keys[uiProvider] || '');
    $('keyField').classList.toggle('is-hidden', !p.needsKey);
    $('keyHelp').classList.toggle('is-hidden', !p.needsKey || !p.keyUrl);
    $('keyUrl').href = p.keyUrl || '#';
    $('keyUrl').textContent = (p.keyUrl || '').replace(/^https?:\/\//, '');
    $('providerHint').textContent = p.note || '';

    fillModelSelect($('fModel'), Providers.catalogo(uiProvider), state.settings.models[uiProvider] || '',
      liveModels[uiProvider], 'Catálogo de ' + p.name);
    $('modelHint').textContent = (state.settings.remember ? 'Claves guardadas en este navegador. · ' : 'Las claves se mantienen solo mientras esta pestaña esté abierta. · ') + modelNote($('fModel'));
    paintExtraKeys();
  }

  /** Lista plegable con el resto de claves ya escritas. */
  function paintExtraKeys() {
    const otros = CONFIG.providers.filter(p => p.id !== uiProvider && Providers.key(p.id));
    $('extraCount').textContent = otros.length;
    $('extraKeysBody').innerHTML = otros.length
      ? otros.map(p => `
        <label class="field">
          <span>${Store.esc(p.name)} <em class="muted">${p.local ? '(sin clave)' : ''}</em></span>
          <input type="password" data-key="${p.id}" value="${Store.esc(Providers.key(p.id))}" placeholder="${Store.esc(p.keyPlaceholder || '')}" autocomplete="off">
        </label>
        <p class="hint">Texto: ${Store.esc(state.settings.models[p.id] || CONFIG.defaultModel[p.id] || 'sin definir')}` +
        (p.imagen ? ` · Imágenes: ${Store.esc(state.settings.imageModels[p.id] || CONFIG.defaultImageModel[p.id] || 'sin definir')}` : '') +
        `</p>
      `).join('')
      : '<p class="hint">Aún no has pegado ninguna otra clave.</p>';
  }

  /* --- proveedor de imágenes abierto en el diálogo --- */

  const CATALOGO_IMG = {
    gemini: 'Gemini · Nano Banana',
    openrouter: 'OpenRouter · Recomendado',
    pollinations: 'Pollinations · Recomendado',
    huggingface: 'Hugging Face · Stable Diffusion 3',
    aihorde: 'AI Horde · Gratis sin clave'
  };

  function fillImgProviders() {
    $('fImgProvider').innerHTML = Providers.imageProviders().map(p =>
      `<option value="${p.id}">${Store.esc(p.name)}</option>`).join('');
    $('fImgProvider').value = uiImgProvider;
    paintImgProvider();
  }

  /** Pinta el campo de clave del proveedor de imágenes. Cuando el proveedor de
   *  imágenes no es el mismo que el de texto (p.ej. texto con Gemini e imágenes
   *  con Hugging Face), su clave no se puede editar arriba, así que tiene su
   *  propio input aquí. */
  function paintImgKey() {
    const p = Providers.byId(uiImgProvider);
    const wrap = $('wrapImgKey');
    // Si el proveedor de imágenes es el MISMO que el de texto, su clave ya se
    // edita arriba: mostrar otro campo aquí daría dos inputs escribiendo en la
    // misma clave, y al guardar el último pisaría lo que escribiste en el otro.
    // "keyOpcional" cubre a quien funciona sin clave pero admite una (AI Horde):
    // el campo se muestra, aunque no sea obligatorio rellenarlo.
    const visible = (p.needsKey || p.keyOpcional) && uiImgProvider !== uiProvider;
    wrap.classList.toggle('is-hidden', !visible);
    if (!visible) return;
    $('imgKeyLabel').textContent = p.keyLabel || 'Clave de ' + p.short;
    $('fImgKey').placeholder = p.keyPlaceholder || '';
    $('fImgKey').value = pendingKeys[uiImgProvider] != null
      ? pendingKeys[uiImgProvider]
      : (state.settings.keys[uiImgProvider] || '');
    $('imgKeyHelp').innerHTML = (p.keyHelp ? Store.esc(p.keyHelp) + '<br>Más información en ' : 'Se consigue en ') +
      '<a id="imgKeyUrl" href="' + Store.esc(p.keyUrl || '#') +
      '" target="_blank" rel="noopener">' + Store.esc((p.keyUrl || '').replace(/^https?:\/\//, '')) + '</a>.';
  }

  function paintImgProvider() {
    const p = Providers.byId(uiImgProvider);
    $('imgProviderHint').textContent = p.note || '';
    paintImgKey();
    fillModelSelect($('fImgModel'), Providers.imageCatalogo(uiImgProvider),
      state.settings.imageModels[uiImgProvider] || '', liveImgModels[uiImgProvider],
      CATALOGO_IMG[uiImgProvider] || 'Catálogo de ' + p.name);
    updateImageWarn();
  }

  function openSettings() {
    const s = state.settings;
    Object.keys(pendingKeys).forEach(k => delete pendingKeys[k]);
    uiProvider = s.provider;
    uiImgProvider = Providers.imageProvider();
    $('fRemember').checked = !!s.remember;
    $('fAutoRetry').checked = s.autoRetry !== false;
    $('fCooperativo').checked = s.cooperativo !== false;
    fillProviders();
    fillImgProviders();
    $('dlgSettings').showModal();
  }

  /** Advierte si el modelo elegido para imágenes no parece un generador de imágenes. */
  function updateImageWarn() {
    const id = chosenModel($('fImgModel'), CONFIG.defaultImageModel[uiImgProvider] || '');
    const warn = $('imgModelWarn');
    const p = Providers.byId(uiImgProvider);
    const mal = uiImgProvider === 'gemini' && !Gemini.isImageModel(id);
    const sinClaveNecesaria = p.needsKey && !Providers.key(uiImgProvider);
    const otros = Providers.imageChain().filter(c => c.provider !== uiImgProvider);

    let msg = '';
    const nombres = Providers.imageProviders().map(x => x.short).join(', ');
    if (mal) msg = 'Ojo: «' + id + '» parece un modelo de texto, así que no se generarán ilustraciones.';
    else if (sinClaveNecesaria && !otros.length) {
      msg = 'Falta la clave de ' + p.short + ': no se generarán ilustraciones. Pégala en el campo de arriba.';
    } else if (sinClaveNecesaria) {
      const otro = Providers.byId(otros[0].provider);
      msg = 'No has pegado la clave de ' + p.short + ' (campo de arriba): las imágenes se generarán con ' +
        otro.short + ' (' + otros[0].model + ') hasta que la añadas.';
    } else if (otros.length) {
      msg = 'Si ' + p.short + ' falla o se queda sin saldo, se probarán ' + otros.length +
        ' proveedor' + (otros.length > 1 ? 'es' : '') + ' más.';
    }
    warn.textContent = msg;
    warn.classList.toggle('is-hidden', !msg);
  }

  function saveSettings() {
    const s = state.settings;

    // recogemos la clave del proveedor abierto y las de la lista plegable
    pendingKeys[uiProvider] = $('fKey').value.trim();
    // y la del proveedor de IMÁGENES, que es un campo aparte cuando no coincide
    // con el de texto (p.ej. texto con Gemini, imágenes con Hugging Face)
    if (!$('wrapImgKey').classList.contains('is-hidden')) {
      pendingKeys[uiImgProvider] = $('fImgKey').value.replace(/\s+/g, '');
    }
    $('extraKeysBody').querySelectorAll('input[data-key]').forEach(inp => {
      pendingKeys[inp.dataset.key] = inp.value.trim();
    });
    CONFIG.providers.forEach(p => { s.keys[p.id] = pendingKeys[p.id] || ''; });

    s.provider = $('fProvider').value;
    s.remember = $('fRemember').checked;
    s.autoRetry = $('fAutoRetry').checked;
    s.cooperativo = $('fCooperativo').checked;
    s.models[s.provider] = chosenModel($('fModel'), CONFIG.defaultModel[s.provider] || '');
    s.imageProvider = uiImgProvider;
    s.imageModels[uiImgProvider] = chosenModel($('fImgModel'), CONFIG.defaultImageModel[uiImgProvider] || '');
    s.imageModel = s.imageModels[uiImgProvider];
    Object.keys(pendingKeys).forEach(k => delete pendingKeys[k]);
    Store.save();
    refreshKeyHints();
  }

  function chosenModel(sel, fallback) {
    if (sel.value !== CUSTOM) return sel.value;
    return customInput(sel).value.trim() || fallback;
  }

  function refreshKeyHints() {
    const s = state.settings;
    const listos = Providers.chain();
    const p = Providers.byId(s.provider);
    const otros = new Set(listos.map(c => c.provider)).size - 1;

    let hint;
    if (listos.length) {
      hint = 'Texto con ' + (s.models[s.provider] || '?') + ' · ' + (p.short || p.name) + '.';
      if (otros > 0) {
        hint += ` + ${otros} prove${otros > 1 ? 'edores' : 'edor'} en reserva.`;
        if (s.cooperativo !== false) {
          const equipo = Math.min(listos.length, 4);
          hint += ` Repartido entre ${equipo} modelos.`;
        }
      }
    } else {
      hint = 'Sin clave API: puedes escribir y maquetar, pero para generar necesitas abrir Ajustes.';
    }

    // La barra dice el proveedor que se va a usar DE VERDAD, que no siempre es el elegido:
    // si al que elegiste le falta la clave, la cadena se salta al siguiente con clave.
    const cadenaImg = Providers.imageChain();
    if (cadenaImg.length) {
      const real = cadenaImg[0];
      const elegido = Providers.imageProvider();
      const ip = Providers.byId(real.provider);
      hint += ` · Imágenes con ${real.model} (${ip.short}).`;
      if (elegido !== real.provider) {
        const falta = !Providers.key(elegido) ? 'no le has pegado la clave' : 'no tiene modelo elegido';
        hint += ` Elegiste ${Providers.byId(elegido).short} pero ${falta}: de imágenes se usa ${ip.short}.`;
      }
      $('imgModelHint').textContent = '(' + ip.short + ': ' + real.model + ')';
    } else {
      $('imgModelHint').textContent = '';
    }

    const el = $('keyHint');
    el.textContent = hint;
    el.classList.toggle('warn', !listos.length);

    const btn = $('btnGenerate');
    const listo = !!listos.length;
    btn.querySelector('span').textContent = listo ? 'Generar presentación' : 'Generar (necesita una clave)';
    btn.classList.toggle('btn-primary', listo);

    paintEmptyHint();
  }

  async function listModels() {
    const id = uiProvider;
    if (Providers.byId(id).needsKey && !Providers.key(id) && !pendingKeys[id]) {
      Store.toast('Primero pega la clave de ' + Providers.byId(id).name + '.', 'err');
      return;
    }
    const btn = $('btnListModels');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      // la clave recién escrita aún no está guardada: la usamos solo para esta consulta
      const k = $('fKey').value.trim();
      if (k) { state.settings.keys[id] = k; pendingKeys[id] = k; }
      liveModels[id] = await Providers.listModels(id);
      fillModelSelect($('fModel'), Providers.catalogo(id), state.settings.models[id] || '', liveModels[id], 'Catálogo de ' + Providers.byId(id).name);
      $('modelHint').textContent = liveModels[id].length + ' modelos disponibles: ' + modelNote($('fModel'));
    } catch (e) {
      Store.toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ver modelos';
    }
  }

  /** Igual que listModels, pero con el catálogo de modelos que dibujan imágenes. */
  async function listImgModels() {
    const id = uiImgProvider;
    const btn = $('btnListImgModels');
    btn.disabled = true;
    btn.textContent = 'Cargando…';
    try {
      liveImgModels[id] = await Providers.listImageModels(id);
      paintImgProvider();
      const n = liveImgModels[id].length;
      Store.toast(n
        ? n + ' modelos de imagen en ' + Providers.byId(id).name + '.'
        : Providers.byId(id).name + ' no ha devuelto ningún modelo de imagen.', n ? 'ok' : 'err');
    } catch (e) {
      Store.toast(e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ver modelos';
    }
  }

  /* ---------- notas ---------- */

  function openNotes() {
    const d = deck();
    $('notesList').innerHTML = d.slides.map((s, i) => `
      <div class="note-item">
        <h4>${i + 1}. ${Store.esc(s.title || ((LAYOUTS.find(l => l.id === s.layout) || {}).name || 'Diapositiva'))}</h4>
        <p>${Store.esc(s.notes || '(sin notas)')}</p>
      </div>`).join('');
    $('dlgNotes').showModal();
  }

  /* ---------- archivos ---------- */

  function openFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          Store.state.deck = Store.normalizeDeck(JSON.parse(fr.result));
          state.ui.selected = 0;
          Chat.reset();
          Store.save();
          Editor.refresh();
          Store.toast('Presentación abierta', 'ok');
        } catch (e) {
          Store.toast('Ese archivo no es una presentación válida.', 'err');
        }
      };
      fr.readAsText(f);
    };
    inp.click();
  }

  function newDeck() {
    if (!Editor.estaVacia() && !confirm('¿Empezar una presentación nueva? Se perderá la actual.')) return;
    Store.state.deck = Store.blankDeck();
    state.ui.selected = 0;
    state.ui.guia = true;
    Chat.reset();
    Store.save();
    Editor.refresh();
    App.paintSteps();
  }

  /** En ventanas estrechas el panel de diapositivas va por encima. */
  function togglePanel(force) {
    const p = $('panelRight');
    const on = force === undefined ? !p.classList.contains('open') : !!force;
    p.classList.toggle('open', on);
    const b = $('btnPanel');
    if (b) b.setAttribute('aria-expanded', String(on));
  }

  /* ---------- selector de temas ---------- */
  function buildThemes() {
    $('themeGrid').innerHTML = THEMES.map(t => `
      <button class="theme-chip${t.id === deck().theme ? ' on' : ''}" data-theme="${t.id}"
        title="${t.name}" aria-label="${t.name}" aria-pressed="${t.id === deck().theme}">
        <span style="display:block;width:100%;height:100%;background:${t.swatch}"></span>
        <span class="theme-name">${t.name}</span>
      </button>`).join('');
  }

  function setTheme(id) {
    deck().theme = id;
    document.querySelectorAll('.theme-chip').forEach(c => {
      const on = c.dataset.theme === id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', on);
    });
    Store.paintSaveState('pendiente');
    Store.save();
    Editor.refresh({ inspector: false });
    paintSteps();
  }

  /* ---------- eventos ---------- */

  function init() {
    Store.load();

    buildThemes();
    buildExamples();
    Editor.init();
    Present.init();
    Chat.init();
    refreshKeyHints();
    paintSteps();
    paintEmptyHint();
    Editor.refresh();

    window.addEventListener('resize', Store.debounce(() => {
      fit();
      if (Present.isOpen()) fitPresent();
    }, 120));

    // Barra superior
    $('btnGenerate').onclick = generate;
    $('btnNew').onclick = newDeck;
    $('btnOpen').onclick = openFile;
    $('btnSave').onclick = () => { Store.save(); Store.toast('Guardado en este navegador', 'ok'); };
    $('btnPptx').onclick = () => Exports.pptx();
    $('btnPdf').onclick = () => Exports.pdf();
    $('btnPresent').onclick = () => Present.start();
    $('btnHelp').onclick = () => $('dlgHelp').showModal();

    // Estado inicial: llevar al usuario directamente a donde tiene que actuar
    $('btnEmptyGo').onclick = () => { $('fTopic').focus(); $('fTopic').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    $('btnEmptyBlank').onclick = () => {
      if (!Editor.estaVacia()) newDeck();
      Editor.escribir();
    };
    $('btnEmptyOpen').onclick = openFile;

    // Ejemplos rápidos: rellenan el tema y lo dejan listo para generar
    $('examples').addEventListener('click', e => {
      const c = e.target.closest('[data-topic]');
      if (!c) return;
      $('fTopic').value = c.dataset.topic;
      $('fTopic').focus();
      paintSteps();
      paintEmptyHint();
    });

    $('fTopic').addEventListener('input', () => { paintSteps(); paintEmptyHint(); });

    // Ajustes
    $('btnSettings').onclick = openSettings;
    $('btnListModels').onclick = listModels;

    /* Comprobar clave: la pegamos y la verificamos al momento, en vez de
       descubrir tres minutos después, ya generando, que le sobraba un espacio. */
    $('btnCheckKey').onclick = async () => {
      const id = uiProvider;
      const salida = $('keyCheck');
      const boton = $('btnCheckKey');
      const k = $('fKey').value.replace(/\s+/g, '');
      if (k && k !== $('fKey').value) $('fKey').value = k;   // se limpia a la vista
      pendingKeys[id] = k;
      if (!k) {
        salida.className = 'key-check err';
        salida.textContent = 'Pega primero una clave.';
        return;
      }
      state.settings.keys[id] = k;
      boton.disabled = true;
      salida.className = 'key-check busy';
      salida.textContent = 'Comprobando…';
      const r = await Providers.checkKey(id);
      boton.disabled = false;
      salida.className = 'key-check ' + (r.ok ? 'ok' : 'err');
      salida.textContent = (r.ok ? '✓ ' : '✗ ') + r.texto;
    };

    $('fProvider').addEventListener('change', e => {
      pendingKeys[uiProvider] = $('fKey').value.replace(/\s+/g, '');
      uiProvider = e.target.value;
      $('keyCheck').textContent = '';
      $('keyCheck').className = 'key-check';
      paintProvider();
    });
    $('fProvider').addEventListener('change', e => {
      pendingKeys[uiProvider] = $('fKey').value.trim();
      uiProvider = e.target.value;
      paintProvider();
    });
    $('fKey').addEventListener('input', e => {
      // se guarda limpia para que un espacio pegado no acabe en la cabecera Authorization
      pendingKeys[uiProvider] = e.target.value.replace(/\s+/g, '');
    });
    $('extraKeysBody').addEventListener('input', e => {
      if (e.target.dataset && e.target.dataset.key) {
        pendingKeys[e.target.dataset.key] = e.target.value.replace(/\s+/g, '');
      }
    });
    $('fModel').addEventListener('change', () => {
      toggleCustom($('fModel'));
      $('modelHint').textContent = modelNote($('fModel'));
    });
    $('fImgModel').addEventListener('change', () => { toggleCustom($('fImgModel')); updateImageWarn(); });
    $('fImgProvider').addEventListener('change', e => {
      uiImgProvider = e.target.value;
      $('imgKeyCheck').textContent = '';
      $('imgKeyCheck').className = 'key-check';
      paintImgProvider();
    });
    $('fImgKey').addEventListener('input', e => {
      // un espacio pegado acabaría en la cabecera Authorization y daría 401 sin explicación:
      // se limpia al teclear, no al enviar
      const limpio = e.target.value.replace(/\s+/g, '');
      if (limpio !== e.target.value) e.target.value = limpio;
      pendingKeys[uiImgProvider] = limpio;
      updateImageWarn();
    });

    /* Comprobar la clave del proveedor de imágenes (cuando no coincide con el
       de texto): se verifica aquí sin tocar la clave del proveedor de texto. */
    $('btnCheckImgKey').onclick = async () => {
      const id = uiImgProvider;
      const salida = $('imgKeyCheck');
      const boton = $('btnCheckImgKey');
      const k = $('fImgKey').value.replace(/\s+/g, '');
      if (k && k !== $('fImgKey').value) $('fImgKey').value = k;
      pendingKeys[id] = k;
      if (!k) {
        salida.className = 'key-check err';
        salida.textContent = 'Pega primero el token.';
        return;
      }
      state.settings.keys[id] = k;
      boton.disabled = true;
      salida.className = 'key-check busy';
      salida.textContent = 'Comprobando…';
      const r = await Providers.checkKey(id);
      boton.disabled = false;
      salida.className = 'key-check ' + (r.ok ? 'ok' : 'err');
      salida.textContent = (r.ok ? '✓ ' : '✗ ') + r.texto;
      updateImageWarn();
    };
    $('btnListImgModels').onclick = listImgModels;
    $('dlgSettings').addEventListener('close', () => {
      const guardar = $('dlgSettings').returnValue === 'save';
      if (guardar) saveSettings();
      else {
        Object.keys(pendingKeys).forEach(k => delete pendingKeys[k]);
        uiProvider = state.settings.provider;
        uiImgProvider = Providers.imageProvider();
        paintProvider();
        paintImgProvider();
      }
    });

    // Herramientas del lienzo
    $('btnAdd').onclick = () => Editor.add('bullets');
    $('btnAddTop').onclick = () => Editor.add('bullets');
    $('btnAddFoot').onclick = () => Editor.add('bullets');
    $('btnGenImages').onclick = () => Images.all();
    $('btnNotes').onclick = openNotes;
    $('btnPanel').onclick = () => togglePanel();

    // Temas
    $('themeGrid').addEventListener('click', e => {
      const c = e.target.closest('.theme-chip');
      if (c) setTheme(c.dataset.theme);
    });

    // Atajos
    document.addEventListener('keydown', e => {
      if (Present.isOpen()) return;
      const typing = e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.key === 'F5') { e.preventDefault(); Present.start(); return; }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); Store.save(); Store.toast('Guardado', 'ok'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); Exports.pptx(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate(); }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); Chat.toggle(); }
      if (e.key === '?') { e.preventDefault(); $('dlgHelp').showModal(); return; }
      if (e.key === 'Escape') { togglePanel(false); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const btn = document.querySelector('#inspectorBody [data-act="del"]');
        if (btn) btn.click();
      }
      // ir de diapositiva en diapositiva sin ratón
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); Editor.go(1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); Editor.go(-1); }
      if (e.key === 'Home') { e.preventDefault(); Editor.goTo(0); }
      if (e.key === 'End') { e.preventDefault(); Editor.goTo(deck().slides.length - 1); }
    });

    window.addEventListener('beforeunload', e => {
      if (state.ui.dirty) { Store.save(); }
    });
  }

  return { init, deck, state, fit, fitPresent, form, openSettings, refreshKeyHints, setTheme, redoSlide, paintSteps, paintEmptyHint, togglePanel };
})();

document.addEventListener('DOMContentLoaded', () => {
  try {
    App.init();
  } catch (e) {
    document.body.innerHTML =
      '<pre style="padding:24px;color:#f2665a;font:13px monospace;white-space:pre-wrap">' +
      'Error al iniciar DeckAI:\n\n' + (e && e.stack ? e.stack : e) + '</pre>';
  }
});
