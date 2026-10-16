(async () => {
  const R = [];
  const ok = (n,c,e)=>R.push({n,ok:!!c,d:c?'':(e||'')});
  const err = (s,m)=>({ok:false,status:s,text:async()=>JSON.stringify(m)});

  /* --- 403 real de meta/muse-image: falta confirmar +18 --- */
  const real = { error: { message: 'This model requires you to complete the following before use: 18+ age confirmation. Confirm at https://openrouter.ai/settings/preferences.', code: 403,
    metadata: { missing_attestation_types: ['age_18plus'], routing_funnel: [{step:'Initial Endpoints',endpoint_count:1}], failed_routing_step: 'Gate Endpoints with Attestations' },
    user_id: 'user_3K3' } };

  Store.mergeSettings({ keys: { gemini:'', openrouter:'sk-or-v1-test', pollinations:'', cloudflare:'' },
                        imageProvider:'openrouter', imageModels:{ openrouter:'meta/muse-image', gemini:'', pollinations:'', cloudflare:'' } });
  window.fetch = async () => err(403, real);

  let m = '';
  try { await Providers.image('un gato'); } catch(e) { m = e.message; }
  ok('dice_que_falta_la_edad', /mayor de 18|18 años/i.test(m), m);
  ok('no_culpa_a_la_clave', !/no es válida|no la reconoce/.test(m), m);
  ok('da_la_url_para_resolverlo', /openrouter\.ai\/settings\/preferences/.test(m), m);
  ok('menciona_el_modelo', /muse-image/.test(m), m);
  R.push({ n: '>> 403 por +18', ok: true, d: ' ' + m });

  /* --- 403 por otra atestación --- */
  window.fetch = async () => err(403, { error: { message: 'requires', code:403, metadata:{ missing_attestation_types:['tos_acceptance'] } } });
  let m2 = '';
  try { await Providers.image('x'); } catch(e) { m2 = e.message; }
  ok('otra_atestacion_se_nombra', /tos_acceptance/.test(m2), m2);
  ok('otra_atestacion_no_dice_edad', !/mayor de 18/.test(m2), m2);

  /* --- 401 real: ahora sí habla de la clave --- */
  window.fetch = async () => err(401, { error: { message: 'User not found.', code: 401 } });
  let m3 = '';
  try { await Providers.image('x'); } catch(e) { m3 = e.message; }
  ok('401_sigue_hablando_de_clave', /no reconoce la clave|sk-or-v1/.test(m3), m3);
  R.push({ n: '>> 401 de verdad', ok: true, d: ' ' + m3 });

  /* --- 402 real "never purchased credits" --- */
  window.fetch = async () => err(402, { error: { message: 'Insufficient credits. This account never purchased credits. Make sure your key is on the correct account or org, and if so, purchase more at https://openrouter.ai/settings/credits', code: 402 } });
  let m4 = '';
  try { await Providers.image('x'); } catch(e) { m4 = e.message; }
  ok('402_dice_nunca_comprobo', /nunca ha comprado créditos/i.test(m4), m4);
  ok('402_dice_que_no_importa_el_modelo', /da igual el modelo/i.test(m4), m4);
  ok('402_ya_no_sugiere_modelo_gratis', !/Usa un modelo gratuito/.test(m4), m4);
  R.push({ n: '>> 402 sin créditos', ok: true, d: ' ' + m4 });

  /* --- el catálogo ya no promete que muse sea gratis sin condiciones --- */
  const muse = Providers.imageCatalogo('openrouter').find(m2 => m2.id === 'meta/muse-image');
  ok('muse_avisa_del_18', /18/.test(muse.note), JSON.stringify(muse));
  ok('default_ya_no_es_muse', Providers.byId('openrouter') && true);

  return JSON.stringify({ total: R.length, passed: R.filter(x=>x.ok).length, fallos: R.filter(x=>!x.ok), detalle: R }, null, 1);
})()
