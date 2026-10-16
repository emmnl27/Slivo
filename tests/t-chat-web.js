(async function () {
  var out = [];

  out.push('detecta_web=' + Chat.pideFotosWeb('añade imágenes de la web'));
  out.push('detecta_foto=' + Chat.pideFotosWeb('pon una foto de un cohete'));
  out.push('no_detecta_ia=' + Chat.pideFotosWeb('genera una imagen con IA'));
  out.push('no_detecta_texto=' + Chat.pideFotosWeb('cambia el título de la 2'));

  var a1 = Chat.adaptaAcciones([{ op: 'set_image', slide: 1, prompt: 'rocket launch' }], true);
  out.push('set_image→web=' + (a1[0].op === 'web_image' && a1[0].query === 'rocket launch'));
  var a2 = Chat.adaptaAcciones([{ op: 'set_image', slide: 1, prompt: 'rocket launch' }], false);
  out.push('ia_intacta=' + (a2[0].op === 'set_image'));
  var a3 = Chat.adaptaAcciones([{ op: 'web_image', slide: 1, query: 'cohete' }], false);
  out.push('web_intacta=' + (a3[0].op === 'web_image'));

  var deck = App.deck();
  deck.slides = [
    Store.blankSlide('image'), Store.blankSlide('image'),
    Store.blankSlide('bullets')
  ];
  deck.slides[0].title = 'Cohetes';
  deck.slides[1].title = 'Montañas';
  App.state.ui.selected = 0;
  Editor.refresh();

  var t0 = Date.now();
  var r = await Chat.aplicar([{ op: 'web_image', slides: [1, 2], query: 'rocket launch' }], Date.now() + 150000);
  var ms = Date.now() - t0;
  var con = deck.slides.filter(function (s) { return (Store.slideImages(s)[0] || '').slice(0, 11) === 'data:image/'; }).length;
  out.push('fotos=' + con);
  out.push('etiquetas=' + r.etiquetas.length);
  out.push('rapido=' + (ms < 45000));
  out.push('avisos=' + (r.avisos.length ? r.avisos.join(' / ') : 'ninguno'));
  out.push('credito=' + ((Store.imageCredits(deck.slides[0])[0] || {}).source || 'ninguno'));

  var r2 = await Chat.aplicar([{ op: 'web_image', slide: 99, query: 'nada' }]);
  out.push('slide_inexistente=' + (r2.avisos.length === 1 && r2.etiquetas.length === 0));

  return out.join(' | ');
})()