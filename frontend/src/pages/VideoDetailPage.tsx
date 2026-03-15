import React from "react";
import { useParams, Link } from "react-router-dom";
import { useVideo, useVideoPlaybackUrl } from "../hooks/useVideos";
import { useTranscript, useSpeakerLabels, useStartTranscription, useLabelSpeaker } from "../hooks/useTranscriptions";
import {
  useVideoAnalysis,
  useStartFullAnalysis,
  useStartChunkStep,
  useStartInferStep,
  useStartRelateStep,
  useStartExplainStep,
  useStartActivateStep
} from "../hooks/useAnalysis";
import Layout from "../components/Layout";
import { useProject } from "../hooks/useProjects";
import { TranscriptViewer } from "../components/videos/TranscriptViewer";
import { formatFileSize } from "../lib/utils";
import { ChunksList } from "../components/analysis/ChunksList";
import { InferencesList } from "../components/analysis/InferencesList";
import { PatternsList } from "../components/analysis/PatternsList";
import { InsightsList } from "../components/analysis/InsightsList";
import { PrinciplesList } from "../components/analysis/PrinciplesList";
import { ContinueStepButton } from "../components/analysis/ContinueStepButton";
import { useAnalysisDisplay } from "../components/analysis/hooks/useAnalysisDisplay";
import { AnalysisToolbar } from "../components/analysis/display/AnalysisToolbar";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Progress } from "../components/ui/Progress";
import { SimpleTooltip } from "../components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/DropdownMenu";
import {
  Loader2,
  ArrowLeft,
  Video as VideoIcon,
  FileText,
  Play,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  Clock,
  User,
  Edit2,
  Check,
  X,
  MoreVertical,
  Zap,
  Users,
  Info,
  AlertTriangle
} from "lucide-react";

export default function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { data: video, isLoading: videoLoading } = useVideo(videoId || null);
  const { data: playbackUrl } = useVideoPlaybackUrl(videoId || null);
  const { data: transcript, isLoading: transcriptLoading } = useTranscript(videoId || null);
  const { data: speakerLabels } = useSpeakerLabels(transcript?.id || null);
  const { data: analysis, isLoading: analysisLoading } = useVideoAnalysis(videoId || null);
  const { data: project } = useProject(video?.project_id || null);

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
        data: { speaker_label: speakerLabel, assigned_name: name, role },
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      uploaded: { variant: "secondary" as const, label: "Uploaded", icon: CheckCircle },
      transcribing: { variant: "warning" as const, label: "Transcribing...", icon: Loader2 },
      transcribed: { variant: "success" as const, label: "Transcribed", icon: CheckCircle },
      analyzing: { variant: "warning" as const, label: "Analyzing...", icon: Loader2 },
      analyzed: { variant: "success" as const, label: "Analyzed", icon: CheckCircle },
      error: { variant: "destructive" as const, label: "Error", icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.uploaded;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${status === "transcribing" || status === "analyzing" ? "animate-spin" : ""}`} />
        {config.label}
      </Badge>
    );
  };

  // Validation functions for workflow prerequisites
  const getUniqueSpeakers = () => {
    if (!transcript?.processed_transcript?.utterances) return [];
    return Array.from(
      new Set(transcript.processed_transcript.utterances.map((u) => u.speaker))
    );
  };

  const hasRoleAssignments = () => {
    const uniqueSpeakers = getUniqueSpeakers();
    if (uniqueSpeakers.length === 0) return false;

    // Check if all speakers have roles assigned
    return uniqueSpeakers.every(speaker => {
      const label = speakerLabels?.find((l) => l.speaker_label === speaker);
      return label?.role && (label.role === "Interviewer" || label.role === "Participant");
    });
  };

  const hasInterviewerAndParticipant = () => {
    if (!speakerLabels || speakerLabels.length === 0) return false;

    const hasInterviewer = speakerLabels.some(label => label.role === "Interviewer");
    const hasParticipant = speakerLabels.some(label => label.role === "Participant");

    return hasInterviewer && hasParticipant;
  };

  const canStartAnalysis = () => {
    const transcriptReady = video?.status === "transcribed" || (transcript && transcript.status === "completed");
    const rolesAssigned = hasRoleAssignments();
    const hasRequiredRoles = hasInterviewerAndParticipant();

    return transcriptReady && rolesAssigned && hasRequiredRoles;
  };

  const getWorkflowBlockerMessage = () => {
    if (!transcript || transcript.status !== "completed") {
      return null;
    }

    if (!hasRoleAssignments()) {
      return "Please assign roles to all speakers before starting analysis.";
    }

    if (!hasInterviewerAndParticipant()) {
      return "You must have at least one Interviewer and one Participant assigned.";
    }

    return null;
  };

  if (videoLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-surface-page flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-base-40" />
          <p className="mt-3 text-sm text-base-55">Loading video details...</p>
        </div>
      </Layout>
    );
  }

  if (!video) {
    return (
      <Layout>
        <div className="min-h-screen bg-surface-page text-center py-12">
          <AlertCircle className="h-12 w-12 text-base-40 mx-auto mb-4" />
          <h2 className="text-h3 mb-2">Video Not Found</h2>
          <p className="text-base-55 mb-4">
            The video you're looking for doesn't exist or has been removed.
          </p>
          <Link to="/projects">
            <Button>Go to Projects</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const canStartTranscription = video.status === "uploaded" && !transcript;
  const hasAnalysis = analysis && analysis.status === "completed";
  const isStepByStepMode = analysis && analysis.status !== "completed";

  // Step information for step-by-step mode
  const getStepInfo = () => {
    if (!analysis || !analysis.current_step) return null;

    // Check if current step has error - if yes, we'll retry current step instead of continuing
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

  // Check if current step has data ready to continue OR has error (for retry)
  const canContinueCurrentStep = () => {
    if (!analysis || !analysis.current_step) return false;

    // Allow retry if current step has error status
    const currentStepStatus = analysis.step_status?.[analysis.current_step];
    if (currentStepStatus === "error") {
      return true; // Enable button for retry
    }

    // Otherwise check if step has data
    switch (analysis.current_step) {
      case "chunk":
        return !!analysis.chunks;
      case "infer":
        return !!analysis.inferences;
      case "relate":
        return !!analysis.patterns;
      case "explain":
        return !!analysis.insights;
      case "activate":
        return false; // No continue button for last step
      default:
        return false;
    }
  };

  // Shared button props - calculate once, use everywhere
  const isAnyStepPending =
    startInferStep.isPending ||
    startRelateStep.isPending ||
    startExplainStep.isPending ||
    startActivateStep.isPending;

  const isCurrentStepProcessing = Boolean(
    analysis?.current_step && analysis?.step_status?.[analysis.current_step] === "processing"
  );

  const getNextStepLabel = (step: string) => {
    // Check if current step has error - show "Retry CURRENT STEP" instead of "Continue to NEXT STEP"
    const currentStepStatus = analysis?.step_status?.[analysis?.current_step || ""];
    const hasError = currentStepStatus === "error";

    // If error, show retry label for CURRENT step, otherwise show continue label for NEXT step
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

    // Normal flow: continue to next step
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {/* Breadcrumb / Back Navigation */}
          <div className="flex items-center gap-3">
            <Link to={`/projects/${video.project_id}`}>
              <Button variant="ghost" size="sm" className="text-base-55 hover:text-base-85 gap-2 rounded-full">
                <ArrowLeft className="h-4 w-4" />
                {project?.name ? `Back to ${project.name}` : "Back to Project"}
              </Button>
            </Link>
          </div>

          {/* Page Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-h3 sm:text-h2 text-foreground truncate">{video.filename}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-base-55">
                <span>{formatFileSize(video.file_size_bytes)}</span>
                {video.duration_seconds && (
                  <>
                    <span className="text-base-25">|</span>
                    <span>{Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60).toString().padStart(2, '0')}</span>
                  </>
                )}
                <span className="text-base-25">|</span>
                <span>{new Date(video.uploaded_at).toLocaleDateString()}</span>
              </div>
            </div>
            {getStatusBadge(video.status)}
          </div>

          {/* Error message */}
          {video.error_message && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-2xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Error</p>
                <p className="text-sm text-destructive/80 break-all">{video.error_message}</p>
              </div>
            </div>
          )}

          {/* Video Player — elevated white card */}
          {playbackUrl && (
            <div className="bg-card rounded-2xl shadow-card overflow-hidden">
              <video
                id="main-video-player"
                key={playbackUrl}
                controls
                className="w-full bg-black max-h-[60vh] sm:max-h-[37.5rem]"
                preload="metadata"
              >
                <source src={playbackUrl} type="video/mp4" />
                <source src={playbackUrl} type="video/quicktime" />
                <source src={playbackUrl} type="video/x-msvideo" />
                Your browser does not support the video tag.
              </video>
            </div>
          )}

          {/* Progress indicator for ongoing tasks */}
          {(video.status === "transcribing" || video.status === "analyzing") && (
            <div className="bg-card rounded-2xl shadow-card p-4 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-sm text-base-55 overflow-x-auto">
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

          {/* WORKFLOW PREREQUISITES SECTION */}
          {transcript && !analysis && (
            <div className="bg-card rounded-2xl shadow-card border border-accent-blue-border/30 overflow-hidden">
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-accent-blue" />
                  <h2 className="text-h4 text-foreground">Analysis Prerequisites</h2>
                  <SimpleTooltip content="Complete these steps before starting the 5D analysis">
                    <Info className="h-4 w-4 text-accent-blue" />
                  </SimpleTooltip>
                </div>
              </div>
              <div className="p-6 space-y-6">
                {/* Step 1: Video Upload */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-forest/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-brand-forest" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base-85">1. Upload Video</h3>
                      <Badge variant="success" className="text-xs">Complete</Badge>
                    </div>
                    <p className="text-sm text-base-55 mt-1">Your video has been uploaded successfully.</p>
                  </div>
                </div>

                {/* Step 2: Transcription */}
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-forest/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-brand-forest" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base-85">2. Complete Transcription</h3>
                      <Badge variant="success" className="text-xs">Complete</Badge>
                    </div>
                    <p className="text-sm text-base-55 mt-1">Audio has been transcribed with speaker detection.</p>
                  </div>
                </div>

                {/* Step 3: Speaker Labels - CRITICAL */}
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    canStartAnalysis() ? "bg-brand-forest/20" : "bg-brand-mustard/20"
                  }`}>
                    {canStartAnalysis() ? (
                      <CheckCircle className="h-5 w-5 text-brand-forest" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-brand-mustard" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base-85">3. Assign Speaker Roles</h3>
                      {canStartAnalysis() ? (
                        <Badge variant="success" className="text-xs">Complete</Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">Required</Badge>
                      )}
                      <SimpleTooltip content="The analysis filters content based on speaker roles. Only participant responses are analyzed to extract insights.">
                        <Info className="h-4 w-4 text-accent-blue" />
                      </SimpleTooltip>
                    </div>
                    <p className="text-sm text-base-55 mt-1">
                      <strong>Critical:</strong> Identify who is the interviewer vs. participant in your video.
                    </p>

                    {/* Why this matters */}
                    <div className="mt-3 p-4 bg-brand-pale-blue/30 border border-accent-blue-border/20 rounded-xl">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-accent-blue flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-base-85">
                          <p className="font-semibold mb-1">Why speaker roles matter:</p>
                          <p className="text-base-62">The 5D analysis focuses exclusively on <strong>participant responses</strong> to extract insights about user needs and behaviors. Interviewer questions provide context but are not analyzed. This ensures the analysis captures the participant's perspective, not the interviewer's.</p>
                        </div>
                      </div>
                    </div>

                    {/* Speaker labels interface */}
                    <div className="mt-4 space-y-3">
                      <h4 className="text-sm font-semibold text-base-62 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Detected Speakers ({getUniqueSpeakers().length})
                      </h4>
                      {getUniqueSpeakers().map((speaker) => {
                        const label = speakerLabels?.find((l) => l.speaker_label === speaker);
                        const hasRole = label?.role === "Interviewer" || label?.role === "Participant";

                        return (
                          <div
                            key={speaker}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
                              hasRole
                                ? "bg-brand-pale-green/30 border-brand-forest/30"
                                : "bg-brand-pale-gold/30 border-brand-mustard/40"
                            }`}
                          >
                            <User className={`h-4 w-4 ${hasRole ? "text-brand-forest" : "text-brand-mustard"}`} />

                            {editingSpeaker === speaker ? (
                              <div className="flex-1 flex flex-col gap-2 sm:flex-row">
                                <Input
                                  type="text"
                                  placeholder="Name (optional)"
                                  value={speakerName}
                                  onChange={(e) => setSpeakerName(e.target.value)}
                                  className="flex-1"
                                />
                                <Select value={speakerRole} onValueChange={(value) => setSpeakerRole(value)}>
                                  <SelectTrigger className="flex-1 h-9 text-sm">
                                    <SelectValue placeholder="Select role..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Interviewer">Interviewer</SelectItem>
                                    <SelectItem value="Participant">Participant</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  className="rounded-full"
                                  onClick={() => {
                                    // Allow saving even without name, as long as role is selected
                                    if (speakerRole) {
                                      handleLabelSpeaker(
                                        speaker,
                                        speakerName.trim() || speaker,
                                        speakerRole || undefined
                                      );
                                      setEditingSpeaker(null);
                                      setSpeakerName("");
                                      setSpeakerRole("");
                                    }
                                  }}
                                  disabled={!speakerRole}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={() => {
                                    setEditingSpeaker(null);
                                    setSpeakerName("");
                                    setSpeakerRole("");
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1">
                                  <div className="font-medium text-base-85">
                                    {label?.assigned_name || speaker}
                                  </div>
                                  {label?.role ? (
                                    <div className="text-sm font-semibold text-base-62">
                                      Role: {label.role}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-brand-mustard font-semibold">
                                      Role not assigned
                                    </div>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={() => {
                                    setEditingSpeaker(speaker);
                                    setSpeakerName(label?.assigned_name || "");
                                    setSpeakerRole(label?.role || "");
                                  }}
                                >
                                  <Edit2 className="h-4 w-4 mr-1" />
                                  {hasRole ? "Edit" : "Assign Role"}
                                </Button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Validation message */}
                    {getWorkflowBlockerMessage() && (
                      <div className="mt-3 p-3 bg-brand-pale-gold/30 border border-brand-mustard/40 rounded-xl flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-brand-mustard flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-brand-mustard font-semibold">
                          {getWorkflowBlockerMessage()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 4: Start Analysis */}
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    canStartAnalysis() ? "bg-accent-blue-bg" : "bg-base-04"
                  }`}>
                    <Lightbulb className={`h-5 w-5 ${canStartAnalysis() ? "text-accent-blue" : "text-base-40"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base-85">4. Start 5D Analysis</h3>
                      {!canStartAnalysis() && (
                        <Badge variant="secondary" className="text-xs">Waiting</Badge>
                      )}
                    </div>
                    <p className="text-sm text-base-55 mt-1">
                      Once all speakers have assigned roles, you can begin the analysis.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <SimpleTooltip
                        content={canStartAnalysis()
                          ? "Start step-by-step analysis (recommended)"
                          : "Complete speaker role assignments first"
                        }
                      >
                        <Button
                          onClick={handleStartChunkStep}
                          disabled={!canStartAnalysis() || startChunkStep.isPending}
                          size="lg"
                          className="rounded-full"
                        >
                          {startChunkStep.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Starting Analysis...
                            </>
                          ) : (
                            <>
                              <Lightbulb className="h-4 w-4 mr-2" />
                              Start Analysis
                            </>
                          )}
                        </Button>
                      </SimpleTooltip>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="lg"
                            className="h-10 w-10 p-0 rounded-full"
                            disabled={!canStartAnalysis() || startChunkStep.isPending || startFullAnalysis.isPending}
                          >
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">More options</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={handleStartFullAnalysis}
                            disabled={startFullAnalysis.isPending}
                          >
                            <Zap className="mr-2 h-4 w-4" />
                            Run Full Analysis (Advanced)
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Original transcription button if no transcript yet */}
          {canStartTranscription && (
            <div className="bg-card rounded-2xl shadow-card p-12 text-center">
              <FileText className="h-12 w-12 text-base-25 mx-auto mb-4" />
              <p className="text-base-55 mb-4">
                No transcript available. Start transcription to begin the analysis process.
              </p>
              <Button onClick={handleStartTranscription} disabled={startTranscription.isPending} className="rounded-full">
                {startTranscription.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start Transcription
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Main Content Tabs — Transcript & Analysis */}
          {transcript && (
            <Tabs defaultValue="transcript" className="w-full">
              <TabsList>
                <TabsTrigger value="transcript">
                  <FileText className="h-4 w-4 mr-2" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="analysis" disabled={!analysis}>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Analysis
                  {hasAnalysis && (
                    <Badge variant="success" className="ml-2 text-xs">
                      Complete
                    </Badge>
                  )}
                  {isStepByStepMode && (
                    <Badge variant="default" className="ml-2 text-xs">
                      In Progress
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Transcript Tab */}
              <TabsContent value="transcript" className="mt-6">
                {transcriptLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-base-40" />
                  </div>
                ) : transcript ? (
                  <TranscriptViewer
                    transcript={transcript}
                    speakerLabels={speakerLabels}
                    onLabelSpeaker={handleLabelSpeaker}
                    videoId={videoId!}
                  />
                ) : null}
              </TabsContent>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="mt-6 space-y-6">
                {analysisLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-base-40" />
                  </div>
                ) : hasAnalysis ? (
                  // Complete mode: Show all steps in tabbed accordion sections
                  <Tabs defaultValue="chunks" className="w-full">
                    <TabsList className="overflow-x-auto">
                      <SimpleTooltip content="Breaking interview into segments">
                        <TabsTrigger value="chunks" className="whitespace-nowrap">
                          1. Chunks {analysis.chunks && `(${analysis.chunks.length})`}
                        </TabsTrigger>
                      </SimpleTooltip>
                      <SimpleTooltip content="Extracting deeper meaning from segments">
                        <TabsTrigger value="inferences" className="whitespace-nowrap">
                          2. Inferences {analysis.inferences && `(${analysis.inferences.length})`}
                        </TabsTrigger>
                      </SimpleTooltip>
                      <SimpleTooltip content="Connecting inferences into themes">
                        <TabsTrigger value="patterns" className="whitespace-nowrap">
                          3. Patterns {analysis.patterns && `(${analysis.patterns.length})`}
                        </TabsTrigger>
                      </SimpleTooltip>
                      <SimpleTooltip content="Generating higher-order explanations">
                        <TabsTrigger value="insights" className="whitespace-nowrap">
                          4. Insights {analysis.insights && `(${analysis.insights.length})`}
                        </TabsTrigger>
                      </SimpleTooltip>
                      <SimpleTooltip content="Creating actionable design principles">
                        <TabsTrigger value="principles" className="whitespace-nowrap">
                          5. Principles {analysis.design_principles && `(${analysis.design_principles.length})`}
                        </TabsTrigger>
                      </SimpleTooltip>
                    </TabsList>

                    <TabsContent value="chunks" className="mt-6">
                      {analysis.chunks && (
                        <>
                          <AnalysisToolbar {...chunksDisplay} />
                          <ChunksList
                            chunks={chunksDisplay.processData(analysis.chunks)}
                            viewMode={chunksDisplay.viewMode}
                            sort={chunksDisplay.sort}
                            onSort={chunksDisplay.setSort}
                          />
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="inferences" className="mt-6">
                      {analysis.inferences && (
                        <>
                          <AnalysisToolbar {...inferencesDisplay} />
                          <InferencesList
                            inferences={inferencesDisplay.processData(analysis.inferences)}
                            chunks={analysis.chunks || []}
                            viewMode={inferencesDisplay.viewMode}
                            sort={inferencesDisplay.sort}
                            onSort={inferencesDisplay.setSort}
                          />
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="patterns" className="mt-6">
                      {analysis.patterns && (
                        <>
                          <AnalysisToolbar {...patternsDisplay} />
                          <PatternsList
                            patterns={patternsDisplay.processData(analysis.patterns)}
                            viewMode={patternsDisplay.viewMode}
                            sort={patternsDisplay.sort}
                            onSort={patternsDisplay.setSort}
                          />
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="insights" className="mt-6">
                      {analysis.insights && (
                        <>
                          <AnalysisToolbar {...insightsDisplay} />
                          <InsightsList
                            insights={insightsDisplay.processData(analysis.insights)}
                            viewMode={insightsDisplay.viewMode}
                            sort={insightsDisplay.sort}
                            onSort={insightsDisplay.setSort}
                          />
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="principles" className="mt-6">
                      {analysis.design_principles && (
                        <>
                          <AnalysisToolbar {...principlesDisplay} />
                          <PrinciplesList
                            principles={principlesDisplay.processData(analysis.design_principles)}
                            viewMode={principlesDisplay.viewMode}
                            sort={principlesDisplay.sort}
                            onSort={principlesDisplay.setSort}
                          />
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                ) : isStepByStepMode && stepInfo ? (
                  // Step-by-step mode: Show progress and tabs with states
                  <div className="space-y-6">
                    {/* Progress indicator */}
                    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
                      <div className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border">
                        <h3 className="text-h4 text-foreground">Analysis Progress</h3>
                        {stepInfo.nextStep && (
                          <ContinueStepButton
                            onClick={stepInfo.handler}
                            nextStepLabel={getNextStepLabel(stepInfo.nextStep)}
                            canContinue={canContinueCurrentStep()}
                            isAnyStepPending={isAnyStepPending}
                            isCurrentStepProcessing={isCurrentStepProcessing}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-base-55">Current Step:</span>
                          <Badge variant="default">
                            Step {stepInfo.number}: {stepInfo.name}
                          </Badge>
                          {analysis.current_step && analysis.step_status?.[analysis.current_step] === "processing" && (
                            <Badge variant="outline" className="ml-2">
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Processing
                            </Badge>
                          )}
                        </div>
                        <Progress value={(stepInfo.number / 5) * 100} />
                        <div className="flex items-center gap-2 text-xs text-base-40">
                          <CheckCircle className="h-4 w-4 text-brand-forest" />
                          {stepInfo.number} of 5 steps completed
                        </div>
                      </div>
                    </div>

                    {/* Step tabs with state indicators */}
                    <Tabs value={activeStepTab} onValueChange={setActiveStepTab} className="w-full">
                      <TabsList className="overflow-x-auto">
                        <TabsTrigger
                          value="chunks"
                          disabled={!analysis.chunks}
                          className="whitespace-nowrap"
                        >
                          {analysis.step_status?.chunk === "completed" && (
                            <CheckCircle className="h-3 w-3 mr-1 text-brand-forest" />
                          )}
                          {analysis.step_status?.chunk === "processing" && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          1. Chunks {analysis.chunks && `(${analysis.chunks.length})`}
                        </TabsTrigger>
                        <TabsTrigger
                          value="inferences"
                          disabled={!analysis.inferences && analysis.step_status?.infer !== "error"}
                          className="whitespace-nowrap"
                        >
                          {analysis.step_status?.infer === "completed" && (
                            <CheckCircle className="h-3 w-3 mr-1 text-brand-forest" />
                          )}
                          {analysis.step_status?.infer === "processing" && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          {analysis.step_status?.infer === "error" && (
                            <AlertCircle className="h-3 w-3 mr-1 text-destructive" />
                          )}
                          2. Inferences {analysis.inferences && `(${analysis.inferences.length})`}
                        </TabsTrigger>
                        <TabsTrigger
                          value="patterns"
                          disabled={!analysis.patterns && analysis.step_status?.relate !== "error"}
                          className="whitespace-nowrap"
                        >
                          {analysis.step_status?.relate === "completed" && (
                            <CheckCircle className="h-3 w-3 mr-1 text-brand-forest" />
                          )}
                          {analysis.step_status?.relate === "processing" && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          {analysis.step_status?.relate === "error" && (
                            <AlertCircle className="h-3 w-3 mr-1 text-destructive" />
                          )}
                          3. Patterns {analysis.patterns && `(${analysis.patterns.length})`}
                        </TabsTrigger>
                        <TabsTrigger
                          value="insights"
                          disabled={!analysis.insights && analysis.step_status?.explain !== "error"}
                          className="whitespace-nowrap"
                        >
                          {analysis.step_status?.explain === "completed" && (
                            <CheckCircle className="h-3 w-3 mr-1 text-brand-forest" />
                          )}
                          {analysis.step_status?.explain === "processing" && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          {analysis.step_status?.explain === "error" && (
                            <AlertCircle className="h-3 w-3 mr-1 text-destructive" />
                          )}
                          4. Insights {analysis.insights && `(${analysis.insights.length})`}
                        </TabsTrigger>
                        <TabsTrigger
                          value="principles"
                          disabled={!analysis.design_principles && analysis.step_status?.activate !== "error"}
                          className="whitespace-nowrap"
                        >
                          {analysis.step_status?.activate === "completed" && (
                            <CheckCircle className="h-3 w-3 mr-1 text-brand-forest" />
                          )}
                          {analysis.step_status?.activate === "processing" && (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          )}
                          {analysis.step_status?.activate === "error" && (
                            <AlertCircle className="h-3 w-3 mr-1 text-destructive" />
                          )}
                          5. Principles {analysis.design_principles && `(${analysis.design_principles.length})`}
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="chunks" className="mt-6">
                        {analysis.step_status?.chunk === "processing" ? (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">Processing chunks...</p>
                          </div>
                        ) : analysis.chunks ? (
                          <>
                            <AnalysisToolbar {...chunksDisplay} />
                            <ChunksList
                              chunks={chunksDisplay.processData(analysis.chunks)}
                              viewMode={chunksDisplay.viewMode}
                              sort={chunksDisplay.sort}
                              onSort={chunksDisplay.setSort}
                            />
                            {analysis.current_step === "chunk" && stepInfo.nextStep && (
                              <div className="bg-card rounded-2xl shadow-card mt-4 p-6 text-center">
                                <p className="text-base-55 mb-4">
                                  Review the {analysis.chunks.length} chunks above. When ready, continue to the next step.
                                </p>
                                <ContinueStepButton
                                  onClick={stepInfo.handler}
                                  nextStepLabel="Continue to Step 2: Infer"
                                  canContinue={canContinueCurrentStep()}
                                  isAnyStepPending={isAnyStepPending}
                                  isCurrentStepProcessing={isCurrentStepProcessing}
                                />
                              </div>
                            )}
                          </>
                        ) : null}
                      </TabsContent>

                      <TabsContent value="inferences" className="mt-6">
                        {(startInferStep.isPending || analysis.step_status?.infer === "processing") ? (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">{startInferStep.isPending ? "Starting..." : "Generating inferences..."}</p>
                          </div>
                        ) : analysis.inferences ? (
                          <>
                            <AnalysisToolbar {...inferencesDisplay} />
                            <InferencesList
                              inferences={inferencesDisplay.processData(analysis.inferences)}
                              chunks={analysis.chunks || []}
                              viewMode={inferencesDisplay.viewMode}
                              sort={inferencesDisplay.sort}
                              onSort={inferencesDisplay.setSort}
                            />
                            {analysis.current_step === "infer" && stepInfo.nextStep && (
                              <div className="bg-card rounded-2xl shadow-card mt-4 p-6 text-center">
                                <p className="text-base-55 mb-4">
                                  Review the {analysis.inferences.length} inferences above. When ready, continue to the next step.
                                </p>
                                <ContinueStepButton
                                  onClick={stepInfo.handler}
                                  nextStepLabel="Continue to Step 3: Relate"
                                  canContinue={canContinueCurrentStep()}
                                  isAnyStepPending={isAnyStepPending}
                                  isCurrentStepProcessing={isCurrentStepProcessing}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">Loading inferences...</p>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="patterns" className="mt-6">
                        {(startRelateStep.isPending || analysis.step_status?.relate === "processing") ? (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">{startRelateStep.isPending ? "Starting..." : "Identifying patterns..."}</p>
                          </div>
                        ) : analysis.patterns ? (
                          <>
                            <AnalysisToolbar {...patternsDisplay} />
                            <PatternsList
                              patterns={patternsDisplay.processData(analysis.patterns)}
                              viewMode={patternsDisplay.viewMode}
                              sort={patternsDisplay.sort}
                              onSort={patternsDisplay.setSort}
                            />
                            {analysis.current_step === "relate" && stepInfo.nextStep && (
                              <div className="bg-card rounded-2xl shadow-card mt-4 p-6 text-center">
                                <p className="text-base-55 mb-4">
                                  Review the {analysis.patterns.length} patterns above. When ready, continue to the next step.
                                </p>
                                <ContinueStepButton
                                  onClick={stepInfo.handler}
                                  nextStepLabel="Continue to Step 4: Explain"
                                  canContinue={canContinueCurrentStep()}
                                  isAnyStepPending={isAnyStepPending}
                                  isCurrentStepProcessing={isCurrentStepProcessing}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">Loading patterns...</p>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="insights" className="mt-6">
                        {(startExplainStep.isPending || analysis.step_status?.explain === "processing") ? (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">{startExplainStep.isPending ? "Starting..." : "Generating insights..."}</p>
                          </div>
                        ) : analysis.insights ? (
                          <>
                            <AnalysisToolbar {...insightsDisplay} />
                            <InsightsList
                              insights={insightsDisplay.processData(analysis.insights)}
                              viewMode={insightsDisplay.viewMode}
                              sort={insightsDisplay.sort}
                              onSort={insightsDisplay.setSort}
                            />
                            {analysis.current_step === "explain" && stepInfo.nextStep && (
                              <div className="bg-card rounded-2xl shadow-card mt-4 p-6 text-center">
                                <p className="text-base-55 mb-4">
                                  Review the {analysis.insights.length} insights above. When ready, continue to the next step.
                                </p>
                                <ContinueStepButton
                                  onClick={stepInfo.handler}
                                  nextStepLabel="Continue to Step 5: Activate"
                                  canContinue={canContinueCurrentStep()}
                                  isAnyStepPending={isAnyStepPending}
                                  isCurrentStepProcessing={isCurrentStepProcessing}
                                />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">Loading insights...</p>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="principles" className="mt-6">
                        {(startActivateStep.isPending || analysis.step_status?.activate === "processing") ? (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">{startActivateStep.isPending ? "Starting..." : "Generating design principles..."}</p>
                          </div>
                        ) : analysis.design_principles ? (
                          <>
                            <AnalysisToolbar {...principlesDisplay} />
                            <PrinciplesList
                              principles={principlesDisplay.processData(analysis.design_principles)}
                              viewMode={principlesDisplay.viewMode}
                              sort={principlesDisplay.sort}
                              onSort={principlesDisplay.setSort}
                            />
                            <div className="bg-card rounded-2xl shadow-card mt-4 p-6 text-center">
                              <CheckCircle className="h-12 w-12 text-brand-forest mx-auto mb-4" />
                              <p className="text-base-55">
                                Analysis complete! All 5 steps have been processed.
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="bg-card rounded-2xl p-12 text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-base-40 mx-auto mb-4" />
                            <p className="text-base-55">Loading design principles...</p>
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </div>
                ) : (
                  <div className="bg-card rounded-2xl shadow-card p-12 text-center">
                    <Lightbulb className="h-12 w-12 text-base-25 mx-auto mb-4" />
                    <p className="text-base-55">
                      No analysis available yet. Complete the prerequisites and start the analysis to see results.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </Layout>
  );
}
