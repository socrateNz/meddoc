import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toErrorMessage } from "./utils";

describe("toErrorMessage", () => {
  it("returns the first zod issue message for a ZodError", () => {
    const schema = z.object({ name: z.string().min(2, "Nom trop court") });
    const result = schema.safeParse({ name: "a" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = toErrorMessage(result.error, "fallback");
      expect(message).toBe("Nom trop court");
    }
  });

  it("returns the error message for a regular Error", () => {
    const message = toErrorMessage(new Error("Boom"), "fallback");
    expect(message).toBe("Boom");
  });

  it("returns the fallback when the error has no message", () => {
    const message = toErrorMessage({}, "fallback");
    expect(message).toBe("fallback");
  });

  it("returns the fallback for null/undefined errors", () => {
    expect(toErrorMessage(null, "fallback")).toBe("fallback");
    expect(toErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
