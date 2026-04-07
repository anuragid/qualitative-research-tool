import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BalanceDisplay } from "../BalanceDisplay";
import type { BalanceInfo } from "../../../types";

function makeBalance(overrides: Partial<BalanceInfo> = {}): BalanceInfo {
  return {
    total_credits: 10,
    total_usage: 2.75,
    balance_remaining: 7.25,
    is_free_tier: false,
    key_label: "sk-or-v1-abc...xyz",
    key_limit: null,
    key_limit_remaining: null,
    has_credits: true,
    checked_at: new Date().toISOString(),
    stale: false,
    ...overrides,
  };
}

describe("BalanceDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when balance is null", () => {
    const { container } = render(
      <BalanceDisplay balance={null} onRefresh={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows formatted remaining and total credits in healthy state", () => {
    render(
      <BalanceDisplay
        balance={makeBalance({
          total_credits: 10,
          total_usage: 2.75,
          balance_remaining: 7.25,
          has_credits: true,
        })}
        onRefresh={vi.fn()}
      />,
    );

    // Healthy: shows "$7.25 of $10.00 remaining"
    expect(screen.getByText(/\$7\.25/)).toBeDefined();
    expect(screen.getByText(/of \$10\.00/)).toBeDefined();
    expect(screen.getByText(/remaining/i)).toBeDefined();
  });

  it("shows yellow warning + Top up link when balance is below threshold", () => {
    const { container } = render(
      <BalanceDisplay
        balance={makeBalance({
          total_credits: 5,
          total_usage: 4.7,
          balance_remaining: 0.3,
          has_credits: true,
        })}
        onRefresh={vi.fn()}
        lowThresholdUsd={0.5}
      />,
    );

    // Yellow/warning banner is rendered
    const warning = container.querySelector('[data-variant="warning"]');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain("$0.30");

    // Top up link
    const links = container.querySelectorAll("a");
    const topUp = Array.from(links).find((a) =>
      a.textContent?.toLowerCase().includes("top up"),
    );
    expect(topUp).toBeDefined();
    expect((topUp as HTMLAnchorElement).href).toBe(
      "https://openrouter.ai/settings/credits",
    );
    expect(topUp!.getAttribute("target")).toBe("_blank");
    expect(topUp!.getAttribute("rel")).toContain("noopener");
  });

  it("shows red banner + Add credits button when has_credits is false", () => {
    const { container } = render(
      <BalanceDisplay
        balance={makeBalance({
          total_credits: 10,
          total_usage: 10,
          balance_remaining: 0,
          has_credits: false,
        })}
        onRefresh={vi.fn()}
      />,
    );

    const error = container.querySelector('[data-variant="error"]');
    expect(error).not.toBeNull();
    expect(error!.textContent).toMatch(/no credits/i);

    // Add credits CTA
    const links = container.querySelectorAll("a");
    const addCredits = Array.from(links).find((a) =>
      a.textContent?.toLowerCase().includes("add credits"),
    );
    expect(addCredits).toBeDefined();
    expect((addCredits as HTMLAnchorElement).href).toBe(
      "https://openrouter.ai/settings/credits",
    );
    expect(addCredits!.getAttribute("target")).toBe("_blank");
    expect(addCredits!.getAttribute("rel")).toContain("noopener");
  });

  it("treats balance_remaining <= 0 as no-credits even when has_credits flag is stale-true", () => {
    // Defense-in-depth: if backend has_credits is somehow misreported,
    // a non-positive balance is still a no-credits state.
    const { container } = render(
      <BalanceDisplay
        balance={makeBalance({
          balance_remaining: 0,
          has_credits: true,
        })}
        onRefresh={vi.fn()}
      />,
    );
    const error = container.querySelector('[data-variant="error"]');
    expect(error).not.toBeNull();
  });

  it("shows 'Last checked N minutes ago' subtitle when stale", () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    render(
      <BalanceDisplay
        balance={makeBalance({
          stale: true,
          checked_at: tenMinutesAgo,
        })}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText(/last checked/i)).toBeDefined();
    expect(screen.getByText(/10 minutes? ago/i)).toBeDefined();
  });

  it("shows 'Free tier' pill when is_free_tier is true", () => {
    render(
      <BalanceDisplay
        balance={makeBalance({ is_free_tier: true })}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText(/free tier/i)).toBeDefined();
  });

  it("calls onRefresh when refresh button clicked", async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(
      <BalanceDisplay balance={makeBalance()} onRefresh={onRefresh} />,
    );

    const refreshBtn = screen.getByRole("button", { name: /refresh/i });
    await user.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("disables refresh button while isRefreshing is true", () => {
    render(
      <BalanceDisplay
        balance={makeBalance()}
        onRefresh={vi.fn()}
        isRefreshing
      />,
    );

    const refreshBtn = screen.getByRole("button", {
      name: /refresh/i,
    }) as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);
  });

  it("uses default $0.50 threshold when lowThresholdUsd not provided", () => {
    const { container } = render(
      <BalanceDisplay
        balance={makeBalance({
          total_credits: 5,
          total_usage: 4.6,
          balance_remaining: 0.4,
          has_credits: true,
        })}
        onRefresh={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-variant="warning"]')).not.toBeNull();
  });
});
