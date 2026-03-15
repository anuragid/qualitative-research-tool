import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: LucideIcon
  heading: string
  description: string
  action?: React.ReactNode
  className?: string
}

function EmptyState({ icon: Icon, heading, description, action, className }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center text-center", className)}>
      <Icon className="h-12 w-12 text-text-placeholder mx-auto mb-4" />
      <h4 className="text-h4 text-text-primary mb-2">{heading}</h4>
      <p className="text-body-sm text-text-tertiary mb-6 max-w-md mx-auto text-center">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
