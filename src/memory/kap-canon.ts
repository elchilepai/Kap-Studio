/**
 * CANON INICIAL DE KAP (decisión narrativa del autor). Es el punto de partida de la serie y NO fija episodios ni número de episodios:
 * define quién es KAP, el recorrido (etapas e hitos, en orden) y las reglas de la serie. No se inventa nada que el autor no haya dicho
 * (p. ej. nombres del hermano o de los padres, edades o personalidad: quedan «por definir» y el sistema los marca como «sin datos»).
 * Se registra con una acción explícita e idempotente (Universo → Memoria, o `npm run memory:seed`).
 */
import type { Change } from "./schema.ts";

export const KAP = "KAP", BROTHER = "Hermano de KAP", PARENTS = "Padres de KAP";

/** Etapas de vida con los rasgos a seguir en cada una (lista del autor). */
export const KAP_STAGES: { key: string; title: string; facets: string[] }[] = [
  { key: "nino", title: "Niño", facets: ["edad aproximada", "situación económica", "relación con sus padres", "relación con su hermano", "situación escolar", "personalidad", "sueños", "habilidades iniciales"] },
  { key: "adolescente", title: "Adolescente", facets: ["cambios personales", "evolución musical", "nuevas relaciones", "conflictos", "primeras experiencias musicales", "evolución de su confianza"] },
  { key: "artista-emergente", title: "Artista emergente", facets: ["primeras oportunidades", "primeras actuaciones", "primeras grabaciones", "fracasos", "contactos", "crecimiento de audiencia"] },
  { key: "artista-consolidado", title: "Artista consolidado", facets: ["carrera profesional", "decisiones importantes", "conflictos", "reconocimiento", "cambios en su entorno"] },
  { key: "cima", title: "En la cima", facets: ["éxito alcanzado", "consecuencias del éxito", "personas que siguen a su lado", "personas que quedaron atrás", "relación con su pasado", "relación con su hermano", "significado de todo lo que consiguió"] },
];

/** Recorrido en orden (lista del autor). Un hito se da por «logrado» cuando un episodio aprobado lo cuenta; puede llevar varios episodios. */
export const KAP_MILESTONES: { key: string; title: string; stage: string }[] = [
  { key: "nino-con-pocos-recursos", title: "Niño con pocos recursos", stage: "nino" },
  { key: "protege-a-su-hermano", title: "Niño que intenta proteger a su hermano", stage: "nino" },
  { key: "victima-de-bullying", title: "Víctima de bullying", stage: "nino" },
  { key: "nino-con-un-sueno", title: "Niño con un sueño", stage: "nino" },
  { key: "se-toma-la-musica-en-serio", title: "Adolescente que empieza a tomarse la música en serio", stage: "adolescente" },
  { key: "primeras-dificultades-musicales", title: "Primeras dificultades musicales", stage: "adolescente" },
  { key: "primeras-oportunidades", title: "Primeras oportunidades", stage: "artista-emergente" },
  { key: "primeros-fracasos", title: "Primeros fracasos", stage: "artista-emergente" },
  { key: "mejora-de-su-talento", title: "Mejora de su talento", stage: "artista-emergente" },
  { key: "primer-reconocimiento", title: "Primer reconocimiento", stage: "artista-emergente" },
  { key: "primeros-trabajos-musicales", title: "Primeros trabajos relacionados con la música", stage: "artista-emergente" },
  { key: "primeros-exitos", title: "Primeros éxitos", stage: "artista-emergente" },
  { key: "crecimiento-de-su-carrera", title: "Crecimiento de su carrera", stage: "artista-consolidado" },
  { key: "problemas-y-decisiones-dificiles", title: "Problemas y decisiones difíciles", stage: "artista-consolidado" },
  { key: "consolidacion-como-artista", title: "Consolidación como artista", stage: "artista-consolidado" },
  { key: "exito", title: "Éxito", stage: "cima" },
  { key: "llegada-a-la-cima", title: "Llegada a la cima", stage: "cima" },
];

export const KAP_RULES = [
  "KAP Studio produce UNA historia serializada y continua sobre KAP; no historias independientes. Cada episodio es consecuencia del anterior.",
  "Cada episodio dura ≈ 5 minutos y cuenta una parte significativa de la historia con: inicio, conflicto, desarrollo, punto emocional o de tensión, resolución parcial y gancho para el siguiente episodio.",
  "Cada episodio representa una etapa concreta de la evolución de KAP y debe aportar algo nuevo a la historia.",
  "No hay saltos artificiales de años que eliminen partes importantes de la historia.",
  "KAP no llega a la cima hasta que la historia haya desarrollado suficientemente su recorrido. El número de episodios no está fijado: depende del contenido narrativo necesario.",
  "Si algo ocurrió en un episodio anterior, no desaparece arbitrariamente.",
  "La evolución de KAP se basa en esfuerzo + talento + disciplina + aprendizaje + perseverancia.",
];

export const KAP_FACTS = [
  "KAP es un niño que crece en una familia con muy pocos recursos.",
  "Los padres de KAP tienen problemas con las drogas y, debido a esa situación, apenas le prestan atención ni pueden ejercer correctamente su papel como padres.",
  "KAP tiene un hermano pequeño y, aunque él mismo es un niño, intenta cuidarlo y protegerlo como puede.",
  "En el colegio y en su entorno KAP sufre bullying y desprecio por su situación económica: se burlan de él por no poder vestir con ropa decente y por ser diferente a los demás.",
  "También se ríen de sus sueños: KAP dice que algún día será millonario gracias a su música, pero los demás no creen en él y lo consideran un niño que vive de fantasías.",
  "A pesar de todo, KAP empieza a desarrollar una pasión y un talento especial por la música rap.",
  "Con el paso de los años, KAP supera las dificultades, desarrolla su carrera musical y finalmente llega a la cima como artista de rap.",
];

export const KAP_PROFILE: [string, string][] = [
  ["situación económica", "Familia con muy pocos recursos"],
  ["relación con sus padres", "Sus padres tienen problemas con las drogas: apenas le prestan atención ni ejercen su papel"],
  ["relación con su hermano", "Cuida y protege a su hermano pequeño como puede"],
  ["situación escolar", "Sufre bullying y desprecio por su situación económica y su ropa"],
  ["sueños", "Quiere ser millonario gracias a su música; los demás no creen en él"],
  ["habilidades iniciales", "Pasión y talento especial por el rap, todavía por desarrollar"],
];

export const KAP_THREADS: { title: string; involves: string[] }[] = [
  { title: "Situación familiar de KAP (padres y drogas)", involves: [KAP, PARENTS] },
  { title: "Bullying hacia KAP", involves: [KAP] },
  { title: "El sueño de KAP: ser millonario gracias a la música", involves: [KAP] },
  { title: "Cuidar y proteger a su hermano", involves: [KAP, BROTHER] },
];

/** Todos los cambios del canon inicial, en orden de aplicación. */
export function kapCanonChanges(): Change[] {
  return [
    { kind: "series.set", protagonist: KAP, title: "KAP" },
    ...KAP_STAGES.map((s, i): Change => ({ kind: "stage.define", key: s.key, title: s.title, order: i + 1, facets: s.facets })),
    ...KAP_MILESTONES.map((m, i): Change => ({ kind: "milestone.define", key: m.key, title: m.title, stage: m.stage, order: i + 1 })),
    ...KAP_RULES.map((text): Change => ({ kind: "rule.add", text })),
    ...KAP_FACTS.map((text): Change => ({ kind: "fact.add", text })),
    { kind: "character.add", name: BROTHER, note: "hermano pequeño de KAP (nombre por definir)" },
    { kind: "character.add", name: PARENTS, note: "los padres de KAP (nombres por definir)" },
    { kind: "character.stage", name: KAP, stage: "nino" },
    ...KAP_PROFILE.map(([facet, value]): Change => ({ kind: "character.profile", name: KAP, facet, value })),
    { kind: "relationship.set", a: KAP, b: BROTHER, relation: "hermanos", trust: 2, note: "KAP lo cuida y protege" },
    { kind: "relationship.set", a: KAP, b: PARENTS, relation: "hijo desatendido por sus padres", note: "problemas con las drogas" },
    ...KAP_THREADS.map((t): Change => ({ kind: "thread.open", title: t.title, involves: t.involves })),
  ];
}
