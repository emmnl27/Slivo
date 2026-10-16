(async function () {
  var out = [];
  var slides = [];

  function FakeSlide() {
    this.background = null;
    this.addText = function () {};
    this.addShape = function () {};
    this.addNotes = function () {};
    this.addImage = function () {};
  }
  window.PptxGenJS = function () {
    this.addSlide = function () { var s = new FakeSlide(); slides.push(s); return s; };
    this.writeFile = function () { return Promise.resolve(); };
  };

  App.deck().theme = 'aurora';
  await Exports.pptx();
  await new Promise(function (r) { setTimeout(r, 30); });
  var b = slides[0] && slides[0].background;
  out.push('n=' + slides.length);
  out.push('degradado=' + !!(b && b.data && /^image\/png;base64,/.test(b.data)));

  slides.length = 0;
  App.deck().theme = 'minimal';
  await Exports.pptx();
  await new Promise(function (r) { setTimeout(r, 30); });
  var b2 = slides[0] && slides[0].background;
  out.push('plano=' + !!(b2 && b2.color));

  return out.join(' | ');
})()
