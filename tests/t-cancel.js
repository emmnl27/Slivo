(async function () {
  var out = [];
  var real = window.fetch;

  window.fetch = function (url, opts) {
    return new Promise(function (res, rej) {
      if (opts && opts.signal) {
        if (opts.signal.aborted) { var e0 = new Error('ab'); e0.name = 'AbortError'; return rej(e0); }
        opts.signal.addEventListener('abort', function () { var e = new Error('ab'); e.name = 'AbortError'; rej(e); });
      }
    });
  };

  out.push('btnCancel=' + !!document.getElementById('btnCancel'));
  out.push('chatCancel=' + !!document.getElementById('chatCancel'));
  out.push('typeof nuevaOperacionIA=' + typeof nuevaOperacionIA);

  nuevaOperacionIA();
  out.push('antes=' + IA_CANCELADA());

  var prom = fetchTimeout('http://x.invalido', {}, 60000).then(
    function () { return 'NO_ABORTO'; },
    function (e) { return esAborto(e) ? 'ABORTO' : 'OTRO'; }
  );
  setTimeout(function () { cancelarIA(); }, 60);
  var r = await prom;
  out.push('tras=' + IA_CANCELADA() + '/' + r);

  var c = nuevaOperacionIA();
  out.push('nueva=' + IA_CANCELADA() + '/aborted=' + c.signal.aborted);

  window.fetch = real;
  return out.join(' | ');
})()
