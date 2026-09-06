import { applyHtmlTemplate, loadHtmlTemplate } from "./html-template"

type NotificationSubject = {
  type: string
  title: string
  url?: string | null
  latest_comment_url?: string | null
}

type NotificationRepository = {
  full_name: string
  html_url: string
}

export type NotificationSubjectState = "open" | "closed" | "not_planned" | "merged" | null

export type NotificationLike = {
  id: string
  reason: string
  subject: NotificationSubject
  repository: NotificationRepository
}

export function getNotificationTypeTitle(notification: NotificationLike): string {
  switch (notification.subject.type) {
    case "PullRequest":
      return "Pull Request"
    case "CheckSuite":
      return "Check Suite"
    case "RepositoryInvitation":
      return "Repository Invitation"
    case "RepositoryVulnerabilityAlert":
      return "Repository Vulnerability Alert"
    default:
      return notification.subject.type
  }
}

export function getNotificationTypeTranslationKey(notification: NotificationLike): string {
  switch (notification.subject.type) {
    case "PullRequest":
      return "notification_type_pull_request"
    case "CheckSuite":
      return "notification_type_check_suite"
    case "RepositoryInvitation":
      return "notification_type_repository_invitation"
    case "RepositoryVulnerabilityAlert":
      return "notification_type_repository_vulnerability_alert"
    case "Issue":
      return "notification_type_issue"
    case "Release":
      return "notification_type_release"
    default:
      return "notification_type_default"
  }
}

export function getNotificationReasonLabel(notification: NotificationLike): string {
  switch (notification.reason) {
    case "assign":
      return "Assigned"
    case "author":
      return "Author"
    case "comment":
      return "Commented"
    case "ci_activity":
      return "CI Activity"
    case "invitation":
      return "Invited"
    case "manual":
      return "Subscribed"
    case "mention":
      return "Mentioned"
    case "review_requested":
      return "Review Requested"
    case "security_alert":
      return "Security Alert"
    case "state_change":
      return "Changed"
    case "subscribed":
      return "Watching"
    case "team_mention":
      return "Team Mentioned"
    default:
      return ""
  }
}

export function getNotificationReasonTranslationKey(notification: NotificationLike): string {
  switch (notification.reason) {
    case "assign":
      return "notification_reason_assign"
    case "author":
      return "notification_reason_author"
    case "comment":
      return "notification_reason_comment"
    case "ci_activity":
      return "notification_reason_ci_activity"
    case "invitation":
      return "notification_reason_invitation"
    case "manual":
      return "notification_reason_manual"
    case "mention":
      return "notification_reason_mention"
    case "review_requested":
      return "notification_reason_review_requested"
    case "security_alert":
      return "notification_reason_security_alert"
    case "state_change":
      return "notification_reason_state_change"
    case "subscribed":
      return "notification_reason_subscribed"
    case "team_mention":
      return "notification_reason_team_mention"
    default:
      return "notification_reason_unknown"
  }
}

export function getNotificationSubtitle(notification: NotificationLike): string {
  const parts = [notification.repository.full_name]
  const issueOrPrNumber = notification.subject.url ? notification.subject.url.split("/").pop() : ""

  if ((notification.subject.type === "Issue" || notification.subject.type === "PullRequest") && issueOrPrNumber) {
    parts.unshift(`#${issueOrPrNumber}`)
  }

  const reason = getNotificationReasonLabel(notification)
  if (reason) {
    parts.push(reason)
  }

  return parts.join(" • ")
}

export function getNotificationSubjectStateFromApiData(subjectType: string, data: { state?: unknown; merged?: unknown; merged_at?: unknown; state_reason?: unknown }): NotificationSubjectState {
  if (subjectType === "PullRequest" && (data.merged === true || (typeof data.merged_at === "string" && data.merged_at.length > 0))) {
    return "merged"
  }

  const normalizedState = typeof data.state === "string" ? data.state.toLowerCase() : ""
  if (normalizedState === "open") {
    return "open"
  }

  if (normalizedState === "closed") {
    const reason = typeof data.state_reason === "string" ? data.state_reason.toLowerCase() : ""
    if (reason === "not_planned" || reason === "duplicate") {
      return "not_planned"
    }

    return "closed"
  }

  return null
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export function formatCompactIssueDate(dateString: string, now = Date.now()): string {
  const timestamp = new Date(dateString).getTime()
  if (Number.isNaN(timestamp)) {
    return ""
  }

  const diffMs = Math.max(0, now - timestamp)
  if (diffMs < MINUTE_MS) {
    return "now"
  }
  if (diffMs < HOUR_MS) {
    return `${Math.floor(diffMs / MINUTE_MS)}m`
  }
  if (diffMs < DAY_MS) {
    return `${Math.floor(diffMs / HOUR_MS)}h`
  }
  if (diffMs < 2 * DAY_MS) {
    return "1d"
  }

  const date = new Date(timestamp)
  const compactDate = `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return compactDate
  }

  return `${compactDate}, ${date.getFullYear()}`
}

export type IssueHtmlBadge = "open" | "closed" | "not_planned"

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export function getIssueHtmlBadge(issue: { state?: string | null; state_reason?: string | null }): IssueHtmlBadge {
  if (issue.state === "closed") {
    if (issue.state_reason === "not_planned" || issue.state_reason === "duplicate") {
      return "not_planned"
    }
    return "closed"
  }

  return "open"
}

function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
}

export function toIssueBodyHtml(body: string | null | undefined, emptyBody: string): string {
  const text = body?.trim() || emptyBody
  const withImages = text.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_match, alt: string, src: string) => `\n\n<img alt="${escapeHtml(alt)}" src="${escapeHtml(src)}">\n\n`)
  if (/<[a-z][\s\S]*>/i.test(withImages)) {
    return stripScripts(
      withImages
        .split(/\n{2,}/)
        .map(block => {
          const trimmed = block.trim()
          if (!trimmed) {
            return ""
          }
          if (/<[a-z][\s\S]*>/i.test(trimmed)) {
            return trimmed.replace(/\n/g, "<br>")
          }
          return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p>`
        })
        .join("")
    )
  }

  return `<p>${escapeHtml(withImages)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")}</p>`
}

export type IssueCommentHtmlInput = {
  author: string
  avatarUrl?: string
  createdText: string
  body?: string | null
}

function renderIssueCommentHtml(comment: IssueCommentHtmlInput, emptyBody: string): string {
  const avatar = comment.avatarUrl ? `<img class="gh-avatar" src="${escapeHtml(getSizedAvatarUrl(comment.avatarUrl, 40))}" alt="">` : ""
  return applyHtmlTemplate(loadHtmlTemplate("issue-comment.html"), {
    avatar,
    author: escapeHtml(comment.author),
    createdText: escapeHtml(comment.createdText),
    body: toIssueBodyHtml(comment.body, emptyBody)
  })
}

export function formatGitHubIssueHtml(options: {
  title: string
  number: number
  body?: string | null
  repository: string
  stateText: string
  badge: IssueHtmlBadge
  author: string
  avatarUrl?: string
  openedText: string
  emptyBody: string
  labels?: Array<string | { name?: string | null; color?: string | null }>
  comments?: IssueCommentHtmlInput[]
}): string {
  const labels = (options.labels || []).map(label => (typeof label === "string" ? { name: label, color: "" } : { name: label.name || "", color: label.color || "" })).filter(label => label.name)
  const labelHtml = labels
    .map(label => {
      const color = /^[0-9a-f]{3,8}$/i.test(label.color) ? `#${label.color}` : ""
      const style = color ? ` style="border-color:${color};color:${color}"` : ""
      return `<span class="gh-label"${style}>${escapeHtml(label.name)}</span>`
    })
    .join("")
  const thread = [
    renderIssueCommentHtml(
      {
        author: options.author,
        avatarUrl: options.avatarUrl,
        createdText: options.openedText,
        body: options.body
      },
      options.emptyBody
    ),
    ...(options.comments || []).map(comment => renderIssueCommentHtml(comment, options.emptyBody))
  ].join("")

  return applyHtmlTemplate(loadHtmlTemplate("issue-detail.html"), {
    title: escapeHtml(options.title),
    number: String(options.number),
    badge: options.badge,
    stateText: escapeHtml(options.stateText),
    author: escapeHtml(options.author),
    openedText: escapeHtml(options.openedText),
    repository: escapeHtml(options.repository),
    labels: labelHtml ? `<div class="gh-labels">${labelHtml}</div>` : "",
    thread
  })
}

export function getSizedAvatarUrl(avatarUrl: string, size = 40): string {
  const separator = avatarUrl.includes("?") ? "&" : "?"
  return `${avatarUrl}${separator}s=${size}`
}

export function buildNotificationUrl(notification: NotificationLike): string {
  if (notification.subject.type === "RepositoryInvitation") {
    return `${notification.repository.html_url}/invitations`
  }

  if (!notification.subject.url) {
    if (notification.subject.type === "CheckSuite") {
      return `${notification.repository.html_url}/actions`
    }
    return notification.repository.html_url
  }

  let url = notification.subject.url.replace("https://api.github.com/repos", "https://github.com")
  url = url.replace("/pulls/", "/pull/")

  if (url.indexOf("/releases/") !== -1) {
    url = url.replace("/repos/", "/")
    url = url.slice(0, url.lastIndexOf("/"))
  }

  const latestComment = notification.subject.latest_comment_url
  if (latestComment) {
    const match = /comments\/(\d+)/.exec(latestComment)
    if (match) {
      url = `${url}#issuecomment-${match[1]}`
    }
  }

  return url
}
