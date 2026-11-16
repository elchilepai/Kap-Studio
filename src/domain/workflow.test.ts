import { describe, expect, it } from "vitest";
import { canPublish, canTransition } from "./workflow";

describe("workflow", () => {
  it("no permite saltarse la revisión", () => {
    expect(canTransition("RENDER", "PUBLISHED")).toBe(false);
    expect(canTransition("RENDER", "REVIEW")).toBe(true);
  });
  it("solo publica contenido aprobado", () => {
    expect(canPublish("REVIEW")).toBe(false);
    expect(canPublish("APPROVED")).toBe(true);
  });
});
