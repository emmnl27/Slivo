/* ============================================================
   DeckAI · estado, persistencia y utilidades
   ============================================================ */

const Store = (() => {
  const KEY = 'deckai.v1';

  /* Una clave vacía por proveedor */
  const blankKeys = () => {
    const k = {};
    CONFIG.providers.forEach(p => { k[p.id] = ''; });
    return k;
  };

  const state = {
    deck: null,
    chat: [],                    // conversación con el asistente
    settings: {
      provider: 'gemini',
      remember: false,
      autoRetry: true,          // si falla, probar otros modelos/proveedores
      cooperativo: true,        // repartir las diapositivas entre varios modelos
      keys: blankKeys(),
      models: Object.assign({}, CONFIG.defaultModel),
      imageProvider: CONFIG.image.provider,
      imageModel: CONFIG.image.model,
      imageModels: Object.assign({}, CONFIG.defaultImageModel),
      customThemes: []           // temas propios creados por el usuario
    },
    ui: {
      selected: 0,
      editing: true,
      dirty: false,
      guia: true                // mostrar la guía de inicio mientras no haya contenido
    }
  };

  /* ---------- utilidades ---------- */

  const uid = () => 's' + Math.random().toString(36).slice(2, 9);

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** Convierte **negrita**, *cursiva* y saltos de línea a HTML. */
  const md = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');

  const toast = (msg, kind) => {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 320);
    }, kind === 'err' ? 7000 : 3600);
  };

  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  /* ---------- IndexedDB (imágenes) ----------
     localStorage solo aguanta unos 5 MB y una presentación con ilustraciones lo
     supera enseguida. Los data-URL de las imágenes viven en IndexedDB (sin límite
     práctico) y en localStorage se guarda solo el texto; al cargar se vuelven a
     coser por el id de cada diapositiva. */

  const IMG_KEY = 'deck-images';
  let imgsReady = Promise.resolve(false);
  const IDB = { db: null };

  function idb() {
    if (IDB.db) return Promise.resolve(IDB.db);
    return new Promise((res, rej) => {
      if (!self.indexedDB) return rej(new Error('sin IndexedDB'));
      const req = indexedDB.open('deckai', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
      req.onsuccess = () => { IDB.db = req.result; res(IDB.db); };
      req.onerror = () => rej(req.error || new Error('IndexedDB no disponible'));
    });
  }

  function idbSet(key, val) {
    return idb().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res(true);
      tx.onerror = () => rej(tx.error);
    })).catch(() => false);
  }

  function idbGet(key) {
    return idb().then(db => new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    })).catch(() => null);
  }

  /* ---------- modelo ---------- */

  /* El modelo de IA no siempre respeta el formato: devuelve el contenido como
     texto con saltos de línea, con otro nombre de clave o como array de objetos.
     Estas funciones lo aceptan todo para que no se pierda contenido. */

  const ALIAS = {
    bullets: ['bullets', 'items', 'points', 'ideas', 'ideasClave', 'content', 'contents', 'list', 'lines', 'body', 'text', 'puntos'],
    columns: ['columns', 'cols', 'columnas', 'comparativa'],
    colHead: ['heading', 'title', 'name', 'label', 'cabecera', 'encabezado'],
    colItems: ['items', 'bullets', 'points', 'content', 'list', 'text', 'puntos'],
    stats: ['stats', 'data', 'kpis', 'datos', 'figures', 'cifras', 'metrics'],
    statValue: ['value', 'number', 'num', 'figure', 'v', 'cifra', 'dato', 'numero', 'porcentaje'],
    statLabel: ['label', 'text', 'description', 'name', 'title', 'descripcion', 'l'],
    steps: ['steps', 'timeline', 'phases', 'fases', 'process', 'pasos'],
    stepTitle: ['title', 'name', 'step', 'heading', 'nombre', 'titulo', 'paso'],
    stepText: ['text', 'description', 'desc', 'detail', 'body', 'detalle', 'descripcion'],
    tcols: ['tcols', 'headers', 'cabeceras', 'encabezados', 'columnas'],
    trows: ['trows', 'rows', 'filas', 'registros', 'cuerpo'],
    cards: ['cards', 'tarjetas', 'features', 'tarjeta'],
    cardHead: ['heading', 'title', 'name', 'label', 'titulo', 'cabecera'],
    cardText: ['text', 'description', 'desc', 'detail', 'body', 'texto', 'descripcion']
  };

  /** Primer valor no vacío entre los nombres alternativos de una clave. */
  function pick(o, keys) {
    if (!o || typeof o !== 'object') return undefined;
    for (const k of keys) {
      const v = o[k];
      if (v == null) continue;
      if (Array.isArray(v) ? v.length : String(v).trim()) return v;
    }
    return undefined;
  }

  /** Convierte cualquier forma de lista en un array de cadenas. */
  function toList(v, prof = 0) {
    if (v == null || prof > 3) return [];
    if (Array.isArray(v)) return v.reduce((acc, x) => acc.concat(toList(x, prof + 1)), []);
    if (typeof v === 'string') {
      return v.split(/\r?\n|[;\n]|(?:^\s*|[\s])[-•·–—]\s+/m)
        .map(s => s.replace(/^[-•·–—\s]+/, '').trim())
        .filter(Boolean);
    }
    if (typeof v === 'object') {
      return toList(pick(v, ['text', 'title', 'item', 'point', 'idea', 'label', 'value', 'name', 'description', 'content']), prof + 1);
    }
    const s = String(v).trim();
    return s ? [s] : [];
  }

  /** ¿Este layout necesita un cuerpo de contenido? */
  const CUERPO = {
    agenda: 'bullets', bullets: 'bullets', 'two-col': 'columns',
    image: 'bullets', stats: 'stats', bars: 'stats', timeline: 'steps', quote: 'quote',
    table: 'table', checklist: 'bullets', cards: 'cards'
  };

  /** Si el modelo devolvió el contenido con otro formato, se respeta el que trajo. */
  function ajustaLayout(out) {
    const clave = CUERPO[out.layout];
    if (!clave) return;
    const lleno = {
      bullets: out.bullets.length > 0,
      columns: out.columns.length > 0,
      stats: out.stats.length > 0,
      steps: out.steps.length > 0,
      table: (out.tcols.length + out.trows.length) > 0,
      cards: out.cards.length > 0,
      quote: !!out.quote
    };
    if (lleno[clave]) return;
    if (lleno.table) out.layout = 'table';
    else if (lleno.cards) out.layout = 'cards';
    else if (lleno.columns) out.layout = 'two-col';
    else if (lleno.stats) out.layout = 'stats';
    else if (lleno.steps) out.layout = 'timeline';
    else if (lleno.quote) out.layout = 'quote';
    else if (lleno.bullets) out.layout = 'bullets';
  }

  function blankSlide(layout = 'bullets') {
    return {
      id: uid(),
      layout,
      kicker: '',
      title: '',
      subtitle: '',
      bullets: [],
      columns: [],
      stats: [],
      steps: [],
      quote: '',
      quoteAuthor: '',
      images: [],          // data URLs, uno por hueco (1-4)
      imagePrompts: [],    // descripción del hueco correspondiente
      imageCredits: [],    // {source,author,license,licenseUrl,page} por hueco (fotos de internet)
      imgCount: 1,         // cuántos huecos muestra la diapositiva
      bulletIcons: [],     // icono {name,body,w,h} por viñeta
      agendaIcons: [],     // icono por bloque de la agenda
      notes: '',
      tcols: [],           // tabla: cabeceras de columna
      trows: [],           // tabla: filas (arrays de celdas)
      cards: []            // tarjetas: [{heading, text, icon}]
    };
  }

  function blankDeck() {
    return {
      id: uid(),
      title: 'Mi presentación',
      subtitle: '',
      author: '',
      date: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
      theme: 'aurora',
      slides: [blankSlide('cover')]
    };
  }

  /* ---------- imágenes por diapositiva ---------- */

  /** Data URLs de los huecos de una diapositiva (siempre array). */
  const slideImages = s => (s && Array.isArray(s.images)) ? s.images : [];
  /** Descripciones de cada hueco (siempre array). */
  const slidePrompts = s => (s && Array.isArray(s.imagePrompts)) ? s.imagePrompts : [];
  /** Créditos de las fotos traídas de internet (siempre array). */
  const imageCredits = s => (s && Array.isArray(s.imageCredits)) ? s.imageCredits : [];
  /** Iconos por viñeta / por bloque de la agenda (siempre array). */
  const bulletIcons = s => (s && Array.isArray(s.bulletIcons)) ? s.bulletIcons : [];
  const agendaIcons = s => (s && Array.isArray(s.agendaIcons)) ? s.agendaIcons : [];

  /** Un icono guardado: nombre de Iconify + cuerpo SVG listo para pintar. */
  function normIcon(x) {
    if (!x || typeof x !== 'object' || !x.body) return null;
    const w = Math.min(512, Math.max(1, parseInt(x.w, 10) || 24));
    const h = Math.min(512, Math.max(1, parseInt(x.h, 10) || 24));
    return { name: str(x.name).slice(0, 80), body: str(x.body).slice(0, 8000), w, h };
  }
  /** Conserva las posiciones (null donde no hay icono). */
  const normIcons = list => arr(list).map(normIcon);

  /** Cuántos huecos de imagen muestra la diapositiva (1-4). */
  function imgCount(s) {
    const n = parseInt(s && s.imgCount, 10);
    if (n >= 1 && n <= 4) return n;
    const usados = slideImages(s).filter(Boolean).length;
    return Math.max(1, Math.min(4, usados || 1));
  }

  /** Deja los arrays de imágenes/prompts con exactamente n huecos. */
  function fitSlots(s, n) {
    if (!s) return s;
    n = Math.max(1, Math.min(4, parseInt(n, 10) || 1));
    s.imgCount = n;
    if (!Array.isArray(s.images)) s.images = [];
    if (!Array.isArray(s.imagePrompts)) s.imagePrompts = [];
    s.images.length = Math.min(s.images.length, n);
    s.imagePrompts.length = Math.min(s.imagePrompts.length, n);
    while (s.images.length < n) s.images.push('');
    while (s.imagePrompts.length < n) s.imagePrompts.push('');
    return s;
  }

  /* ---------- temas (integrados + propios) ---------- */

  const THEME_VARS = ['--bg', '--fg', '--accent', '--accent-2', '--muted', '--rule', '--card', '--title-font', '--body-font'];

  /** Lista completa de temas: los integrados y los que ha creado el usuario. */
  const themes = () => THEMES.concat(state.settings.customThemes || []);

  const themeById = id => themes().find(t => t.id === id) || THEMES[0];

  /** Valida y normaliza un tema propio guardado. */
  function normTheme(t) {
    if (!t || typeof t !== 'object') return null;
    const css = {};
    THEME_VARS.forEach(k => {
      const v = t.css && t.css[k];
      if (typeof v === 'string' && v.trim()) css[k] = v.trim();
    });
    if (!css['--bg']) return null;
    const id = /^custom-/.test(str(t.id)) ? str(t.id) : 'custom-' + uid();
    return {
      id,
      name: str(t.name).trim().slice(0, 40) || 'Tema propio',
      solid: str(t.solid) || '#111111',
      swatch: str(t.swatch) || css['--bg'],
      serif: !!t.serif,
      custom: true,
      css
    };
  }

  /** Convierte un mapa de variables CSS en un atributo style inline. */
  const cssText = css => Object.keys(css || {})
    .filter(k => /^--/.test(k))
    .map(k => k + ':' + String(css[k]).replace(/"/g, "'"))
    .join(';');

  /** Normaliza cualquier objeto recibido (IA o archivo) al modelo interno. */
  function normalizeDeck(raw) {
    const d = blankDeck();
    if (!raw || typeof raw !== 'object') return d;

    d.title  = str(raw.title, d.title);
    d.subtitle = str(raw.subtitle);
    d.author = str(raw.author);
    d.date   = str(raw.date, d.date);
    d.theme  = themeById(raw.theme).id;
    d.id     = raw.id || d.id;

    if (Array.isArray(raw.slides) && raw.slides.length) {
      d.slides = raw.slides.map(normSlide);
    }
    return d;
  }

  function normSlide(s) {
    const out = blankSlide(s && LAYOUT_IDS.includes(s.layout) ? s.layout : 'bullets');
    if (!s || typeof s !== 'object') return out;

    out.id = s.id || out.id;
    ['kicker', 'title', 'subtitle', 'quote', 'quoteAuthor', 'notes']
      .forEach(k => { out[k] = str(s[k]); });

    // Imágenes: modelo nuevo (arrays) con migración del antiguo (image/imagePrompt).
    // Los data URL llevan ";" (;base64), así que no se pueden partir con toList.
    const crudas = Array.isArray(s.images) ? s.images : (typeof s.image === 'string' && s.image ? [s.image] : []);
    // Sin filter(Boolean): los huecos vacíos ocupan su posición y no deben desplazarse.
    out.images = crudas.map(str);
    const crudosP = Array.isArray(s.imagePrompts) ? s.imagePrompts
      : (s.imagePrompt != null ? [s.imagePrompt]
        : (s.image && typeof s.image === 'object' ? [s.image.prompt] : []));
    out.imagePrompts = crudosP.map(str);
    const nImg = parseInt(s.imgCount, 10);
    out.imgCount = (nImg >= 1 && nImg <= 4) ? nImg : Math.max(1, out.images.length);

    out.bullets = toList(pick(s, ALIAS.bullets)).map(str).filter(Boolean);
    out.columns = arr(pick(s, ALIAS.columns)).map(c => ({
      heading: str(pick(c, ALIAS.colHead)),
      items: toList(pick(c, ALIAS.colItems)).map(str).filter(Boolean)
    })).filter(c => c.heading || c.items.length);

    out.stats = arr(pick(s, ALIAS.stats)).map(x => ({
      value: str(pick(x, ALIAS.statValue) != null ? pick(x, ALIAS.statValue) : x),
      label: str(pick(x, ALIAS.statLabel)),
      icon: normIcon(x && x.icon)
    })).filter(x => x.value || x.label);

    out.steps = arr(pick(s, ALIAS.steps)).map(x => {
      const crudo = x && typeof x === 'object' ? null : str(x);
      return {
        title: str(pick(x, ALIAS.stepTitle) != null ? pick(x, ALIAS.stepTitle) : crudo),
        text: str(pick(x, ALIAS.stepText)),
        icon: normIcon(x && x.icon)
      };
    }).filter(x => x.title || x.text);

    out.tcols = toList(pick(s, ALIAS.tcols)).map(str).filter(Boolean).slice(0, 5);
    out.trows = arr(pick(s, ALIAS.trows))
      .map(r => (Array.isArray(r) ? r : toList(r)).map(str))
      .map(r => r.slice(0, 5))
      .filter(r => r.some(Boolean))
      .slice(0, 8);

    out.cards = arr(pick(s, ALIAS.cards)).map(x => {
      const crudo = x && typeof x === 'object' ? null : str(x);
      return {
        heading: str(pick(x, ALIAS.cardHead) != null ? pick(x, ALIAS.cardHead) : crudo),
        text: str(pick(x, ALIAS.cardText)),
        icon: normIcon(x && x.icon)
      };
    }).filter(x => x.heading || x.text).slice(0, 6);

    out.bulletIcons = normIcons(s.bulletIcons);
    out.agendaIcons = normIcons(s.agendaIcons);
    out.imageCredits = arr(s.imageCredits).map(c => (c && typeof c === 'object') ? {
      source: str(c.source).slice(0, 60),
      author: str(c.author).slice(0, 140),
      license: str(c.license).slice(0, 90),
      licenseUrl: str(c.licenseUrl).slice(0, 300),
      page: str(c.page).slice(0, 300)
    } : null);

    ajustaLayout(out);
    return out;
  }

  const str = v => (v == null ? '' : String(v));
  const arr = v => (Array.isArray(v) ? v : []);

  /* ---------- persistencia ---------- */

  /** Ajustes tal y como se guardan: las claves solo si el usuario lo pidió. */
  function settingsForDisk() {
    const keys = { ...state.settings.keys };
    if (!state.settings.remember) CONFIG.providers.forEach(p => { keys[p.id] = ''; });
    return { ...state.settings, keys };
  }

  function save() {
    try {
      // El texto va a localStorage (ligero) y las imágenes a IndexedDB (pesadas):
      // juntas superaban el cupo de ~5 MB en cuanto había unas pocas ilustraciones.
      const imgs = {};
      const slides = state.deck.slides.map(s => {
        const arr = Array.isArray(s.images) ? s.images : [];
        if (arr.some(Boolean)) imgs[s.id] = arr.slice();
        return Object.assign({}, s, { images: [] });
      });
      const disco = Object.assign({}, state.deck, { slides });
      localStorage.setItem(KEY, JSON.stringify({ deck: disco, chat: state.chat, settings: settingsForDisk() }));
      state.ui.dirty = false;
      paintSaveState('guardado');
      idbSet(IMG_KEY, imgs);          // asíncrono: si falla, el texto ya está a salvo
    } catch (e) {
      toast('No se pudo guardar (almacenamiento lleno). Prueba a borrar imágenes.', 'err');
    }
  }

  /** El punto de la barra superior: "Guardando…" mientras se escribe. */
  function paintSaveState(estado) {
    const el = document.getElementById('saveState');
    if (!el) return;
    el.dataset.state = estado;
    const txt = el.querySelector('span');
    if (txt) txt.textContent = estado === 'pendiente' ? 'Guardando…' : 'Guardado';
  }

  const saveSoon = debounce(save, 700);

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* ignorar */ }

    if (raw) {
      // los ajustes primero: la validación del tema del deck necesita los temas propios
      mergeSettings(raw.settings || {});
      state.deck = normalizeDeck(raw.deck);
      state.chat = Array.isArray(raw.chat)
        ? raw.chat.filter(m => m && (m.role === 'user' || m.role === 'bot') && typeof m.text === 'string').slice(-40)
        : [];
    } else {
      state.deck = blankDeck();
    }

    // Las imágenes se guardaron aparte en IndexedDB: se cosen aquí y, cuando
    // termina, la interfaz ya puede repintar. Mientras, el texto ya está listo.
    imgsReady = idbGet(IMG_KEY).then(imgs => {
      if (!imgs) return false;
      let hubo = false;
      state.deck.slides.forEach(s => {
        const guardadas = imgs[s.id];
        if (!Array.isArray(guardadas) || !guardadas.some(Boolean)) return;
        const cur = slideImages(s);
        for (let k = 0; k < guardadas.length; k++) {
          if (!cur[k] && guardadas[k]) { cur[k] = guardadas[k]; hubo = true; }
        }
        s.images = cur;
        s.imgCount = Math.max(imgCount(s), Math.min(4, guardadas.filter(Boolean).length));
      });
      return hubo;
    });
    return state;
  }

  /**
   * Deja un identificador de modelo de imagen en condiciones de usarse.
   * Cada familia llama distinto a sus modelos: OpenRouter y Hugging Face llevan
   * prefijo de organización ("meta/", "stabilityai/…") y una barra, mientras que
   * Google quiere el nombre pelado ("gemini-3.1-flash-image"). Si un id de una familia
   * acaba en el hueco de otra, Google responde "unexpected model name format",
   * así que aquí se recorta lo sobrante y se descarta lo que no encaja.
   */
  function limpiaModeloImagen(valor, proveedor) {
    let id = String(valor == null ? '' : valor).trim();
    if (!id || id === '__custom__') return '';
    id = id.replace(/^models\//i, '');
    if (proveedor === 'gemini') {
      id = id.replace(/^google\//i, '');
      // en Google solo existen los modelos de la familia… y solo si el nombre es válido
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) return '';
    }
    return id;
  }

  /** Mezcla los ajustes guardados, incluyendo la migración del formato antiguo. */
  function mergeSettings(s) {
    const old = s || {};
    // formato antiguo: una sola clave de Gemini
    if (old.key && !old.keys) {
      state.settings.keys.gemini = old.key;
    }
    if (old.textModel) state.settings.models.gemini = old.textModel;
    if (old.provider) state.settings.provider = old.provider;
    if (typeof old.remember === 'boolean') state.settings.remember = old.remember;
    if (typeof old.autoRetry === 'boolean') state.settings.autoRetry = old.autoRetry;
    if (typeof old.cooperativo === 'boolean') state.settings.cooperativo = old.cooperativo;
    if (Array.isArray(old.customThemes)) {
      state.settings.customThemes = old.customThemes.map(normTheme).filter(Boolean);
    }
    if (old.keys) CONFIG.providers.forEach(p => {
      if (typeof old.keys[p.id] === 'string') state.settings.keys[p.id] = old.keys[p.id];
    });
    if (old.models) CONFIG.providers.forEach(p => {
      if (old.models[p.id]) state.settings.models[p.id] = old.models[p.id];
    });
    if (old.imageProvider && CONFIG.providers.some(p => p.id === old.imageProvider && p.imagen)) {
      state.settings.imageProvider = old.imageProvider;
    }
    if (old.imageModels) CONFIG.providers.forEach(p => {
      if (p.imagen && typeof old.imageModels[p.id] === 'string') {
        const m = limpiaModeloImagen(old.imageModels[p.id], p.id);
        if (m) state.settings.imageModels[p.id] = m;
      }
    });
    // "imageModel" es el modelo suelto de los tiempos en que solo existían las imágenes
    // de Gemini. Solo se acepta si el proveedor de entonces era Gemini y el nombre es
    // de la familia Nano Banana: si no, ese valor era de otro proveedor (p. ej.
    // "meta/muse-image") y enviarlo a Google devolvía "unexpected model name format".
    if (old.imageModel && !old.imageProvider) {
      const m = limpiaModeloImagen(old.imageModel, 'gemini');
      if (m) state.settings.imageModels.gemini = m;
    }
    state.settings.imageModel = state.settings.imageModels[state.settings.imageProvider] ||
      CONFIG.defaultImageModel[state.settings.imageProvider];
    if (!state.settings.models[state.settings.provider]) {
      state.settings.models[state.settings.provider] = CONFIG.defaultModel[state.settings.provider] || '';
    }
  }

  function saveDeckFile() {
    const name = (state.deck.title || 'presentacion').replace(/[^\w\-\s]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
    downloadBlob(new Blob([JSON.stringify(state.deck, null, 2)], { type: 'application/json' }), name + '.json');
    toast('Guardado como ' + name + '.json', 'ok');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- acceso ---------- */

  return {
    state, load, save, saveSoon, saveDeckFile, downloadBlob, mergeSettings,
    blankDeck, blankSlide, normalizeDeck, normSlide,
    slideImages, slidePrompts, imageCredits, bulletIcons, agendaIcons, normIcon,
    imgCount, fitSlots,
    themes, themeById, normTheme, cssText,
    uid, esc, md, toast, debounce, paintSaveState,
    imagesReady: () => imgsReady
  };
})();
