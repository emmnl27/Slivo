(function () {
  var out = { ventana: innerWidth + 'x' + innerHeight, problemas: [] };
  App.openSettings();
  var dlg = document.getElementById('dlgSettings');

  // el dialogo tiene que caber en la ventana y poder desplazarse
  var f = dlg.querySelector('form');
  var b = dlg.getBoundingClientRect();
  out.dialogo = { w: Math.round(b.width), h: Math.round(b.height) };
  if (b.height > innerHeight + 1) out.problemas.push('el dialogo no cabe en la ventana (' + Math.round(b.height) + ' > ' + innerHeight + ')');
  if (dlg.scrollHeight > dlg.clientHeight + 1 && getComputedStyle(dlg).overflowY === 'visible')
    out.problemas.push('el dialogo desborda sin scroll');

  // campos nuevos
  ['fCooperativo', 'fAutoRetry', 'fImgProvider', 'fImgModel', 'imgModelWarn', 'btnListImgModels'].forEach(function (id) {
    if (!document.getElementById(id)) out.problemas.push('FALTA #' + id);
  });

  // el checkbox cooperativo debe estar marcado por defecto y tener etiqueta
  var co = document.getElementById('fCooperativo');
  out.cooperativo_marcado = co.checked;
  if (!co.closest('label').textContent.trim()) out.problemas.push('el checkbox cooperativo no tiene etiqueta');

  // grupos del desplegable de imagen: debe existir el grupo GRATIS
  var sel = document.getElementById('fImgModel');
  var ip = document.getElementById('fImgProvider');
  var s2 = ip;
  s2.value = 'openrouter';
  s2.dispatchEvent(new Event('change'));
  sel = document.getElementById('fImgModel');
  var grupos = Array.prototype.map.call(sel.querySelectorAll('optgroup'), function (g) { return g.label; });
  out.grupos_openrouter = grupos;
  var opOpenRouter = Array.prototype.filter.call(sel.querySelectorAll('option'),
    function (o) { return /muse-image|ming-image/.test(o.value); }).map(function (o) { return o.value; });
  out.modelos_gratitos_openrouter = opOpenRouter;
  if (grupos.indexOf('GRATIS') < 0) out.problemas.push('no hay grupo GRATIS en el catalogo de imagenes de OpenRouter');
  if (opOpenRouter.length !== 3) out.problemas.push('faltan modelos gratuitos de OpenRouter en el desplecible');

  // el proveedor de imagenes debe ofrecer Hugging Face (y ya no Cloudflare)
  var imgOpts = Array.prototype.map.call(document.getElementById('fImgProvider').options, function (o) { return o.value; });
  out.proveedores_imagen = imgOpts;
  if (imgOpts.indexOf('huggingface') < 0) out.problemas.push('Hugging Face no aparece como proveedor de imagenes');
  if (imgOpts.indexOf('cloudflare') >= 0) out.problemas.push('Cloudflare ya no deberia aparecer');
  var txtOpts = Array.prototype.map.call(document.getElementById('fProvider').options, function (o) { return o.value; });
  out.proveedores_texto = txtOpts;
  if (txtOpts.indexOf('huggingface') < 0) out.problemas.push('Hugging Face deberia aparecer como proveedor de texto');

  // texto que se sale de su caja
  var cortados = [];
  dlg.querySelectorAll('.btn, .hint, .check span, select').forEach(function (e) {
    if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow !== 'hidden' && getComputedStyle(e).overflowX !== 'auto')
      cortados.push((e.id || e.className) + '|' + e.textContent.trim().slice(0, 30));
  });
  if (cortados.length) out.problemas.push('texto cortado -> ' + cortados.join(' | '));

  // botones pequenos
  dlg.querySelectorAll('.btn').forEach(function (b2) {
    var r = b2.getBoundingClientRect();
    if (r.height && (r.height < 20 || r.width < 20)) out.problemas.push('boton pequeno ' + (b2.id || b2.textContent) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });

  // elegir Hugging Face repinta el desplegable con su catalogo
  s2.value = 'huggingface';
  s2.dispatchEvent(new Event('change'));
  var sel2 = document.getElementById('fImgModel');
  out.modelo_huggingface = sel2.value;
  out.grupos_huggingface = Array.prototype.map.call(sel2.querySelectorAll('optgroup'), function (g) { return g.label; });
  out.opciones_huggingface = sel2.querySelectorAll('option').length;
  if (!/^stabilityai\/stable-diffusion-3-medium-diffusers$/.test(sel2.value)) out.problemas.push('el modelo por defecto de Hugging Face no es SD3 Medium: ' + sel2.value);
  if (out.opciones_huggingface < 2) out.problemas.push('Hugging Face deberia listar su modelo + la opcion manual, hay ' + out.opciones_huggingface);

  dlg.close();
  return JSON.stringify(out, null, 1);
})()
