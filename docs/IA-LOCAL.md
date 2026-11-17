# IA gratuita y local para KAP Studio — comparativa y recomendación

> **Estado: investigación. No se ha instalado ni conectado nada.** No hay ningún LLM en KAP Studio: el guion lo escribe el usuario y el intérprete es por reglas.
> **Qué está medido y qué no.** Nada de lo que sigue se ha ejecutado en este proyecto: el entorno no permite descargar modelos y no se instaló nada por indicación expresa. Las cifras de RAM y velocidad son **estimaciones de orden de magnitud** a partir de conocimiento general del formato GGUF (≈ 0,55–0,6 GB por cada mil millones de parámetros en Q4_K_M, más la caché de contexto). Las afirmaciones sobre licencias y calidad vienen de fuentes secundarias (blogs y guías), que se citan al final y **deben contrastarse con los textos oficiales** antes de decidir.

## 1. Qué necesita KAP de un modelo
| Tarea | Entrada → salida | Exigencia |
|---|---|---|
| Interpretar una petición («episodio 7 continuando donde terminó el 6») | texto libre → petición estructurada | baja-media |
| **Dividir un guion/historia en escenas** (`ScriptInterpreter`) | texto → **IR JSON validada por `validateIR`** (escenas, líneas, beats, lugares, personajes) | **JSON fiable** + español correcto |
| **Escribir el guion** (`ScriptAuthor`) | idea + memoria narrativa → guion | creatividad, coherencia con el canon, español |
| Resumir un episodio aprobado para la memoria | guion → eventos, hilos, estado final (JSON) | JSON fiable |

La arquitectura ya tiene los puertos (`src/ports/studio.ts`) y el esquema que valida lo que devuelva cualquier modelo. **Ninguna salida del modelo se acepta sin pasar por `validateIR`**; un modelo pequeño que falle se reintenta con los errores y, si no converge, se avisa (no se simula).

## 2. Opciones comparadas
Criterios del encargo: coste cero · calidad narrativa · generar guiones · dividir en escenas · RAM/hardware · integración · privacidad/offline.

### Motores de ejecución (el «servidor» del modelo)
| | **Ollama** | **llama.cpp (`llama-server`)** | LM Studio |
|---|---|---|---|
| Coste / licencia | Gratis, código abierto (MIT) | Gratis, código abierto (MIT) | Gratis para uso, **no** es código abierto |
| Funcionamiento sin conexión | Sí tras descargar el modelo | Sí | Sí |
| Salida estructurada por esquema JSON | **Sí**: parámetro `format` con JSON Schema (internamente genera una gramática para llama.cpp) [1] | **Sí**: `response_format`/`json_schema`/GBNF, tokens inválidos con probabilidad 0 [2] | Sí |
| API | REST local `127.0.0.1:11434` + compatibilidad OpenAI | Servidor HTTP compatible OpenAI | Servidor local |
| Gestión de modelos | `ollama pull` (catálogo + GGUF propios) | Manual (archivos GGUF) | Interfaz gráfica |
| Esfuerzo de integración | **Muy bajo** | Bajo-medio | Medio (app de escritorio, no pensada para servidor) |
| Observación | Ollama **Cloud** no admite salida estructurada y no es local/gratuito: **no usarlo** [1] | Menos pegamento, más control de memoria (`--mlock`, contexto, hilos) [2] | Descartado por no ser abierto |

### Modelos abiertos (familias)
| | **Qwen3** (8B / 14B / 4B) | Llama 3.1 8B | Gemma 3 / 4 | Mistral (7B / Small 24B) | Phi-4 (14B) |
|---|---|---|---|---|---|
| Licencia (según fuentes secundarias) | **Apache 2.0** en la mayoría de variantes [4] | Licencia comunitaria propia: tope de 700 M usuarios, atribución, restricciones de uso de las salidas [4] | Gemma 3: términos propios con «usos prohibidos»; Gemma 4 se describe como Apache 2.0 (**verificar**) [4] | Mistral 7B Apache 2.0; Small según versión | MIT |
| Español | Citado entre los mejores abiertos de tamaño medio [3] | Bueno en conversación [3] | Correcto | Bueno | Más débil (soporte multilingüe más estrecho) [3] |
| Escritura creativa | Buena; 14B «mejor relación calidad/RAM» en una guía [3] | Buena en diálogo y creatividad [3] | Aceptable | Fiable en prosa estructurada | **Floja en creatividad** [3] |
| JSON / seguir esquemas | Muy buena (con salida estructurada del motor, imprescindible) | Buena | Buena | Buena | Buena |
| RAM estimada (Q4_K_M, contexto 8k) | 4B ≈ 3–4 GB · 8B ≈ 6–7 GB · 14B ≈ 10–11 GB | 8B ≈ 6–7 GB | 12B ≈ 9–10 GB | 7B ≈ 5–6 GB · 24B ≈ 15+ GB | 14B ≈ 10–11 GB |
| CPU (4 núcleos, sin GPU), estimado | 4B ≈ 8–12 tok/s · 8B ≈ 3–6 tok/s · 14B ≈ 1–3 tok/s | 8B ≈ 3–6 tok/s | similar por tamaño | similar por tamaño | 14B ≈ 1–3 tok/s |

Las fuentes de «calidad» son guías de terceros, algunas de proveedores de API (con interés comercial) [3]: sirven para **elegir candidatos**, no para decidir. Un guion de ≈ 5 min son ≈ 1.500–2.500 tokens de salida (más la IR en JSON): a 4 tok/s en CPU son del orden de **10–20 min por episodio** (tarea por lotes, no interactiva); con GPU, segundos.

### Alternativas descartadas
- **APIs gratuitas alojadas** (niveles gratis de proveedores): coste cero hoy pero sin garantía, requieren conexión, **envían el guion a un tercero** (privacidad) y pueden cambiar o cobrar. Contradicen «funcionar sin conexión» y «no depender de servicios».
- **Modelos muy grandes (> 20B)**: no caben razonablemente en 16 GB sin GPU.

## 3. Recomendación
**Ollama + Qwen3 (familia Apache 2.0), con salida estructurada por JSON Schema derivado de la IR de KAP.**

1. **Motor: Ollama.** Menor esfuerzo de integración (API REST local, `format` con esquema), funciona sin conexión tras descargar el modelo, código abierto. `llama-server` queda como alternativa de menor sobrecarga si se necesita más control (mismo motor por debajo; el adaptador sería casi idéntico porque ambos admiten `response_format`).
2. **Modelo por defecto: Qwen3-8B (Q4_K_M)** para una máquina de 16 GB sin GPU; **Qwen3-14B** con ≥ 24 GB o GPU; **Qwen3-4B** como modo de emergencia en equipos pequeños. Motivos: licencia más limpia (Apache 2.0), buen español y buen seguimiento de esquemas según las fuentes consultadas, tamaños para cada hardware.
3. **Candidato de contraste: Llama 3.1 8B** (más cuidada en diálogo creativo según las guías, pero con licencia más restrictiva). No se adopta sin prueba propia.
4. **Decisión por medición, no por reputación.** Antes de fijar el modelo, un banco de pruebas propio, objetivo y reproducible:
   - 8 peticiones reales en español (guion corto, escena de acción, diálogo emotivo, continuación de un episodio, petición ambigua…).
   - Métricas automáticas: **% de IR válidas a la primera** (`validateIR`), nº de reintentos, coherencia con la memoria (personajes/lugares inventados fuera del canon), tiempo y RAM pico.
   - Revisión humana (usted) de 3 guiones a ciegas.
   - Comparar Qwen3-8B/14B vs. Llama 3.1 8B (y Qwen3-4B como suelo).

## 4. Integración con la arquitectura actual (diseño; no implementado)
```
ScriptInterpreter  (ya existe)  ──► OllamaInterpreter  : prompt + format=JSONSchema(IR) → validateIR → reintento con errores (máx. 2)
ScriptAuthor       (ya existe)  ──► OllamaAuthor       : ContextPack (memoria) + petición → guion (texto) → interpreter → IR
CapabilityRow                   ──► estado real del proveedor en «Configuración/Render» (available() hace ping a /api/tags)
```
- Configuración: `KAP_LLM=ollama`, `KAP_OLLAMA_URL=http://127.0.0.1:11434`, `KAP_LLM_MODEL=qwen3:8b`. Por defecto **desactivado**; sin él todo funciona como hoy.
- **Seguridad**: solo `127.0.0.1` salvo configuración explícita; el guion del usuario es *dato*, no instrucciones (la salida está limitada al esquema y se valida); sin herramientas ni ejecución de código por el modelo; límites de tamaño, tiempo y reintentos; todo se registra en la actividad.
- **Cola**: la generación es un trabajo más de la cola persistente (cancelable, con progreso, reintentos), igual que el render, para no bloquear la web.
- **Sin simulaciones**: si Ollama no está o el modelo no responde, la interfaz lo dice y se usa el intérprete por reglas.
- **Aprobación**: la IA propone; nada se aprueba ni se publica solo.

## 5. Lo que necesito saber para decidir
1. **¿Dónde se ejecutará KAP Studio?** (a) en este tipo de contenedor en la nube (4 vCPU, 16 GB, sin GPU) o (b) en su ordenador (¿RAM? ¿GPU?). Cambia el modelo recomendado y los tiempos.
2. **Permiso para una prueba medida**: instalar Ollama y descargar los modelos candidatos (implica permitir en la red del entorno los hosts de Ollama y del catálogo de modelos, o que usted los instale localmente y me dé acceso). No se hará sin su aprobación.

## Fuentes (secundarias; contrastar con los repositorios y licencias oficiales)
1. Ollama, *Structured outputs* — https://docs.ollama.com/capabilities/structured-outputs
2. llama.cpp `llama-server` (salida estructurada, API) — https://www.mintlify.com/ggml-org/llama.cpp/api/tools/llama-server
3. Guías de modelos locales para escritura y español — https://insiderllm.com/guides/best-local-llms-writing-creative-work/ · https://www.forgenex.com/en/blog/llama-vs-qwen3-vs-deepseek-la-batalla-de-la-ia-local-que-puedes-ejecutar-en-tu-propio-pc-y-cual-gana-en-espanol · https://www.siliconflow.com/es/articles/best-open-source-llm-for-spanish (proveedor de API: interés comercial)
4. Licencias de modelos abiertos — https://braindetox.kr/en/posts/open_weight_model_license_guide.html · https://wz-it.com/en/knowledge/ki/open-llm-licenses-commercial-use/
