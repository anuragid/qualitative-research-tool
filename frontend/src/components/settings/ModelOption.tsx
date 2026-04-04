import { cn } from "@/lib/utils";

interface ModelOptionProps {
  name: string;
  provider: string;
  isFree: boolean;
  contextLength?: number | null;
  className?: string;
}

export function ModelOption({
  name,
  provider,
  isFree,
  contextLength,
  className,
}: ModelOptionProps) {
  const formattedContext = contextLength
    ? `${Math.round(contextLength / 1000)}k`
    : null;

  return (
    <div className={cn("flex flex-col gap-0.5 py-0.5", className)}>
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-text-tertiary">
        {provider}
        {formattedContext && (
          <>
            <span className="mx-1.5 text-border">&middot;</span>
            {formattedContext} ctx
          </>
        )}
        {isFree && (
          <>
            <span className="mx-1.5 text-border">&middot;</span>
            <span className="text-success">Free</span>
          </>
        )}
      </span>
    </div>
  );
}
