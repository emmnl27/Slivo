/* ============================================================
   DeckAI · capa de proveedores de IA
   Unifica Gemini con los proveedores de API compatible con OpenAI
   (OpenRouter, Groq, Mistral, Hugging Face y Ollama) e incluye
   reintentos y cambio automático de modelo cuando el servicio falla.
   ============================================================ */

const Providers = (() => {
  const byId = id => CONFIG.providers.find(p => p.id === id) || CONFIG.providers[0];
  const nameOf = p => p.short || p.name;

  const settings = () => Store.state.settings;
  /* Al pegar una clave se cuelan espacios, tabuladores y saltos de línea (sobre todo
     al copiar desde un email o desde el portapapeles), y OpenRouter/Google responden
     401 a una clave con basura dentro sin decir por qué. Se limpia aquí, una sola vez. */
  const key = id => (settings().keys[id] || '').replace(/\s+/g, '').replace(/^["']|["']$/g, '');
  const model = id => (settings().models[id] || '').trim();
  const current = () => settings().provider;

  const hasKey = id => !byId(id).needsKey || !!key(id);
  const base = id => byId(id).base || baseFor(id);

  const BASE = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    openrouter: 'https://openrouter.ai/api/v1',
    pollinations: 'https://gen.pollinations.ai/v1',
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
    huggingface: 'https://router.huggingface.co/v1'
  };
  function baseFor(id) { return BASE[id] || ''; }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- errores: separar "reintentable" de "no sirve" ---------- */

  function fail(message, kind, retryable) {
    const e = new Error(message);
    e.kind = kind;                      // cuota | saturado | clave | modelo | red | contenido
    e.retryable = !!retryable;
    return e;
  }

  /** Traduce la respuesta de error de cada proveedor a un mensaje accionable. */
  function explain(status, data, prov, modelo) {
    const raw = (data && ((data.error && (data.error.message || data.error.code)) ||
                           data.message || data.detail)) || '';
    const txt = typeof raw === 'string' ? raw : JSON.stringify(raw);
    const quien = modelo ? modelo + ' (' + nameOf(prov) + ')' : nameOf(prov);

    /* 401/403 no siempre significa "clave mala": OpenRouter responde igual cuando la
       ruta está mal o cuando la clave existe pero no puede usar ese modelo, así que el
       mensaje dice las dos cosas y va al grano, en vez de culpar a la clave sin más. */
    /* OpenRouter responde 403 por motivos muy distintos y el mensaje de la API lo dice
       claro (confirmación de edad, términos, clave provisional...). Antes todo eso
       salía como "la clave no es válida", que era mentira: la clave va bien. */
    if (status === 403 && prov.id === 'openrouter') {
      const falta = (data && data.error && data.error.metadata && data.error.metadata.missing_attestation_types) || [];
      if (/age_18plus/.test(falta.join(','))) {
        return fail('meta/muse-image pide confirmar que eres mayor de 18 años y tu cuenta aún no lo ha hecho. ' +
          'Entra en https://openrouter.ai/settings/preferences, márcalo y vuelve a generar.', 'permiso', false);
      }
      if (falta.length) {
        return fail('OpenRouter pide que aceptes algo antes de usar ' + modelo + ': ' + falta.join(', ') +
          '. Se acepta en https://openrouter.ai/settings/preferences.', 'permiso', false);
      }
      if (/terms|provisioning|tos/i.test(txt)) {
        return fail('La clave de OpenRouter es provisional: hay que aceptarlo en https://openrouter.ai/settings/keys.', 'permiso', false);
      }
      return fail('OpenRouter no permite usar ' + modelo + ' con esta cuenta (403). ' +
        'Prueba con otro modelo en Ajustes → Imágenes.', 'permiso', false);
    }
    if (status === 401 || status === 403) {
      const como = prov.id === 'openrouter' ? 'OpenRouter no reconoce la clave' :
                   'La clave de ' + nameOf(prov) + ' no es válida o no tiene permiso';
      const pista = prov.id === 'openrouter'
        ? ' Comprueba que la clave empiece por sk-or-v1- y que la cuenta esté verificada en openrouter.ai.'
        : ' Revísala en Ajustes.';
      return fail(como + '.' + pista, 'clave', false);
    }
    if (status === 404) {
      return fail('El modelo ' + modelo + ' no existe en ' + nameOf(prov) + '. Elige otro en Ajustes.', 'modelo', false);
    }
    if (status === 429 || /quota|rate limit|rate_limit|insufficient_quota|resource_exhausted|too many requests/i.test(txt)) {
      return fail('Sin cuota con ' + quien + '. Las claves gratuitas tienen límites por minuto y por día: ' +
        'espera unos minutos o cambia de modelo o de proveedor (en Ajustes).', 'cuota', true);
    }
    if (status === 402 || /billing|payment|subscribe|credit balance|more credits/i.test(txt)) {
      /* OpenRouter da 402 "Insufficient credits" a los modelos de pago aunque marque
         gratis: la cuota gratuita solo cubre los queeligibles sin confirmar. */
      const extra = prov.id === 'openrouter'
        ? (/never purchased/i.test(txt)
            ? ' OpenRouter dice que la cuenta nunca ha comprado créditos, así que da igual el modelo: hay que topping up en openrouter.ai.'
            : ' OpenRouter pide saldo en la cuenta aunque el modelo salga como gratuito; con 0 € rechaza la petición.')
        : '';
      return fail('Sin saldo en ' + nameOf(prov) + '.' + extra, 'cuota', true);
    }
    if (status === 529 || status === 503 || /overloaded|high demand|server is overloaded|capacity|unavailable|try again/i.test(txt)) {
      return fail('Ahora mismo no hay capacidad para ' + quien + ' (servicio saturado).', 'saturado', true);
    }
    if (status === 500 || status === 502 || status === 504) {
      return fail('El servidor de ' + nameOf(prov) + ' devolvió un error (' + status + ').', 'saturado', true);
    }
    if (status === 400 && /model/i.test(txt)) {
      return fail('El modelo ' + modelo + ' no admite este tipo de petición en ' + nameOf(prov) + '.', 'modelo', false);
    }
    return fail((txt ? txt.slice(0, 180) + ' ' : '') + '(error ' + status + ' en ' + quien + ')', 'red', status >= 500);
  }

  /* ---------- peticiones ---------- */

  async function fetchJson(url, { method = 'GET', body, headers = {}, provider, modelo } = {}) {
    const prov = provider || byId(current());
    const h = Object.assign({ 'Content-Type': 'application/json' }, headers);
    if (prov.id === 'openrouter') {
      h['HTTP-Referer'] = location.origin;
      h['X-Title'] = 'AI Slides';
    }
    const k = key(prov.id);
    if (k) h['Authorization'] = 'Bearer ' + k;

    let res;
    try {
      res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      if (prov.local) {
        throw fail('No encuentro Ollama en ' + base(prov.id) + '. Instálalo y ejecútalo, o usa otro proveedor.', 'red', false);
      }
      throw fail('No pude conectar con ' + nameOf(prov) + '. Revisa tu conexión a internet.', 'red', true);
    }

    const texto = await res.text();
    let data = {};
    if (texto) { try { data = JSON.parse(texto); } catch (e) { data = { raw: texto }; } }
    if (!res.ok) throw explain(res.status, data, prov, modelo || (body && body.model) || '');
    return data;
  }

  /** Texto de una respuesta con formato compatible con OpenAI. */
  function openaiText(data) {
    const msg = ((data.choices || [])[0] || {}).message || {};
    let t = msg.content || '';
    if (Array.isArray(t)) t = t.map(p => p.text || '').join('');   // algunos proveedores devuelven array
    return String(t || '').trim();                                  // el "reasoning_content" se ignora
  }

  /** Pide texto a un proveedor. Para Gemini delega en su propio cliente. */
  async function ask(id, { system, user, temperature, schema }) {
    const prov = byId(id);
    if (prov.soloImagen) {
      throw fail(nameOf(prov) + ' solo genera imágenes, no escribe texto.', 'modelo', false);
    }
    if (!hasKey(id)) {
      throw fail(prov.needsKey
        ? 'Falta la clave de ' + nameOf(prov) + '. Ábrela en Ajustes.'
        : 'Proveedor no disponible.', 'clave', false);
    }
    if (!model(id)) throw fail('No has elegido modelo para ' + nameOf(prov) + '.', 'modelo', false);

    if (prov.style === 'gemini') {
      const cfg = {};
      if (schema) { cfg.responseMimeType = 'application/json'; cfg.responseSchema = schema; }
      if (temperature != null && Gemini.supportsSampling(model(id))) cfg.temperature = temperature;
      const data = await Gemini.generate(model(id), {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: cfg
      });
      return Gemini.plainText(data);
    }

    const body = { model: model(id), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (temperature != null) body.temperature = temperature;
    if (schema) body.response_format = { type: 'json_object' };
    const data = await fetchJson(base(id) + '/chat/completions', {
      method: 'POST', body, provider: prov, modelo: model(id)
    });
    return openaiText(data);
  }

  /* ---------- cadena de modelos de reserva ---------- */

  /**
   * Orden de intento: el proveedor elegido, después el resto de proveedores que
   * tengan clave y modelo, y al final otros modelos del proveedor elegido
   * (por ejemplo, un Flash-Lite si el modelo principal está saturado).
   */
  function chain() {
    const s = settings();
    const prio = current();
    const lista = [];

    const meter = (id, m) => {
      if (!m || byId(id).soloImagen || !hasKey(id)) return;
      if (lista.some(x => x.provider === id && x.model === m)) return;
      lista.push({ provider: id, model: m });
    };

    meter(prio, model(prio));
    if (!s.autoRetry) return lista;

    CONFIG.providers.forEach(p => meter(p.id, model(p.id)));
    (CONFIG.models[prio] || []).slice(0, 4).forEach(m => meter(prio, m.id));
    return lista;
  }

  async function conReintentos(fn, { intentos = 2 } = {}) {
    let ultimo;
    for (let i = 1; i <= intentos; i++) {
      try { return await fn(); }
      catch (e) {
        ultimo = e;
        if (!e.retryable || i === intentos) break;
        await sleep(700 * i);
      }
    }
    throw ultimo;
  }

  /* ---------- generación de la presentación ---------- */

  /**
   * Los modelos que se reparten el trabajo: uno por proveedor.
   * Un mismo proveedor no cuenta dos veces (compartirían cuota y rate limit,
   * que es justo lo que el relevo viene a evitar).
   */
  function equipoDe(candidatos) {
    const vistos = new Set();
    return candidatos.filter(c => {
      if (vistos.has(c.provider)) return false;
      vistos.add(c.provider);
      return true;
    });
  }

  /**
   * Genera el deck probando los proveedores disponibles.
   * Si el trabajo cooperativo está activo y hay más de un proveedor con clave,
   * reparte las diapositivas entre ellos; si no, genera todo con uno solo.
   * Devuelve { slides, ... } y un informe de qué modelos lo hicieron.
   */
  async function createDeck(form, { onIntentos } = {}) {
    const candidatos = chain();
    if (!candidatos.length) {
      throw fail('No hay ningún proveedor listo. Abre Ajustes y pega una clave (o usa Ollama en local).', 'clave', false);
    }
    if (settings().cooperativo === false || equipoDe(candidatos).length < 2) {
      return generarEnUno(form, candidatos, onIntentos);
    }
    return generarEnEquipo(form, candidatos, onIntentos);
  }

  /* ---------- modo cooperativo: varios modelos, una sola presentación ---------- */

  /** Ejecuta tareas en paralelo pero de dos en dos (evita disparar el rate limit). */
  async function porParejas(tareas) {
    const salida = new Array(tareas.length);
    let i = 0;
    const workers = [0, 1].map(async () => {
      while (i < tareas.length) {
        const k = i++;
        try { salida[k] = await tareas[k](); }
        catch (e) { salida[k] = { _error: e }; }
      }
    });
    await Promise.all(workers);
    return salida;
  }

  /**
   * Paso 1: un modelo escribe el guion (títulos y orden). Es una llamada corta y
   * sirve de contexto común para que todos los autores hablen del mismo deck.
   */
  async function pedirPlan(form, c, errores) {
    const { system, prompt } = Prompt.plan(form);
    let plano = await conReintentos(async () => {
      const t = await ask(c.provider, { system, user: prompt, temperature: 0.7 });
      if (!t) throw fail('Respuesta vacía', 'red', true);
      try { return Gemini.extractJson(t); } catch (e) { return null; }
    });
    if (!plano) {
      plano = Gemini.extractJson(await ask(c.provider, {
        system: system + '\nIMPORTANTE: responde EXCLUSIVAMENTE con JSON válido, sin texto antes ni después.',
        user: prompt, temperature: 0.7
      }));
    }
    const pasos = normalizarPlan(plano);
    if (!pasos.length) throw fail('El modelo no propuso un guion válido', 'contenido', true);
    return {
      pasos,
      meta: {
        title: txt(plano.title || plano.titulo),
        subtitle: txt(plano.subtitle || plano.subtitulo),
        author: txt(plano.author || plano.autor),
        date: txt(plano.date || plano.fecha)
      }
    };
  }

  /** Acepta "plan", "outline", "slides"... y devuelve la lista ordenada. */
  function normalizarPlan(plano) {
    const crudos = (plano && (plano.plan || plano.outline || plano.esquema || plano.slides)) || [];
    return (Array.isArray(crudos) ? crudos : []).map((x, i) => ({
      n: parseInt(pickNum(x), 10) || i + 1,
      layout: LAYOUT_IDS.includes(x && x.layout) ? x.layout : (i === 0 ? 'cover' : 'bullets'),
      titulo: txt(x && (x.title || x.titulo)),
      idea: txt(x && (x.idea || x.resumen || x.contenido || x.brief))
    })).sort((a, b) => a.n - b.n);
  }

  /**
   * Paso 2: cada modelo escribe el contenido de su tramo, con el guion completo
   * como contexto. Si un tramo falla (sin tokens, saturado…), otro modelo lo retoma.
   */
  async function escribirTramo(form, plan, tramo, c, errores, avisar) {
    const p = Prompt.tramo(form, plan, tramo);
    const etiqueta = ' (diapositivas ' + tramo[0].n + '-' + tramo[tramo.length - 1].n + ')';
    avisar(c, etiqueta);
    try {
      const plano = await conReintentos(async () => {
        const t = await ask(c.provider, { system: p.system, user: p.prompt, temperature: 0.9, schema: p.schema });
        if (!t) throw fail('Respuesta vacía', 'red', true);
        try { return Gemini.extractJson(t); } catch (e) { return null; }
      });
      if (!plano) throw fail('La respuesta no era JSON', 'contenido', true);
      const crudos = plano.slides || [];
      const slides = crudos.map(s => {
        const norm = Store.normalizeDeck({ slides: [s] }).slides[0];
        norm._n = parseInt(pickNum(s), 10) || 0;      // el número puede venir en "n" o "posicion"
        return norm;
      }).filter(s => s.title || s.bullets.length || s.columns.length || s.stats.length || s.steps.length || s.quote);
      if (!slides.length) throw fail('El tramo volvió vacío', 'contenido', true);
      return { c, slides, n: slides.length };
    } catch (e) {
      errores.push(nameOf(byId(c.provider)) + ' · ' + c.model + etiqueta + ': ' + e.message);
      return null;
    }
  }

  async function generarEnEquipo(form, candidatos, onIntentos) {
    const errores = [];
    const jefe = candidatos[0];
    const avisar = (c, extra) => { if (onIntentos) onIntentos(c, extra || ''); };

    // el guion lo escribe el modelo principal; si falla, se cae al modo individual
    let guion;
    try {
      avisar(jefe, ' (guion)');
      guion = await pedirPlan(form, jefe);
    } catch (e) {
      errores.push('Guion cooperativo con ' + jefe.model + ': ' + e.message);
      return generarEnUno(form, candidatos, onIntentos);
    }

    const plan = guion.pasos;

    // un proveedor distinto por tramo; la cola de reserva son todos los candidatos
    const equipo = equipoDe(candidatos);
    const n = Math.max(1, Math.min(equipo.length, Math.min(4, Math.ceil(plan.length / 2))));
    const trozos = [];
    const tam = Math.ceil(plan.length / n);
    for (let i = 0; i < plan.length; i += tam) trozos.push(plan.slice(i, i + tam));

    const tareas = trozos.map((tramo, i) => {
      const primero = i % equipo.length;
      const cola = [equipo[primero]].concat(equipo.filter((c, j) => j !== primero))
        .concat(candidatos.filter(c => c.provider !== equipo[primero].provider));
      return async () => {
        for (const c of cola) {
          const r = await escribirTramo(form, plan, tramo, c, errores, avisar);
          if (r) return r;
        }
        return null;
      };
    });

    const resultados = await porParejas(tareas);
    const buenos = resultados.filter(r => r && r.slides && r.slides.length);

    if (!buenos.length) {
      errores.push('Ningún modelo pudo escribir su tramo');
      return generarEnUno(form, candidatos, onIntentos);
    }

    // montaje final: título del guion + diapositivas ordenadas por su número
    const ordenadas = buenos.flatMap(r => r.slides).sort((a, b) => (a._n || 0) - (b._n || 0));

    const deck = Object.assign({}, Store.normalizeDeck({ slides: plan }), {
      title: guion.meta.title,
      subtitle: guion.meta.subtitle,
      author: guion.meta.author,
      date: guion.meta.date,
      slides: ordenadas
    });

    const usados = buenos.map(r => ({ model: r.c.model, provider: r.c.provider, n: r.slides.length }));
    const out = await cerrar(deck, jefe, errores, form);
    out._equipo = usados;
    out._usados = usados.length;
    return out;
  }

  /** Modo individual: un modelo escribe el deck entero (el camino de siempre). */
  async function generarEnUno(form, candidatos, onIntentos) {
    const { system, prompt, schema } = Prompt.deck(form);
    const errores = [];

    for (const c of candidatos) {
      const prov = byId(c.provider);
      const avisar = (extra) => { if (onIntentos) onIntentos(c, extra || ''); };

      avisar();
      try {
        const texto = await conReintentos(async () => {
          let t = await ask(c.provider, { system, user: prompt, temperature: 0.9, schema });
          if (!t) throw fail('Respuesta vacía', 'red', true);
          try { return Gemini.extractJson(t); }
          catch (e) { return null; }               // se reintenta sin schema
        });

        if (texto && Array.isArray(texto.slides) && texto.slides.length) {
          return await cerrar(texto, c, errores, form);
        }

        // el modelo no respetó el JSON: segundo intento pidiéndole solo JSON
        avisar(' (repitiendo sin esquema)');
        const plano = await ask(c.provider, {
          system: system + '\nIMPORTANTE: responde EXCLUSIVAMENTE con JSON válido, sin texto antes ni después.',
          user: prompt, temperature: 0.9
        });
        const parsed = Gemini.extractJson(plano);
        if (parsed && Array.isArray(parsed.slides) && parsed.slides.length) {
          return await cerrar(parsed, c, errores, form);
        }
        throw fail('La respuesta no contenía diapositivas', 'contenido', true);
      } catch (e) {
        errores.push(nameOf(prov) + ' · ' + c.model + ': ' + e.message);
        if (!e.retryable) {
          if (errores.length >= candidatos.length || !settings().autoRetry) break;
        }
        if (errores.length >= 4) break;
      }
    }

    throw fail(resumen(errores), 'agotado', false);
  }

  /* ---------- conversación (asistente de edición) ---------- */

  /**
   * Igual que createDeck, pero devuelve el JSON que conteste el modelo.
   * Se usa el mismo orden de proveedores, reintentos y cambio de modelo,
   * así que el asistente nunca se queda sin respuesta por un fallo puntual.
   */
  async function askJson({ system, user }, { temperature = 0.6 } = {}) {
    const candidatos = chain();
    if (!candidatos.length) {
      throw fail('No hay ningún proveedor listo. Abre Ajustes y pega una clave (o usa Ollama en local).', 'clave', false);
    }

    const errores = [];
    for (const c of candidatos) {
      try {
        const plano = await conReintentos(async () => {
          const t = await ask(c.provider, { system, user, temperature });
          if (!t) throw fail('Respuesta vacía', 'red', true);
          try { return Gemini.extractJson(t); } catch (e) { return null; }
        });
        if (plano && typeof plano === 'object') return { data: plano, usado: c, errores };

        // el modelo se enrolló con texto: se le pide solo JSON
        const solo = await ask(c.provider, {
          system: system + '\nIMPORTANTE: responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto antes ni después.',
          user, temperature
        });
        let otra = null;
        try { otra = Gemini.extractJson(solo); } catch (e) { otra = null; }
        if (otra && typeof otra === 'object') return { data: otra, usado: c, errores };

        throw fail('La respuesta no contenía JSON', 'contenido', true);
      } catch (e) {
        errores.push(nameOf(byId(c.provider)) + ' · ' + c.model + ': ' + e.message);
        if (!e.retryable) break;
        if (errores.length >= 3) break;
      }
    }
    throw Object.assign(fail('No se pudo hablar con la IA. ' + (errores[errores.length - 1] || ''), 'agotado', false),
      { _errores: errores });
  }

  /* ---------- repairing missing content ---------- */

  /** Campos que cada layout necesita además del título. */
  const CLAVES = {
    cover: 'kicker, subtitle, author, date',
    section: 'subtitle',
    'image-full': 'subtitle',
    agenda: 'bullets', bullets: 'bullets', image: 'bullets',
    'two-col': 'columns', stats: 'stats', timeline: 'steps', quote: 'quote'
  };

  const txt = v => (typeof v === 'string' ? v.trim() : '');

  /** ¿A esta diapositiva le falta todo el cuerpo que pide su layout? */
  function sinContenido(s) {
    switch (s.layout) {
      case 'agenda': case 'bullets': case 'image': return !s.bullets.length;
      case 'two-col': return !s.columns.length;
      case 'stats': return !s.stats.length;
      case 'timeline': return !s.steps.length;
      case 'quote': return !txt(s.quote);
      case 'cover': return !(txt(s.kicker) || txt(s.subtitle) || txt(s.author) || txt(s.date) || s.image);
      case 'section': case 'image-full': return !(txt(s.kicker) || txt(s.subtitle) || s.image);
      default: return false;                  // closing: el título y el bloque de contacto ya la llenan
    }
  }

  const NUM = ['n', 'num', 'numero', 'index', 'indice', 'posicion', 'slide'];

  const clave = t => String(t || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const mismoTitulo = (x, s) => clave(x.title || x.titulo) === clave(s.title) && clave(s.title) !== '';

  /**
   * Si la IA devolvió diapositivas solo con el título, se le pide el contenido
   * que falta en una sola llamada extra. Es la causa más frecuente de
   * presentaciones "vacías" cuando responde un modelo pequeño o cuando se
   * respeta el esquema pero el modelo se salta los campos de contenido.
   */
  async function cerrar(deck, c, errores, form) {
    const out = Object.assign({}, deck, { _usado: c, _errores: errores });

    const normal = Store.normalizeDeck(deck);
    const huecos = normal.slides.map((s, i) => ({ s, i })).filter(({ s }) => sinContenido(s));
    out._reparadas = 0;
    out._vacias = 0;
    if (!huecos.length) return out;

    const lista = huecos.map(({ s, i }) =>
      `{"n":${i + 1},"layout":"${s.layout}","titulo":${JSON.stringify(s.title)}}`).join(', ');

    const formatos = [...new Set(huecos.map(({ s }) => s.layout))]
      .map(l => `- layout "${l}": ${CLAVES[l] || 'subtitle'}`).join('\n');

    const user = [
      'Una presentación se quedó con los títulos pero sin el contenido de estas diapositivas:',
      '[' + lista + ']',
      '',
      'Escribe SOLO el contenido que falta de cada una y devuélvelo en este JSON:',
      '{"slides":[{"n":1,"layout":"bullets","bullets":["...","...","..."]}]}',
      '',
      'Reglas:',
      '- Mantén el número "n" y el "layout" de cada diapositiva tal cual aparecen arriba.',
      '- Usa 3 a 5 elementos cortos por diapositiva, en el mismo idioma y nivel de detalle.',
      '- Campos que espera cada layout:',
      formatos,
      '- Si el layout es "two-col" usa "columns":[{heading,items[]}]; si es "stats" usa "stats":[{value,label}];',
      '  si es "timeline" usa "steps":[{title,text}]; si es "quote" usa "quote" y "quoteAuthor".',
      '- Devuelve un objeto por cada "n" de la lista, en el mismo orden, y solo JSON.'
    ].join('\n');

    for (const alt of chain()) {
      try {
        const plano = await ask(alt.provider, { system: Prompt.system(form), user, temperature: 0.9 });
        const parsed = Gemini.extractJson(plano);
        const porN = new Map();
        const sueltos = [];
        (parsed.slides || []).forEach(x => {
          const n = parseInt(pickNum(x), 10);
          if (n > 0) porN.set(n, x); else sueltos.push(x);
        });
        if (!porN.size && !sueltos.length) continue;

        let fijadas = 0;
        for (const { s, i } of huecos) {
          let x = porN.get(i + 1);
          if (!x) x = sueltos.find(y => mismoTitulo(y, s));
          if (!x) x = sueltos.shift();              // el modelo no numeró: se empareja por orden
          if (!x) continue;
          if (sueltos.includes(x)) sueltos.splice(sueltos.indexOf(x), 1);
          const fundido = Object.assign({}, deck.slides[i], x, { layout: s.layout, id: s.id });
          NUM.forEach(k => { delete fundido[k]; });
          const norm = Store.normalizeDeck({ slides: [fundido] }).slides[0];
          norm.image = s.image || norm.image;            // no se pisa una imagen existente
          norm.imagePrompt = s.imagePrompt || norm.imagePrompt;
          norm.notes = s.notes || norm.notes;
          normal.slides[i] = norm;
          if (!sinContenido(norm)) fijadas++;
        }
        if (fijadas) {
          Object.assign(out, normal, { _usado: c, _errores: errores, _reparadas: fijadas });
        }
        break;
      } catch (e) {
        errores.push('Reparación con ' + nameOf(byId(alt.provider)) + ': ' + e.message);
        break;
      }
    }
    if (out.slides) out._vacias = Store.normalizeDeck(out).slides.filter(sinContenido).length;
    return out;
  }

  function pickNum(x) {
    for (const k of NUM) if (x[k] != null) return x[k];
    return 0;
  }

  function resumen(errores) {
    const ultimo = errores[errores.length - 1] || '';
    if (/Sin cuota/.test(ultimo) || /saturado/i.test(ultimo)) {
      return 'No se pudo generar: todos los proveedores probados están sin cuota o saturados. ' +
        'Prueba un modelo gratis de OpenRouter (sufijo :free), Groq o Mistral, o espera unos minutos.';
    }
    return 'No se pudo generar la presentación. ' + (errores.length ? ultimo : '');
  }

  /** Reescribe una sola diapositiva con el proveedor elegido. */
  async function redoSlide(deck, index, form) {
    const { system, prompt } = Prompt.deck(form);
    const actual = deck.slides[index];
    const claves = CLAVES[actual.layout] || 'subtitle';
    const instruccion = `Ahora reescribe SOLO la diapositiva número ${index + 1} de la presentación llamada "${deck.title}".\n` +
      `Contenido actual:\n- layout: ${actual.layout}\n- título: ${actual.title}\n` +
      `- ideas: ${JSON.stringify(actual.bullets || actual.columns || actual.stats || actual.steps || [])}\n\n` +
      `Devuelve el mismo formato JSON con un único objeto en "slides" y con la MISMA estructura de claves que el resto. ` +
      `No cambies el layout salvo que sea claramente mejor. Mantén el idioma (${LANGUAGES[form.language] || 'español'}) y el nivel de detalle.\n` +
      `Es obligatorio rellenar estos campos del layout "${actual.layout}": ${claves}. ` +
      `No devuelvas la diapositiva solo con el título.`;

    const candidatos = chain();
    const errores = [];
    for (const c of candidatos) {
      try {
        const texto = await ask(c.provider, { system, user: prompt + '\n\n' + instruccion, temperature: 1.0 });
        const parsed = Gemini.extractJson(texto);
        const raw = parsed && parsed.slides && parsed.slides[0];
        if (!raw) throw fail('La respuesta no traía diapositivas', 'contenido', true);
        if (sinContenido(Store.normalizeDeck({ slides: [raw] }).slides[0]))
          throw fail('La diapositiva volvió sin contenido', 'contenido', true);
        return raw;
      } catch (e) {
        errores.push(nameOf(byId(c.provider)) + ' · ' + c.model + ': ' + e.message);
        if (!e.retryable || errores.length >= 3) break;
      }
    }
    throw fail('No se pudo rehacer la diapositiva. ' + (errores[errores.length - 1] || ''), 'agotado', false);
  }

  /* ---------- imágenes ---------- */

  /** Proveedores capaces de generar ilustraciones. */
  const imageProviders = () => CONFIG.providers.filter(p => p.imagen);

  /** Catálogo local de modelos de imagen de un proveedor. */
  const imageCatalogo = id => CONFIG.imageModels[id] || [];

  /** Proveedor de imágenes elegido (siempre uno que sepa generarlas). */
  function imageProvider() {
    const id = settings().imageProvider;
    return id && byId(id).imagen ? id : CONFIG.image.provider;
  }

  /** Modelo de imagen elegido para un proveedor (o para el activo).
   *  Se limpia antes de usarlo: cada familia llama distinto a sus modelos y un
   *  identificador copier-colado de otra acaba en un "unexpected model name format". */
  const imageModel = id => {
    const prov = id || imageProvider();
    const bruto = settings().imageModels[prov] || CONFIG.defaultImageModel[prov] || '';
    const id2 = String(bruto).trim().replace(/^models\//i, '');
    if (byId(prov).style === 'gemini') {
      const limpio = id2.replace(/^google\//i, '');
      return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(limpio) ? limpio : (CONFIG.defaultImageModel.gemini || '');
    }
    return id2;
  };

  /** ¿Hay algún proveedor de imágenes con clave y modelo? */
  const imageReady = () => imageChain().length > 0;

  /** ¿Se puede generar imágenes con este proveedor? No siempre hace falta clave:
      Pollinations tiene una ruta de imágenes gratis que funciona sin ella. */
  const imageHasKey = id => {
    const p = byId(id);
    if (!p.imagen) return false;
    return !p.needsKey || !!key(id) || !!p.imagenSinClave;
  };

  /**
   * Orden de intento para imágenes: el proveedor elegido y, si está activado
   * el cambio automático, el resto que puedan generar y tengan modelo configurado.
   */
  function imageChain() {
    const lista = [];
    const meter = id => {
      const m = imageModel(id);
      if (!imageHasKey(id) || !m || lista.some(x => x.provider === id)) return;
      lista.push({ provider: id, model: m });
    };
    meter(imageProvider());
    if (settings().autoRetry) imageProviders().forEach(p => meter(p.id));
    return lista;
  }

  /* Cada API devuelve la imagen en su propio formato; esto lo deja todo igual:
     un data-URL (base64) que el lienzo puede pintar sin problemas de CORS. */
  function aDataUrl(data) {
    // el tipo se deduce de la propia imagen: algunos modelos de difusión llegan
    // en JPEG y otros en PNG, y no siempre lo dicen en la respuesta
    const tipoDe = b64 => {
      const b = b64.trim();
      if (b.indexOf('iVBORw0KGgo') === 0) return 'image/png';
      if (b.indexOf('/9j/') === 0) return 'image/jpeg';
      if (b.indexOf('R0lGOD') === 0) return 'image/gif';
      if (b.indexOf('UklGR') === 0) return 'image/webp';
      return 'image/png';
    };
    const esBase64 = s => typeof s === 'string' && s.length >= 32 && /^[A-Za-z0-9+/\r\n]+={0,2}$/.test(s.trim());
    const res = data && data.result;
    if (esBase64(res)) return 'data:' + tipoDe(res) + ';base64,' + res.trim();
    if (res && typeof res === 'object' && esBase64(res.image)) {
      const f = (res.format || '').toLowerCase();
      return 'data:' + (f === 'jpeg' || f === 'jpg' ? 'image/jpeg' : tipoDe(res.image)) + ';base64,' + res.image.trim();
    }
    const item = (((data || {}).data || [])[0]) || data || {};
    const mt = item.media_type || item.mime_type || 'image/png';
    if (item.b64_json) return 'data:' + mt + ';base64,' + item.b64_json;
    if (item.url) return item.url;
    return '';
  }

  /** Convierte una imagen binaria (Blob) en data-URL, que el lienzo sí puede pintar. */
  const blobADataUrl = blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('no se pudo leer la imagen'));
    fr.readAsDataURL(blob);
  });

  /** Relación de aspecto → tamaño en píxeles (para quien no acepte "16:9"). */
  function sizeOf(aspect) {
    const SIZES = {
      '1:1': '1024x1024', '16:9': '1536x864', '9:16': '864x1536',
      '4:3': '1365x1024', '3:4': '1024x1365', '3:2': '1536x1024', '2:3': '1024x1536'
    };
    return SIZES[aspect] || SIZES['16:9'];
  }

  /* ---- qué admite cada modelo de imagen ----
     OpenRouter publica en /images/models qué parámetros acepta cada modelo.
     Enviar "quality" o "aspect_ratio" a un modelo que no los admite devuelve 400,
     así que el cuerpo se construye solo con lo declarado. */

  const CAPS = {loaded: false, map: {}};

  async function capacidades() {
    if (CAPS.loaded) return CAPS.map;
    try {
      const data = await fetchJson('https://openrouter.ai/api/v1/images/models', {
        provider: byId('openrouter'), modelo: ''
      });
      const mapa = {};
      (data.data || []).forEach(m => {
        const id = (m.id || m.name || '').replace(/^models\//, '');
        if (!id) return;
        // "supported_parameters" llega como array o como mapa {param: {…}}
        const sp = m.supported_parameters;
        mapa[id] = Array.isArray(sp) ? sp.slice() : (sp && typeof sp === 'object' ? Object.keys(sp) : []);
      });
      if (Object.keys(mapa).length) { CAPS.map = mapa; CAPS.loaded = true; }
      // si la lista viene vacía no se marca como cargada: se reintenta en la siguiente llamada
    } catch (e) { /* sin metadatos se manda el cuerpo mínimo, que siempre vale */ }
    return CAPS.map;
  }

  /** ¿El modelo declara admitir este parámetro? false = no lo mandes. */
  function admite(modelo, param) {
    const caps = CAPS.map[modelo];
    return !!caps && caps.indexOf(param) >= 0;
  }

  /* --- AI Horde: red comunitaria de GPUs. Gratis de verdad y sin tarjeta. Su API es
     asíncrona: se envía el trabajo (generate/async), se sondea el estado (check) hasta
     que termina y se recoge la imagen en base64 (status). Sin clave se usa la anónima
     "0000000000" (prioridad baja); una clave registrada solo da prioridad, no cuesta. --- */
  async function generarHorde(id, prov, modelo, prompt, aspect) {
    const raiz = String(prov.horde).replace(/\/+$/, '');
    const [aw, ah] = String(aspect).split(':').map(Number);
    const ratio = (aw && ah) ? aw / ah : 16 / 9;
    // Bajo alta demanda AI Horde rechaza con 403 (incluso a la clave anónima) los encargos
    // de más de ~581x581 px. Con base 512 el lado mayor nunca pasa de 512, así que siempre
    // entra sin kudos; registrarse solo acorta la cola, no cambia el tamaño.
    let w = 512, h = Math.round(512 / ratio);
    if (h > 512) { h = 512; w = Math.round(512 * ratio); }
    const mult = n => Math.max(256, Math.min(1024, Math.round(n / 64) * 64));

    const cab = { 'Content-Type': 'application/json', 'Client-Agent': 'AI-Slides:1.0', apikey: key(id) || '0000000000' };
    const cuerpo = {
      prompt: String(prompt || '').slice(0, 1500),
      params: { width: mult(w), height: mult(h), steps: 20, n: 1 },
      r2: false                                   // false = la imagen llega en base64, sin caducidad
    };
    if (modelo) cuerpo.models = [modelo];

    let resp;
    try {
      resp = await fetch(raiz + '/generate/async', { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) });
    } catch (e) {
      throw fail('No pude conectar con AI Horde. Revisa tu conexión a internet.', 'red', true);
    }
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      let msg = txt;
      try {
        const j = JSON.parse(txt);
        msg = j.message || (j.error && j.error.message) || (typeof j.error === 'string' ? j.error : '') || txt;
      } catch (e) { /* vino en texto plano */ }
      const kind = resp.status === 401 ? 'clave' : (resp.status === 429 ? 'cuota' : 'contenido');
      throw fail('AI Horde (' + resp.status + '): ' + String(msg || '').slice(0, 160),
        kind, resp.status === 429 || resp.status >= 500);
    }
    const job = await resp.json().catch(() => ({}));
    if (!job.id) throw fail('AI Horde no devolvió el identificador del trabajo.', 'contenido', true);

    // Sondeo: hasta 3 min. La cola anónima a veces tarda; uno de cada mucho se agota.
    const t0 = Date.now();
    let ver;
    while (Date.now() - t0 < 180000) {
      await sleep(2500);
      try { ver = await (await fetch(raiz + '/generate/check/' + job.id, { headers: cab })).json(); }
      catch (e) { continue; }                     // fallo puntual de red: se reintenta el sondeo
      if (ver && (ver.done || ver.faulted)) break;
    }
    if (ver && ver.faulted) throw fail('AI Horde no pudo completar el trabajo (falló un worker). Prueba otra vez.', 'contenido', true);
    if (!ver || !ver.done) {
      throw fail('AI Horde tardó demasiado (la cola estaba llena). Prueba otra vez o usa otro proveedor.', 'saturado', false);
    }

    let st;
    try { st = await (await fetch(raiz + '/generate/status/' + job.id, { headers: cab })).json(); }
    catch (e) { throw fail('No pude recoger la imagen de AI Horde.', 'red', true); }
    const gen = ((st && st.generations) || [])[0];
    if (!gen || !gen.img) throw fail('AI Horde no devolvió ninguna imagen.', 'contenido', true);
    const url = aDataUrl({ result: String(gen.img).trim() });
    if (!url) throw fail('AI Horde devolvió una imagen en un formato inesperado.', 'contenido', true);
    return url;
  }

  /**
   * Genera una imagen con un proveedor concreto.
   * Si el servidor rechaza la petición por parámetros, se reintenta con el
   * cuerpo mínimo (solo modelo, prompt y n), que es lo que aceptan todos.
   */
  async function generarImagen(id, modelo, prompt, { aspect = '16:9' } = {}) {
    const prov = byId(id);
    if (!imageHasKey(id)) {
      throw fail('Falta la clave de ' + nameOf(prov) + ' para generar imágenes (Ajustes).', 'clave', false);
    }

    if (prov.style === 'gemini') return Gemini.generateImage(prompt, { aspect, model: modelo });

    // AI Horde: API propia, asíncrona y gratuita (con clave anónima si no hay ninguna)
    if (prov.horde) return await generarHorde(id, prov, modelo, prompt, aspect);

    /* --- Pollinations: GET a /prompt/{texto}, devuelve la imagen en crudo y no
       hace falta clave. El endpoint clásico es muy quisquilloso con parámetros extra:
       empezamos con lo mínimo (width,height,nologo,seed) y en los reintentos
       quitamos flags problemáticos y probamos 'turbo' cuando 'flux' está saturado. --- */
    if (prov.imagenPromptUrl && prov.imagenSinClave) {
      const [aw, ah] = String(aspect).split(':').map(Number);
      const ratio = (aw && ah) ? aw / ah : 16 / 9;
      let w = 1024, h = Math.round(1024 / ratio);
      if (h > 1024) { h = 1024; w = Math.round(1024 * ratio); }
      const mult = n => Math.max(256, Math.min(2048, Math.round(n / 64) * 64));
      const baseUrl = prov.imagenPromptUrl.replace('{prompt}', encodeURIComponent(String(prompt || '').slice(0, 1800)));

      const pedir = async (intent = 0, mdl = modelo || 'flux', withFlags = false) => {
        const s = Date.now() + intent * 1000000009 + Math.floor(Math.random() * 500000);
        let url = baseUrl +
          '?width=' + mult(w) + '&height=' + mult(h) +
          '&nologo=true&seed=' + s;
        if (withFlags) url += '&nofeed=true&enhance=false';
        if (mdl) url += '&model=' + encodeURIComponent(mdl);
        const cab = key(id) ? { Authorization: 'Bearer ' + key(id) } : {};
        let resp;
        try {
          resp = await fetch(url, { headers: cab, referrerPolicy: 'no-referrer' });
        } catch (e) {
          if (intent < 2) {
            await new Promise(r => setTimeout(r, 250 * (intent + 1)));
            return pedir(intent + 1, mdl, withFlags);
          }
          throw fail('No se pudo contactar con Pollinations.', 'red', true);
        }
        if (!resp.ok) {
          const saturado = resp.status === 402 || resp.status === 429 || resp.status >= 500;
          /* Pollinations sin clave es un trago a la carta: llegó a dar 0 aciertos de 12
             seguidos con 402 inmediato. Se insiste solo dos veces con seed nuevo (el
             seed decide por qué cola entra) y si no entra se falla rápido para que la
             cadena siga con otro proveedor: esperar 30s aquí solo alarga el fallo. */
          if (saturado && intent < 2) {
            await new Promise(r => setTimeout(r, 500 * (intent + 1) + Math.random() * 300));
            return pedir(intent + 1, mdl, false);
          }
          const msg = (resp.status === 402 || resp.status === 429)
            ? 'Pollinations sin clave está saturado (ahora casi siempre rechaza las imágenes gratis). Prueba con Hugging Face o Gemini en Ajustes, o espera unos minutos.'
            : 'Pollinations devolvió un error ' + resp.status + '.';
          throw fail(msg, 'contenido', saturado);
        }
        const blob = await resp.blob();
        if (!blob.size) {
          if (intent < 1) {
            await new Promise(r => setTimeout(r, 250));
            return pedir(intent + 1, mdl, withFlags);
          }
          throw fail('Pollinations devolvió una imagen vacía.', 'contenido', true);
        }
        const salida = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(new Error('no se pudo leer'));
          fr.readAsDataURL(blob);
        });
        if (!/^data:image\//.test(salida)) throw fail('Pollinations no devolvió una imagen.', 'contenido', true);
        return salida;
      };

      return await pedir(0, modelo || 'flux', false);
    }

    /* --- Hugging Face (Inference Providers): el endpoint OpenAI-compatible /v1
       solo atiende chat, así que las imágenes van por su ruta propia
       (hf-inference): recibe { inputs } y devuelve la imagen en crudo o en un
       JSON con base64. --- */
    if (prov.imageBase) {
      const ruta = String(prov.imageBase).replace(/\/+$/, '') + '/models/' + modelo;
      const [aw, ah] = String(aspect).split(':').map(Number);
      const ratio = (aw && ah) ? aw / ah : 16 / 9;
      let w = 1024, h = Math.round(1024 / ratio);
      if (h > 1024) { h = 1024; w = Math.round(1024 * ratio); }
      const mult = n => Math.max(256, Math.min(1536, Math.round(n / 64) * 64));

      const pedir = async cuerpo => {
        let resp;
        try {
          resp = await fetch(ruta, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' },
              key(id) ? { Authorization: 'Bearer ' + key(id) } : {}),
            body: JSON.stringify(cuerpo)
          });
        } catch (e) {
          throw fail('No pude conectar con ' + nameOf(prov) + '. Revisa tu conexión a internet.', 'red', true);
        }
        if (!resp.ok) {
          // HF devuelve JSON con el motivo (saldo, modelo, token) casi siempre
          const txt = await resp.text().catch(() => '');
          let msg = txt;
          try { const j = JSON.parse(txt); msg = j.error || j.message || txt; } catch (e) { /* vino en texto plano */ }
          throw fail('Hugging Face no pudo generar la imagen (' + resp.status + '): ' + String(msg || '').slice(0, 180),
            resp.status >= 500 ? 'red' : 'contenido', resp.status >= 500);
        }
        const tipo = (resp.headers.get('content-type') || '').toLowerCase();
        if (/json|text/.test(tipo)) {
          const j = await resp.json().catch(() => ({}));
          if (j.data && j.data[0] && j.data[0].b64_json) return 'data:image/png;base64,' + j.data[0].b64_json;
          if (Array.isArray(j.output) && j.output[0]) return await blobADataUrl(await (await fetch(j.output[0])).blob());
          if (j.error) throw fail('Hugging Face: ' + j.error, 'contenido', true);
          throw fail('Hugging Face no devolvió ninguna imagen.', 'contenido', true);
        }
        return await blobADataUrl(await resp.blob());
      };

      const minimo = { inputs: String(prompt || '').slice(0, 1500) };
      try {
        return await pedir(Object.assign({ parameters: { width: mult(w), height: mult(h) } }, minimo));
      } catch (e) {
        // un modelo puede rechazar 'parameters' según su versión → segunda vuelta con lo mínimo
        if (e.kind !== 'red' && /400|parameter|width|height|unexpected|invalid/i.test(e.message)) {
          return await pedir(minimo);
        }
        throw e;
      }
    }

    const minimo = { model: modelo, prompt };
    const completo = Object.assign({}, minimo);

    if (id === 'openrouter') {
      await capacidades();
      // Solo se manda lo que el modelo declara. Si no hay metadatos, el cuerpo
      // se queda en {model, prompt} (lo mínimo, que todos aceptan) y el reintento
      // de más abajo es la red de seguridad. Mandar parámetros a ciegas es lo que
      // devolvía 400 en los modelos gratuitos.
      const ok = k => admite(modelo, k);
      if (ok('n')) completo.n = 1;
      if (ok('aspect_ratio')) completo.aspect_ratio = aspect;
      if (ok('output_format')) completo.output_format = 'png';
      if (ok('negative_prompt')) completo.negative_prompt = 'texto, letras, logotipos, marcas de agua';
      // "quality" se deja siempre fuera: encarece la imagen (GPT Image) y no todos lo aceptan
    } else {
      completo.response_format = 'b64_json';            // evita URLs que caducan
      completo.size = sizeOf(aspect);
    }

    const ruta = base(id) + (prov.imagePath || '/images/generations');
    try {
      const data = await fetchJson(ruta, { method: 'POST', body: completo, provider: prov, modelo: modelo });
      const url = aDataUrl(data);
      if (url) return url;
      throw fail('El modelo ' + modelo + ' (' + nameOf(prov) + ') no devolvió ninguna imagen.', 'contenido', true);
    } catch (e) {
      // 400 por parámetros no admitidos → segunda vuelta con el cuerpo mínimo
      const porParams = e.kind === 'red' && /400|parameter|aspect_ratio|size|quality|unsupported/i.test(e.message);
      if (!porParams || completo === minimo) throw e;
      const data = await fetchJson(ruta, { method: 'POST', body: minimo, provider: prov, modelo: modelo });
      const url = aDataUrl(data);
      if (url) return url;
      throw fail('El modelo ' + modelo + ' (' + nameOf(prov) + ') no devolvió ninguna imagen.', 'contenido', true);
    }
  }

  /**
   * Genera una imagen probando los proveedores de imagen disponibles.
   * Devuelve un data-URL con la ilustración.
   */
  async function image(prompt, { aspect = '16:9' } = {}) {
    const elegido = imageProvider();
    const candidatos = imageChain();
    if (!candidatos.length) {
      const nombres = imageProviders().map(p => p.short).join(', ');
      const porQue = !hasKey(elegido)
        ? 'No le has pegado la clave de ' + nameOf(byId(elegido)) + ' (Ajustes → Imágenes).'
        : 'No hay ninguna clave de ' + nombres + ' (Ajustes).';
      throw fail('Para generar imágenes hace falta una clave. ' + porQue, 'clave', false);
    }
    /* Se prueban en orden, empezando siempre por el proveedor elegido. Como cada uno
       puede fallar por su cuenta, el error que se muestra dice TODOS los que se
       intentaron: si solo sale el último, parece que se ignoró tu elección. */
    const errores = [];
    let ultimo;
    for (const c of candidatos) {
      try {
        return await conReintentos(() => generarImagen(c.provider, c.model, prompt, { aspect }));
      } catch (e) {
        ultimo = e;
        errores.push(nameOf(byId(c.provider)) + ' · ' + c.model + ' → ' + e.message);
        if (!e.retryable) break;
      }
    }
    const partes = [];
    // si el proveedor elegido ni siquiera se pudo intentar, se dice: es la causa raíz
    if (!candidatos.some(c => c.provider === elegido)) {
      partes.push('Atención: elegiste ' + nameOf(byId(elegido)) + ' pero no se ha usado porque ' +
        (!hasKey(elegido) ? 'no tiene clave guardada' : 'no tiene modelo elegido') + '.');
    }
    partes.push(errores.length > 1
      ? 'No se pudo generar la imagen con ninguno de los ' + errores.length + ' proveedores. ' + errores.join(' | ')
      : errores[0]);
    const err = fail(partes.join(' '), ultimo && ultimo.kind, !!(ultimo && ultimo.retryable));
    err.errores = errores;
    throw err;
  }

  /* ---------- listado de modelos ---------- */

  /**
   * Cada catálogo declara las modalidades a su manera (OpenRouter usa
   * "architecture", Pollinations "output_modalities"). Esto lo normaliza.
   */
  function modalidades(m) {
    const arq = (typeof m === 'object' && m) ? (m.architecture || m) : {};
    const salida = arq.output_modalities ||
      (typeof m === 'object' && m.output_modalities) ||
      (typeof m === 'object' && m.modalities);
    const entrada = arq.input_modalities || (typeof m === 'object' && m.input_modalities);
    return {
      id: (typeof m === 'string' ? m : (m.id || m.name || '')).replace(/^models\//, ''),
      entrada: Array.isArray(entrada) ? entrada : null,
      salida: Array.isArray(salida) ? salida : []
    };
  }

  /** ¿El modelo acepta texto y devuelve una ilustración? */
  function esImagen(m) {
    if (typeof m === 'string') return /image|flux|seedream|ideogram|recraft|dall|imagen/i.test(m);
    const q = modalidades(m);
    if (!q.salida.length) return /image|flux|seedream|ideogram|recraft|dall|imagen/i.test(q.id);
    return q.salida.includes('image') && (!q.entrada || q.entrada.includes('text'));
  }

  /* audio, transcripción y embeddings: algunos los declaran como "texto"
     porque su salida es texto, pero no sirven para /chat/completions */
  const NO_CHAT = /tts|whisper|transcri|embed|rerank|\bclip|audio|speech|voice|lyria|music|video|realtime|vision|(^|[\/:])vl([\/:]|$)/i;
  const SI_CHAT = /\/chat\/completions|\/v1\/messages|\/v1\/responses|^\/text/;

  /** ¿El modelo escribe texto (y no solo dibuja)? */
  function esTexto(m) {
    const q = modalidades(m);
    if (NO_CHAT.test(q.id)) return false;
    // un modelo que solo dibuja no vale para el texto, aunque tenga endpoint de chat
    if (q.salida.length && !(q.salida.includes('text') && !q.salida.includes('image'))) return false;
    // cuando el catálogo dice qué endpoints admite, manda eso
    const ends = typeof m === 'object' && m && m.supported_endpoints;
    if (Array.isArray(ends) && ends.length) return ends.some(e => SI_CHAT.test(e));
    return true;
  }

  async function listModels(id) {
    const prov = byId(id);
    if (!hasKey(id)) throw fail('Falta la clave de ' + nameOf(prov) + '.', 'clave', false);

    if (prov.style === 'gemini') return Gemini.listModels();

    const data = await fetchJson(base(id) + '/models', { provider: prov, modelo: '' });
    const crudos = (data.data || data.models || []).filter(Boolean);

    if (prov.id === 'ollama') {
      return crudos.map(m => (typeof m === 'string' ? m : m.id || m.name || ''))
        .filter(m => m && !/embed/i.test(m));
    }

    // si el catálogo dice para qué sirve cada modelo, nos fiamos de él
    const conInfo = crudos.filter(m => typeof m === 'object' && modalidades(m).salida.length);
    const lista = conInfo.length
      ? conInfo.filter(esTexto).map(m => modalidades(m).id).filter(Boolean)
      : crudos.map(m => (typeof m === 'string' ? m : m.id || m.name || ''))
        .filter(Boolean)
        .filter(esTexto);
    return lista;
  }

  /** Catálogo local de modelos de un proveedor (para el desplegable). */
  const catalogo = id => CONFIG.models[id] || [];

  /**
   * Lista real de modelos que generan imágenes. Cada proveedor expone su catálogo
   * de una forma distinta, así que aquí solo se filtran los que aceptan texto y
   * devuelven imagen.
   */
  async function listImageModels(id) {
    const prov = byId(id);
    if (!prov.imagen) throw fail(nameOf(prov) + ' no genera imágenes.', 'modelo', false);

    if (prov.style === 'gemini') return (await Gemini.listModels()).filter(Gemini.isImageModel);

    // Hugging Face no lista sus modelos de imagen en /v1/models (solo trae chat),
    // así que se usa el catálogo local de hf-inference
    if (prov.imageBase) return imageCatalogo(id).map(m => m.id);

    // AI Horde sí publica su catálogo real (status/models), pero los nombres cambian
    // y cientos son NSFW: se usa la lista curada de config.js.
    if (prov.horde) return imageCatalogo(id).map(m => m.id);

    // OpenRouter tiene un catálogo propio (/images/models); Pollinations, uno general
    const ruta = id === 'openrouter' ? '/images/models' : '/models';
    const data = await fetchJson(base(id) + ruta, { provider: prov, modelo: '' });

    return (data.data || []).filter(esImagen).map(m => modalidades(m).id).filter(Boolean);
  }

  /** Comprueba la clave recién pegada, para no descubrir el problema al generar.
   *  Devuelve {ok, texto} y nunca lanza: el botón muestra el motivo tal cual. */
  async function checkKey(id) {
    const prov = byId(id);
    if (prov.horde) {
      const k = key(id);
      if (!k) return { ok: true, texto: 'Sin clave se usa la anónima de AI Horde (prioridad baja, pero gratis).' };
      try {
        const data = await fetchJson(prov.horde + '/find_user', { provider: prov, headers: { apikey: k }, modelo: '' });
        const quien = data && data.username ? ' · usuario ' + data.username : '';
        const kudos = data && data.kudos != null ? ' · kudos ' + data.kudos : '';
        return { ok: true, texto: 'Clave correcta' + quien + kudos };
      } catch (e) {
        return { ok: false, texto: e.message };
      }
    }
    if (!prov.needsKey) return { ok: true, texto: nameOf(prov) + ' no necesita clave.' };
    const k = key(id);
    if (!k) return { ok: false, texto: 'No has pegado ninguna clave.' };
    if (prov.keyPrefix && k.indexOf(prov.keyPrefix) !== 0) {
      return { ok: false, texto: 'Esa clave no parece de ' + nameOf(prov) + ': tiene que empezar por ' + prov.keyPrefix + '.' };
    }
    try {
      if (id === 'openrouter') {
        /* /auth/key no genera imágenes y separa los dos fallos que se confunden:
           "clave mala" (401) de "cuenta sin saldo" (200 con total_credits 0). */
        const data = await fetchJson(base('openrouter') + '/auth/key', { provider: prov });
        const info = (data && data.data) || {};
        const total = info.total_credits;
        if (total === 0) {
          return { ok: false, texto: 'La clave es válida, pero la cuenta tiene 0 € de saldo. Con 0 € los modelos gratis también se rechazan.' };
        }
        return { ok: true, texto: 'Clave correcta' + (total != null ? ' · saldo: ' + total + ' $' : '') };
      }
      const lista = await listModels(id);
      return { ok: true, texto: 'Clave correcta · ' + lista.length + ' modelos disponibles' };
    } catch (e) {
      return { ok: false, texto: e.message };
    }
  }

  return {
    byId, key, model, current, hasKey, chain, catalogo,
    equipoSize: () => equipoDe(chain()).length,
    imageProvider, imageModel, imageProviders, imageCatalogo, imageChain, imageReady,
    createDeck, redoSlide, askJson, image, listModels, listImageModels, generarImagen, checkKey,
    textoProviders: () => CONFIG.providers.filter(p => !p.soloImagen)
  };
})();
