# Escenas estructuradas (representación intermedia, IR)

Es el **contrato entre la interpretación del guion y la animación**. KAP Studio separa dos capas:

```
texto / lenguaje natural ──▶ [INTERPRETACIÓN] ──▶ IR (JSON validado) ──▶ [ANIMACIÓN: director → motor 2D] ──▶ vídeo
                              reglas (hoy)                              no sabe nada del texto original
                              LLM (futuro, no conectado)
```
Cualquier intérprete —el de reglas de hoy, un LLM mañana, o una persona escribiendo JSON— entrega **la misma estructura**. Se valida con un esquema
estricto (`src/domain/screenplay.ts`) antes de tocar la animación: una salida defectuosa se rechaza con el motivo; nunca llega al motor.
Hoy se puede probar pegando el JSON en la ficha del episodio («Importar escenas estructuradas»).

## Esquema
```json
{
  "v": 1,
  "scenes": [
    {
      "title": "Refugio",
      "location": "Refugio",
      "timeOfDay": "night",
      "mood": "tenso",
      "lines": [
        { "text": "KAP despierta en el refugio, confuso." },
        { "speaker": "Mira", "text": "¿Estás bien? Llevas horas dormido." }
      ],
      "beats": [
        { "type": "enter", "actor": "KAP", "from": "left", "at": 0.3 },
        { "type": "expression", "actor": "KAP", "value": "worried", "at": 2 },
        { "type": "pose", "actor": "Mira", "value": "arms_crossed", "at": 2.5 },
        { "type": "shot", "size": "close", "actor": "KAP", "at": 3 }
      ],
      "hints": { "durationSec": 12, "transition": "fadeblack", "music": "tenso" }
    }
  ]
}
```
- `lines`: texto en orden de lectura (sin `speaker` = narrador). Es lo que se locuta y se subtitula.
- `beats`: acciones (vocabulario cerrado, abajo). Los actores se nombran por su nombre; el director los resuelve contra la biblia de personajes.
- Límites: ≤ 300 escenas, ≤ 120 líneas y ≤ 200 acciones por escena, textos ≤ 1200 caracteres. Fuera de rango → se rechaza.

## Vocabulario de acciones (`beats`)
| `type` | Campos |
|---|---|
| `enter` / `exit` | `actor`, `from`/`to`: `left`\|`right`\|`fade`, `at?`, `dur?` |
| `walk` | `actor`, `to`: número 0–16 \| `left`\|`right`\|`center`, `run?`, `at?`, `dur?` |
| `face` | `actor`, `dir`: `left`\|`right`, `at?` |
| `expression` | `actor`, `value`: neutral, happy, sad, angry, surprised, worried, thinking |
| `gesture` | `actor`, `value`: wave, point, shrug, nod, shake, think, raise, `dur?` |
| `pose` | `actor`, `value`: idle, arms_crossed, hands_hips, pointing, thinking, facepalm, cheer, shrug |
| `camera` | `mode`: zoom \| pan \| follow \| shake \| reset, `zoom?`, `dir?`, `actor?`, `amp?` |
| `shot` | `size`: wide \| medium \| close, `actor?`, `cut?` (corte seco) |
| `vfx` | `effect`: rain, snow, fog, flash, darken, dust, `intensity?` |
| `prop` | `kind`: lantern, box, door, sign, star, moon, tree, lamp; `action`: show \| hide |

Cada beat tiene su forma de texto editable (`entra: KAP izquierda en 0.5s`, `plano: primer plano KAP corte`…) y se lee/escribe sin pérdida
(`beatToDirection` ⇄ `parseDirection`); el editor de escenas usa esa forma.

## Qué hace el sistema con la IR
1. Valida (esquema + biblia). Los **personajes que hablan y los lugares nuevos** se crean con diseño/escenario provisional y se guardan: en el siguiente episodio son los mismos.
2. Convierte a escenas (duraciones estimadas; luego se ajustan al audio real), con transiciones según el ritmo (cambio de lugar → fundido; mismo lugar con diálogo → corte).
3. El director genera la animación: boca, miradas, gestos, planos/contraplanos, cámara, efectos.

## Para conectar un LLM en el futuro
Implementar `ScriptInterpreter` (`src/ports/studio.ts`) devolviendo esta estructura y registrarlo en `activeInterpreter()`. No hay que tocar el director ni el motor.
El LLM **no** está conectado hoy (`/render → Capacidades`).
