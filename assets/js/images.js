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

  function placeholder(i, on) {
    const slot = document.querySelector(`#deck .slide[data-index="${i}"] .img-slot`);
    if (slot) slot.classList.toggle('loading', !!on);
  }

  /* ---------- carga manual ---------- */

  /** Layouts que ya tienen hueco para una imagen. */
  const CON_IMAGEN = ['cover', 'image', 'image-full'];

  /** Si el layout actual no puede mostrar la imagen, se cambia a uno que sí. */
  function aseguraVisible(slide) {
    if (CON_IMAGEN.includes(slide.layout)) return false;
    slide.layout = 'image';
    if (!slide.bullets.length) slide.bullets = ['Punto clave', 'Segunda idea', 'Tercera idea'];
    return true;
  }

  async function useFile(file, slide) {
    if (!file || !slide) return;
    if (!/^image\//.test(file.type)) { Store.toast('Eso no es una imagen.', 'err'); return; }
    try {
      slide.image = await shrink(await readAsDataURL(file));
      const cambiado = aseguraVisible(slide);
      Store.save();
      Editor.refresh();
      Store.toast(cambiado
        ? 'Imagen añadida · he cambiado el layout a «Imagen» para que se vea'
        : 'Imagen añadida', 'ok');
    } catch (e) {
      Store.toast(e.message, 'err');
    }
  }

  /* ---------- generación con IA ---------- */

  async function one(index) {
    const deck = App.deck();
    const slide = deck.slides[index];
    if (!slide) return;

    placeholder(index, true);
    try {
      const url = await Providers.image(Prompt.image(slide, deck));
      slide.image = await shrink(url);
      Store.save();
      Editor.refresh();
      Store.toast('Imagen lista (' + (index + 1) + ')', 'ok');
      return true;
    } catch (e) {
      Store.toast('No se pudo generar la imagen: ' + e.message, 'err');
      Editor.refresh();
      return false;
    } finally {
      placeholder(index, false);
    }
  }

  /** Genera todas en serie (de 3 en 3 para no saturar la cuota). */
  function all(only) {
    const deck = App.deck();
    const targets = deck.slides
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (only ? true : ['cover', 'section', 'image', 'image-full', 'closing'].includes(s.layout)));

    if (!targets.length) { Store.toast('No hay diapositivas con imagen en esta presentación.'); return; }
    if (!Providers.imageReady()) {
      Store.toast('Las imágenes necesitan un proveedor: añade una clave en Ajustes o usa Pollinations (gratis sin clave).', 'err');
      return;
    }

    const bar = $('genProgress');
    bar.hidden = false;
    let done = 0;
    let buenas = 0;
    let yaTenian = 0;

    queue = targets.reduce((p, { s, i }) => p.then(async () => {
      if (s.image) { yaTenian++; return; }
      $('genProgress').querySelector('.progress-text').textContent =
        `Generando imágenes… ${done + 1} de ${targets.length}`;
      const ok = await one(i);
      if (ok) buenas++;
      done++;
    }), Promise.resolve()).then(() => {
      bar.hidden = true;
      // Cuenta solo lo que de verdad salió: decir "listas 3/3" con tres errores
      // era lo que hacía pensar que la app funcionaba cuando no generó nada.
      const pedidas = buenas + (done - buenas);
      if (!buenas) {
        Store.toast('No se pudo generar ninguna de las ' + pedidas + ' imágenes. Mira el error de arriba.', 'err');
      } else if (buenas < pedidas) {
        Store.toast('Imágenes: ' + buenas + ' de ' + pedidas + ' generadas' +
          (yaTenian ? ' (' + yaTenian + ' ya estaban)' : '') + '. Las demás fallaron; mira el error de arriba.', 'err');
      } else {
        Store.toast('Imágenes listas: ' + buenas + '/' + pedidas +
          (yaTenian ? ' (' + yaTenian + ' ya estaban)' : ''), 'ok');
      }
    });
  }

  function generate(index) {
    if (!Providers.imageReady()) {
      Store.toast('Las imágenes necesitan una clave de Gemini, OpenRouter o Pollinations: añádela en Ajustes.', 'err');
      return;
    }
    one(index);
  }

  return { one, all, generate, useFile, shrink, aseguraVisible, CON_IMAGEN };
})();
