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

export type NotificationSubjectState = "open" | "closed" | "merged" | null

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

export function getNotificationSubjectStateFromApiData(subjectType: string, data: { state?: unknown; merged?: unknown; merged_at?: unknown }): NotificationSubjectState {
  if (subjectType === "PullRequest" && (data.merged === true || (typeof data.merged_at === "string" && data.merged_at.length > 0))) {
    return "merged"
  }

  const normalizedState = typeof data.state === "string" ? data.state.toLowerCase() : ""
  if (normalizedState === "open" || normalizedState === "closed") {
    return normalizedState
  }

  return null
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
