/**
 * NÚCLEO DE ANIMACIÓN 2D (isomórfico). Este directorio NO depende de Next, de Node ni de alias: el mismo código se
 * ejecuta en el navegador (previsualización, storyboard, editor) y en Node con Skia (render determinista).
 * Reglas para que Node pueda ejecutarlo sin compilar: imports relativos con extensión `.ts`, sin `enum`,
 * sin propiedades de parámetro en constructores y sin alias de ruta.
 */
export type Expression = "neutral" | "happy" | "sad" | "angry" | "surprised" | "worried" | "thinking";
export type Gesture = "none" | "wave" | "point" | "shrug" | "nod" | "shake" | "think" | "raise";
export type Ease = "linear" | "in" | "out" | "inOut";
export type Side = "left" | "right";
export type HairStyle = "short" | "long" | "bun" | "bald" | "cap" | "spiky";
export type Accessory = "none" | "glasses" | "scarf" | "hat" | "backpack";

/** Aspecto resuelto de un personaje (diseño base + prenda elegida). Es lo único que necesita el dibujante. */
export type Appearance = {
  skin: string; hairStyle: HairStyle; hairColor: string; eyeColor: string;
  top: string; bottom: string; shoes: string; accent: string; accessory: Accessory;
  height: number; build: number;
};

export type Cue =
  | { t: number; type: "enter"; actor: string; from: Side | "fade"; x: number; dur?: number }
  | { t: number; type: "exit"; actor: string; to: Side | "fade"; dur?: number }
  | { t: number; type: "move"; actor: string; x: number; dur: number; run?: boolean }
  | { t: number; type: "face"; actor: string; dir: Side }
  | { t: number; type: "expression"; actor: string; value: Expression }
  | { t: number; type: "gesture"; actor: string; value: Gesture; dur: number }
  | { t: number; type: "speak"; actor: string; dur: number; envelope: number[] }
  | { t: number; type: "camera"; x?: number; y?: number; zoom?: number; rot?: number; focus?: string; dur: number; ease?: Ease }
  | { t: number; type: "shake"; amp: number; dur: number }
  | { t: number; type: "effect"; effect: EffectKind; dur: number; intensity?: number }
  | { t: number; type: "prop"; id: string; action: "show" | "hide" };
export type EffectKind = "rain" | "snow" | "fog" | "flash" | "darken" | "dust";

export type PropKind = "lantern" | "box" | "door" | "sign" | "star" | "moon" | "tree" | "lamp";
export type PropSpec = { id: string; kind: PropKind; x: number; y: number; scale: number; visibleAtStart: boolean };

export type SetPreset = "room" | "street" | "city" | "forest" | "rooftop" | "abstract" | "image";
export type TimeOfDay = "day" | "dusk" | "night";
export type SetSpec = { preset: SetPreset; timeOfDay: TimeOfDay; seed: number; imageId?: string; accent?: string };

export type ActorSpec = { id: string; name: string; appearance: Appearance; slot: number; facing: 1 | -1; presentAtStart: boolean };
export type Grade = "none" | "dusk" | "night" | "warm" | "cold" | "dark";
export type StyleParams = { ink: string; line: number; grade: Grade; vignette: number; shadow: boolean };

export type StageSpec = {
  v: 1; width: number; height: number; fps: number; duration: number; seed: number;
  set: SetSpec; actors: ActorSpec[]; props: PropSpec[]; cues: Cue[]; style: StyleParams;
  /** Avisos del director (directivas no entendidas…): se muestran al revisar. */
  warnings: string[];
};

/** Mundo lógico: 16 × 9 unidades; el suelo está en y = 7. La cámara recorta una ventana de este mundo según el formato. */
export const WORLD_W = 16, WORLD_H = 9, GROUND_Y = 7;
export const ANIM_VERSION = 1; // súbelo si cambia el aspecto del render: invalida cachés

export type ActorState = {
  id: string; x: number; y: number; facing: 1 | -1; visible: boolean; alpha: number;
  moving: number; walkPhase: number; expression: Expression; gesture: Gesture; gestureP: number; mouth: number; speaking: boolean;
};
export type CameraState = { x: number; y: number; zoom: number; rot: number };
export type FrameState = {
  t: number; camera: CameraState; shakeX: number; shakeY: number; actors: ActorState[];
  props: { id: string; alpha: number }[]; effects: { effect: EffectKind; intensity: number; p: number }[];
};
