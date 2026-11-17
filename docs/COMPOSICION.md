# Composición de planos (16:9 y 9:16)

Código: `src/animation/framing.ts` (puro e isomórfico: el mismo en el navegador y en Node) + `director.ts` + `render.ts`. Tests: `framing.test.ts`, `vertical.test.ts`, `cinema.test.ts`. Herramienta de revisión: `node --no-warnings scripts/preview-composition.mjs <salida.png> v|h 2 3 4` (hoja de contactos con la zona de subtítulos marcada).

**Principio**: no se encogen todos los personajes. La composición se adapta a cada escena con cámara, reparto y filas de profundidad.

## Problemas detectados y solución
| Problema | Solución |
|---|---|
| Personajes cortados por el borde en los contraplanos | **Solucionador de planos** (`frameShot`): barre zoom y centro y puntúa cada candidato. Quien habla debe quedar **entero, con los brazos** (medio ancho 1,15 u); cada otro personaje debe quedar **dentro** (cuerpo entero) o **fuera** (ni su mano asoma, alcance 1,05 u); si hay que elegir, abre el plano o aísla a uno. Nunca «cortado». |
| Solapamiento con 3 o más personajes | **Reparto** (`layoutSlots`): en 16:9 una fila como siempre; en 9:16, 1-2 personajes agrupados y 3-4 **escalonados en dos filas** (la trasera más arriba y un 8 % menor, para que las cabezas no se tapen) sin solaparse horizontalmente dentro de cada fila. |
| 4 personajes en vertical | Formación «pareja delantera + dos alas detrás». El plano de grupo abre solo ≈ 5-7 % (zoom 0,92); los primeros planos se resuelven con el solucionador (aísla a uno si cabe, o plano de grupo). Con imagen de fondo no se abre por debajo de 1 (no hay imagen fuera): se comprime la formación. |
| El subtítulo tapa los pies | **Zona segura**: `subtitleMetrics` es la **fuente única** de tamaño/margen (la usa el ASS y la composición). La cámara baja la escena (`feetDrop`) lo justo para que los pies queden sobre la zona, en cualquier plano en que el cuerpo entero quepa sobre ella. En vertical la franja inferior (la que tapa la interfaz de Shorts) queda libre. Sin subtítulos no se desplaza. |
| Personajes que caminan durante el diálogo | Los planos se **resuelven al final**, con las posiciones reales (`evaluate`) cada 0,7 s, incluidos los movimientos sugeridos por la narración. |
| Proporciones coherentes entre planos | Pies a la misma altura relativa en todos los planos generales y medios (misma regla de zona segura); misma escala de personaje en toda la escena (solo la fila trasera cambia, siempre igual). |

## Reglas numéricas (ajustables en `framing.ts`)
`ACTOR_HALF_W 0,78` · `FOCUS_HALF_W 1,15` · `ACTOR_REACH 1,05` · `ROW_DY 0,45` · `ROW_SCALE 0,92` · pies a ≥ 3 % por encima de la zona de subtítulos · quien habla a la regla de tercios (0,17 de la ventana en 16:9; 0,10 en 9:16).

## Limitaciones conocidas
- Con un personaje enviado muy lejos de los demás (p. ej. «camina a la derecha» hasta el borde del mundo) en 9:16 no caben todos: la cámara encuadra a quien habla y deja al otro del todo fuera; aparece un aviso en el editor si un plano no se puede resolver sin cortar.
- Primeros planos muy cerrados (la cara llena la pantalla) no se desplazan: no hay pies que proteger, pero el subtítulo puede cubrir el cuello/torso.
- Escenarios con imagen de fondo no bajan la cámara (no hay más imagen debajo): el subtítulo puede tapar los pies.
- El primer plano de decorado (arbustos, pilares) puede quedar bajo el subtítulo: es decorado, no se reubica.
