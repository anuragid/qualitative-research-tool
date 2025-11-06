import { useRef, useState, useEffect, useCallback } from "react";
import { useWordLevelTranscript } from "../../hooks/useWordLevelTranscript";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Input";
import type { Word } from "../../types";

interface VideoTranscriptSyncProps {
  videoUrl: string;
  videoId: string;
}

// Speaker color coding for visual clarity
const speakerColors: Record<string, string> = {
  Interviewer: "text-blue-700",
  Participant: "text-green-700",
  A: "text-blue-700",
  B: "text-green-700",
  C: "text-purple-700",
  D: "text-orange-700",
};

function getSpeakerColor(speaker: string): string {
  // Handle null/undefined speakers
  if (!speaker) {
    return "text-gray-700";
  }

  if (speakerColors[speaker]) {
    return speakerColors[speaker];
  }

  // Auto-generate color for unknown speakers based on hash
  const hash = speaker.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const colors = ["text-gray-700", "text-indigo-700", "text-pink-700", "text-teal-700"];
  return colors[hash % colors.length];
}

export function VideoTranscriptSync({ videoUrl, videoId }: VideoTranscriptSyncProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // State
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  // Fetch data
  const { data: transcript, isLoading } = useWordLevelTranscript(videoId);
  const { data: searchResults } = useTranscriptSearch(videoId, searchQuery);

  /**
   * Binary search to find current word by timestamp (O(log n) - optimized for 10K+ words)
   * This is critical for performance with long videos (45+ minutes)
   */
  const findCurrentWordIndex = useCallback((words: Word[], timeMs: number): number => {
    let left = 0;
    let right = words.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const word = words[mid];

      if (timeMs >= word.start && timeMs <= word.end) {
        return mid;
      } else if (timeMs < word.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // If exact match not found, return the closest word before the timestamp
    return left > 0 ? left - 1 : -1;
  }, []);

  /**
   * Video → Transcript sync (as video plays, highlight current word)
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !transcript?.words) return;

    const handleTimeUpdate = () => {
      const timeMs = video.currentTime * 1000;
      const index = findCurrentWordIndex(transcript.words, timeMs);
      setCurrentWordIndex(index);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [transcript, findCurrentWordIndex]);

  /**
   * Auto-scroll transcript to current word
   */
  useEffect(() => {
    if (currentWordIndex === -1) return;

    const wordElement = document.getElementById(`word-${currentWordIndex}`);
    if (wordElement && transcriptRef.current) {
      wordElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentWordIndex]);

  /**
   * Transcript → Video sync (click word to jump to timestamp)
   */
  const handleWordClick = useCallback(
    (wordIndex: number) => {
      const word = transcript?.words[wordIndex];
      if (word && videoRef.current) {
        videoRef.current.currentTime = word.start / 1000;
      }
    },
    [transcript]
  );

  /**
   * Search: Jump to first match timestamp
   */
  const handleSearchMatchClick = useCallback((timestamp: [number, number]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp[0] / 1000;
    }
  }, []);

  /**
   * Keyboard shortcuts for video navigation
   */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in search box
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      if (!videoRef.current) return;

      switch (e.key) {
        case " ": // Space - Play/Pause
          e.preventDefault();
          if (videoRef.current.paused) {
            videoRef.current.play();
          } else {
            videoRef.current.pause();
          }
          break;
        case "ArrowLeft": // ← - Rewind 5 seconds
          e.preventDefault();
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          break;
        case "ArrowRight": // → - Forward 5 seconds
          e.preventDefault();
          videoRef.current.currentTime = Math.min(
            videoRef.current.duration,
            videoRef.current.currentTime + 5
          );
          break;
        case "ArrowUp": // ↑ - Increase speed
          e.preventDefault();
          setPlaybackSpeed((prev) => Math.min(2, prev + 0.25));
          break;
        case "ArrowDown": // ↓ - Decrease speed
          e.preventDefault();
          setPlaybackSpeed((prev) => Math.max(0.5, prev - 0.25));
          break;
        case "f": // F - Fullscreen
        case "F":
          e.preventDefault();
          if (videoRef.current.requestFullscreen) {
            videoRef.current.requestFullscreen();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  /**
   * Update video playback speed when state changes
   */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading transcript...</p>
        </div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-600">No transcript available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Video Player Section */}
      <div className="space-y-4">
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full aspect-video"
          />
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Speed:</label>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="0.5">0.5×</option>
                <option value="0.75">0.75×</option>
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>
            </div>
            <div className="text-xs text-gray-500">
              {isPlaying ? "▶ Playing" : "⏸ Paused"}
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {transcript.words.length.toLocaleString()} words • Click any word to jump
          </div>
        </div>
      </div>

      {/* Transcript Section */}
      <div className="space-y-4">
        {/* Search Box */}
        <div>
          <Input
            type="text"
            placeholder="Search transcript (e.g., design, prototype, user)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Search Results */}
        {searchResults && searchResults.matches && searchResults.matches.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <span className="text-xs font-medium text-yellow-800">
              Found {searchResults.total_count} matches:
            </span>
            {searchResults.matches.map((match) => (
              <Badge
                key={match.text}
                onClick={() =>
                  match.timestamps[0] && handleSearchMatchClick(match.timestamps[0])
                }
                className="cursor-pointer hover:bg-yellow-200 bg-yellow-100 text-yellow-800"
              >
                {match.text} ({match.count}×)
              </Badge>
            ))}
          </div>
        )}

        {/* Transcript with word highlighting */}
        <div
          ref={transcriptRef}
          className="h-[600px] overflow-y-auto border rounded-lg p-6 bg-white shadow-sm"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="leading-relaxed">
            {transcript.words.map((word, index) => (
              <span
                key={index}
                id={`word-${index}`}
                onClick={() => handleWordClick(index)}
                className={`
                  cursor-pointer px-0.5 rounded transition-all duration-100
                  ${
                    index === currentWordIndex
                      ? "bg-blue-500 text-white font-semibold shadow-sm scale-105"
                      : "hover:bg-gray-100"
                  }
                  ${getSpeakerColor(word.speaker)}
                `}
                title={`${word.speaker || "Unknown"} (${(word.start / 1000).toFixed(1)}s)`}
              >
                {word.text}{" "}
              </span>
            ))}
          </div>
        </div>

        {/* Speaker Legend */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">Speakers</h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(transcript.words.map((w) => w.speaker)))
              .filter((speaker) => speaker) // Filter out null/undefined speakers
              .map((speaker) => (
                <Badge
                  key={speaker}
                  className={`${getSpeakerColor(speaker)} bg-white border`}
                >
                  {speaker || "Unknown"}
                </Badge>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
