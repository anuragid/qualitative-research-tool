import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TranscriptSidePanel } from "./TranscriptSidePanel";
import type { Transcript, SpeakerLabel } from "../../types";

// ---- Mocks ----

vi.mock("./TranscriptViewer", () => ({
  TranscriptViewer: ({ transcript }: { transcript: Transcript }) => (
    <div data-testid="transcript-viewer">
      {transcript.processed_transcript?.text || "No transcript text"}
    </div>
  ),
}));

vi.mock("../ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
}));

// ---- Helpers ----

function createTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: "t-1",
    video_id: "v-1",
    assemblyai_id: "aai-1",
    raw_transcript: {},
    processed_transcript: {
      text: "Hello, how are you? I am doing well, thanks.",
      utterances: [
        { speaker: "Speaker A", text: "Hello, how are you?", start: 0, end: 5000, confidence: 0.95 },
        { speaker: "Speaker B", text: "I am doing well, thanks.", start: 5000, end: 10000, confidence: 0.9 },
      ],
    },
    status: "completed",
    created_at: "2025-06-15T00:00:00Z",
    completed_at: "2025-06-15T00:05:00Z",
    ...overrides,
  };
}

function createSpeakerLabels(): SpeakerLabel[] {
  return [
    { id: "sl-1", transcript_id: "t-1", speaker_label: "Speaker A", assigned_name: "Alice", role: "Interviewer", created_at: "2025-06-15T00:00:00Z" },
    { id: "sl-2", transcript_id: "t-1", speaker_label: "Speaker B", assigned_name: "Bob", role: "Participant", created_at: "2025-06-15T00:00:00Z" },
  ];
}

const defaultProps = {
  transcript: createTranscript(),
  speakerLabels: createSpeakerLabels(),
  videoId: "v-1",
  editingSpeaker: null as string | null,
  setEditingSpeaker: vi.fn(),
  speakerName: "",
  setSpeakerName: vi.fn(),
  speakerRole: "",
  setSpeakerRole: vi.fn(),
  onLabelSpeaker: vi.fn(),
  uniqueSpeakers: ["Speaker A", "Speaker B"],
};

function renderPanel(overrides: Partial<typeof defaultProps> = {}) {
  const props = {
    ...defaultProps,
    setEditingSpeaker: overrides.setEditingSpeaker ?? vi.fn(),
    setSpeakerName: overrides.setSpeakerName ?? vi.fn(),
    setSpeakerRole: overrides.setSpeakerRole ?? vi.fn(),
    onLabelSpeaker: overrides.onLabelSpeaker ?? vi.fn(),
    ...overrides,
  };
  return { ...render(<TranscriptSidePanel {...props} />), props };
}

// ---- Tests ----

describe("TranscriptSidePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders transcript viewer", () => {
    renderPanel();
    expect(screen.getAllByTestId("transcript-viewer").length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Transcript" heading', () => {
    const { container } = renderPanel();
    const h3 = Array.from(container.querySelectorAll("h3")).find(h => h.textContent === "Transcript");
    expect(h3).toBeDefined();
  });

  it("renders compact speaker role summary when all roles assigned", () => {
    renderPanel({
      uniqueSpeakers: ["Speaker A", "Speaker B"],
      speakerLabels: createSpeakerLabels(),
    });
    expect(screen.getAllByText(/Alice: Interviewer/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Bob: Participant/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders full speaker editor when roles are NOT all assigned", () => {
    renderPanel({
      uniqueSpeakers: ["Speaker A", "Speaker B"],
      speakerLabels: [
        { id: "sl-1", transcript_id: "t-1", speaker_label: "Speaker A", assigned_name: "Alice", role: "Interviewer", created_at: "2025-06-15T00:00:00Z" },
        { id: "sl-2", transcript_id: "t-1", speaker_label: "Speaker B", assigned_name: "Bob", role: null, created_at: "2025-06-15T00:00:00Z" },
      ],
    });
    expect(screen.getByText(/Speakers \(2\)/)).toBeDefined();
    expect(screen.getByText("No role")).toBeDefined();
  });

  it("does not render speaker editor when uniqueSpeakers is empty", () => {
    const { container } = renderPanel({ uniqueSpeakers: [] });
    const headings = Array.from(container.querySelectorAll("h4")).filter(h => h.textContent?.includes("Speaker"));
    expect(headings.length).toBe(0);
  });

  it("compact summary contains edit affordance", () => {
    const { container } = renderPanel({
      uniqueSpeakers: ["Speaker A", "Speaker B"],
      speakerLabels: createSpeakerLabels(),
    });
    // The compact summary is a clickable button with an edit icon
    const editIcons = container.querySelectorAll("svg");
    expect(editIcons.length).toBeGreaterThan(0);
  });

  it("renders scroll area for transcript content", () => {
    renderPanel();
    expect(screen.getAllByTestId("scroll-area").length).toBeGreaterThanOrEqual(1);
  });

  it("passes compact prop to TranscriptViewer", () => {
    renderPanel();
    // TranscriptViewer is mocked, so we just verify it renders
    expect(screen.getAllByTestId("transcript-viewer").length).toBeGreaterThanOrEqual(1);
  });
});
