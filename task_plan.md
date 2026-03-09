# Task Plan: Wox GitHub Plugin

## Goal
Build a Wox Node.js GitHub plugin that mirrors the core logic of Raycast's GitHub extension for issue and notification management, using Personal Access Token authentication.

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Plugin Design
- [x] Define commands, query grammar, and settings
- [x] Map Raycast capabilities to Wox results/actions
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Implement GitHub API client and auth handling
- [x] Implement issues flows
- [x] Implement notifications flows
- [x] Replace template metadata and docs
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run lint and tests
- [x] Verify build/package output
- [x] Fix any issues found
- **Status:** complete

### Phase 5: Delivery
- [x] Review modified files
- [x] Summarize behavior and limitations
- [x] Deliver to user
- **Status:** complete

## Key Questions
1. Which Raycast commands and behaviors for issues/notifications should be preserved in Wox's single-query UX?
2. Which Wox settings schema best supports PAT-based authentication and default GitHub filters?
3. Which notification actions can be supported cleanly without overextending the initial scope?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Reuse the existing Node.js Wox plugin template in this repo | The workspace is already scaffolded for a Wox SDK plugin, so replacing the template is faster and lower risk than regenerating a fresh project |
| Limit scope to issues and notifications with PAT auth | Matches the user's explicitly requested surface area |
| Model Wox UX around subcommands instead of separate pages | Raycast has separate commands, but Wox works better with a single query surface that branches into `issues`, `issue-search`, and `notifications` flows |
| Use GitHub REST search/issues/notifications endpoints with Octokit | The requested scope does not require the full Raycast GraphQL setup, and REST is enough for issue and notification management |
| Support core issue actions only: open, assign/unassign self, close, reopen, copy URL | These are the highest-value actions from Raycast's issue flow and map cleanly to Wox actions |
| Support core notification actions only: open, mark read, mark done, unsubscribe, mark all read | These are the main Raycast notification actions and are implementable with GitHub notification APIs |
| Extract notification formatting helpers into a pure module | Keeps Jest away from Octokit's ESM runtime while preserving unit tests for query and URL formatting |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Planning files were missing | 1 | Create task_plan.md, findings.md, and progress.md before substantial implementation |
| Partial git clone could not materialize blobs inside the sandbox | 1 | Switched to direct raw file fetches with escalated `curl -L` |
| Jest could not parse Octokit's ESM entrypoints | 1 | Moved pure notification helpers into a separate module that can be tested without importing Octokit |

## Notes
- Re-read this plan before major decisions.
- Record Raycast-specific behavior after inspecting the referenced extension.
