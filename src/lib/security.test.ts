import { describe, expect, it } from "vitest";
import { isSameOrigin, safeLocalPath } from "./security";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("safeLocalPath", () => {
  it("acepta rutas locales", () => { expect(safeLocalPath("/universo?tab=biblia")).toBe("/universo?tab=biblia"); });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "evil", "/a\nb", "", undefined, 5])("rechaza %s", (x) => {
    expect(safeLocalPath(x, "/seguro")).toBe("/seguro");
  });
});
describe("isSameOrigin", () => {
  it("acepta mismo origen", () => { expect(isSameOrigin(h({ origin: "https://kap.test", host: "kap.test" }))).toBe(true); });
  it("rechaza otro origen", () => { expect(isSameOrigin(h({ origin: "https://evil.test", host: "kap.test" }))).toBe(false); });
  it("sin Origin: solo same-origin/none", () => {
    expect(isSameOrigin(h({ host: "kap.test", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(h({ host: "kap.test", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOrigin(h({ host: "kap.test" }))).toBe(false);
  });
});
