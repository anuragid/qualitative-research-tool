import { ChunksList } from "./ChunksList";
import { InferencesList } from "./InferencesList";
import { PatternsList } from "./PatternsList";
import { InsightsList } from "./InsightsList";
import { PrinciplesList } from "./PrinciplesList";
import { ContinueStepButton } from "./ContinueStepButton";
import { AnalysisToolbar } from "./display/AnalysisToolbar";
import { useAnalysisDisplay } from "./hooks/useAnalysisDisplay";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Progress } from "../ui/progress";
import { SimpleTooltip } from "../ui/tooltip";
import { LoadingState } from "../ui/loading-state";
import { EmptyState } from "../ui/empty-state";
import { AlertBanner } from "../ui/alert-banner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Loader2,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  MoreVertical,
  Zap,
} from "lucide-react";
import type { VideoAnalysis } from "../../types";

interface AnalysisSectionProps {
  analysis: VideoAnalysis | undefined;
  analysisLoading: boolean;
  hasTranscript: boolean;
  canStartAnalysis: boolean;
  workflowBlockerMessage: string | null;
  // Step handlers
  onStartChunkStep: () => void;
  onStartFullAnalysis: () => void;
  startChunkStepPending: boolean;
  startFullAnalysisPending: boolean;
  // Step-by-step state
  activeStepTab: string;
  setActiveStepTab: (tab: string) => void;
  // Step info
  stepInfo: {
    name: string;
    number: number;
    nextStep: string | null;
    handler: () => void;
  } | null;
  canContinueCurrentStep: boolean;
  isAnyStepPending: boolean;
  isCurrentStepProcessing: boolean;
  getNextStepLabel: (step: string) => string;
  // Step pending states for loading indicators
  startInferStepPending: boolean;
  startRelateStepPending: boolean;
  startExplainStepPending: boolean;
  startActivateStepPending: boolean;
  // Display hooks
  chunksDisplay: ReturnType<typeof useAnalysisDisplay>;
  inferencesDisplay: ReturnType<typeof useAnalysisDisplay>;
  patternsDisplay: ReturnType<typeof useAnalysisDisplay>;
  insightsDisplay: ReturnType<typeof useAnalysisDisplay>;
  principlesDisplay: ReturnType<typeof useAnalysisDisplay>;
}

export function AnalysisSection({
  analysis,
  analysisLoading,
  hasTranscript,
  canStartAnalysis,
  workflowBlockerMessage,
  onStartChunkStep,
  onStartFullAnalysis,
  startChunkStepPending,
  startFullAnalysisPending,
  activeStepTab,
  setActiveStepTab,
  stepInfo,
  canContinueCurrentStep,
  isAnyStepPending,
  isCurrentStepProcessing,
  getNextStepLabel,
  startInferStepPending,
  startRelateStepPending,
  startExplainStepPending,
  startActivateStepPending,
  chunksDisplay,
  inferencesDisplay,
  patternsDisplay,
  insightsDisplay,
  principlesDisplay,
}: AnalysisSectionProps) {
  if (!hasTranscript) return null;

  const hasAnalysis = analysis && analysis.status === "completed";
  const isStepByStepMode = analysis && analysis.status !== "completed";

  // Header with action buttons
  const renderHeader = () => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <h2 className="text-h3 text-foreground">Analysis</h2>
      <div className="flex items-center gap-2">
        {/* Show start buttons if no analysis yet */}
        {!analysis && (
          <>
            <SimpleTooltip
              content={canStartAnalysis
                ? "Start step-by-step analysis (recommended)"
                : "Complete speaker role assignments first"
              }
            >
              <Button
                onClick={onStartChunkStep}
                disabled={!canStartAnalysis || startChunkStepPending}
                className="rounded-full"
              >
                {startChunkStepPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
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
                  size="sm"
                  className="h-9 w-9 p-0 rounded-full"
                  disabled={!canStartAnalysis || startChunkStepPending || startFullAnalysisPending}
                >
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">More options</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={onStartFullAnalysis}
                  disabled={startFullAnalysisPending}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Run Full Analysis (Advanced)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {/* Step-by-step continue button in header */}
        {isStepByStepMode && stepInfo?.nextStep && (
          <ContinueStepButton
            onClick={stepInfo.handler}
            nextStepLabel={getNextStepLabel(stepInfo.nextStep)}
            canContinue={canContinueCurrentStep}
            isAnyStepPending={isAnyStepPending}
            isCurrentStepProcessing={isCurrentStepProcessing}
            size="sm"
          />
        )}
      </div>
    </div>
  );

  // Prerequisite warning
  const renderPrerequisiteWarning = () => {
    if (!workflowBlockerMessage || analysis) return null;
    return (
      <AlertBanner variant="warning" title="Speaker roles required" className="mb-6">
        {workflowBlockerMessage}
      </AlertBanner>
    );
  };

  // Progress indicator for step-by-step mode
  const renderProgressIndicator = () => {
    if (!isStepByStepMode || !stepInfo) return null;
    return (
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-tertiary">Step:</span>
          <Badge variant="default">
            {stepInfo.number}/5 &mdash; {stepInfo.name}
          </Badge>
          {analysis?.current_step && analysis?.step_status?.[analysis.current_step] === "processing" && (
            <Badge variant="outline">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Processing
            </Badge>
          )}
        </div>
        <Progress value={(stepInfo.number / 5) * 100} className="h-1.5 flex-1" />
      </div>
    );
  };

  // Completed analysis tabs
  const renderCompletedTabs = () => {
    if (!hasAnalysis || !analysis) return null;
    return (
      <Tabs defaultValue="chunks" className="w-full">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="chunks" className="whitespace-nowrap">
            Chunks {analysis.chunks && <span className="opacity-50 font-normal">{analysis.chunks.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="inferences" className="whitespace-nowrap">
            Inferences {analysis.inferences && <span className="opacity-50 font-normal">{analysis.inferences.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="patterns" className="whitespace-nowrap">
            Patterns {analysis.patterns && <span className="opacity-50 font-normal">{analysis.patterns.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="insights" className="whitespace-nowrap">
            Insights {analysis.insights && <span className="opacity-50 font-normal">{analysis.insights.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="principles" className="whitespace-nowrap">
            Principles {analysis.design_principles && <span className="opacity-50 font-normal">{analysis.design_principles.length}</span>}
          </TabsTrigger>
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
    );
  };

  // Step-by-step tabs
  const renderStepByStepTabs = () => {
    if (!isStepByStepMode || !stepInfo || !analysis) return null;
    return (
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
            Chunks {analysis.chunks && <span className="opacity-50 font-normal">{analysis.chunks.length}</span>}
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
            Inferences {analysis.inferences && <span className="opacity-50 font-normal">{analysis.inferences.length}</span>}
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
            Patterns {analysis.patterns && <span className="opacity-50 font-normal">{analysis.patterns.length}</span>}
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
            Insights {analysis.insights && <span className="opacity-50 font-normal">{analysis.insights.length}</span>}
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
            Principles {analysis.design_principles && <span className="opacity-50 font-normal">{analysis.design_principles.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chunks" className="mt-6">
          {analysis.step_status?.chunk === "processing" ? (
            <LoadingState message="Processing chunks..." className="bg-card rounded-2xl p-12" />
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
                  <p className="text-text-tertiary mb-4">
                    Review the {analysis.chunks.length} chunks above. When ready, continue to the next step.
                  </p>
                  <ContinueStepButton
                    onClick={stepInfo.handler}
                    nextStepLabel="Continue to Step 2: Infer"
                    canContinue={canContinueCurrentStep}
                    isAnyStepPending={isAnyStepPending}
                    isCurrentStepProcessing={isCurrentStepProcessing}
                  />
                </div>
              )}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="inferences" className="mt-6">
          {(startInferStepPending || analysis.step_status?.infer === "processing") ? (
            <LoadingState message={startInferStepPending ? "Starting..." : "Generating inferences..."} className="bg-card rounded-2xl p-12" />
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
                  <p className="text-text-tertiary mb-4">
                    Review the {analysis.inferences.length} inferences above. When ready, continue to the next step.
                  </p>
                  <ContinueStepButton
                    onClick={stepInfo.handler}
                    nextStepLabel="Continue to Step 3: Relate"
                    canContinue={canContinueCurrentStep}
                    isAnyStepPending={isAnyStepPending}
                    isCurrentStepProcessing={isCurrentStepProcessing}
                  />
                </div>
              )}
            </>
          ) : (
            <LoadingState message="Loading inferences..." className="bg-card rounded-2xl p-12" />
          )}
        </TabsContent>

        <TabsContent value="patterns" className="mt-6">
          {(startRelateStepPending || analysis.step_status?.relate === "processing") ? (
            <LoadingState message={startRelateStepPending ? "Starting..." : "Identifying patterns..."} className="bg-card rounded-2xl p-12" />
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
                  <p className="text-text-tertiary mb-4">
                    Review the {analysis.patterns.length} patterns above. When ready, continue to the next step.
                  </p>
                  <ContinueStepButton
                    onClick={stepInfo.handler}
                    nextStepLabel="Continue to Step 4: Explain"
                    canContinue={canContinueCurrentStep}
                    isAnyStepPending={isAnyStepPending}
                    isCurrentStepProcessing={isCurrentStepProcessing}
                  />
                </div>
              )}
            </>
          ) : (
            <LoadingState message="Loading patterns..." className="bg-card rounded-2xl p-12" />
          )}
        </TabsContent>

        <TabsContent value="insights" className="mt-6">
          {(startExplainStepPending || analysis.step_status?.explain === "processing") ? (
            <LoadingState message={startExplainStepPending ? "Starting..." : "Generating insights..."} className="bg-card rounded-2xl p-12" />
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
                  <p className="text-text-tertiary mb-4">
                    Review the {analysis.insights.length} insights above. When ready, continue to the next step.
                  </p>
                  <ContinueStepButton
                    onClick={stepInfo.handler}
                    nextStepLabel="Continue to Step 5: Activate"
                    canContinue={canContinueCurrentStep}
                    isAnyStepPending={isAnyStepPending}
                    isCurrentStepProcessing={isCurrentStepProcessing}
                  />
                </div>
              )}
            </>
          ) : (
            <LoadingState message="Loading insights..." className="bg-card rounded-2xl p-12" />
          )}
        </TabsContent>

        <TabsContent value="principles" className="mt-6">
          {(startActivateStepPending || analysis.step_status?.activate === "processing") ? (
            <LoadingState message={startActivateStepPending ? "Starting..." : "Generating design principles..."} className="bg-card rounded-2xl p-12" />
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
                <p className="text-text-tertiary">
                  Analysis complete! All 5 steps have been processed.
                </p>
              </div>
            </>
          ) : (
            <LoadingState message="Loading design principles..." className="bg-card rounded-2xl p-12" />
          )}
        </TabsContent>
      </Tabs>
    );
  };

  // Empty state when no analysis
  const renderEmptyState = () => {
    if (analysis || analysisLoading) return null;
    return (
      <EmptyState
        icon={Lightbulb}
        heading="No analysis yet"
        description="Assign speaker roles above, then start the analysis to see results."
        className="bg-card rounded-2xl shadow-card p-12"
      />
    );
  };

  return (
    <div className="mt-8">
      {renderHeader()}
      {renderPrerequisiteWarning()}

      {analysisLoading ? (
        <LoadingState message="Loading analysis..." className="py-12" />
      ) : (
        <>
          {renderProgressIndicator()}
          {renderCompletedTabs()}
          {renderStepByStepTabs()}
          {renderEmptyState()}
        </>
      )}
    </div>
  );
}
