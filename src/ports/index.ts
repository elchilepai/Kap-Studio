/**
 * Puertos (interfaces) de integración. El núcleo de KAP Studio solo habla con estas
 * interfaces; cada servicio real (LLM, TTS, YouTube...) será un adaptador opcional.
 * Todo puerto tiene un adaptador "local" que funciona sin servicios externos.
 */
import type { RenderJob } from "@/domain/render";
import type { StyleBible } from "@/domain/animation";
import type { CanonBase, EpisodeMemory, MemoryProposal } from "@/memory/schema";
import type {
  Asset, BibleEntry, CanonFact, Character, Cost, Evolution, Job, Place, Production,
  ActivityEntry, Relationship, ReviewDecision, Settings, StoryEvent, StoryState,
} from "@/domain/types";

export interface Repository<T extends { id: string }> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T): Promise<T>;
  remove(id: string): Promise<void>;
}

/** Registro de actividad append-only (auditoría). */
export interface ActivityLog {
  record(e: Omit<ActivityEntry, "id" | "ts">): Promise<void>;
  recent(limit?: number): Promise<ActivityEntry[]>;
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
  style: Repository<StyleBible>;
  /** Memoria narrativa: canon base (escrito por el usuario), episodios incorporados al canon y propuestas de cambios (borradores). */
  memoryCanon: Repository<CanonBase>;
  memoryEpisodes: Repository<EpisodeMemory>;
  memoryProposals: Repository<MemoryProposal>;
  activity: ActivityLog;
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
  storage: Storage; auth: AuthStore; render: RenderStore; scriptWriter: ScriptWriter; voice: VoiceSynth;
  renderer: Renderer; publisher: Publisher; stats: ChannelStats;
}

/** Autenticación del propietario: usuarios, sesiones revocables y registro de intentos fallidos. */
export interface AuthUser { id: string; username: string; createdAt: number; disabled: boolean }
export interface AuthSession { tokenHash: string; userId: string; createdAt: number; lastSeen: number; expiresAt: number }
export interface AuthStore {
  countUsers(): Promise<number>;
  createUser(u: { username: string; passwordHash: string }): Promise<AuthUser>;
  getUserByUsername(username: string): Promise<(AuthUser & { passwordHash: string }) | undefined>;
  getUser(id: string): Promise<AuthUser | undefined>;
  listUsers(): Promise<AuthUser[]>;
  setPassword(userId: string, passwordHash: string): Promise<void>;
  createSession(s: { tokenHash: string; userId: string; expiresAt: number; ip?: string; userAgent?: string }, now: number): Promise<void>;
  getSession(tokenHash: string): Promise<AuthSession | undefined>;
  touchSession(tokenHash: string, now: number): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string, exceptTokenHash?: string): Promise<number>;
  countSessions(userId: string, now: number): Promise<number>;
  deleteExpiredSessions(now: number): Promise<number>;
  recordFailure(key: string, ts: number): Promise<void>;
  countFailures(key: string, sinceTs: number): Promise<number>;
  oldestFailure(key: string, sinceTs: number): Promise<number | undefined>;
  clearFailures(key: string): Promise<void>;
  pruneFailures(beforeTs: number): Promise<void>;
}

/** Cola de renderizado persistente. `claimNext` es atómico: varios procesos pueden compartir la base sin duplicar trabajos. */
export interface RenderStore {
  enqueue(j: Pick<RenderJob, "id" | "productionId" | "kind" | "format" | "quality" | "params" | "maxAttempts">, now: number): Promise<RenderJob>;
  get(id: string): Promise<RenderJob | undefined>;
  list(limit?: number): Promise<RenderJob[]>;
  claimNext(worker: string, now: number): Promise<RenderJob | undefined>;
  progress(id: string, fraction: number, now: number, log?: string): Promise<void>;
  heartbeat(id: string, now: number): Promise<void>;
  finish(id: string, r: { status: "done" | "failed" | "canceled"; now: number; error?: string; outputAssetId?: string; result?: RenderJob["result"] }): Promise<void>;
  /** Devuelve el trabajo a la cola (reintento). `refundAttempt` no cuenta el intento (p. ej. cierre del servidor). */
  requeue(id: string, notBefore: number, error?: string, refundAttempt?: boolean): Promise<void>;
  /** Cola → cancelado al instante; en ejecución → marca la petición. Devuelve el estado resultante. */
  requestCancel(id: string, now: number): Promise<RenderJob["status"] | undefined>;
  isCancelRequested(id: string): Promise<boolean>;
  retry(id: string): Promise<boolean>;
  remove(id: string): Promise<RenderJob | undefined>;
  /** Trabajos "running" sin latido reciente (proceso caído) → vuelven a la cola o fallan si agotaron intentos. */
  recoverStale(now: number, staleMs: number): Promise<number>;
  countActive(): Promise<{ queued: number; running: number }>;
}
