import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

interface LoadingStateProps {
  message?: string
  size?: "sm" | "default" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "h-4 w-4",
  default: "h-8 w-8",
  lg: "h-12 w-12",
} as const

function LoadingState({ message, size = "default", className }: LoadingStateProps) {
  return (
    <div data-slot="loading-state" className={cn("flex flex-col items-center justify-center", className)}>
      <Loader2 className={cn("animate-spin text-text-placeholder", sizeClasses[size])} />
      {message && (
        <p className="text-body-sm text-text-tertiary mt-3">{message}</p>
      )}
    </div>
  )
}

export { LoadingState }
export type { LoadingStateProps }
