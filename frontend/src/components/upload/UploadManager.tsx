import { useState } from 'react';
import { useUploadContext } from '../../contexts/UploadContext';
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  RotateCw,
  Pause,
  Play,
  X,
  Clock,
  PauseCircle,
  XCircle,
  AlertTriangle,
  WifiOff,
  Server,
  FileX,
  HelpCircle,
  CheckCircle2,
  Circle,
  CircleDot
} from 'lucide-react';
import { Progress } from '../ui/progress';
import { ScrollArea } from '../ui/scroll-area';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui/alert-dialog';
import { formatFileSize } from '../../lib/utils';

export function UploadManager() {
  const {
    uploads,
    removeUpload,
    retryUpload,
    clearCompleted,
    cancelUpload,
    pauseUpload,
    resumeUpload,
    pauseAll,
    resumeAll,
    isPaused
  } = useUploadContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);

  if (uploads.length === 0) {
    return null;
  }

  const totalCount = uploads.length;
  const completedCount = uploads.filter(u => u.status === 'completed').length;
  const errorCount = uploads.filter(u => u.status === 'error').length;
  const pendingCount = uploads.filter(u => u.status === 'pending').length;
  const uploadingCount = uploads.filter(u => u.status === 'uploading').length;
  const processingCount = uploads.filter(u => u.status === 'processing').length;
  const pausedCount = uploads.filter(u => u.status === 'paused').length;
  const activeCount = uploadingCount + processingCount;

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return "0 MB/s";
    const mbps = bytesPerSecond / (1024 * 1024);
    return mbps >= 1
      ? `${mbps.toFixed(1)} MB/s`
      : `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  };

  const formatETA = (seconds: number): string => {
    if (seconds === Infinity || isNaN(seconds)) return "calculating...";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${minutes}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getErrorIcon = (errorType?: string) => {
    switch (errorType) {
      case 'network':
        return <WifiOff className="h-3 w-3 text-destructive flex-shrink-0" />;
      case 'timeout':
        return <Clock className="h-3 w-3 text-destructive flex-shrink-0" />;
      case 'server':
        return <Server className="h-3 w-3 text-destructive flex-shrink-0" />;
      case 'validation':
        return <FileX className="h-3 w-3 text-destructive flex-shrink-0" />;
      default:
        return <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />;
    }
  };

  const handleCancelClick = (uploadId: string) => {
    setConfirmingCancel(uploadId);
  };

  const confirmCancel = (uploadId: string) => {
    cancelUpload(uploadId);
    setConfirmingCancel(null);
  };

  const cancelConfirmation = () => {
    setConfirmingCancel(null);
  };

  // Determine header icon and message
  const getHeaderStatus = () => {
    if (isPaused) {
      return {
        icon: <PauseCircle className="h-4 w-4 text-warning" />,
        message: `Queue paused • ${pausedCount} file${pausedCount === 1 ? '' : 's'} waiting`
      };
    }
    if (activeCount > 0) {
      return {
        icon: <Loader2 className="h-4 w-4 text-info animate-spin" />,
        message: processingCount > 0
          ? `Processing ${processingCount} file${processingCount === 1 ? '' : 's'}`
          : `Uploading ${uploadingCount} of ${totalCount} files`
      };
    }
    if (pausedCount > 0) {
      return {
        icon: <PauseCircle className="h-4 w-4 text-warning" />,
        message: `${completedCount}/${totalCount} complete • ${pausedCount} paused`
      };
    }
    if (errorCount > 0 && completedCount === 0) {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
        message: `${errorCount} upload${errorCount === 1 ? '' : 's'} failed`
      };
    }
    if (errorCount > 0) {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-warning" />,
        message: `${completedCount} complete • ${errorCount} failed`
      };
    }
    return {
      icon: <CheckCircle2 className="h-4 w-4 text-success" />,
      message: `All ${completedCount} uploads complete`
    };
  };

  const headerStatus = getHeaderStatus();

  return (
    <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-50">
      {/* Header */}
      <div
        className="bg-card border border-border rounded-lg shadow-lg cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            {headerStatus.icon}
            <span className="text-sm font-medium">{headerStatus.message}</span>
          </div>
          <div className="flex items-center gap-2">
            {(activeCount > 0 || pausedCount > 0 || pendingCount > 0) && (
              <>
                {!isPaused ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      pauseAll();
                    }}
                    className="p-1 hover:bg-accent rounded transition-colors"
                    title="Pause all uploads"
                    aria-label="Pause all uploads"
                  >
                    <Pause className="h-4 w-4 text-text-tertiary" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      resumeAll();
                    }}
                    className="p-1 hover:bg-accent rounded transition-colors"
                    title="Resume all uploads"
                    aria-label="Resume all uploads"
                  >
                    <Play className="h-4 w-4 text-success" />
                  </button>
                )}
              </>
            )}
            {completedCount > 0 && activeCount === 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearCompleted();
                }}
                className="text-xs text-text-tertiary hover:text-foreground/80 transition-colors"
              >
                Clear
              </button>
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-text-tertiary" />
            ) : (
              <ChevronUp className="h-4 w-4 text-text-tertiary" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <ScrollArea className="mt-2 bg-card border border-border rounded-lg shadow-lg max-h-96">
          {/* Summary Bar */}
          {(pendingCount > 0 || activeCount > 0 || pausedCount > 0) && (
            <div className="p-2 border-b border-border bg-interactive-fill text-xs text-text-tertiary">
              <div className="flex items-center gap-3">
                {uploadingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <CircleDot className="h-3 w-3 text-info" />
                    Uploading: {uploadingCount}
                  </span>
                )}
                {processingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 text-chart-3 animate-spin" />
                    Processing: {processingCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Circle className="h-3 w-3 text-text-tertiary" />
                    Waiting: {pendingCount}
                  </span>
                )}
                {pausedCount > 0 && (
                  <span className="flex items-center gap-1">
                    <PauseCircle className="h-3 w-3 text-warning" />
                    Paused: {pausedCount}
                  </span>
                )}
              </div>
              {isPaused && (
                <div className="mt-1 text-warning font-medium">
                  Queue paused - click play to resume
                </div>
              )}
            </div>
          )}

          <div className="p-3 space-y-2">
            {uploads.map((upload, index) => {
              const queuePosition = upload.status === 'pending'
                ? uploads.slice(0, index).filter(u => u.status === 'pending').length + 1
                : 0;

              // Determine visual state styling
              const getUploadStyles = () => {
                switch (upload.status) {
                  case 'completed':
                    return 'border-success/30 bg-success/5';
                  case 'uploading':
                    return 'border-info/30 bg-info/5 shadow-sm';
                  case 'processing':
                    return 'border-chart-3/30 bg-chart-3/5 shadow-sm animate-pulse';
                  case 'paused':
                    return 'border-warning/30 bg-warning/5 ring-2 ring-warning/20';
                  case 'error':
                    return 'border-destructive/30 bg-destructive/5';
                  case 'cancelled':
                    return 'border-border bg-interactive-fill/50 opacity-60';
                  case 'pending':
                    return 'border-border bg-card';
                  default:
                    return 'border-border bg-card';
                }
              };

              const uploadStyles = getUploadStyles();

              return (
                <div
                  key={upload.id}
                  className={`relative flex items-start gap-2 p-2 rounded-lg border transition-all duration-200 ${uploadStyles}`}
                >
                  {/* Confirmation dialog */}
                  <AlertDialog
                    open={confirmingCancel === upload.id}
                    onOpenChange={(open) => { if (!open) cancelConfirmation(); }}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Cancel this upload?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Progress will be lost and cannot be recovered.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => confirmCancel(upload.id)}
                        >
                          Cancel Upload
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div className="flex-1 min-w-0">
                    {/* File name and status */}
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-medium truncate text-foreground">
                        {upload.file.name}
                      </p>
                      {upload.status === 'completed' && (
                        <CheckCircle2 className="h-3 w-3 text-success flex-shrink-0" />
                      )}
                      {upload.status === 'error' && getErrorIcon(upload.errorType)}
                      {upload.status === 'uploading' && (
                        <CircleDot className="h-3 w-3 text-info flex-shrink-0" />
                      )}
                      {upload.status === 'processing' && (
                        <Loader2 className="h-3 w-3 text-chart-3 animate-spin flex-shrink-0" />
                      )}
                      {upload.status === 'paused' && (
                        <PauseCircle className="h-3 w-3 text-warning flex-shrink-0" />
                      )}
                      {upload.status === 'cancelled' && (
                        <XCircle className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                      )}
                      {upload.status === 'pending' && (
                        <Clock className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                      )}
                    </div>

                    {/* Project name and status details */}
                    <p className="text-xs text-text-tertiary truncate">
                      {upload.projectName}
                      {upload.status === 'pending' && queuePosition > 0 && (
                        <span className="text-text-tertiary"> • Position {queuePosition} in queue</span>
                      )}
                      {upload.status === 'paused' && upload.pausedProgress !== undefined && upload.pausedProgress > 0 && (
                        <span className="text-warning font-medium"> • Ready to resume ({Math.round(upload.pausedProgress)}% uploaded)</span>
                      )}
                      {upload.status === 'processing' && (
                        <span className="text-chart-3 font-medium"> • {upload.processingMessage || 'Processing on server...'}</span>
                      )}
                      {upload.status === 'cancelled' && (
                        <span className="text-text-tertiary"> • Cancelled by user</span>
                      )}
                      {upload.status === 'completed' && (
                        <span className="text-success"> • Upload complete</span>
                      )}
                    </p>

                    {/* Upload progress details */}
                    {upload.status === 'uploading' && upload.uploadedBytes && (
                      <>
                        <p className="text-xs text-text-tertiary">
                          {formatFileSize(upload.uploadedBytes)} / {formatFileSize(upload.file.size)}
                          {upload.uploadSpeed && upload.uploadSpeed > 0 && (
                            <> • {formatSpeed(upload.uploadSpeed)}</>
                          )}
                        </p>
                        <Progress
                          value={upload.progress}
                          className="mt-1 h-1.5"
                        />
                        {upload.eta && upload.eta !== Infinity && (
                          <p className="text-xs text-text-tertiary mt-1">
                            ~{formatETA(upload.eta)} remaining
                          </p>
                        )}
                      </>
                    )}

                    {/* Processing progress */}
                    {upload.status === 'processing' && (
                      <>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-chart-3/30">
                          <div
                            className="h-full bg-chart-3 animate-pulse rounded-full transition-all duration-300"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <p className="text-xs text-chart-3 mt-1">
                          Server is processing your video...
                        </p>
                      </>
                    )}

                    {/* Error details */}
                    {upload.status === 'error' && upload.error && (
                      <div className="mt-1">
                        <p className="text-xs text-destructive font-medium">{upload.error}</p>
                        <p className="text-xs text-destructive mt-1">
                          {upload.errorType === 'network' && "Check your connection and try again"}
                          {upload.errorType === 'timeout' && "Try uploading a smaller file"}
                          {upload.errorType === 'server' && "Wait a moment and retry"}
                          {upload.errorType === 'validation' && "Check file requirements"}
                          {upload.errorType === 'unknown' && "Click retry or contact support"}
                        </p>
                      </div>
                    )}

                    {/* Paused progress */}
                    {upload.status === 'paused' && upload.pausedProgress && upload.pausedProgress > 0 && (
                      <>
                        <p className="text-xs text-text-tertiary">
                          {upload.pausedUploadedBytes ? formatFileSize(upload.pausedUploadedBytes) : '0 Bytes'} / {formatFileSize(upload.file.size)}
                        </p>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-warning/30">
                          <div
                            className="h-full bg-warning rounded-full transition-all duration-300"
                            style={{ width: `${upload.pausedProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-warning mt-1">
                          Click play to continue • Upload will restart from beginning
                        </p>
                      </>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    {/* Pause button for uploading/pending */}
                    {upload.status === 'uploading' && (
                      <button
                        onClick={() => pauseUpload(upload.id)}
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title="Pause upload"
                        aria-label="Pause upload"
                      >
                        <Pause className="h-3.5 w-3.5 text-text-tertiary group-hover:text-warning" />
                      </button>
                    )}

                    {/* Resume button for paused */}
                    {upload.status === 'paused' && (
                      <button
                        onClick={() => resumeUpload(upload.id)}
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title="Resume upload"
                        aria-label="Resume upload"
                      >
                        <Play className="h-3.5 w-3.5 text-success group-hover:text-success/80" />
                      </button>
                    )}

                    {/* Cancel button for active uploads */}
                    {(upload.status === 'uploading' || upload.status === 'pending') && (
                      <button
                        onClick={() => handleCancelClick(upload.id)}
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title="Cancel upload permanently"
                        aria-label="Cancel upload"
                      >
                        <X className="h-3.5 w-3.5 text-text-tertiary group-hover:text-destructive" />
                      </button>
                    )}

                    {/* Cancel button for paused uploads */}
                    {upload.status === 'paused' && (
                      <button
                        onClick={() => handleCancelClick(upload.id)}
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title="Cancel upload permanently"
                        aria-label="Cancel upload"
                      >
                        <X className="h-3.5 w-3.5 text-text-tertiary group-hover:text-destructive" />
                      </button>
                    )}

                    {/* Retry button for errors */}
                    {upload.status === 'error' && (
                      <button
                        onClick={() => retryUpload(upload.id)}
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title="Retry upload"
                        aria-label="Retry upload"
                      >
                        <RotateCw className="h-3.5 w-3.5 text-warning group-hover:text-warning/80" />
                      </button>
                    )}

                    {/* Remove button for completed/cancelled/error */}
                    {(upload.status === 'completed' || upload.status === 'cancelled' || upload.status === 'error') && (
                      <button
                        onClick={() => removeUpload(upload.id)}
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title="Remove from list"
                        aria-label="Remove from list"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-text-tertiary group-hover:text-text-tertiary" />
                      </button>
                    )}

                    {/* Help icon for errors */}
                    {upload.status === 'error' && (
                      <button
                        className="p-2.5 min-h-[var(--size-touch)] min-w-[var(--size-touch)] flex items-center justify-center hover:bg-card/60 rounded transition-colors group"
                        title={`Error type: ${upload.errorType || 'unknown'}`}
                        aria-label="Error information"
                      >
                        <HelpCircle className="h-3.5 w-3.5 text-text-tertiary group-hover:text-text-tertiary" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}