/* ============================================================
   DeckAI · configuración, temas y layouts
   ============================================================ */

const CONFIG = {
  slideW: 1280,
  slideH: 720,

  /* Imágenes. El proveedor por defecto sigue siendo Gemini (familia Nano Banana),
     pero OpenRouter, Pollinations, Hugging Face y AI Horde también generan
     ilustraciones. AI Horde y Pollinations funcionan sin clave. */
  image: {
    provider: 'gemini',
    model: 'gemini-3.1-flash-image'
  },

  /* Proveedores de texto. "estilo" decide el formato de la petición:
       gemini -> API propia de Google;  openai -> /chat/completions compatible. */
  providers: [
    {
      id: 'gemini', short: 'Gemini', name: 'Google Gemini', style: 'gemini', needsKey: true, imagen: true, keyPrefix: 'AIza',
      keyLabel: 'Clave API de Google Gemini', keyPlaceholder: 'AIza...',
      keyUrl: 'https://aistudio.google.com/apikey',
      note: 'Requiere clave gratuita en AI Studio, pero tiene límites de cuota muy bajos. También genera imágenes (Nano Banana).'
    },
    {
      id: 'openrouter', short: 'OpenRouter', name: 'OpenRouter (GPT, Claude, Llama, Qwen…)', style: 'openai', needsKey: true, imagen: true,
      keyPrefix: 'sk-or-',
      imagePath: '/images',
      keyLabel: 'Clave de OpenRouter', keyPlaceholder: 'sk-or-v1-...',
      keyUrl: 'https://openrouter.ai/keys',
      note: 'Una sola clave da acceso a 400+ modelos de texto y a 55 de imagen. Tres son gratis: meta/muse-image y los dos inclusionai/ming.'
    },
    {
      id: 'pollinations', short: 'Pollinations', name: 'Pollinations (texto e imágenes)', style: 'openai', needsKey: true, imagen: true,
      // Las imágenes van por GET a /prompt/{texto} y funcionan SIN clave (FLUX).
      // Es lo único gratis de verdad sin tarjeta; a ratos responde 402 y se reintenta.
      imagenSinClave: true,
      imagenPromptUrl: 'https://image.pollinations.ai/prompt/{prompt}',
      imagePath: '/images/generations',
      keyLabel: 'Clave de Pollinations', keyPlaceholder: 'pk_... o sk_...',
      keyUrl: 'https://enter.pollinations.ai',
      note: 'Gratis sin clave para imágenes (FLUX). Con clave, además, texto e imágenes con GPT, Claude y ~60 modelos.'
    },
    {
      id: 'groq', short: 'Groq', name: 'Groq (el más rápido, gratis)', style: 'openai', needsKey: true,
      keyLabel: 'Clave de Groq', keyPlaceholder: 'gsk_...',
      keyUrl: 'https://console.groq.com/keys',
      note: 'Plan gratuito con límites generosos y latencia muy baja.'
    },
    {
      id: 'mistral', short: 'Mistral', name: 'Mistral (gratis)', style: 'openai', needsKey: true,
      keyLabel: 'Clave de Mistral', keyPlaceholder: '',
      keyUrl: 'https://console.mistral.ai/api-keys',
      note: 'Modelos europeos, gratis y muy rápidos.'
    },
    {
      id: 'huggingface', short: 'Hugging Face', name: 'Hugging Face (texto e imágenes gratis)', style: 'openai', needsKey: true, imagen: true,
      // Routers de HF: el de texto es OpenAI-compatible; las imágenes van por su
      // ruta propia (hf-inference), porque el endpoint /v1 solo atiende chat.
      imageBase: 'https://router.huggingface.co/hf-inference',
      keyLabel: 'Token de Hugging Face', keyPlaceholder: 'hf_...',
      keyUrl: 'https://huggingface.co/settings/tokens',
      note: 'Un token con permiso de inferencia da texto (Llama, Qwen…) e imágenes (Stable Diffusion 3). Incluye un tramo gratis al mes.'
    },
    {
      id: 'aihorde', short: 'AI Horde', name: 'AI Horde (imágenes gratis, en cola)', style: 'openai',
      // Red comunitaria: gratis de verdad y sin tarjeta. Su API es propia y asíncrona
      // (enviar el trabajo, sondear el estado y recoger la imagen), no el endpoint OpenAI.
      needsKey: false, keyOpcional: true, soloImagen: true, imagen: true,
      horde: 'https://aihorde.net/api/v2',
      keyLabel: 'Clave de AI Horde (opcional)',
      keyPlaceholder: '0000000000 (anónima)',
      keyUrl: 'https://aihorde.net/register',
      note: 'Gratis y sin clave: usa la anónima con prioridad baja. Registrarte (gratis) da prioridad y menos espera. Cada imagen tarda 10-60 s en la cola.'
    },
    {
      id: 'ollama', short: 'Ollama', name: 'Ollama (en tu equipo, sin internet)', style: 'openai', needsKey: false, local: true,
      keyLabel: 'Sin clave', keyPlaceholder: '',
      base: 'http://127.0.0.1:11434/v1',
      note: 'Instálalo con "ollama pull llama3.2" y úsalo sin conexión ni coste.'
    }
  ],

  /* Catálogo de modelos de texto por proveedor. Se completa con la lista
     real que devuelve la API (botón "Ver modelos"). */
  models: {
    gemini: [
      { id: 'gemini-3.8-flash',       label: 'Gemini 3.8 Flash',      note: 'El Flash más inteligente (GA)' },
      { id: 'gemini-3.7-flash',       label: 'Gemini 3.7 Flash',      note: 'Recomendado · rápido y muy capaz' },
      { id: 'gemini-3.6-flash',       label: 'Gemini 3.6 Flash',      note: 'Equilibrio velocidad/calidad' },
      { id: 'gemini-3.5-flash',       label: 'Gemini 3.5 Flash',      note: 'Rápido y económico' },
      { id: 'gemini-3.5-flash-lite',  label: 'Gemini 3.5 Flash-Lite', note: 'Muy rápido, coste mínimo' },
      { id: 'gemini-3.1-flash-lite',  label: 'Gemini 3.1 Flash-Lite', note: 'Rinde como un Pro por poco dinero' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',        note: 'Preview: suele exigir cuenta de pago' },
      { id: 'gemini-2.5-flash',       label: 'Gemini 2.5 Flash',      note: 'Estable, admite temperatura' },
      { id: 'gemini-2.5-flash-lite',  label: 'Gemini 2.5 Flash-Lite', note: 'El más barato de la gama' },
      { id: 'gemini-2.5-pro',         label: 'Gemini 2.5 Pro',        note: 'Razonamiento profundo' }
    ],
    openrouter: [
      { id: 'qwen/qwen3.8-27b:free',              label: 'Qwen3.8 27B',        note: 'GRATIS · Structured output' },
      { id: 'google/gemma-4-31b-it:free',          label: 'Gemma 4 31B',        note: 'GRATIS' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', note: 'GRATIS · contexto 1M' },
      { id: 'inclusionai/ling-3.0-flash-sante:free', label: 'Ling 3 Flash',      note: 'GRATIS' },
      { id: 'openai/gpt-4o-mini',                 label: 'GPT-4o mini',       note: 'Barato y fiable' },
      { id: 'anthropic/claude-sonnet-4.5',        label: 'Claude Sonnet 4.5', note: 'Muy bueno escribiendo' },
      { id: 'meta-llama/llama-3.3-70b-instruct',  label: 'Llama 3.3 70B',     note: 'Abierto y sólido' },
      { id: 'mistralai/mistral-small-3.2-24b-instruct', label: 'Mistral Small 3.2', note: 'Rápido' },
      { id: 'deepseek/deepseek-chat',             label: 'DeepSeek Chat',     note: 'Barato, buen razonamiento' },
      { id: 'qwen/qwen3.8-flash',                 label: 'Qwen3.8 Flash',     note: 'Rápido' }
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B',  note: 'El más capaz de Groq' },
      { id: 'openai/gpt-oss-120b',     label: 'GPT-OSS 120B',  note: 'Razonamiento abierto' },
      { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B',  note: 'Instantáneo' },
      { id: 'qwen/qwen3-32b',          label: 'Qwen3 32B',     note: 'Multilingüe' }
    ],
    mistral: [
      { id: 'mistral-small-latest',  label: 'Mistral Small',  note: 'Recomendado' },
      { id: 'mistral-large-latest',  label: 'Mistral Large',  note: 'El más capaz' },
      { id: 'ministral-8b-latest',   label: 'Ministral 8B',   note: 'Muy rápido' },
      { id: 'open-mistral-nemo',     label: 'Mistral Nemo',   note: 'Ligero' }
    ],
    pollinations: [
      { id: 'openai/gpt-5.4-nano',  label: 'GPT-5.4 Nano',   note: 'Barato y rápido' },
      { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Rápido y capaz' },
      { id: 'qwen/qwen3.8-flash',   label: 'Qwen3.8 Flash',  note: 'Multilingüe' },
      { id: 'openai/gpt-oss-20b',   label: 'GPT-OSS 20B',    note: 'Razonamiento abierto' },
      { id: 'x-ai/grok-4.7',         label: 'Grok 4.7',       note: 'Original' },
      { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5', note: 'Muy bueno escribiendo' }
    ],
    huggingface: [],
    ollama: [
      { id: 'llama3.2', label: 'Llama 3.2', note: 'Ejecuta: ollama pull llama3.2' },
      { id: 'qwen2.5',  label: 'Qwen 2.5',  note: 'Ejecuta: ollama pull qwen2.5' },
      { id: 'gemma3',   label: 'Gemma 3',   note: 'Ejecuta: ollama pull gemma3' },
      { id: 'mistral',  label: 'Mistral',   note: 'Ejecuta: ollama pull mistral' }
    ]
  },

  /* Defaults del modelo de texto por proveedor */
  defaultModel: {
    gemini: 'gemini-3.7-flash',
    openrouter: 'qwen/qwen3.8-27b:free',
    pollinations: 'openai/gpt-5.4-nano',
    groq: 'llama-3.3-70b-versatile',
    mistral: 'mistral-small-latest',
    huggingface: '',
    ollama: 'llama3.2'
  },

  /* Catálogo de modelos de IMAGEN, separado por proveedor.
     Se completa con la lista real de cada API (botón "Ver modelos de imagen"). */
  imageModels: {
    gemini: [
      { id: 'gemini-3.1-flash-image',      label: 'Nano Banana 2',      note: 'Recomendado · rápido y muy barato' },
      { id: 'gemini-3-pro-image',          label: 'Nano Banana Pro',    note: 'Máxima calidad, hasta 4K' },
      { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite', note: 'El más barato' },
      { id: 'gemini-2.5-flash-image',      label: 'Nano Banana',        note: 'Modelo anterior' }
    ],
    openrouter: [
      { id: 'meta/muse-image', label: 'Muse Image', note: 'Pide confirmar +18 en openrouter.ai/settings/preferences', gratis: true },
      { id: 'inclusionai/ming-image-0.1-design', label: 'Ming Image', note: 'GRATIS · diseño y logotipos', gratis: true },
      { id: 'inclusionai/ming-image-0.1-design-layer', label: 'Ming Image (capa)', note: 'GRATIS · retoca una imagen', gratis: true },
      { id: 'google/gemini-3.1-flash-image', label: 'Nano Banana 2',    note: 'Recomendado · el más barato de los buenos' },
      { id: 'google/gemini-3-pro-image',     label: 'Nano Banana Pro',  note: 'Máxima calidad, hasta 4K' },
      { id: 'openai/gpt-image-2',            label: 'GPT Image 2',      note: 'Excelente con texto en la imagen' },
      { id: 'openai/gpt-image-1-mini',       label: 'GPT Image 1 Mini', note: 'La mitad de precio' },
      { id: 'black-forest-labs/flux.2-flex', label: 'FLUX.2 Flex',      note: 'Sigue muy bien el texto' },
      { id: 'black-forest-labs/flux.2-pro',  label: 'FLUX.2 Pro',       note: 'Hasta 8 imágenes de referencia' },
      { id: 'black-forest-labs/flux.2-max',  label: 'FLUX.2 Max',       note: 'El más fiel a la descripción' },
      { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', note: 'Rápido y barato' },
      { id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5 Pro', note: '2K y hasta 14 referencias' },
      { id: 'bytedance-seed/seedream-5-0-lite', label: 'Seedream 5 Lite', note: '2K barato' },
      { id: 'qwen/qwen-image-3',            label: 'Qwen Image 3',     note: 'Bueno con texto, 4 referencias' },
      { id: 'x-ai/grok-imagine-image-2.0',   label: 'Grok Imagine 2.0', note: 'Rápido y con estilo propio' },
      { id: 'recraft/recraft-v4.1',          label: 'Recraft V4.1',     note: 'Diseño, gráficos y texto perfecto' },
      { id: 'recraft/recraft-v4.1-vector',   label: 'Recraft V4.1 Vector', note: 'Devuelve SVG escalable' },
      { id: 'sourceful/riverflow-v2.5-pro', label: 'Riverflow 2.5 Pro', note: 'Especializado en diseño' },
      { id: 'microsoft/mai-image-2.6',      label: 'MAI-Image 2.6',    note: 'Fotorrealista' },
      { id: 'krea/krea-2-large',            label: 'Krea 2 Large',     note: 'Estética de producto' }
    ],
    pollinations: [
      { id: 'flux',                             label: 'FLUX (sin clave)', note: 'Gratis y sin tarjeta · el único que no necesita nada' },
      { id: 'turbo',                            label: 'FLUX Turbo',        note: 'Gratis, más rápido' },
      { id: 'kontext',                          label: 'Kontext',           note: 'Gratis, edita con una imagen de referencia' },
      { id: 'google/gemini-3.1-flash-image', label: 'Nano Banana 2',    note: 'Recomendado · muy barato · necesita clave' },
      { id: 'qwen/qwen-image-2.1',           label: 'Qwen Image 2.1',   note: 'El más barato de todos' },
      { id: 'black-forest-labs/flux.2-klein-4b', label: 'FLUX.2 Klein 4B', note: 'Rápido y barato' },
      { id: 'black-forest-labs/flux.2-max',  label: 'FLUX.2 Max',       note: 'El más fiel a la descripción' },
      { id: 'black-forest-labs/flux.2-pro',  label: 'FLUX.2 Pro',       note: 'Con imágenes de referencia' },
      { id: 'black-forest-labs/flux.1.1-pro', label: 'FLUX 1.1 Pro',    note: 'El clásico, muy fiable' },
      { id: 'openai/gpt-image-2',            label: 'GPT Image 2',      note: 'Excelente con texto' },
      { id: 'openai/gpt-image-1-mini',       label: 'GPT Image 1 Mini', note: 'Barato' },
      { id: 'bytedance/seedream-5.0-pro',    label: 'Seedream 5 Pro',   note: '2K' },
      { id: 'bytedance/seedream-5.0-lite',   label: 'Seedream 5 Lite',  note: '2K barato' },
      { id: 'ideogram-ai/ideogram-v4-quality', label: 'Ideogram v4',    note: 'El mejor con texto' },
      { id: 'ideogram-ai/ideogram-v4-turbo', label: 'Ideogram v4 Turbo', note: 'Rápido' },
      { id: 'recraft/recraft-v4.1-flash',    label: 'Recraft V4.1 Flash', note: 'Diseño rápido' },
      { id: 'recraft/recraft-v4.1-vector',   label: 'Recraft V4.1 Vector', note: 'Devuelve SVG' },
      { id: 'x-ai/grok-imagine-image-2.0',   label: 'Grok Imagine 2.0', note: 'Rápido' },
      { id: 'microsoft/mai-image-2.6-flash', label: 'MAI-Image 2.6 Flash', note: 'Fotorrealista y barato' },
      { id: 'tongyi-mai/z-image-turbo',      label: 'Z-Image Turbo',    note: 'Baratísimo' },
      { id: 'lykon/dreamshaper-8-lcm',       label: 'DreamShaper 8',    note: 'Estilo ilustración' },
      { id: 'black-forest-labs/flux.1-kontext-pro', label: 'Kontext Pro', note: 'Para editar una imagen' },
      { id: 'amazon/nova-canvas-v1',         label: 'Nova Canvas',      note: 'Edición con máscaras' }
    ],
    /* Hugging Face: el endpoint /v1 solo hace chat, así que las imágenes van por
       la ruta "hf-inference". Ahí el único modelo texto-a-imagen disponible es
       Stable Diffusion 3 Medium; entra en los créditos gratis mensuales. */
    huggingface: [
      { id: 'stabilityai/stable-diffusion-3-medium-diffusers', label: 'Stable Diffusion 3 Medium', note: 'Gratis con los créditos del mes · el único texto-a-imagen en hf-inference', gratis: true }
    ],
    /* AI Horde: gratis y sin clave (clave anónima). Los nombres tienen que coincidir
       con los del catálogo de la Horde; se listan los más fiables y con más workers. */
    aihorde: [
      { id: 'stable_diffusion', label: 'Stable Diffusion (genérico)', note: 'GRATIS sin clave · cualquiera de los SD disponibles · el más rápido', gratis: true },
      { id: 'Deliberate', label: 'Deliberate', note: 'GRATIS · realista y equilibrado, el más usado' },
      { id: 'Dreamshaper', label: 'DreamShaper', note: 'GRATIS · ilustración, fantasía y estilo artístico' },
      { id: 'AlbedoBase XL (SDXL)', label: 'AlbedoBase XL (SDXL)', note: 'GRATIS · más resolución y detalle' },
      { id: 'Juggernaut XL', label: 'Juggernaut XL', note: 'GRATIS · fotorrealista' },
      { id: 'Realistic Vision', label: 'Realistic Vision', note: 'GRATIS · retratos y fotografía' }
    ]
  },

  /* Modelo de imagen por defecto, según el proveedor elegido */
  defaultImageModel: {
    gemini: 'gemini-3.1-flash-image',
    openrouter: 'black-forest-labs/flux.2-klein-4b',
    pollinations: 'flux',
    huggingface: 'stabilityai/stable-diffusion-3-medium-diffusers',
    aihorde: 'stable_diffusion'
  },

  maxSlides: 40
};


const LAYOUTS = [
  { id: 'cover',   name: 'Portada' },
  { id: 'section', name: 'Sección' },
  { id: 'agenda',  name: 'Índice' },
  { id: 'bullets', name: 'Viñetas' },
  { id: 'two-col', name: 'Dos columnas' },
  { id: 'image',   name: 'Imagen + texto' },
  { id: 'image-full', name: 'Imagen a sangre' },
  { id: 'stats',   name: 'Datos clave' },
  { id: 'timeline',name: 'Proceso / pasos' },
  { id: 'quote',   name: 'Cita' },
  { id: 'closing', name: 'Cierre' }
];

const LAYOUT_IDS = LAYOUTS.map(l => l.id);

/* Cada tema lleva: id, nombre, swatch (degradado para el selector) y variables
   que se inyectan en el <style> de la diapositiva. */
const THEMES = [
  {
    id: 'aurora', solid: '#241a4a', name: 'Aurora',
    swatch: 'linear-gradient(135deg,#171b3a,#3a1c4d)',
    css: {
      '--bg': 'linear-gradient(135deg,#171b3a 0%,#2b1e52 48%,#3a1c4d 100%)',
      '--fg': '#f2f0ff', '--accent': '#8b7bff', '--accent-2': '#35e0c1',
      '--muted': '#a9a3d4', '--rule': 'rgba(255,255,255,.18)', '--card': 'rgba(255,255,255,.07)'
    }
  },
  {
    id: 'minimal', solid: '#ffffff', name: 'Minimal',
    swatch: 'linear-gradient(135deg,#ffffff,#e9ecf1)',
    css: {
      '--bg': '#ffffff', '--fg': '#101418', '--accent': '#101418', '--accent-2': '#6b7280',
      '--muted': '#8a94a3', '--rule': 'rgba(0,0,0,.12)', '--card': '#f5f6f8'
    }
  },
  {
    id: 'corporate', solid: '#0f2a4d', name: 'Corporativo',
    swatch: 'linear-gradient(160deg,#0b2545,#134074)',
    css: {
      '--bg': 'linear-gradient(160deg,#0b2545 0%,#13315c 55%,#134074 100%)',
      '--fg': '#eaf2ff', '--accent': '#4da3ff', '--accent-2': '#6ee7b7',
      '--muted': '#9db8d6', '--rule': 'rgba(255,255,255,.18)', '--card': 'rgba(255,255,255,.08)'
    }
  },
  {
    id: 'sunset', solid: '#d63c7a', name: 'Atardecer',
    swatch: 'linear-gradient(135deg,#ff6a3d,#8b2fd6)',
    css: {
      '--bg': 'linear-gradient(135deg,#ff6a3d 0%,#f0347b 60%,#8b2fd6 100%)',
      '--fg': '#fff8f4', '--accent': '#ffe08a', '--accent-2': '#ffffff',
      '--muted': '#ffd7cd', '--rule': 'rgba(255,255,255,.3)', '--card': 'rgba(255,255,255,.16)'
    }
  },
  {
    id: 'forest', solid: '#0c3a2c', name: 'Bosque',
    swatch: 'linear-gradient(150deg,#06251d,#14563f)',
    css: {
      '--bg': 'linear-gradient(150deg,#06251d 0%,#0d4032 60%,#14563f 100%)',
      '--fg': '#eafaf2', '--accent': '#5fd6a0', '--accent-2': '#ffd166',
      '--muted': '#97c4b0', '--rule': 'rgba(255,255,255,.18)', '--card': 'rgba(255,255,255,.08)'
    }
  },
  {
    id: 'mono', solid: '#f4f1ea', name: 'Editorial',
    swatch: 'linear-gradient(135deg,#f4f1ea,#d8d2c4)',
    serif: true,
    css: {
      '--bg': '#f4f1ea', '--fg': '#1a1a1a', '--accent': '#b03a2e', '--accent-2': '#4a4a4a',
      '--muted': '#6f6a60', '--rule': 'rgba(0,0,0,.18)', '--card': '#e8e3d8',
      '--title-font': 'Georgia,"Times New Roman",serif'
    }
  },
  {
    id: 'neon', solid: '#0a0a0a', name: 'Neón',
    swatch: 'linear-gradient(135deg,#0a0a0a,#2b2b2b)',
    css: {
      '--bg': '#0a0a0a', '--fg': '#f4f4f4', '--accent': '#c8ff2e', '--accent-2': '#00e5ff',
      '--muted': '#8a8a8a', '--rule': 'rgba(255,255,255,.22)', '--card': '#161616'
    }
  },
  {
    id: 'ocean', solid: '#0a5a75', name: 'Océano',
    swatch: 'linear-gradient(140deg,#06304a,#0f8a8a)',
    css: {
      '--bg': 'linear-gradient(140deg,#06304a 0%,#0a5a75 50%,#0f8a8a 100%)',
      '--fg': '#e9fbff', '--accent': '#7df9ff', '--accent-2': '#ffd166',
      '--muted': '#9ed4e0', '--rule': 'rgba(255,255,255,.2)', '--card': 'rgba(255,255,255,.08)'
    }
  }
];

const TONES = {
  profesional: 'formal, claro y profesional',
  divertido: 'cercano, con humor ligero y analogías cotidianas',
  tecnico: 'preciso, con detalle técnico y rigor',
  inspirador: 'motivador y aspiracional',
  academic: 'académico, con argumentos y referencias',
  vendedor: 'persuasivo, orientado a beneficios y conversión'
};

const LANGUAGES = {
  es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán'
};
