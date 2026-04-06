<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the qualitative research tool frontend. PostHog is initialized in `src/main.tsx` with `PostHogProvider` and `PostHogErrorBoundary` wrapping the entire app. Users are identified by their Clerk user ID (with email and username) when they first sync with the backend. Eleven custom events are tracked across the core research workflow — from sign-in through project management, media upload, transcription, and AI analysis.

| Event | Description | File |
|---|---|---|
| `user_signed_in` | Fired when a user authenticates and syncs with the backend; also identifies the user in PostHog | `src/hooks/useUserSync.ts` |
| `project_created` | Fired when a user successfully creates a new research project | `src/components/projects/CreateProjectDialog.tsx` |
| `project_edited` | Fired when a user successfully edits a project's name or description | `src/components/projects/EditProjectDialog.tsx` |
| `project_deleted` | Fired when a user confirms and deletes a project | `src/components/projects/DeleteProjectDialog.tsx` |
| `media_upload_started` | Fired when the user queues files for upload, with file count and total size | `src/components/videos/VideoUploadDialogSimple.tsx` |
| `media_upload_completed` | Fired when a single file upload succeeds | `src/contexts/UploadContext.tsx` |
| `media_upload_failed` | Fired when a file upload fails, with error type | `src/contexts/UploadContext.tsx` |
| `transcription_started` | Fired when the user starts transcription of a video | `src/pages/VideoDetailPage.tsx` |
| `video_analysis_started` | Fired when the user starts full video analysis | `src/pages/VideoDetailPage.tsx` |
| `analysis_step_started` | Fired for each individual analysis step (chunk / infer / relate / explain / activate) | `src/pages/VideoDetailPage.tsx` |
| `project_analysis_started` | Fired when the user starts or re-runs cross-video project analysis | `src/pages/ProjectDetailPage.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/371468/dashboard/1436205
- **Upload Conversion Funnel** — how many uploads started → completed: https://us.posthog.com/project/371468/insights/7jeDXcuS
- **Research Pipeline Funnel** — end-to-end: sign-in → project → upload → transcription → analysis: https://us.posthog.com/project/371468/insights/fHSGKBGT
- **Daily Active Users** — unique users per day via `user_signed_in`: https://us.posthog.com/project/371468/insights/kSCMbwN1
- **Upload Failure Rate** — `B/(A+B)*100` using failed vs completed uploads: https://us.posthog.com/project/371468/insights/09WpSqcv
- **Project & Analysis Activity** — projects created and cross-video analyses over time: https://us.posthog.com/project/371468/insights/8u4oPLSY

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
