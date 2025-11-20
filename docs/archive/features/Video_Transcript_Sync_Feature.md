# Feature Request: Video-Transcript Sync with Word-Level Timestamps

## Overview
Add synchronized video playback with transcript auto-scrolling and word highlighting using AssemblyAI word-level timestamps.

## Backend Changes

### 1. AssemblyAI API Configuration

Good news: Word-level timestamps are returned BY DEFAULT! No special configuration needed.

```python
# In backend/app/services/assemblyai_service.py

async def start_transcription(audio_url: str):
    """Start transcription with speaker diarization"""
    
    config = {
        "audio_url": audio_url,
        "speaker_labels": True,  # This enables speaker diarization
        # Word-level timestamps come automatically - no extra config needed!
    }
    
    # Make API call
    transcript = transcriber.transcribe(config)
    
    # transcript.words is automatically populated with:
    # [
    #   {
    #     "text": "Hello",
    #     "start": 250,      # milliseconds
    #     "end": 650,
    #     "confidence": 0.95,
    #     "speaker": "A"
    #   },
    #   ...
    # ]
    
    return transcript
```

### 2. Store Word-Level Data

The words array comes automatically in the transcript response:

```python
# AssemblyAI automatically returns:
transcript.words = [
  {
    "text": "Hello",
    "start": 250,      # milliseconds
    "end": 650,
    "confidence": 0.95,
    "speaker": "A"
  },
  # ... more words
]

# Simply store the entire words array in your database:
transcript_data = {
    "words": transcript.words,  # Word-level array (already available!)
    "utterances": transcript.utterances,  # Sentence-level
    "text": transcript.text,  # Full text
}

# Save to transcripts table in the raw_transcript JSONB field
```

### 3. API Endpoint to Fetch Words

Create endpoint to get word-level transcript:

```python
# backend/app/routes/transcriptions.py

@router.get("/videos/{video_id}/transcript/words")
async def get_word_level_transcript(video_id: str):
    """
    Get word-level transcript with timestamps
    
    Returns:
    {
      "words": [
        {
          "text": "Hello",
          "start": 250,
          "end": 650,
          "speaker": "Interviewer",
          "confidence": 0.95
        }
      ],
      "duration": 125000  # total video duration in ms
    }
    """
    transcript = get_transcript_by_video_id(video_id)
    
    # Map speaker labels to names
    words_with_names = []
    for word in transcript.words:
        speaker_name = speaker_labels_map.get(word.speaker, word.speaker)
        words_with_names.append({
            "text": word.text,
            "start": word.start,
            "end": word.end,
            "speaker": speaker_name,
            "confidence": word.confidence
        })
    
    return {
        "words": words_with_names,
        "duration": transcript.duration
    }
```

## Frontend Changes

### 1. Video Player with Transcript Sync Component

Create a new component:

```typescript
// frontend/src/components/VideoTranscriptSync.tsx

import { useState, useRef, useEffect } from 'react';

interface Word {
  text: string;
  start: number;
  end: number;
  speaker: string;
  confidence: number;
}

interface Props {
  videoUrl: string;
  words: Word[];
}

export function VideoTranscriptSync({ videoUrl, words }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);

  // Update current time as video plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const timeMs = video.currentTime * 1000;
      setCurrentTime(timeMs);
      
      // Find current word
      const index = words.findIndex(
        word => timeMs >= word.start && timeMs <= word.end
      );
      setCurrentWordIndex(index);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [words]);

  // Auto-scroll transcript to current word
  useEffect(() => {
    if (currentWordIndex === -1) return;
    
    const wordElement = document.getElementById(`word-${currentWordIndex}`);
    if (wordElement && transcriptRef.current) {
      wordElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentWordIndex]);

  // Click word to jump to timestamp
  const handleWordClick = (wordIndex: number) => {
    const word = words[wordIndex];
    if (videoRef.current) {
      videoRef.current.currentTime = word.start / 1000;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Video Player */}
      <div>
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full rounded-lg"
        />
      </div>

      {/* Transcript with word highlighting */}
      <div
        ref={transcriptRef}
        className="h-[500px] overflow-y-auto border rounded-lg p-4 bg-gray-50"
      >
        {words.map((word, index) => (
          <span
            key={index}
            id={`word-${index}`}
            onClick={() => handleWordClick(index)}
            className={`
              cursor-pointer px-1 rounded transition-colors
              ${index === currentWordIndex 
                ? 'bg-blue-500 text-white font-semibold' 
                : 'hover:bg-gray-200'
              }
            `}
          >
            {word.text}{' '}
            {/* Add line break after sentences */}
            {word.text.match(/[.!?]$/) && <br />}
          </span>
        ))}
      </div>
    </div>
  );
}
```

### 2. Fetch Word-Level Transcript

```typescript
// frontend/src/hooks/useWordLevelTranscript.ts

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export function useWordLevelTranscript(videoId: string) {
  return useQuery({
    queryKey: ['transcript-words', videoId],
    queryFn: async () => {
      const { data } = await axios.get(
        `/api/videos/${videoId}/transcript/words`
      );
      return data;
    },
    enabled: !!videoId
  });
}
```

### 3. Use in Video Detail Page

```typescript
// frontend/src/pages/VideoDetailPage.tsx

import { VideoTranscriptSync } from '@/components/VideoTranscriptSync';
import { useWordLevelTranscript } from '@/hooks/useWordLevelTranscript';

export function VideoDetailPage() {
  const { videoId } = useParams();
  const { data: transcript, isLoading } = useWordLevelTranscript(videoId);

  if (isLoading) return <div>Loading transcript...</div>;

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Video Transcript</h1>
      
      <VideoTranscriptSync
        videoUrl={`/api/videos/${videoId}/download`}
        words={transcript.words}
      />
    </div>
  );
}
```

## Additional Features (Optional)

### 1. Speaker Color Coding

```tsx
// Give each speaker a unique color
const speakerColors: Record<string, string> = {
  'Interviewer': 'text-blue-600',
  'Participant': 'text-green-600',
};

<span className={speakerColors[word.speaker]}>
  {word.text}
</span>
```

### 2. Playback Speed Control

```tsx
<select onChange={(e) => {
  if (videoRef.current) {
    videoRef.current.playbackRate = parseFloat(e.target.value);
  }
}}>
  <option value="0.5">0.5x</option>
  <option value="1">1x</option>
  <option value="1.5">1.5x</option>
  <option value="2">2x</option>
</select>
```

### 3. Search in Transcript

```tsx
const [searchQuery, setSearchQuery] = useState('');

const highlightedWords = words.map((word, idx) => ({
  ...word,
  highlight: word.text.toLowerCase().includes(searchQuery.toLowerCase())
}));
```

### 4. Confidence Indicators

```tsx
// Show low-confidence words differently
<span className={
  word.confidence < 0.7 ? 'text-red-500 italic' : ''
}>
  {word.text}
</span>
```

## Implementation Checklist

Backend:
- [ ] Update AssemblyAI service to request word-level timestamps
- [ ] Store word-level data in database
- [ ] Create API endpoint for word-level transcript
- [ ] Map speaker labels to real names in API response

Frontend:
- [ ] Create VideoTranscriptSync component
- [ ] Implement video timeupdate listener
- [ ] Auto-scroll transcript to current word
- [ ] Highlight current word
- [ ] Click word to jump to timestamp
- [ ] Add speaker color coding (optional)
- [ ] Add search functionality (optional)

## Testing

1. Upload a video
2. Wait for transcription to complete
3. Navigate to video detail page
4. Play video and verify:
   - Transcript auto-scrolls
   - Current word is highlighted
   - Clicking a word jumps video to that timestamp
   - Speaker names display correctly

## AssemblyAI Documentation

- Word-level timestamps (official docs): https://www.assemblyai.com/docs/speech-to-text/word-level-timestamps
- API Reference: https://www.assemblyai.com/docs/api-reference/transcript#words
- Speaker Diarization: https://www.assemblyai.com/docs/speech-to-text/speaker-diarization

**Key fact from docs:** Word-level timestamps are included automatically in every transcript response - no additional configuration required!
