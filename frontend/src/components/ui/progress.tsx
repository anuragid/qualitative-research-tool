import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const isIndeterminate = value === undefined || value === null

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-interactive-fill",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full flex-1 bg-interactive-focus",
          isIndeterminate
            ? "w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]"
            : "w-full transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)]"
        )}
        style={
          isIndeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
