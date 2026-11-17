# Serie de KAP — decisión narrativa y cómo la sostiene la memoria

> KAP Studio **no genera historias independientes**: produce **una historia serializada y continua sobre KAP**, desde su infancia hasta la cima como artista de rap. Cada episodio (≈ 5 min) es consecuencia del anterior y vive una etapa concreta de su evolución. **No hay número de episodios fijado**: depende de cuánto contenido narrativo haga falta para contar bien el recorrido. Esta decisión está **registrada como canon inicial** y la memoria la hace cumplir.

## 1. Canon inicial registrado (`src/memory/kap-canon.ts`)
Se registra con una acción **explícita e idempotente**: *Universo → Memoria → «Registrar canon inicial de KAP»* o `npm run memory:seed`. No duplica nada si ya está y no toca episodios.

**Premisa** (textual del autor, como hechos del punto de partida): familia con muy pocos recursos · padres con problemas con las drogas que apenas le prestan atención · hermano pequeño al que cuida y protege · bullying y desprecio por su situación económica y su ropa · se ríen de su sueño de ser millonario con su música · pasión y talento por el rap · supera las dificultades y llega a la cima.

**Reglas de la serie**: serie serializada · ≈ 5 min con inicio, conflicto, desarrollo, punto emocional, resolución parcial y gancho · cada episodio = una etapa y aporta algo nuevo · sin saltos artificiales de años · la cima no llega hasta haber desarrollado el recorrido y sin fijar el número de episodios · lo ocurrido no desaparece arbitrariamente · evolución = esfuerzo + talento + disciplina + aprendizaje + perseverancia.

**No se inventa nada**: el hermano y los padres se registran como «Hermano de KAP» y «Padres de KAP» (nombres por definir); no se fija edad, personalidad ni apariencia. La memoria lo marca como **«sin datos todavía»** hasta que un episodio aprobado lo establezca.

**Conflictos abiertos iniciales**: situación familiar (padres y drogas) · bullying hacia KAP · el sueño de ser millonario con la música · cuidar y proteger a su hermano.

## 2. El arco: 5 etapas, 17 hitos (en orden, sin episodios asignados)
| Etapa | Hitos |
|---|---|
| **Niño** | 1 Niño con pocos recursos · 2 Niño que intenta proteger a su hermano · 3 Víctima de bullying · 4 Niño con un sueño |
| **Adolescente** | 5 Adolescente que empieza a tomarse la música en serio · 6 Primeras dificultades musicales |
| **Artista emergente** | 7 Primeras oportunidades · 8 Primeros fracasos · 9 Mejora de su talento · 10 Primer reconocimiento · 11 Primeros trabajos relacionados con la música · 12 Primeros éxitos |
| **Artista consolidado** | 13 Crecimiento de su carrera · 14 Problemas y decisiones difíciles · 15 Consolidación como artista |
| **En la cima** | 16 Éxito · 17 Llegada a la cima |
Un hito se da por **logrado cuando un episodio aprobado lo cuenta** (`[hito-logrado: …]`); puede ocupar varios episodios (`[hito: …]` = en curso). Nada fija cuántos.

## 3. Evolución de KAP (lo que la memoria guarda)
Por etapa hay una **plantilla de rasgos** (la lista del autor): *Niño* (edad aproximada, situación económica, relación con sus padres, con su hermano, situación escolar, personalidad, sueños, habilidades iniciales) · *Adolescente* (cambios personales, evolución musical, nuevas relaciones, conflictos, primeras experiencias musicales, evolución de su confianza) · *Artista emergente* · *Artista consolidado* · *En la cima* (éxito alcanzado, consecuencias, quién sigue a su lado, quién quedó atrás, relación con su pasado y con su hermano, significado).
Cada valor se guarda **con su historial** (`etapa`, `edad`, `perfil`, `atributo 0-10`, `aspecto/versión de diseño`): el estado nuevo siempre sale del anterior («sueños: … (antes: …)»). Directivas: `[etapa: KAP, …]` `[edad: KAP, n]` `[perfil: KAP, rasgo = valor]` `[atributo: KAP, disciplina = 4]` `[aspecto: KAP, … | vN]`.

## 4. Reglas que protegen el arco (sin IA)
| Regla | Nivel |
|---|---|
| **Llegada a la cima prematura** (dar por logrado «Éxito»/«Llegada a la cima» con hitos anteriores sin contar) | **crítico** |
| Saltarse una **etapa** de vida (Niño → Artista emergente) | **crítico** |
| **Salto de años** artificial (≥ 4 años de golpe) | **crítico** (≥ 2 años: aviso, con los hitos pendientes de la etapa) |
| Edad que baja (salvo flashback) | **crítico** |
| Hitos dados por logrados **fuera de orden**; dejar una etapa con hitos sin contar; retroceder de etapa | aviso |
| **Evolución física**: pasan ≥ 3 años y el diseño visual sigue siendo el mismo | aviso (pide nueva versión de diseño con justificación) |
| Falta de **estructura** (inicio, conflicto, desarrollo, punto emocional, resolución parcial, gancho) | aviso (lista lo que falta) |
| El episodio **no aporta nada nuevo** · el **protagonista no sale** · duración fuera de ≈ 5 min (4–6 min) | aviso |
| **Gancho** del episodio anterior | información (se recuerda para retomarlo) |
Más las de continuidad general (objetos, ropa, relaciones, lugares, hechos, hilos…): ver `MEMORIA-NARRATIVA.md`. Los umbrales (`MAX_AGE_JUMP_WARN/ERROR`, `PHYSICAL_EVOLUTION_YEARS`, `EPISODE_TARGET_SEC`) están en `src/memory/validate.ts`.

## 5. Las tres preguntas (`src/memory/story.ts`, Universo → Memoria → «Serie»)
Deterministas, **basadas únicamente en el canon inicial y los episodios aprobados y confirmados** (nunca en borradores):
- **«¿Qué ha vivido KAP hasta este momento?»** → punto de partida, episodios en orden con sus hitos/acontecimientos, arco (n/17), evolución (etapas, edades, rasgos con «antes»), conflictos abiertos.
- **«¿Dónde terminó KAP?»** → estado final del último episodio, último plano literal, gancho, hilos abiertos.
- **«¿Qué debería saber el sistema antes de crear el siguiente episodio?»** → dónde terminó, gancho a retomar, hito en curso y siguientes, lo que sabe de KAP (edad, apariencia, ropa, personalidad, hermano, padres, amigos y enemigos, secundarios, lugares, objetos, evolución musical, sueños, conflictos, acontecimientos) y **lo que NO sabe todavía**, y las reglas de la serie.

## 6. Contexto para el episodio N+1
El `ContextPack` incluye, con presupuesto de tokens y por prioridad: formato de la serie (≈ 5 min y estructura obligatoria) · estado final y último plano del episodio anterior · **gancho a retomar** · **arco** (etapa, hitos logrados, en curso y siguientes, «no saltes hitos ni años») · **evolución de KAP** con su historial · personajes, relaciones, hilos, objetos, reglas, continuidad visual y resumen de episodios anteriores. Lo imprescindible (petición, formato, estado final, último plano, gancho, arco, evolución, personajes, reglas) siempre entra.

## 7. Flujo (cada flecha es una interfaz ya implementada o preparada)
`Petición («Crea el episodio 7 continuando exactamente donde terminó el 6») → memoria → contexto → [IA local: ScriptAuthor] → guion → escenas (IR) → validación de continuidad → animación 2D → narración → música/SFX → subtítulos → preview → aprobación → propuesta de cambios de memoria → confirmación → canon actualizado → episodio N+1`.
**Todavía no hay IA conectada**: hoy el guion lo escribe el autor con las directivas; el contexto queda a la vista en la ficha del episodio.

## 8. Demostración con el pipeline real (`npm run demo:series`)
`scripts/series-demo.mts` ejecuta episodios consecutivos por el pipeline real (voz eSpeak, **animación 2D**, subtítulos, montaje por tramos) con la memoria en el bucle: canon inicial → petición → contexto → guion de demostración → render → propuesta → aprobación → confirmación → siguiente episodio. Los textos de `scripts/fixtures/kap-demo/` son **material técnico de prueba, no canon ni guion de la serie**.

Resultado (3 episodios consecutivos, 480p, 4 vCPU / 16 GB, sin GPU):
| Episodio | Duración | Escenas | Render | RAM pico | Contexto | Cambios propuestos | Continuidad |
|---|---|---|---|---|---|---|---|
| 1 | **4,54 min** | 20 | 131 s | 529 MB | 1.163 tokens | 25 (10 declarados + 15 deducidos) | 0 crítico · 0 avisos |
| 2 | **4,99 min** | 23 | 147 s | 543 MB | 1.690 tokens | 25 | 0 crítico · 1 aviso* |
| 3 | **4,61 min** | 19 | 131 s | 521 MB | 1.871 tokens | 15 | 0 crítico · 0 avisos |
\* El episodio 1 termina en «Salón de noche» y el 2 arranca en «Puerta de casa» (en la práctica, el mismo sitio): la regla de arranque compara **nombres de lugar**. Se resuelve usando el mismo nombre o declarando `[ubicacion: …]`; el prompt del redactor lo pide.

Tras los tres episodios la memoria responde: **4/17 hitos** (2 + 1 + 1), etapa «Niño», edad **8 → 9** con su historial, `situación escolar`, `sueños` y `habilidades iniciales` con su valor anterior («antes: …»), esfuerzo/disciplina/perseverancia, 5 conflictos abiertos, y «dónde terminó» con el último plano y el gancho del episodio 3. Todo el contexto del episodio N+1 cabe en < 2.000 tokens (presupuesto 3.500).
**Fallo real que encontró esta demostración y ya está corregido:** crear personajes nuevos en el estudio al generar el episodio 2 cambiaba la firma de contenido del episodio 1 y lo sacaba del canon (hitos saltados, historia incompleta). La firma ahora solo depende de los personajes del propio episodio; hay test de regresión.
