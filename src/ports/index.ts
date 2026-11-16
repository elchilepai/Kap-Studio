/**
 * Puertos (interfaces) de integración. El núcleo de KAP Studio solo habla con estas
 * interfaces; cada servicio real (LLM, TTS, YouTube...) será un adaptador opcional.
 * Todo puerto tiene un adaptador "local" que funciona sin servicios externos.
 */
import type {
  Asset, BibleEntry, CanonFact, Character, Cost, Evolution, Job, Place, Production,
  Relationship, ReviewDecision, Settings, StoryEvent, StoryState,
} from "@/domain/types";

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface Storage {
  productions: Repository<Production>;
  characters: Repository<Character>;
  canon: Repository<CanonFact>;
  assets: Repository<Asset>;
  jobs: Repository<Job>;
  reviews: Repository<ReviewDecision>;
  bible: Repository<BibleEntry>;
  relationships: Repository<Relationship>;
  events: Repository<StoryEvent>;
  places: Repository<Place>;
  evolution: Repository<Evolution>;
  costs: Repository<Cost>;
  story: Repository<StoryState>;
  settings: Repository<Settings>;
}

export interface ScriptContext {
  production: Production; characters: Character[]; canon: CanonFact[]; previous: Production[];
}
export interface ScriptWriter {
  readonly id: string;
  /** Local: plantillas/manual. Futuro: un LLM (requiere clave). */
  draft(ctx: ScriptContext): Promise<{ script: string; scenes: Production["scenes"] }>;
}

export interface VoiceSynth {
  readonly id: string;
  synthesize(text: string, characterId?: string): Promise<Asset>;
}

export interface Renderer {
  readonly id: string;
  /** Local: ffmpeg (diapositivas + audio + subtítulos). */
  render(p: Production, assets: Asset[]): Promise<Asset>;
}

export interface Publisher {
  readonly id: string;
  /** Solo se invoca tras aprobación. Local: exporta un paquete listo para subir a mano. */
  publish(p: Production, video: Asset): Promise<{ url?: string; exportedTo?: string }>;
}

export interface ChannelStats {
  readonly id: string;
  fetch(): Promise<{ views: number; subscribers: number; videos: { productionId?: string; views: number }[] }>;
}

export interface Providers {
  storage: Storage; scriptWriter: ScriptWriter; voice: VoiceSynth;
  renderer: Renderer; publisher: Publisher; stats: ChannelStats;
}
