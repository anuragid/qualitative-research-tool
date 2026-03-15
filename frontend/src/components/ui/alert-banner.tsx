import * as React from "react"
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react"

import { cn } from "@/lib/utils"

interface AlertBannerProps {
  variant: "error" | "warning" | "info" | "success"
  title?: string
  children: React.ReactNode
  action?: React.ReactNode
  onDismiss?: () => void
  className?: string
}

const variantConfig = {
  error: {
    containerClass: "bg-destructive-subtle border border-destructive/20",
    icon: AlertCircle,
    iconClass: "text-destructive",
  },
  warning: {
    containerClass: "bg-warning-subtle border border-warning/20",
    icon: AlertTriangle,
    iconClass: "text-warning",
  },
  info: {
    containerClass: "bg-info-subtle border border-interactive-focus/20",
    icon: Info,
    iconClass: "text-interactive-focus",
  },
  success: {
    containerClass: "bg-success-subtle border border-success/20",
    icon: CheckCircle,
    iconClass: "text-success",
  },
} as const

function AlertBanner({
  variant,
  title,
  children,
  action,
  onDismiss,
  className,
}: AlertBannerProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      data-slot="alert-banner"
      data-variant={variant}
      role="alert"
      className={cn("rounded-2xl p-4 relative", config.containerClass, className)}
    >
      <div className="flex gap-3">
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", config.iconClass)} />
        <div className="flex-1 min-w-0">
          {title && (
            <p className="text-ui font-medium text-text-primary mb-1">{title}</p>
          )}
          <div className="text-body-sm text-text-secondary">{children}</div>
          {action && <div className="mt-3">{action}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-md p-1 text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

export { AlertBanner }
export type { AlertBannerProps }
