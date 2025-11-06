#!/usr/bin/env python3
"""
Test script for video upload and transcription workflow.
"""

import requests
import json
import time
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:8000"
VIDEO_FILE = "patricia_and_mozart.mp4"

def print_section(title):
    """Print a formatted section header."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def print_response(response):
    """Pretty print a response."""
    print(f"Status Code: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response: {response.text}")
    print()

def test_video_workflow():
    """Test the complete video upload and transcription workflow."""

    # Step 1: Create a project
    print_section("Step 1: Create a Test Project")
    project_data = {
        "name": "Test Project",
        "description": "A test project for video upload and transcription"
    }

    response = requests.post(
        f"{BASE_URL}/api/projects/",
        json=project_data
    )
    print_response(response)

    if response.status_code != 201:
        print("❌ Failed to create project")
        return

    project_id = response.json()["id"]
    print(f"✓ Project created with ID: {project_id}")

    # Step 2: Upload video
    print_section("Step 2: Upload Video")

    if not Path(VIDEO_FILE).exists():
        print(f"❌ Video file '{VIDEO_FILE}' not found")
        return

    with open(VIDEO_FILE, 'rb') as f:
        files = {'file': (VIDEO_FILE, f, 'video/mp4')}
        response = requests.post(
            f"{BASE_URL}/api/videos/{project_id}/upload",
            files=files
        )

    print_response(response)

    if response.status_code != 201:
        print("❌ Failed to upload video")
        return

    video_data = response.json()
    video_id = video_data["id"]
    print(f"✓ Video uploaded with ID: {video_id}")
    print(f"  Filename: {video_data.get('filename')}")
    print(f"  Status: {video_data.get('status')}")
    print(f"  S3 URL: {video_data.get('s3_url')}")

    # Step 3: Get video details
    print_section("Step 3: Get Video Details")
    response = requests.get(f"{BASE_URL}/api/videos/{video_id}")
    print_response(response)

    # Step 4: Trigger transcription
    print_section("Step 4: Trigger Transcription")
    response = requests.post(f"{BASE_URL}/api/videos/{video_id}/transcribe")
    print_response(response)

    if response.status_code != 202:
        print("❌ Failed to trigger transcription")
        return

    task_data = response.json()
    task_id = task_data.get("task_id")
    print(f"✓ Transcription task started with ID: {task_id}")

    # Step 5: Check video status after transcription starts
    print_section("Step 5: Check Video Status")
    time.sleep(2)  # Wait a bit for the task to start

    response = requests.get(f"{BASE_URL}/api/videos/{video_id}")
    print_response(response)

    video_status = response.json().get("status")
    print(f"Video status: {video_status}")

    # Step 6: List all videos in the project
    print_section("Step 6: List Project Videos")
    response = requests.get(f"{BASE_URL}/api/projects/{project_id}/videos")
    print_response(response)

    print_section("Summary")
    print(f"✓ Project ID: {project_id}")
    print(f"✓ Video ID: {video_id}")
    print(f"✓ Task ID: {task_id}")
    print(f"✓ Current Status: {video_status}")
    print(f"\nYou can monitor the transcription task in your Celery worker logs.")
    print(f"Once completed, the transcript will be available in the database.")

if __name__ == "__main__":
    try:
        test_video_workflow()
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to the backend server.")
        print(f"   Make sure the server is running at {BASE_URL}")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
