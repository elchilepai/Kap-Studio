import type { CapabilityRow } from "@/ports/studio";
import { getCapabilities } from "@/server/render/ffmpeg";
import { espeakProvider } from "./voice";

/** Qué puede hacer realmente KAP Studio hoy. Lo que no existe se muestra como «No conectado»: jamás se simula. */
export async function describeCapabilities(): Promise<CapabilityRow[]> {
  const [ff, tts] = await Promise.all([getCapabilities(), espeakProvider().available()]);
  return [
    { area: "guion", id: "reglas", label: "Intérprete de guion por reglas", free: true, available: true, detail: "Divide el guion en escenas con un formato documentado (# Escena, NOMBRE: diálogo, [imagen: …]). No interpreta lenguaje libre." },
    { area: "guion", id: "interprete-llm", label: "Intérprete de lenguaje natural con LLM (guion → escenas estructuradas)", available: false, detail: "No conectado. La capa de interpretación está separada: un LLM solo tendría que devolver la estructura de escenas (docs/ESCENAS-ESTRUCTURADAS.md); se valida con el mismo esquema." },
    { area: "guion", id: "memoria-reglas", label: "Memoria narrativa y continuidad (reglas)", free: true, available: true, detail: "Canon, estado por episodio, cambios propuestos que confirmas tú, contexto con presupuesto de tokens y validación de continuidad. Funciona sin IA." },
    { area: "guion", id: "puerto-llm", label: "Puerto de modelo de lenguaje (LlmClient) para Qwen3-8B/14B u otro", available: false, detail: "Preparado, sin proveedor conectado (KAP_LLM=none). La memoria, el contexto y el guion no dependen de ningún modelo concreto." },
    { area: "guion", id: "redactor-ia", label: "Redactor de guiones con IA", available: false, detail: "No conectado. Los guiones se escriben o pegan a mano hasta conectar un proveedor." },
    { area: "voz", id: "audio-subido", label: "Narración subida por ti", free: true, available: true, detail: "Sube audios a la Biblioteca y asígnalos a escenas." },
    { area: "voz", id: "espeak-ng", label: "eSpeak NG (voz local)", free: true, quality: "basica", available: tts, detail: tts ? "Disponible. Voz sintética básica; útil para borradores." : "No instalado en este equipo (opcional: apt-get install espeak-ng)." },
    { area: "voz", id: "labial-amplitud", label: "Labial por amplitud del audio", free: true, available: true, detail: "Primera versión (por defecto): la boca se abre donde hay sonido. Sustituible por un proveedor fonema→visema sin tocar el resto." },
    { area: "voz", id: "labial-texto", label: "Labial por visemas del texto (experimental)", free: true, available: true, detail: "Visemas deducidos de las letras. Se activa con KAP_LIPSYNC=texto. No usa reconocimiento de voz." },
    { area: "voz", id: "labial-fonetico", label: "Labial fonético con reconocedor de voz", available: false, detail: "No conectado." },
    { area: "voz", id: "tts-neuronal", label: "Voz neuronal", available: false, detail: "No conectado." },
    { area: "imagen", id: "biblioteca", label: "Biblioteca + memoria visual", free: true, available: true, detail: "Asigna imágenes y clips por etiquetas, lugar y personaje, y recuerda el visual de cada lugar entre episodios." },
    { area: "imagen", id: "tarjetas", label: "Tarjetas KAP", free: true, available: ff.ok, detail: "Escenas sin recurso visual usan una tarjeta con el lugar/título." },
    { area: "imagen", id: "generador-imagen", label: "Generador de imágenes con IA", available: false, detail: "No conectado." },
    { area: "musica", id: "biblioteca-musica", label: "Música de tu biblioteca", free: true, available: true, detail: "Con volumen, fundidos y reducción automática bajo la voz." },
    { area: "video", id: "ffmpeg", label: `FFmpeg ${ff.version ?? ""}`.trim(), free: true, available: ff.ok, detail: ff.ok ? "Montaje, transiciones, mezcla y subtítulos." : ff.problems.join("; ") },
  ];
}
