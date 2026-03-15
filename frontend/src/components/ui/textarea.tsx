import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-border bg-card px-3 py-3 text-base resize-y transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease-standard)] placeholder:text-text-placeholder focus-visible:outline-none focus-visible:border-interactive-focus focus-visible:ring-[var(--ring-width)] focus-visible:ring-interactive-focus-bg disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
