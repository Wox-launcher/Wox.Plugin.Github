import {
  Context,
  NewContext,
  Plugin,
  PluginInitParams,
  PublicAPI,
  Query,
  QueryRefinement,
  QueryResponse,
  Result,
  ResultAction,
  ResultTail,
  WoxImage,
  WoxPreview,
  WoxPreviewWebviewData
} from "@wox-launcher/wox-plugin"
import { spawn } from "child_process"
import { randomUUID } from "crypto"
import os from "os"
import { format } from "util"

import {
  acceptRepositoryInvitation,
  assignIssueToViewer,
  closeIssue,
  compareIssues,
  compareStarredRepos,
  getIssueAssigneeLogins,
  getIssueByRef,
  listIssueComments,
  getIssueRepositoryFullName,
  getMyIssues,
  getSubjectState,
  initGithub,
  invalidateIssueCaches,
  invalidateNotificationCaches,
  invalidateStarredCaches,
  listNotifications,
  listStarredRepos,
  markAllNotificationsAsRead,
  markNotificationAsDone,
  markNotificationAsRead,
  matchesIssueSearch,
  matchesNotificationSearch,
  matchesRepositorySearch,
  reopenIssue,
  unassignIssueFromViewer,
  unsubscribeFromNotification
} from "./github"
import {
  buildNotificationUrl,
  formatCompactIssueDate,
  formatGitHubIssueHtml,
  getIssueHtmlBadge,
  getNotificationReasonTranslationKey,
  getNotificationTypeTranslationKey,
  getSizedAvatarUrl
} from "./github-format"
import { setPluginDirectory } from "./html-template"
import {
  IconActionAccept,
  IconActionAssign,
  IconActionClose,
  IconActionCopy,
  IconActionDone,
  IconActionMarkRead,
  IconActionOpenExternal,
  IconActionReopen,
  IconActionSkip,
  IconActionUnassign,
  IconActionUnsubscribe,
  IconComment,
  IconIssueClosed,
  IconIssueNotPlanned,
  IconIssueOpen,
  IconNotificationInbox,
  IconNotificationInboxColored,
  IconGitHub,
  IconPullRequestClosed,
  IconPullRequestMerged,
  IconPullRequestOpen,
  IconRepositoryTag,
  IconStar
} from "./icons"
import { buildIssueDetailQuery, parsePluginQuery } from "./query"
import { getSettings } from "./settings"
import { GitHubIssue, GitHubNotification, GitHubRepository, IssueRef, IssueSort, ParsedPluginQuery, PluginSettings, StarredSort } from "./types"

let api: PublicAPI

// Background polling state
let pollInterval: ReturnType<typeof setInterval> | null = null
const BG_POLL_INTERVAL_MS = 2 * 60 * 1000

const ICON: WoxImage = {
  ImageType: "relative",
  ImageData: "images/app.svg"
}

const TOKEN_SCOPES = "repo notifications read:org read:user"
const CREATE_TOKEN_URL = "https://github.com/settings/tokens/new?description=Wox%20GitHub%20Plugin&scopes=repo,read:org,read:user,notifications"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function t(ctx: Context, key: string): Promise<string> {
  return await api.GetTranslation(ctx, key)
}

async function tf(ctx: Context, key: string, ...args: unknown[]): Promise<string> {
  return format(await t(ctx, key), ...args)
}

function toScore(dateString: string): number {
  return Math.floor(new Date(dateString).getTime() / 1000)
}

function issueIcon(issue: GitHubIssue): WoxImage {
  if (issue.state === "closed") {
    if (issue.state_reason === "not_planned" || issue.state_reason === "duplicate") {
      return IconIssueNotPlanned
    }

    return IconIssueClosed
  }

  return IconIssueOpen
}

function notificationIcon(notification: GitHubNotification, state: string | null): WoxImage {
  switch (notification.subject.type) {
    case "Issue":
      if (state === "not_planned") return IconIssueNotPlanned
      return state === "closed" ? IconIssueClosed : IconIssueOpen
    case "PullRequest":
      if (state === "merged") return IconPullRequestMerged
      if (state === "closed") return IconPullRequestClosed
      return IconPullRequestOpen
    case "RepositoryInvitation":
      return IconNotificationInbox
    case "CheckSuite":
      return IconNotificationInbox
    case "Release":
      return IconRepositoryTag
    default:
      return IconNotificationInbox
  }
}

function buildCommandQuery(query: Query, command: string): string {
  const trigger = (query.TriggerKeyword || "gh").trim()
  return `${trigger} ${command} `
}

function getIssueStateTranslationKey(issue: GitHubIssue): string {
  if (issue.state === "closed" && issue.state_reason === "not_planned") {
    return "issue_state_closed_not_planned"
  }

  if (issue.state === "closed" && issue.state_reason === "completed") {
    return "issue_state_closed_completed"
  }

  if (issue.state === "closed") {
    return "issue_state_closed"
  }

  return "issue_state_open"
}

function getIssueGroupTranslationKey(group: string): string {
  switch (group) {
    case "Created":
      return "group_created"
    case "Assigned":
      return "group_assigned"
    case "Mentioned":
      return "group_mentioned"
    case "Recently Closed":
      return "group_recently_closed"
    default:
      return "group_issues"
  }
}

function getNotificationNumberTag(notification: GitHubNotification): string {
  if (notification.subject.type !== "Issue" && notification.subject.type !== "PullRequest") {
    return ""
  }

  if (!notification.subject.url) {
    return ""
  }

  const number = notification.subject.url.split("/").pop()
  return number ? `#${number}` : ""
}

async function getIssueStateLabelText(ctx: Context, issue: GitHubIssue): Promise<string> {
  return await t(ctx, getIssueStateTranslationKey(issue))
}

async function getNotificationTypeText(ctx: Context, notification: GitHubNotification): Promise<string> {
  const key = getNotificationTypeTranslationKey(notification)
  if (key === "notification_type_default") {
    return notification.subject.type
  }

  return await t(ctx, key)
}

async function getNotificationReasonText(ctx: Context, notification: GitHubNotification): Promise<string> {
  const key = getNotificationReasonTranslationKey(notification)
  if (key === "notification_reason_unknown") {
    return await t(ctx, key)
  }

  return await t(ctx, key)
}

async function getNotificationSubtitleText(ctx: Context, notification: GitHubNotification): Promise<string> {
  const parts = [notification.repository.full_name]
  const numberTag = getNotificationNumberTag(notification)
  if (numberTag) {
    parts.unshift(numberTag)
  }

  const reason = await getNotificationReasonText(ctx, notification)
  if (reason) {
    parts.push(reason)
  }

  return parts.join(" • ")
}

async function openExternalUrl(url: string): Promise<void> {
  const platform = os.platform()

  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref()
    return
  }

  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref()
    return
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref()
}

function primaryHotkey(key: string): string {
  const modifier = os.platform() === "darwin" ? "cmd" : "ctrl"
  return `${modifier}+${key}`
}

async function refreshCurrentQuery(ctx: Context, query: Query, preserveSelectedIndex: boolean): Promise<void> {
  await api.RefreshQuery(ctx, { PreserveSelectedIndex: preserveSelectedIndex })
  if (query.Type === "selection") {
    await api.ChangeQuery(ctx, {
      QueryType: "selection",
      QuerySelection: query.Selection
    })
    return
  }

  await api.ChangeQuery(ctx, {
    QueryType: "input",
    QueryText: query.RawQuery,
    QueryHint: query.QueryHint
  })
}

async function runAction(ctx: Context, query: Query, successMessage: string, action: () => Promise<void>, preserveSelectedIndex = true): Promise<void> {
  try {
    await action()
    await api.Notify(ctx, successMessage)
    await refreshCurrentQuery(ctx, query, preserveSelectedIndex)
  } catch (error) {
    await api.Log(ctx, "Error", getErrorMessage(error))
    await api.Notify(ctx, getErrorMessage(error))
  }
}

function changeQueryAction(queryText: string, name: string, icon: WoxImage, isDefault = false): ResultAction {
  return {
    Id: `change-query-${name.toLowerCase().replace(/\s+/g, "-")}`,
    Name: name,
    Icon: icon,
    IsDefault: isDefault,
    PreventHideAfterAction: true,
    Action: async ctx => {
      await api.ChangeQuery(ctx, {
        QueryType: "input",
        QueryText: queryText
      })
    }
  }
}

function makeScopedActionId(scope: string, action: string): string {
  return `${action}-${scope}`
}

function makeResultId(): string {
  return randomUUID()
}

async function setupResults(ctx: Context, query: Query): Promise<Result[]> {
  return [
    {
      Id: makeResultId(),
      Title: await t(ctx, "setup_token_required_title"),
      SubTitle: await t(ctx, "setup_token_required_subtitle"),
      Icon: ICON,
      Group: await t(ctx, "group_setup"),
      GroupScore: 400,
      Preview: {
        PreviewType: "markdown",
        PreviewData: [
          `# ${await t(ctx, "setup_token_required_title")}`,
          "",
          await t(ctx, "setup_preview_line_1"),
          "",
          await tf(ctx, "setup_preview_line_2", TOKEN_SCOPES),
          "",
          await t(ctx, "setup_preview_line_3")
        ].join("\n"),
        PreviewProperties: {
          [await t(ctx, "preview_scopes")]: TOKEN_SCOPES,
          [await t(ctx, "preview_setting_key")]: "personalAccessToken"
        }
      },
      Actions: [
        {
          Id: "open-token-page",
          Name: await t(ctx, "action_open_token_page"),
          Icon: IconActionOpenExternal,
          IsDefault: true,
          Action: async () => {
            await openExternalUrl(CREATE_TOKEN_URL)
          }
        },
        {
          Id: "copy-token-scopes",
          Name: await t(ctx, "action_copy_required_scopes"),
          Icon: IconActionCopy,
          PreventHideAfterAction: true,
          Action: async actionCtx => {
            await api.Copy(actionCtx, { type: "text", text: TOKEN_SCOPES })
            await api.Notify(actionCtx, await t(actionCtx, "notify_copied_required_scopes"))
          }
        },
        changeQueryAction(buildCommandQuery(query, "issues"), await t(ctx, "action_go_to_my_issues"), IconIssueOpen)
      ]
    }
  ]
}

function emptyStateResult(title: string, subtitle: string, group: string, groupScore: number): Result {
  return {
    Id: makeResultId(),
    Title: title,
    SubTitle: subtitle,
    Icon: ICON,
    Group: group,
    GroupScore: groupScore
  }
}

async function buildHomeResults(ctx: Context, query: Query, parsed: ParsedPluginQuery): Promise<Result[]> {
  const commandResults: Result[] = [
    {
      Id: makeResultId(),
      Title: await t(ctx, "home_my_issues_title"),
      SubTitle: await t(ctx, "home_my_issues_subtitle"),
      Icon: IconIssueOpen,
      Actions: [changeQueryAction(buildCommandQuery(query, "issues"), await t(ctx, "action_open_my_issues"), IconIssueOpen, true)]
    },
    {
      Id: makeResultId(),
      Title: await t(ctx, "home_notifications_title"),
      SubTitle: await t(ctx, "home_notifications_subtitle"),
      Icon: IconNotificationInboxColored,
      Actions: [changeQueryAction(buildCommandQuery(query, "notifications"), await t(ctx, "action_open_notifications"), IconNotificationInbox, true)]
    },
    {
      Id: makeResultId(),
      Title: await t(ctx, "home_starred_title"),
      SubTitle: await t(ctx, "home_starred_subtitle"),
      Icon: IconStar,
      Actions: [changeQueryAction(buildCommandQuery(query, "starred"), await t(ctx, "action_open_starred"), IconStar, true)]
    }
  ]

  const lowerSearch = parsed.search.toLowerCase()
  return parsed.search
    ? commandResults.filter(result => {
        return (
          result.Title.toLowerCase().includes(lowerSearch) ||
          String(result.SubTitle || "")
            .toLowerCase()
            .includes(lowerSearch)
        )
      })
    : commandResults
}

async function buildIssueTails(ctx: Context, issue: GitHubIssue): Promise<ResultTail[]> {
  const commentsText = await tf(ctx, "issue_comments_tail", issue.comments)
  const createdAt = formatCompactIssueDate(issue.created_at)
  const createdText = createdAt === "now" ? await t(ctx, "tail_age_now") : createdAt
  const createdTooltip = await tf(ctx, "issue_created_tooltip", new Date(issue.created_at).toLocaleString())
  const authorLogin = issue.user?.login
  const avatarUrl = issue.user?.avatar_url

  const tails: ResultTail[] = [
    {
      Type: "image",
      Image: IconComment,
      ImageWidth: 14,
      ImageHeight: 14,
      Tooltip: commentsText
    },
    {
      Type: "text",
      Text: String(issue.comments),
      Tooltip: commentsText
    }
  ]

  if (createdText) {
    tails.push({
      Type: "text",
      Text: createdText,
      Tooltip: createdTooltip
    })
  }

  if (avatarUrl) {
    tails.push({
      Type: "image",
      Image: {
        ImageType: "url",
        ImageData: getSizedAvatarUrl(avatarUrl)
      },
      ImageWidth: 18,
      ImageHeight: 18,
      Tooltip: authorLogin || undefined
    })
  }

  return tails
}

async function buildIssuePreview(
  ctx: Context,
  issue: GitHubIssue,
  repository: string,
  stateText: string,
  comments: { author: string; avatarUrl?: string; createdText: string; body?: string | null }[] = []
): Promise<WoxPreview> {
  const author = issue.user?.login || (await t(ctx, "issue_unknown_author"))
  const opened = formatCompactIssueDate(issue.created_at)
  const webview: WoxPreviewWebviewData = {
    html: formatGitHubIssueHtml({
      title: issue.title,
      number: issue.number,
      body: issue.body,
      repository,
      stateText,
      badge: getIssueHtmlBadge(issue),
      author,
      avatarUrl: issue.user?.avatar_url || undefined,
      openedText: await tf(ctx, "issue_opened_ago", opened || issue.created_at),
      emptyBody: await t(ctx, "issue_no_description"),
      labels: issue.labels,
      comments
    }),
    cacheKey: `issue:${issue.id}:${issue.updated_at}:${comments.length}`
  }

  return {
    PreviewType: "webview",
    PreviewData: JSON.stringify(webview),
    PreviewProperties: {}
  }
}

async function buildIssueResult(ctx: Context, query: Query, settings: PluginSettings, viewerLogin: string, issue: GitHubIssue, group: string, groupScore: number): Promise<Result> {
  const repository = getIssueRepositoryFullName(issue)
  const assignedToViewer = getIssueAssigneeLogins(issue).some(login => login.toLowerCase() === viewerLogin.toLowerCase())
  const stateText = await getIssueStateLabelText(ctx, issue)

  const actions: ResultAction[] = [
    {
      Id: makeScopedActionId(issue.id.toString(), "view-issue"),
      Name: await t(ctx, "action_view_issue"),
      Icon: IconIssueOpen,
      IsDefault: true,
      PreventHideAfterAction: true,
      Action: async actionCtx => {
        await api.ChangeQuery(actionCtx, {
          QueryType: "input",
          ...buildIssueDetailQuery(query.TriggerKeyword || "gh", repository, issue.number)
        })
      }
    },
    {
      Id: makeScopedActionId(issue.id.toString(), "open-issue"),
      Name: await t(ctx, "action_open_in_browser"),
      Icon: IconActionOpenExternal,
      Hotkey: primaryHotkey("enter"),
      ContextData: {
        url: issue.html_url
      },
      Action: async (_ctx, actionCtx) => {
        await openExternalUrl(actionCtx.ContextData.url || issue.html_url)
      }
    },
    {
      Id: makeScopedActionId(issue.id.toString(), "copy-issue-url"),
      Name: await t(ctx, "action_copy_issue_url"),
      Icon: IconActionCopy,
      PreventHideAfterAction: true,
      ContextData: {
        url: issue.html_url
      },
      Action: async (actionCtx, actionContext) => {
        await api.Copy(actionCtx, { type: "text", text: actionContext.ContextData.url || issue.html_url })
        await api.Notify(actionCtx, await t(actionCtx, "notify_copied_issue_url"))
      }
    },
    {
      Id: makeScopedActionId(issue.id.toString(), "copy-issue-title"),
      Name: await t(ctx, "action_copy_issue_title"),
      Icon: IconActionCopy,
      PreventHideAfterAction: true,
      Action: async actionCtx => {
        await api.Copy(actionCtx, { type: "text", text: issue.title })
        await api.Notify(actionCtx, await t(actionCtx, "notify_copied_issue_title"))
      }
    }
  ]

  actions.push({
    Id: makeScopedActionId(issue.id.toString(), assignedToViewer ? "unassign-me" : "assign-me"),
    Name: await t(ctx, assignedToViewer ? "action_unassign_from_me" : "action_assign_to_me"),
    Icon: assignedToViewer ? IconActionUnassign : IconActionAssign,
    PreventHideAfterAction: true,
    Action: async actionCtx => {
      await runAction(actionCtx, query, await t(actionCtx, assignedToViewer ? "notify_unassigned_from_issue" : "notify_assigned_to_issue"), async () => {
        if (assignedToViewer) {
          await unassignIssueFromViewer(settings, issue)
        } else {
          await assignIssueToViewer(settings, issue)
        }
      })
    }
  })

  if (issue.state === "open") {
    actions.push(
      {
        Id: makeScopedActionId(issue.id.toString(), "close-completed"),
        Name: await t(ctx, "action_close_as_completed"),
        Icon: IconActionClose,
        PreventHideAfterAction: true,
        Action: async actionCtx => {
          await runAction(actionCtx, query, await tf(actionCtx, "notify_closed_issue_completed", issue.number), async () => {
            await closeIssue(settings, issue, "completed")
          })
        }
      },
      {
        Id: makeScopedActionId(issue.id.toString(), "close-not-planned"),
        Name: await t(ctx, "action_close_as_not_planned"),
        Icon: IconActionSkip,
        PreventHideAfterAction: true,
        Action: async actionCtx => {
          await runAction(actionCtx, query, await tf(actionCtx, "notify_closed_issue_not_planned", issue.number), async () => {
            await closeIssue(settings, issue, "not_planned")
          })
        }
      }
    )
  } else {
    actions.push({
      Id: makeScopedActionId(issue.id.toString(), "reopen-issue"),
      Name: await t(ctx, "action_reopen_issue"),
      Icon: IconActionReopen,
      PreventHideAfterAction: true,
      Action: async actionCtx => {
        await runAction(actionCtx, query, await tf(actionCtx, "notify_reopened_issue", issue.number), async () => {
          await reopenIssue(settings, issue)
        })
      }
    })
  }

  return {
    Id: makeResultId(),
    Title: issue.title,
    SubTitle: `${repository} • #${issue.number} • ${stateText}`,
    Icon: issueIcon(issue),
    Group: await t(ctx, getIssueGroupTranslationKey(group)),
    GroupScore: groupScore,
    Score: toScore(issue.updated_at),
    Tails: await buildIssueTails(ctx, issue),
    Actions: actions
  }
}

async function buildNotificationTails(ctx: Context, notification: GitHubNotification, typeText: string): Promise<ResultTail[]> {
  const updatedAt = formatCompactIssueDate(notification.updated_at)
  const updatedText = updatedAt === "now" ? await t(ctx, "tail_age_now") : updatedAt
  const tails: ResultTail[] = []

  if (updatedText) {
    tails.push({
      Type: "text",
      Text: updatedText,
      Tooltip: await tf(ctx, "notification_updated_tooltip", new Date(notification.updated_at).toLocaleString())
    })
  }

  tails.push({ Type: "text", Text: typeText })
  return tails
}

async function buildNotificationResult(ctx: Context, query: Query, settings: PluginSettings, notification: GitHubNotification, hasMultipleUnread: boolean): Promise<Result> {
  const notificationUrl = buildNotificationUrl(notification)
  const actions: ResultAction[] = []
  const isInvitation = notification.subject.type === "RepositoryInvitation"
  const typeText = await getNotificationTypeText(ctx, notification)

  actions.push({
    Id: makeScopedActionId(notification.id, isInvitation ? "accept-invitation" : "open-notification"),
    Name: await t(ctx, isInvitation ? "action_accept_invitation" : "action_open_in_browser"),
    Icon: isInvitation ? IconActionAccept : IconActionOpenExternal,
    IsDefault: true,
    ContextData: {
      url: isInvitation ? notification.repository.html_url : notificationUrl
    },
    Action: async (actionCtx, actionContext) => {
      if (isInvitation) {
        await runAction(actionCtx, query, await tf(actionCtx, "notify_accepted_invitation", notification.repository.full_name), async () => {
          await acceptRepositoryInvitation(settings, notification)
          await openExternalUrl(notification.repository.html_url)
        })
        return
      }

      await openExternalUrl(actionContext.ContextData.url || notificationUrl)
      if (notification.unread) {
        try {
          await markNotificationAsRead(settings, notification.id)
          await refreshCurrentQuery(actionCtx, query, true)
        } catch (error) {
          await api.Log(actionCtx, "Error", getErrorMessage(error))
        }
      }
    }
  })

  if (notification.unread) {
    actions.push({
      Id: makeScopedActionId(notification.id, "mark-read"),
      Name: await t(ctx, "action_mark_as_read"),
      Icon: IconActionMarkRead,
      PreventHideAfterAction: true,
      Action: async actionCtx => {
        await runAction(actionCtx, query, await t(actionCtx, "notify_marked_notification_read"), async () => {
          await markNotificationAsRead(settings, notification.id)
        })
      }
    })

    if (hasMultipleUnread) {
      actions.push({
        Id: makeScopedActionId(notification.id, "mark-all-read"),
        Name: await t(ctx, "mark_all_unread_title"),
        Icon: IconActionMarkRead,
        PreventHideAfterAction: true,
        Action: async actionCtx => {
          await runAction(
            actionCtx,
            query,
            await t(actionCtx, "notify_marked_all_notifications_read"),
            async () => {
              await markAllNotificationsAsRead(settings)
            },
            false
          )
        }
      })
    }
  }

  actions.push(
    {
      Id: makeScopedActionId(notification.id, "mark-done"),
      Name: await t(ctx, "action_mark_as_done"),
      Icon: IconActionDone,
      PreventHideAfterAction: true,
      Action: async actionCtx => {
        await runAction(actionCtx, query, await t(actionCtx, "notify_marked_notification_done"), async () => {
          await markNotificationAsDone(settings, notification.id)
        })
      }
    },
    {
      Id: makeScopedActionId(notification.id, "unsubscribe"),
      Name: await t(ctx, "action_unsubscribe"),
      Icon: IconActionUnsubscribe,
      PreventHideAfterAction: true,
      Action: async actionCtx => {
        await runAction(actionCtx, query, await t(actionCtx, "notify_unsubscribed_notification"), async () => {
          await unsubscribeFromNotification(settings, notification.id)
        })
      }
    },
    {
      Id: makeScopedActionId(notification.id, "copy-target-url"),
      Name: await t(ctx, "action_copy_target_url"),
      Icon: IconActionCopy,
      PreventHideAfterAction: true,
      ContextData: {
        url: notificationUrl
      },
      Action: async (actionCtx, actionContext) => {
        await api.Copy(actionCtx, { type: "text", text: actionContext.ContextData.url || notificationUrl })
        await api.Notify(actionCtx, await t(actionCtx, "notify_copied_notification_url"))
      }
    }
  )

  return {
    Id: makeResultId(),
    Title: notification.subject.title,
    SubTitle: await getNotificationSubtitleText(ctx, notification),
    Icon: notificationIcon(notification, getSubjectState(notification.subject.url)),
    Group: await t(ctx, notification.unread ? "group_unread" : "group_read"),
    GroupScore: notification.unread ? 200 : 100,
    Score: toScore(notification.updated_at),
    Tails: await buildNotificationTails(ctx, notification, typeText),
    Actions: actions
  }
}

function repositoryIcon(repository: GitHubRepository): WoxImage {
  const avatarUrl = repository.owner?.avatar_url
  if (!avatarUrl) {
    return IconStar
  }

  return {
    ImageType: "url",
    ImageData: getSizedAvatarUrl(avatarUrl)
  }
}

async function buildStarredRepoTails(ctx: Context, repository: GitHubRepository): Promise<ResultTail[]> {
  const tails: ResultTail[] = []
  const starredAt = repository.starred_at
  const starredText = starredAt ? formatCompactIssueDate(starredAt) : ""
  const starredLabel = starredText === "now" ? await t(ctx, "tail_age_now") : starredText

  if (repository.language) {
    tails.push({ Type: "text", Text: repository.language })
  }

  tails.push({
    Type: "text",
    Text: String(repository.stargazers_count),
    Tooltip: await tf(ctx, "repo_stars_tooltip", repository.stargazers_count)
  })

  if (starredAt && starredLabel) {
    tails.push({
      Type: "text",
      Text: starredLabel,
      Tooltip: await tf(ctx, "repo_starred_tooltip", new Date(starredAt).toLocaleString())
    })
  }

  return tails
}

function starredRepoScore(repository: GitHubRepository, sort: StarredSort): number {
  if (sort === "stars-desc") {
    return repository.stargazers_count
  }

  return repository.starred_at ? toScore(repository.starred_at) : 0
}

async function buildStarredRepoResult(ctx: Context, repository: GitHubRepository, sort: StarredSort): Promise<Result> {
  return {
    Id: makeResultId(),
    Title: repository.full_name,
    SubTitle: repository.description || (await t(ctx, "issue_no_description")),
    Icon: repositoryIcon(repository),
    Score: starredRepoScore(repository, sort),
    Tails: await buildStarredRepoTails(ctx, repository),
    Actions: [
      {
        Id: makeScopedActionId(String(repository.id), "open-repo"),
        Name: await t(ctx, "action_open_in_browser"),
        Icon: IconActionOpenExternal,
        IsDefault: true,
        ContextData: {
          url: repository.html_url
        },
        Action: async (_ctx, actionCtx) => {
          await openExternalUrl(actionCtx.ContextData.url || repository.html_url)
        }
      },
      {
        Id: makeScopedActionId(String(repository.id), "copy-repo-url"),
        Name: await t(ctx, "action_copy_repo_url"),
        Icon: IconActionCopy,
        PreventHideAfterAction: true,
        ContextData: {
          url: repository.html_url
        },
        Action: async (actionCtx, actionContext) => {
          await api.Copy(actionCtx, { type: "text", text: actionContext.ContextData.url || repository.html_url })
          await api.Notify(actionCtx, await t(actionCtx, "notify_copied_repo_url"))
        }
      }
    ]
  }
}

const REFINEMENT_STARRED_SORT_ID = "starred_sort"
const DEFAULT_STARRED_SORT: StarredSort = "starred-desc"

function parseStarredSort(value: string | undefined): StarredSort {
  return value === "stars-desc" ? "stars-desc" : DEFAULT_STARRED_SORT
}

async function queryStarred(ctx: Context, query: Query, settings: PluginSettings, parsed: ParsedPluginQuery): Promise<QueryResponse> {
  const selectedSort = parseStarredSort(query.Refinements?.[REFINEMENT_STARRED_SORT_ID])
  const repos = (await listStarredRepos(settings)).filter(repo => matchesRepositorySearch(repo, parsed.search)).sort((left, right) => compareStarredRepos(left, right, selectedSort))
  const results = await Promise.all(repos.map(repo => buildStarredRepoResult(ctx, repo, selectedSort)))

  return {
    Results:
      results.length > 0
        ? results
        : [
            {
              Id: makeResultId(),
              Title: await t(ctx, "empty_starred_title"),
              SubTitle: parsed.search ? await tf(ctx, "empty_starred_with_search", parsed.search) : await t(ctx, "empty_starred_default"),
              Icon: ICON
            }
          ],
    Refinements: [
      {
        Id: REFINEMENT_STARRED_SORT_ID,
        Title: await t(ctx, "refinement_sort_label"),
        Type: "sort",
        DefaultValue: [DEFAULT_STARRED_SORT],
        Hotkey: primaryHotkey("o"),
        Options: [
          { Value: "starred-desc", Title: await t(ctx, "sort_starred_desc") },
          { Value: "stars-desc", Title: await t(ctx, "sort_stars_desc") }
        ]
      }
    ]
  }
}

const REFINEMENT_REPO_ID = "notification_repo"
const REFINEMENT_UNREAD_ID = "notification_unread"
const REFINEMENT_TYPE_ID = "notification_type"
const REFINEMENT_ISSUE_STATE_ID = "issue_state"
const REFINEMENT_ISSUE_SORT_ID = "issue_sort"

async function queryIssueDetail(ctx: Context, query: Query, settings: PluginSettings, issueRef: IssueRef): Promise<QueryResponse> {
  const issue = await getIssueByRef(settings, issueRef.owner, issueRef.repo, issueRef.number)
  const [viewer, issueComments] = await Promise.all([getMyIssues(settings), listIssueComments(settings, issueRef.owner, issueRef.repo, issueRef.number)])
  const result = await buildIssueResult(ctx, query, settings, viewer.viewerLogin, issue, "Issues", 100)
  const stateText = await getIssueStateLabelText(ctx, issue)
  const repository = getIssueRepositoryFullName(issue)
  const unknownAuthor = await t(ctx, "issue_unknown_author")
  const comments = await Promise.all(
    issueComments.map(async comment => {
      const created = formatCompactIssueDate(comment.created_at)
      return {
        author: comment.user?.login || unknownAuthor,
        avatarUrl: comment.user?.avatar_url || undefined,
        createdText: await tf(ctx, "issue_commented_ago", created || comment.created_at),
        body: comment.body
      }
    })
  )

  return {
    Results: [
      {
        ...result,
        Group: undefined,
        GroupScore: undefined,
        Preview: await buildIssuePreview(ctx, issue, repository, stateText, comments),
        Actions: [
          {
            Id: makeScopedActionId(issue.id.toString(), "open-issue"),
            Name: await t(ctx, "action_open_in_browser"),
            Icon: IconActionOpenExternal,
            IsDefault: true,
            Hotkey: primaryHotkey("enter"),
            ContextData: {
              url: issue.html_url
            },
            Action: async (_ctx, actionCtx) => {
              await openExternalUrl(actionCtx.ContextData.url || issue.html_url)
            }
          },
          ...(result.Actions || []).filter(action => action.Id !== makeScopedActionId(issue.id.toString(), "view-issue") && action.Id !== makeScopedActionId(issue.id.toString(), "open-issue"))
        ]
      }
    ],
    Layout: {
      ResultPreviewWidthRatio: 0
    }
  }
}

async function queryIssues(ctx: Context, query: Query, settings: PluginSettings, parsed: ParsedPluginQuery): Promise<QueryResponse> {
  if (parsed.issueRef) {
    return await queryIssueDetail(ctx, query, settings, parsed.issueRef)
  }

  const issueData = await getMyIssues(settings)

  // Read refinement selections
  const selectedState = query.Refinements?.[REFINEMENT_ISSUE_STATE_ID] ?? "open"
  const selectedSort = (query.Refinements?.[REFINEMENT_ISSUE_SORT_ID] ?? settings.issueSort) as IssueSort

  // Filter sections by state
  let sections = issueData.sections
  if (selectedState === "open") {
    sections = sections.filter(s => s.group !== "Recently Closed")
  } else if (selectedState === "closed") {
    sections = sections.filter(s => s.group === "Recently Closed")
  }

  // Re-sort in memory if refinement differs from cached sort
  if (selectedSort !== settings.issueSort) {
    sections = sections.map(s => ({ ...s, issues: [...s.issues].sort((a, b) => compareIssues(a, b, selectedSort)) }))
  }

  const refinements: QueryRefinement[] = [
    {
      Id: REFINEMENT_ISSUE_STATE_ID,
      Title: await t(ctx, "refinement_state_label"),
      Type: "singleSelect",
      DefaultValue: ["open"],
      Hotkey: primaryHotkey("s"),
      Options: [
        { Value: "open", Title: await t(ctx, "refinement_state_open") },
        { Value: "closed", Title: await t(ctx, "refinement_state_closed") },
        { Value: "all", Title: await t(ctx, "refinement_state_all") }
      ]
    },
    {
      Id: REFINEMENT_ISSUE_SORT_ID,
      Title: await t(ctx, "refinement_sort_label"),
      Type: "sort",
      DefaultValue: [settings.issueSort],
      Hotkey: primaryHotkey("o"),
      Options: [
        { Value: "updated-desc", Title: await t(ctx, "sort_updated_desc") },
        { Value: "updated-asc", Title: await t(ctx, "sort_updated_asc") },
        { Value: "created-desc", Title: await t(ctx, "sort_created_desc") },
        { Value: "created-asc", Title: await t(ctx, "sort_created_asc") },
        { Value: "comments-desc", Title: await t(ctx, "sort_comments_desc") },
        { Value: "comments-asc", Title: await t(ctx, "sort_comments_asc") }
      ]
    }
  ]

  const resultPromises = sections.flatMap(section =>
    section.issues.filter(issue => matchesIssueSearch(issue, parsed.search)).map(issue => buildIssueResult(ctx, query, settings, issueData.viewerLogin, issue, section.group, section.groupScore))
  )
  const results = await Promise.all(resultPromises)

  return {
    Results:
      results.length > 0
        ? results
        : [
            emptyStateResult(
              await t(ctx, "empty_issues_title"),
              parsed.search ? await tf(ctx, "empty_issues_with_search", parsed.search) : await t(ctx, "empty_issues_default"),
              await t(ctx, "group_issues"),
              100
            )
          ],
    Refinements: refinements,
    Layout: {
      ResultPreviewWidthRatio: 0
    }
  }
}

async function queryNotifications(ctx: Context, query: Query, settings: PluginSettings, parsed: ParsedPluginQuery): Promise<QueryResponse> {
  // Apply settings-level filters (text search + repo allowlist/blocklist)
  const baseNotifications = (await listNotifications(settings))
    .filter(n => matchesNotificationSearch(n, parsed.search))
    .filter(n => {
      if (settings.repositoryFilterMode === "all" || settings.repositoryList.length === 0) return true
      const repo = n.repository.full_name.toLowerCase()
      const listed = settings.repositoryList.includes(repo)
      return settings.repositoryFilterMode === "include" ? listed : !listed
    })

  // Read refinement selections
  const showUnreadOnly = parsed.unreadOnly || query.Refinements?.[REFINEMENT_UNREAD_ID] === "unread"
  const selectedTypes = new Set(
    (query.Refinements?.[REFINEMENT_TYPE_ID] ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  )
  const selectedRepos = new Set(
    (query.Refinements?.[REFINEMENT_REPO_ID] ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  )

  // Apply refinement filters
  const filteredNotifications = baseNotifications
    .filter(n => !showUnreadOnly || n.unread)
    .filter(n => selectedTypes.size === 0 || selectedTypes.has(n.subject.type))
    .filter(n => selectedRepos.size === 0 || selectedRepos.has(n.repository.full_name))

  // Build refinements (counts from baseNotifications, before refinement filtering)
  const refinements: QueryRefinement[] = []

  // Unread toggle (always shown)
  refinements.push({
    Id: REFINEMENT_UNREAD_ID,
    Title: await t(ctx, "refinement_unread_label"),
    Type: "toggle",
    Hotkey: primaryHotkey("u"),
    Options: [{ Value: "unread", Title: await t(ctx, "refinement_unread_only") }]
  })

  // Type filter (only when multiple types present)
  const typeCounts = new Map<string, number>()
  for (const n of baseNotifications) {
    typeCounts.set(n.subject.type, (typeCounts.get(n.subject.type) ?? 0) + 1)
  }
  if (typeCounts.size > 1) {
    refinements.push({
      Id: REFINEMENT_TYPE_ID,
      Title: await t(ctx, "refinement_type_label"),
      Type: "multiSelect",
      Hotkey: primaryHotkey("t"),
      Options: await Promise.all(
        Array.from(typeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(async ([type, count]) => {
            const key = getNotificationTypeTranslationKey({ id: "", reason: "", subject: { type, title: "" }, repository: { full_name: "", html_url: "" } })
            const title = key === "notification_type_default" ? type : await t(ctx, key)
            return { Value: type, Title: title, Count: count }
          })
      )
    })
  }

  // Repo filter (only when multiple repos present)
  const repoCounts = new Map<string, number>()
  for (const n of baseNotifications) {
    repoCounts.set(n.repository.full_name, (repoCounts.get(n.repository.full_name) ?? 0) + 1)
  }
  if (repoCounts.size > 1) {
    refinements.push({
      Id: REFINEMENT_REPO_ID,
      Title: await t(ctx, "refinement_repo_label"),
      Type: "multiSelect",
      Hotkey: primaryHotkey("r"),
      Options: Array.from(repoCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([repo, count]) => ({ Value: repo, Title: repo, Count: count }))
    })
  }

  const unreadCount = filteredNotifications.filter(n => n.unread).length
  const results = await Promise.all(filteredNotifications.map(n => buildNotificationResult(ctx, query, settings, n, unreadCount > 1)))

  return {
    Results:
      results.length > 0
        ? results
        : [
            emptyStateResult(
              await t(ctx, "empty_notifications_title"),
              parsed.search ? await tf(ctx, "empty_notifications_with_search", parsed.search) : await t(ctx, "empty_notifications_default"),
              await t(ctx, "group_notifications"),
              100
            )
          ],
    Refinements: refinements
  }
}

async function prefetchStarredRepos(): Promise<void> {
  const ctx = NewContext()
  try {
    const settings = await getSettings(ctx, api)
    if (!settings.personalAccessToken) return
    await listStarredRepos(settings)
  } catch (error) {
    void api.Log(ctx, "Error", `Starred prefetch failed: ${getErrorMessage(error)}`)
  }
}

async function pollInBackground(): Promise<void> {
  const ctx = NewContext()
  try {
    const settings = await getSettings(ctx, api)
    if (!settings.personalAccessToken) return

    const notifications = await listNotifications(settings)
    const unreadNotifications = notifications.filter(n => n.unread)

    if (unreadNotifications.length > 0 && typeof api.PushAttention === "function") {
      await api.PushAttention(ctx, {
        key: "notifications-unread",
        title: await tf(ctx, "attention_unread_notifications", unreadNotifications.length),
        icon: IconGitHub,
        action: { type: "change_query", query: "gh notifications " }
      })
    }
  } catch (error) {
    void api.Log(ctx, "Error", `Background poll failed: ${getErrorMessage(error)}`)
  }
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    setPluginDirectory(initParams.PluginDirectory)
    await initGithub(ctx, api)
    await api.OnSettingChanged(ctx, async (_settingCtx, key) => {
      if (
        key === "personalAccessToken" ||
        key === "numberOfResults" ||
        key === "issueSort" ||
        key === "showCreated" ||
        key === "showAssigned" ||
        key === "showMentioned" ||
        key === "showRecentlyClosed" ||
        key === "repositoryFilterMode" ||
        key === "repositoryList"
      ) {
        invalidateIssueCaches()
        invalidateNotificationCaches()
      }
      if (key === "personalAccessToken") {
        invalidateStarredCaches()
      }
    })

    await api.OnUnload(ctx, async () => {
      if (pollInterval !== null) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    })

    // Initial seed (no attention pushes), then poll every 2 minutes
    void pollInBackground()
    void prefetchStarredRepos()
    pollInterval = setInterval(() => {
      void pollInBackground()
    }, BG_POLL_INTERVAL_MS)

    await api.Log(ctx, "Info", "GitHub plugin initialized")
  },

  query: async (ctx: Context, query: Query): Promise<QueryResponse> => {
    try {
      const settings = await getSettings(ctx, api)
      const parsed = parsePluginQuery(query.Command, query.Search, query.QueryHint)
      const configured = settings.personalAccessToken.length > 0

      if (!configured) {
        return { Results: [...(await setupResults(ctx, query)), ...(await buildHomeResults(ctx, query, parsed))] }
      }

      switch (parsed.mode) {
        case "issues":
          return await queryIssues(ctx, query, settings, parsed)
        case "notifications":
          return await queryNotifications(ctx, query, settings, parsed)
        case "starred":
          return await queryStarred(ctx, query, settings, parsed)
        case "home":
        default:
          return { Results: await buildHomeResults(ctx, query, parsed) }
      }
    } catch (error) {
      await api.Log(ctx, "Error", getErrorMessage(error))
      return {
        Results: [
          {
            Id: makeResultId(),
            Title: await t(ctx, "error_request_failed_title"),
            SubTitle: getErrorMessage(error),
            Icon: ICON,
            Group: await t(ctx, "group_errors"),
            GroupScore: 500
          }
        ]
      }
    }
  }
}
