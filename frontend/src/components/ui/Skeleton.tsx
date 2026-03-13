import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-[linear-gradient(90deg,var(--color-base-04)_25%,var(--color-base-08)_50%,var(--color-base-04)_75%)] bg-[length:200%_100%] animate-[shimmer_1.5s_ease_infinite]", className)}
      {...props}
    />
  )
}

export { Skeleton }
