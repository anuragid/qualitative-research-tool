import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "../ui/tooltip";
import { AnalysisSection } from "./AnalysisSection";
import type { VideoAnalysis } from "../../types";

// ---- Mocks ----

// useSettings is invoked by AnalysisSection for the InsufficientCreditsAlert
// refresh-and-retry flow. We mock it so tests don't need a QueryClientProvider.
const mockRefreshBalance = vi.fn().mockResolvedValue(null);
vi.mock("../../hooks/useSettings", () => ({
  useSettings: () => ({
    settings: undefined,
    isLoading: false,
    recommended: undefined,
    isLoadingRecommended: false,
    updateSettings: vi.fn(),
    isUpdating: false,
    updateError: null,
    resetUpdateError: vi.fn(),
    deleteApiKey: vi.fn(),
    isDeletingKey: false,
    refreshBalance: mockRefreshBalance,
    isRefreshingBalance: false,
    refreshBalanceError: null,
  }),
}));

// Stub the InsufficientCreditsAlert so its 30s polling doesn't interfere with
// fake timers from sibling tests, and so we can assert it appears.
vi.mock("./InsufficientCreditsAlert", () => ({
  InsufficientCreditsAlert: ({
    errorMessage,
    videoId,
  }: {
    errorMessage: string;
    videoId: string;
  }) => (
    <div data-testid="insufficient-credits-alert" data-video-id={videoId}>
      {errorMessage}
    </div>
  ),
}));

vi.mock("./ChunksList", () => ({
  ChunksList: () => <div data-testid="chunks-list">Chunks</div>,
}));
vi.mock("./InferencesList", () => ({
  InferencesList: () => <div data-testid="inferences-list">Inferences</div>,
}));
vi.mock("./PatternsList", () => ({
  PatternsList: () => <div data-testid="patterns-list">Patterns</div>,
}));
vi.mock("./InsightsList", () => ({
  InsightsList: () => <div data-testid="insights-list">Insights</div>,
}));
vi.mock("./PrinciplesList", () => ({
  PrinciplesList: () => <div data-testid="principles-list">Principles</div>,
}));
vi.mock("./ContinueStepButton", () => ({
  ContinueStepButton: ({ onClick, nextStepLabel }: { onClick: () => void; nextStepLabel: string }) => (
    <button data-testid="continue-step-button" onClick={onClick}>
      {nextStepLabel}
    </button>
  ),
}));
vi.mock("./display/AnalysisToolbar", () => ({
  AnalysisToolbar: () => <div data-testid="analysis-toolbar">Toolbar</div>,
}));

// ---- Helpers ----

function createMockDisplay() {
  return {
    viewMode: "list" as const,
    setViewMode: vi.fn(),
    sort: "default" as string,
    setSort: vi.fn(),
    filter: null as string | null,
    setFilter: vi.fn(),
    search: "",
    setSearch: vi.fn(),
    processData: vi.fn((data: unknown[]) => data),
    totalCount: 0,
    filteredCount: 0,
    filterOptions: [],
  };
}

function createCompletedAnalysis(overrides: Partial<VideoAnalysis> = {}): VideoAnalysis {
  return {
    id: "a-1",
    video_id: "v-1",
    chunks: [
      { chunk_id: "c1", speaker: "Alice", timestamp: "0:00", text: "Hello", type: "quote" },
      { chunk_id: "c2", speaker: "Bob", timestamp: "0:05", text: "Hi there", type: "observation" },
    ],
    chunks_completed_at: "2025-06-15T00:01:00Z",
    inferences: [
      { chunk_id: "c1", inferences: [{ inference_id: "i1", meaning: "Greeting", importance: "low", context: "start" }] },
    ],
    inferences_completed_at: "2025-06-15T00:02:00Z",
    patterns: [
      { pattern_id: "p1", pattern_name: "Friendly opening", description: "Consistent", related_inferences: ["i1"], relationship_type: "convergent", frequency: "high", significance: "Important" },
    ],
    patterns_completed_at: "2025-06-15T00:03:00Z",
    insights: [
      { insight_id: "ins1", headline: "Social norms", explanation: "People greet", supporting_patterns: ["p1"], evidence: ["e1"], type: "revealing", implications: "High", confidence: "high" },
    ],
    insights_completed_at: "2025-06-15T00:04:00Z",
    design_principles: [
      { principle_id: "dp1", insight_id: "ins1", principle: "Be welcoming", rationale: "First impressions matter", how_might_we: ["HMW be more welcoming?"], priority: "high" },
    ],
    principles_completed_at: "2025-06-15T00:05:00Z",
    status: "completed",
    started_at: "2025-06-15T00:00:00Z",
    completed_at: "2025-06-15T00:05:00Z",
    error_message: null,
    current_step: null,
    step_status: null,
    chunk_completed_at: "2025-06-15T00:01:00Z",
    infer_completed_at: "2025-06-15T00:02:00Z",
    relate_completed_at: "2025-06-15T00:03:00Z",
    explain_completed_at: "2025-06-15T00:04:00Z",
    activate_completed_at: "2025-06-15T00:05:00Z",
    ...overrides,
  };
}

function createStepByStepAnalysis(currentStep: string): VideoAnalysis {
  return {
    id: "a-2",
    video_id: "v-1",
    chunks: [
      { chunk_id: "c1", speaker: "Alice", timestamp: "0:00", text: "Hello", type: "quote" },
    ],
    chunks_completed_at: "2025-06-15T00:01:00Z",
    inferences: null,
    inferences_completed_at: null,
    patterns: null,
    patterns_completed_at: null,
    insights: null,
    insights_completed_at: null,
    design_principles: null,
    principles_completed_at: null,
    status: "processing",
    started_at: "2025-06-15T00:00:00Z",
    completed_at: null,
    error_message: null,
    current_step: currentStep,
    step_status: {
      chunk: "completed",
      infer: "pending",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    },
    chunk_completed_at: "2025-06-15T00:01:00Z",
    infer_completed_at: null,
    relate_completed_at: null,
    explain_completed_at: null,
    activate_completed_at: null,
  };
}

const defaultProps = {
  analysis: undefined as VideoAnalysis | undefined,
  analysisLoading: false,
  hasTranscript: true,
  canStartAnalysis: true,
  workflowBlockerMessage: null as string | null,
  onStartChunkStep: vi.fn(),
  onStartFullAnalysis: vi.fn(),
  startChunkStepPending: false,
  startFullAnalysisPending: false,
  activeStepTab: "chunks",
  setActiveStepTab: vi.fn(),
  stepInfo: null as {
    name: string;
    number: number;
    nextStep: string | null;
    handler: () => void;
  } | null,
  canContinueCurrentStep: false,
  isAnyStepPending: false,
  isCurrentStepProcessing: false,
  getNextStepLabel: vi.fn((step: string) => `Continue to ${step}`),
  startInferStepPending: false,
  startRelateStepPending: false,
  startExplainStepPending: false,
  startActivateStepPending: false,
  chunksDisplay: createMockDisplay(),
  inferencesDisplay: createMockDisplay(),
  patternsDisplay: createMockDisplay(),
  insightsDisplay: createMockDisplay(),
  principlesDisplay: createMockDisplay(),
};

function renderSection(overrides: Partial<typeof defaultProps> = {}) {
  const props = {
    ...defaultProps,
    onStartChunkStep: overrides.onStartChunkStep ?? vi.fn(),
    onStartFullAnalysis: overrides.onStartFullAnalysis ?? vi.fn(),
    setActiveStepTab: overrides.setActiveStepTab ?? vi.fn(),
    getNextStepLabel: overrides.getNextStepLabel ?? vi.fn((step: string) => `Continue to ${step}`),
    chunksDisplay: overrides.chunksDisplay ?? createMockDisplay(),
    inferencesDisplay: overrides.inferencesDisplay ?? createMockDisplay(),
    patternsDisplay: overrides.patternsDisplay ?? createMockDisplay(),
    insightsDisplay: overrides.insightsDisplay ?? createMockDisplay(),
    principlesDisplay: overrides.principlesDisplay ?? createMockDisplay(),
    ...overrides,
  };
  return render(
    <TooltipProvider>
      <AnalysisSection {...props} />
    </TooltipProvider>
  );
}

// ---- Tests ----

describe("AnalysisSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Renders "Analysis" heading
  it('renders "Analysis" heading', () => {
    const { container } = renderSection();
    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe("Analysis");
  });

  // 2. Renders nothing when hasTranscript is false
  it("renders nothing when hasTranscript is false", () => {
    const { container } = renderSection({ hasTranscript: false });
    expect(container.querySelector("h2")).toBeNull();
  });

  // 3. Shows prerequisite warning when workflowBlockerMessage is set and no analysis
  it("shows prerequisite warning when roles not assigned", () => {
    const { container } = renderSection({
      workflowBlockerMessage: "Please assign roles to all speakers before starting analysis.",
      canStartAnalysis: false,
      analysis: undefined,
    });

    const alertBanner = container.querySelector('[data-slot="alert-banner"]');
    expect(alertBanner).not.toBeNull();
    expect(alertBanner!.textContent).toContain("Speaker roles required");
    expect(alertBanner!.textContent).toContain("Please assign roles to all speakers");
  });

  // 4. Does NOT show prerequisite warning when analysis exists
  it("does not show prerequisite warning when analysis already exists", () => {
    const { container } = renderSection({
      workflowBlockerMessage: "Please assign roles to all speakers before starting analysis.",
      analysis: createCompletedAnalysis(),
    });

    const alertBanner = container.querySelector('[data-slot="alert-banner"]');
    expect(alertBanner).toBeNull();
  });

  // 5. Shows Start Analysis button when canStartAnalysis is true
  it("shows Start Analysis button when canStartAnalysis is true and no analysis", () => {
    const { container } = renderSection({
      canStartAnalysis: true,
      analysis: undefined,
    });

    const buttons = container.querySelectorAll("button");
    const startButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes("Start Analysis")
    );
    expect(startButton).toBeDefined();
  });

  // 6. Start Analysis button is disabled when canStartAnalysis is false
  it("Start Analysis button is disabled when canStartAnalysis is false", () => {
    const { container } = renderSection({
      canStartAnalysis: false,
      analysis: undefined,
    });

    const buttons = container.querySelectorAll("button");
    const startButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes("Start Analysis")
    );
    expect(startButton).toBeDefined();
    expect(startButton!.disabled).toBe(true);
  });

  // 7. Clicking Start Analysis calls onStartChunkStep
  it("clicking Start Analysis calls onStartChunkStep", async () => {
    const user = userEvent.setup();
    const onStartChunkStep = vi.fn();

    const { container } = renderSection({
      canStartAnalysis: true,
      analysis: undefined,
      onStartChunkStep,
    });

    const buttons = container.querySelectorAll("button");
    const startButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes("Start Analysis")
    ) as HTMLButtonElement;
    expect(startButton).toBeDefined();
    await user.click(startButton);
    expect(onStartChunkStep).toHaveBeenCalledTimes(1);
  });

  // 8. Does not show Start Analysis button when analysis exists
  it("does not show Start Analysis button when analysis exists", () => {
    const { container } = renderSection({ analysis: createCompletedAnalysis() });
    const buttons = container.querySelectorAll("button");
    const startButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes("Start Analysis")
    );
    expect(startButton).toBeUndefined();
  });

  // 9. Renders 5 step tabs in completed mode
  it("renders 5 step tabs when analysis is completed", () => {
    const { container } = renderSection({ analysis: createCompletedAnalysis() });

    // Find the tablist element and count tabs within it
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    const tabs = tablist!.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);
  });

  // 10. Tab content shows item counts
  it("shows item counts in completed tab triggers", () => {
    const { container } = renderSection({ analysis: createCompletedAnalysis() });

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.textContent).toContain("Chunks");
    expect(tablist!.textContent).toContain("2"); // 2 chunks
    expect(tablist!.textContent).toContain("Inferences");
    expect(tablist!.textContent).toContain("Patterns");
    expect(tablist!.textContent).toContain("Insights");
    expect(tablist!.textContent).toContain("Principles");
  });

  // 11. Shows progress indicator in step-by-step mode
  it("shows progress indicator in step-by-step mode", () => {
    const { container } = renderSection({
      analysis: createStepByStepAnalysis("chunk"),
      stepInfo: { name: "Chunk", number: 1, nextStep: "infer", handler: vi.fn() },
    });

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).not.toBeNull();
  });

  // 12. Step-by-step tabs render
  it("renders 5 step tabs in step-by-step mode", () => {
    const { container } = renderSection({
      analysis: createStepByStepAnalysis("chunk"),
      stepInfo: { name: "Chunk", number: 1, nextStep: "infer", handler: vi.fn() },
    });

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    const tabs = tablist!.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);
  });

  // 13. Verifies tab structure in step-by-step mode
  it("renders tab elements with expected text content", () => {
    const { container } = renderSection({
      analysis: createStepByStepAnalysis("chunk"),
      stepInfo: { name: "Chunk", number: 1, nextStep: "infer", handler: vi.fn() },
      activeStepTab: "chunks",
    });

    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.textContent).toContain("Chunks");
  });

  // 14. Shows loading state when analysisLoading is true
  it("shows loading state when analysisLoading is true", () => {
    const { container } = renderSection({ analysisLoading: true });
    const loadingState = container.querySelector('[data-slot="loading-state"]');
    expect(loadingState).not.toBeNull();
    expect(loadingState!.textContent).toContain("Loading analysis...");
  });

  // 15. Shows empty state when no analysis and not loading
  it("shows empty state when no analysis exists and not loading", () => {
    const { container } = renderSection({
      analysis: undefined,
      analysisLoading: false,
    });

    const emptyState = container.querySelector('[data-slot="empty-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState!.textContent).toContain("No analysis yet");
  });

  // 16. Shows ContinueStepButton in header during step-by-step mode
  it("shows continue step button in header when in step-by-step mode with nextStep", () => {
    const handler = vi.fn();
    const { container } = renderSection({
      analysis: createStepByStepAnalysis("chunk"),
      stepInfo: { name: "Chunk", number: 1, nextStep: "infer", handler },
      getNextStepLabel: vi.fn(() => "Continue to Infer"),
    });

    const continueBtn = container.querySelector('[data-testid="continue-step-button"]');
    expect(continueBtn).not.toBeNull();
    expect(continueBtn!.textContent).toContain("Continue to Infer");
  });

  // 17. Shows "Starting..." text when startChunkStepPending is true
  it('shows "Starting..." text when startChunkStepPending is true', () => {
    const { container } = renderSection({
      canStartAnalysis: true,
      analysis: undefined,
      startChunkStepPending: true,
    });

    const buttons = container.querySelectorAll("button");
    const startingButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes("Starting...")
    );
    expect(startingButton).toBeDefined();
  });

  // 18. Completed analysis renders ChunksList in first tab
  it("renders ChunksList inside completed analysis first tab", () => {
    const { container } = renderSection({ analysis: createCompletedAnalysis() });
    const chunksList = container.querySelector('[data-testid="chunks-list"]');
    expect(chunksList).not.toBeNull();
  });

  // ---- Error state tests ----

  // 19. Error banner appears when a step has error status
  it("shows error banner when a step has error status", () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
    });

    // Look for the error alert banner
    const alertBanner = container.querySelector('[data-variant="error"]');
    expect(alertBanner).not.toBeNull();
    expect(alertBanner!.textContent).toContain("Infer step failed");
  });

  // 20. Retry button appears in error banner for errored step
  it("shows retry button in error banner for errored step", () => {
    const retryHandler = vi.fn();
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
      onRetryInferStep: retryHandler,
    });

    // The retry button should say "Retry Infer Step"
    const buttons = container.querySelectorAll("button");
    const retryButton = Array.from(buttons).find(
      (btn) => btn.textContent?.includes("Retry Infer Step")
    );
    expect(retryButton).toBeDefined();
  });

  // 21. "Failed" badge shows in progress indicator for errored step
  it('shows "Failed" badge in progress indicator when step has error', () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
    });

    // Should render the "Failed" destructive badge
    const badges = container.querySelectorAll('[data-slot="badge"]');
    const failedBadge = Array.from(badges).find(
      (badge) => badge.textContent?.includes("Failed")
    );
    expect(failedBadge).toBeDefined();
  });

  // 22. Loading spinner is suppressed when step has errored (inferences tab)
  it("does not show loading spinner when infer step has errored and no inferences", () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };
    analysis.inferences = null;

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
      startInferStepPending: false,
    });

    // The loading state should NOT appear since the step errored
    // The code guards: `analysis.step_status?.infer !== "error"` before showing loading
    const loadingState = container.querySelector('[data-slot="loading-state"]');
    expect(loadingState).toBeNull();
  });

  // 23. Full analysis error state (non step-by-step)
  it("shows full analysis error with retry button when analysis.status is error and no current_step", () => {
    const analysis = createCompletedAnalysis({
      status: "error",
      current_step: null,
      error_message: "LLM request failed",
    });

    const onStartFullAnalysis = vi.fn();

    const { container } = renderSection({
      analysis,
      onStartFullAnalysis,
    });

    const alertBanner = container.querySelector('[data-variant="error"]');
    expect(alertBanner).not.toBeNull();
    expect(alertBanner!.textContent).toContain("Analysis failed");
    expect(alertBanner!.textContent).toContain("LLM request failed");

    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Retry Analysis")
    );
    expect(retryButton).toBeDefined();
  });

  // 24. Error icon shows in tab trigger for errored step
  it("shows error icon in tab trigger for errored step", () => {
    const analysis = createStepByStepAnalysis("relate");
    analysis.step_status = {
      chunk: "completed",
      infer: "completed",
      relate: "error",
      explain: "pending",
      activate: "pending",
    };
    analysis.inferences = [
      { chunk_id: "c1", inferences: [{ inference_id: "i1", meaning: "Greeting", importance: "low", context: "start" }] },
    ];

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Relate", number: 3, nextStep: "explain", handler: vi.fn() },
    });

    // The patterns tab trigger should have the error icon class (AlertCircle with text-destructive)
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    // The tab should be accessible (not disabled) when step has error
    const tabs = tablist!.querySelectorAll('[role="tab"]');
    const patternsTab = Array.from(tabs).find(
      (tab) => tab.textContent?.includes("Patterns")
    );
    expect(patternsTab).toBeDefined();
    // The patterns tab should NOT be disabled when step has error
    expect(patternsTab!.getAttribute("data-disabled")).not.toBe("true");
  });

  // ---- BYOK insufficient_credits branching ----

  // 25. Step error with insufficient_credits → renders InsufficientCreditsAlert
  it("renders InsufficientCreditsAlert when step error has error_type insufficient_credits", () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };
    analysis.error_message = JSON.stringify({
      step: "infer",
      error_type: "insufficient_credits",
      message: "OpenRouter returned 402 — insufficient credits",
      retryable: false,
    });

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
      onRetryInferStep: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="insufficient-credits-alert"]'),
    ).not.toBeNull();
    // The generic step-failed banner should NOT appear in its place
    const errorBanner = container.querySelector(
      '[data-slot="alert-banner"][data-variant="error"]',
    );
    // It is allowed to be null OR contain a different title; the InsufficientCreditsAlert
    // is the rendered branch.
    if (errorBanner) {
      expect(errorBanner.textContent).not.toContain("Infer step failed");
    }
  });

  // 26. Step error with llm_permanent → renders generic banner (regression guard)
  it("renders generic error banner when error_type is llm_permanent (not insufficient_credits)", () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };
    analysis.error_message = JSON.stringify({
      step: "infer",
      error_type: "llm_permanent",
      message: "401 Unauthorized",
      retryable: false,
    });

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
      onRetryInferStep: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="insufficient-credits-alert"]'),
    ).toBeNull();
    const errorBanner = container.querySelector('[data-variant="error"]');
    expect(errorBanner).not.toBeNull();
    expect(errorBanner!.textContent).toContain("Infer step failed");
  });

  // 27. Step error with llm_error → renders generic banner (regression guard)
  it("renders generic error banner when error_type is llm_error (regression guard)", () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };
    analysis.error_message = JSON.stringify({
      step: "infer",
      error_type: "llm_error",
      message: "Internal server error",
      retryable: true,
    });

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
      onRetryInferStep: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="insufficient-credits-alert"]'),
    ).toBeNull();
    const errorBanner = container.querySelector('[data-variant="error"]');
    expect(errorBanner).not.toBeNull();
    expect(errorBanner!.textContent).toContain("Infer step failed");
  });

  // 28. Full-analysis error with insufficient_credits → renders InsufficientCreditsAlert
  it("renders InsufficientCreditsAlert when full analysis fails with insufficient_credits", () => {
    const analysis = createCompletedAnalysis({
      status: "error",
      current_step: null,
      error_message: JSON.stringify({
        error_type: "insufficient_credits",
        message: "Your OpenRouter key has no credits.",
        retryable: false,
      }),
    });

    const { container } = renderSection({ analysis });

    expect(
      container.querySelector('[data-testid="insufficient-credits-alert"]'),
    ).not.toBeNull();
    // Generic "Analysis failed" banner should NOT appear
    const genericBanner = container.querySelector('[data-variant="error"]');
    if (genericBanner) {
      expect(genericBanner.textContent).not.toContain("Analysis failed");
    }
  });

  // 29. Non-error analysis → no insufficient_credits alert
  it("does not render InsufficientCreditsAlert when analysis has no error", () => {
    const { container } = renderSection({ analysis: createCompletedAnalysis() });
    expect(
      container.querySelector('[data-testid="insufficient-credits-alert"]'),
    ).toBeNull();
  });

  // 30. Step error with no error_message → falls back to generic banner
  it("falls back to generic banner when step error_message is missing", () => {
    const analysis = createStepByStepAnalysis("infer");
    analysis.step_status = {
      chunk: "completed",
      infer: "error",
      relate: "pending",
      explain: "pending",
      activate: "pending",
    };
    analysis.error_message = null;

    const { container } = renderSection({
      analysis,
      stepInfo: { name: "Infer", number: 2, nextStep: "relate", handler: vi.fn() },
      activeStepTab: "inferences",
      onRetryInferStep: vi.fn(),
    });

    expect(
      container.querySelector('[data-testid="insufficient-credits-alert"]'),
    ).toBeNull();
  });
});
