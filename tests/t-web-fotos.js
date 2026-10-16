(async function () {
  var out = [];

  try {
    var wm = await Web.wikimedia('cohete', 4);
    out.push('wikimedia=' + wm.length);
    var ov = await Web.openverse('rocket', 4);
    out.push('openverse=' + ov.length);
  } catch (e) { out.push('fuentes_ERROR=' + e.message); }

  try {
    var fotos = await Web.buscar('lanzamiento de un cohete', { n: 6 });
    var fuentes = Array.from(new Set(fotos.map(function (f) { return f.source; })));
    out.push('fotos=' + fotos.length + ' fuentes=' + fuentes.length);

    var m = Web.mejor(fotos);
    out.push('mejor=' + (m ? m.source : 'ninguna'));

    if (m) {
      var data = await Web.aDataUrl(m);
      out.push('data=' + (data.slice(0, 11) === 'data:image/'));

      var deck = App.deck();
      var s = Store.blankSlide('bullets');
      deck.slides = [s];
      App.state.ui.selected = 0;
      await Web.usar(s, 0, m);
      out.push('en_hueco=' + (Store.slideImages(s)[0].slice(0, 11) === 'data:image/'));
      out.push('layout=' + s.layout);
      var cr = Store.imageCredits(s)[0];
      out.push('credito=' + (cr && cr.source ? 'si' : 'no'));
    }
  } catch (e) { out.push('ERROR=' + e.message); }

  return out.join(' | ');
})()
