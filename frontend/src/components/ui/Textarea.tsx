import * as React from "react";
import { cn } from "../../lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-20 w-full rounded-lg border border-border bg-card px-3 py-3 text-base resize-y transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease)] placeholder:text-base-40 focus-visible:outline-none focus-visible:border-accent-blue focus-visible:ring-[2px] focus-visible:ring-accent-blue-bg disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
