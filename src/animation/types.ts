/**
 * NÚCLEO DE ANIMACIÓN 2D (isomórfico). Este directorio NO depende de Next, de Node ni de alias: el mismo código se
 * ejecuta en el navegador (previsualización, storyboard, editor) y en Node con Skia (render determinista).
 * Reglas para que Node pueda ejecutarlo sin compilar: imports relativos con extensión `.ts`, sin `enum`,
 * sin propiedades de parámetro en constructores y sin alias de ruta.
 */
import type { PoseName } from "./beats.ts";
export type { PoseName };
/** Poses de ACCIÓN que añade el director a partir de la narración (internas de la animación: no forman parte del vocabulario del guion ni de la IR). */
export type ActionPose = PoseName | "crouch" | "reach" | "throw" | "recoil" | "settle" | "listen" | "shrink" | "droop" | "tense";
export type Expression = "neutral" | "happy" | "sad" | "angry" | "surprised" | "worried" | "thinking";
/** Expresiones de ACTING que añade el director a partir de la narración (internas de la animación: no forman parte del vocabulario del guion ni de la IR). */
export type ActionExpression = Expression | "scared" | "embarrassed" | "confused" | "curious" | "relieved" | "uncomfortable" | "bored";
/** Sonido con función (puerta, golpe, teléfono, pasos, ambiente…): el director lo propone y el montaje lo sintetiza con FFmpeg. Interno de la animación; la IR no cambia. */
export type SoundKind = "door" | "bump" | "knock" | "ring" | "steps" | "ambience";
export type SoundCue = { t: number; kind: SoundKind; dur?: number };
/** Marca de música del SHORT MODE (no hay sistema de música: solo se anota dónde el director quiere que empiece, cambie o pare la pista de fondo, un golpe o un silencio). */
export type MusicCue = { t: number; kind: "music_start" | "music_change" | "music_stop" | "impact" | "silence"; dur?: number };
export type Gesture = "none" | "wave" | "point" | "shrug" | "nod" | "shake" | "think" | "raise";
export type Ease = "linear" | "in" | "out" | "inOut";
export type Side = "left" | "right";
export type HairStyle = "short" | "long" | "bun" | "bald" | "cap" | "spiky" | "ponytail" | "curly";
export type Accessory = "none" | "glasses" | "scarf" | "hat" | "backpack" | "headphones" | "cape" | "tie";
export type BodyType = "slim" | "regular" | "broad";
export type EyeStyle = "round" | "narrow" | "big";
/** Visemas (formas de boca): conjunto reducido tipo Preston Blair. La amplitud solo distingue reposo/E/A; un proveedor fonético los usaría todos. */
export type Viseme = "rest" | "A" | "E" | "I" | "O" | "U" | "FV" | "MBP" | "L" | "WQ";
export type Ctx = CanvasRenderingContext2D;

/** Rig por CAPAS (personajes propios en PNG): partes con punto de giro, jerarquía y orden de dibujo. */
export type LayerPart = {
  id: string; role: string;                 // torso | head | armF | armB | legF | legB | hairBack | hairFront | extra…
  image: string;                            // id del recurso (PNG) en la biblioteca
  anchor: [number, number];                 // punto de giro en píxeles de la propia imagen
  parent?: string; at?: [number, number];   // con padre: punto del padre (px) al que se fija; sin padre: desplazamiento respecto a los pies (px)
  z: number; scale?: number;
};
export type LayeredRig = {
  kind: "layered"; pxPerUnit: number; parts: LayerPart[];
  face?: { parent: string; at: [number, number]; scale?: number; eyes?: Record<string, string>; mouths?: Record<string, string> };
  animations?: string[];
};

/** Aspecto resuelto de un personaje (diseño base + prenda elegida). Es lo único que necesita el dibujante. */
export type Appearance = {
  skin: string; hairStyle: HairStyle; hairColor: string; eyeColor: string;
  top: string; bottom: string; shoes: string; accent: string; accessory: Accessory;
  height: number; build: number;
  body?: BodyType; eyeStyle?: EyeStyle;
  /** Si existe y es «layered», el personaje se dibuja con sus propias capas en lugar del vector paramétrico. */
  rig?: LayeredRig;
  /** Estilo del personaje paramétrico: «stickman» (por defecto: cabeza + trazos) o «cutout» (figura completa con ropa y pelo, el diseño anterior). */
  look?: "stickman" | "cutout";
};

export type Cue =
  | { t: number; type: "enter"; actor: string; from: Side | "fade"; x: number; dur?: number }
  | { t: number; type: "exit"; actor: string; to: Side | "fade"; dur?: number }
  | { t: number; type: "move"; actor: string; x: number; dur: number; run?: boolean }
  | { t: number; type: "face"; actor: string; dir: Side }
  | { t: number; type: "pose"; actor: string; value: ActionPose; dur?: number }
  | { t: number; type: "expression"; actor: string; value: ActionExpression }
  | { t: number; type: "gesture"; actor: string; value: Gesture; dur: number }
  | { t: number; type: "speak"; actor: string; dur: number; envelope: number[]; visemes?: Viseme[] }
  | { t: number; type: "camera"; x?: number; y?: number; zoom?: number; rot?: number; focus?: string; lead?: number; dur: number; ease?: Ease }
  | { t: number; type: "shake"; amp: number; dur: number }
  | { t: number; type: "effect"; effect: EffectKind; dur: number; intensity?: number }
  | { t: number; type: "prop"; id: string; action: "show" | "hide" };
export type EffectKind = "rain" | "snow" | "fog" | "flash" | "darken" | "dust";

export type PropKind = "lantern" | "box" | "door" | "sign" | "star" | "moon" | "tree" | "lamp";
/** Objetos que el director deduce de la narración (internos de la animación; la IR no cambia): teléfono, mochila, cuaderno, auriculares, maleta, pelota, papel, silla. */
export type ObjectKind = "phone" | "backpack" | "notebook" | "headphones" | "suitcase" | "ball" | "paper" | "chair";
/** `holder`: si existe, el objeto va en la mano de ese personaje (lo coge, lo sostiene) en vez de estar en el suelo. */
export type PropSpec = { id: string; kind: PropKind | ObjectKind; x: number; y: number; scale: number; visibleAtStart: boolean; holder?: string };

/** Capa de fondo con profundidad. depth: 0 = se mueve con el mundo; 0,8 = lejana (se desplaza poco); negativo = primer plano (se desplaza MÁS que la cámara). */
export type SetLayer = { image: string; depth: number; y?: number; height?: number; tile?: boolean; alpha?: number };
export type ElementKind = PropKind | "bench" | "pillar" | "bush" | "plant" | "crate";
/** Elemento reutilizable del escenario (se guarda con el lugar: aparece igual en todos los episodios). */
export type SetElement = { id: string; kind: ElementKind; x: number; y?: number; scale: number; depth: number; flip?: boolean };
export type SetPreset = "room" | "street" | "city" | "forest" | "rooftop" | "patio" | "abstract" | "image";
export type TimeOfDay = "day" | "afternoon" | "dusk" | "night";
/** Variante de una habitación (mobiliario que dice DÓNDE estamos): dormitorio, salón, cocina o pasillo. Se deduce del nombre del lugar; no se guarda. */
export type RoomVariant = "bedroom" | "living" | "kitchen" | "hallway";
export type SetSpec = { preset: SetPreset; timeOfDay: TimeOfDay; seed: number; variant?: RoomVariant; imageId?: string; accent?: string; layers?: SetLayer[]; elements?: SetElement[]; foreground?: SetElement[] };

export type ActorSpec = { id: string; name: string; appearance: Appearance; slot: number; facing: 1 | -1; presentAtStart: boolean; /** 0 = delante (por defecto), 1 = fila trasera (más arriba y algo menor) */ row?: 0 | 1 };
export type Grade = "none" | "dusk" | "night" | "warm" | "cold" | "dark";
export type StyleParams = { ink: string; line: number; grade: Grade; vignette: number; shadow: boolean; bars?: number };

export type StageSpec = {
  v: 1; width: number; height: number; fps: number; duration: number; seed: number;
  set: SetSpec; actors: ActorSpec[]; props: PropSpec[]; cues: Cue[]; style: StyleParams; sounds?: SoundCue[]; music?: MusicCue[];
  /** Movimiento continuo (SHORT MODE): las poses se funden entre sí en vez de saltar, y al caminar hay anticipación, aceleración y frenada. */ flow?: boolean;
  /** Zona de subtítulos (fracción de la altura). La cámara sube la escena para que los pies queden por encima. Si falta se asume el subtítulo por defecto. */
  safe?: { top: number; bottom: number };
  /** Avisos del director (directivas no entendidas…): se muestran al revisar. */
  warnings: string[];
};

/** Mundo lógico: 16 × 9 unidades; el suelo está en y = 7. La cámara recorta una ventana de este mundo según el formato. */
export const WORLD_W = 16, WORLD_H = 9, GROUND_Y = 7;
export const ANIM_VERSION = 2; // súbelo si cambia el aspecto del render: invalida cachés

export type ActorState = {
  id: string; x: number; y: number; facing: 1 | -1; visible: boolean; alpha: number;
  moving: number; /** 0..1: velocidad relativa del tramo (arranca despacio, frena al llegar) */ speed: number; walkPhase: number; expression: ActionExpression; gesture: Gesture; gestureP: number; mouth: number; viseme: Viseme; speaking: boolean; pose: ActionPose; poseP: number;
  /** Solo con `StageSpec.flow` (Shorts): pose que se va (se mezcla hacia fuera mientras entra la nueva) y progreso 0..1 del tramo de movimiento (anticipación / frenada). */
  pose2?: ActionPose; pose2P?: number; moveP?: number;
};
export type CameraState = { x: number; y: number; zoom: number; rot: number };
export type FrameState = {
  t: number; camera: CameraState; shakeX: number; shakeY: number; actors: ActorState[];
  props: { id: string; alpha: number }[]; effects: { effect: EffectKind; intensity: number; p: number }[];
};
