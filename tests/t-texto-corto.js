(async () => {
  const R = [];
  const ok = (n, c, extra) => R.push({ n, ok: !!c, d: c ? '' : (extra || '') });
  const seccion = async (nombre, fn) => { try { await fn(); } catch (e) { R.push({ n: 'EXCEPCION@' + nombre, ok: false, d: e.message }); } };
  const S = Store.state.settings;
  const origFetch = window.fetch;
  const form = { topic: 'Prueba de texto', count: 4, language: 'es', audience: 'general', tone: 'profesional', style: 'limpio', notes: '', density: 'normal' };

  const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
  const PLAN_MARK = /"plan":\[/;

  // Un modelo que responde con esqueletos: tres palabras por viñeta.
  const seco = [
    { layout: 'cover', title: 'Portada', subtitle: 'sub' },
    { layout: 'bullets', title: 'Bloque', bullets: ['Datos', 'Costes', 'Ventajas'] },
    { layout: 'stats', title: 'Cifras', stats: [{ value: '45%', label: 'ahorro' }] },
    { layout: 'closing', title: 'Cierre', subtitle: 'sub' }
  ];
  const bloques = ['Reduce el coste de la nube un 30% al migrar a contenedores', 'El equipo despliega cinco veces al dia sin tocar el servidor'];
  const ligero = ['Reduce costes', 'Mejora calidad', 'Suma adopters', 'Acorta plazos'];

  let peticiones = 0;
  let reparacion = '';
  let estilo = 'seco';

  const bulletsDe = () => (estilo === 'seco' ? ['Datos', 'Costes', 'Ventajas'] : (estilo === 'ligero' ? ligero : bloques));

  function responder(user) {
    if (PLAN_MARK.test(user)) {
      return resp({ choices: [{ message: { content: JSON.stringify({
        title: 'Deck', subtitle: 'Sub', author: '',
        plan: seco.map((s, i) => ({ n: i + 1, layout: s.layout, title: s.title, idea: 'algo' }))
      }) } }] });
    }
    if (/motivo/.test(user)) {                       // la reparación de contenido
      reparacion = user;
      return resp({ choices: [{ message: { content: JSON.stringify({
        slides: [{ n: 2, layout: 'bullets', title: 'Bloque', bullets: bloques }]
      }) } }] });
    }
    const m = user.match(/n del (\d+) al (\d+)/);
    const desde = m ? Number(m[1]) : 1;
    const hasta = m ? Number(m[2]) : seco.length;
    const slides = [];
    for (let n = desde; n <= hasta; n++) {
      const base = seco[n - 1] || {};
      slides.push(Object.assign({ n }, base.layout === 'bullets' ? Object.assign({}, base, { bullets: bulletsDe() }) : base));
    }
    return resp({ choices: [{ message: { content: JSON.stringify({ title: 'Deck', subtitle: 'Sub', slides }) } }] });
  }

  window.fetch = async (url, opt) => {
    const u = String(url);
    if (u.indexOf('/chat/completions') < 0) return { ok: false, status: 404, text: async () => '{"error":{"message":"no"}}' };
    peticiones++;
    const b = JSON.parse(opt.body);
    return responder(b.messages[b.messages.length - 1].content);
  };

  Store.mergeSettings({ cooperativo: false });
  S.keys = { gemini: '', openrouter: '', pollinations: '', groq: 'gsk-x', mistral: '', huggingface: '', ollama: '', cloudflare: '' };
  S.models.groq = 'llama-3.3-70b-versatile';
  S.models.mistral = 'mistral-small-latest';
  S.provider = 'groq';
  S.autoRetry = false;

  await seccion('esqueleto', async () => {
    estilo = 'seco';
    peticiones = 0;
    reparacion = '';
    const deck = await Providers.createDeck(form);
    const s2 = deck.slides[1];
    ok('una_llamada_de_reparacion', peticiones === 2, 'peticiones=' + peticiones);
    ok('la_reparacion_avisa_del_motivo', /"motivo":"corta"/.test(reparacion), reparacion.slice(0, 300));
    ok('repara_el_bloque', (s2.bullets || []).some(b => b.length > 40), JSON.stringify(s2.bullets));
    ok('cuenta_reparadas', deck._reparadas === 1, 'reparadas=' + deck._reparadas);
    ok('no_quedan_cortas', (deck._vacias || 0) === 0, 'vacias=' + deck._vacias);
    ok('los_titulos_no_se_pisan', s2.title === 'Bloque', s2.title);
  });

  await seccion('ya_desarrollado', async () => {
    estilo = 'largo';
    peticiones = 0;
    reparacion = '';
    const deck = await Providers.createDeck(form);
    ok('sin_llamada_extra', peticiones === 1 && reparacion === '', 'peticiones=' + peticiones + ' reparacion=' + !!reparacion);
    ok('reparadas_a_cero', deck._reparadas === 0, 'reparadas=' + deck._reparadas);
  });

  await seccion('ligero_no_se_queja', async () => {
    estilo = 'ligero';
    peticiones = 0;
    reparacion = '';
    const deck = await Providers.createDeck(Object.assign({}, form, { density: 'ligero' }));
    ok('ligero_no_reparte_texto', peticiones === 1 && reparacion === '', 'peticiones=' + peticiones + ' reparacion=' + !!reparacion);
    ok('ligero_sin_avisos', (deck._vacias || 0) === 0, 'vacias=' + deck._vacias);
  });

  window.fetch = origFetch;
  return JSON.stringify({ total: R.length, passed: R.filter(x => x.ok).length, fallos: R.filter(x => !x.ok), detalle: R });
})()