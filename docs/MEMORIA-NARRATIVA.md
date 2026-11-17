# Memoria narrativa y continuidad — propuesta técnica

> **Estado: diseño para decidir. No hay código nuevo.** Resuelve: *«Crea el episodio 7 continuando exactamente donde terminó el episodio 6»*.
> La generación de guion con IA depende de la decisión de `docs/IA-LOCAL.md`; **la memoria en sí es independiente del modelo** y puede construirse y validarse antes de conectar ninguno.

## 1. Punto de partida (lo que ya existe)
`Universo KAP` ya guarda, **a mano**: personajes (con diseño versionado y regla de continuidad visual), lugares (con escenario congelado), relaciones (`fromId/toId/kind/note`), acontecimientos y cronología (`StoryEvent`), evolución (`Evolution`), entradas de biblia (`BibleEntry`), hechos canónicos (`CanonFact`) y un resumen global (`StoryState`). También `Production.cast` (prenda de cada personaje en cada episodio) y `Production.storyTime`.

**Carencias**: el pipeline **no lee** nada de eso al producir; nada se actualiza solo al aprobar un episodio; no hay *estado actual* de cada personaje, ni hilos pendientes, ni objetos, ni «dónde terminó el episodio N». Es un archivo, no una memoria.

## 2. Principios
1. **Solo lo aprobado es canon.** Un episodio entra en la memoria cuando el administrador lo aprueba (modo APPROVAL). Los borradores nunca contaminan el canon.
2. **Los cambios de memoria se revisan.** Tras aprobar, el sistema *propone* las actualizaciones (diferencias legibles) y el usuario las confirma o corrige. Nada cambia el canon en silencio.
3. **Reglas deterministas primero, IA después.** Lo que se puede sacar sin IA (quién aparece, dónde, con qué prenda, qué lugares) se extrae de la IR ya validada. La IA solo resume y detecta eventos/hilos, con salida estructurada validada.
4. **Instantáneas inmutables por episodio.** El estado tras el episodio N es una foto fija; «continuar desde el 6» = leer la foto del 6. La memoria se puede **reconstruir** desde cero a partir de los episodios aprobados.
5. **Contexto acotado.** Un modelo local pequeño no puede recibir toda la historia: se le entrega un *paquete de contexto* priorizado y con presupuesto de tokens.
6. **Sin inventar.** Si la memoria no contiene algo, el guion no lo da por hecho; el validador lo señala.

## 3. Modelo de datos
Se almacena en SQLite (tabla de documentos JSON existente, nuevas colecciones + migración 005), con esquemas zod y puertos como el resto.

| Colección | Qué guarda | Fuente | Estado |
|---|---|---|---|
| `Character` (existe) | identidad, **apariencia** (diseño versionado), voz | manual / auto-creado | existe |
| **`CharacterState`** (nueva; 1 por personaje y episodio) | `lugar`, `prenda/accesorios` (desde `cast`), `estado emocional`, `objetivo actual`, `heridas/condición`, `qué sabe` (hechos conocidos), `vivo/ausente`, `etapa de su arco` | IR (reglas) + resumen IA revisado | nuevo |
| **`Relationship`** (existe, ampliar) | `from/to`, `tipo`, **`confianza (−2..+2)`**, `historia` (eventos que la cambiaron) | manual + propuestas tras cada episodio | ampliar |
| `Place` (existe) | escenario congelado | auto/manual | existe |
| **`StoryObject`** (nueva) | objetos importantes: dueño, ubicación, estado, primera aparición | IR + IA revisada | nuevo |
| **`StoryEvent`** (existe, ampliar) | `episodio`, `escena`, `tiempo de historia`, resumen, participantes, **consecuencias**, importancia 1-3 | IA revisada | ampliar |
| **`Thread`** (nueva; «historias pendientes») | título, `abierto/avanzado/resuelto`, abierto en ep., último avance, pista de desenlace | IA revisada | nuevo |
| **`EpisodeSummary`** (nueva) | logline, resumen 200-400 palabras, **estado final** (foto de todos los `CharacterState`/objetos/hilos), **último plano** (texto verbatim de la última escena) y gancho/cliffhanger | IA + reglas | nuevo |
| `CanonFact` (existe) | reglas del mundo y hechos inmutables | manual | existe |
| `BibleEntry` / `StoryState` (existen) | biblia de tono/estilo y sinopsis global | manual | existen |

Notas: `Evolution` pasa a *derivarse* de la secuencia de `CharacterState` (la evolución de cada personaje es su historia de estados); se conserva como vista.

## 4. Ciclo de vida
```
Aprobar episodio N
  └─► ① Extracción por REGLAS desde la IR validada: reparto, lugares, prendas (cast), objetos que aparecen, nº de escenas.
  └─► ② Resumen con IA (trabajo en cola, salida JSON validada por zod): EpisodeSummary, StoryEvents, cambios de CharacterState,
        Thread (abrir/avanzar/resolver), cambios de confianza en relaciones.   [sin IA: formulario manual, igual que hoy]
  └─► ③ Panel «Memoria → Cambios propuestos»: diferencias legibles; el usuario acepta/edita/rechaza.
  └─► ④ Al confirmar: se escribe la instantánea «tras el episodio N» (inmutable) y se actualiza el índice.
```
Editar un episodio ya aprobado reinicia su aprobación (regla existente) y marca como **obsoletas** las instantáneas posteriores hasta reconfirmar.

## 5. Recuperación: «continúa exactamente donde terminó el 6»
Determinista, sin embeddings:
1. **Interpretar la petición** (IA o reglas): `{episodio: 7, relación: "continúa", referencia: 6, notas}`. Sin IA, un formulario («Episodio 7 · continúa del 6»).
2. **Ensamblar el `ContextPack`** (presupuesto configurable: ≈ 3-4k tokens para modelos de 4-8B), por prioridad:
   1. petición y tono; 2. **`EpisodeSummary(6)`: estado final + último plano verbatim + gancho**; 3. **`CharacterState(6)`** de los personajes previstos (± los que reaparecen por hilos abiertos); 4. **hilos abiertos** ordenados por antigüedad/importancia; 5. relaciones relevantes (solo del reparto); 6. lugares recurrentes y objetos activos; 7. `CanonFact` y biblia de estilo; 8. resúmenes de episodios anteriores (de más reciente a más antiguo, hasta agotar presupuesto).
3. **Generar** guion (`ScriptAuthor`) → **IR** (`ScriptInterpreter` + `validateIR`) → continúa el pipeline existente.
4. **Validación de continuidad (reglas, no IA)** sobre la IR resultante, con avisos revisables:
   - personaje ausente/fallecido que aparece; personaje en un lugar imposible respecto al estado final del 6;
   - prenda distinta a la última sin justificación (ya existe la regla `applyDesignChange` para el diseño; se extiende a la prenda);
   - objeto que aparece sin haber sido adquirido; hilo cerrado que se reabre; relación contradictoria con su estado.
5. El usuario ve el guion + los avisos y aprueba; **nada se publica**.

*Recuperación semántica opcional* (episodios 30+): embeddings locales (p. ej. un modelo de embeddings de Ollama) para traer eventos antiguos relevantes. No es necesaria al principio; se añade tras medir si el paquete determinista se queda corto.

### Ejemplo (petición → paquete de contexto)
> «Crea el episodio 7 continuando exactamente donde terminó el episodio 6»
```
PETICIÓN: episodio 7 · continúa del 6 · tono: el de la serie (oscuro, misterio)
ESTADO FINAL EP.6: KAP — en el faro, solo, preocupado, lleva la linterna; Mira — en el puente, herida en el brazo; Vega — desaparecida desde la escena 9; …
ÚLTIMO PLANO EP.6 (verbatim): «Una luz se enciende en lo alto del faro. KAP da un paso atrás…»
GANCHO: ¿quién enciende el faro?
HILOS ABIERTOS: «La luz del faro» (abierto ep.4, avanzó ep.6) · «Dónde está Vega» (abierto ep.6) · …
RELACIONES: KAP→Mira confianza +2 · KAP→Vega confianza −1 (tras ep.5) · …
OBJETOS: linterna (KAP) · llave del faro (desconocida)
CANON: el faro está abandonado desde hace años · …
```

## 6. Interfaz (mínima)
- **Universo → Memoria**: línea de tiempo de eventos, hilos (abiertos/resueltos), estado actual de cada personaje, relaciones; vista «estado tras el episodio N».
- **Cambios propuestos** tras aprobar: diferencias aceptar/editar/rechazar.
- **Nuevo episodio**: un cuadro de texto libre («Crea el episodio 7 continuando…») + vista previa del `ContextPack` (para ver qué recordó KAP antes de generar).

## 7. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| El modelo inventa hechos o contradice el canon | Salida con esquema + validación + validador de continuidad por reglas + revisión humana de los cambios de memoria |
| Un modelo pequeño pierde el hilo con contexto largo | `ContextPack` corto y estructurado (no la historia entera); último plano verbatim |
| Deriva de la memoria tras muchas ediciones | Instantáneas inmutables + reconstrucción desde episodios aprobados + marcado de obsoletas |
| El resumen se pierde si no hay IA | Formulario manual equivalente: la memoria funciona sin modelo |
| Coste de mantenimiento para el usuario | Extracción automática por reglas; la IA hace el resto; el usuario solo confirma |

## 8. Plan de implementación propuesto (cada paso con pruebas y sin romper lo existente)
1. **Esquemas + migración + extracción por reglas** (`CharacterState`, `EpisodeSummary`, `Thread`, `StoryObject`) y la instantánea tras aprobar. *Aceptación*: aprobar un episodio de prueba genera la foto correcta; reconstrucción idempotente.
2. **`ContextPack`** determinista + vista previa en la interfaz. *Aceptación*: para el episodio 6 de prueba, el paquete contiene estado final, último plano e hilos; respeta el presupuesto de tokens.
3. **Validador de continuidad** sobre la IR. *Aceptación*: casos de contradicción detectados (personaje ausente, prenda, objeto).
4. **Interfaz «Memoria»** y «Cambios propuestos» (formulario manual, sin IA).
5. *(tras decidir IA)* **Adaptadores Ollama** (resumen + guion) con el banco de pruebas de `IA-LOCAL.md`.
