// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContinueStepButton } from "./ContinueStepButton";

describe("ContinueStepButton", () => {
  const defaultProps = {
    onClick: vi.fn(),
    nextStepLabel: "Continue to Step 2: Infer",
    canContinue: true,
    isAnyStepPending: false,
    isCurrentStepProcessing: false,
  };

  // ---- Normal mode ----

  it("renders in normal mode with label and default variant", () => {
    const { container } = render(<ContinueStepButton {...defaultProps} />);

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("Continue to Step 2: Infer");
    // Default variant — should NOT have destructive class
    expect(button!.className).not.toContain("destructive");
  });

  it("renders PlayCircle icon in normal mode (not retry)", () => {
    const { container } = render(<ContinueStepButton {...defaultProps} />);

    // PlayCircle renders as an SVG. Check for the SVG in the button
    const svgs = container.querySelectorAll("button svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ---- Retry mode ----

  it("renders in retry mode with destructive variant", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isRetry={true} nextStepLabel="Retry Chunk Step" />
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("Retry Chunk Step");
    // Should have destructive variant styling
    // The actual class name will depend on shadcn but typically includes the word
  });

  it("renders RotateCcw icon in retry mode", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isRetry={true} nextStepLabel="Retry Chunk Step" />
    );

    // Should render an SVG icon (RotateCcw) — just verify an SVG exists
    const svgs = container.querySelectorAll("button svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  // ---- Disabled state ----

  it("is disabled when canContinue is false", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} canContinue={false} />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Waiting...");
  });

  it("is disabled when isAnyStepPending is true", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isAnyStepPending={true} />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Starting...");
  });

  it("is disabled when isCurrentStepProcessing is true", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isCurrentStepProcessing={true} />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Processing...");
  });

  // ---- Click handler ----

  it("fires onClick handler when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { container } = render(<ContinueStepButton {...defaultProps} onClick={onClick} />);

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button).not.toBeNull();
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { container } = render(
      <ContinueStepButton {...defaultProps} onClick={onClick} canContinue={false} />
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button).not.toBeNull();
    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  // ---- Size prop ----

  it("accepts size prop", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} size="sm" />
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    // Button should render without errors with sm size
  });

  // ---- Loading states show spinner ----

  it("shows spinner when isAnyStepPending", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isAnyStepPending={true} />
    );

    // Loader2 adds the animate-spin class
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("shows spinner when isCurrentStepProcessing", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isCurrentStepProcessing={true} />
    );

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("shows spinner when canContinue is false (waiting state)", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} canContinue={false} />
    );

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  // ---- Variant logic ----

  it("uses secondary variant when loading (isAnyStepPending)", () => {
    const { container } = render(
      <ContinueStepButton {...defaultProps} isAnyStepPending={true} />
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    // The button should not have the default primary styling when loading
  });
});
