(async () => {
  const R = [];
  const ok = (n, c, extra) => R.push({ n, ok: !!c, d: c ? '' : (extra || '') });
  const seccion = async (nombre, fn) => { try { await fn(); } catch (e) { R.push({ n: 'EXCEPCION@' + nombre, ok: false, d: e.message }); } };
  const S = Store.state.settings;
  const origFetch = window.fetch;
  const form = { topic: 'Prueba de equipo', count: 6, language: 'es', audience: 'equipo', tone: 'profesional', style: 'limpio', notes: '' };

  const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
  const err = (status, msg) => ({ ok: false, status, text: async () => JSON.stringify({ error: { message: msg } }) });

  const B64 = new Array(40).join('QUFB');
  const PLAN_MARK = /"plan":\[/;          // solo aparece en Prompt.plan
  const TRAMO_MARK = /SOLO ESTAS DIAPOSITIVAS/;   // solo en Prompt.tramo

  /* ---------- 1. la opcion cooperative se guarda y se migra ---------- */
  Store.mergeSettings({ cooperativo: false });
  ok('migra_cooperativo', S.cooperativo === false);
  Store.mergeSettings({ cooperativo: true });
  ok('migra_cooperativo_true', S.cooperativo === true);
  Store.mergeSettings({});
  ok('cooperativo_por_defecto', S.cooperativo === true);

  /* ---------- 2. Hugging Face sirve texto e imagen; Cloudflare ya no existe ---------- */
  S.keys = { gemini: '', openrouter: 'sk-or-x', pollinations: 'pk-x', groq: 'gsk-x', mistral: 'sk-x', huggingface: 'hf-x', ollama: '', cloudflare: 'cf-x' };
  S.models.groq = 'llama-3.3-70b-versatile';
  S.models.mistral = 'mistral-small-latest';
  S.provider = 'groq';
  S.autoRetry = true;

  const chainIds = Providers.chain().map(c => c.provider);
  ok('cloudflare_ya_no_existe', !CONFIG.providers.some(p => p.id === 'cloudflare') && chainIds.indexOf('cloudflare') < 0, chainIds.join(','));
  const imgIds = Providers.imageProviders().map(p => p.id);
  ok('hf_en_texto_e_imagen', Providers.textoProviders().some(p => p.id === 'huggingface') && imgIds.indexOf('huggingface') >= 0, imgIds.join(','));
  ok('hf_entra_en_cadena_imagen', Providers.imageChain().map(c => c.provider).indexOf('huggingface') >= 0,
     Providers.imageChain().map(c => c.provider).join(','));

  /* ---------- 3. el cuerpo de imagen solo lleva lo que el modelo admite ---------- */
  let ultimaImagen = null;
  window.fetch = async (url, opt) => {
    const u = String(url);
    if (u.indexOf('/images/models') >= 0) {
      return resp({ data: [
        // forma real de la API: supported_parameters llega como mapa, no como array
        { id: 'meta/muse-image', supported_parameters: {} },
        { id: 'inclusionai/ming-image-0.1-design', supported_parameters: { output_format: { type: 'enum' }, n: { type: 'range' }, input_references: { type: 'range' } } },
        { id: 'google/gemini-3.1-flash-image', supported_parameters: { n: {}, aspect_ratio: {}, output_format: {} } },
        { id: 'modelo-sin-meta', supported_parameters: ['aspect_ratio'] }
      ] });
    }
    if (u.indexOf('/api/v1/images') >= 0 && opt && opt.method === 'POST') {
      ultimaImagen = JSON.parse(opt.body);
      return resp({ data: [{ b64_json: B64, media_type: 'image/png' }] });
    }
    return err(404, 'no');
  };

  await seccion('or-muse', async () => {
    await Providers.generarImagen('openrouter', 'meta/muse-image', 'un gato', { aspect: '16:9' });
    ok('muse_cuerpo_minimo', ultimaImagen.model === 'meta/muse-image' && ultimaImagen.prompt === 'un gato',
       JSON.stringify(ultimaImagen));
    ok('muse_solo_modelo_y_prompt', Object.keys(ultimaImagen).sort().join(',') === 'model,prompt',
       JSON.stringify(ultimaImagen));
    ok('muse_sin_n', ultimaImagen.n === undefined, JSON.stringify(ultimaImagen));
    ok('muse_sin_quality', ultimaImagen.quality === undefined, JSON.stringify(ultimaImagen));
    ok('muse_sin_aspect_ratio', ultimaImagen.aspect_ratio === undefined, JSON.stringify(ultimaImagen));
  });

  await seccion('or-ming', async () => {
    await Providers.generarImagen('openrouter', 'inclusionai/ming-image-0.1-design', 'un logo', { aspect: '1:1' });
    ok('ming_tiene_output_format', ultimaImagen.output_format === 'png', JSON.stringify(ultimaImagen));
    ok('ming_sin_aspect_ratio', ultimaImagen.aspect_ratio === undefined, JSON.stringify(ultimaImagen));
  });

  await seccion('or-nanobanana', async () => {
    await Providers.generarImagen('openrouter', 'google/gemini-3.1-flash-image', 'un paisaje', { aspect: '9:16' });
    ok('nanobanana_con_aspect_ratio', ultimaImagen.aspect_ratio === '9:16', JSON.stringify(ultimaImagen));
    ok('nanobanana_con_output_format', ultimaImagen.output_format === 'png', JSON.stringify(ultimaImagen));
    ok('nunca_envia_quality', ultimaImagen.quality === undefined);
  });

  await seccion('or-sin-meta', async () => {
    // modelo que NO está en el catálogo de la API: sin metadatos no se inventa nada
    await Providers.generarImagen('openrouter', 'marca/modelo-nuevo', 'algo', { aspect: '4:3' });
    ok('sin_metadatos_cuerpo_minimo', Object.keys(ultimaImagen).sort().join(',') === 'model,prompt',
       JSON.stringify(ultimaImagen));
  });

  /* ---------- 4. Hugging Face: /hf-inference/models/{id} y respuesta binaria ---------- */
  S.keys.huggingface = 'hf-x';
  const hfBlob = tipo => ({ ok: true, status: 200,
    headers: { get: h => (/content-type/i.test(h) ? (tipo || 'image/png') : null) },
    blob: async () => new Blob([B64], { type: tipo || 'image/png' }) });
  const hfModelo = 'stabilityai/stable-diffusion-3-medium-diffusers';

  window.fetch = async (url, opt) => {
    const u = String(url);
    if (u.indexOf('router.huggingface.co/hf-inference/models/') >= 0) {
      ultimaImagen = { url: u, headers: opt.headers, body: JSON.parse(opt.body) };
      return hfBlob('image/png');
    }
    return err(404, 'no');
  };

  await seccion('hf-binario', async () => {
    const r = await Providers.generarImagen('huggingface', hfModelo, 'un paisaje', { aspect: '16:9' });
    ok('hf_devuelve_dataurl', /^data:image\/png;base64,/.test(r), r.slice(0, 40));
    ok('hf_endpoint_correcto', ultimaImagen.url === 'https://router.huggingface.co/hf-inference/models/' + hfModelo, ultimaImagen.url);
    ok('hf_manda_bearer', ultimaImagen.headers && ultimaImagen.headers.Authorization === 'Bearer hf-x', JSON.stringify(ultimaImagen.headers));
    ok('hf_manda_inputs', ultimaImagen.body.inputs === 'un paisaje', JSON.stringify(ultimaImagen.body));
    ok('hf_tamano_segun_aspect',
       ultimaImagen.body.parameters && ultimaImagen.body.parameters.width > ultimaImagen.body.parameters.height,
       JSON.stringify(ultimaImagen.body.parameters));
  });

  /* ---------- 4b. si HF rechaza 'parameters', reintenta con el cuerpo mínimo ---------- */
  let faseHf = 0;
  window.fetch = async (url, opt) => {
    faseHf++;
    ultimaImagen = { body: JSON.parse(opt.body) };
    if (faseHf === 1) return { ok: false, status: 400, text: async () => JSON.stringify({ error: 'width not supported' }) };
    return hfBlob('image/png');
  };
  await seccion('hf-escalon', async () => {
    faseHf = 0;
    const r = await Providers.generarImagen('huggingface', hfModelo, 'x', { aspect: '16:9' });
    ok('hf_reintenta_minimo', faseHf === 2 && Object.keys(ultimaImagen.body).join(',') === 'inputs',
       JSON.stringify({ faseHf, body: ultimaImagen.body }));
    ok('hf_reintento_devuelve_imagen', /^data:image\/png;base64,/.test(r), r.slice(0, 30));
  });

  /* ---------- 4c. respuesta JSON con b64_json también vale ---------- */
  window.fetch = async () => ({
    ok: true, status: 200, headers: { get: () => 'application/json' },
    json: async () => ({ data: [{ b64_json: 'iVBORw0KGgo' + 'A'.repeat(24) }] })
  });
  await seccion('hf-json', async () => {
    const r = await Providers.generarImagen('huggingface', hfModelo, 'x');
    ok('hf_acepta_json_b64', r.indexOf('data:image/png;base64,') === 0, r.slice(0, 40));
  });

  /* ---------- 4d. el error del servidor se cuenta con el proveedor en el mensaje ---------- */
  window.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'Invalid credentials' }) });
  await seccion('hf-error', async () => {
    let msg = '';
    try { await Providers.generarImagen('huggingface', hfModelo, 'x'); } catch (e) { msg = e.message; }
    ok('hf_error_menciona_hf', /Hugging Face/.test(msg), msg);
  });

  /* ---------- 5b. un modelo de otro proveedor no puede acabar en el hueco de Gemini ----------
   Reproduce el fallo real: "GenerateContentRequest.model: unexpected model name format",
   que salía porque el campo imageModel (de la época en que solo había imágenes de Gemini)
   se copiaba tal cual al hueco de Gemini y podía bringing un id con barra ("meta/muse-image"). */
  await seccion('modelo-contaminado', async () => {
    // el "imageModel" viejo arrastraba el último proveedor de imágenes abierto
    Store.mergeSettings({ imageProvider: 'openrouter', imageModels: { openrouter: 'meta/muse-image' } });
    Store.mergeSettings({ imageModel: 'meta/muse-image' });
    const id = Providers.imageModel('gemini');
    ok('gemini_no_hereda_openrouter', id !== 'meta/muse-image', id);
    ok('gemini_modelo_valido', /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id), id);

    // formato aún más viejo: imageModel suelto sin imageProvider
    Store.mergeSettings({ imageModels: {}, imageModel: 'black-forest-labs/flux.2-pro' });
    const id2 = Providers.imageModel('gemini');
    ok('gemini_ignora_id_con_barra', /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id2), id2);
  });

  /* ---------- 5c. un nombre inválido se avisa en claro, sin gastar la llamada ---------- */
  let llamadasGemini = 0;
  S.keys.gemini = 'AIza-demo';
  Store.mergeSettings({ imageProvider: 'gemini', imageModels: { gemini: 'modelo sin espacios raros/../x' }, keys: { gemini: 'AIza-demo' } });
  window.fetch = async (url) => {
    llamadasGemini++;
    return err(404, 'no deberia llamarse');
  };
  await seccion('gemini-nombre-malo', async () => {
    // se fuerza el valor sucio porque imageModel() ya lo sanea al leer
    let msg = '';
    try {
      await Gemini.generateImage('x', { model: 'meta/muse-image' });
    } catch (e) { msg = e.message; }
    ok('gemini_avisa_nombre_malo', /no es un nombre válido/i.test(msg), msg);
    ok('gemini_no_gasta_llamada', llamadasGemini === 0, 'llamadas=' + llamadasGemini);
  });

  await seccion('gemini-nombre-bueno', async () => {
    let urlVista = '';
    window.fetch = async (url) => {
      urlVista = String(url);
      return resp({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: B64 } }] } }] });
    };
    const r = await Gemini.generateImage('un gato', { model: 'models/gemini-3.1-flash-image' });
    ok('gemini_limpia_prefijo_models', /\/models\/gemini-3\.1-flash-image:generateContent$/.test(urlVista), urlVista);
    ok('gemini_devuelve_dataurl', r.indexOf('data:image/png;base64,') === 0, r.slice(0, 30));
  });
  S.keys.gemini = '';

  /* ---------- 5. si el servidor rechaza los parametros, cuerpo minimo ---------- */
  let fase = 0;
  window.fetch = async (url, opt) => {
    const u = String(url);
    if (u.indexOf('/images/models') >= 0) return resp({ data: [] });
    if (u.indexOf('/api/v1/images') >= 0) {
      fase++;
      ultimaImagen = JSON.parse(opt.body);
      if (fase === 1) return err(400, 'unsupported parameter aspect_ratio');
      return resp({ data: [{ b64_json: B64 }] });
    }
    return err(404, 'no');
  };

  await seccion('escalon', async () => {
    fase = 0;
    const r = await Providers.generarImagen('openrouter', 'modelo-desconocido', 'algo', { aspect: '16:9' });
    ok('reintenta_cuerpo_minimo', fase === 2 && ultimaImagen.aspect_ratio === undefined &&
       ultimaImagen.model === 'modelo-desconocido', JSON.stringify({ fase, ultimaImagen }));
    ok('reintento_devuelve_imagen', r.indexOf(B64) > 0, r);
  });

  /* ---------- 6. equipo: reparto, orden y relevo ---------- */
  const plan = {
    title: 'Titulo del deck', subtitle: 'Sub', author: 'Nadie',
    plan: [
      { n: 1, layout: 'cover', title: 'Portada', idea: '' },
      { n: 2, layout: 'agenda', title: 'Indice', idea: '' },
      { n: 3, layout: 'bullets', title: 'Bloque uno', idea: 'ideas' },
      { n: 4, layout: 'bullets', title: 'Bloque dos', idea: 'ideas' },
      { n: 5, layout: 'stats', title: 'Cifras', idea: 'datos' },
      { n: 6, layout: 'closing', title: 'Cierre', idea: '' }
    ]
  };
  const slide = (n, layout) => ({
    n, layout, title: 'T' + n,
    // con contenido desarrollado: si el modelo devuelve esqueletos, la app los
    // reescribe en una llamada extra y el reparto por tramo ya no sería 1:1
    bullets: (layout === 'bullets' || layout === 'agenda')
      ? ['Reduce el coste de la nube un 30%', 'Despliega cinco veces al dia', 'Suma doce mil usuarios activos']
      : [],
    stats: layout === 'stats' ? [{ value: '45%', label: 'de ahorro en el primer año' }] : [],
    subtitle: (layout === 'cover' || layout === 'closing') ? 'sub' : '',
    notes: 'nota'
  });

  let llamadas = { groq: 0, mistral: 0 };
  window.fetch = async (url, opt) => {
    const u = String(url);
    if (u.indexOf('/chat/completions') < 0) return err(404, 'no');
    const b = JSON.parse(opt.body);
    const quien = /llama/.test(b.model) ? 'groq' : 'mistral';
    llamadas[quien]++;
    const user = b.messages[b.messages.length - 1].content;

    if (PLAN_MARK.test(user)) return resp({ choices: [{ message: { content: JSON.stringify(plan) } }] });

    const m = user.match(/n del (\d+) al (\d+)/) || [];
    const slides = [];
    for (let n = Number(m[1]); n <= Number(m[2]); n++) slides.push(slide(n, plan.plan[n - 1].layout));
    // el relevo: mistral se queda sin cuota en cuanto le toca escribir y groq lo retoma
    if (quien === 'mistral') return err(429, 'rate limit exceeded');
    return resp({ choices: [{ message: { content: JSON.stringify({ slides }) } }] });
  };

  await seccion('equipo', async () => {
    S.cooperativo = true;
    S.keys = { gemini: '', openrouter: '', pollinations: '', groq: 'gsk-x', mistral: 'sk-x', huggingface: '', ollama: '', cloudflare: '' };
    S.models.ollama = '';                       // Ollama no tiene clave: se apaga para aislar el test
    ok('equipo_un_por_proveedor', Providers.chain().length > 2, JSON.stringify(Providers.chain()));
    const progreso = [];
    const deck = await Providers.createDeck(form, { onIntentos: (c, e) => progreso.push(c.model + e) });
    ok('deck_titulo_del_guion', deck.title === 'Titulo del deck', deck.title);
    ok('deck_seis_diapositivas', deck.slides.length === 6, deck.slides.length);
    ok('deck_orden_correcto', deck.slides.map(s => s.title).join(',') === 'T1,T2,T3,T4,T5,T6',
       deck.slides.map(s => s.title).join(','));
    ok('deck_contenido_completo', deck._vacias === 0, 'vacias=' + deck._vacias);
    ok('deck_informa_equipo', Array.isArray(deck._equipo) && deck._equipo.length === 2, JSON.stringify(deck._equipo));
    ok('deck_suma_todos_los_tramos', deck._equipo.reduce((a, u) => a + u.n, 0) === 6, JSON.stringify(deck._equipo));
    ok('relevo_groq_retoma_el_tramo', deck._equipo.every(u => u.provider === 'groq'), JSON.stringify(deck._equipo));
    ok('mistral_reintenta_por_cuota', llamadas.mistral >= 2, JSON.stringify(llamadas));
    ok('progreso_muestra_tramos', progreso.some(p => /diapositivas/.test(p)) && progreso.some(p => /guion/.test(p)),
       progreso.join(' | '));
  });

  /* ---------- 6b. reparto real entre los dos modelos ---------- */
  await seccion('reparto', async () => {
    llamadas = { groq: 0, mistral: 0 };
    window.fetch = async (url, opt) => {
      if (String(url).indexOf('/chat/completions') < 0) return err(404, 'no');
      const b = JSON.parse(opt.body);
      const quien = /llama/.test(b.model) ? 'groq' : 'mistral';
      llamadas[quien]++;
      const user = b.messages[b.messages.length - 1].content;
      if (PLAN_MARK.test(user)) return resp({ choices: [{ message: { content: JSON.stringify(plan) } }] });
      const m = user.match(/n del (\d+) al (\d+)/) || [];
      const slides = [];
      for (let n = Number(m[1]); n <= Number(m[2]); n++) slides.push(slide(n, plan.plan[n - 1].layout));
      return resp({ choices: [{ message: { content: JSON.stringify({ slides }) } }] });
    };
    const deck = await Providers.createDeck(form);
    const porModelo = {};
    (deck._equipo || []).forEach(u => { porModelo[u.provider] = u.n; });
    ok('reparto_groq_3', porModelo.groq === 3, JSON.stringify(porModelo));
    ok('reparto_mistral_3', porModelo.mistral === 3, JSON.stringify(porModelo));
    ok('reparto_sigue_orden', deck.slides.map(s => s.title).join(',') === 'T1,T2,T3,T4,T5,T6',
       deck.slides.map(s => s.title).join(','));
    ok('reparto_1_llamada_por_tramo', llamadas.groq === 2 && llamadas.mistral === 1, JSON.stringify(llamadas));
  });

  /* ---------- 7. con un solo modelo no se reparte ---------- */
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('/chat/completions') < 0) return err(404, 'no');
    return resp({ choices: [{ message: { content: JSON.stringify({ slides: [slide(1, 'cover')] }) } }] });
  };
  await seccion('uno', async () => {
    S.keys.mistral = '';
    const uno = await Providers.createDeck(form);
    ok('un_solo_modelo_no_reparte', (uno._equipo || []).length === 0 && uno.slides.length === 1,
       JSON.stringify({ e: uno._equipo, n: uno.slides.length }));
  });

  /* ---------- 8. equipo desactivado: no se pide guion ---------- */
  let vioGuion = false;
  window.fetch = async (url, opt) => {
    if (String(url).indexOf('/chat/completions') < 0) return err(404, 'no');
    const b = JSON.parse(opt.body);
    if (PLAN_MARK.test(b.messages[1].content)) vioGuion = true;
    return resp({ choices: [{ message: { content: JSON.stringify({ slides: [slide(1, 'cover')] }) } }] });
  };
  await seccion('off', async () => {
    S.cooperativo = false;
    const off = await Providers.createDeck(form);
    ok('cooperativo_desactivado', !vioGuion && (off._equipo || []).length === 0,
       JSON.stringify({ vioGuion, e: off._equipo }));
  });

  /* ---------- 9. avisos cuando no hay claves ---------- */
  await seccion('sin-claves', async () => {
    S.cooperativo = true;
    S.keys = {};
    S.models.ollama = '';
    try { await Providers.createDeck(form); ok('sin_claves_avisa', false, 'no lanzó'); }
    catch (e) { ok('sin_claves_avisa', /proveedor listo/.test(e.message), e.message); }
    // Pollinations sí genera imágenes SIN clave (FLUX), así que la cadena no queda vacía.
    ok('pollinations_entra_sin_clave', Providers.imageChain().some(c => c.provider === 'pollinations'),
       JSON.stringify(Providers.imageChain()));
    window.fetch = async (url) => err(402, 'Payment required');
    try { await Providers.image('algo'); ok('imagen_sin_claves_avisa', false, 'no lanzó'); }
    catch (e) { ok('imagen_sin_claves_avisa', /saturado|Falta la clave|hace falta una clave/i.test(e.message), e.message); }
  });

  /* ---------- 10. catalogos gratuitos ---------- */
  const gratisOr = Providers.imageCatalogo('openrouter').filter(m => m.gratis).map(m => m.id);
  ok('openrouter_3_gratis', gratisOr.length === 3 && gratisOr.indexOf('meta/muse-image') >= 0, gratisOr.join(','));
  ok('huggingface_catalogo', Providers.imageCatalogo('huggingface').length >= 1 &&
     Providers.imageCatalogo('huggingface').some(m => m.id === 'stabilityai/stable-diffusion-3-medium-diffusers'),
     Providers.imageCatalogo('huggingface').map(m => m.id).join(','));
// el modelo por defecto de OpenRouter ya no es muse: pide confirmar +18
ok('defaults_gratis', CONFIG.defaultImageModel.openrouter === 'black-forest-labs/flux.2-klein-4b' &&
         CONFIG.defaultImageModel.huggingface === 'stabilityai/stable-diffusion-3-medium-diffusers', CONFIG.defaultImageModel.openrouter);
  ok('muse_avisa_del_18', /18/.test(Providers.imageCatalogo('openrouter').find(m => m.id === 'meta/muse-image').note));

  window.fetch = origFetch;
  const fallos = R.filter(x => !x.ok);
  return JSON.stringify({
    total: R.length, passed: R.length - fallos.length,
    fallos: fallos.map(f => f.n + ' :: ' + f.d)
  });
})()
