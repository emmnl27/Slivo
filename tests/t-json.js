(async function () {
  var out = [];
  out.push('btn=' + !!document.getElementById('btnDownload'));

  var clicked = null;
  var origCreate = URL.createObjectURL, origRevoke = URL.revokeObjectURL;
  var origClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (blob) { window.__blob = blob; return 'blob:fake'; };
  URL.revokeObjectURL = function () {};
  HTMLAnchorElement.prototype.click = function () { clicked = this.download; };

  App.deck().title = 'Mi charla de prueba';
  document.getElementById('btnDownload').click();
  await new Promise(function (r) { setTimeout(r, 60); });

  out.push('download=' + clicked);
  var txt = await window.__blob.text();
  var parsed = JSON.parse(txt);
  out.push('titulo=' + (parsed.title === 'Mi charla de prueba'));
  out.push('slides=' + parsed.slides.length);

  HTMLAnchorElement.prototype.click = origClick;
  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;
  return out.join(' | ');
})()
