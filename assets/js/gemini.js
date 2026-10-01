/* ============================================================
   DeckAI · cliente de la API de Google Gemini
   ============================================================ */

const Gemini = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';

  function key() {
    return (Store.state.settings.keys.gemini || '').trim();
  }

  function requireKey() {
    if (!key()) {
      const err = new Error('Falta la clave API de Google Gemini. Ábrela en Ajustes (⚙) y pégala.');
      err.code = 'no_key';
      throw err;
    }
  }

  async function request(path, { method = 'GET', body } = {}) {
    requireKey();

    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          'x-goog-api-key': key(),
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new Error('No se pudo conectar con Google. Revisa tu conexión a internet.');
    }

    const text = await res.text();
    let data = {};
    if (text) { try { data = JSON.parse(text); } catch (e) { /* respuesta no JSON */ } }

    if (!res.ok) {
      throw new Error(friendlyError(data, res));
    }
    return data;
  }

  function friendlyError(data, res) {
    const msg = (data.error && data.error.message) || `Error ${res.status}`;
    if (/API key not valid/i.test(msg)) return 'La clave API no es válida. Revísala en Ajustes.';
    if (/unexpected model name format|Invalid model name/i.test(msg)) {
      return 'El identificador del modelo no es válido para Google (sobran prefijos como "models/" o "google/"). ' +
        'Abre Ajustes → Imágenes y vuelve a elegir el modelo de la lista.';
    }
    if (/permission|PERMISSION_DENIED/i.test(msg)) return 'Permiso denegado: tu clave no puede usar este modelo.';
    if (/quota|rate limit|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg) || res.status === 429 || res.status === 529) {
      return 'Google dice que ahora mismo no hay cuota para tu clave (alta demanda o límite diario). ' +
        'Vuelve a pulsar "Generar" para que la app pruebe otro proveedor, o pon como proveedor de imágenes ' +
        'Pollinations (FLUX), que es gratis y sin tarjeta, en Ajustes → Imágenes.';
    }
    if (/not found|NOT_FOUND/i.test(msg)) return 'Ese modelo no existe o no está disponible para tu clave. Prueba otro en Ajustes.';
    if (/SAFETY|blocked/i.test(msg)) return 'La IA bloqueó la respuesta por seguridad. Reformula el tema.';
    return msg;
  }

  /**
   * Google solo acepta nombres planos ("gemini-3.1-flash-image"). Si el valor guardado
   * trae prefijo "models/", barra de OpenRouter o espacios, la API contesta
   * "unexpected model name format"; aquí se limpia y, si aun así no sirve, se avisa
   * antes de gastar la llamada.
   */
  function modeloValido(model) {
    const id = String(model == null ? '' : model).trim().replace(/^models\//i, '').replace(/^google\//i, '');
    if (!id) return fail('No hay ningún modelo de imagen elegido. Elige uno en Ajustes → Imágenes.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
      fail('El modelo de imagen guardado ("' + id + '") no es un nombre válido para Google. ' +
        'Abre Ajustes → Imágenes y vuelve a elegirlo de la lista.');
    }
    return id;
  }

  function fail(msg) {
    const e = new Error(msg);
    e.code = 'modelo_invalido';
    e.retryable = false;
    throw e;
  }

  function textOf(data) {
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    // los modelos Gemini 3 pueden devolver partes de "razonamiento": fuera del JSON
    return parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
  }

  const plainText = textOf;

  /* La familia Gemini 3 ignora temperature / top_k / top_p, así que solo se envían
     a los modelos que los admiten (2.5 y anteriores) para no provocar errores. */
  function supportsSampling(model) {
    return !/^gemini-3(\.|-|$)/.test(String(model || ''));
  }

  /* El identificador del modelo casi siempre dice para qué sirve. */
  const IMAGE_RE = /image|img|imagen|banana/i;
  const NOT_TEXT_RE = /tts|transcribe|live|embedding|omni|video|veo|audio/i;
  function isImageModel(id) { return IMAGE_RE.test(String(id || '')); }
  function isTextModel(id) { return !isImageModel(id) && !NOT_TEXT_RE.test(String(id || '')); }

  function genConfig(model, extra, temperature) {
    const cfg = Object.assign({}, extra);
    if (temperature != null && supportsSampling(model)) cfg.temperature = temperature;
    return cfg;
  }

  /** Elimina ```json ... ``` y recorta texto sobrante alrededor del JSON. */
  function extractJson(raw) {
    if (!raw) throw new Error('La IA devolvió una respuesta vacía.');
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) s = fence[1].trim();
    try { return JSON.parse(s); } catch (e) { /* seguir intentando */ }

    const start = s.search(/[[{]/);
    if (start > -1) {
      for (let end = s.length; end > start; end--) {
        const chunk = s.slice(start, end);
        try { return JSON.parse(chunk); } catch (e) { /* acortar */ }
      }
    }
    throw new Error('No se pudo interpretar la respuesta de la IA. Vuelve a intentarlo.');
  }

  async function listModels() {
    const data = await request('/models?pageSize=200');
    return (data.models || [])
      .filter(m => /generateContent/.test((m.supportedGenerationMethods || []).join(',')))
      .map(m => m.name.replace(/^models\//, ''))
      .sort();
  }

  async function generate(model, payload) {
    const mod = modeloValido(model);
    const data = await request('/models/' + encodeURIComponent(mod) + ':generateContent', {
      method: 'POST',
      body: payload
    });

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error('La petición fue bloqueada: ' + (data.promptFeedback.blockReason || 'motivo desconocido'));
    }
    return data;
  }

  /* ---------- Presentación completa ---------- */

  /* La generación de la presentación vive en Providers (multiproveedor);
     aquí solo queda la llamada directa a la API de Google. */

  /* ---------- Regenerar una diapositiva ---------- */

  /* ---------- Imágenes ---------- */

  async function generateImage(prompt, { aspect = '16:9', model } = {}) {
    const mod = modeloValido(model || CONFIG.defaultImageModel.gemini);

    const data = await generate(mod, {
      contents: [{
        role: 'user',
        parts: [{
          text: `${prompt}\n\nDirectrices: relación de aspecto ${aspect}, composición con espacio libre, sin texto incrustado, sin marcas de agua, calidad fotográfica.`
        }]
      }],
      generationConfig: { responseModalities: ['IMAGE'] }
    });

    const parts = ((((data.candidates || [])[0] || {}).content || {}).parts) || [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        return `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`;
      }
      if (p.inline_data && p.inline_data.data) {
        return `data:${p.inline_data.mime_type || 'image/png'};base64,${p.inline_data.data}`;
      }
    }
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      throw new Error('Imagen bloqueada por seguridad. Prueba otra descripción.');
    }
    throw new Error('El modelo ' + mod + ' no devolvió ninguna imagen' +
      (isImageModel(mod) ? '. Prueba otro en Ajustes.' : ': parece un modelo de texto. Elige uno de la familia Nano Banana en Ajustes.'));
  }

  return {
    key, requireKey, listModels, generate, generateImage, extractJson,
    isImageModel, isTextModel, supportsSampling, plainText, textOf
  };
})();
