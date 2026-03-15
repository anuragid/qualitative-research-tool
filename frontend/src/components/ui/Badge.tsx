import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center text-label rounded-sm px-2 py-0.5 transition-[color,background] duration-[var(--duration-micro)] ease-[var(--ease)] focus:outline-none focus-visible:outline-2 focus-visible:outline-accent-blue focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-base-04 text-base-62",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-border text-base-62",
        success: "bg-brand-forest text-primary-foreground",
        warning: "bg-brand-mustard text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
