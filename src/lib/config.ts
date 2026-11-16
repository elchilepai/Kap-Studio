/** Configuración fija del proyecto KAP Studio. */
export const KAP_CONFIG = {
  name: "KAP Studio",
  channel: "KAP",
  locale: "es",
  cadence: "weekly",
  publishMode: "APPROVAL", // nada se publica sin aprobación del administrador
  episodeTargetSeconds: 300,
  brandColor: "#FFD400",
} as const;
export type PublishMode = "APPROVAL";
