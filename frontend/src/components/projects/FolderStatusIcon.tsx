import { Plus, Play, Check, Archive, AlertCircle } from "lucide-react";
import type { ProjectStatus, Video } from "../../types";

interface FolderStatusIconProps {
  status: ProjectStatus;
  videoCount: number;
  videos?: Video[];
}

/**
 * Derives the active processing phase from video statuses.
 * Returns the most advanced phase currently in progress.
 */
function getProcessingPhase(videos?: Video[]): "transcribing" | "analyzing" | "synthesizing" | "generic" {
  if (!videos || videos.length === 0) return "generic";

  const hasTranscribing = videos.some((v) => v.status === "transcribing");
  const hasAnalyzing = videos.some((v) => v.status === "analyzing");
  const allAnalyzed = videos.every((v) => v.status === "analyzed");

  // If all videos are analyzed, we're in cross-video synthesis
  if (allAnalyzed && videos.length >= 2) return "synthesizing";
  if (hasAnalyzing) return "analyzing";
  if (hasTranscribing) return "transcribing";
  return "generic";
}

/** Waveform bars — custom SVG for transcribing state */
function WaveformIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-[var(--folder-icon-inner)] h-[var(--folder-icon-inner)]">
      <rect x="4" y="10" width="2.5" height="4" rx="1" fill="white"
        style={{ animation: "folder-icon-wave-1 0.8s ease-in-out infinite" }} />
      <rect x="8.5" y="7" width="2.5" height="10" rx="1" fill="white"
        style={{ animation: "folder-icon-wave-2 0.8s ease-in-out 0.1s infinite" }} />
      <rect x="13" y="8" width="2.5" height="8" rx="1" fill="white"
        style={{ animation: "folder-icon-wave-3 0.8s ease-in-out 0.2s infinite" }} />
      <rect x="17.5" y="9" width="2.5" height="6" rx="1" fill="white"
        style={{ animation: "folder-icon-wave-1 0.8s ease-in-out 0.3s infinite" }} />
    </svg>
  );
}

/** Spinning sun — lucide-style SVG for analyzing state */
function AnalyzingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className="w-[var(--folder-icon-inner)] h-[var(--folder-icon-inner)]"
      style={{ animation: `folder-icon-spin var(--duration-spin) linear infinite` }}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
    </svg>
  );
}

/** Orbiting network nodes — custom SVG for synthesizing state */
function SynthesizingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none"
      className="w-[var(--folder-icon-inner)] h-[var(--folder-icon-inner)]"
      style={{ animation: `folder-icon-spin var(--duration-orbit) linear infinite` }}
    >
      <line x1="7" y1="7" x2="12" y2="17" stroke="white" strokeWidth="1.5"
        style={{ animation: "folder-icon-connect-pulse 1.5s ease infinite" }} />
      <line x1="17" y1="7" x2="12" y2="17" stroke="white" strokeWidth="1.5"
        style={{ animation: "folder-icon-connect-pulse 1.5s ease 0.5s infinite" }} />
      <line x1="7" y1="7" x2="17" y2="7" stroke="white" strokeWidth="1.5"
        style={{ animation: "folder-icon-connect-pulse 1.5s ease 1s infinite" }} />
      <circle cx="7" cy="7" r="2.5" fill="white"
        style={{ animation: "folder-icon-node-pulse 2s ease infinite" }} />
      <circle cx="17" cy="7" r="2.5" fill="white"
        style={{ animation: "folder-icon-node-pulse 2s ease 0.6s infinite" }} />
      <circle cx="12" cy="17" r="2.5" fill="white"
        style={{ animation: "folder-icon-node-pulse 2s ease 1.2s infinite" }} />
    </svg>
  );
}

/** Generic spinner — fallback for unknown processing phase */
function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
      className="w-[var(--folder-icon-inner)] h-[var(--folder-icon-inner)]"
      style={{ animation: `folder-icon-spin var(--duration-spin) linear infinite` }}
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function FolderStatusIcon({ status, videoCount, videos }: FolderStatusIconProps) {
  const iconSize = "w-[var(--folder-icon-inner)] h-[var(--folder-icon-inner)]";

  // Static states
  if (status === "planning" || (status === "ready" && videoCount === 0)) {
    return (
      <div className="folder-status-icon" style={{ background: "var(--folder-icon-bg-static)" }}>
        <Plus className={`${iconSize} text-white/70`} />
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="folder-status-icon" style={{ background: "var(--folder-icon-bg-static)" }}>
        <Play className={`${iconSize} text-white/70 fill-white/70`} />
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div
        className="folder-status-icon"
        style={{
          background: "var(--folder-icon-bg-success)",
          animation: "folder-icon-bounce-in 0.5s ease both",
        }}
      >
        <Check className={`${iconSize} text-white`} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="folder-status-icon"
        style={{
          background: "var(--folder-icon-bg-error)",
          animation: "folder-icon-shake 0.5s ease",
        }}
      >
        <AlertCircle className={`${iconSize} text-white`} />
      </div>
    );
  }

  if (status === "archived") {
    return (
      <div className="folder-status-icon" style={{ background: "var(--folder-icon-bg-static)", opacity: 0.6 }}>
        <Archive className={`${iconSize} text-white/70`} />
      </div>
    );
  }

  // Processing states — animated
  if (status === "processing") {
    const phase = getProcessingPhase(videos);

    if (phase === "transcribing") {
      return (
        <div
          className="folder-status-icon"
          style={{
            background: "var(--folder-icon-bg-processing)",
            animation: "folder-icon-pulse var(--duration-continuous) infinite",
            "--pulse-color": "var(--folder-icon-pulse-color)",
          } as React.CSSProperties}
        >
          <WaveformIcon />
        </div>
      );
    }

    if (phase === "analyzing") {
      return (
        <div
          className="folder-status-icon"
          style={{
            background: "var(--folder-icon-bg-analyzing)",
            animation: "folder-icon-pulse var(--duration-continuous) infinite",
            "--pulse-color": "var(--folder-icon-pulse-color-accent)",
          } as React.CSSProperties}
        >
          <AnalyzingIcon />
        </div>
      );
    }

    if (phase === "synthesizing") {
      return (
        <div
          className="folder-status-icon"
          style={{
            background: "var(--folder-icon-bg-analyzing)",
            animation: "folder-icon-pulse var(--duration-continuous) infinite",
            "--pulse-color": "var(--folder-icon-pulse-color-accent)",
          } as React.CSSProperties}
        >
          <SynthesizingIcon />
        </div>
      );
    }

    // Generic fallback
    return (
      <div
        className="folder-status-icon"
        style={{
          background: "var(--folder-icon-bg-processing)",
          animation: "folder-icon-pulse var(--duration-continuous) infinite",
          "--pulse-color": "var(--folder-icon-pulse-color)",
        } as React.CSSProperties}
      >
        <SpinnerIcon />
      </div>
    );
  }

  // Fallback for any unknown status
  return (
    <div className="folder-status-icon" style={{ background: "var(--folder-icon-bg-static)" }}>
      <Plus className={`${iconSize} text-white/70`} />
    </div>
  );
}
