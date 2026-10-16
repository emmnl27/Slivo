/* ============================================================
   DeckAI · fotos de internet (Wikimedia Commons + Openverse)
   Sin clave de API. Devuelve la imagen ya convertida a data URL
   para que viaje con el .json, el PDF y la presentación.
   ============================================================ */

const Web = (() => {
  /* ---------- fuentes ---------- */

  const TIM_BUSQUEDA = 12000;   // si una fuente no contesta, se sigue con la otra
  const TIM_DESCARGA = 25000;

  async function wikimedia(q, n) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      '&gsrsearch=' + encodeURIComponent(q) + '&gsrnamespace=6&gsrlimit=' + n +
      '&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1024&format=json&origin=*';
    const r = await fetchTimeout(url, {}, TIM_BUSQUEDA);
    if (!r.ok) throw new Error('Wikimedia respondió ' + r.status);
    const j = await r.json();
    const pages = j.query && j.query.pages ? Object.values(j.query.pages) : [];
    return pages.filter(p => p.imageinfo && p.imageinfo[0]).map(p => {
      const ii = p.imageinfo[0];
      const em = ii.extmetadata || {};
      const val = k => (em[k] && em[k].value) || '';
      return {
        id: 'wm:' + p.pageid,
        title: String(p.title || '').replace(/^File:/, ''),
        thumb: ii.thumburl || ii.url,
        full: ii.url,
        mime: ii.mime || '',
        width: ii.width, height: ii.height,
        author: String(val('Artist')).replace(/<[^>]+>/g, '').trim().slice(0, 90),
        license: val('LicenseShortName'),
        licenseUrl: val('LicenseUrl'),
        page: 'https://commons.wikimedia.org/?curid=' + p.pageid,
        source: 'Wikimedia Commons'
      };
    }).filter(x => x.thumb && x.mime.indexOf('image/') === 0 && x.mime.indexOf('svg') < 0);
  }

  async function openverse(q, n) {
    const url = 'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) +
      '&page_size=' + n + '&mature=false';
    const r = await fetchTimeout(url, {}, TIM_BUSQUEDA);
    if (!r.ok) throw new Error('Openverse respondió ' + r.status);
    const j = await r.json();
    return (j.results || []).filter(x => x.thumbnail && x.filetype !== 'svg' && x.filetype !== 'tiff')
      .map(x => ({
        id: 'ov:' + x.id,
        title: x.title || '',
        thumb: x.thumbnail,
        full: x.url || x.thumbnail,
        mime: 'image/' + (x.filetype || ''),
        width: x.width, height: x.height,
        author: x.creator || '',
        license: ((x.license || '') + (x.license_version ? ' ' + x.license_version : '')).trim(),
        licenseUrl: x.license_url || '',
        page: x.foreign_landing_url || x.detail_url || '',
        source: x.source || 'Openverse'
      }));
  }

  /** Busca en las dos fuentes a la vez y mezcla los resultados. */
  async function buscar(q, { n = 24 } = {}) {
    q = String(q || '').trim();
    if (!q) return [];
    const mitad = Math.max(4, Math.ceil(n / 2));
    const [a, b] = await Promise.allSettled([wikimedia(q, mitad), openverse(q, mitad)]);
    let out = [];
    if (a.status === 'fulfilled') out = out.concat(a.value);
    if (b.status === 'fulfilled') out = out.concat(b.value);
    const vistos = new Set();
    out = out.filter(x => {
      const k = String(x.thumb).replace(/[?#].*$/, '');
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    return out.slice(0, n);
  }

  /** Entre los resultados, uno con buena proporción (apaisado se ve mejor). */
  function mejor(lista) {
    if (!lista || !lista.length) return null;
    return lista.find(x => x.width && x.height && x.width / x.height > 1.25) || lista[0];
  }

  /* ---------- descarga ---------- */

  const blobADataURL = blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error('No se pudo leer la imagen'));
    fr.readAsDataURL(blob);
  });

  async function descargar(url) {
    const r = await fetchTimeout(url, { mode: 'cors' }, TIM_DESCARGA);
    if (!r.ok) throw new Error('No se pudo descargar la imagen (' + r.status + ')');
    const tipo = r.headers.get('content-type') || '';
    if (tipo && tipo.indexOf('image/') !== 0) throw new Error('Eso no es una imagen');
    return Images.shrink(await blobADataURL(await r.blob()));
  }

  async function aDataUrl(res) {
    try { return await descargar(res.full || res.thumb); }
    catch (e) {
      if (res.thumb && res.thumb !== res.full) return descargar(res.thumb);
      throw e;
    }
  }

  /* ---------- colocar en un hueco ---------- */

  async function usar(slide, slot, res) {
    if (!slide || !res) return false;
    Store.fitSlots(slide, Math.max(Store.imgCount(slide), slot + 1));
    const data = await aDataUrl(res);
    const cambiado = Images.aseguraVisible(slide);
    const arr = Store.slideImages(slide);
    arr[slot] = data;
    slide.images = arr;
    const cr = Store.imageCredits(slide).slice();
    cr[slot] = {
      source: res.source, author: res.author,
      license: res.license, licenseUrl: res.licenseUrl, page: res.page
    };
    slide.imageCredits = cr;
    Store.save();
    Editor.refreshOf(slide);
    return cambiado;
  }

  return { buscar, mejor, aDataUrl, usar, wikimedia, openverse };
})();
