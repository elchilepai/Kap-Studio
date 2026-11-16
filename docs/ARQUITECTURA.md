# Arquitectura

Arquitectura hexagonal ligera:

- `src/domain`: tipos (Zod) y reglas puras (`workflow.ts`). Sin dependencias externas.
- `src/ports`: interfaces `Storage`, `ScriptWriter`, `VoiceSynth`, `Renderer`, `Publisher`, `ChannelStats`.
- `src/adapters/<proveedor>`: implementaciones. Hoy solo `local/memory-storage`. Añadir una integración real = añadir un adaptador, sin tocar dominio ni UI.
- `src/server/providers.ts`: composition root; único sitio que elige adaptadores. Lo no configurado falla explícitamente (no hay integraciones simuladas).
- `src/app`: UI Next.js (App Router), español, dark + amarillo KAP.

Reglas: la publicación exige `canPublish(status)` (modo APPROVAL); el estado solo avanza con `canTransition`. Continuidad = `CanonFact` inyectados al `ScriptWriter`.
