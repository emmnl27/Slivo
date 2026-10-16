(async function () {
  var out = [];

  out.push('densidades=' + Object.keys(DENSIDADES).join(','));
  out.push('campo=' + (!!document.getElementById('fDensity')));
  out.push('valor=' + App.form().density);

  var base = { topic: 'IA', language: 'es', count: 10, tone: 'profesional' };
  ['ligero', 'normal', 'detallado'].forEach(function (nivel) {
    var f = Object.assign({}, base, { density: nivel });
    var p = Prompt.deck(f).prompt;
    out.push(nivel + ':' + DENSIDADES[nivel].palabras.split(' ')[0] + '-' + (p.indexOf('CANTIDAD DE TEXTO') > 0 ? 'pedir' : 'falta'));
    out.push(nivel + ':listas=' + (p.indexOf('elementos cortos') > 0 ? 'viejo' : 'ok'));
    out.push(nivel + ':frases=' + (p.indexOf('frases completas') > 0 ? 'si' : 'no'));
  });

  var sys = Prompt.system(Object.assign({}, base, { density: 'detallado' }));
  out.push('sys_denso=' + (sys.indexOf('18 a 30 palabras') > 0));

  var guion = [{ n: 1, layout: 'bullets', titulo: 'A', idea: 'x' }];
  var tr = Prompt.tramo(Object.assign({}, base, { density: 'detallado' }), guion, [{ n: 1, layout: 'bullets', titulo: 'A' }]).prompt;
  out.push('tramo_denso=' + (tr.indexOf('18 a 30 palabras') > 0 && tr.indexOf('elementos cortos') < 0));

  // el detector de contenido escueto
  var mk = function (extra) {
    var s = Store.blankSlide('bullets');
    Object.assign(s, extra);
    return s;
  };
  var corto = mk({ bullets: ['Datos', 'Costes', 'Ventajas'] });
  var medio = mk({ bullets: ['Reduce el coste de la nube un 30% al migrar los procesos a contenedores gestionados'] });
  var largo = mk({
    bullets: [
      'Migrar los procesos a contenedores gestionados reduce el coste de infraestructura un 30% anual',
      'El equipo de desarrollo despliega hasta cinco veces al día sin tocar la configuración del servidor'
    ]
  });
  var col = Store.blankSlide('two-col');
  Object.assign(col, { columns: [{ heading: 'A', items: ['si'] }, { heading: 'B', items: ['no'] }] });
  var st = Store.blankSlide('stats');
  Object.assign(st, { stats: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }, { value: '3', label: 'c' }] });
  var vacio = Store.blankSlide('bullets');

  out.push('corta=' + Providers.escasa(corto, { density: 'normal' }));
  out.push('media_ok=' + !Providers.escasa(medio, { density: 'normal' }));
  out.push('larga_ok=' + !Providers.escasa(largo, { density: 'detallado' }));
  out.push('columns=' + Providers.escasa(col, { density: 'normal' }));
  out.push('stats_ignorado=' + !Providers.escasa(st, { density: 'normal' }));
  out.push('vacia=' + Providers.escasa(vacio, { density: 'ligero' }));
  var justo = mk({ bullets: ['Reduce costes', 'Mejora la calidad', 'Suma adopters', 'Acorta plazos'] });
  out.push('ligero_permite=' + !Providers.escasa(justo, { density: 'ligero' }));

  return out.join(' | ');
})()