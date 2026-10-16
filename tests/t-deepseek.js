(async () => {
  const R = [];
  const ok = (n, c, extra) => R.push({ n, ok: !!c, d: c ? '' : (extra || '') });
  const seccion = async (nombre, fn) => { try { await fn(); } catch (e) { R.push({ n: 'EXCEPCION@' + nombre, ok: false, d: e.message }); } };
  const S = Store.state.settings;
  const origFetch = window.fetch;
  const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });

  await seccion('registro', async () => {
    const ids = Providers.textoProviders().map(p => p.id);
    ok('deepseek_es_texto', ids.indexOf('deepseek') >= 0, ids.join(','));
    const imgIds = Providers.imageProviders().map(p => p.id);
    ok('deepseek_no_es_imagen', imgIds.indexOf('deepseek') < 0, imgIds.join(','));
    ok('catalogo_dos_modelos', Providers.catalogo('deepseek').length === 2,
      JSON.stringify(Providers.catalogo('deepseek').map(m => m.id)));
    ok('modelo_por_defecto', CONFIG.defaultModel.deepseek === 'deepseek-chat', CONFIG.defaultModel.deepseek);
    const prov = Providers.byId('deepseek');
    ok('estilo_openai', prov && prov.style === 'openai', prov && prov.style);
    ok('pide_max_tokens', prov && prov.maxTokens === 8192, prov && prov.maxTokens);
  });

  await seccion('clave', async () => {
    const antes = S.keys.deepseek;
    S.keys.deepseek = '';
    const sin = await Providers.checkKey('deepseek');
    ok('sin_clave_avisa', sin.ok === false && /ninguna clave/.test(sin.texto), sin.texto);
    S.keys.deepseek = 'xx-mala';
    const mala = await Providers.checkKey('deepseek');
    ok('prefijo_sk', mala.ok === false && /sk-/.test(mala.texto), mala.texto);
    S.keys.deepseek = antes;
  });

  await seccion('peticion', async () => {
    let url = '', body = null, auth = '';
    window.fetch = async (u, opt) => {
      url = String(u);
      body = JSON.parse(opt.body);
      auth = (opt.headers && opt.headers.Authorization) || '';
      return resp({ choices: [{ message: { content: '{"ok":true}' } }] });
    };
    const provAntes = S.provider, keysAntes = S.keys.deepseek, modAntes = S.models.deepseek, retryAntes = S.autoRetry;
    S.provider = 'deepseek';
    S.keys.deepseek = 'sk-prueba';
    S.models.deepseek = 'deepseek-chat';
    S.autoRetry = false;
    const r = await Providers.askJson({ system: 's', user: 'u' });
    ok('url_deepseek', url === 'https://api.deepseek.com/chat/completions', url);
    ok('modelo_chat', body && body.model === 'deepseek-chat', body && body.model);
    ok('max_tokens_8192', body && body.max_tokens === 8192, body && body.max_tokens);
    ok('auth_bearer', auth === 'Bearer sk-prueba', auth);
    ok('devuelve_datos', r && r.data && r.data.ok === true, JSON.stringify(r && r.data));
    S.provider = provAntes; S.keys.deepseek = keysAntes; S.models.deepseek = modAntes; S.autoRetry = retryAntes;
  });

  window.fetch = origFetch;
  return JSON.stringify({ total: R.length, passed: R.filter(x => x.ok).length, fallos: R.filter(x => !x.ok), detalle: R });
})()