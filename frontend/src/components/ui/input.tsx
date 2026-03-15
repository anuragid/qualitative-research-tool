import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-base transition-[color,background,border-color] duration-[var(--duration-micro)] ease-[var(--ease-standard)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-placeholder focus-visible:outline-none focus-visible:border-interactive-focus focus-visible:ring-[var(--ring-width)] focus-visible:ring-interactive-focus-bg disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
