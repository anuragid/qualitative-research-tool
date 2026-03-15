import {
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Upload,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type VideoStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "analyzing"
  | "analyzed"
  | "error"
  | "paused"

interface StatusBadgeProps {
  status: VideoStatus
  className?: string
}

const statusConfig: Record<
  VideoStatus,
  {
    variant: "default" | "secondary" | "outline" | "destructive" | "success" | "warning"
    label: string
    icon: React.ComponentType<{ className?: string }>
    animate?: string
  }
> = {
  pending: {
    variant: "secondary",
    label: "Pending",
    icon: Clock,
  },
  uploading: {
    variant: "secondary",
    label: "Uploading...",
    icon: Upload,
    animate: "animate-pulse",
  },
  uploaded: {
    variant: "outline",
    label: "Uploaded",
    icon: CheckCircle,
  },
  transcribing: {
    variant: "secondary",
    label: "Transcribing...",
    icon: Loader2,
    animate: "animate-spin",
  },
  transcribed: {
    variant: "outline",
    label: "Transcribed",
    icon: CheckCircle,
  },
  analyzing: {
    variant: "default",
    label: "Analyzing...",
    icon: Loader2,
    animate: "animate-spin",
  },
  analyzed: {
    variant: "success",
    label: "Analyzed",
    icon: CheckCircle2,
  },
  error: {
    variant: "destructive",
    label: "Error",
    icon: AlertCircle,
  },
  paused: {
    variant: "warning",
    label: "Paused",
    icon: Pause,
  },
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge
      data-slot="status-badge"
      variant={config.variant}
      className={className}
    >
      <Icon className={cn("h-3 w-3", config.animate)} />
      {config.label}
    </Badge>
  )
}

export { StatusBadge }
export type { StatusBadgeProps, VideoStatus }
