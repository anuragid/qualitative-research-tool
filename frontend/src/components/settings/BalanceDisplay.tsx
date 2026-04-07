import { RefreshCw } from "lucide-react";
import { AlertBanner } from "../ui/alert-banner";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { BalanceInfo } from "../../types";

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/settings/credits";
const DEFAULT_LOW_THRESHOLD_USD = 0.5;

interface BalanceDisplayProps {
  balance: BalanceInfo | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Threshold in USD below which the balance is shown as a yellow warning. */
  lowThresholdUsd?: number;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatRelativeMinutes(checkedAt: string): string {
  const checked = new Date(checkedAt).getTime();
  if (Number.isNaN(checked)) return "moments ago";
  const diffMs = Date.now() - checked;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));
  if (diffMinutes < 1) return "moments ago";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}

/**
 * Displays the user's OpenRouter balance with refresh + top-up CTAs.
 *
 * Renders different visual states for healthy / low-balance / no-credits.
 * Returns `null` for non-BYOK users (when `balance` is `null`) so callers
 * can render this component unconditionally.
 *
 * Source contract: `docs/byok-balance-contract.md`.
 */
export function BalanceDisplay({
  balance,
  onRefresh,
  isRefreshing = false,
  lowThresholdUsd = DEFAULT_LOW_THRESHOLD_USD,
}: BalanceDisplayProps) {
  if (balance == null) return null;

  const remaining = balance.balance_remaining;
  const total = balance.total_credits;
  const isEmpty = !balance.has_credits || remaining <= 0;
  const isLow = !isEmpty && remaining < lowThresholdUsd;

  const remainingLabel = `${formatUsd(remaining)} of ${formatUsd(total)} remaining`;
  const staleSubtitle = balance.stale
    ? `Last checked ${formatRelativeMinutes(balance.checked_at)}`
    : null;

  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={isRefreshing}
      className="gap-1.5"
      aria-label="Refresh balance"
    >
      <RefreshCw
        className={isRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
      />
      Refresh
    </Button>
  );

  const freeTierPill = balance.is_free_tier ? (
    <Badge variant="secondary" className="ml-2">
      Free tier
    </Badge>
  ) : null;

  if (isEmpty) {
    return (
      <AlertBanner
        variant="error"
        title="No credits remaining"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a
                href={OPENROUTER_CREDITS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Add credits on OpenRouter
              </a>
            </Button>
            {refreshButton}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{remainingLabel}</span>
          {freeTierPill}
        </div>
        {staleSubtitle && (
          <p className="mt-1 text-xs text-text-tertiary">{staleSubtitle}</p>
        )}
      </AlertBanner>
    );
  }

  if (isLow) {
    return (
      <AlertBanner
        variant="warning"
        title="Low balance"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={OPENROUTER_CREDITS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ui font-medium text-warning underline underline-offset-2 hover:opacity-80"
            >
              Top up
            </a>
            {refreshButton}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{remainingLabel}</span>
          {freeTierPill}
        </div>
        {staleSubtitle && (
          <p className="mt-1 text-xs text-text-tertiary">{staleSubtitle}</p>
        )}
      </AlertBanner>
    );
  }

  // Healthy state — compact inline row, no banner.
  return (
    <div
      data-slot="balance-display"
      data-variant="healthy"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span
          aria-hidden="true"
          className="inline-block size-2 rounded-full bg-brand-forest"
        />
        <span className="font-medium text-text-primary">{remainingLabel}</span>
        {freeTierPill}
        {staleSubtitle && (
          <span className="text-xs text-text-tertiary">
            &middot; {staleSubtitle}
          </span>
        )}
      </div>
      {refreshButton}
    </div>
  );
}
