(function () {
  var out = [];
  var S = Store;
  S.state.deck.slides = [S.blankSlide('bullets'), S.blankSlide('bullets'), S.blankSlide('bullets')];
  S.state.deck.slides[0].title = 'A';
  S.state.deck.slides[1].title = 'B';
  S.state.deck.slides[2].title = 'C';
  App.state.ui.selected = 0;
  Editor.buildThumbs();

  var box = document.getElementById('thumbs');
  var t0 = box.querySelector('.thumb[data-i="0"]');
  var t1 = box.querySelector('.thumb[data-i="1"]');
  if (!t0 || !t1) return 'FALTA thumb';
  if (typeof Touch === 'undefined' || typeof TouchEvent === 'undefined') return 'TOUCH_NO_SOPORTADO';

  var r0 = t0.getBoundingClientRect();
  var r2 = t1.getBoundingClientRect();
  var mk = function (x, y) { return new Touch({ identifier: 1, target: t0, clientX: x, clientY: y }); };
  var antes = App.deck().slides.map(function (s) { return s.title; }).join('');

  try {
    t0.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true,
      touches: [mk(r0.left + 10, r0.top + 10)],
      changedTouches: [mk(r0.left + 10, r0.top + 10)]
    }));
  } catch (e) { return 'TOUCHSTART_ERROR: ' + e.message; }

  return new Promise(function (res) {
    setTimeout(function () {
      try {
        var x = r2.left + r2.width / 2, y = r2.top + r2.height / 2;
        t0.dispatchEvent(new TouchEvent('touchmove', {
          bubbles: true, cancelable: true, touches: [mk(x, y)], changedTouches: [mk(x, y)]
        }));
        t0.dispatchEvent(new TouchEvent('touchend', {
          bubbles: true, cancelable: true, touches: [], changedTouches: [mk(x, y)]
        }));
      } catch (e) { out.push('ERROR: ' + e.message); }
      var desp = App.deck().slides.map(function (s) { return s.title; }).join('');
      out.push('antes=' + antes);
      out.push('despues=' + desp);
      out.push('reordenado=' + (desp !== antes));
      res(out.join(' | '));
    }, 300);
  });
})()
