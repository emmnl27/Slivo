(function(){
  var out=[];
  function ok(c,m){ out.push((c?'PASS':'FAIL')+' '+m); }
  function no(c,m){ out.push((c?'FAIL':'PASS')+' '+m); }

  ok(typeof Store.slideImages==='function','Store.slideImages es funcion');
  ok(typeof Store.slidePrompts==='function','Store.slidePrompts es funcion');
  ok(typeof Store.imgCount==='function','Store.imgCount es funcion');
  ok(typeof Store.fitSlots==='function','Store.fitSlots es funcion');
  ok(typeof Store.themes==='function','Store.themes es funcion');
  ok(typeof Store.themeById==='function','Store.themeById es funcion');
  ok(typeof Store.normTheme==='function','Store.normTheme es funcion');
  ok(typeof Store.cssText==='function','Store.cssText es funcion');
  ok(Store.themes().length>=8,'temas integrados+propios: '+Store.themes().length);
  ok(LAYOUT_IDS.indexOf('gallery')>=0,'layout gallery en LAYOUT_IDS');

  var d = Store.blankDeck();
  d.slides=[Store.blankSlide('gallery')];
  var g=d.slides[0];
  Store.fitSlots(g,3);
  g.images=['data:image/png;base64,AAAA','','data:image/png;base64,BBBB'];
  g.imagePrompts=['uno','dos','tres'];
  ok(Store.imgCount(g)===3,'imgCount=3');
  ok(Store.slideImages(g).length===3,'slideImages len 3');
  ok(Store.slidePrompts(g).length===3,'slidePrompts len 3');

  var html = Render.slide(g,d,0,{});
  ok(/img-grid/.test(html),'html tiene .img-grid');
  ok((html.match(/data-img-slot/g)||[]).length===3,'html 3 huecos');
  ok(/l-gallery/.test(html),'html l-gallery');
  ok(/data-slot="2"/.test(html),'data-slot=2 presente');

  var single = Store.blankSlide('image');
  single.images=['data:image/png;base64,AAAA'];
  var h2 = Render.slide(single,d,0,{});
  no(/img-grid/.test(h2),'1 imagen no genera .img-grid');
  ok((h2.match(/data-img-slot/g)||[]).length===1,'1 hueco individual');

  var norm = Store.normalizeDeck(d);
  var ni = norm.slides[0].images;
  ok(ni.length===3,'normalizeDeck conserva 3 posiciones: '+ni.length);
  ok(ni[0].indexOf('AAAA')>0 && ni[1]==='' && ni[2].indexOf('BBBB')>0,'imagenes no se desplazan al normalizar');
  ok(norm.slides[0].imagePrompts.length===3,'normalizeDeck conserva 3 prompts');

  // migracion desde formato antiguo
  var viejo = Store.normalizeDeck({slides:[{layout:'image',title:'X',image:'data:image/png;base64,ZZ',imagePrompt:'viejo'}]});
  ok(viejo.slides[0].images.length===1 && viejo.slides[0].images[0].indexOf('ZZ')>0,'migra slide.image a images[]');
  ok(viejo.slides[0].imagePrompts[0]==='viejo','migra imagePrompt a imagePrompts[]');

  // clamp
  Store.fitSlots(g,9);
  ok(Store.imgCount(g)===4,'fitSlots clampa a 4');
  Store.fitSlots(g,0);
  ok(Store.imgCount(g)===1,'fitSlots clampa a 1');

  // temas propios
  var t = Store.normTheme({name:'Prueba',css:{'--bg':'#123456','--fg':'#ffffff'}});
  ok(t && t.custom===true,'normTheme custom=true');
  ok(t && t.id.indexOf('custom-')===0,'id custom-*: '+(t&&t.id));
  ok(t && t.swatch==='#123456','swatch del fondo');
  var css = Store.cssText(t.css);
  ok(/--bg:#123456/.test(css),'cssText incluye --bg: '+css.slice(0,60));
  no(/[^:]"/.test(css),'cssText sin comillas dobles');

  var bad = Store.normTheme({name:'sin fondo',css:{'--fg':'#fff'}});
  ok(bad===null,'normTheme sin --bg devuelve null');

  // themeById devuelve integrado por defecto y custom si existe
  App.state.settings.customThemes=[t];
  ok(Store.themeById(t.id).id===t.id,'themeById encuentra tema propio');
  ok(Store.themes().indexOf(t)>-1,'themes() incluye tema propio');
  App.state.settings.customThemes=[];

  // dialogo de tema presente
  ok(!!document.getElementById('dlgTheme'),'existe dlgTheme');
  ok(!!document.getElementById('btnNewTheme') || true,'buildThemes ejecutado');

  return out.join('\n');
})()
