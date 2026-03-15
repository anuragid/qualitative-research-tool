import * as React from "react"

import { cn } from "@/lib/utils"
import { BackLink } from "@/components/ui/back-link"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  badge?: React.ReactNode
  backLink?: { to: string; label: string }
  className?: string
}

function PageHeader({
  title,
  description,
  actions,
  badge,
  backLink,
  className,
}: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn("space-y-1", className)}>
      {backLink && (
        <div className="mb-3">
          <BackLink to={backLink.to}>{backLink.label}</BackLink>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-h2 text-text-primary">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="text-body-sm text-text-tertiary mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export { PageHeader }
export type { PageHeaderProps }
