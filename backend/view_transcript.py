#!/usr/bin/env python3
"""
View transcript for a video.
"""

import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def view_transcript(video_id):
    """View transcript for a video."""

    # Get video details to find transcript
    response = requests.get(f"{BASE_URL}/api/videos/{video_id}")
    if response.status_code != 200:
        print(f"Error: Video {video_id} not found")
        return

    video = response.json()
    print(f"Video: {video['filename']}")
    print(f"Status: {video['status']}")
    print("=" * 80)

    # Get transcript - we need to find the transcript ID
    # Let's try using the video_id to get the transcript
    # First check if there's a transcripts endpoint by video
    response = requests.get(f"{BASE_URL}/api/transcripts/video/{video_id}")

    if response.status_code == 404:
        # Try to get from the video details if it includes transcript info
        print("\nNo transcript found for this video yet.")
        return

    transcript = response.json()

    # Display processed transcript
    if 'processed_transcript' in transcript and transcript['processed_transcript']:
        proc = transcript['processed_transcript']

        print(f"\nTranscript ID: {transcript['id']}")
        print(f"AssemblyAI ID: {transcript['assemblyai_id']}")
        print(f"Status: {transcript['status']}")
        print("\n" + "=" * 80)
        print("FULL TRANSCRIPT")
        print("=" * 80 + "\n")

        if isinstance(proc, dict):
            print(proc.get('full_text', 'No text available'))

            # Show segments with timestamps
            if 'segments' in proc:
                print("\n" + "=" * 80)
                print("SEGMENTS WITH TIMESTAMPS")
                print("=" * 80 + "\n")

                for i, segment in enumerate(proc['segments'][:5], 1):  # Show first 5 segments
                    print(f"Segment {i}:")
                    print(f"  Time: {segment.get('timestamp_start')} - {segment.get('timestamp_end')}")
                    if 'speaker' in segment:
                        print(f"  Speaker: {segment.get('speaker')}")
                    print(f"  Text: {segment.get('text', '')[:200]}...")
                    print()

                if len(proc['segments']) > 5:
                    print(f"... and {len(proc['segments']) - 5} more segments")
        else:
            print(proc)
    else:
        print("\nRaw transcript available. Use the API to access full details.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
    else:
        video_id = "de5e4906-a915-4ac1-ae08-2ab8eaad3c26"  # Default to last uploaded video

    view_transcript(video_id)
