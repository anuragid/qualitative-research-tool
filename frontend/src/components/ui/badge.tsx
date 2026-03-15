import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 text-label whitespace-nowrap transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease-standard)] focus:outline-none focus-visible:outline-2 focus-visible:outline-interactive-focus focus-visible:outline-offset-2 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-interactive-fill text-text-secondary [a&]:hover:bg-interactive-hover",
        destructive:
          "bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-text-secondary [a&]:hover:bg-interactive-fill",
        success:
          "bg-brand-forest text-primary-foreground [a&]:hover:bg-brand-forest/90",
        warning:
          "bg-brand-mustard text-primary-foreground [a&]:hover:bg-brand-mustard/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
