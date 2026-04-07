import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsufficientCreditsAlert } from "../InsufficientCreditsAlert";
import type { BalanceInfo } from "../../../types";

function makeBalance(overrides: Partial<BalanceInfo> = {}): BalanceInfo {
  return {
    total_credits: 10,
    total_usage: 10,
    balance_remaining: 0,
    is_free_tier: false,
    key_label: "sk-or-v1-abc...xyz",
    key_limit: null,
    key_limit_remaining: null,
    has_credits: false,
    checked_at: new Date().toISOString(),
    stale: false,
    ...overrides,
  };
}

const defaultProps = {
  errorMessage:
    "Your OpenRouter key has no remaining credits. Add credits to continue.",
  videoId: "video-1",
  currentStep: "relate",
  stepStatus: {
    chunk: "completed",
    infer: "completed",
    relate: "error",
    explain: "pending",
    activate: "pending",
  },
};

describe("InsufficientCreditsAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the title and the provided error message body", () => {
    const { container } = render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={vi.fn().mockResolvedValue(null)}
        onRetry={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const banner = container.querySelector('[data-variant="error"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("Your OpenRouter credits ran out");
    expect(banner!.textContent).toContain(defaultProps.errorMessage);
  });

  it("falls back to a default body when errorMessage is empty", () => {
    const { container } = render(
      <InsufficientCreditsAlert
        {...defaultProps}
        errorMessage=""
        onRefreshBalance={vi.fn().mockResolvedValue(null)}
        onRetry={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const banner = container.querySelector('[data-variant="error"]');
    expect(banner!.textContent).toContain(
      "Your OpenRouter key has no remaining credits",
    );
  });

  it("renders completed/error/pending step indicators from stepStatus", () => {
    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={vi.fn().mockResolvedValue(null)}
        onRetry={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    // The 5 step labels should all appear
    expect(screen.getByText(/chunks/i)).toBeDefined();
    expect(screen.getByText(/inferences/i)).toBeDefined();
    expect(screen.getByText(/relate/i)).toBeDefined();
    expect(screen.getByText(/explain/i)).toBeDefined();
    expect(screen.getByText(/activate/i)).toBeDefined();
  });

  it("primary CTA links to OpenRouter credits in a new tab with rel=noopener", () => {
    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={vi.fn().mockResolvedValue(null)}
        onRetry={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const link = screen.getByRole("link", {
      name: /add credits on openrouter/i,
    }) as HTMLAnchorElement;
    expect(link.href).toBe("https://openrouter.ai/settings/credits");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("retry button calls onRetry when refresh shows credits", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(
      makeBalance({ has_credits: true, balance_remaining: 5 }),
    );
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={onRefresh}
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByRole("button", {
      name: /i.?ve added credits/i,
    });
    await user.click(retryButton);

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    await waitFor(() => expect(onRetry).toHaveBeenCalled());
  });

  it("does NOT call onRetry when refresh still shows no credits, shows inline message, disables button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    const onRefresh = vi.fn().mockResolvedValue(
      makeBalance({ has_credits: false, balance_remaining: 0 }),
    );
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={onRefresh}
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByRole("button", {
      name: /i.?ve added credits/i,
    }) as HTMLButtonElement;
    await user.click(retryButton);

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(onRetry).not.toHaveBeenCalled();

    // Inline "still no credits" message
    await waitFor(() => {
      expect(
        screen.getByText(/still don.?t see credits/i),
      ).toBeDefined();
    });

    // Button should be disabled
    expect(retryButton.disabled).toBe(true);
  });

  it("re-enables retry button after a 10-second cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    const onRefresh = vi.fn().mockResolvedValue(
      makeBalance({ has_credits: false }),
    );
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={onRefresh}
        onRetry={onRetry}
      />,
    );

    const retryButton = screen.getByRole("button", {
      name: /i.?ve added credits/i,
    }) as HTMLButtonElement;
    await user.click(retryButton);

    await waitFor(() => expect(retryButton.disabled).toBe(true));

    // Advance 10s — cooldown should clear
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await waitFor(() => expect(retryButton.disabled).toBe(false));
  });

  it("auto-refreshes balance every 30s while mounted", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(
      makeBalance({ has_credits: false }),
    );
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={onRefresh}
        onRetry={onRetry}
      />,
    );

    expect(onRefresh).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it("does NOT auto-call onRetry even if auto-refresh detects credits", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(
      makeBalance({ has_credits: true, balance_remaining: 5 }),
    );
    const onRetry = vi.fn().mockResolvedValue(undefined);

    render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={onRefresh}
        onRetry={onRetry}
      />,
    );

    // Advance timers to trigger the 30s interval, then flush microtasks so
    // any awaited promise inside the interval handler resolves before we
    // assert. We use explicit Promise.resolve flushes to avoid `waitFor`
    // (which doesn't play nicely with fake timers).
    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("cleans up the auto-refresh interval on unmount", async () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn().mockResolvedValue(
      makeBalance({ has_credits: false }),
    );
    const onRetry = vi.fn().mockResolvedValue(undefined);

    const { unmount } = render(
      <InsufficientCreditsAlert
        {...defaultProps}
        onRefreshBalance={onRefresh}
        onRetry={onRetry}
      />,
    );

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
