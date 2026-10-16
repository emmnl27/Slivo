(async function () {
  var out = [];
  out.push('fetchTimeout=' + typeof window.fetchTimeout);
  out.push('esAborto=' + typeof window.esAborto);
  out.push('IA_TIMEOUT=' + (typeof IA_TIMEOUT !== 'undefined' ? IA_TIMEOUT : '?'));

  var real = window.fetch;
  window.fetch = function (url, opts) {
    return new Promise(function (res, rej) {
      if (opts && opts.signal) {
        opts.signal.addEventListener('abort', function () {
          var e = new Error('aborted');
          e.name = 'AbortError';
          rej(e);
        });
      }
    });
  };
  var t0 = Date.now();
  try {
    await fetchTimeout('http://ejemplo.invalido', {}, 300);
    out.push('FETCH: NO_ABORTO');
  } catch (e) {
    out.push('FETCH: ' + (esAborto(e) ? 'ABORTO' : 'OTRO(' + e.message + ')') + ' a los ' + (Date.now() - t0) + 'ms');
  }

  var r2 = await fetchTimeout('http://ejemplo.invalido', {}, 150).then(
    function () { return 'NO_ABORTO'; },
    function (e) { return esAborto(e) ? 'ABORTO_OK' : 'OTRO'; }
  );
  out.push('SEGUNDA: ' + r2);
  window.fetch = real;
  return out.join(' | ');
})()
