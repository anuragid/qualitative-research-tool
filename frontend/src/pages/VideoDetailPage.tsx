import React, { useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useVideo, useVideoPlaybackUrl } from "../hooks/useVideos";
import { useTranscript, useSpeakerLabels, useStartTranscription, useLabelSpeaker } from "../hooks/useTranscriptions";
import {
  useVideoAnalysis,
  useVideoAnalysisStatus,
  useStartFullAnalysis,
  useStartChunkStep,
  useStartInferStep,
  useStartRelateStep,
  useStartExplainStep,
  useStartActivateStep
} from "../hooks/useAnalysis";
import Layout from "../components/Layout";
import { useProject } from "../hooks/useProjects";
import { formatFileSize } from "../lib/utils";
import { useAnalysisDisplay } from "../components/analysis/hooks/useAnalysisDisplay";
import { MediaPlayerSection } from "../components/videos/MediaPlayerSection";
import { TranscriptSidePanel } from "../components/videos/TranscriptSidePanel";
import { AnalysisSection } from "../components/analysis/AnalysisSection";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { BackLink } from "../components/ui/back-link";
import { StatusBadge } from "../components/ui/status-badge";
import type { VideoStatus } from "../components/ui/status-badge";
import { MetadataRow } from "../components/ui/metadata-row";
import { LoadingState } from "../components/ui/loading-state";
import { AlertBanner } from "../components/ui/alert-banner";
import { EmptyState } from "../components/ui/empty-state";
import {
  Loader2,
  FileText,
  Play,
  AlertCircle,
  Clock,
  Wifi,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { parseErrorMessage, getErrorTypeLabel } from "../lib/parseError";
import type { ParsedError } from "../lib/parseError";

function getErrorIcon(errorType?: ParsedError["errorType"]) {
  switch (errorType) {
    case "timeout": return Clock;
    case "network": return Wifi;
    case "rate_limit": return Clock;
    default: return AlertCircle;
  }
}

export default function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { data: video, isLoading: videoLoading } = useVideo(videoId || null);
  const { data: playbackUrl } = useVideoPlaybackUrl(videoId || null);
  const { data: transcript, isLoading: transcriptLoading } = useTranscript(videoId || null);
  const { data: speakerLabels } = useSpeakerLabels(transcript?.id || null);
  const analysisStatus = useVideoAnalysisStatus(videoId || null);
  const { data: analysis, isLoading: analysisLoading } = useVideoAnalysis(videoId || null);
  const { data: project } = useProject(video?.project_id || null);
  const queryClient = useQueryClient();

  // When lightweight status endpoint reports "completed" but full analysis hasn't caught up, refetch full data
  useEffect(() => {
    if (analysisStatus.data?.status === "completed" && analysis?.status !== "completed") {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
    }
  }, [analysisStatus.data?.status, analysis?.status, videoId, queryClient]);

  // When analysis status transitions to "error", refetch full analysis and video to get error details
  const prevAnalysisStatusRef = useRef(analysisStatus.data?.status);
  useEffect(() => {
    const currentStatus = analysisStatus.data?.status;
    if (prevAnalysisStatusRef.current !== "error" && currentStatus === "error") {
      queryClient.invalidateQueries({ queryKey: ["videos", videoId, "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["videos", videoId] });
    }
    prevAnalysisStatusRef.current = currentStatus;
  }, [analysisStatus.data?.status, videoId, queryClient]);

  const startTranscription = useStartTranscription();
  const startFullAnalysis = useStartFullAnalysis();
  const labelSpeaker = useLabelSpeaker();

  // Step-by-step analysis hooks
  const startChunkStep = useStartChunkStep();
  const startInferStep = useStartInferStep();
  const startRelateStep = useStartRelateStep();
  const startExplainStep = useStartExplainStep();
  const startActivateStep = useStartActivateStep();

  // Speaker label editing state
  const [editingSpeaker, setEditingSpeaker] = React.useState<string | null>(null);
  const [speakerName, setSpeakerName] = React.useState("");
  const [speakerRole, setSpeakerRole] = React.useState("");

  // Transcript panel state — default open when transcript exists
  const [isTranscriptOpen, setIsTranscriptOpen] = React.useState(true);

  // Active tab state for step-by-step mode
  const [activeStepTab, setActiveStepTab] = React.useState("chunks");

  // Analysis display state (view mode, sort, filter, search) per tab
  const chunksDisplay = useAnalysisDisplay("chunks");
  const inferencesDisplay = useAnalysisDisplay("inferences");
  const patternsDisplay = useAnalysisDisplay("patterns");
  const insightsDisplay = useAnalysisDisplay("insights");
  const principlesDisplay = useAnalysisDisplay("principles");

  const handleStartTranscription = () => {
    if (videoId) {
      startTranscription.mutate(videoId);
    }
  };

  const handleStartFullAnalysis = () => {
    if (videoId) {
      startFullAnalysis.mutate(videoId);
    }
  };

  // Step-by-step analysis handlers
  const handleStartChunkStep = () => {
    if (videoId) {
      startChunkStep.mutate(videoId);
    }
  };

  const handleStartInferStep = () => {
    if (videoId) {
      setActiveStepTab("inferences");
      startInferStep.mutate(videoId);
    }
  };

  const handleStartRelateStep = () => {
    if (videoId) {
      setActiveStepTab("patterns");
      startRelateStep.mutate(videoId);
    }
  };

  const handleStartExplainStep = () => {
    if (videoId) {
      setActiveStepTab("insights");
      startExplainStep.mutate(videoId);
    }
  };

  const handleStartActivateStep = () => {
    if (videoId) {
      setActiveStepTab("principles");
      startActivateStep.mutate(videoId);
    }
  };

  const handleLabelSpeaker = (speakerLabel: string, name: string, role?: string) => {
    if (transcript?.id) {
      labelSpeaker.mutate({
        transcriptId: transcript.id,
        videoId: videoId!,
        data: { speaker_label: speakerLabel, assigned_name: name, role },
      });
    }
  };

  // Validation functions for workflow prerequisites — memoized to avoid
  // creating new array/object references on every render.
  const uniqueSpeakers = useMemo(() => {
    if (!transcript?.processed_transcript?.utterances) return [];
    return Array.from(
      new Set(transcript.processed_transcript.utterances.map((u) => u.speaker))
    );
  }, [transcript?.processed_transcript?.utterances]);

  const hasRoleAssignments = useMemo(() => {
    if (uniqueSpeakers.length === 0) return false;
    return uniqueSpeakers.every(speaker => {
      const label = speakerLabels?.find((l) => l.speaker_label === speaker);
      const role = label?.role?.toLowerCase();
      return role === "interviewer" || role === "participant";
    });
  }, [uniqueSpeakers, speakerLabels]);

  const hasInterviewerAndParticipant = useMemo(() => {
    if (!speakerLabels || speakerLabels.length === 0) return false;
    const hasInterviewer = speakerLabels.some(label => label.role?.toLowerCase() === "interviewer");
    const hasParticipant = speakerLabels.some(label => label.role?.toLowerCase() === "participant");
    return hasInterviewer && hasParticipant;
  }, [speakerLabels]);

  const canAnalysisStart = useMemo(() => {
    // Allow starting analysis if transcript is ready (including from error state where transcript completed)
    const transcriptReady = video?.status === "transcribed"
      || (transcript && transcript.status === "completed")
      || (video?.status === "error" && transcript && transcript.status === "completed");
    return !!(transcriptReady && hasRoleAssignments && hasInterviewerAndParticipant);
  }, [video?.status, transcript, hasRoleAssignments, hasInterviewerAndParticipant]);

  const workflowBlockerMessage = useMemo(() => {
    if (!transcript || transcript.status !== "completed") {
      return null;
    }
    if (!hasRoleAssignments) {
      return "Please assign roles to all speakers before starting analysis.";
    }
    if (!hasInterviewerAndParticipant) {
      return "You must have at least one Interviewer and one Participant assigned.";
    }
    return null;
  }, [transcript, hasRoleAssignments, hasInterviewerAndParticipant]);

  if (videoLoading) {
    return (
      <Layout>
        <LoadingState message="Loading video details..." className="min-h-screen py-12" />
      </Layout>
    );
  }

  if (!video) {
    return (
      <Layout>
        <EmptyState
          icon={AlertCircle}
          heading="File Not Found"
          description="The file you're looking for doesn't exist or has been removed."
          action={
            <Link to="/projects">
              <Button>Go to Projects</Button>
            </Link>
          }
          className="min-h-screen py-12"
        />
      </Layout>
    );
  }

  const canStartTranscription = video.status === "uploaded" && !transcript;
  const canRetryTranscription = video.status === "error" && !transcript;
  const canRetryAnalysis = video.status === "error" && !!transcript && (!analysis || analysis.status === "error");
  const parsedError = parseErrorMessage(video.error_message);

  // Step information for step-by-step mode
  const getStepInfo = () => {
    if (!analysis || !analysis.current_step) return null;

    const currentStepStatus = analysis.step_status?.[analysis.current_step];
    const hasError = currentStepStatus === "error";

    const stepMap: Record<string, { name: string; number: number; nextStep: string | null; handler: () => void }> = {
      chunk: { name: "Chunk", number: 1, nextStep: "infer", handler: hasError ? handleStartChunkStep : handleStartInferStep },
      infer: { name: "Infer", number: 2, nextStep: "relate", handler: hasError ? handleStartInferStep : handleStartRelateStep },
      relate: { name: "Relate", number: 3, nextStep: "explain", handler: hasError ? handleStartRelateStep : handleStartExplainStep },
      explain: { name: "Explain", number: 4, nextStep: "activate", handler: hasError ? handleStartExplainStep : handleStartActivateStep },
      activate: { name: "Activate", number: 5, nextStep: null, handler: () => {} },
    };

    return stepMap[analysis.current_step] || null;
  };

  const stepInfo = getStepInfo();

  const canContinueCurrentStep = () => {
    if (!analysis || !analysis.current_step) return false;
    const currentStepStatus = analysis.step_status?.[analysis.current_step];
    if (currentStepStatus === "error") return true;
    switch (analysis.current_step) {
      case "chunk": return !!analysis.chunks;
      case "infer": return !!analysis.inferences;
      case "relate": return !!analysis.patterns;
      case "explain": return !!analysis.insights;
      case "activate": return false;
      default: return false;
    }
  };

  const isAnyStepPending =
    startInferStep.isPending ||
    startRelateStep.isPending ||
    startExplainStep.isPending ||
    startActivateStep.isPending;

  const isCurrentStepProcessing = Boolean(
    analysis?.current_step && analysis?.step_status?.[analysis.current_step] === "processing"
  );

  const getNextStepLabel = (step: string) => {
    const currentStepStatus = analysis?.step_status?.[analysis?.current_step || ""];
    const hasError = currentStepStatus === "error";

    if (hasError) {
      const retryLabels: Record<string, string> = {
        chunk: "Retry Chunk Step",
        infer: "Retry Infer Step",
        relate: "Retry Relate Step",
        explain: "Retry Explain Step",
        activate: "Retry Activate Step",
      };
      return retryLabels[analysis?.current_step || ""] || "Retry Step";
    }

    const continueLabels: Record<string, string> = {
      infer: "Continue to Infer",
      relate: "Continue to Relate",
      explain: "Continue to Explain",
      activate: "Continue to Activate",
    };
    return continueLabels[step] || "Continue to Next Step";
  };

  return (
    <Layout>
      <div className="min-h-screen bg-surface-page">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {/* Breadcrumb / Back Navigation */}
          <BackLink to={`/projects/${video.project_id}`}>
            {project?.name ? `Back to ${project.name}` : "Back to Project"}
          </BackLink>

          {/* Page Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-h3 sm:text-h2 text-foreground truncate">{video.filename}</h1>
              <MetadataRow
                className="mt-2"
                separator="|"
                items={[
                  { value: formatFileSize(video.file_size_bytes) },
                  ...(video.duration_seconds
                    ? [{ value: `${Math.floor(video.duration_seconds / 60)}:${(video.duration_seconds % 60).toString().padStart(2, '0')}` }]
                    : []),
                  { value: new Date(video.uploaded_at).toLocaleDateString() },
                ]}
              />
            </div>
            <StatusBadge status={video.status as VideoStatus} />
          </div>

          {/* Error message with structured display and retry buttons */}
          {video.error_message && parsedError && (() => {
            const ErrorIcon = getErrorIcon(parsedError.errorType);
            return (
              <AlertBanner
                variant="error"
                title={parsedError.step
                  ? `${getErrorTypeLabel(parsedError.errorType)} — ${parsedError.step} step`
                  : getErrorTypeLabel(parsedError.errorType)
                }
                action={
                  parsedError.retryable && (canRetryTranscription || canRetryAnalysis) ? (
                    <div className="flex items-center gap-2">
                      {canRetryTranscription && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleStartTranscription}
                          disabled={startTranscription.isPending}
                          className="rounded-full gap-1.5"
                        >
                          {startTranscription.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          Retry Transcription
                        </Button>
                      )}
                      {canRetryAnalysis && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleStartFullAnalysis}
                          disabled={startFullAnalysis.isPending}
                          className="rounded-full gap-1.5"
                        >
                          {startFullAnalysis.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          Retry Analysis
                        </Button>
                      )}
                    </div>
                  ) : undefined
                }
              >
                <div className="flex items-start gap-2">
                  {parsedError.errorType !== "unknown" && (
                    <ErrorIcon className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />
                  )}
                  <span className="break-all">{parsedError.message}</span>
                </div>
              </AlertBanner>
            );
          })()}

          {/* Progress indicator for ongoing tasks */}
          {(video.status === "transcribing" || video.status === "analyzing") && (
            <div className="bg-card rounded-2xl shadow-card p-4 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-text-tertiary overflow-x-auto">
                <Clock className="h-4 w-4" />
                <span>
                  {video.status === "transcribing"
                    ? "Transcription in progress..."
                    : "Running 5D analysis..."}
                </span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          )}

          {/* Video + Transcript toolbar */}
          {transcript && !transcriptLoading && (
            <div className="flex items-center justify-end">
              <Button
                variant={isTranscriptOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setIsTranscriptOpen(prev => !prev)}
                className="rounded-full gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                {isTranscriptOpen ? "Hide Transcript" : "Show Transcript"}
              </Button>
            </div>
          )}

          {/* Two-column layout: Video Player + Transcript Side Panel */}
          <div className="flex gap-0 items-stretch h-[60vh] sm:h-[37.5rem] overflow-hidden rounded-2xl shadow-card">
            <div className="flex-1 min-w-0">
              <MediaPlayerSection
                playbackUrl={playbackUrl}
                filename={video.filename}
                videoStatus={video.status}
              />
            </div>

            {transcript && !transcriptLoading && isTranscriptOpen && (
              <div className="w-[260px] xl:w-[320px] flex-shrink-0 border-l border-border">
                <TranscriptSidePanel
                  transcript={transcript}
                  speakerLabels={speakerLabels}
                  videoId={videoId!}
                  editingSpeaker={editingSpeaker}
                  setEditingSpeaker={setEditingSpeaker}
                  speakerName={speakerName}
                  setSpeakerName={setSpeakerName}
                  speakerRole={speakerRole}
                  setSpeakerRole={setSpeakerRole}
                  onLabelSpeaker={handleLabelSpeaker}
                  uniqueSpeakers={uniqueSpeakers}
                />
              </div>
            )}
          </div>

          {/* Transcription start button if no transcript yet (includes retry from error) */}
          {(canStartTranscription || canRetryTranscription) && (
            <EmptyState
              icon={canRetryTranscription ? RefreshCw : FileText}
              heading={canRetryTranscription ? "Transcription failed" : "No transcript available"}
              description={canRetryTranscription
                ? "The previous transcription attempt failed. You can retry it."
                : "Start transcription to begin the analysis process."
              }
              action={
                <Button onClick={handleStartTranscription} disabled={startTranscription.isPending} className="rounded-full">
                  {startTranscription.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      {canRetryTranscription ? <RotateCcw className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                      {canRetryTranscription ? "Retry Transcription" : "Start Transcription"}
                    </>
                  )}
                </Button>
              }
              className="bg-card rounded-2xl shadow-card p-12"
            />
          )}

          {/* Analysis Section (full width below video+transcript) */}
          {transcript && (
            <AnalysisSection
              analysis={analysis}
              analysisLoading={analysisLoading}
              hasTranscript={!!transcript}
              canStartAnalysis={canAnalysisStart}
              workflowBlockerMessage={workflowBlockerMessage}
              onStartChunkStep={handleStartChunkStep}
              onStartFullAnalysis={handleStartFullAnalysis}
              startChunkStepPending={startChunkStep.isPending}
              startFullAnalysisPending={startFullAnalysis.isPending}
              activeStepTab={activeStepTab}
              setActiveStepTab={setActiveStepTab}
              stepInfo={stepInfo}
              canContinueCurrentStep={canContinueCurrentStep()}
              isAnyStepPending={isAnyStepPending}
              isCurrentStepProcessing={isCurrentStepProcessing}
              getNextStepLabel={getNextStepLabel}
              startInferStepPending={startInferStep.isPending}
              startRelateStepPending={startRelateStep.isPending}
              startExplainStepPending={startExplainStep.isPending}
              startActivateStepPending={startActivateStep.isPending}
              chunksDisplay={chunksDisplay}
              inferencesDisplay={inferencesDisplay}
              patternsDisplay={patternsDisplay}
              insightsDisplay={insightsDisplay}
              principlesDisplay={principlesDisplay}
              onRetryChunkStep={handleStartChunkStep}
              onRetryInferStep={handleStartInferStep}
              onRetryRelateStep={handleStartRelateStep}
              onRetryExplainStep={handleStartExplainStep}
              onRetryActivateStep={handleStartActivateStep}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
