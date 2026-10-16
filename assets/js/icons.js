/* ============================================================
   DeckAI · iconos (Iconify: cientos de sets abiertos, sin clave)
   ============================================================ */

const Icons = (() => {
  const API = 'https://api.iconify.design';
  const dataCache = {};        // "mdi:rocket" -> {name, body, w, h}
  const buscaCache = {};       // query -> [nombres]

  /* Palabras cotidianas en español -> términos con los que Iconify acierta. */
  const DICC = {
    cohete: 'rocket', dinero: 'cash', equipo: 'account-group', personas: 'account-group',
    usuario: 'account', usuarios: 'account-group', tiempo: 'clock', reloj: 'clock',
    calendario: 'calendar', grafico: 'chart', gráfico: 'chart', grafica: 'chart',
    gráfica: 'chart', crecimiento: 'chart-line', idea: 'lightbulb', bombilla: 'lightbulb',
    objetivo: 'target', meta: 'target', seguridad: 'shield', nube: 'cloud', datos: 'database',
    libro: 'book', mundo: 'earth', globo: 'earth', corazon: 'heart', corazón: 'heart',
    estrella: 'star', configuracion: 'cog', configuración: 'cog', ajustes: 'cog',
    engranaje: 'cog', correo: 'email', telefono: 'phone', teléfono: 'phone',
    ubicacion: 'map-marker', ubicación: 'map-marker', mapa: 'map-marker', coche: 'car',
    casa: 'home', avion: 'airplane', avión: 'airplane', sol: 'white-balance-sunny',
    luna: 'moon', lluvia: 'weather-rainy', reciclaje: 'recycle', energia: 'lightning-bolt',
    energía: 'lightning-bolt', ciencia: 'flask', salud: 'heart-pulse', educacion: 'school',
    educación: 'school', trabajo: 'briefcase', empresa: 'office-building', ventas: 'chart-line',
    marketing: 'bullhorn', cliente: 'account', clientes: 'account-group', producto: 'package',
    pago: 'credit-card', pastel: 'chart-pie', flecha: 'arrow-right', descarga: 'download',
    buscar: 'magnify', pregunta: 'help-circle', alerta: 'alert', error: 'alert-circle',
    exito: 'check-circle', éxito: 'check-circle', proceso: 'cog', robot: 'robot', ia: 'robot',
    red: 'share', servidor: 'server', codigo: 'code-tags', código: 'code-tags',
    movil: 'cellphone', móvil: 'cellphone', numeros: 'counter', números: 'counter'
  };

  const sugiere = q => {
    const limpio = String(q || '').trim().toLowerCase();
    const palabra = limpio.replace(/[^a-záéíóúñü ]/g, ' ').trim().split(/\s+/).pop() || '';
    return DICC[limpio] || DICC[palabra] || String(q || '').trim();
  };

  function sanitize(body) {
    return String(body || '')
      .replace(/<\s*\/?\s*(script|style|foreignObject|iframe|object|embed|use|image|link|meta)\b[^>]*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '')
      .slice(0, 8000);
  }

  /** SVG inline listo para meter con innerHTML (el cuerpo ya viene desinfectado). */
  function svg(icon, extraClass) {
    if (!icon || !icon.body) return '';
    const w = icon.w || 24, h = icon.h || 24;
    return '<svg class="ico-svg' + (extraClass ? ' ' + extraClass : '') +
      '" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" ' +
      'aria-hidden="true" focusable="false">' + sanitize(icon.body) + '</svg>';
  }

  /** Nombres de iconos que ofrece Iconify para una búsqueda. */
  async function buscar(q, limit = 48) {
    const query = sugiere(q);
    if (!query) return [];
    if (buscaCache[query]) return buscaCache[query];
    const r = await fetch(API + '/search?query=' + encodeURIComponent(query) + '&limit=' + limit);
    if (!r.ok) throw new Error('Iconify respondió ' + r.status);
    const j = await r.json();
    const names = Array.isArray(j.icons) ? j.icons : [];
    buscaCache[query] = names;
    return names;
  }

  /** Trae el dibujo (body/width/height) de una lista de nombres, cacheando. */
  async function datos(names) {
    const faltan = names.filter(n => n && !dataCache[n]);
    const porPrefijo = {};
    faltan.forEach(n => {
      const p = n.split(':');
      if (p[0] && p[1]) (porPrefijo[p[0]] = porPrefijo[p[0]] || []).push(p[1]);
    });
    await Promise.all(Object.keys(porPrefijo).map(async pref => {
      const r = await fetch(API + '/' + pref + '.json?icons=' + encodeURIComponent(porPrefijo[pref].join(',')));
      if (!r.ok) return;
      const j = await r.json();
      const baseW = j.width || 24, baseH = j.height || 24;
      Object.keys(j.icons || {}).forEach(icon => {
        const d = j.icons[icon];
        if (d && d.body) dataCache[pref + ':' + icon] = {
          name: pref + ':' + icon, body: d.body,
          w: d.width || baseW, h: d.height || baseH
        };
      });
    }));
    return names.map(n => dataCache[n]).filter(Boolean);
  }

  /** Búsqueda "de verdad": nombres + dibujo, listos para pintar. */
  async function buscarIconos(q, limit = 48) {
    const names = await buscar(q, limit);
    return datos(names.slice(0, limit));
  }

  /* Set curado para cuando alguien abre el buscador sin escribir nada. */
  const COMUNES = [
    'mdi:rocket', 'mdi:target', 'mdi:chart-line', 'mdi:account-group', 'mdi:lightbulb-on',
    'mdi:cog', 'mdi:check-circle', 'mdi:star', 'mdi:clock-outline', 'mdi:book-open-variant',
    'mdi:earth', 'mdi:shield-check', 'mdi:database', 'mdi:cloud', 'mdi:heart',
    'mdi:lightning-bolt', 'mdi:trophy', 'mdi:currency-usd', 'mdi:handshake', 'mdi:arrow-right-bold',
    'mdi:cellphone', 'mdi:email', 'mdi:map-marker', 'mdi:chart-pie', 'mdi:robot',
    'mdi:flask', 'mdi:school', 'mdi:briefcase', 'mdi:office-building', 'mdi:bullhorn',
    'mdi:package-variant', 'mdi:credit-card', 'mdi:help-circle', 'mdi:alert', 'mdi:recycle',
    'mdi:white-balance-sunny', 'mdi:server', 'mdi:code-tags', 'mdi:share-variant', 'mdi:magnify'
  ];

  const comunes = () => datos(COMUNES);

  return { buscar, datos, svg, sanitize, buscarIconos, comunes, sugiere };
})();
