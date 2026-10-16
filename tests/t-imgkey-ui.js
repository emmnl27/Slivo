(async () => {
  const R = [];
  const ok = (n,c,e)=>R.push({n,ok:!!c,d:c?'':(e||'')});
  const $ = id => document.getElementById(id);
  const err = (s,m)=>({ok:false,status:s,text:async()=>JSON.stringify(m)});

  /* --- 1. la pieza que faltaba: un input de clave en la sección de imágenes --- */
  ok('existe_campo_de_clave_de_imagenes', !!$('fImgKey'), 'falta #fImgKey');
  ok('existe_boton_comprobar_imagenes', !!$('btnCheckImgKey'), 'falta #btnCheckImgKey');
  ok('existe_aviso_imagenes', !!$('imgKeyCheck'));

  /* --- 2. Hugging Face sirve texto e imágenes, y las imágenes usan su ruta propia --- */
  const hf = Providers.byId('huggingface');
  ok('hf_es_imagen', hf.imagen === true);
  ok('hf_necesita_clave', hf.needsKey === true);
  ok('hf_sale_como_texto', Providers.textoProviders().some(p => p.id === 'huggingface'));
  ok('hf_sale_como_imagen', Providers.imageProviders().some(p => p.id === 'huggingface'));
  ok('hf_ruta_de_imagen_propia', /hf-inference/.test(hf.imageBase || ''), hf.imageBase);

  /* --- 3. el botón comprueba el token de Hugging Face --- */
  Store.mergeSettings({ keys: { huggingface: 'hf_demo' } });
  window.fetch = async (url) => {
    if (/router\.huggingface\.co\/v1\/models/.test(String(url)))
      return { ok:true, status:200, text: async () => JSON.stringify({ data: [{ id: 'meta-llama/Llama-3.2-3B-Instruct' }] }) };
    return err(404, 'no');
  };
  let r1 = await Providers.checkKey('huggingface');
  ok('token_valido_aceptado', r1.ok, JSON.stringify(r1));
  R.push({ n: '>> token Hugging Face correcto', ok: true, d: ' ' + r1.texto });

  window.fetch = async () => err(401, { error: 'Invalid credentials' });
  let r2 = await Providers.checkKey('huggingface');
  ok('token_malo_detectado', !r2.ok, JSON.stringify(r2));
  R.push({ n: '>> token Hugging Face incorrecto', ok: true, d: ' ' + r2.texto });

  /* --- 4. guardar desde el diálogo escribe la clave del proveedor de imágenes.
         Texto con Gemini e imágenes con Hugging Face → aparece el campo aparte. --- */
  Store.mergeSettings({ provider: 'gemini', keys: { huggingface: '' } });
  App.openSettings();
  await new Promise(r => setTimeout(r, 60));
  ok('selector_relleno', $('fImgProvider').options.length >= 3, String($('fImgProvider').options.length));
  $('fImgProvider').value = 'huggingface';
  $('fImgProvider').dispatchEvent(new Event('change'));
  ok('selector_muestra_hf', $('fImgProvider').value === 'huggingface');
  ok('campo_visible_para_hf', !$('wrapImgKey').classList.contains('is-hidden'));
  ok('etiqueta_correcta', /Hugging Face/i.test($('imgKeyLabel').textContent), $('imgKeyLabel').textContent);
  ok('ayuda_apunta_a_tokens', /huggingface\.co\/settings\/tokens/.test($('imgKeyUrl').href), $('imgKeyUrl').href);
  ok('aviso_pide_la_clave', /clave de Hugging Face/i.test($('imgModelWarn').textContent) &&
     /campo de arriba|Falta la clave/.test($('imgModelWarn').textContent), $('imgModelWarn').textContent);
  R.push({ n: '>> aviso en Ajustes', ok: true, d: ' ' + $('imgModelWarn').textContent });

  /* --- 5. escribir la clave con basura y guardar: queda limpia --- */
  $('fImgKey').value = '  hf_token\ncon-espacios  ';
  $('fImgKey').dispatchEvent(new Event('input'));
  ok('el_input_limpia_la_clave', /\s/.test($('fImgKey').value) === false, JSON.stringify($('fImgKey').value));
  ok('dialogo_abierto', $('dlgSettings').open === true, 'open=' + $('dlgSettings').open);
  $('dlgSettings').returnValue = 'save';
  $('dlgSettings').close('save');
  await new Promise(r => setTimeout(r, 250));
  ok('clave_guardada', Providers.key('huggingface') === 'hf_tokencon-espacios', 'got=' + JSON.stringify(Providers.key('huggingface')));
  ok('ya_entra_en_la_cadena', Providers.imageChain().some(c => c.provider === 'huggingface'), 'imgProv=' + Providers.imageProvider() + ' ' + JSON.stringify(Providers.imageChain()));

  /* --- 6. Pollinations sí tiene needsKey, pero su ruta de imágenes funciona sin
         ella: el campo se muestra igual (puede pegarse una clave para los modelos
         de pago), y la app debe seguir entrando en la cadena sin clave. --- */
  App.openSettings();
  await new Promise(r => setTimeout(r, 60));
  $('fImgProvider').value = 'pollinations';
  $('fImgProvider').dispatchEvent(new Event('change'));
  ok('pollinations_tiene_ruta_sin_clave', Providers.byId('pollinations').imagenSinClave === true);
  ok('pollinations_muestra_su_campo', !$('wrapImgKey').classList.contains('is-hidden'));
  Store.mergeSettings({ keys: { huggingface: 'x', pollinations: '' }, imageProvider: 'pollinations' });
  ok('pollinations_entra_sin_clave', Providers.imageChain().some(c => c.provider === 'pollinations'),
     JSON.stringify(Providers.imageChain()));
  $('dlgSettings').returnValue = 'cancel';
  $('dlgSettings').close('cancel');
  await new Promise(r => setTimeout(r, 60));

  /* --- 7. si el proveedor de imágenes ES el de texto, no debe salir un segundo
         campo: dos inputs sobre la misma clave se pisarían al guardar. --- */
  Store.mergeSettings({ provider: 'openrouter', imageProvider: 'openrouter',
    keys: { openrouter: 'clave-vieja', huggingface: 'hf_tokencon-espacios' } });
  App.openSettings();
  await new Promise(r => setTimeout(r, 60));
  ok('mismo_proveedor_no_duplica_campo', $('wrapImgKey').classList.contains('is-hidden'),
     'texto=' + $('fProvider').value);
  // y la clave del campo de texto se guarda tal cual, sin que la pise la de imágenes
  $('fKey').value = 'clave-nueva-correcta';
  $('fKey').dispatchEvent(new Event('input'));
  $('dlgSettings').returnValue = 'save';
  $('dlgSettings').close('save');
  await new Promise(r => setTimeout(r, 250));
  ok('texto_no_se_pisa_con_imagenes', Providers.key('openrouter') === 'clave-nueva-correcta', Providers.key('openrouter'));

  return JSON.stringify({ total: R.length, passed: R.filter(x=>x.ok).length, fallos: R.filter(x=>!x.ok), detalle: R }, null, 1);
})()

