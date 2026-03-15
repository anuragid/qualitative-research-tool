import { cn } from "@/lib/utils"

interface DataFieldProps {
  label: string
  children: React.ReactNode
  className?: string
}

function DataField({ label, children, className }: DataFieldProps) {
  return (
    <div data-slot="data-field" className={cn(className)}>
      <span className="text-label text-text-placeholder uppercase tracking-wider mb-1.5 block">
        {label}
      </span>
      <div className="text-body-sm text-text-primary">{children}</div>
    </div>
  )
}

export { DataField }
export type { DataFieldProps }
