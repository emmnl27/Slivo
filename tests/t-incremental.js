(async function () {
  var out = [];
  var d = App.deck();
  while (d.slides.length < 3) d.slides.push(Store.blankSlide('bullets'));
  Store.state.ui.selected = 0;
  Editor.refresh();

  var sec0 = document.querySelector('#deck .slide[data-index="0"]');
  var sec1 = document.querySelector('#deck .slide[data-index="1"]');
  var sec2 = document.querySelector('#deck .slide[data-index="2"]');

  d.slides[1].title = 'CAMBIADO 123';
  Editor.refreshSlide(1);

  var sec0b = document.querySelector('#deck .slide[data-index="0"]');
  var sec1b = document.querySelector('#deck .slide[data-index="1"]');
  var sec2b = document.querySelector('#deck .slide[data-index="2"]');

  out.push('slides=' + document.querySelectorAll('#deck .slide').length);
  out.push('otras_intactas=' + ((sec0 === sec0b) && (sec2 === sec2b)));
  out.push('cambiada_nueva=' + (sec1 !== sec1b));
  out.push('titulo=' + /CAMBIADO 123/.test(sec1b.textContent));

  var th = document.querySelector('.thumb[data-i="1"]');
  out.push('thumb_actualizado=' + !!(th && /CAMBIADO 123/.test(th.textContent)));
  out.push('sel_preservada=' + document.querySelector('#deck .slide[data-index="0"]').classList.contains('selected'));

  return out.join(' | ');
})()
