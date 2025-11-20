import React from "react";
import { Progress } from "./Progress";
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { cn } from "../../lib/utils";

interface ProgressIndicatorProps {
  value?: number;
  status: "idle" | "loading" | "processing" | "success" | "error";
  message?: string;
  subMessage?: string;
  showPercentage?: boolean;
  estimatedTime?: number; // in seconds
  className?: string;
}

export function ProgressIndicator({
  value = 0,
  status,
  message,
  subMessage,
  showPercentage = true,
  estimatedTime,
  className,
}: ProgressIndicatorProps) {
  const getStatusIcon = () => {
    switch (status) {
      case "loading":
      case "processing":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "loading":
      case "processing":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className={cn("font-medium", getStatusColor())}>
            {message || "Processing..."}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          {estimatedTime && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{formatTime(estimatedTime)}</span>
            </div>
          )}
          {showPercentage && value > 0 && (
            <span className="font-medium">{Math.round(value)}%</span>
          )}
        </div>
      </div>

      {(status === "loading" || status === "processing") && (
        <Progress value={value} className="h-2" />
      )}

      {subMessage && (
        <p className="text-sm text-gray-500">{subMessage}</p>
      )}
    </div>
  );
}

// Specific progress indicator for uploads
interface UploadProgressProps {
  fileName: string;
  progress: number;
  uploadedBytes?: number;
  totalBytes?: number;
  uploadSpeed?: number;
  eta?: number;
  status: "pending" | "uploading" | "processing" | "completed" | "error" | "paused";
  error?: string;
}

export function UploadProgress({
  fileName,
  progress,
  uploadedBytes = 0,
  totalBytes = 0,
  uploadSpeed = 0,
  eta = 0,
  status,
  error,
}: UploadProgressProps) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + "/s";
  };

  const getStatusMessage = () => {
    switch (status) {
      case "pending":
        return "Waiting to upload...";
      case "uploading":
        return "Uploading...";
      case "processing":
        return "Processing on server...";
      case "completed":
        return "Upload complete!";
      case "error":
        return error || "Upload failed";
      case "paused":
        return "Upload paused";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">{fileName}</p>
          <p className="text-xs text-gray-500">{getStatusMessage()}</p>
        </div>
        <span className="text-sm font-medium">{Math.round(progress)}%</span>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
        </span>
        <div className="flex items-center gap-3">
          {uploadSpeed > 0 && <span>{formatSpeed(uploadSpeed)}</span>}
          {eta > 0 && eta !== Infinity && (
            <span>ETA: {Math.ceil(eta)}s</span>
          )}
        </div>
      </div>
    </div>
  );
}