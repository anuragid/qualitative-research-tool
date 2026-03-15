import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { useProject } from "../hooks/useProjects";
import { useProjectVideos } from "../hooks/useVideos";
import { useProjectAnalysis, useStartProjectAnalysis, useMetaPatterns, useCrossInsights, useSystemPrinciples } from "../hooks/useAnalysis";
import Layout from "../components/Layout";
import { getFolderColor } from "../lib/noise";
import { Loader2, Upload, Video as VideoIcon, AlertCircle, Network, PlayCircle, CheckCircle2, MoreVertical, Edit, Trash2, RefreshCw, ArrowLeft, Lightbulb, Compass } from "lucide-react";
import { Button } from "../components/ui/Button";
import VideoUploadDialog from "../components/videos/VideoUploadDialogSimple";
import VideoCard from "../components/videos/VideoCard";
import { MetaPatternsList } from "../components/analysis/MetaPatternsList";
import { CrossInsightsList } from "../components/analysis/CrossInsightsList";
import { SystemPrinciplesList } from "../components/analysis/SystemPrinciplesList";
import { useAnalysisDisplay } from "../components/analysis/hooks/useAnalysisDisplay";
import { AnalysisToolbar } from "../components/analysis/display/AnalysisToolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
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
  const [analysisTriggered, setAnalysisTriggered] = useState(false);

  // Display state for cross-video analysis tabs
  const metaPatternsDisplay = useAnalysisDisplay("metaPatterns");
  const crossInsightsDisplay = useAnalysisDisplay("crossInsights");
  const systemPrinciplesDisplay = useAnalysisDisplay("systemPrinciples");

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

  // Derive folder color from project ID
  const colorIndex = project?.id ? project.id.charCodeAt(0) % 6 : 0;
  const folderColor = getFolderColor(colorIndex);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    const skippedCount = files.length - videoFiles.length;

    if (skippedCount > 0) {
      toast.warning(
        `Only video files are supported. ${skippedCount} file${skippedCount > 1 ? "s were" : " was"} skipped.`
      );
    }

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
    const analyzedVideos = videos.filter(video =>
      video.status === 'analyzed' && video.analysis?.status === 'completed'
    );
    const analyzedVideoIds = new Set(projectAnalysis.video_ids || []);
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

  // Build a lookup map of video ID -> video filename for display
  const videoNames = useMemo(() => {
    if (!videos) return {};
    return videos.reduce<Record<string, string>>((acc, v) => {
      acc[v.id] = v.filename;
      return acc;
    }, {});
  }, [videos]);

  const handleRunProjectAnalysis = async () => {
    if (!projectId) return;
    setAnalysisTriggered(true);
    try {
      await startProjectAnalysis.mutateAsync(projectId);
    } catch {
      setAnalysisTriggered(false);
    }
  };

  if (projectLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          {/* Skeleton header band */}
          <Skeleton className="h-36 rounded-2xl" />
          {/* Skeleton video grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-base-40 mb-4" />
          <h2 className="text-h3 mb-2">
            Project Not Found
          </h2>
          <p className="text-base-55 mb-4">
            The project you're looking for doesn't exist or has been removed.
          </p>
          <Link to="/projects">
            <Button>Go to Projects</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back navigation */}
        <Link
          to="/projects"
          className="inline-flex items-center gap-2 text-base-55 hover:text-foreground transition-[color] duration-[var(--duration-micro)] ease-[var(--ease)]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-body-sm">All Projects</span>
        </Link>

        {/* Folder-themed header band */}
        <div
          className="relative rounded-2xl p-6 noise-texture noise-light overflow-hidden"
          style={{ backgroundColor: folderColor.body }}
        >
          {/* Folder tab accent at top-left */}
          <div
            className="absolute top-0 left-6 w-20 h-2 rounded-b-sm noise-texture noise-medium"
            style={{ backgroundColor: folderColor.tab }}
          />

          <div className="relative z-[2] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pt-2">
            <div>
              <h1 className="text-h2">{project.name}</h1>
              {project.description && (
                <p className="text-base-62 mt-1 max-w-2xl">{project.description}</p>
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
        </div>

        {/* Videos Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <VideoIcon className="h-5 w-5 text-base-62" />
            <h2 className="text-h4">Videos</h2>
            <span className="text-label text-base-40">
              ({videos?.length || 0})
            </span>
          </div>

          {videosLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : videos && videos.length > 0 ? (
            <div
              className={`relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-2xl transition-all ${
                isDragging ? 'bg-accent-blue-bg border-2 border-dashed border-accent-blue-border' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-accent-blue-bg bg-opacity-90 rounded-2xl z-10">
                  <div className="text-center">
                    <Upload className="h-12 w-12 text-accent-blue mx-auto mb-2" />
                    <p className="text-accent-blue font-medium">Drop videos here to upload</p>
                  </div>
                </div>
              )}
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          ) : (
            <div
              className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
                isDragging ? 'border-accent-blue-border bg-accent-blue-bg' : 'border-border bg-surface-card'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging ? (
                <>
                  <Upload className="h-12 w-12 text-accent-blue mx-auto mb-4 animate-bounce" />
                  <h3 className="text-h4 mb-2">
                    Drop videos here
                  </h3>
                  <p className="text-accent-blue">
                    Release to upload your video files
                  </p>
                </>
              ) : (
                <>
                  <VideoIcon className="h-12 w-12 text-base-40 mx-auto mb-4" />
                  <h3 className="text-h4 mb-2">
                    No videos yet
                  </h3>
                  <p className="text-base-55 mb-4">
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
                <Network className="h-5 w-5 text-brand-forest" />
                <h2 className="text-h4">Cross-Video Analysis</h2>
              </div>

              {!projectAnalysis || projectAnalysis.status === 'pending' ? (
                <Button
                  onClick={handleRunProjectAnalysis}
                  disabled={startProjectAnalysis.isPending}
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
                  <Badge variant="secondary" className="px-3 py-1.5">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="font-medium">Cross-Video Analysis Running...</span>
                  </Badge>
                  <span className="text-label text-base-55">This usually takes a few minutes</span>
                </div>
              ) : projectAnalysis.status === 'completed' ? (
                hasNewVideos ? (
                  <Button
                    onClick={handleRunProjectAnalysis}
                    disabled={startProjectAnalysis.isPending}
                    variant="outline"
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
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Completed
                  </Badge>
                )
              ) : null}
            </div>

            {/* Show loading state immediately when analysis is triggered */}
            {isAnalysisLoading && (
              <Card className="mb-4 shadow-card">
                <CardContent className="py-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-accent-blue" />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {startProjectAnalysis.isPending || analysisTriggered
                            ? "Starting cross-video analysis..."
                            : `Analyzing patterns across ${projectAnalysis?.video_ids?.length || 0} videos...`}
                        </p>
                        <p className="text-body-sm text-base-55">
                          This usually takes a few minutes.
                        </p>
                      </div>
                    </div>

                    {/* Progress bar with indeterminate state */}
                    <div className="w-full bg-base-04 rounded-full h-1.5">
                      <div className="bg-accent-blue h-1.5 rounded-full animate-pulse w-full" />
                    </div>

                    {projectAnalysis?.status === 'running' && (
                      <div className="text-label text-base-55 flex items-center gap-2">
                        <span>Processing:</span>
                        <span>Finding patterns</span>
                        <span className="text-base-25">&rarr;</span>
                        <span>Generating insights</span>
                        <span className="text-base-25">&rarr;</span>
                        <span>Creating principles</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error state for failed analysis */}
            {projectAnalysis?.status === 'failed' && (
              <Card className="mb-4 border-destructive/30 bg-destructive/5 shadow-card">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive mb-1">
                        Cross-video analysis failed
                      </p>
                      <p className="text-body-sm text-destructive/80 mb-3">
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
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-brand-forest" />
                    Project Analysis Results
                    <Badge variant="outline" className="ml-2">
                      {projectAnalysis.video_ids.length} videos analyzed
                    </Badge>
                    {hasNewVideos && (
                      <Badge variant="warning" className="ml-2">
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
                        <>
                          <AnalysisToolbar {...metaPatternsDisplay} />
                          <MetaPatternsList
                            metaPatterns={metaPatternsDisplay.processData(metaPatterns)}
                            viewMode={metaPatternsDisplay.viewMode}
                            sort={metaPatternsDisplay.sort}
                            onSort={metaPatternsDisplay.setSort}
                            videoNames={videoNames}
                          />
                        </>
                      ) : (
                        <div className="text-center py-12">
                          <Network className="h-10 w-10 text-base-25 mx-auto mb-3" />
                          <h4 className="text-h4 text-base-55 mb-1">No patterns yet</h4>
                          <p className="text-body-sm text-base-40">
                            Run cross-video analysis to discover recurring patterns across your interviews.
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="cross-insights" className="mt-6">
                      {crossInsights && crossInsights.length > 0 ? (
                        <>
                          <AnalysisToolbar {...crossInsightsDisplay} />
                          <CrossInsightsList
                            crossInsights={crossInsightsDisplay.processData(crossInsights)}
                            viewMode={crossInsightsDisplay.viewMode}
                            sort={crossInsightsDisplay.sort}
                            onSort={crossInsightsDisplay.setSort}
                          />
                        </>
                      ) : (
                        <div className="text-center py-12">
                          <Lightbulb className="h-10 w-10 text-base-25 mx-auto mb-3" />
                          <h4 className="text-h4 text-base-55 mb-1">No insights yet</h4>
                          <p className="text-body-sm text-base-40">
                            Run cross-video analysis to generate insights that span multiple interviews.
                          </p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="system-principles" className="mt-6">
                      {systemPrinciples && systemPrinciples.length > 0 ? (
                        <>
                          <AnalysisToolbar {...systemPrinciplesDisplay} />
                          <SystemPrinciplesList
                            systemPrinciples={systemPrinciplesDisplay.processData(systemPrinciples)}
                            viewMode={systemPrinciplesDisplay.viewMode}
                            sort={systemPrinciplesDisplay.sort}
                            onSort={systemPrinciplesDisplay.setSort}
                          />
                        </>
                      ) : (
                        <div className="text-center py-12">
                          <Compass className="h-10 w-10 text-base-25 mx-auto mb-3" />
                          <h4 className="text-h4 text-base-55 mb-1">No principles yet</h4>
                          <p className="text-body-sm text-base-40">
                            Run cross-video analysis to derive system-level design principles from your research.
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {/* Only show initial card if not loading and no analysis exists */}
            {!projectAnalysis && !startProjectAnalysis.isPending && (
              <Card className="shadow-card">
                <CardContent className="py-6">
                  <div className="text-center">
                    <Network className="h-12 w-12 text-brand-forest mx-auto mb-3" />
                    <h3 className="text-h4 mb-2">
                      Ready for Cross-Video Analysis
                    </h3>
                    <p className="text-base-55 mb-4">
                      You have {videos?.filter(v => v.status === 'analyzed' && v.analysis?.status === 'completed').length} analyzed videos.
                      Run project analysis to discover patterns and insights across all videos.
                    </p>
                    <Button
                      onClick={handleRunProjectAnalysis}
                      disabled={startProjectAnalysis.isPending}
                    >
                      <PlayCircle className="h-4 w-4" />
                      Run Project Analysis
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
