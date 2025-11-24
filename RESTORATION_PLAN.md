# Feature Restoration Plan - Nov 20 → Current

## Phase 1: Fix ProjectDetailPage (PRIORITY)
- [ ] Restore enhanced running state badge with time estimate
- [ ] Add new video detection logic
- [ ] Implement re-run analysis button with new video count
- [ ] Add amber warning badges for new videos
- [ ] Fix video status check (analyzed vs completed)

## Phase 2: Fix VideoDetailPage
- [ ] Ensure all step-by-step features work
- [ ] Verify retry button logic is correct
- [ ] Add missing UI component imports
- [ ] Verify ContinueStepButton is properly integrated

## Phase 3: Integrate UI Components
- [ ] Import and use LoadingButton where appropriate
- [ ] Add ErrorMessage components with actionable solutions
- [ ] Implement ProgressIndicator for long operations
- [ ] Add StatusIndicator for better visual feedback
- [ ] Integrate Tooltip for better UX

## Phase 4: Backend Stability
- [ ] Ensure timeout fix persists in Docker rebuild
- [ ] Add retry logic permanently
- [ ] Fix build issues with requirements.txt
- [ ] Ensure worker stability

## Phase 5: Testing
- [ ] Test step-by-step analysis flow
- [ ] Test retry functionality
- [ ] Test cross-video analysis
- [ ] Test auth flow
- [ ] Test upload functionality

## Features to PRESERVE from Current State:
1. Authentication (Clerk integration)
2. RBAC (Role-based access control)
3. User sync hooks
4. LandingPage component
5. Bug fixes for timeout and retry logic

## Features to RESTORE from Nov 20:
1. Enhanced UI feedback (badges, loading states)
2. New video detection for re-analysis
3. Proper error messages with solutions
4. Complete upload management flow
5. All usability improvements from USABILITY_FIXES_REQUIRED.md