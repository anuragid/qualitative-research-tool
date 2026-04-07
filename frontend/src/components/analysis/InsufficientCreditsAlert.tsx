import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import { AlertBanner } from "../ui/alert-banner";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import type { BalanceInfo } from "../../types";

const OPENROUTER_CREDITS_URL = "https://openrouter.ai/settings/credits";
const AUTO_REFRESH_INTERVAL_MS = 30_000;
const RETRY_COOLDOWN_MS = 10_000;
const DEFAULT_BODY =
  "Your OpenRouter key has no remaining credits. Add credits to continue the analysis from where it left off.";

/** Stable display order for the 5 video-analysis steps. */
const STEP_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "chunk", label: "Chunks" },
  { key: "infer", label: "Inferences" },
  { key: "relate", label: "Relate" },
  { key: "explain", label: "Explain" },
  { key: "activate", label: "Activate" },
];

interface InsufficientCreditsAlertProps {
  /** Human-readable error message from the backend; falls back to a default. */
  errorMessage: string;
  /** `video_analysis.step_status` JSON: { chunk: "completed", infer: "error", ... } */
  stepStatus?: Record<string, string>;
  /** Which step the pipeline was working on when it failed. */
  currentStep?: string;
  /** ID of the video the alert relates to (used for keying / future analytics). */
  videoId: string;
  /**
   * Force-refresh the balance from upstream. Returns the fresh `BalanceInfo`
   * (or `null` if the user has no BYOK key configured).
   */
  onRefreshBalance: () => Promise<BalanceInfo | null>;
  /** Re-trigger the failed step. Caller owns the actual API call. */
  onRetry: () => Promise<void>;
}

interface StepStatusItemProps {
  label: string;
  status: "completed" | "error" | "pending" | "processing" | "unknown";
}

function StepStatusItem({ label, status }: StepStatusItemProps) {
  let Icon = Circle;
  let iconClass = "text-text-tertiary";
  let labelClass = "text-text-tertiary";
  let aria = `${label}: pending`;

  if (status === "completed") {
    Icon = Check;
    iconClass = "text-brand-forest";
    labelClass = "text-text-primary";
    aria = `${label}: completed`;
  } else if (status === "error") {
    Icon = X;
    iconClass = "text-destructive";
    labelClass = "text-destructive font-medium";
    aria = `${label}: failed`;
  } else if (status === "processing") {
    Icon = Loader2;
    iconClass = "text-text-secondary animate-spin";
    labelClass = "text-text-secondary";
    aria = `${label}: processing`;
  }

  return (
    <li
      className="inline-flex items-center gap-1.5 text-xs"
      aria-label={aria}
    >
      <Icon className={cn("size-3.5", iconClass)} aria-hidden="true" />
      <span className={labelClass}>{label}</span>
    </li>
  );
}

/**
 * Banner shown when an analysis pipeline halts with `error_type:
 * "insufficient_credits"` (HTTP 402 from OpenRouter). Provides:
 *
 *  - Per-step status of where the pipeline got to
 *  - "Add credits on OpenRouter" deep link
 *  - "I've added credits — check and retry" button that refreshes balance
 *    and only retries when credits are confirmed
 *  - Background polling every 30s while mounted (no auto-retry — explicit
 *    click is still required to resume)
 *
 * Source contract: `docs/byok-balance-contract.md` step 5.
 */
export function InsufficientCreditsAlert({
  errorMessage,
  stepStatus,
  currentStep,
  videoId,
  onRefreshBalance,
  onRetry,
}: InsufficientCreditsAlertProps) {
  const [retryDisabled, setRetryDisabled] = useState(false);
  const [showStillNoCredits, setShowStillNoCredits] = useState(false);
  const [isCheckingRetry, setIsCheckingRetry] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-refresh balance every 30s while mounted. Does NOT auto-retry —
  // we still require an explicit user click to resume the pipeline.
  useEffect(() => {
    const interval = setInterval(() => {
      void onRefreshBalance().catch(() => {
        // Swallow errors — the periodic refresh is best-effort. The next
        // tick will retry, and the user can also click the manual button.
      });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [onRefreshBalance]);

  // Clear any pending cooldown timer on unmount.
  useEffect(() => {
    return () => {
      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    };
  }, []);

  const startCooldown = useCallback(() => {
    setRetryDisabled(true);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => {
      setRetryDisabled(false);
      cooldownTimer.current = null;
    }, RETRY_COOLDOWN_MS);
  }, []);

  const handleCheckAndRetry = useCallback(async () => {
    if (retryDisabled || isCheckingRetry) return;
    setIsCheckingRetry(true);
    setShowStillNoCredits(false);
    try {
      const fresh = await onRefreshBalance();
      if (fresh && fresh.has_credits) {
        await onRetry();
      } else {
        setShowStillNoCredits(true);
        startCooldown();
      }
    } catch {
      // On refresh failure, treat it as "still don't see credits" so the
      // user gets a clear message instead of a silent no-op.
      setShowStillNoCredits(true);
      startCooldown();
    } finally {
      setIsCheckingRetry(false);
    }
  }, [
    isCheckingRetry,
    onRefreshBalance,
    onRetry,
    retryDisabled,
    startCooldown,
  ]);

  const body = errorMessage && errorMessage.trim().length > 0
    ? errorMessage
    : DEFAULT_BODY;

  const renderStepStatus = () => {
    if (!stepStatus) return null;
    return (
      <ul
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
        aria-label="Analysis step status"
      >
        {STEP_ORDER.map((step) => {
          const raw = stepStatus[step.key];
          const isCurrent = currentStep === step.key;
          let normalized: StepStatusItemProps["status"];
          if (raw === "completed") normalized = "completed";
          else if (raw === "error") normalized = "error";
          else if (raw === "processing") normalized = "processing";
          else if (raw === "pending") normalized = "pending";
          else normalized = isCurrent ? "error" : "unknown";
          return (
            <StepStatusItem
              key={step.key}
              label={step.label}
              status={normalized}
            />
          );
        })}
      </ul>
    );
  };

  return (
    <AlertBanner
      variant="error"
      title="Your OpenRouter credits ran out"
      data-video-id={videoId}
      action={
        <div className="flex flex-col gap-2">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCheckAndRetry}
              disabled={retryDisabled || isCheckingRetry}
            >
              {isCheckingRetry ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Checking...
                </>
              ) : (
                "I've added credits — check and retry"
              )}
            </Button>
          </div>
          {showStillNoCredits && (
            <p
              role="status"
              className="text-xs text-destructive"
            >
              We still don&apos;t see credits on your key. Refresh again or
              check your OpenRouter account.
            </p>
          )}
        </div>
      }
    >
      <p>{body}</p>
      {renderStepStatus()}
    </AlertBanner>
  );
}
