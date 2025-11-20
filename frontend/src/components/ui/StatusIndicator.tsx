import React from "react";
import { Badge } from "./Badge";
import { SimpleTooltip } from "./Tooltip";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  PlayCircle,
  PauseCircle,
  Loader2,
  Upload,
  FileText,
  AlertTriangle,
  XCircle,
  Archive,
  CircleDot
} from "lucide-react";
import { cn } from "../../lib/utils";

// Standardized status types across the application
export type AppStatus =
  | "idle"
  | "pending"
  | "processing"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "completed"
  | "success"
  | "error"
  | "cancelled"
  | "paused"
  | "archived"
  | "warning";

interface StatusConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
  animated?: boolean;
}

const statusConfigs: Record<AppStatus, StatusConfig> = {
  idle: {
    label: "Idle",
    icon: CircleDot,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    description: "Waiting to start",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    description: "Queued for processing",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "Currently being processed",
    animated: true,
  },
  uploading: {
    label: "Uploading",
    icon: Upload,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    description: "File is being uploaded",
    animated: true,
  },
  transcribing: {
    label: "Transcribing",
    icon: FileText,
    color: "text-purple-600",
    bgColor: "bg-purple-100",
    description: "Generating transcript from audio",
    animated: true,
  },
  analyzing: {
    label: "Analyzing",
    icon: Loader2,
    color: "text-indigo-600",
    bgColor: "bg-indigo-100",
    description: "AI is analyzing content",
    animated: true,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-100",
    description: "Successfully completed",
  },
  success: {
    label: "Success",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-100",
    description: "Operation successful",
  },
  error: {
    label: "Error",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-100",
    description: "An error occurred",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
    description: "Operation was cancelled",
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    description: "Operation is paused",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    description: "Item has been archived",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    description: "Requires attention",
  },
};

interface StatusIndicatorProps {
  status: AppStatus;
  label?: string;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "badge" | "inline" | "dot";
  className?: string;
  showTooltip?: boolean;
  customDescription?: string;
}

export function StatusIndicator({
  status,
  label,
  showIcon = true,
  showLabel = true,
  size = "md",
  variant = "badge",
  className,
  showTooltip = true,
  customDescription,
}: StatusIndicatorProps) {
  const config = statusConfigs[status] || statusConfigs.idle;
  const Icon = config.icon;
  const displayLabel = label || config.label;
  const description = customDescription || config.description;

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const content = () => {
    switch (variant) {
      case "dot":
        return (
          <div className={cn("flex items-center gap-2", sizeClasses[size], className)}>
            <span className={cn(
              "inline-block rounded-full",
              size === "sm" ? "h-2 w-2" : size === "md" ? "h-3 w-3" : "h-4 w-4",
              config.bgColor,
              config.animated && "animate-pulse"
            )} />
            {showLabel && <span className={config.color}>{displayLabel}</span>}
          </div>
        );

      case "inline":
        return (
          <div className={cn("flex items-center gap-1.5", sizeClasses[size], className)}>
            {showIcon && (
              <Icon className={cn(
                iconSizes[size],
                config.color,
                config.animated && "animate-spin"
              )} />
            )}
            {showLabel && <span className={config.color}>{displayLabel}</span>}
          </div>
        );

      case "badge":
      default:
        return (
          <Badge className={cn(
            "flex items-center gap-1.5",
            config.bgColor,
            config.color,
            sizeClasses[size],
            className
          )}>
            {showIcon && (
              <Icon className={cn(
                iconSizes[size],
                config.animated && "animate-spin"
              )} />
            )}
            {showLabel && displayLabel}
          </Badge>
        );
    }
  };

  if (showTooltip) {
    return (
      <SimpleTooltip content={description}>
        <div className="inline-block">
          {content()}
        </div>
      </SimpleTooltip>
    );
  }

  return content();
}

// Project-specific status indicator
export function ProjectStatusIndicator({ status }: { status: string }) {
  const statusMap: Record<string, AppStatus> = {
    planning: "idle",
    ready: "pending",
    processing: "processing",
    completed: "completed",
    archived: "archived",
    error: "error",
  };

  return (
    <StatusIndicator
      status={statusMap[status] || "idle"}
      label={status}
      showTooltip={true}
    />
  );
}

// Video-specific status indicator
export function VideoStatusIndicator({ status }: { status: string }) {
  const statusMap: Record<string, AppStatus> = {
    uploaded: "success",
    transcribing: "transcribing",
    transcribed: "completed",
    analyzing: "analyzing",
    completed: "completed",
    error: "error",
  };

  return (
    <StatusIndicator
      status={statusMap[status] || "idle"}
      label={status}
      showTooltip={true}
    />
  );
}

// Upload-specific status indicator
export function UploadStatusIndicator({ status }: { status: string }) {
  const statusMap: Record<string, AppStatus> = {
    pending: "pending",
    uploading: "uploading",
    processing: "processing",
    completed: "completed",
    error: "error",
    cancelled: "cancelled",
    paused: "paused",
  };

  return (
    <StatusIndicator
      status={statusMap[status] || "idle"}
      label={status}
      size="sm"
      showTooltip={true}
    />
  );
}