import React from "react";
import { useParams, Link } from "react-router-dom";
import { useVideo, useVideoPlaybackUrl } from "../hooks/useVideos";
import { useTranscript, useSpeakerLabels, useStartTranscription, useLabelSpeaker } from "../hooks/useTranscriptions";
import { useVideoAnalysis, useStartVideoAnalysis } from "../hooks/useAnalysis";
import Layout from "../components/Layout";
import { TranscriptViewer } from "../components/videos/TranscriptViewer";
import { VideoTranscriptSync } from "../components/video/VideoTranscriptSync";
import { ChunksList } from "../components/analysis/ChunksList";
import { InferencesList } from "../components/analysis/InferencesList";
import { PatternsList } from "../components/analysis/PatternsList";
import { InsightsList } from "../components/analysis/InsightsList";
import { PrinciplesList } from "../components/analysis/PrinciplesList";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Progress } from "../components/ui/Progress";
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
  PlayCircle,
  User,
  Edit2,
  Check,
  X
} from "lucide-react";

export default function VideoDetailPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { data: video, isLoading: videoLoading } = useVideo(videoId || null);
  const { data: playbackUrl, isLoading: playbackUrlLoading } = useVideoPlaybackUrl(videoId || null);
  const { data: transcript, isLoading: transcriptLoading } = useTranscript(videoId || null);
  const { data: speakerLabels } = useSpeakerLabels(transcript?.id || null);
  const { data: analysis, isLoading: analysisLoading } = useVideoAnalysis(videoId || null);

  const startTranscription = useStartTranscription();
  const startAnalysis = useStartVideoAnalysis();
  const labelSpeaker = useLabelSpeaker();

  // Speaker label editing state
  const [editingSpeaker, setEditingSpeaker] = React.useState<string | null>(null);
  const [speakerName, setSpeakerName] = React.useState("");
  const [speakerRole, setSpeakerRole] = React.useState("");

  const handleStartTranscription = () => {
    if (videoId) {
      startTranscription.mutate(videoId);
    }
  };

  const handleStartAnalysis = () => {
    if (videoId) {
      startAnalysis.mutate(videoId);
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      uploaded: { variant: "secondary" as const, label: "Uploaded", icon: CheckCircle },
      transcribing: { variant: "warning" as const, label: "Transcribing...", icon: Loader2 },
      transcribed: { variant: "success" as const, label: "Transcribed", icon: CheckCircle },
      analyzing: { variant: "warning" as const, label: "Analyzing...", icon: Loader2 },
      completed: { variant: "success" as const, label: "Completed", icon: CheckCircle },
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

  if (videoLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!video) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-600">Video not found</p>
        </div>
      </Layout>
    );
  }

  const canStartTranscription = video.status === "uploaded" && !transcript;
  const canStartAnalysis = video.status === "transcribed" || (transcript && transcript.status === "completed");
  const hasAnalysis = analysis && analysis.status === "completed";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to={`/projects/${video.project_id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Project
            </Button>
          </Link>
        </div>

        {/* Video Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <VideoIcon className="h-6 w-6 text-gray-400" />
                <div>
                  <CardTitle className="text-2xl">{video.filename}</CardTitle>
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                    <span>{formatFileSize(video.file_size_bytes)}</span>
                    {video.duration_seconds && (
                      <>
                        <span>•</span>
                        <span>{Math.floor(video.duration_seconds / 60)}:{(video.duration_seconds % 60).toString().padStart(2, '0')}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{new Date(video.uploaded_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              {getStatusBadge(video.status)}
            </div>
          </CardHeader>
          <CardContent>
            {/* Error message */}
            {video.error_message && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800">Error</p>
                  <p className="text-sm text-red-700">{video.error_message}</p>
                </div>
              </div>
            )}

            {/* Video Player */}
            {playbackUrl && (
              <div className="mb-6">
                <video
                  id="main-video-player"
                  key={playbackUrl}
                  controls
                  className="w-full rounded-lg bg-black"
                  style={{ maxHeight: "600px" }}
                  preload="metadata"
                >
                  <source src={playbackUrl} type="video/mp4" />
                  <source src={playbackUrl} type="video/quicktime" />
                  <source src={playbackUrl} type="video/x-msvideo" />
                  Your browser does not support the video tag.
                </video>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {canStartTranscription && (
                <Button
                  onClick={handleStartTranscription}
                  disabled={startTranscription.isPending}
                >
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
              )}

              {canStartAnalysis && !hasAnalysis && (
                <Button
                  onClick={handleStartAnalysis}
                  disabled={startAnalysis.isPending || video.status === "analyzing"}
                  variant="secondary"
                >
                  {startAnalysis.isPending || video.status === "analyzing" ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="h-4 w-4 mr-2" />
                      Start Analysis
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Speaker Labels - shown when transcript exists */}
            {transcript && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Speaker Labels</h3>
                <div className="grid gap-3 max-w-2xl">
                  {Array.from(
                    new Set(transcript.processed_transcript.utterances.map((u) => u.speaker))
                  ).map((speaker) => {
                    const label = speakerLabels?.find((l) => l.speaker_label === speaker);

                    return (
                      <div
                        key={speaker}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                      >
                        <User className="h-4 w-4 text-gray-400" />

                        {editingSpeaker === speaker ? (
                          <div className="flex-1 flex gap-2">
                            <Input
                              type="text"
                              placeholder="Name"
                              value={speakerName}
                              onChange={(e) => setSpeakerName(e.target.value)}
                              className="flex-1"
                            />
                            <select
                              value={speakerRole}
                              onChange={(e) => setSpeakerRole(e.target.value)}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Select role...</option>
                              <option value="Interviewer">Interviewer</option>
                              <option value="Participant">Participant</option>
                            </select>
                            <Button
                              size="sm"
                              onClick={() => {
                                if (speakerName.trim()) {
                                  handleLabelSpeaker(speaker, speakerName.trim(), speakerRole || undefined);
                                  setEditingSpeaker(null);
                                  setSpeakerName("");
                                  setSpeakerRole("");
                                }
                              }}
                              disabled={!speakerName.trim()}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
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
                              <div className="font-medium">{label?.assigned_name || speaker}</div>
                              {label?.role && (
                                <div className="text-sm text-gray-500">
                                  {label.role}
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingSpeaker(speaker);
                                setSpeakerName(label?.assigned_name || "");
                                setSpeakerRole(label?.role || "");
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Progress indicator for ongoing tasks */}
            {(video.status === "transcribing" || video.status === "analyzing") && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
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
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        {transcript && (
          <Tabs defaultValue="transcript" className="w-full">
            <TabsList>
              <TabsTrigger value="transcript">
                <FileText className="h-4 w-4 mr-2" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="analysis" disabled={!hasAnalysis}>
                <Lightbulb className="h-4 w-4 mr-2" />
                Analysis
                {hasAnalysis && (
                  <Badge variant="success" className="ml-2 text-xs">
                    Ready
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Transcript Tab */}
            <TabsContent value="transcript" className="space-y-6">
              {transcriptLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
            <TabsContent value="analysis" className="space-y-6">
              {analysisLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : hasAnalysis ? (
                <Tabs defaultValue="chunks" className="w-full">
                  <TabsList>
                    <TabsTrigger value="chunks">
                      1. Chunks {analysis.chunks && `(${analysis.chunks.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="inferences">
                      2. Inferences {analysis.inferences && `(${analysis.inferences.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="patterns">
                      3. Patterns {analysis.patterns && `(${analysis.patterns.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="insights">
                      4. Insights {analysis.insights && `(${analysis.insights.length})`}
                    </TabsTrigger>
                    <TabsTrigger value="principles">
                      5. Principles {analysis.design_principles && `(${analysis.design_principles.length})`}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="chunks">
                    {analysis.chunks && <ChunksList chunks={analysis.chunks} />}
                  </TabsContent>

                  <TabsContent value="inferences">
                    {analysis.inferences && (
                      <InferencesList
                        inferences={analysis.inferences}
                        chunks={analysis.chunks || []}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="patterns">
                    {analysis.patterns && <PatternsList patterns={analysis.patterns} />}
                  </TabsContent>

                  <TabsContent value="insights">
                    {analysis.insights && <InsightsList insights={analysis.insights} />}
                  </TabsContent>

                  <TabsContent value="principles">
                    {analysis.design_principles && (
                      <PrinciplesList principles={analysis.design_principles} />
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Lightbulb className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">
                      No analysis available yet. Start the analysis to see results.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* No Transcript State */}
        {!transcript && video.status === "uploaded" && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                No transcript available. Start transcription to begin the analysis process.
              </p>
              <Button onClick={handleStartTranscription} disabled={startTranscription.isPending}>
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
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
