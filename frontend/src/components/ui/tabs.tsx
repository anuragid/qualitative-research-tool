import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit items-center gap-0.5 rounded-lg bg-interactive-fill p-0.5 overflow-x-auto max-w-full scrollbar-hide",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap text-ui font-medium text-text-placeholder rounded-control px-3 py-1.5 transition-[color,background,box-shadow,opacity] duration-[var(--duration-micro)] ease-[var(--ease-standard)] focus-visible:outline-2 focus-visible:outline-interactive-focus focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:font-semibold data-[state=active]:text-white data-[state=active]:bg-brand-accent data-[state=active]:shadow-subtle [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "mt-4 flex-1 outline-none focus-visible:outline-2 focus-visible:outline-interactive-focus focus-visible:outline-offset-2",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
