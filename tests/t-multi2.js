(async function(){
  var out=[];
  function ok(c,m){ out.push((c?'PASS':'FAIL')+' '+m); }
  try {
  window.confirm = function(){ return true; };

  // ---- inspector multi-imagen ----
  var dk = App.deck();
  dk.slides = [Store.blankSlide('gallery'), Store.blankSlide('bullets')];
  Store.fitSlots(dk.slides[0], 2);
  dk.slides[0].images = ['data:image/png;base64,AAA', ''];
  App.state.ui.selected = 0;
  Editor.refresh();
  var ib = document.getElementById('inspectorBody').innerHTML;
  ok(/data-act="img-count"/.test(ib),'inspector muestra selector img-count');
  ok((ib.match(/data-imgprompt=/g)||[]).length===2,'inspector 2 textareas de prompt');
  ok((ib.match(/data-act="img-gen"/g)||[]).length===2,'inspector 2 botones Generar');
  ok((ib.match(/data-act="img-upload"/g)||[]).length===2,'inspector 2 botones Subir');
  ok((ib.match(/data-act="img-del"/g)||[]).length===1,'inspector 1 boton Quitar (solo hueco con imagen)');

  // escribir un prompt de hueco
  var ta = document.querySelector('#inspectorBody [data-imgprompt="1"]');
  ta.value = 'un gato al sol';
  ta.dispatchEvent(new Event('change', {bubbles:true}));
  ok(Store.slidePrompts(App.deck().slides[0])[1]==='un gato al sol','prompt del hueco 2 guardado');

  // cambiar a 4 huecos pulsando el selector
  document.querySelector('#inspectorBody [data-act="img-count"][data-n="4"]').click();
  ok(Store.imgCount(App.deck().slides[0])===4,'img-count cambia a 4 huecos');
  ok(App.deck().slides[0].layout==='gallery','img-count deja gallery');

  // ---- editor de tema ----
  var antes = (App.state.settings.customThemes||[]).length;
  document.getElementById('btnNewTheme').click();
  var dlg = document.getElementById('dlgTheme');
  ok(dlg.open===true,'dlgTheme se abre');
  document.getElementById('thName').value='Tema UI';
  document.getElementById('thBg1').value='#112233';
  document.getElementById('thBg2').value='#445566';
  document.getElementById('thGrad').checked=true;
  document.getElementById('thAccent').value='#ff8800';
  dlg.close('save');
  await new Promise(r => setTimeout(r, 60));
  var lista = App.state.settings.customThemes;
  ok(lista.length===antes+1,'tema propio guardado en settings');
  var nuevo = lista[lista.length-1];
  ok(nuevo.name==='Tema UI','nombre guardado');
  ok(/gradient/.test(nuevo.css['--bg']) && /#112233/.test(nuevo.css['--bg']),'degradado guardado: '+nuevo.css['--bg']);
  ok(nuevo.css['--accent']==='#ff8800','acento guardado');
  ok(App.deck().theme===nuevo.id,'deck.theme apunta al tema nuevo');
  ok(document.querySelectorAll('.theme-chip.custom').length===1,'aparece 1 chip custom');

  // el slide usa el tema (style inline)
  var html = Render.slide(App.deck().slides[0], App.deck(), 0, {});
  ok(html.indexOf('theme-custom')>-1,'slide usa theme-custom');
  ok(html.indexOf('#112233')>-1,'slide lleva el degradado inline');

  // borrar tema
  document.querySelector('[data-del-theme]').click();
  ok((App.state.settings.customThemes||[]).length===antes,'tema propio eliminado');
  ok(document.querySelectorAll('.theme-chip.custom').length===0,'chip custom desaparece');

  } catch(e) { out.push('ERROR: ' + (e && e.stack ? e.stack : e)); }
  return out.join('\n');
})()
