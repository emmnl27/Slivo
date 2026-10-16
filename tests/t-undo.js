(async function () {
  var out = [];
  out.push('undoEdit=' + typeof Editor.undoEdit);

  var n0 = App.deck().slides.length;
  App.state.ui.selected = 0;
  Editor.add('bullets');
  var n1 = App.deck().slides.length;
  Editor.undoEdit();
  var n2 = App.deck().slides.length;
  out.push('add=' + n0 + '>' + n1 + '>undo>' + n2);

  var s = App.deck().slides[0];
  s.layout = 'bullets';
  Editor.setLayout('stats');
  var l1 = s.layout;
  Editor.undoEdit();
  var l2 = App.deck().slides[0].layout;
  out.push('layout=' + l1 + '_undo_' + l2);

  var antes = App.deck().slides[0].title;
  App.deck().slides[0].title = 'AAA';
  Editor.snapshot();
  App.deck().slides[0].title = 'BBB';
  Editor.undoEdit();
  out.push('titulo=' + (App.deck().slides[0].title === 'AAA' ? 'OK' : App.deck().slides[0].title));

  return out.join(' | ');
})()
