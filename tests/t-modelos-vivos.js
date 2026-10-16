(async function () {
  var out = [];
  out.push('recordar=' + typeof Providers.recordarModelos);

  Store.state.settings.keys.groq = 'clave-falsa';
  Store.state.settings.models.groq = 'modelo-inventado';
  Store.state.settings.provider = 'groq';

  var antes = Providers.chain().slice(0, 6).map(function (c) { return c.model; });
  Providers.recordarModelos('groq', ['real-a', 'real-b', 'real-c']);
  var desp = Providers.chain().slice(0, 6).map(function (c) { return c.model; });

  out.push('antes=' + JSON.stringify(antes));
  out.push('despues=' + JSON.stringify(desp));
  var iReal = desp.indexOf('real-a');
  var iEstatico = desp.indexOf('llama-3.3-70b-versatile');
  out.push('vivos_antes_del_catalogo=' + (iReal > -1 && iEstatico > -1 && iReal < iEstatico));

  return out.join(' | ');
})()
