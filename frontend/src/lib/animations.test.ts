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
  beforeEach(() => {
    // jsdom does not implement matchMedia; provide a minimal stub
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a boolean", () => {
    expect(typeof prefersReducedMotion()).toBe("boolean");
  });

  it("returns false by default in test env", () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});
