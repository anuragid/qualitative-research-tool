import { useCallback, useState } from 'react';
import { useUploadContext, type FileUploadStatus } from '../../contexts/UploadContext';
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
  CheckCircle2,
  Circle,
  CircleDot,
  Flag,
  Check,
} from 'lucide-react';
import * as Sentry from '@sentry/react';
import { usePostHog } from '@posthog/react';
import { toast } from 'sonner';
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
  const [reportedIds, setReportedIds] = useState<Set<string>>(() => new Set());
  const posthog = usePostHog();

  const handleReportIssue = useCallback((upload: FileUploadStatus) => {
    // Don't double-report the same row
    if (reportedIds.has(upload.id)) return;

    const reportPayload = {
      file_name: upload.file.name,
      file_size_bytes: upload.file.size,
      file_type: upload.file.type || 'unknown',
      project_id: upload.projectId,
      project_name: upload.projectName,
      error_type: upload.errorType ?? 'unknown',
      error_message: upload.error ?? '(no message)',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };

    // Sentry: surfaces in triage dashboard with full context. Use captureMessage
    // (not captureException) because we don't have a live Error stack at report
    // time — we have post-hoc metadata. Tag user_reported=true so triage can
    // distinguish user-flagged reports from background auto-capture.
    Sentry.captureMessage(
      `Upload error reported by user: ${upload.errorType ?? 'unknown'}`,
      {
        level: 'error',
        tags: {
          feature: 'upload',
          error_type: upload.errorType ?? 'unknown',
          user_reported: 'true',
        },
        extra: reportPayload,
      }
    );

    // PostHog: product analytics signal — which errors users care enough to flag
    posthog?.capture('media_upload_error_reported', reportPayload);

    setReportedIds(prev => new Set(prev).add(upload.id));

    toast.success('Report sent', {
      description: 'Thanks — our team will take a look.',
    });
  }, [posthog, reportedIds]);

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
        className="bg-surface-card border border-border rounded-2xl shadow-popup cursor-pointer transition-colors hover:bg-interactive-fill/40"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {headerStatus.icon}
            <span className="text-sm font-medium text-foreground truncate">{headerStatus.message}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {(activeCount > 0 || pausedCount > 0 || pendingCount > 0) && (
              <>
                {!isPaused ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      pauseAll();
                    }}
                    className="p-1.5 rounded-md hover:bg-interactive-hover transition-colors"
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
                    className="p-1.5 rounded-md hover:bg-interactive-hover transition-colors"
                    title="Resume all uploads"
                    aria-label="Resume all uploads"
                  >
                    <Play className="h-4 w-4 text-text-tertiary" />
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
                className="px-2 py-1 text-xs text-text-tertiary hover:text-foreground rounded-md hover:bg-interactive-hover transition-colors"
              >
                Clear
              </button>
            )}
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-text-tertiary ml-0.5" />
            ) : (
              <ChevronUp className="h-4 w-4 text-text-tertiary ml-0.5" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <ScrollArea className="mt-2 bg-surface-card border border-border rounded-2xl shadow-popup max-h-96">
          {/* Summary Bar */}
          {(pendingCount > 0 || activeCount > 0 || pausedCount > 0) && (
            <div className="px-4 py-2.5 border-b border-border text-xs text-text-tertiary">
              <div className="flex items-center gap-4">
                {uploadingCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <CircleDot className="h-3 w-3 text-info" />
                    Uploading {uploadingCount}
                  </span>
                )}
                {processingCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 text-info animate-spin" />
                    Processing {processingCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Circle className="h-3 w-3 text-text-tertiary" />
                    Waiting {pendingCount}
                  </span>
                )}
                {pausedCount > 0 && (
                  <span className="flex items-center gap-1.5">
                    <PauseCircle className="h-3 w-3 text-warning" />
                    Paused {pausedCount}
                  </span>
                )}
              </div>
              {isPaused && (
                <div className="mt-1.5 text-warning">
                  Queue paused — click play to resume
                </div>
              )}
            </div>
          )}

          <div className="py-1">
            {uploads.map((upload, index) => {
              const queuePosition = upload.status === 'pending'
                ? uploads.slice(0, index).filter(u => u.status === 'pending').length + 1
                : 0;

              const isCancelled = upload.status === 'cancelled';

              return (
                <div
                  key={upload.id}
                  className={`relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-interactive-fill/60 ${isCancelled ? 'opacity-60' : ''}`}
                >
                  {/* Status icon — single source of state, monochrome unless meaningful */}
                  <div className="mt-0.5 shrink-0">
                    {upload.status === 'uploading' && (
                      <CircleDot className="h-3.5 w-3.5 text-info" />
                    )}
                    {upload.status === 'processing' && (
                      <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />
                    )}
                    {upload.status === 'paused' && (
                      <PauseCircle className="h-3.5 w-3.5 text-warning" />
                    )}
                    {upload.status === 'completed' && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    )}
                    {upload.status === 'error' && getErrorIcon(upload.errorType)}
                    {upload.status === 'pending' && (
                      <Clock className="h-3.5 w-3.5 text-text-tertiary" />
                    )}
                    {upload.status === 'cancelled' && (
                      <XCircle className="h-3.5 w-3.5 text-text-tertiary" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* File name */}
                    <p className="text-sm font-medium truncate text-foreground">
                      {upload.file.name}
                    </p>

                    {/* Secondary line: project + status detail */}
                    <p className="text-xs text-text-tertiary truncate mt-0.5">
                      {upload.projectName}
                      {upload.status === 'pending' && queuePosition > 0 && (
                        <span> · Position {queuePosition} in queue</span>
                      )}
                      {upload.status === 'paused' && upload.pausedProgress !== undefined && upload.pausedProgress > 0 && (
                        <span> · Paused at {Math.round(upload.pausedProgress)}%</span>
                      )}
                      {upload.status === 'processing' && (
                        <span> · {upload.processingMessage || 'Processing on server'}</span>
                      )}
                      {upload.status === 'cancelled' && (
                        <span> · Cancelled</span>
                      )}
                      {upload.status === 'completed' && (
                        <span> · Complete</span>
                      )}
                    </p>

                    {/* Upload progress */}
                    {upload.status === 'uploading' && upload.uploadedBytes && (
                      <div className="mt-2">
                        <Progress
                          value={upload.progress}
                          className="h-1"
                        />
                        <p className="text-xs text-text-tertiary mt-1.5">
                          {formatFileSize(upload.uploadedBytes)} / {formatFileSize(upload.file.size)}
                          {upload.uploadSpeed && upload.uploadSpeed > 0 && (
                            <> · {formatSpeed(upload.uploadSpeed)}</>
                          )}
                          {upload.eta && upload.eta !== Infinity && (
                            <> · ~{formatETA(upload.eta)} remaining</>
                          )}
                        </p>
                      </div>
                    )}

                    {/* Processing progress (indeterminate) */}
                    {upload.status === 'processing' && (
                      <div className="mt-2">
                        <Progress className="h-1" />
                      </div>
                    )}

                    {/* Paused progress */}
                    {upload.status === 'paused' && upload.pausedProgress && upload.pausedProgress > 0 && (
                      <div className="mt-2">
                        <Progress value={upload.pausedProgress} className="h-1" />
                        <p className="text-xs text-text-tertiary mt-1.5">
                          {upload.pausedUploadedBytes ? formatFileSize(upload.pausedUploadedBytes) : '0 B'} / {formatFileSize(upload.file.size)} · resume restarts from beginning
                        </p>
                      </div>
                    )}

                    {/* Error details */}
                    {upload.status === 'error' && upload.error && (
                      <p className="text-xs text-destructive mt-1.5">
                        {upload.error}
                        {upload.errorType === 'network' && ' — check your connection and retry'}
                        {upload.errorType === 'timeout' && ' — try a smaller file'}
                        {upload.errorType === 'server' && ' — wait a moment and retry'}
                        {upload.errorType === 'validation' && ' — check file requirements'}
                        {(!upload.errorType || upload.errorType === 'unknown') && ' — try retry, or report this issue'}
                      </p>
                    )}
                  </div>

                  {/* Action buttons. All buttons use the design-system --size-touch
                      (44px) for invisible-padding hit areas, so they're reliable to
                      click even though the visible icon is just 14px. Color cues on
                      hover communicate intent: pause → warning, resume → success,
                      retry → warning, cancel → destructive, report → info. */}
                  <div className="flex items-center gap-0.5 shrink-0 -mr-2">
                    {/* Pause button for uploading */}
                    {upload.status === 'uploading' && (
                      <button
                        onClick={() => pauseUpload(upload.id)}
                        className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] inline-flex items-center justify-center rounded-md hover:bg-interactive-hover transition-colors group"
                        title="Pause upload"
                        aria-label="Pause upload"
                      >
                        <Pause className="h-3.5 w-3.5 text-text-tertiary group-hover:text-warning transition-colors" />
                      </button>
                    )}

                    {/* Resume button for paused — static green so it's distinct from pause */}
                    {upload.status === 'paused' && (
                      <button
                        onClick={() => resumeUpload(upload.id)}
                        className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] inline-flex items-center justify-center rounded-md hover:bg-interactive-hover transition-colors group"
                        title="Resume upload"
                        aria-label="Resume upload"
                      >
                        <Play className="h-3.5 w-3.5 text-success group-hover:text-success transition-colors" />
                      </button>
                    )}

                    {/* Cancel button for active or paused uploads */}
                    {(upload.status === 'uploading' || upload.status === 'pending' || upload.status === 'paused') && (
                      <button
                        onClick={() => handleCancelClick(upload.id)}
                        className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] inline-flex items-center justify-center rounded-md hover:bg-interactive-hover transition-colors group"
                        title="Cancel upload"
                        aria-label="Cancel upload"
                      >
                        <X className="h-3.5 w-3.5 text-text-tertiary group-hover:text-destructive transition-colors" />
                      </button>
                    )}

                    {/* Retry button for errors */}
                    {upload.status === 'error' && (
                      <button
                        onClick={() => retryUpload(upload.id)}
                        className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] inline-flex items-center justify-center rounded-md hover:bg-interactive-hover transition-colors group"
                        title="Retry upload"
                        aria-label="Retry upload"
                      >
                        <RotateCw className="h-3.5 w-3.5 text-text-tertiary group-hover:text-warning transition-colors" />
                      </button>
                    )}

                    {/* Report button for errors — sends a Sentry event + PostHog signal */}
                    {upload.status === 'error' && (
                      <button
                        onClick={() => handleReportIssue(upload)}
                        disabled={reportedIds.has(upload.id)}
                        className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] inline-flex items-center justify-center rounded-md hover:bg-interactive-hover transition-colors group disabled:opacity-60 disabled:cursor-default"
                        title={reportedIds.has(upload.id) ? 'Report sent' : 'Report this issue'}
                        aria-label={reportedIds.has(upload.id) ? 'Report sent' : 'Report this issue'}
                      >
                        {reportedIds.has(upload.id) ? (
                          <Check className="h-3.5 w-3.5 text-success transition-colors" />
                        ) : (
                          <Flag className="h-3.5 w-3.5 text-text-tertiary group-hover:text-info transition-colors" />
                        )}
                      </button>
                    )}

                    {/* Remove button for completed/cancelled/error */}
                    {(upload.status === 'completed' || upload.status === 'cancelled' || upload.status === 'error') && (
                      <button
                        onClick={() => removeUpload(upload.id)}
                        className="min-h-[var(--size-touch)] min-w-[var(--size-touch)] inline-flex items-center justify-center rounded-md hover:bg-interactive-hover transition-colors group"
                        title="Remove from list"
                        aria-label="Remove from list"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-text-tertiary group-hover:text-foreground transition-colors" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Cancel confirmation — a SINGLE dialog hoisted out of the row loop.
          Previously this was mounted inside every row, which caused the retry
          button to become unclickable: if the user clicked Cancel on an uploading
          row that then transitioned to 'error', the dialog's overlay (z=90) was
          still rendered above the widget (z=50), blocking clicks on the new
          retry button. Hoisting it + deriving `open` from the current status
          means a state transition naturally closes the dialog. */}
      {(() => {
        const cancellingUpload = confirmingCancel
          ? uploads.find(u =>
              u.id === confirmingCancel &&
              (u.status === 'uploading' || u.status === 'pending' || u.status === 'paused')
            )
          : undefined;
        return (
          <AlertDialog
            open={!!cancellingUpload}
            onOpenChange={(open) => { if (!open) setConfirmingCancel(null); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this upload?</AlertDialogTitle>
                <AlertDialogDescription>
                  {cancellingUpload
                    ? `Progress on ${cancellingUpload.file.name} will be lost and cannot be recovered.`
                    : 'Progress will be lost and cannot be recovered.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => { if (cancellingUpload) confirmCancel(cancellingUpload.id); }}
                >
                  Cancel Upload
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
}