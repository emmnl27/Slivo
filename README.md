# AI Slides · Generador de presentaciones con IA

Aplicación web que crea presentaciones completas a partir de un tema usando **Google Gemini u otros cinco proveedores**, con editor visual, 8 temas, 11 tipos de diapositiva, modo presentador y exportación a **PDF** y **PPTX**.

No necesita instalación, servidor ni compilación: es HTML, CSS y JavaScript puro.

---

## Puesta en marcha

1. Abre `index.html` en Chrome, Edge o Brave (doble clic).
   Si tu navegador bloquea los archivos locales, ejecuta en la carpeta del proyecto:
   ```powershell
   python -m http.server 8000
   ```
   y entra en `http://localhost:8000`.
2. La pantalla de inicio te propone tres caminos: **Escribir mi tema** (te lleva al campo), **Empezar en blanco**
   (abre el lienzo con el cursor en el título) o **Abrir un archivo**.
3. En el panel de la izquierda sigue los tres pasos: cuéntanos de qué va, elige plantilla y genera.
   Hay ejemplos rápidos que rellenan el tema por ti y el paso se va marcando solo según lo que te falta.
4. Pulsa **Ajustes** (icono de engranaje) para pegar la clave del proveedor.
5. Pulsa **Comprobar clave** para verificarla al momento, sin esperar a generar nada.
6. Pulsa **Generar presentación**.

> La clave se usa directamente desde tu navegador contra la API del proveedor. Si no marcas "Recordar claves", se quedan solo en memoria y se borran al cerrar la pestaña.

### Comprobar clave (importante)

Al pegar la clave aparece el botón **Comprobar clave**. Es la forma rápida de saber si todo está bien, y evita
descubrir el problema tres minutos después, ya generando:

| Si pone | Significa |
| --- | --- |
| `✓ Clave correcta · saldo: X $` | Todo bien. En OpenRouter indica además cuánto dinero queda. |
| `La clave es válida, pero la cuenta tiene 0 € de saldo` | La clave sirve, pero sin saldo OpenRouter rechaza también los modelos `GRATIS`. Hay que topping up. |
| `Esa clave no parece de OpenRouter: tiene que empezar por sk-or-` | Se pegó una clave de otro proveedor en el campo equivocado. |
| `OpenRouter no reconoce la clave` | La clave se pegó con basura (espacios o saltos de línea en medio) o la cuenta no está verificada. |

> **Clave válida ≠ imagen gratis.** En OpenRouter, `/auth/key` puede decir que todo correcto (saldo, cuota de 50
> peticiones diarias gratis) y aun así la generación fallar con `403` si el modelo pide una confirmación previa
> (por ejemplo `meta/muse-image` exige marcar que eres +18) o con `402` si la cuenta nunca ha comprado créditos. Por
> eso los mensajes distinguen los tres casos en vez de Saying "clave inválida" a todo.

La app limpia los espacios y saltos de línea de la clave al pegarla, porque OpenRouter y Google responden `401` a
una clave con basura dentro sin explicar por qué. Aun así, si el botón dice que la clave es correcta y la
generación falla con `401`, el problema ya no es la clave: es la cuenta o el modelo.

---

## Proveedores de texto

| Proveedor | Modelo por defecto | Clave | Notas |
|---|---|---|---|
| **Google Gemini** | `gemini-3.7-flash` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Gratuita, pero con límites de cuota muy bajos: es la que más veces se queda sin servicio |
| **OpenRouter** | `qwen/qwen3.8-27b:free` | [openrouter.ai/keys](https://openrouter.ai/keys) | Una sola clave da acceso a 400+ modelos; los que acaban en `:free` no cuestan nada |
| **Groq** | `llama-3.3-70b-versatile` | [console.groq.com/keys](https://console.groq.com/keys) | Plan gratuito generoso y la latencia más baja |
| **Mistral** | `mistral-small-latest` | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) | Modelos europeos, gratuitos y muy rápidos |
| **Hugging Face** | (a elegir) | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) | Miles de modelos abiertos con un token de inferencia |
| **Pollinations** | `openai/gpt-5.4-nano` | [enter.pollinations.ai](https://enter.pollinations.ai) | Agrega GPT, Claude, Grok y Qwen; al registrarse te dan Pollen para probar |
| **Ollama** | `llama3.2` | no hace falta | Se ejecuta en tu equipo, sin internet y sin coste |

OpenRouter, Pollinations, Groq, Mistral, Hugging Face y Ollama usan una API **compatible con OpenAI**, así que
comparten el mismo cliente (`assets/js/providers.js`). El botón **Ver modelos** de Ajustes consulta la lista real
de modelos de cada proveedor y la muestra en el desplegable.

### Si falla: cambio automático de proveedor

Por defecto, la casilla **"Si falla, cambiar de modelo y de proveedor automáticamente"** está activada. Cuando la
generación recibe un error de cuota (429), de servidor saturado (500/503/529) o una respuesta vacía, la app:

1. Reintenta el mismo modelo una vez esperando un instante.
2. Prueba tu modelo en otro proveedor que tenga clave.
3. Prueba otros modelos del proveedor elegido (por ejemplo, un `-lite` más barato).
4. Si todos fallan, muestra un aviso explicando qué pasó en cada intento (visible en la consola del navegador).

Puedes descomprobar la casilla para quedarte solo con el proveedor y el modelo que elijas.

Un error de **clave inválida (401/403)** o de **modelo inexistente (404)** no se reintenta: es un problema de
configuración y hay que corregirlo en Ajustes.

### Si la IA devuelve solo títulos

Algunos modelos respetan el esquema pero se saltan los campos de contenido, y la presentación se queda con
encabezados y diapositivas en blanco. La app lo detecta y hace una segunda llamada pidiendo únicamente lo que
falta (viñetas, columnas, cifras, pasos o la frase de apoyo), emparejando la respuesta por número de diapositiva,
por título o por orden. Si aun así queda alguna sin contenido, el aviso verde indica cuántas son: usa
**Rehacer con IA** en esa diapositiva concreta.

### Varias claves a la vez

Puedes guardar claves de varios proveedores. En Ajustes, el desplegable **Otras claves guardadas** permite editarlos
sin cambiar de proveedor, y la barra superior indica cuántos proveedores quedan en reserva.

### Varios modelos trabajando a la vez

Por defecto está activo **«Repartir las diapositivas entre varios modelos»**. Así es como funciona:

1. Un modelo (el que tengas elegido) escribe el guion completo: títulos, títulos de sección y una diapositiva por idea.
2. Ese guion se parte en hasta cuatro tramos y **cada proveedor distinto con clave se queda con uno**.
3. Los tramos se escriben de dos en dos para no disparar los límites de peticiones.
4. Si a un proveedor le faltan tokens, lo salta el siguiente de la fila y el tramo lo termina otro. Al final la
   presentación se ordena por número de diapositiva, así que las piezas encajan igual.

Detalles que importan:

- Se reparten **proveedores distintos**, no varios modelos del mismo. Dos modelos de Groq comparten cuota y rate
  limit, que es justo lo que el relevo viene a evitar.
- Con un solo proveedor con clave el trabajo en equipo se desactiva solo y se genera entero con ese modelo.
- Desmarcando la casilla vuelve al comportamiento de siempre: un modelo escribe todo.
- La barra de progreso avisa de en qué va (guion, tramo) y al terminar el aviso verde indica cuántos modelos han
  trabajado y cuántas diapositivas ha hecho cada uno.

### Imágenes

Hay cinco proveedores que dibujan ilustraciones y se eligen aparte del de texto:

| Proveedor | Modelos | Dónde conseguir la clave |
| --- | --- | --- |
| **Google Gemini** | 4 (familia Nano Banana) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **OpenRouter** | 55, con FLUX.2, GPT Image, Seedream, Qwen Image, Recraft, Riverflow, MAI, Krea y Grok Imagine | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Pollinations** | FLUX y Turbo **sin clave**; con clave, 60+ con Seedream, Ideogram, Recraft, Grok, Z-Image y Nova Canvas | [enter.pollinations.ai](https://enter.pollinations.ai) |
| **Hugging Face** | Stable Diffusion 3 Medium en `hf-inference` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| **AI Horde** | Stable Diffusion, Deliberate, DreamShaper, AlbedoBase XL, Juggernaut XL y Realistic Vision, **sin clave** | Opcional: [aihorde.net/register](https://aihorde.net/register) |

- El catálogo de cada uno está escrito en `assets/js/config.js` y el botón **Ver modelos** consulta la API en vivo
  para añadir los que no estén en el catálogo. OpenRouter y Pollinations responden a ese listado sin necesidad de
  clave; Gemini necesita la suya. Hugging Face y AI Horde usan su catálogo local: HF no lista los de imagen en
  `/v1/models` (esa ruta solo trae los de chat) y la Horde mezcla cientos de modelos, muchos NSFW.
- Cada proveedor recuerda su propio modelo, así que puedes alternar sin perder la elección.
- Si el proveedor elegido falla o se queda sin saldo, se prueban los demás que puedan generar, con la misma lógica
  de reintentos que el texto. El error final lista **todos** los intentos (proveedor, modelo y motivo) en vez de
  enseñar solo el último, que es lo que hacía creer que la app ignoraba tu elección.
- Pollinations cuenta como proveedor de imágenes aunque no tenga clave: usa su ruta gratuita con FLUX.
- AI Horde también cuenta sin clave (clave anónima `0000000000`). Es **asíncrono**: la app envía el trabajo, espera en
  la cola y recoge la imagen, así que cada ilustración tarda 10-60 s. Si guardas una clave gratuita de
  [aihorde.net/register](https://aihorde.net/register), ganas prioridad y esperas menos.
- Si al proveedor elegido le falta la clave, se avisa de ello en el error y en la barra superior, que muestra el
  proveedor que se va a usar de verdad.
- Si al final no se generó ninguna imagen, el resumen lo dice con números reales (`2 de 5 generadas`) en lugar de
  cantar `Imágenes listas: 5/5`.
- Si no hay ninguna clave de imagen, la app sigue funcionando: se guarda la descripción para más tarde y puedes
  subir tus propias imágenes.

#### Los modelos que de verdad no cuestan nada

| Modelo | Qué es |
| --- | --- |
| `meta/muse-image` | OpenRouter · crea y edita imágenes. **Ojo: pide confirmar que eres mayor de 18 años** en openrouter.ai → Settings → Preferences. Si no lo marcas, el servidor responde `403` y no genera nada. |
| `inclusionai/ming-image-0.1-design` | OpenRouter · diseño y logotipos |
| `inclusionai/ming-image-0.1-design-layer` | OpenRouter · retoca una imagen que ya tienes |
| `stabilityai/stable-diffusion-3-medium-diffusers` | Hugging Face · texto a imagen en `hf-inference`. **La cuenta gratuita solo trae 0,10 $/mes de crédito** de Inference Providers, así que da para unas pocas imágenes y luego pide saldo (o subir a PRO, 9 $/mes = 2 $/mes de crédito). |
| `stable_diffusion` y más | **AI Horde** · red comunitaria, **sin clave ni tarjeta**. `stable_diffusion` sirve cualquiera de los SD disponibles; también hay `Deliberate`, `DreamShaper`, `AlbedoBase XL (SDXL)`, `Juggernaut XL` y `Realistic Vision`, todos gratis. |

Los modelos gratuitos salen agrupados bajo **GRATIS** en el desplegable.

#### Imágenes gratis y sin tarjeta: qué funciona de verdad

| Opción | Clave | Fiabilidad |
| --- | --- | --- |
| **AI Horde** | Ninguna (anónima `0000000000`) | **La mejor sin tarjeta.** Red comunitaria: no hay cuota fija ni pago. Su clave anónima tiene la prioridad más baja, así que cada imagen espera 10-60 s en la cola; con una clave gratuita registrada va más rápido. |
| **Pollinations · FLUX** | Ninguna | **Sin garantías.** Es una cola gratuita: cuando se llena responde `402` al instante y solo entra alguna petición cada certo tiempo. En pruebas seguidas llegó a dar 0 aciertos de 12. La app lo intenta dos veces y, si no entra, pasa al siguiente proveedor sin marearte. |
| **Hugging Face** | Un token `hf_…` | **Fiable.** Stable Diffusion 3 Medium dentro de la cuota mensual de Inference Providers. Es la opción sin coste más estable, aunque no ilimitada. |
| **OpenRouter** | Clave `sk-or-…` | Estable, pero la cuenta debe tener **algo de saldo**: una cuenta que nunca ha comprado créditos recibe `402 Insufficient credits` aunque el modelo salga como `GRATIS`, y `meta/muse-image` además pide confirmar el +18 en Settings → Preferences. |
| **Google Gemini** | Clave `AIza…` | El más fácil de conseguir, pero las claves gratuitas tienen cuota diaria muy baja y en hora punta da `429`. |

Orden recomendado: **AI Horde** si quieres gratis, sin tarjeta y sin tope de cuota (a cambio de esperar en la cola);
**Hugging Face** si prefieres gratis y estable; o **OpenRouter** con unos céntimos de saldo si quieres calidad.

#### Hugging Face en detalle

- Se usa tanto para texto como para imágenes, así que aparece en los dos desplegables. Cuando el proveedor de imágenes
  coincide con el de texto, su clave se edita una sola vez; si difieren, la sección «Imágenes» de Ajustes muestra su
  propio campo con el botón **Comprobar clave**.
- Cómo conseguir el token:
  1. Abre <https://huggingface.co/settings/tokens>
  2. Crea un token con permiso de **Read** (el plan gratuito basta)
  3. Pégalo en Ajustes → Imágenes → Hugging Face → *Comprobar clave*
- Las imágenes **no** van por la ruta OpenAI (`/v1`, que solo atiende chat) sino por la ruta propia de Inference
  Providers: `POST https://router.huggingface.co/hf-inference/models/{modelo}` con `{ inputs, parameters }`. La app
  manda el cuerpo mínimo (`{ inputs }`) y reintenta sin `parameters` si el modelo rechaza el tamaño.
- El único modelo texto-a-imagen del catálogo de `hf-inference` es `stabilityai/stable-diffusion-3-medium-diffusers`.
  Otros proveedores de la plataforma (fal, Replicate, etc.) alojan mejores modelos, pero funcionan con colas y
  sondeo, que es más complejo de lo que la app necesita ahora.
- Funciona desde el navegador: `router.huggingface.co` responde con `Access-Control-Allow-Origin: *`. Si el token no
  tiene crédito de Inference Providers, la API lo dice en el propio JSON del error y se muestra tal cual.

#### AI Horde en detalle

- Es la opción **gratis de verdad**: sin tarjeta y sin tope de cuota. Funciona con la clave anónima `0000000000`
  (prioridad más baja); una clave gratuita de <https://aihorde.net/register> solo mejora el turno en la cola y no cuesta.
- Su API es **asíncrona** y va por su propia ruta (`https://aihorde.net/api/v2`), no por `/chat/completions`:
  1. `POST /generate/async` con `{ prompt, params:{width,height,steps}, models:[…] }` → devuelve un `id`.
  2. `GET /generate/check/{id}` hasta que `done` o `faulted`.
  3. `GET /generate/status/{id}` → la imagen llega en `generations[0].img` en base64 (PNG o WebP).
- La app sondea cada 2,5 s hasta 3 minutos. Si la cola se agota, da un error claro y sigue con otro proveedor.
- Se envían las cabeceras `Client-Agent` y `apikey`; ambas son "personalizadas" y disparan el `OPTIONS` previo, que
  AI Horde permite, así que funciona desde `file://` sin backend.
- El catálogo es una lista curada en `config.js`: AI Horde publica 160+ modelos, pero muchos son NSFW o poco fiables,
  y se guardan los seis con más workers.

#### Por qué antes no salía ninguna imagen

Ningún endpoint que no devuelva cabeceras CORS puede llamarse desde el navegador. Ese fue el motivo de quitar
**Cloudflare Workers AI**: `api.cloudflare.com` (y su puerta `gateway.ai.cloudflare.com`) no responde a las peticiones
`OPTIONS` con las cabeceras necesarias, así que el navegador bloqueaba siempre el `fetch` y la app mostraba un
«No pude conectar con Cloudflare» engañoso. Hugging Face, Pollinations y AI Horde sí devuelven `Access-Control-Allow-Origin`
(el último, incluso en el `OPTIONS` de una petición con cabeceras `Client-Agent` y `apikey`), por eso son los proveedores
sin clave o de clave sencilla que mejor encajan en una app puramente de navegador.

Además, la app pedía a OpenRouter `aspect_ratio` y `quality: 'high'` siempre. De los 55 modelos de imagen que publica
OpenRouter, **52 admiten `aspect_ratio` pero los tres gratuitos no lo admiten**, así que la petición devolvía 400 y
nunca se veía un dibujo. Ahora la app consulta `supported_parameters` de cada modelo (la API lo devuelve como mapa)
y solo manda lo declarado. Con Pollinations, `size` sí se acepta.


### Ollama en local

1. Instala Ollama y arráncalo.
2. Descarga un modelo: `ollama pull llama3.2`.
3. En Ajustes elige **Ollama** como proveedor. No hace falta pegar clave.

La app llama a `http://127.0.0.1:11434/v1`. Si Ollama no está arrancado, el aviso te lo dice explícitamente.
Para usarlo desde otro equipo tendrías que cambiar la URL en `assets/js/config.js`.

---

## Funciones

**Interfaz**
- Todo el proceso está en tres pasos (tema → plantilla → generar) y el panel izquierdo se marca a medida que avanzas.
- En la pantalla vacía no hay un lienzo en blanco: hay una guía con las tres formas de empezar.
- La barra superior agrupa las acciones por tipo (nuevo/abrir, guardar, exportar, presentar) y siempre indica si
  lo último quedó **Guardando…** o **Guardado** en el navegador.
- La columna de la derecha se divide en dos zonas con su propio scroll: la lista de diapositivas arriba y el
  inspector abajo, de modo que un inspector largo nunca esconde las miniaturas.
- La cabecera del inspector recuerda sobre qué diapositiva estás ("Diapositiva 2 · Viñetas · 2 de 3").
- El botón `?` de la barra superior (o la propia tecla) abre la **guía rápida** con los atajos.
- En ventanas estrechas el panel de diapositivas se oculta y se abre con el botón **Diapositivas** de la barra del
  lienzo; al abrir el asistente se aparta para que la diapositiva se vea grande.

**Generación**
- Tema libre, número de diapositivas (3–40), idioma, público, tono y estilo.
- Salida en JSON estructurado: portada, índice, secciones, listas, comparaciones, datos, cronologías, citas y cierre.
- Si la IA devuelve alguna diapositiva **solo con el título**, la app detecta los huecos y pide el contenido que
  falta en una única llamada extra, sin repetir el resto de la presentación.
- **Rehacer con IA** en cualquier diapositiva concreta.
- Notas del orador generadas para cada diapositiva.

**Diseño**
- 8 temas: `aurora`, `minimal`, `corporate`, `sunset`, `forest`, `mono`, `neon`, `ocean`.
- 11 layouts: portada, sección, índice, viñetas, dos columnas, imagen, imagen a sangre, datos, cronología, cita y cierre.
- El tamaño de letra se adapta solo si el texto es más largo de lo previsto, para que nada se salga de la diapositiva.
- Diapositivas de 1280×720 (16:9) escaladas al panel, con el mismo aspecto en pantalla, PDF y PPTX.

**Imágenes**
- Generación de ilustraciones con **cinco proveedores**: Google Gemini (Nano Banana), OpenRouter, Pollinations,
  Hugging Face y AI Horde (gratis y sin clave). Elige el proveedor y el modelo aparte del de texto, con catálogo
  propio para cada uno y listado en vivo.
- Los modelos que no cuestan nada van agrupados bajo **GRATIS**, con AI Horde sin clave, Stable Diffusion 3 en
  Hugging Face y tres de OpenRouter.
- Cambio automático entre proveedores de imagen si el elegido falla o se queda sin saldo.
- **Subir tus propias imágenes** de tres maneras, en cualquier diapositiva:
  - el botón **Subir imagen** del inspector;
  - arrastrando el archivo desde el escritorio hasta la diapositiva;
  - con un clic en el hueco punteado de los layouts *Imagen* e *Imagen a sangre*.
- Si el layout actual no tiene hueco para la imagen (viñetas, índice, datos…), al subirla pasa automáticamente a
  *Imagen + texto* para que se vea, y avisa de ello.
- Compresión automática a JPEG ligero antes de generar el PPTX.

**Edición**
- Clic sobre cualquier texto para editarlo directamente.
- Panel lateral con inspector de la diapositiva: layout, notas, duplicar, eliminar y regenerar.
- Miniaturas con arrastrar y soltar para reordenar.
- El panel de notas del orador permite editar y volver a generar las notas de cada diapositiva.

**Asistente (chat)**
- Botón **Asistente** o `Ctrl/⌘ + K`: pide cambios con tus palabras y los aplica sobre la presentación.
- Entiende la diapositiva que tienes seleccionada («quítale la última viñeta», «pásala a dos columnas») y también
  la presentación entera («añade una diapositiva de conclusiones», «borra la 7», «cambia la plantilla»).
- Cada respuesta dice qué ha tocado con etiquetas y trae su propio botón **deshacer**; también `Ctrl/⌘ + Alt + Z`.
- Mantiene la conversación (con el contexto de las últimas 6 interventions) y la guarda en el navegador.
- Si pides una imagen y no hay ninguna clave de proveedor de imagen, deja guardada la descripción para generarla después.
- Si no hay ninguna clave de IA configurada, te dice que la añadas en Ajustes en lugar de fallar en silencio.

**Presentación**
- `F5` o el botón **Presentar**: pantalla completa, navegación con flechas o barra espaciadora, cronómetro e índice visual.
- Vista de notas del orador durante la presentación (tecla `N`).

**Exportación**
- **PDF**: abre el diálogo de impresión con el maquetado de presentación (elige *Guardar como PDF*, tamaño 16:9, márgenes "ninguno").
- **PPTX**: archivo editable con PptxGenJS, con textos, imágenes y colores sólidos de cada tema.
- Guardado y apertura de la presentación en formato `.json`.

---

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl/⌘ + Enter` | Generar la presentación |
| `?` | Abrir la guía rápida de la app |
| `F5` | Modo presentación |
| `Ctrl/⌘ + S` | Guardar en el navegador |
| `Ctrl/⌘ + O` | Abrir un `.json` |
| `Ctrl/⌘ + E` | Exportar a PPTX |
| `Ctrl/⌘ + K` | Abrir o cerrar el asistente |
| `Ctrl/⌘ + Alt + Z` | Deshacer el último cambio del asistente |
| `Enter` / `Shift + Enter` | Enviar el mensaje / salto de línea (en el asistente) |
| `Supr` / `Retroceso` | Eliminar la diapositiva seleccionada |
| `←` `→` `Espacio` | Navegar en modo presentación |
| `↑` / `↓` / `Inicio` / `Fin` | Cambiar de diapositiva o ir a la primera o a la última |
| `N` | Mostrar u ocultar las notas del orador |
| `O` | Mostrar u ocultar el índice de diapositivas |
| `F` | Alternar pantalla completa |
| `Esc` | Cerrar el asistente, el panel de diapositivas o un diálogo; salir de la presentación |

---

## Estructura del proyecto

```
ai-slides/
├─ index.html            Interfaz completa y scripts
└─ assets/
   ├─ css/
   │  ├─ app.css         Interfaz: barra, paneles, miniaturas, diálogos
   │  └─ slides.css      Diapositivas, temas, layouts e impresión
   └─ js/
      ├─ config.js       Proveedores, catálogos de modelos, layouts, temas, tonos e idiomas
      ├─ store.js        Estado, normalización y persistencia
      ├─ gemini.js       Cliente de la API de Gemini (texto e imágenes)
      ├─ prompt.js       Instrucciones y esquema de respuesta
      ├─ providers.js    Cliente unificado multiproveedor, reintentos y cambio de proveedor
      ├─ render.js       Dibujo de cada layout
      ├─ editor.js       Edición, miniaturas e inspector
      ├─ images.js       Generación, carga y compresión de imágenes
      ├─ chat.js         Asistente conversacional: contexto, cambios y deshacer
      ├─ present.js      Modo presentación
      ├─ exports.js      Exportación a PDF y PPTX
      └─ app.js          Arranque y coordinación
```

Los datos se guardan en `localStorage` bajo la clave `deckai.v1` (presentación, ajustes —claves incluidas si marcas
"Recordar claves"— y la conversación del asistente). Para empezar de cero, borra el almacenamiento del sitio desde los
ajustes del navegador.

---

## Modelos

En **Ajustes** eliges primero el proveedor y después el modelo. El desplegable muestra el catálogo de ese
proveedor con una descripción de cada modelo, y el botón **Ver modelos** añade los modelos que tu clave puede usar
realmente (consulta la API), por si tienes acceso a versiones experimentales.

### Texto en Gemini

| Modelo | Para qué |
|---|---|
| `gemini-3.8-flash` | El Flash más inteligente, GA. El mejor resultado en general |
| `gemini-3.7-flash` | **Recomendado.** Rápido y muy capaz |
| `gemini-3.6-flash` | Equilibrio velocidad/calidad |
| `gemini-3.5-flash` | Rápido y económico |
| `gemini-3.5-flash-lite` | Muy rápido, coste mínimo |
| `gemini-3.1-flash-lite` | Rinde como un Pro por poco dinero |
| `gemini-3.1-pro-preview` | Máxima calidad (preview) |
| `gemini-2.5-flash` | Estable y admite el parámetro de temperatura |
| `gemini-2.5-flash-lite` | El más barato de la gama |
| `gemini-2.5-pro` | Razonamiento profundo |

### Texto en OpenRouter

Los modelos marcados con `:free` no cuestan nada, así que son la opción más segura cuando Google está saturado:

| Modelo | Para qué |
|---|---|
| `qwen/qwen3.8-27b:free` | **Gratis.** Buen resultado y salida estructurada fiable |
| `google/gemma-4-31b-it:free` | Gratis, muy capaz |
| `nvidia/nemotron-3-super-120b-a12b:free` | Gratis, contexto de 1 M de tokens |
| `inclusionai/ling-3.0-flash-sante:free` | Gratis y muy rápido |
| `openai/gpt-4o-mini` | Barato y fiable |
| `anthropic/claude-sonnet-4.5` | Muy bueno escribiendo |
| `meta-llama/llama-3.3-70b-instruct` | Abierto y sólido |
| `deepseek/deepseek-chat` | Barato, buen razonamiento |

En Groq: `llama-3.3-70b-versatile`, `openai/gpt-oss-120b`, `llama-3.1-8b-instant`, `qwen/qwen3-32b`.
En Mistral: `mistral-small-latest`, `mistral-large-latest`, `ministral-8b-latest`, `open-mistral-nemo`.
En Ollama: `llama3.2`, `qwen2.5`, `gemma3`, `mistral` (los que tengas descargados).

### Modelos de imagen

El catálogo completo está en `CONFIG.imageModels`, separado por proveedor. Los más útiles de cada uno:

**Gemini (Nano Banana)**

| Modelo | Para qué |
|---|---|
| `gemini-3.1-flash-image` | **Recomendado.** Rápido, ideal para ilustrar muchas diapositivas |
| `gemini-3-pro-image` | Máxima calidad, hasta 4K y mejor texto en la imagen |
| `gemini-3.1-flash-lite-image` | El más barato |
| `gemini-2.5-flash-image` | Modelo anterior |

**OpenRouter** (endpoint `POST /api/v1/images`, se envía `aspect_ratio` y `quality`)

| Modelo | Para qué |
|---|---|
| `google/gemini-3.1-flash-image` | **Recomendado.** El más barato de los que pintan bien |
| `openai/gpt-image-2` | Excelente con texto dentro de la imagen |
| `black-forest-labs/flux.2-flex` | Sigue muy bien el texto; hasta 8 referencias |
| `black-forest-labs/flux.2-max` | El más fiel a la descripción |
| `bytedance-seed/seedream-5-0-pro` | 2K y hasta 14 imágenes de referencia |
| `recraft/recraft-v4.1` / `-vector` | Diseño y gráficos; la versión vector devuelve SVG |
| `x-ai/grok-imagine-image-2.0`, `sourceful/riverflow-v2.5-pro`, `krea/krea-2-large`, `microsoft/mai-image-2.6` | Estilos y fotorrealismo |

**Pollinations**

Las imágenes van por una ruta distinta a la del texto: `GET https://image.pollinations.ai/prompt/{descripción}` con
`width`, `height`, `model` y `seed` como parámetros, y **sin clave**. Devuelve el archivo de imagen directamente
(no base64), así que la app lo convierte a data-URL. Si el servicio responde `402` se reintenta una vez con otro
`seed` (el seed decide por qué cola entra la petición) y, si vuelve a fallar, se continúa con el siguiente
proveedor. Con clave de Pollinations se añade la cabecera `Authorization` y se pueden usar los modelos de pago
vía `POST /v1/images/generations`.

| Modelo | Para qué |
|---|---|
| `google/gemini-3.1-flash-image` | **Recomendado.** Muy barato |
| `ideogram-ai/ideogram-v4-quality` | El mejor de todos con texto |
| `tongyi-mai/z-image-turbo` | El más barato del catálogo |
| `black-forest-labs/flux.2-max`, `flux.2-klein-4b` | Calidad y velocidad |
| `black-forest-labs/flux.1-kontext-pro`, `amazon/nova-canvas-v1` | Editar una imagen que ya tienes |

**AI Horde** (gratis y sin clave; API asíncrona propia)

La app envía el trabajo (`POST /api/v2/generate/async`), sondea (`GET /generate/check/{id}`) y recoge la imagen en
base64 (`GET /generate/status/{id}` → `generations[0].img`). El tamaño se pide en múltiplos de 64 (base 512 px: bajo
alta demanda AI Horde rechaza con 403 los encargos de más de ~581×581 px si no tienes kudos, así que la app nunca pasa
de 512 px de lado). Catálogo curado:

| Modelo | Para qué |
|---|---|
| `stable_diffusion` | **Recomendado.** Cualquiera de los SD disponibles, el más rápido |
| `Deliberate` | Realista y equilibrado |
| `Dreamshaper` | Ilustración y fantasía |
| `AlbedoBase XL (SDXL)` | Más resolución y detalle |
| `Juggernaut XL` | Fotorrealista |
| `Realistic Vision` | Retratos y fotografía |

Las APIs devuelven la imagen en formatos distintos (base64 con `media_type`, base64, URL o archivo crudo). La app lo
normaliza siempre a un data-URL y lo reescala a 1024 px para que quepa en el almacenamiento del navegador.

### Cualquier otro modelo

Si tu clave tiene acceso a un modelo que no aparece en el catálogo, elige **Otro modelo (escribir el ID)**
y escribe el identificador exacto (por ejemplo `gemini-9-experimental-09-2026`). La app se encarga de los
detalles:

- Si el modelo es de la familia **Gemini 3** no se le envía `temperature`, porque esa familia la ignora y
  algunas versiones la rechazan.
- Las partes de "razonamiento" que devuelven los modelos con thinking se descartan antes de leer el JSON.
- En los proveedores compatibles con OpenAI se pide JSON con `response_format: json_object`.
- Si un modelo no respeta el esquema JSON, la app reintenta pidiéndole solo JSON válido.
- Si el contenido llega con otro formato (viñetas como texto con saltos de línea, claves como `items`, `points`,
  `data` o `fases`…), la app lo reconoce y lo adapta, en lugar de mostrar la diapositiva solo con el título.
- Si el contenido viene en un formato que no corresponde al layout (por ejemplo, datos en una diapositiva de
  viñetas), se cambia al layout que sí puede mostrarlo.
- Si no existe o tu clave no tiene permiso, el error se explica en un aviso en lugar de romperse.
- Si eliges un modelo de texto como modelo de imágenes en Gemini, se avisará de que no se generarán ilustraciones.

---

## Límites conocidos

- Las claves gratuitas tienen límites por minuto y por día. Cuando se agotan o el servicio está saturado, la app
  cambia de proveedor automáticamente, pero si no tienes ninguna clave alternativa solo podrás esperar unos minutos.
- Los modelos pequeños y gratuitos son menos precisos y pueden devolver JSON menos cuidado que Gemini; la app lo
  reintenta y normaliza, pero conviene revisar el texto.
- La exportación a PPTX usa **colores sólidos** en los temas con degradado, y las imágenes se recomprimen; el resultado es muy similar pero no idéntico al PDF.
- La exportación a PDF depende del diálogo de impresión del navegador (en Chrome y Edge, *Guardar como PDF*).
- PptxGenJS se carga desde un CDN, así que la primera carga de la página requiere internet.
- La app no envía datos a ningún servidor propio: todo va de tu navegador al proveedor que elijas.
- La calidad del resultado depende del modelo y del tema; conviene revisar el texto antes de exportar.
- El asistente no ve la diapositiva renderizada: solo lee el texto y la estructura de la presentación. Si pides un
  retoque visual fino («más elegante», «cambia el color»), conviene concretarlo («pásala a dos columnas», «tema
  corporativo»). Aun así, cada cambio se puede deshacer.
- Si la IA interpreta mal una petición, el botón **deshacer** del mensaje devuelve la presentación a como estaba.
