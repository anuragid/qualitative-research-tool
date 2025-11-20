# Prompt for Claude Code: Add Video-Transcript Sync Feature

Paste this into Claude Code after the main project is built:

---

Add a video-transcript synchronization feature to the qualitative research tool:

## Requirements:

1. **Backend - AssemblyAI Integration:**
   - Word-level timestamps are returned BY DEFAULT - no special config needed!
   - Just ensure `speaker_labels: true` is enabled for speaker diarization
   - The transcript response automatically includes a `words` array with this structure:
     ```json
     {
       "text": "Hello",
       "start": 250,
       "end": 650,
       "confidence": 0.95,
       "speaker": "A"
     }
     ```
   - Store the full `words` array in database (it's already in the transcript response)
   - Create API endpoint: `GET /api/videos/{video_id}/transcript/words` that returns the words array

2. **Frontend - Synchronized Video Player:**
   - Create a VideoTranscriptSync component with:
     * Video player on left (using HTML5 video element)
     * Scrollable transcript on right
     * As video plays, automatically highlight the current word being spoken
     * Auto-scroll transcript to keep current word visible
     * Click any word to jump video to that timestamp
   - Use video.currentTime * 1000 to get current position in milliseconds
   - Match current time against word.start and word.end to find active word
   - Add smooth scrolling with scrollIntoView({ behavior: 'smooth', block: 'center' })

3. **Styling:**
   - Highlight current word with blue background
   - Make all words clickable (cursor pointer)
   - Show speaker names with different colors
   - Add line breaks after punctuation for readability

4. **Technical Details:**
   - Use React refs for video and transcript container
   - Listen to 'timeupdate' event on video element
   - Use findIndex to locate current word based on timestamp
   - Store currentWordIndex in React state
   - Use useEffect to trigger scroll when currentWordIndex changes

## AssemblyAI Word Format:
```json
{
  "text": "Hello",
  "start": 250,
  "end": 650,
  "confidence": 0.95,
  "speaker": "A"
}
```

## Important Implementation Notes:
- Word-level timestamps come automatically with every transcript - no extra configuration needed
- Just access `transcript.words` or `transcription_result['words']` from the API response
- Times are in milliseconds (not seconds)
- Speaker labels (A, B, C) need to be mapped to real names (Interviewer, Participant) using the speaker_labels table
- The `confidence` field (0-1) indicates how confident the AI is about that word - you can optionally show low-confidence words differently

Implement this feature with proper error handling and loading states. Make it responsive for mobile viewing.
