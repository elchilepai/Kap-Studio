import type { CapabilityRow } from "@/ports/studio";
import { getCapabilities } from "@/server/render/ffmpeg";
import { espeakProvider } from "./voice";

/** Qué puede hacer realmente KAP Studio hoy. Lo que no existe se muestra como «No conectado»: jamás se simula. */
export async function describeCapabilities(): Promise<CapabilityRow[]> {
  const [ff, tts] = await Promise.all([getCapabilities(), espeakProvider().available()]);
  return [
    { area: "guion", id: "reglas", label: "Analizador de guion por reglas", free: true, available: true, detail: "Divide el guion en escenas con un formato documentado (# Escena, NOMBRE: diálogo, [imagen: …]). No interpreta lenguaje libre." },
    { area: "guion", id: "redactor-ia", label: "Redactor de guiones con IA", available: false, detail: "No conectado. Los guiones se escriben o pegan a mano hasta conectar un proveedor." },
    { area: "voz", id: "audio-subido", label: "Narración subida por ti", free: true, available: true, detail: "Sube audios a la Biblioteca y asígnalos a escenas." },
    { area: "voz", id: "espeak-ng", label: "eSpeak NG (voz local)", free: true, quality: "basica", available: tts, detail: tts ? "Disponible. Voz sintética básica; útil para borradores." : "No instalado en este equipo (opcional: apt-get install espeak-ng)." },
    { area: "voz", id: "tts-neuronal", label: "Voz neuronal", available: false, detail: "No conectado." },
    { area: "imagen", id: "biblioteca", label: "Biblioteca + memoria visual", free: true, available: true, detail: "Asigna imágenes y clips por etiquetas, lugar y personaje, y recuerda el visual de cada lugar entre episodios." },
    { area: "imagen", id: "tarjetas", label: "Tarjetas KAP", free: true, available: ff.ok, detail: "Escenas sin recurso visual usan una tarjeta con el lugar/título." },
    { area: "imagen", id: "generador-imagen", label: "Generador de imágenes con IA", available: false, detail: "No conectado." },
    { area: "musica", id: "biblioteca-musica", label: "Música de tu biblioteca", free: true, available: true, detail: "Con volumen, fundidos y reducción automática bajo la voz." },
    { area: "video", id: "ffmpeg", label: `FFmpeg ${ff.version ?? ""}`.trim(), free: true, available: ff.ok, detail: ff.ok ? "Montaje, transiciones, mezcla y subtítulos." : ff.problems.join("; ") },
  ];
}
