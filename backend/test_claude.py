"""Simple test to verify Claude service works."""

import sys
from app.services.claude_service import claude_service
from app.agents.prompts import CHUNK_SYSTEM_PROMPT


def test_claude_connection():
    """Test that Claude API is working."""
    print("🧪 Testing Claude API connection...")

    try:
        # Simple test prompt
        test_transcript = """
        [00:00:05] Interviewer: Can you tell me about your morning routine?
        [00:00:10] John: Sure! I usually wake up around 7 AM and immediately check my phone.
        [00:00:15] Interviewer: Why do you check your phone first thing?
        [00:00:18] John: I guess it's become a habit. I like to see what I missed overnight.
        """

        user_message = f"""Please analyze this short transcript and break it into chunks:

TRANSCRIPT:
{test_transcript}

Return 2-3 chunks in JSON format."""

        print("   Calling Claude API...")
        response = claude_service.call_with_json_response(
            system_prompt=CHUNK_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=1000,
        )

        print(f"✅ SUCCESS! Claude returned {len(response)} chunks")
        print(f"\nSample chunk:")
        if response and len(response) > 0:
            print(f"  - {response[0]}")

        return True

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


if __name__ == "__main__":
    success = test_claude_connection()
    sys.exit(0 if success else 1)
