#!/usr/bin/env python3
"""
Comprehensive test script for AWS deployment vs Localhost
Tests all features systematically
"""

import requests
import json
import time
from datetime import datetime

# Configuration
LOCALHOST_URL = "http://localhost:8000"
AWS_URL = "http://qualitative-research-alb-1350830328.us-east-2.elb.amazonaws.com"

# Test results storage
results = {
    "localhost": {},
    "aws": {}
}

def test_endpoint(base_url, endpoint, method="GET", data=None):
    """Test a single endpoint."""
    try:
        url = f"{base_url}{endpoint}"
        if method == "GET":
            response = requests.get(url, timeout=5)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=5)
        elif method == "DELETE":
            response = requests.delete(url, timeout=5)
        else:
            return {"error": f"Unsupported method: {method}"}

        return {
            "status_code": response.status_code,
            "success": response.status_code < 400,
            "data": response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text[:200]
        }
    except requests.exceptions.RequestException as e:
        return {
            "status_code": None,
            "success": False,
            "error": str(e)
        }

def run_tests():
    """Run all feature tests."""

    print("="*60)
    print("QUALITATIVE RESEARCH TOOL - FEATURE COMPARISON TEST")
    print(f"Timestamp: {datetime.now()}")
    print("="*60)

    # Test suite
    tests = [
        # Basic health checks
        ("Health Check", "/health", "GET", None),
        ("Root Endpoint", "/", "GET", None),

        # Project management
        ("List Projects", "/api/projects/", "GET", None),
        ("Create Project", "/api/projects/", "POST", {
            "name": f"Test Project {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "description": "Automated test project"
        }),

        # Video endpoints (using known IDs from AWS)
        ("Get Video (AWS ID)", "/api/videos/dfaeb844-a284-444d-939c-562a746807d6", "GET", None),
        ("Get Transcript", "/api/videos/dfaeb844-a284-444d-939c-562a746807d6/transcript", "GET", None),
        ("Get Playback URL", "/api/videos/dfaeb844-a284-444d-939c-562a746807d6/playback-url", "GET", None),
        ("Get Word-level Transcript", "/api/videos/dfaeb844-a284-444d-939c-562a746807d6/transcript/words", "GET", None),

        # Analysis endpoints
        ("Get Video Analysis", "/api/videos/dfaeb844-a284-444d-939c-562a746807d6/analysis", "GET", None),
        ("Get Project Analysis", "/api/projects/a0a2bb4b-bb57-45cf-afaf-ff3fc6aca8ee/analysis", "GET", None),

        # Project videos
        ("List Project Videos", "/api/projects/a0a2bb4b-bb57-45cf-afaf-ff3fc6aca8ee/videos", "GET", None),
    ]

    # Run tests for both environments
    for env_name, base_url in [("LOCALHOST", LOCALHOST_URL), ("AWS", AWS_URL)]:
        print(f"\n{'-'*40}")
        print(f"Testing: {env_name}")
        print(f"URL: {base_url}")
        print(f"{'-'*40}\n")

        env_results = {}

        for test_name, endpoint, method, data in tests:
            result = test_endpoint(base_url, endpoint, method, data)
            env_results[test_name] = result

            # Print result
            status = "✅" if result["success"] else "❌"
            status_code = result.get("status_code", "N/A")

            print(f"{status} {test_name}: {status_code}")

            if not result["success"] and "error" in result:
                print(f"   Error: {result['error']}")

            # Small delay between requests
            time.sleep(0.5)

        results[env_name.lower()] = env_results

    # Compare results
    print("\n" + "="*60)
    print("COMPARISON SUMMARY")
    print("="*60)

    all_tests = set(results["localhost"].keys()) | set(results["aws"].keys())

    differences = []
    for test_name in sorted(all_tests):
        local = results["localhost"].get(test_name, {})
        aws = results["aws"].get(test_name, {})

        local_success = local.get("success", False)
        aws_success = aws.get("success", False)

        if local_success != aws_success:
            differences.append({
                "test": test_name,
                "localhost": "✅" if local_success else "❌",
                "aws": "✅" if aws_success else "❌",
                "local_code": local.get("status_code"),
                "aws_code": aws.get("status_code")
            })

    if differences:
        print("\n⚠️  DIFFERENCES FOUND:")
        print("-" * 40)
        for diff in differences:
            print(f"\n{diff['test']}:")
            print(f"  Localhost: {diff['localhost']} (HTTP {diff['local_code']})")
            print(f"  AWS:       {diff['aws']} (HTTP {diff['aws_code']})")
    else:
        print("\n✅ All tests have consistent results across both environments!")

    # Check for failures in AWS
    aws_failures = [name for name, result in results["aws"].items() if not result.get("success")]
    if aws_failures:
        print("\n❌ AWS FAILURES:")
        print("-" * 40)
        for test_name in aws_failures:
            print(f"  - {test_name}")
            if "error" in results["aws"][test_name]:
                print(f"    Error: {results['aws'][test_name]['error']}")

    return results

if __name__ == "__main__":
    test_results = run_tests()

    # Save results to file
    with open("/Users/idstuart/Projects/ai-prototyping/5d-analysis/test_results.json", "w") as f:
        json.dump(test_results, f, indent=2, default=str)

    print("\n📄 Full results saved to test_results.json")