import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface MetadataItem {
  label?: string
  value: React.ReactNode
  icon?: LucideIcon
}

interface MetadataRowProps {
  items: MetadataItem[]
  separator?: string
  className?: string
}

function MetadataRow({ items, separator = "\u00B7", className }: MetadataRowProps) {
  return (
    <div data-slot="metadata-row" className={cn("inline-flex items-center gap-2 text-body-sm text-text-tertiary", className)}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span className="text-text-disabled">{separator}</span>
          )}
          <span className="inline-flex items-center gap-1">
            {item.icon && <item.icon className="h-3.5 w-3.5" />}
            {item.label && (
              <span className="text-text-placeholder">{item.label}:</span>
            )}
            {item.value}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}

export { MetadataRow }
export type { MetadataRowProps, MetadataItem }
