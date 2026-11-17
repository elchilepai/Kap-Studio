/** Intérprete de PETICIONES por reglas: «Crea el episodio 7 continuando exactamente donde terminó el episodio 6». Un LLM podrá sustituirlo con el mismo resultado. */
import type { EpisodeRequest } from "./schema.ts";
import { norm, orderOf } from "./text.ts";

export type RequestCtx = {
  knownCharacters: string[];
  defaultSeason: number;
  nextNumber: number;                           // si la petición no dice el número
  latestBefore: (season: number, number: number) => number | undefined;   // orden del último episodio aprobado anterior
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseEpisodeRequest(text: string, ctx: RequestCtx): EpisodeRequest {
  const n = norm(text);
  const season = parseInt(/temporada\s*(\d+)|\bt(\d+)\s*e\d+/.exec(n)?.slice(1).find(Boolean) ?? "", 10) || ctx.defaultSeason;
  const cont = /(?:continu\w*|segui\w*|sigue|a partir|despues del?|tras|detras del?|donde\s+(?:termin\w*|acab\w*|quedo|quedaron|lo dejamos))[^.\d]{0,70}?(?:episodio|ep\.?|capitulo)\s*(?:numero\s*|n\.?\s*|#)?(\d+)/.exec(n);
  const explicit = /(?:crea\w*|nuevo|haz|genera\w*|escribe|prepara\w*|quiero)[^.\d]{0,30}?(?:episodio|ep\.?|capitulo)\s*(?:numero\s*|n\.?\s*|#)?(\d+)/.exec(n) ?? /^\s*(?:el\s+)?(?:episodio|ep\.?|capitulo)\s*(\d+)/.exec(n);
  const wantsContinue = /continu\w*|segui\w*|sigue|donde\s+(?:termin|acab|quedo|quedaron|lo dejamos)|a partir del|despues del|tras el/.test(n);
  let number = explicit ? parseInt(explicit[1], 10) : undefined, from = cont ? parseInt(cont[1], 10) : undefined;
  if (number === undefined && from !== undefined) number = from + 1;
  if (number === undefined) number = ctx.nextNumber;
  let continuesFrom = from !== undefined ? orderOf(season, from) : undefined;
  if (continuesFrom === undefined && wantsContinue) continuesFrom = ctx.latestBefore(season, number);   // «continúa donde terminó el anterior»
  const exact = /exactamente|justo|inmediatamente|sin saltos?|donde\s+(?:termin|acab|quedo|quedaron|lo dejamos)/.test(n);
  const cast = ctx.knownCharacters.filter((c) => new RegExp(`(^|[^a-z0-9])${esc(norm(c))}([^a-z0-9]|$)`).test(n));
  return { text: text.trim(), number, season, ...(continuesFrom !== undefined ? { continuesFrom } : {}), exact, cast, notes: text.trim() };
}
