import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useProject } from "../hooks/useProjects";
import { useProjectVideos } from "../hooks/useVideos";
import { useProjectAnalysis, useStartProjectAnalysis, useMetaPatterns, useCrossInsights, useSystemPrinciples } from "../hooks/useAnalysis";
import Layout from "../components/Layout";
import { Loader2, Upload, Video as VideoIcon, AlertCircle, Network, PlayCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import VideoUploadDialog from "../components/videos/VideoUploadDialog";
import VideoCard from "../components/videos/VideoCard";
import { MetaPatternsList } from "../components/analysis/MetaPatternsList";
import { CrossInsightsList } from "../components/analysis/CrossInsightsList";
import { SystemPrinciplesList } from "../components/analysis/SystemPrinciplesList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(
    projectId || null
  );
  const { data: videos, isLoading: videosLoading } = useProjectVideos(
    projectId || null
  );
  const { data: projectAnalysis, isLoading: projectAnalysisLoading } = useProjectAnalysis(projectId || null);
  const { data: metaPatterns } = useMetaPatterns(projectId || null);
  const { data: crossInsights } = useCrossInsights(projectId || null);
  const { data: systemPrinciples } = useSystemPrinciples(projectId || null);
  const startProjectAnalysis = useStartProjectAnalysis();

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  // Check if we can run project analysis
  const canRunProjectAnalysis = useMemo(() => {
    if (!videos) return false;

    // Count videos that have completed individual analysis
    const analyzedVideos = videos.filter(video =>
      video.status === 'completed' && video.analysis?.status === 'completed'
    );

    return analyzedVideos.length >= 2;
  }, [videos]);

  const handleRunProjectAnalysis = async () => {
    if (!projectId) return;
    try {
      await startProjectAnalysis.mutateAsync(projectId);
    } catch (error) {
      console.error('Failed to start project analysis:', error);
    }
  };

  if (projectLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Project Not Found
          </h2>
          <p className="text-gray-600">
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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
          <Button onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            Upload Video
          </Button>
        </div>

        {/* Videos Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <VideoIcon className="h-5 w-5 text-gray-700" />
            <h2 className="text-xl font-semibold">Videos</h2>
            <span className="text-sm text-gray-500">
              ({videos?.length || 0})
            </span>
          </div>

          {videosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : videos && videos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <VideoIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No videos yet
              </h3>
              <p className="text-gray-600 mb-4">
                Get started by uploading your first video for analysis
              </p>
              <Button onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4" />
                Upload Video
              </Button>
            </div>
          )}
        </div>

        {/* Project Analysis Section */}
        {canRunProjectAnalysis && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-purple-700" />
                <h2 className="text-xl font-semibold">Cross-Video Analysis</h2>
              </div>

              {!projectAnalysis || projectAnalysis.status === 'pending' ? (
                <Button
                  onClick={handleRunProjectAnalysis}
                  disabled={startProjectAnalysis.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
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
                <Badge className="bg-blue-100 text-blue-800">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Running...
                </Badge>
              ) : projectAnalysis.status === 'completed' ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Completed
                </Badge>
              ) : null}
            </div>

            {projectAnalysis?.status === 'running' && (
              <Card className="mb-4 border-blue-200 bg-blue-50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-900">
                        Analyzing patterns across {projectAnalysis.video_ids.length} videos...
                      </p>
                      <p className="text-sm text-blue-700">
                        This may take a few minutes depending on the amount of data.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {projectAnalysis?.status === 'completed' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-purple-600" />
                    Project Analysis Results
                    <Badge variant="outline" className="ml-2">
                      {projectAnalysis.video_ids.length} videos analyzed
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="meta-patterns" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
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
                        <div className="text-center py-8 text-gray-500">
                          No meta-patterns found
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="cross-insights" className="mt-6">
                      {crossInsights && crossInsights.length > 0 ? (
                        <CrossInsightsList crossInsights={crossInsights} />
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          No cross-insights found
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="system-principles" className="mt-6">
                      {systemPrinciples && systemPrinciples.length > 0 ? (
                        <SystemPrinciplesList systemPrinciples={systemPrinciples} />
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          No system principles found
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {!projectAnalysis && (
              <Card className="border-purple-200 bg-purple-50">
                <CardContent className="py-6">
                  <div className="text-center">
                    <Network className="h-12 w-12 text-purple-600 mx-auto mb-3" />
                    <h3 className="font-semibold text-purple-900 mb-2">
                      Ready for Cross-Video Analysis
                    </h3>
                    <p className="text-purple-700 mb-4">
                      You have {videos?.filter(v => v.status === 'completed' && v.analysis?.status === 'completed').length} analyzed videos.
                      Run project analysis to discover patterns and insights across all videos.
                    </p>
                    <Button
                      onClick={handleRunProjectAnalysis}
                      disabled={startProjectAnalysis.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
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
        onOpenChange={setUploadDialogOpen}
      />
    </Layout>
  );
}
