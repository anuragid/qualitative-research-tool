"""Analysis-related API routes.

This module is reserved for future expansion of analysis-related endpoints.
Currently, analysis functionality is split between:
- Video analysis: /api/videos/{id}/analyze and /api/videos/{id}/analysis
- Project analysis: /api/projects/{id}/analyze and /api/projects/{id}/analysis
"""

from fastapi import APIRouter
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Future endpoints might include:
# - Comparison endpoints for multiple videos
# - Export/download analysis results
# - Analysis templates or presets
# - Batch analysis operations
# - Analysis history and versioning
