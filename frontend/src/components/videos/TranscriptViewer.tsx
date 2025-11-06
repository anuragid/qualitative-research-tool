import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Transcript, SpeakerLabel, Word } from "../../types";
import { useWordLevelTranscript } from "../../hooks/useWordLevelTranscript";
import { useTranscriptSearch } from "../../hooks/useTranscriptSearch";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Clock, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { useDebounce } from "../../hooks/useDebounce";

interface TranscriptViewerProps {
  transcript: Transcript;
  speakerLabels?: SpeakerLabel[];
  onLabelSpeaker?: (speakerLabel: string, name: string, role?: string) => void;
  videoId: string;
}

export function TranscriptViewer({
  transcript,
  speakerLabels = [],
  onLabelSpeaker,
  videoId,
}: TranscriptViewerProps) {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Fetch word-level transcript for highlighting
  const { data: wordLevelData } = useWordLevelTranscript(videoId);

  // Debounce search query to avoid too many API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Search for words in transcript
  const { data: searchResults, isLoading: searchLoading } = useTranscriptSearch(videoId, debouncedSearchQuery);

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
  useEffect(() => {
    const video = document.getElementById("main-video-player") as HTMLVideoElement;
    if (!video || !wordLevelData?.words) return;

    const handleTimeUpdate = () => {
      const timeMs = video.currentTime * 1000;
      const index = findCurrentWordIndex(wordLevelData.words, timeMs);
      setCurrentWordIndex(index);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [wordLevelData, findCurrentWordIndex]);

  // Click word to jump video
  const handleWordClick = useCallback((wordIndex: number) => {
    const video = document.getElementById("main-video-player") as HTMLVideoElement;
    const word = wordLevelData?.words[wordIndex];
    if (video && word) {
      video.currentTime = word.start / 1000;
    }
  }, [wordLevelData]);

  // Get words for a specific utterance
  const getWordsForUtterance = useCallback((utteranceStart: number, utteranceEnd: number) => {
    if (!wordLevelData?.words) return [];

    return wordLevelData.words.filter(
      (word) => word.start >= utteranceStart && word.end <= utteranceEnd
    );
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
      matchElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }
  }, [currentMatchWordIndex, wordLevelData]);

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

  return (
    <div className="space-y-6">
      {/* Transcript Section */}
      <Card className="relative">
        <CardHeader className="sticky top-0 z-10 bg-white border-b">
          <div className="flex items-center justify-between">
            <CardTitle>Transcript</CardTitle>

            {/* Search Bar with integrated Navigation */}
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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
                  {/* No results found state - only show after search completes */}
                  {debouncedSearchQuery && !searchLoading && sortedMatchIndexes.length === 0 && (
                    <span className="text-xs text-gray-500 px-2">No results</span>
                  )}

                  {/* Navigation controls when matches found */}
                  {sortedMatchIndexes.length > 0 && (
                    <div className="flex items-center gap-0.5 px-1">
                      <span className="text-xs font-medium text-gray-600">
                        {currentMatchIndex + 1} of {sortedMatchIndexes.length}
                      </span>
                      <div className="flex items-center ml-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                          onClick={navigateToPrevious}
                          title="Previous match (Shift+Enter)"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:bg-gray-100"
                          onClick={navigateToNext}
                          title="Next match (Enter)"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Clear button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-gray-100"
                    onClick={clearSearch}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" ref={transcriptContainerRef}>
            {transcript.processed_transcript?.utterances?.map((utterance, index) => (
              <div
                key={index}
                className="flex gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-shrink-0 w-24 text-sm text-gray-500 flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5" />
                  {formatTimestamp(utterance.start / 1000)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">
                      {getSpeakerLabel(utterance.speaker)}
                    </Badge>
                    {getSpeakerRole(utterance.speaker) && (
                      <span className="text-sm text-gray-500">
                        {getSpeakerRole(utterance.speaker)}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-900 leading-relaxed">
                    {wordLevelData ? (
                      // Render words with highlighting
                      getWordsForUtterance(utterance.start, utterance.end).map((word, wordIdx) => {
                        const globalWordIndex = wordLevelData.words.indexOf(word);
                        const isCurrentWord = globalWordIndex === currentWordIndex;
                        const isSearchMatch = searchMatchIndexes.has(globalWordIndex);
                        const isCurrentMatch = globalWordIndex === currentMatchWordIndex;

                        // Determine highlight style
                        let className = 'cursor-pointer px-0.5 rounded transition-all duration-100 ';
                        if (isCurrentMatch) {
                          // Current search match - orange/darker highlight
                          className += 'bg-orange-400 text-white font-semibold shadow-sm';
                        } else if (isSearchMatch) {
                          // Regular search match - yellow highlight
                          className += 'bg-yellow-200 hover:bg-yellow-300';
                        } else if (isCurrentWord) {
                          // Currently playing word (video sync)
                          className += 'bg-blue-500 text-white font-semibold shadow-sm';
                        } else {
                          // Normal word
                          className += 'hover:bg-gray-200';
                        }

                        return (
                          <span
                            key={wordIdx}
                            id={`word-${globalWordIndex}`}
                            onClick={() => handleWordClick(globalWordIndex)}
                            className={className}
                            title={`Click to jump to ${(word.start / 1000).toFixed(1)}s`}
                          >
                            {word.text}{" "}
                          </span>
                        );
                      })
                    ) : (
                      // Fallback to plain text if word-level data isn't available
                      utterance.text
                    )}
                  </div>
                  {utterance.confidence < 0.8 && (
                    <div className="mt-1 text-xs text-amber-600">
                      Low confidence: {Math.round(utterance.confidence * 100)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
