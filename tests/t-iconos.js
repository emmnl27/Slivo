(async function () {
  var out = [];

  // El sanitizador debe cargarse cualquier intento de script/handlers
  var bad = Icons.sanitize('<path d="M0 0"/><script>alert(1)<\/script><g onclick="x()"></g>');
  out.push('sanitize=' + (bad.indexOf('script') < 0 && bad.indexOf('onclick') < 0));

  var svg = Icons.svg(Store.normIcon({ name: 'x', body: '<path d="M0 0"/>', w: 24, h: 24 }));
  out.push('svg=' + (svg.indexOf('<svg') === 0 && svg.indexOf('</svg>') > 0));
  out.push('norm_basura=' + (Store.normIcon({ body: '' }) === null));

  // Iconify en vivo + render dentro de una diapositiva
  try {
    var list = await Icons.buscarIconos('rocket', 6);
    out.push('iconos=' + list.length);
    if (list[0]) out.push('icono=' + list[0].name + ' body=' + !!list[0].body);
  } catch (e) { out.push('iconos_ERROR=' + e.message); }

  var deck = App.deck();
  var s = Store.blankSlide('bullets');
  s.title = 'T';
  s.bullets = ['uno', 'dos'];
  deck.slides = [s];
  App.state.ui.selected = 0;

  var icon = { name: 'mdi:rocket', body: '<path fill="currentColor" d="M0 0h24v24H0z"/>', w: 24, h: 24 };
  Editor.setIcon('bullet', 0, icon);
  var html = document.querySelector('#deck .slide').innerHTML;
  out.push('render_ico=' + (html.indexOf('bullet-ico') > 0 && html.indexOf('ico-svg') > 0));

  Editor.setIcon('bullet', 0, null);
  html = document.querySelector('#deck .slide').innerHTML;
  out.push('quitar=' + (html.indexOf('bullet-ico') < 0));

  return out.join(' | ');
})()
