import { describe, it, expect } from "vitest";
import { cn, formatDuration, formatFileSize, formatDate } from "./utils";

describe("cn", () => {
  it("merges class names correctly", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn("base", isActive && "active", isDisabled && "disabled")).toBe(
      "base active"
    );
  });

  it("deduplicates and resolves conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    // eslint-disable-next-line design-system/no-raw-tailwind-colors -- Testing cn() merge behavior with conflicting classes
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles empty and undefined inputs", () => {
    expect(cn()).toBe("");
    expect(cn("", undefined, null, false)).toBe("");
  });

  it("handles array inputs", () => {
    expect(cn(["px-2", "py-1"])).toBe("px-2 py-1");
  });
});

describe("formatDuration", () => {
  it("formats seconds to mm:ss", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("pads single-digit seconds", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(9)).toBe("0:09");
  });

  it("formats durations over an hour with h:mm:ss", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(7200)).toBe("2:00:00");
  });

  it("pads minutes and seconds in hour format", () => {
    expect(formatDuration(3605)).toBe("1:00:05");
    expect(formatDuration(3660)).toBe("1:01:00");
  });
});

describe("formatFileSize", () => {
  it("formats 0 bytes", () => {
    expect(formatFileSize(0)).toBe("0 Bytes");
  });

  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 Bytes");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1 MB");
    expect(formatFileSize(5242880)).toBe("5 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1073741824)).toBe("1 GB");
    expect(formatFileSize(3221225472)).toBe("3 GB");
  });

  it("rounds to two decimal places", () => {
    // 1.23 KB = 1259.52 bytes
    expect(formatFileSize(1260)).toBe("1.23 KB");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string to a readable format", () => {
    const result = formatDate("2026-01-15T14:30:00Z");
    // The exact output depends on timezone, but it should contain these parts
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });

  it("formats a Date object", () => {
    const date = new Date("2026-06-01T09:00:00Z");
    const result = formatDate(date);
    expect(result).toContain("Jun");
    expect(result).toContain("2026");
  });

  it("includes time component", () => {
    const result = formatDate("2026-03-12T10:30:00Z");
    // Should contain hour and minute info (exact format varies by locale/tz)
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it("uses en-US locale with short month", () => {
    // Use midday UTC to avoid timezone-related date shifts
    const result = formatDate("2026-12-25T12:00:00Z");
    expect(result).toContain("Dec");
    expect(result).toContain("25");
    expect(result).toContain("2026");
  });
});
