import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"

interface BackLinkProps {
  to: string
  children: React.ReactNode
  className?: string
}

function BackLink({ to, children, className }: BackLinkProps) {
  return (
    <Link
      to={to}
      data-slot="back-link"
      className={cn(
        "inline-flex items-center gap-1.5 text-body-sm text-text-tertiary hover:text-text-primary transition-colors",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      {children}
    </Link>
  )
}

export { BackLink }
export type { BackLinkProps }
