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
      imageModels: Object.assign({}, CONFIG.defaultImageModel)
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
    stepText: ['text', 'description', 'desc', 'detail', 'body', 'detalle', 'descripcion']
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
    image: 'bullets', stats: 'stats', timeline: 'steps', quote: 'quote'
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
      quote: !!out.quote
    };
    if (lleno[clave]) return;
    if (lleno.columns) out.layout = 'two-col';
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
      image: '',
      imagePrompt: '',
      notes: ''
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

  /** Normaliza cualquier objeto recibido (IA o archivo) al modelo interno. */
  function normalizeDeck(raw) {
    const d = blankDeck();
    if (!raw || typeof raw !== 'object') return d;

    d.title  = str(raw.title, d.title);
    d.subtitle = str(raw.subtitle);
    d.author = str(raw.author);
    d.date   = str(raw.date, d.date);
    d.theme  = THEMES.some(t => t.id === raw.theme) ? raw.theme : 'aurora';
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
    ['kicker', 'title', 'subtitle', 'quote', 'quoteAuthor', 'image', 'imagePrompt', 'notes']
      .forEach(k => { out[k] = str(s[k]); });

    out.bullets = toList(pick(s, ALIAS.bullets)).map(str).filter(Boolean);
    out.columns = arr(pick(s, ALIAS.columns)).map(c => ({
      heading: str(pick(c, ALIAS.colHead)),
      items: toList(pick(c, ALIAS.colItems)).map(str).filter(Boolean)
    })).filter(c => c.heading || c.items.length);

    out.stats = arr(pick(s, ALIAS.stats)).map(x => ({
      value: str(pick(x, ALIAS.statValue) != null ? pick(x, ALIAS.statValue) : x),
      label: str(pick(x, ALIAS.statLabel))
    })).filter(x => x.value || x.label);

    out.steps = arr(pick(s, ALIAS.steps)).map(x => {
      const crudo = x && typeof x === 'object' ? null : str(x);
      return {
        title: str(pick(x, ALIAS.stepTitle) != null ? pick(x, ALIAS.stepTitle) : crudo),
        text: str(pick(x, ALIAS.stepText))
      };
    }).filter(x => x.title || x.text);

    // El modelo de IA puede mandar "imagePrompt" dentro de un objeto
    if (!out.image && s.image && typeof s.image === 'object') {
      out.imagePrompt = str(s.image.prompt) || out.imagePrompt;
    }

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
      localStorage.setItem(KEY, JSON.stringify({ deck: state.deck, chat: state.chat, settings: settingsForDisk() }));
      state.ui.dirty = false;
      paintSaveState('guardado');
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
      state.deck = normalizeDeck(raw.deck);
      state.chat = Array.isArray(raw.chat)
        ? raw.chat.filter(m => m && (m.role === 'user' || m.role === 'bot') && typeof m.text === 'string').slice(-40)
        : [];
      mergeSettings(raw.settings || {});
    } else {
      state.deck = blankDeck();
    }
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
    uid, esc, md, toast, debounce, paintSaveState
  };
})();
