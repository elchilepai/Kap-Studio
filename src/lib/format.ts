export function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
export function fmtDate(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d.length === 10 ? d + "T12:00:00" : d);
  return isNaN(+dt) ? d : dt.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtEur(n: number): string {
  return n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}
export function today(): string { return new Date().toISOString().slice(0, 10); }
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
/** Lunes..domingo (YYYY-MM-DD) de la semana de `ref`. */
export function weekDays(ref = new Date()): string[] {
  const d = new Date(ref); d.setHours(12, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d); x.setDate(d.getDate() + i); return x.toISOString().slice(0, 10);
  });
}
