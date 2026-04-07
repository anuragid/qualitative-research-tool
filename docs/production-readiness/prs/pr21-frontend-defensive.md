# PR #21 — Frontend defensive rendering + zod schemas

**Branch:** `fix/frontend-defensive`
**Worktree:** `/Users/idstuart/Projects/ai-prototyping/5d-worktrees/pr21-frontend-defensive`
**Base:** `origin/main`
**Estimated effort:** 2-3 hours

## Problem statement

The frontend crashes on any unexpected API response shape. Examples:

- Sentry `JAVASCRIPT-REACT-6` — `TypeError: Cannot read properties of undefined (reading 'length')` in `Array.map` inside `PrinciplesList.tsx` (minified `D4`) accessing `principle.how_might_we.length`. Fixed surgically in Fix C today across 4 files, but not systematically.
- Any future backend response where a jsonb field is `null` instead of `[]`, or where a required field is absent, crashes the rendering tree.
- There is NO runtime schema validation between API responses and React components. TypeScript types are compile-time only; a real API response that drifts from the type doesn't raise.
- There are ~40 more `.map(` and `.length` access sites across `frontend/src/components/analysis/`, `frontend/src/components/videos/`, `frontend/src/components/projects/` that have never been audited.

Every API response shape change is a crash waiting to ship. We cannot safely change backend response contracts until the frontend tolerates missing/partial data.

## The fix — three layers

### Layer 1 — Zod schemas at the API boundary

Add runtime schema validation for every API response. On schema mismatch, log to Sentry with extra context and render a user-visible toast + fallback UI, NOT crash.

### Layer 2 — Defensive rendering everywhere

Codemod every `.map(` call over optional arrays to `(items ?? []).map(...)`. Every `.length` access on optional arrays to `(items?.length ?? 0)`. Every optional object field access inside a map/render to use optional chaining + nullish coalescing.

### Layer 3 — Error boundaries per route

Wrap each top-level route component in an error boundary that renders a `<SomethingWentWrong />` component with a Refresh button. If a render crash slips through Layers 1 and 2, the user sees a clear error instead of a blank page or the Sentry generic crash overlay.

## File-level plan

### 1. Install and set up zod

Check `frontend/package.json` for zod. If not present:

```bash
cd frontend
npm install zod
```

### 2. Create `frontend/src/schemas/` directory

One file per API response family:

#### `frontend/src/schemas/video.ts`

```typescript
import { z } from "zod";

export const VideoStatusSchema = z.enum([
  "uploaded",
  "transcribing",
  "transcribed",
  "analyzing",
  "analyzed",
  "error",
]);

export const VideoSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  filename: z.string(),
  s3_key: z.string().nullable().optional(),
  s3_url: z.string().nullable().optional(),
  duration_seconds: z.number().nullable().optional(),
  uploaded_at: z.string().nullable().optional(),
  status: VideoStatusSchema,
  file_size_bytes: z.number().nullable().optional(),
  error_message: z.string().nullable().optional().default(""),
});

export type Video = z.infer<typeof VideoSchema>;

export const VideoListSchema = z.array(VideoSchema);
```

#### `frontend/src/schemas/analysis.ts`

```typescript
import { z } from "zod";

export const AnalysisStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "error",
  "not_started",  // PR #18 sentinel
]);

export const AnalysisStepSchema = z.enum([
  "chunk",
  "infer",
  "relate",
  "explain",
  "activate",
]);

// Defensive: every jsonb field tolerates null/undefined and defaults to []
const JsonbArray = z.array(z.any()).nullable().optional().transform((v) => v ?? []);

export const VideoAnalysisSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  video_id: z.string().uuid().nullable().optional(),
  status: AnalysisStatusSchema,
  current_step: AnalysisStepSchema.nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  chunk_completed_at: z.string().nullable().optional(),
  infer_completed_at: z.string().nullable().optional(),
  relate_completed_at: z.string().nullable().optional(),
  explain_completed_at: z.string().nullable().optional(),
  activate_completed_at: z.string().nullable().optional(),
  step_status: z.record(z.string()).nullable().optional().default({}),
  chunks: JsonbArray,
  inferences: JsonbArray,
  patterns: JsonbArray,
  insights: JsonbArray,
  design_principles: JsonbArray,
});

export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

export const VideoAnalysisStatusResponseSchema = z.object({
  status: AnalysisStatusSchema,
  current_step: AnalysisStepSchema.nullable().optional(),
  step_status: z.record(z.string()).nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});
```

#### `frontend/src/schemas/project.ts`

```typescript
import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "planning",
  "ready",
  "processing",
  "completed",
  "error",
]);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  status: ProjectStatusSchema,
  error_message: z.string().nullable().optional().default(""),
  user_id: z.string(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

const JsonbArray = z.array(z.any()).nullable().optional().transform((v) => v ?? []);

export const ProjectAnalysisSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  video_ids: z.array(z.string().uuid()).nullable().optional().default([]),
  status: z.enum(["pending", "processing", "completed", "error", "not_started"]),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  cross_video_patterns: JsonbArray,
  cross_video_insights: JsonbArray,
  cross_video_principles: JsonbArray,
});

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>;
```

#### `frontend/src/schemas/transcript.ts`

```typescript
import { z } from "zod";

export const TranscriptSchema = z.object({
  id: z.string().uuid(),
  video_id: z.string().uuid(),
  status: z.enum(["pending", "processing", "completed", "error"]),
  assemblyai_id: z.string().nullable().optional(),
  raw_transcript: z.record(z.any()).nullable().optional(),
  processed_transcript: z.record(z.any()).nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const WordLevelTranscriptSchema = z.object({
  words: z.array(z.object({
    text: z.string(),
    start: z.number(),
    end: z.number(),
    speaker: z.string(),
    confidence: z.number(),
  })).nullable().optional().default([]),
  duration: z.number().nullable().optional(),
});
```

#### `frontend/src/schemas/index.ts`

Barrel re-exports.

### 3. Wire schemas into `frontend/src/services/api.ts`

Read the existing `api.ts` to understand the fetcher pattern. Then wrap each response with `.safeParse()`:

```typescript
import { z, ZodSchema } from "zod";
import * as Sentry from "@sentry/react";

async function fetchAndValidate<T>(
  url: string,
  schema: ZodSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const raw = await res.json();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    Sentry.captureException(new Error(`Schema validation failed: ${url}`), {
      extra: { url, rawResponse: raw, zodErrors: parsed.error.format() },
    });
    throw new SchemaValidationError(url, parsed.error);
  }
  return parsed.data;
}

export class SchemaValidationError extends Error {
  constructor(public url: string, public zodError: z.ZodError) {
    super(`Unexpected response shape from ${url}`);
    this.name = "SchemaValidationError";
  }
}
```

Then update each API function:

```typescript
// Before
export async function getVideoAnalysis(videoId: string): Promise<VideoAnalysis> {
  const res = await fetch(`/api/videos/${videoId}/analysis`);
  return res.json();
}

// After
export async function getVideoAnalysis(videoId: string): Promise<VideoAnalysis> {
  return fetchAndValidate(
    `/api/videos/${videoId}/analysis`,
    VideoAnalysisSchema,
  );
}
```

### 4. Codemod component files

Run a grep first to enumerate all `.map(` and `.length` usages in the target directories:

```bash
cd frontend
grep -rn '\.map(' src/components/analysis src/components/videos src/components/projects | wc -l
grep -rn '\.length' src/components/analysis src/components/videos src/components/projects | wc -l
```

For each file with unguarded `.map(` or `.length`, apply:

```typescript
// Before
{analysis.chunks.map(chunk => <ChunkRow key={chunk.id} chunk={chunk} />)}
{analysis.insights.length > 0 && <InsightsHeader />}

// After
{(analysis.chunks ?? []).map(chunk => <ChunkRow key={chunk.id} chunk={chunk} />)}
{(analysis.insights?.length ?? 0) > 0 && <InsightsHeader />}
```

For nested field access:

```typescript
// Before
{principle.how_might_we.map(hmw => <li key={hmw}>{hmw}</li>)}

// After
{(principle.how_might_we ?? []).map(hmw => <li key={hmw}>{hmw}</li>)}
```

Walk through EVERY hit in the grep output. Do not batch-apply blindly — some `.map(` calls are on arrays that really are guaranteed present (e.g., an inline `.map()` over an array literal). Apply the codemod only to optional/array-from-API sources.

### 5. Use the new types from schemas

Replace the types in `frontend/src/types/index.ts` with `z.infer<>` from the schemas. Delete or comment out the hand-written types so there's a single source of truth.

```typescript
// frontend/src/types/index.ts
export type { Video } from "@/schemas/video";
export type { Project, ProjectAnalysis } from "@/schemas/project";
export type { VideoAnalysis } from "@/schemas/analysis";
// ... etc
```

This might cascade into other files that import from `types/index.ts` — follow the compile errors and fix them. Most will just be import path changes.

### 6. Error boundaries

Check `frontend/src/components/ErrorBoundary.tsx` — it already exists. Read it. If it only wraps the top-level App, split it per-route:

```typescript
// frontend/src/components/RouteErrorBoundary.tsx
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { Button } from "@/components/ui/button";

function SomethingWentWrong({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button onClick={resetErrorBoundary}>Try again</Button>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </div>
  );
}

export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={SomethingWentWrong}>
      {children}
    </ErrorBoundary>
  );
}
```

Wrap route components in `frontend/src/App.tsx` (or the router config):

```typescript
<Route
  path="/videos/:videoId"
  element={
    <RouteErrorBoundary>
      <VideoDetailPage />
    </RouteErrorBoundary>
  }
/>
```

Check `react-error-boundary` is in `package.json`. If not, `npm install react-error-boundary`.

### 7. Unit tests for schemas

Create `frontend/src/schemas/__tests__/video.test.ts` and similar:

```typescript
import { describe, it, expect } from "vitest";
import { VideoSchema, VideoStatusSchema } from "../video";

describe("VideoSchema", () => {
  it("parses a valid video", () => {
    const valid = {
      id: "b3e8f956-1114-4387-85fa-05c934ed940d",
      project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
      filename: "test.mp4",
      status: "analyzed",
      s3_key: "videos/.../test.mp4",
      s3_url: "https://...",
      duration_seconds: 3,
      uploaded_at: "2026-04-07T17:17:01Z",
      file_size_bytes: 123456,
      error_message: "",
    };
    expect(() => VideoSchema.parse(valid)).not.toThrow();
  });

  it("defaults error_message to empty string if missing", () => {
    const { error_message, ...valid } = {
      id: "b3e8f956-1114-4387-85fa-05c934ed940d",
      project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
      filename: "test.mp4",
      status: "uploaded" as const,
    };
    const parsed = VideoSchema.parse(valid);
    expect(parsed.error_message).toBe("");
  });

  it("rejects invalid status", () => {
    const invalid = {
      id: "b3e8f956-1114-4387-85fa-05c934ed940d",
      project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
      filename: "test.mp4",
      status: "not_a_real_status",
    };
    expect(() => VideoSchema.parse(invalid)).toThrow();
  });

  it("tolerates null/missing optional fields", () => {
    const minimal = {
      id: "b3e8f956-1114-4387-85fa-05c934ed940d",
      project_id: "8b894631-2d32-4593-ae2a-e76e6d9f84f3",
      filename: "test.mp4",
      status: "uploaded",
    };
    expect(() => VideoSchema.parse(minimal)).not.toThrow();
  });
});
```

Repeat for `VideoAnalysisSchema`, `ProjectSchema`, `ProjectAnalysisSchema`, `TranscriptSchema`. At minimum:
- 1 "parses valid" test
- 1 "defaults missing optional" test
- 1 "rejects invalid enum" test
- 1 "tolerates null jsonb → []" test (on the jsonb fields)

### 8. Reproduce and fix JAVASCRIPT-REACT-6

Target: the frontend crash Sentry identified as `PrinciplesList` (minified `D4`) reading `s.how_might_we.length` inside `Array.map`. Fix C patched this, but let's add a test that would have caught it.

Create `frontend/src/components/analysis/__tests__/PrinciplesList.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PrinciplesList } from "../PrinciplesList";

describe("PrinciplesList — defensive rendering", () => {
  it("renders without crash when principle.how_might_we is undefined", () => {
    const principles = [
      { id: "1", title: "A", description: "B" /* how_might_we intentionally missing */ },
    ];
    expect(() => render(<PrinciplesList principles={principles as any} />)).not.toThrow();
  });

  it("renders without crash when principles is empty array", () => {
    expect(() => render(<PrinciplesList principles={[]} />)).not.toThrow();
  });

  it("renders without crash when principles is null (sentinel case)", () => {
    expect(() => render(<PrinciplesList principles={null as any} />)).not.toThrow();
  });
});
```

## Workflow

1. Create worktree:
   ```bash
   cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
   git fetch origin
   git worktree add -b fix/frontend-defensive ../5d-worktrees/pr21-frontend-defensive origin/main
   cd ../5d-worktrees/pr21-frontend-defensive/frontend
   npm ci  # install deps into the worktree's node_modules (might take 1-2 min)
   ```

2. Check `package.json` for `zod` and `react-error-boundary`. Install what's missing: `npm install zod react-error-boundary`.

3. Create the schema files (Layer 1).

4. Wire schemas into `services/api.ts`.

5. Enumerate codemod targets:
   ```bash
   grep -rn '\.map(' src/components/analysis src/components/videos src/components/projects > /tmp/map-hits.txt
   grep -rn '\.length' src/components/analysis src/components/videos src/components/projects > /tmp/length-hits.txt
   wc -l /tmp/map-hits.txt /tmp/length-hits.txt
   ```
   Review each hit and apply the codemod where appropriate.

6. Create `RouteErrorBoundary` component. Wrap route components in `App.tsx`.

7. Write schema unit tests.

8. Write the `PrinciplesList` regression test (even though Fix C already patched the component).

9. Run the frontend test suite: `npm run test` or `npx vitest run`.

10. TypeScript check: `npx tsc -b`. There will be errors if types drifted. Fix them.

11. Lint: `npm run lint`. Fix warnings.

12. Pre-push hook runs.

13. Commit as ONE commit or two (backend-facing types + rendering codemod), your call:
    ```
    feat(frontend): zod schemas at API boundary + defensive rendering audit (PR #21)

    Adds runtime schema validation for every API response using zod.
    Shape drift now surfaces as a Sentry event + toast instead of a
    React crash. Codemods .map() and .length across analysis/videos/
    projects components to tolerate null/undefined arrays. Adds
    RouteErrorBoundary wrapper per top-level route.

    Eliminates the class of bug behind Sentry JAVASCRIPT-REACT-6.

    - New: frontend/src/schemas/{video,analysis,project,transcript}.ts
    - Updated: frontend/src/services/api.ts wraps every response with
      schema.safeParse(); schema failures log to Sentry and throw
      SchemaValidationError
    - Updated: frontend/src/types/index.ts now re-exports from schemas
    - Updated: <N> components under analysis/videos/projects with
      defensive (x ?? []).map() and (x?.length ?? 0) patterns
    - New: frontend/src/components/RouteErrorBoundary.tsx wraps each
      top-level route
    - Tests: schema unit tests for all 4 families + PrinciplesList
      regression test for JAVASCRIPT-REACT-6

    Co-authored-by: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

14. Push, open PR.

## Scope guardrails

- **Touch only** `frontend/src/schemas/`, `frontend/src/services/api.ts`, `frontend/src/types/index.ts`, `frontend/src/components/{analysis,videos,projects}/**/*.tsx`, `frontend/src/components/ErrorBoundary.tsx` or `RouteErrorBoundary.tsx`, `frontend/src/App.tsx` (or router config), and the new test files
- **Do not** touch backend files — this is frontend-only
- **Do not** change visual design or add new features
- **Do not** refactor the API client structure beyond adding schema validation
- **Do not** rename components
- The codemod must be conservative — only guard array/length accesses where the data comes from an API response that could legitimately be missing the field

## Deliverable

Merged-ready PR + 300-word report with:
- Number of codemod sites touched
- Test results (schema unit tests + any component tests + existing frontend suite)
- TypeScript + lint results
- PR URL
- Any Sentry event types that should be added to the "expected" list in the project's Sentry config
