(async () => {
  const R = [];
  const ok = (n, c, extra) => R.push({ n, ok: !!c, d: c ? '' : (extra || '') });
  const resp = obj => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
  const err = (s, m) => ({ ok: false, status: s, text: async () => JSON.stringify({ error: { message: m } }) });
  const B64 = new Array(40).join('QUFB');
  const S = Store.state.settings;

  // el usuario elige OpenRouter + Muse Image, y también tiene clave de Gemini
  Store.mergeSettings({
    provider: 'groq',
    keys: { gemini: 'AIza-x', openrouter: 'sk-or-x', pollinations: 'pk-x', groq: 'gsk-x', mistral: '', cloudflare: '' },
    imageProvider: 'openrouter',
    imageModels: { openrouter: 'black-forest-labs/flux.2-klein-4b', gemini: 'gemini-3.1-flash-image' }
  });

  ok('proveedor_guardado_es_openrouter', Providers.imageProvider() === 'openrouter', Providers.imageProvider());
  ok('modelo_guardado_es_muse', Providers.imageModel() === 'black-forest-labs/flux.2-klein-4b', Providers.imageModel());
  const chain = Providers.imageChain();
  ok('cadena_empieza_por_el_elegido', chain[0].provider === 'openrouter', JSON.stringify(chain));
  ok('cadena_larga_' + chain.length, chain.length >= 2, JSON.stringify(chain.map(c => c.provider)));

  // Muse falla; Gemini también. ¿Qué error ve el usuario?
  const llamado = [];
  window.fetch = async (url, opt) => {
    const u = String(url);
    if (u.indexOf('generativelanguage') >= 0) { llamado.push('gemini'); return err(429, 'Quota exceeded for quota metric'); }
    if (opt && opt.body) { const b = JSON.parse(opt.body); llamado.push(b.model); return err(402, 'This model requires more credits'); }
    return err(404, 'no');
  };

  let mensaje = '';
  try { await Providers.image('un gato'); } catch (e) { mensaje = e.message; }

  ok('intenta_el_elegido_primero', llamado[0] === 'black-forest-labs/flux.2-klein-4b', JSON.stringify(llamado));
  ok('intenta_gemini_despues', llamado.indexOf('gemini') >= 0, JSON.stringify(llamado));
  R.push({ n: '>> mensaje que ve el usuario', ok: true, d: ' ' + mensaje });
  ok('el_error_menciona_a_openrouter', /OpenRouter/i.test(mensaje), mensaje);
  ok('el_error_menciona_a_gemini', /Gemini/i.test(mensaje), mensaje);
  ok('el_error_dice_cuantos', /ninguno de los \d+ proveedores/i.test(mensaje), mensaje);

  // con un solo proveedor el mensaje es el de ese, sin envolver
  Store.mergeSettings({ autoRetry: false });
  let msg2 = '';
  try { await Providers.image('un gato'); } catch (e) { msg2 = e.message; }
  ok('un_proveedor_mensaje_directo', /OpenRouter/.test(msg2) && !/ninguno de los/i.test(msg2), msg2);

  // Muse no declara ningún parámetro: no se le manda "n"
  let cuerpoMuse = null;
  window.fetch = async (url, opt) => {
    if (/openrouter\.ai/.test(String(url))) { cuerpoMuse = JSON.parse(opt.body); return resp({ data: [{ b64_json: B64 }] }); }
    return err(404, 'no');
  };
  const r2 = await Providers.image('un gato');
  ok('muse_devuelve_imagen', /data:image/.test(r2), String(r2).slice(0, 30));
  ok('muse_sin_n', cuerpoMuse && cuerpoMuse.n === undefined, JSON.stringify(cuerpoMuse));
  ok('muse_solo_modelo_y_prompt', cuerpoMuse && Object.keys(cuerpoMuse).sort().join(',') === 'model,prompt', JSON.stringify(cuerpoMuse));

  /* --- el caso real queinsured al usuario: elige OpenRouter pero sin clave --- */
  Store.mergeSettings({
    autoRetry: true,
    keys: { gemini: 'AIza-x', openrouter: '', pollinations: '' },
    imageProvider: 'openrouter',
    imageModels: { openrouter: 'meta/muse-image', gemini: '', pollinations: '', cloudflare: '' }
  });
  ok('openrouter_elegido_sin_clave', Providers.imageProvider() === 'openrouter' && !Providers.key('openrouter'),
     Providers.imageProvider());
  const cadenaSinClave = Providers.imageChain();
  ok('cadena_empieza_en_gemini', cadenaSinClave[0].provider === 'gemini', JSON.stringify(cadenaSinClave));
  ok('pollinations_respalda_sin_clave', cadenaSinClave.some(c => c.provider === 'pollinations'), JSON.stringify(cadenaSinClave));

  window.fetch = async (url) => {
    if (/generativelanguage/.test(String(url))) return err(429, 'Quota exceeded for quota metric');
    return err(404, 'no deberia llamarse');
  };
  let msg3 = '';
  try { await Providers.image('un gato'); } catch (e) { msg3 = e.message; }
  ok('avisa_que_elegiste_openrouter', /elegiste OpenRouter/i.test(msg3), msg3);
  ok('avisa_que_no_tiene_clave', /no tiene clave guardada/i.test(msg3), msg3);
  R.push({ n: '>> mensaje con OpenRouter sin clave', ok: true, d: ' ' + msg3 });

  /* --- sin ninguna clave: Pollinations aguanta la cadena y el aviso lo explica --- */
  Store.mergeSettings({ keys: { gemini: '', openrouter: '', pollinations: '', cloudflare: '' } });
  window.fetch = async (url) => (/pollinations/.test(String(url)) ? err(402, 'Payment required') : err(404, 'no'));
  let msg4 = '';
  try { await Providers.image('un gato'); } catch (e) { msg4 = e.message; }
  ok('sin_claves_intenta_pollinations', /Pollinations/.test(msg4), msg4);
  ok('avisa_de_saturacion_con_ayuda', /saturado/i.test(msg4) && /Hugging Face/.test(msg4), msg4);
  R.push({ n: '>> mensaje sin ninguna clave', ok: true, d: ' ' + msg4 });

  return JSON.stringify({ total: R.length, passed: R.filter(r => r.ok).length, fallos: R.filter(r => !r.ok), detalle: R }, null, 1);
})()
