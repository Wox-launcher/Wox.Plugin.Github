import { Context, Plugin, PluginInitParams, PublicAPI, Query, Result, ResultAction, WoxImage } from "@wox-launcher/wox-plugin"
import { spawn } from "child_process"
import { randomUUID } from "crypto"
import os from "os"
import { format } from "util"

import {
  acceptRepositoryInvitation,
  assignIssueToViewer,
  closeIssue,
  getIssueAssigneeLogins,
  getIssueRepositoryFullName,
  getMyIssues,
  getNotificationSubjectState,
  getViewer,
  invalidateIssueCaches,
  invalidateNotificationCaches,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsDone,
  markNotificationAsRead,
  matchesIssueSearch,
  matchesNotificationSearch,
  primeNotificationSubjectStates,
  reopenIssue,
  searchIssues,
  unassignIssueFromViewer,
  unsubscribeFromNotification
} from "./github"
import { buildNotificationUrl, getNotificationReasonTranslationKey, getNotificationTypeTranslationKey, NotificationSubjectState } from "./github-format"
import {
  IconActionAccept,
  IconActionAssign,
  IconActionClose,
  IconActionCopy,
  IconActionDone,
  IconActionMarkRead,
  IconActionOpenExternal,
  IconActionReopen,
  IconActionSearch,
  IconActionSkip,
  IconActionUnassign,
  IconActionUnsubscribe,
  IconIssue,
  IconIssueClosed,
  IconIssueOpen,
  IconNotificationInbox,
  IconPullRequestMerged,
  IconPullRequestOpen,
  IconRepositoryTag
} from "./icons"
import { parsePluginQuery } from "./query"
import { getSettings } from "./settings"
import { GitHubIssue, GitHubNotification, ParsedPluginQuery, PluginSettings } from "./types"

let api: PublicAPI

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
    return IconIssueClosed
  }

  return IconIssueOpen
}

function notificationIcon(notification: GitHubNotification, subjectState: NotificationSubjectState): WoxImage {
  switch (notification.subject.type) {
    case "Issue":
      return subjectState === "closed" ? IconIssueClosed : IconIssueOpen
    case "PullRequest":
      if (subjectState === "merged") {
        return IconPullRequestMerged
      }

      if (subjectState === "closed") {
        return IconIssueClosed
      }

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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

function buildCommandQuery(query: Query, command: string): string {
  const trigger = (query.TriggerKeyword || "gh").trim()
  return `${trigger} ${command} `.trimEnd()
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
    case "Search Results":
      return "group_search_results"
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

async function refreshCurrentQuery(ctx: Context, query: Query, preserveSelectedIndex: boolean): Promise<void> {
  await api.RefreshQuery(ctx, { PreserveSelectedIndex: preserveSelectedIndex })
  await api.ChangeQuery(ctx, {
    QueryType: query.Type,
    QueryText: query.RawQuery,
    QuerySelection: query.Selection
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
      Icon: IconIssue,
      Actions: [changeQueryAction(buildCommandQuery(query, "issues"), await t(ctx, "action_open_my_issues"), IconIssueOpen, true)]
    },
    {
      Id: makeResultId(),
      Title: await t(ctx, "home_search_issues_title"),
      SubTitle: await t(ctx, "home_search_issues_subtitle"),
      Icon: IconRepositoryTag,
      Actions: [changeQueryAction(buildCommandQuery(query, "search"), await t(ctx, "action_search_issues"), IconActionSearch, true)]
    },
    {
      Id: makeResultId(),
      Title: await t(ctx, "home_notifications_title"),
      SubTitle: await t(ctx, "home_notifications_subtitle"),
      Icon: IconNotificationInbox,
      Actions: [changeQueryAction(buildCommandQuery(query, "notifications"), await t(ctx, "action_open_notifications"), IconNotificationInbox, true)]
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

async function buildIssuePreview(ctx: Context, issue: GitHubIssue): Promise<string> {
  const assigneeLogins = getIssueAssigneeLogins(issue)
  const assignees = assigneeLogins.length > 0 ? assigneeLogins.join(", ") : await t(ctx, "issue_none")
  const labels = issue.labels
    .map(label => (typeof label === "string" ? label : label.name))
    .filter(Boolean)
    .join(", ")

  return [
    `# ${issue.title}`,
    "",
    `- ${await t(ctx, "preview_author")}: ${issue.user?.login || (await t(ctx, "issue_unknown_author"))}`,
    `- ${await t(ctx, "preview_assignees")}: ${assignees}`,
    `- ${await t(ctx, "preview_comments")}: ${String(issue.comments)}`,
    `- ${await t(ctx, "preview_labels")}: ${labels || (await t(ctx, "issue_none"))}`,
    "",
    issue.body || `_${await t(ctx, "issue_no_description")}_`
  ].join("\n")
}

async function buildIssueResult(ctx: Context, query: Query, settings: PluginSettings, viewerLogin: string, issue: GitHubIssue, group: string, groupScore: number): Promise<Result> {
  const repository = getIssueRepositoryFullName(issue)
  const assignedToViewer = getIssueAssigneeLogins(issue).some(login => login.toLowerCase() === viewerLogin.toLowerCase())
  const stateText = await getIssueStateLabelText(ctx, issue)

  const actions: ResultAction[] = [
    {
      Id: makeScopedActionId(issue.id.toString(), "open-issue"),
      Name: await t(ctx, "action_open_in_browser"),
      Icon: IconActionOpenExternal,
      IsDefault: true,
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
    Preview: {
      PreviewType: "markdown",
      PreviewData: await buildIssuePreview(ctx, issue),
      PreviewProperties: {
        [await t(ctx, "preview_repository")]: repository,
        [await t(ctx, "preview_number")]: `#${issue.number}`,
        [await t(ctx, "preview_state")]: stateText,
        [await t(ctx, "preview_updated")]: formatDate(issue.updated_at)
      }
    },
    Tails: [
      { Type: "text", Text: await tf(ctx, "issue_comments_tail", issue.comments) },
      { Type: "text", Text: stateText }
    ],
    Actions: actions
  }
}

async function buildNotificationPreview(_ctx: Context, notification: GitHubNotification): Promise<string> {
  return `# ${notification.subject.title}`
}

async function buildNotificationResult(ctx: Context, query: Query, settings: PluginSettings, notification: GitHubNotification, hasMultipleUnread: boolean): Promise<Result> {
  const notificationUrl = buildNotificationUrl(notification)
  const actions: ResultAction[] = []
  const isInvitation = notification.subject.type === "RepositoryInvitation"
  const subjectState = getNotificationSubjectState(settings, notification)
  const typeText = await getNotificationTypeText(ctx, notification)
  const reasonText = await getNotificationReasonText(ctx, notification)

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
    Icon: notificationIcon(notification, subjectState),
    Group: await t(ctx, notification.unread ? "group_unread" : "group_read"),
    GroupScore: notification.unread ? 200 : 100,
    Score: toScore(notification.updated_at),
    Preview: {
      PreviewType: "markdown",
      PreviewData: await buildNotificationPreview(ctx, notification),
      PreviewProperties: {
        [await t(ctx, "preview_repository")]: notification.repository.full_name,
        [await t(ctx, "preview_type")]: typeText,
        [await t(ctx, "preview_reason")]: reasonText,
        [await t(ctx, "preview_updated")]: formatDate(notification.updated_at)
      }
    },
    Tails: [{ Type: "text", Text: typeText }],
    Actions: actions
  }
}

async function queryIssues(ctx: Context, query: Query, settings: PluginSettings, parsed: ParsedPluginQuery): Promise<Result[]> {
  const [viewer, sections] = await Promise.all([getViewer(settings), getMyIssues(settings)])
  const resultPromises = sections.flatMap(section =>
    section.issues.filter(issue => matchesIssueSearch(issue, parsed.search)).map(issue => buildIssueResult(ctx, query, settings, viewer.login, issue, section.group, section.groupScore))
  )
  const results = await Promise.all(resultPromises)

  if (results.length > 0) {
    return results
  }

  return [
    emptyStateResult(
      await t(ctx, "empty_issues_title"),
      parsed.search ? await tf(ctx, "empty_issues_with_search", parsed.search) : await t(ctx, "empty_issues_default"),
      await t(ctx, "group_issues"),
      100
    )
  ]
}

async function querySearch(ctx: Context, query: Query, settings: PluginSettings, parsed: ParsedPluginQuery): Promise<Result[]> {
  const [viewer, issues] = await Promise.all([getViewer(settings), searchIssues(settings, parsed.search)])

  if (issues.length === 0) {
    return [
      emptyStateResult(
        await t(ctx, "empty_search_title"),
        parsed.search ? await tf(ctx, "empty_search_with_search", parsed.search) : await t(ctx, "empty_search_default"),
        await t(ctx, "group_search_results"),
        100
      )
    ]
  }

  return await Promise.all(issues.map(issue => buildIssueResult(ctx, query, settings, viewer.login, issue, "Search Results", 100)))
}

async function queryNotifications(ctx: Context, query: Query, settings: PluginSettings, parsed: ParsedPluginQuery): Promise<Result[]> {
  const notifications = (await listNotifications(settings))
    .filter(notification => !parsed.unreadOnly || notification.unread)
    .filter(notification => matchesNotificationSearch(notification, parsed.search))
    .filter(notification => {
      if (settings.repositoryFilterMode === "all" || settings.repositoryList.length === 0) {
        return true
      }

      const repository = notification.repository.full_name.toLowerCase()
      const listed = settings.repositoryList.includes(repository)
      return settings.repositoryFilterMode === "include" ? listed : !listed
    })

  await primeNotificationSubjectStates(settings, notifications)

  const unreadCount = notifications.filter(notification => notification.unread).length
  const results = await Promise.all(notifications.map(notification => buildNotificationResult(ctx, query, settings, notification, unreadCount > 1)))

  if (results.length > 0) {
    return results
  }

  return [
    emptyStateResult(
      await t(ctx, "empty_notifications_title"),
      parsed.search ? await tf(ctx, "empty_notifications_with_search", parsed.search) : await t(ctx, "empty_notifications_default"),
      await t(ctx, "group_notifications"),
      100
    )
  ]
}

export const plugin: Plugin = {
  init: async (ctx: Context, initParams: PluginInitParams) => {
    api = initParams.API
    await api.OnSettingChanged(ctx, async (_settingCtx, key) => {
      if (
        key === "personalAccessToken" ||
        key === "defaultSearchTerms" ||
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
    })

    await api.Log(ctx, "Info", "GitHub plugin initialized")
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    try {
      const settings = await getSettings(ctx, api)
      const parsed = parsePluginQuery(query.Command, query.Search)
      const configured = settings.personalAccessToken.length > 0

      if (!configured) {
        return [...(await setupResults(ctx, query)), ...(await buildHomeResults(ctx, query, parsed))]
      }

      switch (parsed.mode) {
        case "issues":
          return await queryIssues(ctx, query, settings, parsed)
        case "search":
          return await querySearch(ctx, query, settings, parsed)
        case "notifications":
          return await queryNotifications(ctx, query, settings, parsed)
        case "home":
        default:
          return await buildHomeResults(ctx, query, parsed)
      }
    } catch (error) {
      await api.Log(ctx, "Error", getErrorMessage(error))
      return [
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
