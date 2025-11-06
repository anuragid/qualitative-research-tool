import { useState, useEffect, useCallback } from "react";
import type { Transcript, SpeakerLabel, Word } from "../../types";
import { useWordLevelTranscript } from "../../hooks/useWordLevelTranscript";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Clock } from "lucide-react";

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

  // Fetch word-level transcript for highlighting
  const { data: wordLevelData } = useWordLevelTranscript(videoId);

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

  return (
    <div className="space-y-6">
      {/* Transcript Section */}
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {transcript.processed_transcript.utterances.map((utterance, index) => (
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

                        return (
                          <span
                            key={wordIdx}
                            onClick={() => handleWordClick(globalWordIndex)}
                            className={`
                              cursor-pointer px-0.5 rounded transition-all duration-100
                              ${isCurrentWord
                                ? 'bg-blue-500 text-white font-semibold shadow-sm'
                                : 'hover:bg-gray-200'
                              }
                            `}
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
