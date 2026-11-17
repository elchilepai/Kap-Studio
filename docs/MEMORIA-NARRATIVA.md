# Memoria narrativa y continuidad (implementada)

> **La serie de KAP** (canon inicial, arco de 17 hitos, evolución, estructura de episodio y las tres preguntas a la memoria) está en `docs/SERIE-KAP.md`.

> **Estado: implementado y probado** (sin IA). Referencia de hardware del diseño: **16 GB de RAM, solo CPU, sin GPU dedicada**. No hay ningún modelo conectado ni descargado (`KAP_LLM=none`): todo funciona con reglas y formularios, y la IA futura se enchufa por puertos (§9).
> Regla fundamental: **solo lo aprobado por el usuario se convierte en canon.** Un borrador o una generación fallida nunca lo modifican.

## 1. Dónde está el código
| Capa | Módulo | Qué hace |
|---|---|---|
| Núcleo puro (sin Next/Node) | `src/memory/` | `schema` (cambios tipados, canon, propuestas), `directives` (sintaxis del guion), `canon` (libro de cambios), `extract` (propuesta sin IA), `validate` (continuidad), `context` (paquete con presupuesto de tokens), `request` (petición → estructura) |
| Servicio | `src/server/memory/service.ts` | Orquesta almacenamiento + núcleo; aplica la regla «solo aprobado» |
| Acciones/UI | `src/server/memory-actions.ts`, `src/components/MemoryCard.tsx`, `MemoryTab.tsx`, `/aprobacion` | Panel de cambios propuestos, pestaña Universo → Memoria, hallazgos al aprobar |
| IA (preparada) | `src/ports/studio.ts` (`LlmClient`, `ScriptAuthor`, `EpisodeSummarizer`, `EpisodeRequestInterpreter`), `src/server/ai/` | Adaptadores genéricos sobre un cliente de modelo intercambiable (§9) |
| Pipeline | `src/server/studio/script.ts`, `domain/screenplay.ts`, `interpreter.ts`, `after.ts` | Las directivas viajan guion → IR → escenas; al terminar un episodio se PROPONE su memoria |

## 2. Cómo se almacena el canon (libro de cambios)
Todo cambio es un `Change` tipado y validado con zod (el mismo esquema para reglas, directivas, usuario y —en el futuro— IA): `character.add|status|location|outfit|knows`, `relationship.set`, `object.introduce|update`, `thread.open|close`, `fact.add`, `rule.add`, `place.update`, `event.add`.

El **canon vigente es el pliegue (fold) ordenado de los cambios aceptados**; no es un documento mutable:
```
canon = base (escrito por el usuario) ⊕ episodio 1 aceptado ⊕ episodio 2 aceptado ⊕ …   (solo episodios VÁLIDOS)
```
- Colecciones SQLite nuevas (tabla de documentos existente; entran en la copia de seguridad): `memoryCanon` (canon base), `memoryEpisodes` (episodios en el canon), `memoryProposals` (borradores).
- **Canon base**: reglas del universo, hechos y estados iniciales que escribe el usuario (Universo → Memoria). Escribirlos es su confirmación.
- **Estado del canon** (`CanonState`): personajes (estado, lugar, ropa, accesorios, qué saben, primera/última aparición), relaciones (tipo, confianza −2…+2, historial), objetos (estado intacto/dañado/destruido/perdido, dueño, último dueño), hilos (abierto/cerrado), lugares, hechos (con clave opcional `clave = valor`), reglas y acontecimientos.
- **Episodio válido** = confirmado **y** su producción sigue aprobada **y** su contenido es el mismo con el que se confirmó (firma del contenido). Si se edita o vuelve a revisión, **deja de contar como canon** hasta aprobarlo y confirmarlo de nuevo (o retirarlo). Se puede **retirar** un episodio del canon: el canon se recalcula solo.

## 3. Estado por episodio (`EpisodeMemory`)
Resumen y resumen corto · **estado inicial y final** (instantáneas completas) · personajes presentes · cambios de relaciones · objetos introducidos / modificados · acontecimientos · hilos abiertos / cerrados · **último plano** (escena, lugar, personajes y texto literal) · **situación exacta donde termina** (derivada del estado final: dónde y cómo queda cada personaje, qué lleva, hilos abiertos; el usuario puede sobrescribirla) · cambios aceptados y rechazados (auditoría) · quién y cuándo lo confirmó.

## 4. Directivas del guion (declarar sin IA)
Líneas `[clave: valor]` en el guion (nunca se narran ni se subtitulan; viajan por la IR y quedan en `Scene.memory`):
`[conoce: A, B]` `[relacion: A, B, tipo, -2..2]` `[obtiene: A, objeto]` `[pierde: A, objeto]` `[destruye: objeto]` `[repara: objeto]` `[usa: A, objeto]` `[abre-hilo: título | A, B]` `[cierra-hilo: título]` `[hecho: clave = valor]` `[corrige-hecho: …]` `[regla: texto]` `[sabe: A | texto]` `[ropa: A, prenda]` `[ubicacion: A, lugar]` `[lugar: nombre | nota]` `[muere|ausente|reaparece: A]` `[evento: título | resumen]` `[momento: texto]` `[flashback: sí]` `[continua: N]`.
Lo que no se entiende se **avisa** (no se inventa). Las mismas directivas sirven para el canon base y para añadir cambios a mano en el panel.

## 5. Cómo se generan las propuestas de cambios
Al terminar la generación de un episodio (`afterRender`, solo si el render **terminó bien**) y al aprobarlo, se (re)calcula su **propuesta** (un borrador):
1. **Declarados** por el autor (directivas por escena) y los **añadidos a mano**.
2. **Deducidos por reglas**: personajes nuevos, dónde termina cada uno (último escenario en el que aparece), prenda del reparto del episodio, lugares nuevos, personajes ausentes que vuelven.
3. (Futuro) **Propuestos por IA** con el mismo esquema (`origin: "llm"`), siempre pendientes.
Cada cambio tiene **id estable** (se conservan las decisiones al recalcular), origen y texto legible («Alex obtiene el coche», «El teléfono queda destruido», «Se abre el hilo “deuda con Marcos”»).

## 6. Cómo se aprueban los cambios
En la ficha del episodio (**Memoria y continuidad**): por cada cambio **Aceptar / Rechazar**; botones **Aceptar todo**, **Rechazar todo**, **Guardar decisiones**, añadir un cambio a mano y corregir resumen / situación final. **Confirmar en el canon** exige: episodio **aprobado**, todo **decidido** y propuesta **no desfasada**. Nada más entra en el canon.
Orden del flujo: `generar → borrador + propuesta → (revisar) → APROBAR episodio → decidir cambios → CONFIRMAR → canon`.

## 7. Contexto para continuar (`ContextPack`)
«Crea el episodio 7 continuando exactamente donde terminó el episodio 6» → `parseEpisodeRequest` (número, temporada, de qué episodio continúa, «exactamente», personajes) → **paquete de contexto** con **presupuesto de tokens** (`KAP_CONTEXT_TOKENS`, 3.500 por defecto; con un modelo, `45 %` de su contexto) y secciones por prioridad:
`petición` · `estado final del ep. N` · `último plano (literal)` · `personajes relevantes` · `relaciones` · `hilos abiertos` (los que implican a personajes relevantes primero) · `objetos` (marca DESTRUIDO/PERDIDO) · `reglas del universo` · `continuidad visual` (ropa, accesorios, versión de diseño, escenario del último plano) · `hechos` · `otros hilos` · `resumen de episodios anteriores`.
Lo imprescindible (petición, estado final, último plano, personajes, reglas) siempre entra; lo menos importante se recorta primero; no se vuelca la historia completa. Se ve en la ficha del episodio (con tokens usados/presupuesto). Si el presupuesto es absurdamente pequeño se **avisa** (`overBudget`).

## 8. Reglas de continuidad (sin IA; informan, no bloquean)
Tres niveles: **error crítico**, **advertencia**, **información nueva pendiente de confirmar**. Se muestran en la ficha y en el centro de aprobación; aprobar con errores críticos **pide confirmación** (no impide).
| Regla | Nivel | Ejemplo |
|---|---|---|
| Personaje **muerto** aparece | crítico | «Marcos murió en ep. 3 y aparece sin explicación» (explican: `[reaparece]`, `[flashback]`) |
| Personaje **ausente** aparece | aviso | explican: `[reaparece]` o una entrada `[entra: …]` |
| **Cambio de ropa** sin razón | aviso | canon «camisa roja», reparto «traje azul» sin `[ropa: …]` |
| Objeto **destruido/perdido** vuelve a usarse | crítico (uso declarado o verbo de uso: «pedalea su bicicleta») · aviso (mención suelta) | hablar de él como perdido («perdí la bicicleta») no es fallo; lo explican `[obtiene]`/`[repara]` |
| Objeto **sin introducir** / **ajeno** | aviso | `[usa: Alex, coche]` sin que exista; Alex usa lo que es de Laura |
| Personaje en **dos lugares a la vez** | crítico | misma `[momento: …]` en dos lugares; `[ubicacion]` ≠ lugar de la escena (aviso) |
| **Arranque discontinuo** | aviso (quien salía en el último plano) · información (el resto) | termina en «Faro» y el siguiente arranca en «Calle» sin transición |
| **Relación** contradice el canon | crítico / aviso | «se conocen» cuando ya se conocían (aviso); «desconocidos» contra el canon (crítico); salto de confianza ≥ 3 (aviso) |
| **Acontecimiento** contradice un episodio anterior | crítico | morir dos veces; destruir lo destruido; perder lo destruido; `hecho: k = v` distinto del canon (corrige con `[corrige-hecho]`) |
| **Hilos** | aviso / información | cerrar uno no abierto o ya cerrado; reabrir; abrir uno abierto |
| **Nuevo** | información | personajes, objetos, hilos, lugares, relaciones, hechos y reglas nuevos |

## 9. Preparado para la IA local (sin conectarla)
Arquitectura objetivo (cada flecha es una interfaz ya definida):
```
Usuario → petición → [EpisodeRequestInterpreter] → memoria/canon → ContextPack → [ScriptAuthor] → guion
 → [ScriptInterpreter] → IR (validateIR) → validación de continuidad → Animación 2D → Render → Preview → Aprobación
 → [EpisodeSummarizer] propone cambios → usuario confirma → canon
```
- `LlmClient` (`src/ports/studio.ts`) es **la única pieza que conoce un modelo** (`model`, `contextTokens`, `generate`). Los adaptadores genéricos `llmScriptAuthor`, `llmEpisodeSummarizer`, `llmRequestInterpreter` (`src/server/ai/adapters.ts`) funcionan con cualquier cliente. **Cambiar Qwen3-8B → Qwen3-14B u otro = otro cliente/configuración**, sin tocar memoria, animación ni render.
- Toda salida del modelo se **valida** (`generateJson`: JSON Schema derivado de zod al motor + validación + reintentos con los errores) y se trata como entrada no fiable: el guion pasa por el intérprete, `validateIR` y la validación de continuidad; los cambios de memoria llegan **pendientes** y exigen la confirmación del usuario. Un modelo nunca escribe en el canon.
- Si el modelo no está o falla, se usan las reglas (y se avisa).
- **Para conectar Ollama más adelante**: (1) implementar `LlmClient` (HTTP a `127.0.0.1:11434`, `format` = JSON Schema, modelo por configuración) en `src/server/ai/ollama.ts`; (2) registrarlo en `CLIENTS` de `registry.ts` y ampliar `KAP_LLM`; (3) pasar el banco de pruebas de `docs/IA-LOCAL.md`. Nada más cambia. **No está hecho.**

## 10. Pruebas
`src/memory/memory.test.ts` (parser de directivas, canon, propuesta, **una prueba por regla de continuidad**, peticiones, **presupuesto de tokens**), `src/server/memory/scenario.test.ts` (escenario manual contra el pipeline real: Alex/Laura/bicicleta/deuda con Marcos; borrador no toca el canon; no confirmar sin aprobar; aceptar algunos; episodio 2 coherente; **contradicción deliberada**; invalidación al editar), `src/server/ai/ai.test.ts` (adaptadores con un doble de prueba: JSON con reparación, cambio de modelo, fallback, inyección de instrucciones). E2E de navegador: `memory-e2e.js` (27 comprobaciones).

## 11. Limitaciones
- Lo **semántico** (quién conoce a quién, qué se pierde) lo declara el autor con directivas o el usuario en el panel; sin IA no se deduce del texto libre (solo hay heurística para objetos perdidos/destruidos por verbo de uso).
- Los nombres de objetos se emparejan por texto normalizado (singular/plural); sinónimos («la bici») no se reconocen.
- Las relaciones son simétricas (un único tipo y confianza por pareja).
- No hay recuperación semántica (embeddings): el contexto es determinista y suficiente para decenas de episodios; se añadiría tras medir.
- Los Shorts no tienen memoria propia (derivan del episodio).
