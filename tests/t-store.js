(async function () {
  var out = [];
  var KEY = 'deckai.v1';
  var dummy = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  var s0 = Store.state.deck.slides[0];
  s0.images = [dummy];
  s0.imgCount = 1;
  Store.save();

  var raw = JSON.parse(localStorage.getItem(KEY));
  out.push('LS_IMG=' + raw.deck.slides[0].images.length + '(esperado 0)');

  function idbGet(key) {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('deckai', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () {
        var tx = r.result.transaction('kv', 'readonly');
        var g = tx.objectStore('kv').get(key);
        g.onsuccess = function () { res(g.result); };
        g.onerror = function () { rej(g.error); };
      };
      r.onerror = function () { rej(r.error); };
    });
  }

  var map = await idbGet('deck-images');
  out.push('IDB=' + (map && map[s0.id] ? map[s0.id].length : 'none') + '(esperado 1)');

  s0.images = [];               // se pierde de memoria
  Store.load();                 // relee texto + IDB
  var hubo = await Store.imagesReady();
  var vuelto = Store.state.deck.slides[0].images[0];
  out.push('HIDRA=' + (hubo ? 'si' : 'no') + '/' + (vuelto === dummy ? 'OK' : 'FALLO'));

  return out.join(' | ');
})()
