/**
 * REVISIÓN DE CONTENIDO del Short (pura, por patrones): detecta lo que el canal NO quiere decir (coach genérico, lenguaje de gurú, manipulación, generalizaciones sobre hombres o mujeres,
 * humillar al espectador, superioridad) y separa las afirmaciones psicológicas/científicas de las opiniones. Son AVISOS para revisión humana, no un veredicto.
 */
import { spoken, type Claim, type ShortPack } from "./visualShort.ts";

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export type ContentWarning = { id: string; message: string; where: string; text: string };
const RULES: { id: string; message: string; re: RegExp }[] = [
  { id: "coach-generico", message: "frase de coach genérico o de motivación vacía", re: /\b(?:tu puedes con todo|puedes con todo|cree en ti|nada es imposible|todo es posible|la mejor version de ti|sal de tu zona de confort|persigue tus suenos|nunca te rindas|hazlo por ti)\b/ },
  { id: "guru", message: "lenguaje de gurú (alfa/beta, secretos, fórmulas mágicas)", re: /\b(?:hombre alfa|macho alfa|\bbeta\b|mentalidad de (?:tiburon|lobo|ganador)|el secreto que|formula magica|los ricos no quieren que sepas)\b/ },
  { id: "manipulacion", message: "técnica para manipular o controlar a otra persona", re: /\b(?:manipul\w+|controlar a (?:ella|el|ellas|ellos|tu pareja|alguien)|que se enamore de ti|hacer que te (?:busque|extrane|necesite)|ghosting para|celos para|conseguir (?:a )?(?:mujeres|chicas|una chica)|tecnica para (?:ligar|conquistar|conseguir))\b/ },
  { id: "generalizacion-genero", message: "generalización sobre hombres o mujeres", re: /\b(?:las mujeres (?:son|siempre|solo|nunca)|los hombres (?:son|siempre|solo|nunca)|todas las mujeres|todos los hombres|las chicas siempre|los chicos siempre)\b/ },
  { id: "humillacion", message: "humilla al espectador o se siente superior", re: /\b(?:eres (?:un )?(?:patetic\w+|perdedor|fracasad\w+|debil|inutil)|los demas son (?:borregos|ovejas|tontos)|ovejas|borregos|gente mediocre)\b/ },
];
/** Avisos de contenido sobre todo lo que se dice (hook, voz de KAP, narración, subtítulos, cierre de la idea). */
export function contentWarnings(pack: ShortPack): ContentWarning[] {
  const out: ContentWarning[] = [], items: { where: string; text: string }[] = [
    ...pack.hooks.map((h, i) => ({ where: `hook ${i + 1}`, text: h.text })), ...pack.scenes.flatMap((s) => [{ where: `escena ${s.n} (voz)`, text: spoken(s) }, { where: `escena ${s.n} (subtítulo)`, text: s.subtitle }]), { where: "cierre de la idea", text: pack.idea.closing }, { where: "solución", text: pack.idea.solution },
  ];
  for (const it of items) { const p = plain(it.text); if (!p.trim()) continue; for (const r of RULES) if (r.re.test(p)) out.push({ id: r.id, message: r.message, where: it.where, text: it.text }); }
  return out;
}
/** Afirmaciones psicológicas o científicas (a verificar) separadas de las opiniones. */
export const claimsReport = (claims: Claim[]) => ({ facts: claims.filter((c) => c.type === "fact"), opinions: claims.filter((c) => c.type === "opinion"), toVerify: claims.filter((c) => c.needsVerification) });
