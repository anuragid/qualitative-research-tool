import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Transcript, SpeakerLabel, Word } from "../../types";
import { useWordLevelTranscript } from "../../hooks/useWordLevelTranscript";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Clock, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useDebounce } from "../../hooks/useDebounce";

interface TranscriptViewerProps {
  transcript: Transcript;
  speakerLabels?: SpeakerLabel[];
  onLabelSpeaker?: (speakerLabel: string, name: string, role?: string) => void;
  videoId: string;
  /** Compact mode for sidebar panel — vertical stacking, smaller text, dividers */
  compact?: boolean;
}

// Brand palette colors for speaker labels — cycles through these
const speakerColors = [
  { bg: "bg-brand-forest/15", text: "text-brand-forest", border: "border-brand-forest/30" },
  { bg: "bg-brand-maroon/15", text: "text-brand-maroon", border: "border-brand-maroon/30" },
  { bg: "bg-brand-mustard/15", text: "text-brand-mustard", border: "border-brand-mustard/30" },
  { bg: "bg-interactive-focus-bg", text: "text-interactive-focus", border: "border-interactive-focus-border/30" },
  { bg: "bg-brand-olive/15", text: "text-brand-olive", border: "border-brand-olive/30" },
  { bg: "bg-brand-crimson/15", text: "text-brand-crimson", border: "border-brand-crimson/30" },
];

export function TranscriptViewer({
  transcript,
  speakerLabels = [],
  onLabelSpeaker: _onLabelSpeaker,
  videoId,
  compact = false,
}: TranscriptViewerProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll control: only auto-scroll after user clicks a word;
  // disable when the user manually scrolls the transcript container.
  const autoScrollEnabledRef = useRef(false);
  // Guard flag to ignore scroll events triggered by our own scrollIntoView calls
  const isProgrammaticScrollRef = useRef(false);

  // Fetch word-level transcript for highlighting
  const { data: wordLevelData } = useWordLevelTranscript(videoId);

  // Debounce search query to avoid too many API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Search for words in transcript
  const { data: searchResults, isLoading: searchLoading } = useTranscriptSearch(videoId, debouncedSearchQuery);

  // Build a speaker-to-color map based on order of appearance
  const speakerColorMap = useMemo(() => {
    const map = new Map<string, typeof speakerColors[0]>();
    if (!transcript.processed_transcript?.utterances) return map;
    const seen = new Set<string>();
    for (const utterance of transcript.processed_transcript.utterances) {
      if (!seen.has(utterance.speaker)) {
        seen.add(utterance.speaker);
        map.set(utterance.speaker, speakerColors[(seen.size - 1) % speakerColors.length]);
      }
    }
    return map;
  }, [transcript.processed_transcript?.utterances]);

  const getSpeakerLabel = (speaker: string) => {
    const label = speakerLabels.find((l) => l.speaker_label === speaker);
    return label?.assigned_name || speaker;
  };

  const getSpeakerRole = (speaker: string) => {
    const label = speakerLabels.find((l) => l.speaker_label === speaker);
    return label?.role;
  };

  const formatTimestamp = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      : `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Binary search for current word (performance optimization)
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
    return left > 0 ? left - 1 : -1;
  }, []);

  // Listen to video timeupdate events
  // Uses retry logic because the video element may not be in the DOM yet
  // when wordLevelData loads (race condition with playbackUrl fetch)
  useEffect(() => {
    if (!wordLevelData?.words) return;

    let video: HTMLVideoElement | null = null;
    let retryTimer: ReturnType<typeof setInterval>;

    const handleTimeUpdate = () => {
      if (!video) return;
      const timeMs = video.currentTime * 1000;
      const index = findCurrentWordIndex(wordLevelData.words, timeMs);
      setCurrentWordIndex(index);
    };

    const tryAttach = () => {
      video = document.getElementById("main-video-player") as HTMLVideoElement;
      if (video) {
        clearInterval(retryTimer);
        video.addEventListener("timeupdate", handleTimeUpdate);
        // Sync to current position immediately
        handleTimeUpdate();
      }
    };

    tryAttach();
    if (!video) {
      retryTimer = setInterval(tryAttach, 200);
    }

    return () => {
      clearInterval(retryTimer);
      if (video) {
        video.removeEventListener("timeupdate", handleTimeUpdate);
      }
    };
  }, [wordLevelData, findCurrentWordIndex]);

  // Click word to jump video — also re-enables auto-scroll
  const handleWordClick = useCallback((wordIndex: number) => {
    const video = document.getElementById("main-video-player") as HTMLVideoElement;
    const word = wordLevelData?.words[wordIndex];
    if (video && word) {
      autoScrollEnabledRef.current = true;
      video.currentTime = word.start / 1000;
    }
  }, [wordLevelData]);

  // Detect manual (user-initiated) scrolls on the page.
  // The transcript doesn't have its own scroll container — it scrolls with
  // the page body. When the user scrolls away, disable auto-scroll.
  // Programmatic scrolls from scrollIntoView are ignored via the guard flag.
  useEffect(() => {
    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) {
        // This scroll was triggered by our scrollIntoView — ignore it
        return;
      }
      // User manually scrolled — disable auto-scroll
      autoScrollEnabledRef.current = false;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get words for a specific utterance, returning both words and their global indexes
  const getWordsForUtterance = useCallback((utteranceStart: number, utteranceEnd: number): { word: Word; globalIndex: number }[] => {
    if (!wordLevelData?.words) return [];

    const results: { word: Word; globalIndex: number }[] = [];
    for (let i = 0; i < wordLevelData.words.length; i++) {
      const word = wordLevelData.words[i];
      if (word.start >= utteranceStart && word.end <= utteranceEnd) {
        results.push({ word, globalIndex: i });
      }
      // Early exit: if we've passed the utterance end, stop searching
      if (word.start > utteranceEnd) break;
    }
    return results;
  }, [wordLevelData]);

  // Get all word indexes that match the search
  const searchMatchIndexes = useMemo(() => {
    const indexes = new Set<number>();
    if (!searchResults?.matches || !wordLevelData?.words) return indexes;

    searchResults.matches.forEach(match => {
      match.indexes.forEach(idx => {
        indexes.add(idx);
      });
    });

    return indexes;
  }, [searchResults, wordLevelData]);

  // Get sorted list of match indexes for navigation
  const sortedMatchIndexes = useMemo(() => {
    return Array.from(searchMatchIndexes).sort((a, b) => a - b);
  }, [searchMatchIndexes]);

  // Get the currently selected match word index
  const currentMatchWordIndex = useMemo(() => {
    if (sortedMatchIndexes.length === 0) return -1;
    const clampedIndex = Math.min(currentMatchIndex, sortedMatchIndexes.length - 1);
    return sortedMatchIndexes[clampedIndex];
  }, [sortedMatchIndexes, currentMatchIndex]);

  // Navigate to previous match
  const navigateToPrevious = useCallback(() => {
    if (sortedMatchIndexes.length === 0) return;

    setCurrentMatchIndex(prev => {
      const newIndex = prev - 1;
      return newIndex < 0 ? sortedMatchIndexes.length - 1 : newIndex;
    });
  }, [sortedMatchIndexes]);

  // Navigate to next match
  const navigateToNext = useCallback(() => {
    if (sortedMatchIndexes.length === 0) return;

    setCurrentMatchIndex(prev => {
      const newIndex = prev + 1;
      return newIndex >= sortedMatchIndexes.length ? 0 : newIndex;
    });
  }, [sortedMatchIndexes]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setCurrentMatchIndex(0);
  }, []);

  // Scroll to current match
  useEffect(() => {
    if (currentMatchWordIndex === -1 || !wordLevelData?.words) return;

    const matchElement = document.getElementById(`word-${currentMatchWordIndex}`);
    if (matchElement && transcriptContainerRef.current) {
      isProgrammaticScrollRef.current = true;
      matchElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 600);
    }
  }, [currentMatchWordIndex, wordLevelData]);

  // Auto-scroll to current word during video playback.
  // Only scrolls when autoScrollEnabledRef is true (set by clicking a word,
  // cleared when the user manually scrolls the transcript container).
  useEffect(() => {
    if (currentWordIndex < 0 || searchQuery) return; // Don't auto-scroll during search
    if (!autoScrollEnabledRef.current) return; // User scrolled away — respect that

    const wordElement = document.getElementById(`word-${currentWordIndex}`);
    if (!wordElement) return;

    // Only scroll if the word is outside the visible viewport
    const wordRect = wordElement.getBoundingClientRect();
    const isVisible = wordRect.top >= 0 && wordRect.bottom <= window.innerHeight;
    if (isVisible) return;

    // Mark the upcoming scroll as programmatic so the scroll listener ignores it
    isProgrammaticScrollRef.current = true;
    wordElement.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    // Clear the programmatic flag after the smooth scroll has had time to fire
    // scroll events. 600ms covers the typical smooth-scroll animation duration.
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 600);
  }, [currentWordIndex, searchQuery]);

  // Reset match index when search results change
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchResults]);

  // Keyboard shortcuts for search navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+F or Cmd+F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('transcript-search-input') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }

      // Enter to go to next match (when search is focused)
      if (e.key === 'Enter' && document.activeElement?.id === 'transcript-search-input') {
        e.preventDefault();
        if (e.shiftKey) {
          navigateToPrevious();
        } else {
          navigateToNext();
        }
      }

      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        clearSearch();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [searchQuery, navigateToNext, navigateToPrevious, clearSearch]);

  // Render a single utterance's word-level text
  const renderWords = (utterance: { start: number; end: number; text: string }) => {
    if (!wordLevelData) return utterance.text;

    return getWordsForUtterance(utterance.start, utterance.end).map(({ word, globalIndex }) => {
      const isCurrentWord = globalIndex === currentWordIndex;
      const isSearchMatch = searchMatchIndexes.has(globalIndex);
      const isCurrentMatch = globalIndex === currentMatchWordIndex;

      let cls = 'cursor-pointer px-0.5 rounded transition-all duration-100 ';
      if (isCurrentMatch) {
        cls += 'bg-brand-pale-gold font-semibold shadow-sm';
      } else if (isSearchMatch) {
        cls += 'bg-brand-pale-gold/40 hover:bg-brand-pale-gold/60';
      } else if (isCurrentWord) {
        cls += 'bg-interactive-focus/20 font-semibold shadow-sm';
      } else {
        cls += 'hover:bg-interactive-fill';
      }

      return (
        <span
          key={globalIndex}
          id={`word-${globalIndex}`}
          onClick={() => handleWordClick(globalIndex)}
          className={cls}
          title={`Click to jump to ${(word.start / 1000).toFixed(1)}s`}
        >
          {word.text}{" "}
        </span>
      );
    });
  };

  // --- COMPACT (sidebar) layout ---
  if (compact) {
    return (
      <div className="overflow-hidden">
        {/* Compact search bar — no heading, panel header already shows "Transcript" */}
        <div className="sticky top-0 z-10 frosted-glass border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-placeholder" />
              <Input
                id="transcript-search-input"
                type="text"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-7 text-ui pl-7 pr-2"
              />
            </div>
            {searchQuery && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {sortedMatchIndexes.length > 0 && (
                  <span className="text-ui text-text-tertiary whitespace-nowrap">
                    {currentMatchIndex + 1}/{sortedMatchIndexes.length}
                  </span>
                )}
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={navigateToPrevious}>
                  <ChevronUp className="h-2.5 w-2.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={navigateToNext}>
                  <ChevronDown className="h-2.5 w-2.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={clearSearch}>
                  <X className="h-2.5 w-2.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Compact utterances — vertical stacking with dividers */}
        <div ref={transcriptContainerRef} className="divide-y divide-border">
          {transcript.processed_transcript?.utterances?.map((utterance, index) => {
            const colorSet = speakerColorMap.get(utterance.speaker) || speakerColors[0];

            return (
              <div
                key={index}
                className="px-3 py-2.5 hover:bg-interactive-fill transition-colors duration-[var(--duration-micro)] ease-[var(--ease)]"
              >
                {/* Top row: speaker + timestamp */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-ui font-semibold ${colorSet.bg} ${colorSet.text}`}>
                      {getSpeakerLabel(utterance.speaker)}
                    </span>
                    {getSpeakerRole(utterance.speaker) && (
                      <span className="text-ui text-text-placeholder truncate">
                        {getSpeakerRole(utterance.speaker)}
                      </span>
                    )}
                  </div>
                  <span className="text-ui text-text-placeholder flex-shrink-0 ml-1">
                    {formatTimestamp(utterance.start / 1000)}
                  </span>
                </div>

                {/* Text content — smaller, tighter leading */}
                <div className="text-ui text-text-primary leading-snug [overflow-wrap:break-word]">
                  {renderWords(utterance)}
                </div>

                {utterance.confidence < 0.8 && (
                  <div className="mt-0.5 text-ui text-brand-mustard">
                    Low confidence: {Math.round(utterance.confidence * 100)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- FULL-WIDTH (original) layout ---
  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Search Bar — frosted glass style header */}
      <div className="sticky top-0 z-10 frosted-glass border-b border-border px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-h4 text-foreground">Transcript</h3>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-placeholder" />
            <Input
              id="transcript-search-input"
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 ${searchQuery ? (sortedMatchIndexes.length > 0 ? 'pr-28' : 'pr-20') : 'pr-3'}`}
            />

            {/* Search Results & Navigation inside the input */}
            {searchQuery && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {debouncedSearchQuery && !searchLoading && sortedMatchIndexes.length === 0 && (
                  <span className="text-label text-text-placeholder px-2">No results</span>
                )}

                {sortedMatchIndexes.length > 0 && (
                  <div className="flex items-center gap-0.5 px-1">
                    <span className="text-label font-medium text-text-tertiary">
                      {currentMatchIndex + 1} of {sortedMatchIndexes.length}
                    </span>
                    <div className="flex items-center ml-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-interactive-fill rounded-md"
                        onClick={navigateToPrevious}
                        title="Previous match (Shift+Enter)"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 hover:bg-interactive-fill rounded-md"
                        onClick={navigateToNext}
                        title="Next match (Enter)"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-interactive-fill rounded-md"
                  onClick={clearSearch}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Content */}
      <div className="p-4 sm:p-6 space-y-3 sm:space-y-5" ref={transcriptContainerRef}>
        {transcript.processed_transcript?.utterances?.map((utterance, index) => {
          const colorSet = speakerColorMap.get(utterance.speaker) || speakerColors[0];

          return (
            <div
              key={index}
              className="flex gap-3 sm:gap-5 p-4 rounded-xl hover:bg-interactive-fill transition-colors duration-[var(--duration-micro)] ease-[var(--ease)]"
            >
              {/* Timestamp */}
              <div className="flex-shrink-0 w-14 sm:w-20 text-label text-text-placeholder flex items-start gap-1.5 pt-1">
                <Clock className="h-3 w-3 mt-0.5" />
                {formatTimestamp(utterance.start / 1000)}
              </div>

              <div className="flex-1">
                {/* Speaker label with role */}
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`${colorSet.bg} ${colorSet.text} border-0`}>
                    {getSpeakerLabel(utterance.speaker)}
                  </Badge>
                  {getSpeakerRole(utterance.speaker) && (
                    <span className="text-label text-text-placeholder">
                      {getSpeakerRole(utterance.speaker)}
                    </span>
                  )}
                </div>

                {/* Word-level transcript text */}
                <div className="text-text-primary leading-relaxed">
                  {renderWords(utterance)}
                </div>

                {utterance.confidence < 0.8 && (
                  <div className="mt-1 text-label text-brand-mustard">
                    Low confidence: {Math.round(utterance.confidence * 100)}%
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
