import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../hooks/useProjects";
import { useProjectVideos } from "../hooks/useVideos";
import { useProjectAnalysis, useStartProjectAnalysis, useMetaPatterns, useCrossInsights, useSystemPrinciples } from "../hooks/useAnalysis";
import Layout from "../components/Layout";
import { Loader2, Upload, Video as VideoIcon, AlertCircle, Network, PlayCircle, CheckCircle2, MoreVertical, Edit, Trash2, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import VideoUploadDialog from "../components/videos/VideoUploadDialogSimple";
import VideoCard from "../components/videos/VideoCard";
import { MetaPatternsList } from "../components/analysis/MetaPatternsList";
import { CrossInsightsList } from "../components/analysis/CrossInsightsList";
import { SystemPrinciplesList } from "../components/analysis/SystemPrinciplesList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/DropdownMenu";
import { DeleteProjectDialog } from "../components/projects/DeleteProjectDialog";
import { EditProjectDialog } from "../components/projects/EditProjectDialog";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(
    projectId || null
  );
  const { data: videos, isLoading: videosLoading } = useProjectVideos(
    projectId || null
  );
  const { data: projectAnalysis } = useProjectAnalysis(projectId || null);
  const { data: metaPatterns } = useMetaPatterns(projectId || null);
  const { data: crossInsights } = useCrossInsights(projectId || null);
  const { data: systemPrinciples } = useSystemPrinciples(projectId || null);
  const startProjectAnalysis = useStartProjectAnalysis();

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

  // Nielsen #1: Visibility of system status - Track when analysis was triggered
  // This persists loading state until we see the analysis complete or fail
  const [analysisTriggered, setAnalysisTriggered] = useState(false);

  // Clear triggered state when analysis completes, fails, or enters running state
  useEffect(() => {
    if (projectAnalysis?.status === 'completed' ||
        projectAnalysis?.status === 'failed' ||
        projectAnalysis?.status === 'running') {
      setAnalysisTriggered(false);
    }
  }, [projectAnalysis?.status]);

  // Computed: show loading when mutation pending OR triggered but not yet running/completed
  const isAnalysisLoading = startProjectAnalysis.isPending ||
    analysisTriggered ||
    projectAnalysis?.status === 'running';

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const videoFiles = files.filter((file) => file.type.startsWith("video/"));

    if (videoFiles.length > 0) {
      setDroppedFiles(videoFiles);
      setUploadDialogOpen(true);
    }
  };

  // Clear dropped files when dialog closes
  const handleDialogClose = (open: boolean) => {
    setUploadDialogOpen(open);
    if (!open) {
      setDroppedFiles([]);
    }
  };

  // Check if we can run project analysis
  const canRunProjectAnalysis = useMemo(() => {
    if (!videos) return false;

    // Count videos that have completed individual analysis
    const analyzedVideos = videos.filter(video =>
      video.status === 'analyzed' && video.analysis?.status === 'completed'
    );

    return analyzedVideos.length >= 2;
  }, [videos]);

  // Check if there are new videos not included in the current project analysis
  const hasNewVideos = useMemo(() => {
    if (!videos || !projectAnalysis || projectAnalysis.status !== 'completed') {
      return false;
    }

    // Get currently analyzed video IDs
    const analyzedVideos = videos.filter(video =>
      video.status === 'analyzed' && video.analysis?.status === 'completed'
    );

    // Get video IDs included in the last project analysis
    const analyzedVideoIds = new Set(projectAnalysis.video_ids || []);

    // Check if there are any analyzed videos not in the project analysis
    const newVideos = analyzedVideos.filter(v => !analyzedVideoIds.has(v.id));

    return newVideos.length > 0;
  }, [videos, projectAnalysis]);

  // Count new videos
  const newVideoCount = useMemo(() => {
    if (!videos || !projectAnalysis || projectAnalysis.status !== 'completed') {
      return 0;
    }

    const analyzedVideos = videos.filter(video =>
      video.status === 'analyzed' && video.analysis?.status === 'completed'
    );

    const analyzedVideoIds = new Set(projectAnalysis.video_ids || []);
    const newVideos = analyzedVideos.filter(v => !analyzedVideoIds.has(v.id));

    return newVideos.length;
  }, [videos, projectAnalysis]);

  const handleRunProjectAnalysis = async () => {
    if (!projectId) return;
    // Nielsen #1: Immediately show loading state for user feedback
    setAnalysisTriggered(true);
    try {
      await startProjectAnalysis.mutateAsync(projectId);
    } catch {
      setAnalysisTriggered(false); // Clear on error
    }
  };

  if (projectLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Project Not Found
          </h2>
          <p className="text-muted-foreground">
            The project you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload Video
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0"
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Videos Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <VideoIcon className="h-5 w-5 text-foreground/80" />
            <h2 className="text-xl font-semibold">Videos</h2>
            <span className="text-sm text-muted-foreground">
              ({videos?.length || 0})
            </span>
          </div>

          {videosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : videos && videos.length > 0 ? (
            <div
              className={`relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-lg transition-all ${
                isDragging ? 'bg-primary/10 border-2 border-dashed border-primary/60' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/10 bg-opacity-90 rounded-lg z-10">
                  <div className="text-center">
                    <Upload className="h-12 w-12 text-primary mx-auto mb-2" />
                    <p className="text-primary font-medium">Drop videos here to upload</p>
                  </div>
                </div>
              )}
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          ) : (
            <div
              className={`bg-muted border-2 border-dashed rounded-lg p-12 text-center transition-all ${
                isDragging ? 'border-primary/60 bg-primary/10' : 'border-border'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging ? (
                <>
                  <Upload className="h-12 w-12 text-primary mx-auto mb-4 animate-bounce" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Drop videos here
                  </h3>
                  <p className="text-primary">
                    Release to upload your video files
                  </p>
                </>
              ) : (
                <>
                  <VideoIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    No videos yet
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Drag and drop video files here, or click to upload
                  </p>
                  <Button onClick={() => setUploadDialogOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Upload Video
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Project Analysis Section */}
        {canRunProjectAnalysis && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-chart-3" />
                <h2 className="text-xl font-semibold">Cross-Video Analysis</h2>
              </div>

              {!projectAnalysis || projectAnalysis.status === 'pending' ? (
                <Button
                  onClick={handleRunProjectAnalysis}
                  disabled={startProjectAnalysis.isPending}
                  className="bg-chart-3 hover:bg-chart-3/90 text-primary-foreground"
                >
                  {startProjectAnalysis.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Run Project Analysis
                    </>
                  )}
                </Button>
              ) : projectAnalysis.status === 'running' ? (
                <div className="flex flex-col gap-2">
                  <Badge className="bg-info/20 text-info border-info/40 px-3 py-1.5">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="font-medium">Cross-Video Analysis Running...</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">Usually takes 1-2 minutes</span>
                </div>
              ) : projectAnalysis.status === 'completed' ? (
                hasNewVideos ? (
                  <Button
                    onClick={handleRunProjectAnalysis}
                    disabled={startProjectAnalysis.isPending}
                    className="bg-warning hover:bg-warning/90 text-warning-foreground"
                  >
                    {startProjectAnalysis.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Re-run Analysis ({newVideoCount} new {newVideoCount === 1 ? 'video' : 'videos'})
                      </>
                    )}
                  </Button>
                ) : (
                  <Badge className="bg-success/20 text-success">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Completed
                  </Badge>
                )
              ) : null}
            </div>

            {/* Show loading state immediately when analysis is triggered - Nielsen #1: Visibility */}
            {isAnalysisLoading && (
              <Card className="mb-4 border-info/30 bg-info/10">
                <CardContent className="py-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-info" />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {startProjectAnalysis.isPending || analysisTriggered
                            ? "Starting cross-video analysis..."
                            : `Analyzing patterns across ${projectAnalysis?.video_ids?.length || 0} videos...`}
                        </p>
                        <p className="text-sm text-info">
                          This may take 2-5 minutes depending on the amount of data.
                        </p>
                      </div>
                    </div>

                    {/* Progress bar with indeterminate state */}
                    <div className="w-full bg-info/20 rounded-full h-2">
                      <div className="bg-info h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
                    </div>

                    {projectAnalysis?.status === 'running' && (
                      <div className="text-xs text-info flex items-center gap-2">
                        <span>Processing:</span>
                        <span className="font-mono">CROSS_RELATE</span>
                        <span>→</span>
                        <span className="font-mono">CROSS_EXPLAIN</span>
                        <span>→</span>
                        <span className="font-mono">CROSS_ACTIVATE</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error state for failed analysis */}
            {projectAnalysis?.status === 'failed' && (
              <Card className="mb-4 border-destructive/30 bg-destructive/10">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive mb-1">
                        Cross-video analysis failed
                      </p>
                      <p className="text-sm text-destructive/80 mb-3">
                        There was an error analyzing patterns across videos. This might be due to rate limits or processing issues.
                      </p>
                      <Button
                        onClick={handleRunProjectAnalysis}
                        disabled={startProjectAnalysis.isPending}
                        variant="outline"
                        size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      >
                        {startProjectAnalysis.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Retrying...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry Analysis
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {projectAnalysis?.status === 'completed' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-chart-3" />
                    Project Analysis Results
                    <Badge variant="outline" className="ml-2">
                      {projectAnalysis.video_ids.length} videos analyzed
                    </Badge>
                    {hasNewVideos && (
                      <Badge className="ml-2 bg-warning/20 text-warning border-warning/40">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {newVideoCount} new {newVideoCount === 1 ? 'video' : 'videos'} available
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="meta-patterns" className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3">
                      <TabsTrigger value="meta-patterns">
                        Meta-Patterns
                        {metaPatterns && (
                          <Badge variant="outline" className="ml-2">
                            {metaPatterns.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="cross-insights">
                        Cross-Insights
                        {crossInsights && (
                          <Badge variant="outline" className="ml-2">
                            {crossInsights.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="system-principles">
                        System Principles
                        {systemPrinciples && (
                          <Badge variant="outline" className="ml-2">
                            {systemPrinciples.length}
                          </Badge>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="meta-patterns" className="mt-6">
                      {metaPatterns && metaPatterns.length > 0 ? (
                        <MetaPatternsList metaPatterns={metaPatterns} />
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No meta-patterns found
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="cross-insights" className="mt-6">
                      {crossInsights && crossInsights.length > 0 ? (
                        <CrossInsightsList crossInsights={crossInsights} />
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No cross-insights found
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="system-principles" className="mt-6">
                      {systemPrinciples && systemPrinciples.length > 0 ? (
                        <SystemPrinciplesList systemPrinciples={systemPrinciples} />
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No system principles found
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Only show initial card if not loading and no analysis exists */}
            {!projectAnalysis && !startProjectAnalysis.isPending && (
              <Card className="border-chart-3/30 bg-chart-3/10">
                <CardContent className="py-6">
                  <div className="text-center">
                    <Network className="h-12 w-12 text-chart-3 mx-auto mb-3" />
                    <h3 className="font-semibold text-foreground mb-2">
                      Ready for Cross-Video Analysis
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      You have {videos?.filter(v => v.status === 'analyzed' && v.analysis?.status === 'completed').length} analyzed videos.
                      Run project analysis to discover patterns and insights across all videos.
                    </p>
                    <Button
                      onClick={handleRunProjectAnalysis}
                      disabled={startProjectAnalysis.isPending}
                      className="bg-chart-3 hover:bg-chart-3/90 text-primary-foreground"
                    >
                      <>
                        <PlayCircle className="h-4 w-4" />
                        Run Project Analysis
                      </>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <VideoUploadDialog
        projectId={projectId!}
        open={uploadDialogOpen}
        onOpenChange={handleDialogClose}
        initialFiles={droppedFiles}
      />

      {project && (
        <>
          <DeleteProjectDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            project={{
              id: project.id,
              name: project.name,
              videoCount: videos?.length || 0,
            }}
            navigateAfterDelete={true}
          />

          <EditProjectDialog
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            project={{
              id: project.id,
              name: project.name,
              description: project.description,
              status: project.status,
            }}
          />
        </>
      )}
    </Layout>
  );
}
