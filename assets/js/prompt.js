/* ============================================================
   DeckAI · construcción del prompt y del esquema de respuesta
   ============================================================ */

const Prompt = (() => {

  function system(form) {
    return [
      'Eres un diseñador de presentaciones experto y un copywriter.',
      'Tu trabajo es crear el CONTENIDO de una presentación en diapositivas, no el código.',
      'Reglas de escritura:',
      '- Escribe TODO el contenido en ' + (LANGUAGES[form.language] || 'español') + '.',
      '- Titulares breves y atractivos (max. 8 palabras). Nunca repitas el titulo en el subtitulo.',
      '- Viñetas de una sola idea, máximo 14 palabras cada una. Empieza por la idea clave.',
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
      '3. El cuerpo alterna entre "bullets", "two-col", "stats", "timeline" e "image", sin repetir dos veces el mismo layout seguido.',
      '4. Inserta 1-2 layouts "section" como separadores de bloque.',
      '5. La penultima puede ser "quote".',
      '6. La ultima es layout "closing".',
      '7. Total exacto de diapositivas: ' + count + '.',
      '',
      'CONTENIDO POR LAYOUT:',
      '- cover: title, subtitle, author, date. bullets vacio.',
      '- agenda: bullets = ["Titulo del bloque 1", ...] con 4-6 elementos.',
      '- section: kicker = "BLOQUE 1", title, subtitle con una frase.',
      '- bullets: title + bullets (3-5 elementos).',
      '- two-col: title + columns = [{heading, items: []}, {heading, items: []}] con 3-4 elementos cada una. bullets vacio.',
      '- image: title + bullets (3-4) + imagePrompt.',
      '- image-full: title + subtitle + imagePrompt. bullets vacio.',
      '- stats: title + stats = [{value: "45%", label: "de reduccion"}] con 3-4 datos. bullets vacio.',
      '- timeline: title + steps = [{title, text}] con 3-4 pasos. bullets vacio.',
      '- quote: quote + quoteAuthor. title vacio.',
      '- closing: title + subtitle. bullets vacio.',
      '',
      'REGLAS GENERALES:',
      '- En "image" e "image-full" rellena SIEMPRE imagePrompt (descripcion visual detallada, en ingles, sin texto).',
      '- En el resto de layouts deja imagePrompt vacio.',
      '- notes: 1-2 frases de guion para el orador en todas las diapositivas.',
      '- Devuelve solo JSON valido, sin markdown, sin comentarios, sin texto antes ni despues.',
      '',
      'FORMATO EXACTO (copia esta estructura, con estos mismos nombres de campo):',
      '{"layout":"bullets","title":"Titulo","bullets":["Idea uno","Idea dos","Idea tres"],"notes":"Guion"}',
      '{"layout":"agenda","title":"Indice","bullets":["Bloque 1","Bloque 2","Bloque 3","Bloque 4"]}',
      '{"layout":"two-col","title":"Titulo","columns":[{"heading":"Ventajas","items":["una","dos"]},{"heading":"Inconvenientes","items":["tres","cuatro"]}]}',
      '{"layout":"stats","title":"Titulo","stats":[{"value":"45%","label":"de ahorro"}]}',
      '{"layout":"timeline","title":"Titulo","steps":[{"title":"Paso 1","text":"Detalle del paso"}]}',
      '{"layout":"quote","quote":"Cita memorable","quoteAuthor":"Quien la dijo"}',
      '{"layout":"image","title":"Titulo","bullets":["Idea una","Idea dos"],"imagePrompt":"descripcion visual en ingles"}',
      '{"layout":"cover","title":"Titulo","subtitle":"Subtitulo","author":"Nombre","date":"Fecha"}',
      '',
      'REGLAS CRITICAS:',
      '- "bullets", "columns", "stats" y "steps" son SIEMPRE arrays, con 3 a 5 elementos de texto corto. Nunca un texto suelto, nunca un objeto suelto.',
      '- NINGUNA diapositiva puede quedar solo con el titulo: escribe su contenido. Es lo mas importante.',
      '- Si un layout no pide un campo (por ejemplo "bullets" en "stats"), ese campo va como array vacio [] o se omite.',
      '- Escribe TODO el contenido, incluidos los titulos de las columnas, los datos y los pasos.'
    ].filter(Boolean).join('\n');

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
            quote: { type: 'string' },
            quoteAuthor: { type: 'string' },
            imagePrompt: { type: 'string' },
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

  /** Prompt para ilustrar una diapositiva concreta. */
  function image(slide, deck) {
    const base = String(slide.imagePrompt || slide.title || deck.title || '').trim();
    return [
      'Ilustra esta idea para una diapositiva de presentación.',
      'Presentación: "' + deck.title + '"',
      'Diapositiva: "' + (slide.title || deck.title) + '"',
      'Idea: ' + base,
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
      '- section: kicker = "BLOQUE 1", title, subtitle con una frase.',
      '- bullets: title + bullets (3-5 elementos).',
      '- two-col: title + columns = [{heading, items: []}, {heading, items: []}]. bullets vacio.',
      '- image: title + bullets (3-4) + imagePrompt.',
      '- image-full: title + subtitle + imagePrompt. bullets vacio.',
      '- stats: title + stats = [{value, label}]. bullets vacio.',
      '- timeline: title + steps = [{title, text}]. bullets vacio.',
      '- quote: quote + quoteAuthor. title vacio.',
      '- closing: title + subtitle. bullets vacio.',
      '',
      'REGLAS CRÍTICAS:',
      '- Devuelve SOLO las diapositivas que te he pedido, con su campo "n" correcto.',
      '- Escribe el mismo campo "n" que aparece arriba en cada objeto.',
      '- NINGUNA diapositiva puede quedar solo con el título: escribe su contenido.',
      '- "bullets", "columns", "stats" y "steps" son SIEMPRE arrays con 3-5 elementos cortos.',
      '- Usa **negrita** para la palabra clave de cada viñeta.',
      '- En "image" e "image-full" rellena imagePrompt (descripción visual en inglés, sin texto).',
      '- notes: 1-2 frases de guion para el orador.',
      '- Solo JSON válido, sin markdown ni comentarios.',
      '',
      'FORMATO:',
      '{"slides":[{"n":' + desde + ',"layout":"bullets","title":"Titulo","bullets":["Idea uno","Idea dos","Idea tres"],"notes":"Guion"}]}'
    ].filter(Boolean).join('\n');

    return { system: system(form), prompt: user, schema: SCHEMA_TRAMO };
  }

  return { system, deck, plan, tramo, image, SCHEMA_TRAMO };
})();
