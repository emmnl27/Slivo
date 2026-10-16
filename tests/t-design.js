(function () {
  var S = Store, E = Editor;
  function mk(layout, extra) { var s = S.blankSlide(layout); if (extra) Object.assign(s, extra); return s; }
  var img = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
  var base = [
    mk('cover', { kicker: 'PRODUCTO 2026', title: 'Diseño que respira', subtitle: 'Una nueva forma de presentar ideas con claridad', author: 'Equipo DeckAI', date: 'Octubre 2026', images: [img] }),
    mk('section', { kicker: 'BLOQUE 01', title: 'El problema', subtitle: 'Por qué importa la presentación' }),
    mk('agenda', { kicker: 'Índice', title: 'Lo que veremos', bullets: ['Contexto', 'Estrategia', 'Resultados', 'Equipo', 'Roadmap', 'Cierre'] }),
    mk('bullets', { kicker: 'Ideas clave', title: 'Puntos que importan', bullets: ['Primer punto relevante', 'Segundo punto con algo más de texto para probar el ajuste', 'Tercer punto', 'Cuarto punto', 'Quinto punto'] }),
    mk('two-col', { kicker: 'Comparación', title: 'Antes y después', columns: [{ heading: 'Antes', items: ['Manual', 'Lento', 'Costoso'] }, { heading: 'Después', items: ['Automático', 'Rápido', 'Escalable'] }, { heading: 'Extra', items: ['A', 'B', 'C'] }] }),
    mk('image', { kicker: 'Visual', title: 'Imagen y texto', bullets: ['Detalle uno', 'Detalle dos'], images: [img], imgCount: 1 }),
    mk('image-full', { kicker: 'A sangre', title: 'Imagen completa', subtitle: 'Con panel de texto sobre la foto', images: [img], imgCount: 1 }),
    mk('gallery', { kicker: 'Galería', title: 'Tres imágenes', subtitle: 'Mosaico con hero', images: [img, img, img], imgCount: 3 }),
    mk('gallery', { kicker: 'Galería', title: 'Cuatro imágenes', subtitle: 'Cuadrícula 2x2', images: [img, img, img, img], imgCount: 4 }),
    mk('stats', { kicker: 'Datos', title: 'Números que hablan', subtitle: 'Indicadores del trimestre', stats: [{ value: '98%', label: 'Satisfacción' }, { value: '3.2x', label: 'Crecimiento' }, { value: '24/7', label: 'Soporte' }, { value: '12k', label: 'Usuarios' }] }),
    mk('bars', { kicker: 'Comparativa', title: 'Barras', subtitle: 'Cifras comparables', stats: [{ value: '45%', label: 'Ahorro' }, { value: '30%', label: 'Crecimiento' }, { value: '12k', label: 'Usuarios' }] }),
    mk('table', { kicker: 'Datos', title: 'Tabla', tcols: ['Año', 'Ventas'], trows: [['2024', '1 M€'], ['2025', '2 M€']] }),
    mk('checklist', { kicker: 'Control', title: 'Verificación', bullets: ['Verificar las copias', 'Confirmar los accesos', 'Revisar los registros'] }),
    mk('cards', { kicker: 'Ventajas', title: 'Tarjetas', cards: [{ heading: 'Rápido', text: 'Despliega en minutos' }, { heading: 'Seguro', text: 'Cifrado de extremo a extremo' }] }),
    mk('timeline', { kicker: 'Proceso', title: 'Cómo funciona', steps: [{ title: 'Descubre', text: 'Analizamos el contexto' }, { title: 'Diseña', text: 'Creamos la propuesta' }, { title: 'Construye', text: 'Desarrollamos' }, { title: 'Lanza', text: 'Publicamos' }] }),
    mk('quote', { quote: 'El diseño no es solo cómo se ve, es cómo funciona.', quoteAuthor: 'Steve Jobs' }),
    mk('closing', { kicker: 'Gracias', title: '¿Preguntas?', subtitle: 'Hablemos de tu proyecto' })
  ];
  var themes = ['aurora', 'minimal', 'corporate', 'sunset', 'forest', 'mono', 'neon', 'ocean'];
  var problemas = [];
  var info = [];

  themes.forEach(function (th) {
    Store.state.deck = Store.normalizeDeck({ title: 'Demo', theme: th, slides: JSON.parse(JSON.stringify(base)) });
    Editor.refresh();
    var secs = document.querySelectorAll('#deck .slide');
    if (secs.length !== base.length) problemas.push(th + ': slides=' + secs.length);
    secs.forEach(function (sec, i) {
      var inner = sec.querySelector('.slide-inner');
      if (!inner) { problemas.push(th + ' slide ' + i + ': sin .slide-inner'); return; }
      if (!sec.querySelector('.deco')) problemas.push(th + ' slide ' + i + ': sin .deco');
      var r = sec.getBoundingClientRect();
      var lay = (sec.className.match(/l-[\w-]+/) || ['?'])[0];
      if (inner.scrollHeight > inner.clientHeight + 3) {
        problemas.push(th + ' slide ' + i + ' ' + lay + ': inner desborda ' + inner.scrollHeight + '>' + inner.clientHeight);
      }
      Array.prototype.forEach.call(inner.children, function (el) {
        if (el.classList.contains('sec-num') || el.classList.contains('mark') || el.classList.contains('deco')) return;
        var b = el.getBoundingClientRect();
        if (b.height === 0) return;
        if (b.bottom > r.bottom + 1) problemas.push(th + ' slide ' + i + ' ' + lay + ': ' + (el.className || el.tagName) + ' abajo +' + Math.round(b.bottom - r.bottom) + 'px');
        if (b.top < r.top - 1) problemas.push(th + ' slide ' + i + ' ' + lay + ': ' + (el.className || el.tagName) + ' arriba -' + Math.round(r.top - b.top) + 'px');
        if (b.right > r.right + 1) problemas.push(th + ' slide ' + i + ' ' + lay + ': ' + (el.className || el.tagName) + ' derecha +' + Math.round(b.right - r.right) + 'px');
      });
      if (i === 0) {
        var deco = getComputedStyle(sec.querySelector('.deco span:nth-child(1)'));
        info.push(th + ': accent=' + getComputedStyle(sec).getPropertyValue('--accent').trim() + ' deco-op=' + deco.opacity);
        // la portada lleva foto: el título tiene que quedar entero dentro de la
        // diapositiva y por encima del velo degradado (si no, se apaga o se recorta)
        var h1 = sec.querySelector('h1.big');
        if (!h1) { problemas.push(th + ': portada sin h1.big'); }
        else {
          var hb = h1.getBoundingClientRect();
          if (hb.left < r.left - 1) problemas.push(th + ': titulo portada cortado por la izquierda');
          if (hb.right > r.right + 1) problemas.push(th + ': titulo portada cortado por la derecha');
          var hz = getComputedStyle(h1);
          if (hz.position !== 'relative' || parseInt(hz.zIndex, 10) < 2)
            problemas.push(th + ': titulo portada bajo el velo (pos=' + hz.position + ' z=' + hz.zIndex + ')');
          var velo = getComputedStyle(sec.querySelector('.slide-inner'), '::after');
          if (velo.position !== 'absolute' || parseInt(velo.zIndex, 10) !== 1)
            problemas.push(th + ': velo de portada fuera de su capa (pos=' + velo.position + ' z=' + velo.zIndex + ')');
        }
      }
    });
  });
  Store.state.deck = Store.normalizeDeck({ title: 'Demo', theme: 'aurora', slides: JSON.parse(JSON.stringify(base)) });
  Editor.refresh();
  document.querySelectorAll('#deck .slide').forEach(function (sec, i) {
    var w = parseFloat(getComputedStyle(sec.querySelector('.slide-inner')).paddingLeft);
    if (i === 0) info.push('padLeft=' + w);
  });

  /* ---------- los 4 layouts nuevos: estructura ---------- */
  var bars = document.querySelector('#deck .slide.l-bars');
  if (!bars) problemas.push('falta slide l-bars');
  else {
    var fills = Array.prototype.map.call(bars.querySelectorAll('.bar-fill'), function (f) { return parseFloat(f.style.width); });
    if (fills.length !== 3) problemas.push('bars: 3 barras, hay ' + fills.length);
    else if (!(fills[0] === 100 && fills[1] < fills[0] && fills[2] < fills[0])) problemas.push('bars: anchos mal escalados ' + fills.join(','));
  }
  var tbl = document.querySelector('#deck .slide.l-table');
  if (!tbl) problemas.push('falta slide l-table');
  else {
    if (tbl.querySelectorAll('thead th').length !== 2) problemas.push('table: 2 columnas de cabecera');
    if (tbl.querySelectorAll('tbody tr').length !== 2) problemas.push('table: 2 filas');
    if (tbl.querySelectorAll('tbody td').length !== 4) problemas.push('table: 4 celdas');
  }
  var chk = document.querySelector('#deck .slide.l-checklist');
  if (!chk) problemas.push('falta slide l-check');
  else {
    if (!chk.querySelector('ul.checklist')) problemas.push('checklist: la lista no lleva clase checklist');
    if (chk.querySelectorAll('ul.checklist li').length !== 3) problemas.push('checklist: 3 puntos');
  }
  var crd = document.querySelector('#deck .slide.l-cards');
  if (!crd) problemas.push('falta slide l-cards');
  else if (crd.querySelectorAll('.card').length !== 2) problemas.push('cards: 2 tarjetas');

  return JSON.stringify({ problemas: problemas, info: info }, null, 1);
})()
