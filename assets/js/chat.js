/* ============================================================
   DeckAI · asistente conversacional
   Pides cambios en lenguaje natural ("ponla en dos columnas",
   "añade una diapositiva de conclusiones", "cambia el tema a
   corporativo") y la IA los aplica sobre la presentación.
   Todo lo que hace se puede deshacer.
   ============================================================ */

const Chat = (() => {
  const $ = id => document.getElementById(id);
  const { esc, md, toast, uid } = Store;

  const MAX_MENSAJES = 40;     // mensajes guardados en el navegador
  const MAX_PILOTOS = 10;      // instantáneas para deshacer
  const MAX_VUELTOS = 6;       // turnos de contexto que se le envían al modelo
  const MAX_IMAGENES_IA = 3; // imágenes generadas por IA en una sola respuesta (tardan)
  const TIEMPO_IA = 150000;  // presupuesto total de una respuesta del asistente

  let instantaneas = [];       // [{ id, deck, selected }]
  let ocupado = false;
  let tInicio = 0;             // cuándo empezó la petición en curso
  let tTick = null;            // temporizador que refresca "Pensando… (Ns)"

  const hilo = () => (Store.state.chat || (Store.state.chat = []));

  /* ---------- utilidades ---------- */

  const corte = (t, n) => {
    const s = String(t == null ? '' : t);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };

  const nSlides = () => App.deck().slides.length;
  const sel = () => Store.state.ui.selected;

  /** Número de diapositiva 1-based, con la opción de "la actual". */
  function apunta(n) {
    if (n == null || n === 'actual' || n === 'esta' || n === 'seleccionada') return sel();
    const i = parseInt(n, 10) - 1;
    if (isNaN(i)) return -1;
    if (/^(last|ultima|última|final)$/i.test(String(n))) return nSlides() - 1;
    return i;
  }

  /** A qué diapositivas apunta una acción: "slide", "slides":[...] o "all":true. */
  function objetivos(a, d) {
    if (a.all === true || a.all === 'true' || a.slide === 'all') return d.slides.map((_, i) => i);
    if (Array.isArray(a.slides)) {
      return a.slides.map(apunta).filter(i => i >= 0 && d.slides[i]);
    }
    const i = apunta(a.slide);
    return (i >= 0 && d.slides[i]) ? [i] : [];
  }

  /* ---------- qué pide el usuario: foto de internet o imagen generada ---------- */

  const R_FOTOS = /\b(foto|fotos|imagen|imagenes|imágenes|web|internet|online|wikimedia|openverse|commons|banco de im[aá]genes)\b/i;
  const R_GENERA = /\b(genera\w*|generado|generar|ilustra\w*|ilustraci[óo]n|dibuja\w*|diseñ\w*|creativ\w*|logo|cartel|con ia|hecho con ia|inteligencia artificial)\b/i;

  /**
   * ¿El usuario pide fotos que ya existen en internet? Es la red de seguridad:
   * si pide imágenes sin pedir que se generen, y el modelo contesta con
   * set_image (que tarda minutos y a veces se queda colgado), lo cambiamos por
   * web_image, que es inmediato y no necesita clave.
   */
  function pideFotosWeb(texto) {
    const t = String(texto || '');
    if (R_GENERA.test(t)) return false;
    return R_FOTOS.test(t);
  }

  /**
   * Ajusta lo que devuelve el modelo a lo que el usuario pidió de verdad: si se
   * piden fotos de internet y el modelo contestar con set_image (que tarda
   * minutos y a veces no termina), lo pasamos a web_image, que es inmediato.
   */
  function adaptaAcciones(lista, web) {
    if (!Array.isArray(lista)) return [];
    return lista.map(a => {
      if (!a || typeof a !== 'object') return a;
      const pideWeb = web || a.source === 'web';
      if (a.op === 'web_image') return Object.assign({}, a, { source: 'web' });
      if (a.op === 'set_image' && pideWeb) {
        return Object.assign({}, a, { op: 'web_image', query: a.query || a.prompt, source: 'web' });
      }
      return a;
    });
  }

  /* ---------- contexto que se le envía al modelo ---------- */

  function resumenSlide(s, i) {
    const o = { n: i + 1, layout: s.layout };
    ['kicker', 'title', 'subtitle', 'quote', 'quoteAuthor', 'notes']
      .forEach(k => { if (s[k]) o[k] = corte(s[k], 220); });
    const proms = Store.slidePrompts(s).filter(Boolean);
    if (proms.length) o.imagePrompts = proms.map(x => corte(x, 220));
    if (s.bullets.length) o.bullets = s.bullets.map(x => corte(x, 160));
    if (s.columns.length) {
      o.columns = s.columns.map(c => ({
        heading: corte(c.heading, 70),
        items: (c.items || []).map(x => corte(x, 140))
      }));
    }
    if (s.stats.length) o.stats = s.stats.map(x => ({ value: corte(x.value, 24), label: corte(x.label, 90) }));
    if (s.steps.length) o.steps = s.steps.map(x => ({ title: corte(x.title, 70), text: corte(x.text, 160) }));
    const imgs = Store.slideImages(s).filter(Boolean).length;
    if (imgs) o.imagenes_puestas = imgs;
    return o;
  }

  function contexto() {
    const d = App.deck();
    const lineas = [
      'PRESENTACIÓN ACTUAL',
      `titulo: ${JSON.stringify(corte(d.title, 160))}`,
      `subtitulo: ${JSON.stringify(corte(d.subtitle, 160))}`,
      `autor: ${JSON.stringify(corte(d.author, 80))} · fecha: ${JSON.stringify(corte(d.date, 60))}`,
      `plantilla: ${d.theme} · diapositivas: ${d.slides.length}`,
      `diapositiva_seleccionada: ${sel() + 1}`,
      'diapositivas:',
      d.slides.map((s, i) => JSON.stringify(resumenSlide(s, i))).join('\n')
    ];
    return lineas.join('\n');
  }

  const SISTEMA = () => [
    'Eres el editor de una presentación de diapositivas. Recibes el contenido actual de la',
    'presentación y lo que el usuario te pide, y respondes SIEMPRE con un único objeto JSON válido,',
    'sin texto antes ni después:',
    '{"reply":"qué has hecho, en 1-3 frases y en el idioma del usuario","actions":[ ... ]}',
    '',
    'ACCIONES (usa solo estas, y solo si hacen falta):',
    '1. {"op":"set_slide","slide":3,"fields":{"title":"...","bullets":["...","..."]}} → cambia campos de la diapositiva 3',
    '2. {"op":"add_slide","after":3,"slide":{"layout":"bullets","title":"...","bullets":["..."]}} → añade detrás de la 3 (sin "after" va al final)',
    '3. {"op":"delete_slide","slide":5}',
    '4. {"op":"move_slide","slide":7,"to":2}',
    '5. {"op":"duplicate_slide","slide":2}',
    '6. {"op":"set_theme","theme":"corporate"}',
    '7. {"op":"set_image","slide":2,"prompt":"descripción de la foto en inglés","slot":0} → GENERA la imagen con IA. "slot" es opcional: rellena el hueco 0-3 de una galería',
    '8. {"op":"web_image","slide":2,"query":"cohete despegando","slot":0} → busca una FOTO REAL ya existente en internet (Wikimedia Commons u Openverse, gratis y sin clave) y la pone en el hueco. Admite "slide":2, "slides":[2,3,4] o "all":true para todas las diapositivas',
    '9. {"op":"remove_image","slide":2,"slot":0}',
    '10. {"op":"set_deck","fields":{"title":"...","subtitle":"...","author":"...","date":"..."}}',
    '11. {"op":"find_replace","find":"IA","replace":"inteligencia artificial"}',
    '',
    'ELEGIR ENTRE UNA Y OTRA IMAGEN:',
    '- Si el usuario pide fotos reales, "de internet", "de la web", "de Wikimedia", "de un banco de imágenes"',
    '  o simplemente "una foto de X" → usa web_image (es instantáneo y no necesita clave).',
    '- Si pide una imagen generada, ilustrada, dibujada, un logo o "con IA" → usa set_image (tarda más).',
    '- Para varias diapositivas de golpe, mejor una sola acción web_image con "all":true o "slides":[...],',
    '  que muchas acciones set_image seguidas.',
    '',
    'LAYOUTS: cover (portada) · section (separador) · agenda (índice) · bullets (viñetas) ·',
    'two-col (dos columnas) · image (imagen + texto) · image-full (imagen a sangre) ·',
    'gallery (2-4 imágenes en rejilla) · stats (datos) · bars (gráfico de barras) ·',
    'table (tabla) · checklist (verificación) · cards (tarjetas) · timeline (proceso) · quote (cita) · closing (cierre).',
    '',
    'CAMPOS DE UNA DIAPOSITIVA:',
    '- layout: uno de los de arriba.',
    '- texto corto: kicker (etiqueta), title, subtitle, notes (notas del orador), imagePrompt / imagePrompts (lista).',
    '- cover, section, closing: necesitan un "subtitle" con una frase.',
    '- agenda, bullets, image, checklist: "bullets": ["idea 1","idea 2","idea 3"] (de 3 a 6, cortas).',
    '- two-col: "columns": [{"heading":"A","items":["...","..."]},{"heading":"B","items":["..."]}] (2 o 3 columnas).',
    '- stats: "stats": [{"value":"42%","label":"qué mide"}] (de 2 a 4).',
    '- bars: "stats" igual que stats pero con cifras comparables (de 3 a 5).',
    '- table: "tcols": ["Año","Ventas"] y "trows": [["2024","1M"],["2025","2M"]].',
    '- cards: "cards": [{"heading":"Ventaja","text":"por qué importa"}] (de 2 a 4).',
    '- timeline: "steps": [{"title":"Paso 1","text":"qué ocurre"}] (de 3 a 5).',
    '- quote: "quote" (la frase) y "quoteAuthor".',
    '',
    'REGLAS:',
    '- Los números de diapositiva son los del contexto. Si el usuario dice "esta", "aquella" o "la actual",',
    '  usa la que aparece como "diapositiva_seleccionada".',
    '- Manda solo los campos que cambian; no reescribas lo que ya está bien.',
    '- Si cambias el layout, manda también su contenido: nunca dejes una diapositiva vacía.',
    '- No elimines diapositivas, no cambies el orden ni la plantilla si no te lo pide expresamente.',
    '- Textos breves, sin HTML ni listas anidadas. Puedes usar **negrita**.',
    '- Si el usuario pregunta o Charlea sin pedir cambios, contéstalo en "reply" y pon "actions": [].',
    '- Si una petición es ambigua pero se puede resolver con sentido común, hazlo y explica en "reply" qué',
    '  has interpretado.',
    '- Varias peticiones en un mensaje → varias acciones, en el orden en que deben aplicarse.'
  ].join('\n');

  function historial() {
    const h = hilo().filter(m => m.role !== 'estado').slice(-MAX_VUELTOS * 2);
    if (!h.length) return '(primera mensaje)';
    return h.map(m => (m.role === 'user' ? 'usuario' : 'asistente') + ': ' + m.text).join('\n');
  }

  /* ---------- aplicar los cambios ---------- */

  const TEXTO = ['kicker', 'title', 'subtitle', 'quote', 'quoteAuthor', 'notes', 'imagePrompt'];
  const LISTAS = ['bullets', 'columns', 'stats', 'steps', 'tcols', 'trows', 'cards'];

  /** Campos admitidos en "fields" de una diapositiva. */
  function camposSanos(fields) {
    const out = {};
    if (!fields || typeof fields !== 'object') return out;
    TEXTO.forEach(k => { if (fields[k] != null) out[k] = corte(String(fields[k]), 600); });
    LISTAS.forEach(k => { if (fields[k] != null) out[k] = fields[k]; });
    if (Array.isArray(fields.imagePrompts)) {
      out.imagePrompts = fields.imagePrompts.slice(0, 4).map(x => corte(String(x), 600));
    }
    if (fields.layout && LAYOUT_IDS.includes(fields.layout)) out.layout = fields.layout;
    return out;
  }

  const CUERPO = {
    agenda: 'bullets', bullets: 'bullets', image: 'bullets', checklist: 'bullets', 'two-col': 'columns',
    stats: 'stats', bars: 'stats', timeline: 'steps', quote: 'quote', table: 'trows', cards: 'cards'
  };

  /** ¿Le falta el cuerpo que pide el layout? */
  function cuerpoVacio(s) {
    const c = CUERPO[s.layout];
    if (!c) return false;
    if (c === 'quote') return !String(s.quote || '').trim();
    return !(s[c] && s[c].length);
  }

  /** Rellena lo mínimo para que la diapositiva no se vea vacía. */
  function rellena(s) {
    switch (s.layout) {
      case 'two-col':
        s.columns = [{ heading: 'A', items: ['', '', ''] }, { heading: 'B', items: ['', '', ''] }];
        break;
      case 'stats':
      case 'bars':
        s.stats = [{ value: '00%', label: 'Indicador' }, { value: '00', label: 'Indicador' }, { value: '00%', label: 'Indicador' }];
        break;
      case 'table':
        s.tcols = ['Año', 'Dato'];
        s.trows = [['2024', '…'], ['2025', '…']];
        break;
      case 'cards':
        s.cards = [{ heading: 'Ventaja', text: 'Por qué importa' }, { heading: 'Ventaja', text: 'Por qué importa' }];
        break;
      case 'timeline':
        s.steps = [{ title: 'Paso 1', text: '' }, { title: 'Paso 2', text: '' }, { title: 'Paso 3', text: '' }];
        break;
      case 'quote':
        if (!s.quote) s.quote = 'Cita memorable';
        break;
      case 'cover': case 'section': case 'closing':
        if (!s.subtitle) s.subtitle = 'Una frase de apoyo';
        break;
      case 'image-full': case 'gallery': {
        const pr = Store.slidePrompts(s);
        if (!pr.some(Boolean) && s.title) { pr[0] = s.title; s.imagePrompts = pr; }
        break;
      }
      default:
        if (CUERPO[s.layout] && !s.bullets.length) s.bullets = ['Punto clave', 'Segunda idea', 'Tercera idea'];
    }
    return s;
  }

  /** Contenido que pertenece a cada layout (lo demás se descarta al cambiar). */
  const PERTENECE = {
    cover: [], section: [], closing: [], 'image-full': [], gallery: [], quote: [],
    agenda: ['bullets'], bullets: ['bullets'], image: ['bullets'], checklist: ['bullets'],
    'two-col': ['columns'], stats: ['stats'], bars: ['stats'], timeline: ['steps'],
    table: ['tcols', 'trows'], cards: ['cards']
  };

  /** Aplica campos a una diapositiva conservando su identidad y su imagen. */
  function fusiona(slide, fields) {
    const limpio = camposSanos(fields);
    const base = Object.assign({}, slide, limpio);

    // si cambia el layout, el contenido del anterior estorbaría (y la IA lo vería)
    if (limpio.layout && limpio.layout !== slide.layout) {
      const vale = PERTENECE[limpio.layout] || [];
      LISTAS.forEach(k => { if (!vale.includes(k)) delete base[k]; });
    }

    const norm = Store.normalizeDeck({ slides: [base] }).slides[0];
    norm.id = slide.id;
    norm.images = slide.images;               // las imágenes solo cambian con set_image / remove_image
    norm.imgCount = Store.imgCount(slide);
    if (cuerpoVacio(norm)) rellena(norm);
    return norm;
  }

  function sustituye(slide, find, re) {
    let n = 0;
    const sub = v => {
      if (typeof v !== 'string' || !v.includes(find)) return v;
      n++;
      return v.split(find).join(re);
    };
    TEXTO.forEach(k => { slide[k] = sub(slide[k]); });
    if (Array.isArray(slide.imagePrompts)) slide.imagePrompts = slide.imagePrompts.map(sub);
    if (slide.bullets) slide.bullets = slide.bullets.map(sub);
    if (slide.columns) slide.columns.forEach(c => { c.heading = sub(c.heading); c.items = (c.items || []).map(sub); });
    if (slide.stats) slide.stats.forEach(s => { s.value = sub(s.value); s.label = sub(s.label); });
    if (slide.steps) slide.steps.forEach(s => { s.title = sub(s.title); s.text = sub(s.text); });
    return n;
  }

  /**
   * Ejecuta las acciones del modelo. Devuelve las etiquetas de lo que cambió
   * y un aviso si alguna no se pudo aplicar. `limite` es un plazo (ms) para
   * que una tanda de imágenes no se quede pensando indefinidamente.
   */
  async function aplicar(actions, limite) {
    const lista = Array.isArray(actions) ? actions : [];
    const etiquetas = [];
    const avisos = [];
    const d = App.deck();
    let generadas = 0;                 // imágenes de IA ya pedidas en esta tanda
    let parados = false;

    for (const a of lista) {
      if (!a || typeof a !== 'object' || !a.op) continue;
      if (parados) break;
      if (limite && Date.now() > limite) {
        parados = true;
        avisos.push('Me he pasado de tiempo: he aplicado solo una parte. Dime "continúa" para seguir con el resto.');
      }
      try {
        switch (a.op) {
          case 'set_slide': {
            const i = apunta(a.slide);
            if (i < 0 || !d.slides[i]) { avisos.push('No existe la diapositiva ' + a.slide); break; }
            d.slides[i] = fusiona(d.slides[i], a.fields);
            sel() !== i && (Store.state.ui.selected = i);
            const n = Object.keys(camposSanos(a.fields)).length;
            etiquetas.push('Diapositiva ' + (i + 1) + (n ? ' · ' + n + ' campos' : ''));
            break;
          }
          case 'add_slide': {
            if (d.slides.length >= CONFIG.maxSlides) { avisos.push('La presentación ya tiene el máximo de diapositivas'); break; }
            const nueva = Store.normalizeDeck({ slides: [a.slide || {}] }).slides[0];
            rellena(nueva);
            const despues = a.after == null ? d.slides.length : apunta(a.after) + 1;
            const pos = Math.max(0, Math.min(despues, d.slides.length));
            d.slides.splice(pos, 0, nueva);
            Store.state.ui.selected = pos;
            etiquetas.push('Nueva diapositiva ' + (pos + 1));
            break;
          }
          case 'delete_slide': {
            const i = apunta(a.slide);
            if (i < 0 || !d.slides[i]) { avisos.push('No existe la diapositiva ' + a.slide); break; }
            if (d.slides.length <= 1) { avisos.push('La presentación necesita al menos una diapositiva'); break; }
            d.slides.splice(i, 1);
            Store.state.ui.selected = Math.max(0, Math.min(i, d.slides.length - 1));
            etiquetas.push('Eliminada la ' + (i + 1));
            break;
          }
          case 'move_slide': {
            const i = apunta(a.slide);
            const j = apunta(a.to);
            if (i < 0 || !d.slides[i] || j < 0 || j >= d.slides.length || i === j) { avisos.push('No se puede mover ahí'); break; }
            d.slides.splice(j, 0, d.slides.splice(i, 1)[0]);
            Store.state.ui.selected = j;
            etiquetas.push('Diapositiva ' + (i + 1) + ' → ' + (j + 1));
            break;
          }
          case 'duplicate_slide': {
            if (d.slides.length >= CONFIG.maxSlides) { avisos.push('La presentación ya tiene el máximo de diapositivas'); break; }
            const i = apunta(a.slide);
            if (i < 0 || !d.slides[i]) { avisos.push('No existe la diapositiva ' + a.slide); break; }
            const copia = Store.normalizeDeck({ slides: [d.slides[i]] }).slides[0];
            copia.id = uid();
            d.slides.splice(i + 1, 0, copia);
            Store.state.ui.selected = i + 1;
            etiquetas.push('Duplicada la ' + (i + 1));
            break;
          }
          case 'set_theme': {
            const t = Store.themes().find(x => x.id === a.theme);
            if (!t) { avisos.push('Plantilla desconocida: ' + a.theme); break; }
            d.theme = t.id;
            App.setTheme(t.id);
            etiquetas.push('Plantilla ' + t.name);
            break;
          }
          case 'set_deck': {
            const f = a.fields || {};
            ['title', 'subtitle', 'author', 'date'].forEach(k => {
              if (f[k] != null) d[k] = corte(String(f[k]), 300);
            });
            etiquetas.push('Datos de la presentación');
            break;
          }
          case 'web_image': {
            const idxs = objetivos(a, d);
            if (!idxs.length) { avisos.push('No existe esa diapositiva'); break; }
            const q = corte(String(a.query || a.prompt || ''), 200).trim();
            if (!q) { avisos.push('Falta saber qué foto buscar'); break; }
            let lista;
            try {
              lista = await Web.buscar(q, { n: 24 });
            } catch (e) {
              avisos.push('No pude buscar fotos: ' + e.message);
              break;
            }
            if (!lista.length) { avisos.push('No hay fotos de «' + q + '» en internet'); break; }
            let puestas = 0;
            for (let k = 0; k < idxs.length; k++) {
              const i = idxs[k];
              const slot = a.slot != null ? (parseInt(a.slot, 10) || 0) : 0;
              const res = idxs.length > 1 ? lista[k % lista.length] : Web.mejor(lista);
              try {
                await Web.usar(d.slides[i], slot, res);
                puestas++;
                etiquetas.push('Foto de internet (' + res.source + ') · ' + (Store.imgCount(d.slides[i]) > 1
                  ? 'hueco ' + (slot + 1) + ' de la ' + (i + 1)
                  : 'diapositiva ' + (i + 1)));
              } catch (e) {
                avisos.push('No se pudo descargar la foto de la ' + (i + 1) + ': ' + e.message);
              }
            }
            break;
          }
          case 'set_image': {
            if (generadas >= MAX_IMAGENES_IA) {
              avisos.push('He generado ' + MAX_IMAGENES_IA + ' imágenes de una vez (cada una tarda); dime "sigue" para las demás.');
              break;
            }
            const i = apunta(a.slide);
            const s = d.slides[i];
            const slot = a.slot != null ? (parseInt(a.slot, 10) || 0) : 0;
            Store.fitSlots(s, Math.max(Store.imgCount(s), slot + 1));
            if (a.prompt) {
              const pr = Store.slidePrompts(s);
              pr[slot] = corte(String(a.prompt), 400);
              s.imagePrompts = pr;
            }
            if (!Providers.imageReady()) {
              etiquetas.push('Descripción de imagen en la ' + (i + 1) + ' (falta una clave de Gemini, OpenRouter, Hugging Face o AI Horde)');
              break;
            }
            generadas++;
            const arr = Store.slideImages(s);
            arr[slot] = await Images.shrink(await Providers.image(Prompt.image(s, d, slot)));
            s.images = arr;
            if (!Images.CON_IMAGEN.includes(s.layout)) Images.aseguraVisible(s);
            etiquetas.push('Imagen en la ' + (i + 1) + (Store.imgCount(s) > 1 ? ' (hueco ' + (slot + 1) + ')' : ''));
            break;
          }
          case 'remove_image': {
            const i = apunta(a.slide);
            if (i < 0 || !d.slides[i]) { avisos.push('No existe la diapositiva ' + a.slide); break; }
            const s = d.slides[i];
            const slot = a.slot != null ? (parseInt(a.slot, 10) || 0) : 0;
            const arr = Store.slideImages(s);
            arr[slot] = '';
            s.images = arr;
            etiquetas.push('Quitada la imagen de la ' + (i + 1) + (Store.imgCount(s) > 1 ? ' (hueco ' + (slot + 1) + ')' : ''));
            break;
          }
          case 'find_replace': {
            if (!a.find) { avisos.push('Falta el texto a buscar'); break; }
            const re = a.replace == null ? '' : String(a.replace);
            let n = 0;
            ['title', 'subtitle', 'author', 'date'].forEach(k => {
              if (typeof d[k] === 'string' && d[k].includes(a.find)) { d[k] = d[k].split(a.find).join(re); n++; }
            });
            d.slides.forEach(s => { n += sustituye(s, a.find, re); });
            etiquetas.push(n ? (n + ' texto' + (n === 1 ? '' : 's') + ' cambiado' + (n === 1 ? '' : 's')) : 'No había ese texto');
            break;
          }
          default:
            avisos.push('Acción no reconocida: ' + a.op);
        }
      } catch (e) {
        avisos.push('No se pudo aplicar ' + a.op + ': ' + e.message);
      }
    }

    return { etiquetas, avisos, cambios: etiquetas.length };
  }

  /* ---------- deshacer ---------- */

  function instantanea(id) {
    instantaneas.push({ id, deck: JSON.parse(JSON.stringify(App.deck())), selected: sel() });
    while (instantaneas.length > MAX_PILOTOS) instantaneas.shift();
    paintUndo();
  }

  function undo(id) {
    const k = id ? instantaneas.findIndex(x => x.id === id) : instantaneas.length - 1;
    if (k < 0) { toast('No queda nada que deshacer.', 'err'); return; }
    const inst = instantaneas[k];
    Store.state.deck = inst.deck;
    Store.state.ui.selected = Math.max(0, Math.min(inst.selected, inst.deck.slides.length - 1));
    instantaneas.length = k;
    Store.save();
    Editor.refresh();
    paintUndo();
    toast('Cambios deshechos.', 'ok');
  }

  function paintUndo() {
    const b = $('chatUndo');
    if (b) b.disabled = !instantaneas.length;
  }

  /* ---------- interfaz ---------- */

  function abierto() { return !$('chat').hidden; }

  function toggle(force) {
    const c = $('chat');
    c.hidden = force == null ? !c.hidden : !force;
    document.body.classList.toggle('chat-open', !c.hidden);
    $('btnChat').classList.toggle('on', !c.hidden);
    if (!c.hidden) { App.togglePanel(false); pintar(); $('chatInput').focus(); }
    App.fit();
  }

  const SUGERENCIAS = [
    'Resume la diapositiva actual en 3 viñetas',
    'Añade una diapositiva final de conclusiones con 4 puntos',
    'Pon la diapositiva 2 en dos columnas',
    'Convierte la 3 en datos clave con 3 cifras',
    'Cambia la plantilla a corporativo',
    'Pon una imagen de un aula con alumnado'
  ];

  function pintaSugerencias() {
    $('chatSugs').innerHTML = SUGERENCIAS
      .map(s => `<button class="chat-sug" type="button">${esc(s)}</button>`).join('');
  }

  function burbuja(m) {
    const chips = (m.cambios || []).map(c => `<span class="chat-chip">${esc(c)}</span>`).join('');
    const deshacer = m.undo
      ? `<button class="chat-undo" data-undo="${esc(m.undo)}" title="Deshacer estos cambios">↩ deshacer</button>`
      : '';
    const cuerpo = m.role === 'user'
      ? `<div class="chat-text">${esc(m.text)}</div>`
      : `<div class="chat-text">${md(m.text || '')}</div>` +
        (chips ? `<div class="chat-chips">${chips}</div>` : '') +
        (m.avisos && m.avisos.length
          ? `<div class="chat-chips">${m.avisos.map(a => `<span class="chat-chip warn">${esc(a)}</span>`).join('')}</div>`
          : '') +
        deshacer;
    return `<div class="chat-msg ${m.role}">${cuerpo}</div>`;
  }

  /** La línea de abajo dice con qué diapositiva está trabajando la IA. */
  function refreshHint() {
    const h = $('chatHint');
    if (!h) return;
    const seg = ocupado && tInicio ? Math.round((Date.now() - tInicio) / 1000) : 0;
    h.textContent = ocupado
      ? 'Pensando…' + (seg ? ' (' + seg + ' s)' : '')
      : (Providers.chain().length
        ? `Viendo la diapositiva ${sel() + 1} de ${nSlides()} · ${Providers.current()}`
        : 'Sin clave de IA: los cambios no se aplicarán hasta que añadas una en Ajustes.');
  }

  function pintar() {
    const h = hilo();
    const log = $('chatLog');
    if (!h.length) {
      log.innerHTML = '<div class="chat-empty">' +
        '<p>Pide cambios con tus palabras y los aplico sobre la presentación.</p>' +
        '<p class="hint">Ejemplos: «quítale la última viñeta», «pásala a dos columnas», «añade una cita», ' +
        '«haz la portada más llamativa», «borra la 7».</p></div>';
    } else {
      log.innerHTML = h.map(burbuja).join('');
    }
    pintaSugerencias();
    refreshHint();
    const bc = $('chatCancel');
    if (bc) bc.hidden = !ocupado;
    log.scrollTop = log.scrollHeight;
  }

  function anota(m) {
    const h = hilo();
    h.push(m);
    while (h.length > MAX_MENSAJES) h.shift();
    pintar();
    Store.saveSoon();
  }

  function reset() {
    Store.state.chat = [];
    instantaneas = [];
    Store.save();
    pintar();
    paintUndo();
  }

  /* ---------- enviar ---------- */

  async function enviar() {
    if (ocupado) return;
    const inp = $('chatInput');
    const texto = inp.value.trim();
    if (!texto) return;

    inp.value = '';
    if (!Providers.chain().length) {
      anota({ role: 'bot', text: 'No hay ninguna clave de IA configurada. Abre Ajustes, pega una clave y vuelve a intentarlo.' });
      App.openSettings();
      return;
    }

    const idioma = (LANGUAGES[(App.form() || {}).language] || 'español');
    // el historial se toma antes de guardar este mensaje: si no, la peticion llega dos veces
    const previo = historial();

    anota({ role: 'user', text: texto });
    ocupado = true;
    nuevaOperacionIA();               // el botón Cancelar aborta la consulta en vuelo
    tInicio = Date.now();
    clearInterval(tTick);
    tTick = setInterval(refreshHint, 1000);
    $('chatSend').disabled = true;
    pintar();

    const user = [
      contexto(),
      '',
      'CONVERSACIÓN',
      previo,
      '',
      'PETICIÓN DEL USUARIO (' + idioma + ')',
      texto,
      '',
      'Responde con el JSON que se ha descrito.'
    ].join('\n');

    /* Red de seguridad extra: askJson ya acota su tiempo, pero si algo quedara
       colgado, este tope libera el asistente y le dice al usuario qué pasó.
       El plazo cubre también aplicar(): así una tanda de imágenes no puede
       dejar al asistente "pensando" media eternidad. */
    let topeId;
    const tope = new Promise((_, rej) => {
      topeId = setTimeout(() => {
        rej(Object.assign(new Error('La IA está tardando demasiado (más de 2 minutos y medio). He parado la espera: reinténtalo o cambia de proveedor en Ajustes.'), { _timeout: true }));
      }, TIEMPO_IA + 30000);
    });

    const web = pideFotosWeb(texto);
    try {
      const r = await Promise.race([
        (async () => {
          const r = await Providers.askJson({ system: SISTEMA(), user });
          const d = r.data || {};
          const acciones = adaptaAcciones(d.actions, web);
          const id = acciones.length ? uid() : null;
          if (id) instantanea(id);
          const res = await aplicar(acciones, Date.now() + TIEMPO_IA);
          return { d, acciones, id, res };
        })(),
        tope
      ]);
      const { d, id, res } = r;
      anota({
        role: 'bot',
        text: String(d.reply || (res.cambios ? 'Listo.' : 'No he hecho ningún cambio.')),
        cambios: res.etiquetas,
        avisos: res.avisos,
        undo: id
      });
      Store.save();
      Editor.refresh();
    } catch (e) {
      const texto = IA_CANCELADA() ? 'He cancelado la operación. Dime otra cosa cuando quieras.' : e.message;
      anota({ role: 'bot', text: texto, avisos: [] });
      if (e._errores) console.warn('Asistente · errores por proveedor:', e._errores);
    } finally {
      clearTimeout(topeId);
      clearInterval(tTick);
      tTick = null;
      ocupado = false;
      $('chatSend').disabled = false;
      pintar();
      if (!IA_CANCELADA()) $('chatInput').focus();
    }
  }

  /* ---------- eventos ---------- */

  function init() {
    if (!$('chat')) return;
    paintUndo();

    $('btnChat').onclick = () => toggle();
    $('chatClose').onclick = () => toggle(false);
    $('chatUndo').onclick = () => undo();
    $('chatClear').onclick = () => {
      if (hilo().length && !confirm('¿Borrar la conversación con el asistente?')) return;
      reset();
    };
    $('chatSend').onclick = enviar;
    $('chatCancel').onclick = () => cancelarIA();
    $('chatForm').addEventListener('submit', e => { e.preventDefault(); enviar(); });
    $('chatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    });
    $('chatSugs').addEventListener('click', e => {
      const b = e.target.closest('.chat-sug');
      if (!b) return;
      $('chatInput').value = b.textContent;
      enviar();
    });
    $('chatLog').addEventListener('click', e => {
      const b = e.target.closest('[data-undo]');
      if (b) undo(b.dataset.undo);
    });

    // Esc cierra el panel; Ctrl+Alt+Z deshace
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && abierto() && !e.target.isContentEditable) { toggle(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    });

    pintar();
  }

  return { init, toggle, pintar, refreshHint, reset, enviar, aplicar, undo, instantanea, pideFotosWeb, adaptaAcciones, objetivos };
})();
