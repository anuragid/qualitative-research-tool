import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ease, duration, animations, prefersReducedMotion } from "./animations";

describe("ease", () => {
  it("has standard, gentle, and enter properties", () => {
    expect(ease).toHaveProperty("standard");
    expect(ease).toHaveProperty("gentle");
    expect(ease).toHaveProperty("enter");
  });
});

describe("duration", () => {
  it("has micro, normal, slow, and entrance properties", () => {
    expect(duration).toHaveProperty("micro");
    expect(duration).toHaveProperty("normal");
    expect(duration).toHaveProperty("slow");
    expect(duration).toHaveProperty("entrance");
  });

  it("micro equals 0.15", () => {
    expect(duration.micro).toBe(0.15);
  });

  it("normal equals 0.2", () => {
    expect(duration.normal).toBe(0.2);
  });

  it("slow equals 0.5", () => {
    expect(duration.slow).toBe(0.5);
  });

  it("entrance equals 0.4", () => {
    expect(duration.entrance).toBe(0.4);
  });
});

describe("animations", () => {
  it("fadeInUp has y, opacity, duration, and ease", () => {
    expect(animations.fadeInUp).toHaveProperty("y");
    expect(animations.fadeInUp).toHaveProperty("opacity");
    expect(animations.fadeInUp).toHaveProperty("duration");
    expect(animations.fadeInUp).toHaveProperty("ease");
  });

  it("stagger has each and ease", () => {
    expect(animations.stagger).toHaveProperty("each");
    expect(animations.stagger).toHaveProperty("ease");
  });
});

describe("prefersReducedMotion", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore window if it was deleted
    if (!globalThis.window && originalWindow) {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    }
  });

  it("returns a boolean", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });

  it("returns false by default in test env", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("returns true when user prefers reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
  });

  it("returns false when window is undefined (SSR)", () => {
    // Temporarily make window undefined to simulate SSR
    const savedWindow = globalThis.window;
    // @ts-expect-error - intentionally deleting window for test
    delete globalThis.window;
    expect(prefersReducedMotion()).toBe(false);
    // Restore
    Object.defineProperty(globalThis, "window", {
      value: savedWindow,
      writable: true,
      configurable: true,
    });
  });
});
