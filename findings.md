# Findings & Decisions

## Requirements
- Build a Wox GitHub plugin modeled after the Raycast GitHub extension behavior.
- Support Personal Access Token authentication.
- Focus only on issue management and notification management for now.
- Use the existing Wox plugin repository at `/Users/qianlifeng/Projects/Wox.Plugin.Github`.

## Research Findings
- The current repository is a stock Wox Node.js plugin template with placeholder metadata and a hello-world query handler.
- Wox Node.js plugins expose `init(ctx, params)` and `query(ctx, query)` and can retrieve settings via `GetSetting`.
- `plugin.json` supports `SettingDefinitions`, so PAT and default filters can be exposed through Wox settings UI.
- Raycast's `My Issues` command groups results into Created, Assigned, Mentioned, and Recently Closed sections and applies a repository filter plus a persisted sort query.
- Raycast's `Search Issues` command runs a global issue search with default search terms, optional repository filtering, and configurable result count.
- Raycast's `Notifications` command fetches authenticated notifications, optionally filters by repository, and separates unread and read threads.
- Raycast notification actions include open in browser, mark as read, mark as done, unsubscribe, accept invitation, and mark all as read.
- Raycast issue actions are broader, but the core reusable subset for Wox is open in browser, assign/unassign self, reopen, close with reason, and copy metadata.
- Raycast authenticates with a Personal Access Token and documents scopes `notifications repo project read:org read:user`; this plugin only needs the issue/notification-relevant subset.
- Wox results support `Group` and `GroupScore`, which are sufficient to mirror Raycast's Created / Assigned / Mentioned / Recently Closed and Unread / Read sectioning.
- Wox actions support `PreventHideAfterAction`, which works well for in-place GitHub mutations that should refresh the result list.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Keep runtime as Node.js TypeScript | The repo is already configured for it and it aligns with the existing template/tooling |
| Use plugin settings for PAT instead of prompting in-query | Wox already provides persistent settings storage and validation |
| Collapse Raycast's multiple commands into one Wox plugin with subcommands | Wox query UX is better suited to one trigger keyword with typed subcommands than to many separate commands |
| Prefer GitHub REST endpoints via `@octokit/rest` | REST covers search, issue updates, assignee changes, and notifications without GraphQL codegen overhead |
| Add repository filter mode and repository list settings | These are part of Raycast's issue and unread-notification workflows and are useful in Wox too |
| Add default search terms and number-of-results settings | They carry over Raycast's search behavior while staying simple for Wox |
| Use grouped Wox results instead of separate views for issue buckets and unread/read notifications | This preserves the Raycast mental model while fitting Wox's single-result-list UI |
| Keep notifications browser-first instead of fetching full thread details | The requested scope is management, not deep inline reading, so extra detail fetches would add complexity without much value |
| Use inline `I18n` in `plugin.json` plus runtime `GetTranslation` calls | This follows the Wox i18n guidance and keeps manifest strings and dynamic strings on the same translation source |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Repository metadata and source are still placeholders | Replace template content during implementation |
| Git partial clone was insufficient for reading referenced commit files in the sandbox | Fetched raw source files directly over HTTPS instead |
| Jest could not load Octokit's ESM package through the existing config | Moved pure notification formatting logic into `src/github-format.ts` so tests stay runtime-agnostic |

## Resources
- Local plugin manifest: `/Users/qianlifeng/Projects/Wox.Plugin.Github/plugin.json`
- Local source entry: `/Users/qianlifeng/Projects/Wox.Plugin.Github/src/index.ts`
- Wox SDK reference: `/Users/qianlifeng/.wox/ai/skills/wox-plugin-creator/references/sdk_nodejs.md`
- Wox plugin schema reference: `/Users/qianlifeng/.wox/ai/skills/wox-plugin-creator/references/plugin_json_schema.md`
- Raycast GitHub extension reference requested by user: `https://github.com/raycast/extensions/tree/214a457ef67f15c83958382bf05db0a8c57f0723/extensions/github/`
- Local GitHub client/cache layer: `/Users/qianlifeng/Projects/Wox.Plugin.Github/src/github.ts`
- Local notification formatting helpers: `/Users/qianlifeng/Projects/Wox.Plugin.Github/src/github-format.ts`

## Visual/Browser Findings
- `my-issues.tsx` builds a segmented list with repository dropdown, persisted sort query, and category toggles from preferences.
- `useMyIssues.ts` composes multiple GitHub search queries for created, assigned, mentioned, and recently closed issue buckets, deduplicating recently closed results.
- `search-issues.tsx` performs global issue search using `is:issue archived:false` plus sort, repository filter, default search terms, and a result-count preference.
- `notifications.tsx` loads all notifications, optionally filters by repository, derives per-notification icons, and displays unread/read sections.
- `NotificationActions.tsx` confirms the main actionable set for Wox: open notification target, mark read, mark done, mark all read, unsubscribe, and accept repository invitations.
- `helpers/notifications.ts` converts API URLs to browser URLs and derives labels like reason, type title, and issue/PR number tags.
- The extension README confirms PAT setup guidance and the preferred token creation URL, which is now mirrored in this plugin's setup flow and README.

*Update this file after every 2 view/browser/search operations*
