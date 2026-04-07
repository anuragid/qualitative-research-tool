import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        // Two overrides on top of Radix's defaults:
        //  1. `[&>div]:!block` overrides Radix's inline `display: table` on the inner
        //     wrapper so children inherit the viewport width (lets `truncate` / `min-w-0`
        //     work and stops long unbreakable text from blowing out the panel width).
        //  2. `max-h-[inherit]` makes the viewport inherit the Root's max-height so a
        //     consumer using `max-h-*` on the ScrollArea actually caps the viewport,
        //     not just the visual outer box. Without this, `size-full` (height: 100%)
        //     can't resolve against an indefinite parent height and the viewport
        //     collapses to its content height — content overflows the rounded panel
        //     and the scrollbar never engages.
        className="size-full max-h-[inherit] rounded-[inherit] [&>div]:!block"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors duration-[var(--duration-normal)] ease-[var(--ease-standard)] select-none",
        orientation === "vertical" && "h-full w-2",
        orientation === "horizontal" && "h-2 flex-col",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-interactive-hover"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
