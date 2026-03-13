import { Button } from "../ui/Button";
import { Loader2, PlayCircle } from "lucide-react";

interface ContinueStepButtonProps {
  onClick: () => void;
  nextStepLabel: string;
  canContinue: boolean;
  isAnyStepPending: boolean;
  isCurrentStepProcessing: boolean;
  size?: "sm" | "default" | "lg";
}

export function ContinueStepButton({
  onClick,
  nextStepLabel,
  canContinue,
  isAnyStepPending,
  isCurrentStepProcessing,
  size = "default",
}: ContinueStepButtonProps) {
  const isDisabled = !canContinue || isAnyStepPending || isCurrentStepProcessing;
  const isLoading = isAnyStepPending || isCurrentStepProcessing;

  return (
    <Button
      onClick={onClick}
      size={size}
      disabled={isDisabled}
      variant={isLoading ? "secondary" : "default"}
      className="rounded-full"
    >
      {isAnyStepPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Starting...
        </>
      ) : isCurrentStepProcessing ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : canContinue ? (
        <>
          <PlayCircle className="h-4 w-4 mr-2" />
          {nextStepLabel}
        </>
      ) : (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Waiting...
        </>
      )}
    </Button>
  );
}
