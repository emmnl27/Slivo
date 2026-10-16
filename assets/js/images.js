/* ============================================================
   DeckAI · imágenes (generación con IA y carga de archivos)
   ============================================================ */

const Images = (() => {
  const $ = id => document.getElementById(id);
  const MAX_EDGE = 1024;      // px — se recorta para no reventar localStorage
  const JPEG_Q = 0.72;

  let queue = Promise.resolve();

  /* ---------- utilidades ---------- */

  const readAsDataURL = file => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('No se pudo leer el archivo'));
    fr.readAsDataURL(file);
  });

  const loadImage = src => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('No se pudo cargar la imagen'));
    im.src = src;
  });

  /** Reescala y convierte a JPEG para ocupar poco espacio. */
  async function shrink(dataUrl) {
    try {
      const im = await loadImage(dataUrl);
      if (!im.width || !im.height) throw new Error('la imagen no tiene tamaño');
      const scale = Math.min(1, MAX_EDGE / Math.max(im.width, im.height));
      const w = Math.round(im.width * scale);
      const h = Math.round(im.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      return c.toDataURL('image/jpeg', JPEG_Q);
    } catch (e) {
      return dataUrl; // si algo falla, guardamos la original
    }
  }

  function placeholder(i, slot, on) {
    const el = document.querySelector(`#deck .slide[data-index="${i}"] .img-slot[data-slot="${slot}"]`);
    if (el) el.classList.toggle('loading', !!on);
  }

  /* ---------- carga manual ---------- */

  /** Layouts que ya tienen hueco(s) para imágenes. */
  const CON_IMAGEN = ['cover', 'image', 'image-full', 'gallery'];

  /** Si el layout actual no puede mostrar imágenes, se cambia a uno que sí. */
  function aseguraVisible(slide) {
    if (CON_IMAGEN.includes(slide.layout)) return false;
    slide.layout = 'gallery';
    Store.fitSlots(slide, Math.max(1, Store.imgCount(slide)));
    return true;
  }

  async function useFile(file, slide, slot = 0) {
    if (!file || !slide) return;
    if (!/^image\//.test(file.type)) { Store.toast('Eso no es una imagen.', 'err'); return; }
    try {
      Store.fitSlots(slide, Math.max(Store.imgCount(slide), slot + 1));
      const data = await shrink(await readAsDataURL(file));
      const cambiado = aseguraVisible(slide);
      const arr = Store.slideImages(slide);
      arr[slot] = data;
      slide.images = arr;
      Store.save();
      Editor.refreshOf(slide);
      Store.toast(cambiado
        ? 'Imagen añadida · he cambiado el layout a «Galería» para que se vea'
        : 'Imagen añadida', 'ok');
    } catch (e) {
      Store.toast(e.message, 'err');
    }
  }

  /* ---------- generación con IA ---------- */

  async function one(index, slot = 0) {
    const deck = App.deck();
    const slide = deck.slides[index];
    if (!slide) return false;

    Store.fitSlots(slide, Math.max(Store.imgCount(slide), slot + 1));
    placeholder(index, slot, true);
    try {
      const url = await Providers.image(Prompt.image(slide, deck, slot));
      const data = await shrink(url);
      const arr = Store.slideImages(slide);
      arr[slot] = data;
      slide.images = arr;
      Store.save();
      Editor.refreshSlide(index);
      const n = Store.imgCount(slide);
      Store.toast('Imagen lista (' + (index + 1) + (n > 1 ? ' · hueco ' + (slot + 1) : '') + ')', 'ok');
      return true;
    } catch (e) {
      if (!IA_CANCELADA()) Store.toast('No se pudo generar la imagen: ' + e.message, 'err');
      Editor.refreshSlide(index);
      return false;
    } finally {
      placeholder(index, slot, false);
    }
  }

  /* ---------- fotos de internet ---------- */

  /** Consulta corta pero descriptiva para buscar la foto de un hueco. */
  function query(slide, slot) {
    const proms = Store.slidePrompts(slide);
    const cand = [proms[slot], slide.title, slide.kicker, (slide.bullets || [])[0]];
    const q = cand.map(x => String(x || '').trim()).filter(Boolean)[0] || 'abstract background';
    return q.length > 90 ? q.slice(0, 90) : q;
  }

  /** Trae una foto real de Wikimedia/Openverse para el hueco indicado. */
  async function oneWeb(index, slot = 0) {
    const deck = App.deck();
    const slide = deck.slides[index];
    if (!slide) return false;
    placeholder(index, slot, true);
    try {
      const q = query(slide, slot);
      const lista = await Web.buscar(q, { n: 8 });
      const res = Web.mejor(lista);
      if (!res) throw new Error('no encontré fotos para «' + q + '»');
      const cambiado = await Web.usar(slide, slot, res);
      Store.toast('Foto añadida (' + (index + 1) + ') · ' + res.source +
        (cambiado ? ' · pasé a «Galería» para que se vea' : ''), 'ok');
      return true;
    } catch (e) {
      if (!IA_CANCELADA()) Store.toast('No se pudo traer la foto: ' + e.message, 'err');
      Editor.refreshSlide(index);
      return false;
    } finally {
      placeholder(index, slot, false);
    }
  }

  /** Reparte una lista en tandas de "n" para no esperar a una por una. */
  function enLotes(lista, n, tarea) {
    let i = 0;
    const paso = () => {
      if (i >= lista.length) return Promise.resolve();
      const trozo = lista.slice(i, i + n);
      i += trozo.length;
      return Promise.all(trozo.map(tarea)).then(paso);
    };
    return paso();
  }

  /** Rellena todas las que falten. Con IA, de una en una; fotos de internet, a tres. */
  function all(only, opts) {
    opts = opts || {};
    const web = opts.source === 'web';
    const deck = App.deck();
    const targets = [];
    deck.slides.forEach((s, i) => {
      if (!only && !CON_IMAGEN.includes(s.layout)) return;
      const n = Store.imgCount(s);
      const imgs = Store.slideImages(s);
      for (let k = 0; k < n; k++) {
        if (!imgs[k]) targets.push({ i, k });
      }
    });

    if (!targets.length) { Store.toast('No hay huecos de imagen que rellenar en esta presentación.'); return; }
    if (!web && !Providers.imageReady()) {
      Store.toast('Las imágenes necesitan un proveedor: añade una clave en Ajustes o usa Pollinations (gratis sin clave).', 'err');
      return;
    }

    const bar = $('genProgress');
    bar.hidden = false;
    let done = 0;
    let buenas = 0;
    nuevaOperacionIA();               // Cancelar detiene toda la cola de imágenes

// Las fotos de internet van de tres en tres: buscando no hay clave ni
    // espera larga, y así una deck de 20 huecos no parece colgada. La
    // generación con IA sigue una detrás de otra para no machacar al proveedor.
    const ancho = web ? 3 : 1;
    queue = enLotes(targets, ancho, ({ i, k }) => {
      if (IA_CANCELADA()) return Promise.resolve();   // se paró: no seguimos con las que faltan
      $('genProgress').querySelector('.progress-text').textContent =
        (web ? 'Buscando fotos… ' : 'Generando imágenes… ') + `${done + 1} de ${targets.length}`;
      return (web ? oneWeb(i, k) : one(i, k)).then(ok => {
        if (ok) buenas++;
        done++;
      });
    }).then(() => {
      bar.hidden = true;
      // Cuenta solo lo que de verdad salió: decir "listas 3/3" con tres errores
      // era lo que hacía pensar que la app funcionaba cuando no generó nada.
      const pedidas = targets.length;
      const cosa = web ? 'fotos' : 'imágenes';
      if (IA_CANCELADA()) {
        Store.toast((web ? 'Búsqueda de fotos' : 'Generación de imágenes') +
          ' cancelada (' + buenas + ' de ' + pedidas + ' listas).', 'warn');
      } else if (!buenas) {
        Store.toast('No se pudo ' + (web ? 'traer' : 'generar') + ' ninguna de las ' +
          pedidas + ' ' + cosa + '. Mira el error de arriba.', 'err');
      } else if (buenas < pedidas) {
        Store.toast((web ? 'Fotos: ' : 'Imágenes: ') + buenas + ' de ' + pedidas +
          (web ? ' traídas' : ' generadas') + '. Las demás fallaron; mira el error de arriba.', 'err');
      } else {
        Store.toast((web ? 'Fotos listas: ' : 'Imágenes listas: ') + buenas + '/' + pedidas, 'ok');
      }
    });
  }

  function generate(index, slot = 0) {
    if (!Providers.imageReady()) {
      Store.toast('Las imágenes necesitan una clave de Gemini, OpenRouter, Hugging Face o AI Horde: añádela en Ajustes.', 'err');
      return;
    }
    nuevaOperacionIA();
    one(index, slot);
  }

  return { one, oneWeb, all, generate, useFile, shrink, aseguraVisible, query, CON_IMAGEN };
})();
