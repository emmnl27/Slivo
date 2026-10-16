/* ============================================================
   DeckAI · construcción del prompt y del esquema de respuesta
   ============================================================ */

const Prompt = (() => {

  const densidad = form => DENSIDADES[(form && form.density) || 'normal'] || DENSIDADES.normal;

  /** Cuántas palabras y cuántas viñetas, según el nivel elegido. */
  function medida(form) {
    const d = densidad(form);
    return [
      '',
      'CANTIDAD DE TEXTO (nivel elegido por el usuario: ' + d.nombre + '):',
      '- bullets: ' + d.bullets + ' elementos, cada uno de ' + d.palabras + '.',
      '- "subtitle": ' + d.frases + ' con la idea de la diapositiva; no es un eslogan.',
      '- "steps"[].text, "columns"[].items y "stats"[].label: ' + d.frases + ' cada uno.',
      '- "notes": 3-4 frases de guion con lo que hay que contar de verdad.',
      d.extra,
      '- Escribe frases completas, nunca telegramas ni palabras sueltas.',
      '- Rellena la diapositiva: si queda espacio libre, el texto es demasiado corto todavía.'
    ].filter(Boolean);
  }

  function system(form) {
    const d = densidad(form);
    return [
      'Eres un diseñador de presentaciones experto y un copywriter.',
      'Tu trabajo es crear el CONTENIDO de una presentación en diapositivas, no el código.',
      'Reglas de escritura:',
      '- Escribe TODO el contenido en ' + (LANGUAGES[form.language] || 'español') + '.',
      '- Titulares breves y atractivos (max. 8 palabras). Nunca repitas el titulo en el subtitulo.',
      '- Las viñetas son ' + d.palabras + ', y siempre frases completas: nunca palabras sueltas.',
      '- Usa **negrita** para destacar la palabra clave de cada viñeta (2 palabras como máximo).',
      '- No escribas introducciones tipo "En esta presentación veremos...". Ve al grano.',
      '- Sin relleno, sin muletillas, sin repetir la misma idea de dos formas.',
      '- Si un dato es aproximado, marcalo con "(aprox.)".',
      '- Usa cifras concretas (porcentajes, plazos, montos) para que la presentación sea creíble.'
    ].join('\n');
  }

  function deck(form) {
    const count = Math.max(3, Math.min(CONFIG.maxSlides, parseInt(form.count, 10) || 10));
    const lang = LANGUAGES[form.language] || 'español';
    const tone = TONES[form.tone] || TONES.profesional;
    const d = densidad(form);

    const user = [
      'Crea una presentación de ' + count + ' diapositivas.',
      '',
      'TEMA: ' + form.topic,
      'PUBLICO: ' + (form.audience || 'general'),
      'TONO: ' + tone,
      'ESTILO VISUAL: ' + (form.style || 'limpio, profesional, con mucho espacio en blanco'),
      'IDIOMA: todo el contenido en ' + lang + '.',
      form.notes ? ('INDICACIONES EXTRA: ' + form.notes) : '',
      '',
      'ESTRUCTURA OBLIGATORIA:',
      '1. La primera diapositiva es layout "cover" (title, subtitle, author, date).',
      '2. La segunda es layout "agenda" con los 4-6 bloques principales.',
      '3. El cuerpo alterna entre "bullets", "two-col", "stats", "bars", "table", "checklist", "cards", "timeline" e "image", sin repetir dos veces el mismo layout seguido.',
      '4. Inserta 1-2 layouts "section" como separadores de bloque.',
      '5. La penultima puede ser "quote".',
      '6. La ultima es layout "closing".',
      '7. Total exacto de diapositivas: ' + count + '.',
      '',
'CONTENIDO POR LAYOUT:',
      '- cover: title, subtitle (una frase), author, date. bullets vacio.',
      '- agenda: bullets = ["Titulo del bloque 1", ...] con 4-6 elementos (aquí van títulos cortos, no frases).',
      '- section: kicker = "BLOQUE 1", title, subtitle con una frase completa.',
      '- bullets: title + bullets (' + d.bullets + ' elementos, cada uno de ' + d.palabras + ').',
      '- two-col: title + columns = [{heading, items: []}, {heading, items: []}] con 3-4 elementos cada uno de ' + d.palabras + '. bullets vacio.',
      '- image: title + bullets (' + d.bullets + ') + imagePrompt.',
      '- image-full: title + subtitle (una frase) + imagePrompt. bullets vacio.',
      '- gallery: title + subtitle + imagePrompts = ["descripción 1", "descripción 2"] (2-4, en inglés). bullets vacio.',
      '- stats: title + stats = [{value: "45%", label: "qué mide y por qué importa"}] con 3-4 datos. bullets vacio.',
      '- bars: title + stats = [{value: "45%", label: "qué mide"}] con 3-5 datos COMPARABLES (mismo tipo de cifra: todo % o todo euros). "value" lleva siempre un número. bullets vacio.',
      '- table: title + tcols = ["Año", "Ventas", "Margen"] (2-4 columnas) + trows = [["2024", "1,2 M€", "18%"], ...] con 3-5 filas. bullets vacio.',
      '- checklist: title + bullets con 3-5 requisitos o pasos que se pueden tachar ("verificar que…", "confirmar que…").',
      '- cards: title + cards = [{heading: "Ventaja", text: "frase completa de por qué importa"}] con 2-4 tarjetas. bullets vacio.',
      '- timeline: title + steps = [{title, text}] con 3-4 pasos; "text" es una frase completa. bullets vacio.',
      '- quote: quote + quoteAuthor. title vacio.',
      '- closing: title + subtitle con una frase de cierre. bullets vacio.',
      '',
      'REGLAS GENERALES:',
      '- En "image" e "image-full" rellena SIEMPRE imagePrompt (descripcion visual detallada, en ingles, sin texto).',
      '- En "gallery" rellena imagePrompts con 2-4 descripciones visuales detalladas, en ingles y sin texto.',
      '- En el resto de layouts deja imagePrompt e imagePrompts vacios.',
      '- notes: 3-4 frases de guion para el orador en todas las diapositivas.',
      '- Devuelve solo JSON valido, sin markdown, sin comentarios, sin texto antes ni despues.',
      '',
      'FORMATO EXACTO (copia esta estructura, con estos mismos nombres de campo):',
      '{"layout":"bullets","title":"Titulo","bullets":["Frase completa con la idea y su consecuencia.","Frase completa con la idea y su consecuencia."],"notes":"Guion"}',
      '{"layout":"agenda","title":"Indice","bullets":["Bloque 1","Bloque 2","Bloque 3","Bloque 4"]}',
      '{"layout":"two-col","title":"Titulo","columns":[{"heading":"Ventajas","items":["Frase completa.","Frase completa."]},{"heading":"Inconvenientes","items":["Frase completa.","Frase completa."]}]}',
      '{"layout":"stats","title":"Titulo","stats":[{"value":"45%","label":"de ahorro en el primer año"}]}',
      '{"layout":"timeline","title":"Titulo","steps":[{"title":"Paso 1","text":"Frase completa con lo que ocurre."}]}',
      '{"layout":"quote","quote":"Cita memorable","quoteAuthor":"Quien la dijo"}',
      '{"layout":"image","title":"Titulo","bullets":["Frase completa.","Frase completa."],"imagePrompt":"descripcion visual en ingles"}',
      '{"layout":"cover","title":"Titulo","subtitle":"Subtitulo","author":"Nombre","date":"Fecha"}',
      '',
      'REGLAS CRITICAS:',
      '- "bullets", "columns", "stats", "steps", "tcols", "trows" y "cards" son SIEMPRE arrays, con ' + d.bullets + ' elementos de texto desarrollado. Nunca un texto suelto, nunca un objeto suelto.',
      '- NINGUNA diapositiva puede quedar solo con el titulo: escribe su contenido. Es lo mas importante.',
      '- Un titulo con dos palabras sueltas debajo NO es una diapositiva terminada: desarrolla el contenido.',
      '- Si el layout no pide un campo (por ejemplo "bullets" en "stats"), ese campo va como array vacio [] o se omite.',
      '- Escribe TODO el contenido, incluidos los titulos de las columnas, los datos y los pasos.'
    ].concat(medida(form)).filter(Boolean).join('\n');

    return { system: system(form), prompt: user, schema: SCHEMA };
  }

  const strArr = { type: 'array', items: { type: 'string' } };

  const SCHEMA = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      subtitle: { type: 'string' },
      author: { type: 'string' },
      date: { type: 'string' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            layout: { type: 'string', enum: LAYOUT_IDS },
            kicker: { type: 'string' },
            title: { type: 'string' },
            subtitle: { type: 'string' },
            bullets: strArr,
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: { heading: { type: 'string' }, items: strArr },
                required: ['heading']
              }
            },
            stats: {
              type: 'array',
              items: {
                type: 'object',
                properties: { value: { type: 'string' }, label: { type: 'string' } },
                required: ['value', 'label']
              }
            },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: { title: { type: 'string' }, text: { type: 'string' } },
                required: ['title']
              }
            },
            tcols: strArr,
            trows: { type: 'array', items: strArr },
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: { heading: { type: 'string' }, text: { type: 'string' } },
                required: ['heading', 'text']
              }
            },
            quote: { type: 'string' },
            quoteAuthor: { type: 'string' },
            imagePrompt: { type: 'string' },
            imagePrompts: strArr,
            notes: { type: 'string' }
          },
          required: ['layout']
        }
      }
    },
    required: ['title', 'slides']
  };

  /** Igual que SCHEMA, pero cada diapositiva debe traer su número "n". */
  const SCHEMA_TRAMO = (() => {
    const s = JSON.parse(JSON.stringify(SCHEMA));
    s.properties.slides.items.properties.n = { type: 'integer' };
    s.properties.slides.items.required = ['n', 'layout'];
    s.required = ['slides'];
    return s;
  })();

  /** Prompt para ilustrar un hueco concreto de una diapositiva. */
  function image(slide, deck, slot = 0) {
    const proms = Array.isArray(slide.imagePrompts) ? slide.imagePrompts : [];
    const total = Store.imgCount(slide);
    const base = String(proms[slot] || proms[0] || slide.imagePrompt || slide.title || deck.title || '').trim();
    const variacion = total > 1 ? ' (variación ' + (slot + 1) + ' de ' + total + ', con encuadre distinto)' : '';
    return [
      'Ilustra esta idea para una diapositiva de presentación.',
      'Presentación: "' + deck.title + '"',
      'Diapositiva: "' + (slide.title || deck.title) + '"',
      'Idea: ' + base + variacion,
      '',
      'Directrices: ilustración editorial moderna y limpia, composición equilibrada con mucho aire,',
      'paleta armónica y elegante, sin texto ni letras incrustadas, sin logotipos, sin marcas de agua,',
      'relación de aspecto 16:9.'
    ].join('\n');
  }

  /* ---------- modo cooperativo ---------- */

  /**
   * Paso 1 del trabajo en equipo: un modelo escribe solo el guion (títulos, orden
   * e idea de cada diapositiva). Es barato y sirve de contexto común, de modo que
   * varios autores distintos cuentan la misma historia sin contradecirse.
   */
  function plan(form) {
    const count = Math.max(3, Math.min(CONFIG.maxSlides, parseInt(form.count, 10) || 10));
    const lang = LANGUAGES[form.language] || 'español';

    const user = [
      'Diseña el GUIÓN de una presentación de ' + count + ' diapositivas. NO escribas el contenido todavía,',
      'solo el esqueleto: título de cada diapositiva, su layout y la idea que desarrolla.',
      '',
      'TEMA: ' + form.topic,
      'PUBLICO: ' + (form.audience || 'general'),
      'TONO: ' + (TONES[form.tone] || TONES.profesional),
      'IDIOMA: todos los títulos en ' + lang + '.',
      form.notes ? ('INDICACIONES EXTRA: ' + form.notes) : '',
      '',
      'ESTRUCTURA: la 1 es "cover", la 2 es "agenda", la ultima es "closing".',
      'En medio usa "bullets", "two-col", "stats", "timeline", "image" e "section" sin repetir dos seguidos.',
      'Los layout permitidos son: ' + LAYOUT_IDS.join(', ') + '.',
      '',
      'Devuelve solo este JSON, con exactamente ' + count + ' elementos en "plan":',
      '{"title":"Título de la presentación","subtitle":"Subtítulo","author":"","plan":[',
      '{"n":1,"layout":"cover","title":"Título de portada","idea":"Subtítulo breve"},',
      '{"n":2,"layout":"agenda","title":"Índice","idea":"Los 4-6 bloques del tema"},',
      '{"n":3,"layout":"bullets","title":"Primer bloque","idea":"De qué trata y qué se lleva el público"}',
      ']}',
      '',
      'REGLAS:',
      '- Títulos de máximo 8 palabras, attractivos y sin repetir la idea.',
      '- "idea" es una frase que explica qué hay que contar en esa diapositiva.',
      '- Escribe TODO en ' + lang + '. Solo JSON, sin texto antes ni después.'
    ].filter(Boolean).join('\n');

    return { system: system(form), prompt: user };
  }

  /**
   * Paso 2: un modelo escribe el contenido de un tramo concreto del guion,
   * teniendo delante el guion completo para mantener el hilo.
   */
  function tramo(form, guion, parte) {
    const lang = LANGUAGES[form.language] || 'español';
    const d = densidad(form);
    const desde = parte[0].n;
    const hasta = parte[parte.length - 1].n;

    const contexto = guion.map(p => `${p.n}. [${p.layout}] ${p.titulo}${p.idea ? ' — ' + p.idea : ''}`).join('\n');
    const mio = parte.map(p => `- n:${p.n} · layout "${p.layout}" · título "${p.titulo}"${p.idea ? ' · idea: ' + p.idea : ''}`).join('\n');

    const user = [
      'Estás escribiendo TU PARTE de una presentación que varios modelos están creando a la vez.',
      'Respeta el guion aprobado: es el mismo para todos los autores.',
      '',
      'TEMA: ' + form.topic,
      'TONO: ' + (TONES[form.tone] || TONES.profesional),
      'IDIOMA: todo el contenido en ' + lang + '.',
      '',
      'GUIÓN COMPLETO (solo informational, no escribas las diapositivas que no son tuyas):',
      contexto,
      '',
      'AHORA ESCRIBE SOLO ESTAS DIAPOSITIVAS (n del ' + desde + ' al ' + hasta + '):',
      mio,
      '',
      'CONTENIDO POR LAYOUT:',
      '- cover: title, subtitle, author, date. bullets vacio.',
      '- agenda: bullets = ["Bloque 1", ...] con 4-6 elementos.',
      '- section: kicker = "BLOQUE 1", title, subtitle con una frase completa.',
      '- bullets: title + bullets (' + d.bullets + ' elementos, cada uno de ' + d.palabras + ').',
      '- two-col: title + columns = [{heading, items: []}, {heading, items: []}] con 3-4 elementos de ' + d.palabras + '. bullets vacio.',
      '- image: title + bullets (' + d.bullets + ') + imagePrompt.',
      '- image-full: title + subtitle (una frase) + imagePrompt. bullets vacio.',
      '- gallery: title + subtitle + imagePrompts (2-4 descripciones en inglés). bullets vacio.',
      '- stats: title + stats = [{value, label}] con 3-4 datos; "label" explica qué mide. bullets vacio.',
      '- bars: title + stats = [{value, label}] con 3-5 datos comparables; "value" lleva siempre un número. bullets vacio.',
      '- table: title + tcols (2-4) + trows (3-5 filas, tantas celdas como columnas). bullets vacio.',
      '- checklist: title + bullets con 3-5 requisitos verificables.',
      '- cards: title + cards = [{heading, text}] con 2-4 tarjetas. bullets vacio.',
      '- timeline: title + steps = [{title, text}] con 3-4 pasos; "text" es una frase completa. bullets vacio.',
      '- quote: quote + quoteAuthor. title vacio.',
      '- closing: title + subtitle. bullets vacio.',
      '',
      'REGLAS CRÍTICAS:',
      '- Devuelve SOLO las diapositivas que te he pedido, con su campo "n" correcto.',
      '- Escribe el mismo campo "n" que aparece arriba en cada objeto.',
      '- NINGUNA diapositiva puede quedar solo con el título: escribe su contenido desarrollado.',
      '- "bullets", "columns", "stats", "steps", "tcols", "trows" y "cards" son SIEMPRE arrays con ' + d.bullets + ' elementos de texto desarrollado.',
      '- Usa **negrita** para la palabra clave de cada viñeta.',
      '- En "image" e "image-full" rellena imagePrompt (descripción visual en inglés, sin texto).',
      '- En "gallery" rellena imagePrompts (2-4 descripciones visuales en inglés, sin texto).',
      '- notes: 3-4 frases de guion para el orador.',
      '- Solo JSON válido, sin markdown ni comentarios.',
      '',
      'FORMATO:',
      '{"slides":[{"n":' + desde + ',"layout":"bullets","title":"Titulo","bullets":["Frase completa con la idea y su consecuencia.","Frase completa."],"notes":"Guion"}]}'
    ].concat(medida(form)).filter(Boolean).join('\n');

    return { system: system(form), prompt: user, schema: SCHEMA_TRAMO };
  }

  return { system, deck, plan, tramo, image, SCHEMA_TRAMO };
})();
