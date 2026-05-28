import { Octokit } from "@octokit/rest"

import { getNotificationReasonLabel, getNotificationTypeTitle } from "./github-format"
import { GitHubIssue, GitHubNotification, GitHubViewer, IssueSection, IssueSort, MyIssuesResult, PluginSettings } from "./types"

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const VIEWER_CACHE_TTL_MS = 10 * 60 * 1000
const ISSUE_CACHE_TTL_MS = 45 * 1000
const NOTIFICATION_CACHE_TTL_MS = 20 * 1000

const clientCache = new Map<string, Octokit>()
const viewerCache = new Map<string, CacheEntry<GitHubViewer>>()
const issuesCache = new Map<string, CacheEntry<MyIssuesResult>>()
const notificationCache = new Map<string, CacheEntry<GitHubNotification[]>>()
const subjectStateCache = new Map<string, CacheEntry<string>>()

/**
 * Compute how long to cache a subject's state based on how old the notification is
 * and whether the fetched state is terminal (closed/merged).
 *
 * Age tiers (base TTL):
 *   < 1 h   →  1 min   (very fresh, state may still change)
 *   < 1 d   →  5 min
 *   < 7 d   → 15 min
 *   < 30 d  → 60 min
 *   ≥ 30 d  →  6 h
 *
 * Terminal states (closed / merged) get 10× the base TTL because they rarely reopen.
 */
function subjectStateTtl(updatedAt: string, state: string): number {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const HOUR = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR

  let baseTtl: number
  if (ageMs < HOUR) {
    baseTtl = 1 * 60 * 1000
  } else if (ageMs < DAY_MS) {
    baseTtl = 5 * 60 * 1000
  } else if (ageMs < 7 * DAY_MS) {
    baseTtl = 15 * 60 * 1000
  } else if (ageMs < 30 * DAY_MS) {
    baseTtl = 60 * 60 * 1000
  } else {
    baseTtl = 6 * 60 * 60 * 1000
  }

  const isTerminal = state === "closed" || state === "merged"
  return isTerminal ? baseTtl * 10 : baseTtl
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (!entry) {
    return null
  }

  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }

  return entry.value
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  return value
}

function getClient(token: string): Octokit {
  const cached = clientCache.get(token)
  if (cached) {
    return cached
  }

  const client = new Octokit({ auth: token })
  clientCache.set(token, client)
  return client
}

function normalizeQuery(input: string): string {
  return input.trim().replace(/\s+/g, " ")
}

function formatDate(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * DAY_IN_MS)
  return date.toISOString().slice(0, 10)
}

function getIssueSortApiParams(issueSort: IssueSort): { sort: "updated" | "created" | "comments"; order: "asc" | "desc" } {
  switch (issueSort) {
    case "updated-asc":
      return { sort: "updated", order: "asc" }
    case "created-desc":
      return { sort: "created", order: "desc" }
    case "created-asc":
      return { sort: "created", order: "asc" }
    case "comments-desc":
      return { sort: "comments", order: "desc" }
    case "comments-asc":
      return { sort: "comments", order: "asc" }
    case "updated-desc":
    default:
      return { sort: "updated", order: "desc" }
  }
}

function compareIssues(left: GitHubIssue, right: GitHubIssue, issueSort: IssueSort): number {
  switch (issueSort) {
    case "updated-asc":
      return new Date(left.updated_at).getTime() - new Date(right.updated_at).getTime()
    case "created-desc":
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    case "created-asc":
      return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    case "comments-desc":
      return right.comments - left.comments
    case "comments-asc":
      return left.comments - right.comments
    case "updated-desc":
    default:
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  }
}

export function getIssueRepositoryFullName(issue: GitHubIssue): string {
  const repositoryUrl = issue.repository_url.replace("https://api.github.com/repos/", "")
  return repositoryUrl.toLowerCase()
}

function isRepositoryAllowed(fullName: string, settings: PluginSettings): boolean {
  if (settings.repositoryFilterMode === "all" || settings.repositoryList.length === 0) {
    return true
  }

  const normalized = fullName.toLowerCase()
  const listed = settings.repositoryList.includes(normalized)

  if (settings.repositoryFilterMode === "include") {
    return listed
  }

  return !listed
}

function dedupeIssues(issues: GitHubIssue[]): GitHubIssue[] {
  const map = new Map<number, GitHubIssue>()
  issues.forEach(issue => {
    map.set(issue.id, issue)
  })

  return Array.from(map.values())
}

async function runIssueSearch(settings: PluginSettings, baseQuery: string): Promise<GitHubIssue[]> {
  const client = getClient(settings.personalAccessToken)
  const { sort, order } = getIssueSortApiParams(settings.issueSort)
  const scopedQueries = settings.repositoryFilterMode === "include" && settings.repositoryList.length > 0 ? settings.repositoryList.map(repository => `${baseQuery} repo:${repository}`) : [baseQuery]

  const results = await Promise.all(
    scopedQueries.map(query =>
      client.search.issuesAndPullRequests({
        q: normalizeQuery(query),
        per_page: settings.numberOfResults,
        sort,
        order
      })
    )
  )

  return dedupeIssues(
    results
      .flatMap(result => result.data.items)
      .filter(item => !item.pull_request)
      .filter(item => isRepositoryAllowed(getIssueRepositoryFullName(item), settings))
  )
    .sort((left, right) => compareIssues(left, right, settings.issueSort))
    .slice(0, settings.numberOfResults)
}

export async function getViewer(settings: PluginSettings): Promise<GitHubViewer> {
  const cacheKey = settings.personalAccessToken
  const cached = getCached(viewerCache, cacheKey)
  if (cached) {
    return cached
  }

  const client = getClient(settings.personalAccessToken)
  const response = await client.users.getAuthenticated()
  return setCached(viewerCache, cacheKey, response.data, VIEWER_CACHE_TTL_MS)
}

export async function getMyIssues(settings: PluginSettings): Promise<MyIssuesResult> {
  const cacheKey = JSON.stringify({
    token: settings.personalAccessToken,
    issueSort: settings.issueSort,
    showCreated: settings.showCreated,
    showAssigned: settings.showAssigned,
    showMentioned: settings.showMentioned,
    showRecentlyClosed: settings.showRecentlyClosed,
    repositoryFilterMode: settings.repositoryFilterMode,
    repositoryList: settings.repositoryList,
    numberOfResults: settings.numberOfResults
  })
  const cached = getCached(issuesCache, cacheKey)
  if (cached) {
    return cached
  }

  const viewer = await getViewer(settings)
  const definitions: Array<{ enabled: boolean; group: string; groupScore: number; query: string; recentlyClosed?: boolean }> = [
    {
      enabled: settings.showCreated,
      group: "Created",
      groupScore: 400,
      query: `is:issue author:${viewer.login} archived:false is:open`
    },
    {
      enabled: settings.showAssigned,
      group: "Assigned",
      groupScore: 300,
      query: `is:issue assignee:${viewer.login} archived:false is:open`
    },
    {
      enabled: settings.showMentioned,
      group: "Mentioned",
      groupScore: 200,
      query: `is:issue mentions:${viewer.login} archived:false is:open`
    }
  ]

  if (settings.showRecentlyClosed) {
    const updatedSince = `updated:>=${formatDate(60)}`

    if (settings.showCreated) {
      definitions.push({
        enabled: true,
        group: "Recently Closed",
        groupScore: 100,
        query: `is:issue author:${viewer.login} archived:false is:closed ${updatedSince}`,
        recentlyClosed: true
      })
    }
    if (settings.showAssigned) {
      definitions.push({
        enabled: true,
        group: "Recently Closed",
        groupScore: 100,
        query: `is:issue assignee:${viewer.login} archived:false is:closed ${updatedSince}`,
        recentlyClosed: true
      })
    }
    if (settings.showMentioned) {
      definitions.push({
        enabled: true,
        group: "Recently Closed",
        groupScore: 100,
        query: `is:issue mentions:${viewer.login} archived:false is:closed ${updatedSince}`,
        recentlyClosed: true
      })
    }
  }

  const results = await Promise.all(
    definitions
      .filter(definition => definition.enabled)
      .map(async definition => ({
        group: definition.group,
        groupScore: definition.groupScore,
        recentlyClosed: definition.recentlyClosed === true,
        issues: await runIssueSearch(settings, definition.query)
      }))
  )

  const sections: IssueSection[] = []
  const recentIssues = dedupeIssues(results.filter(result => result.recentlyClosed).flatMap(result => result.issues))

  results
    .filter(result => !result.recentlyClosed)
    .forEach(result => {
      if (result.issues.length > 0) {
        sections.push({ group: result.group, groupScore: result.groupScore, issues: result.issues })
      }
    })

  if (recentIssues.length > 0) {
    sections.push({ group: "Recently Closed", groupScore: 100, issues: recentIssues })
  }

  return setCached(issuesCache, cacheKey, { viewerLogin: viewer.login, sections }, ISSUE_CACHE_TTL_MS)
}

async function fetchSubjectState(url: string, token: string, updatedAt: string): Promise<void> {
  if (getCached(subjectStateCache, url) !== null) return
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Wox.Plugin.Github"
      }
    })
    if (!response.ok) return
    const data = (await response.json()) as { state?: string; merged?: boolean }
    const state = data.merged ? "merged" : data.state ?? null
    if (state) {
      setCached(subjectStateCache, url, state, subjectStateTtl(updatedAt, state))
    }
  } catch {
    // ignore errors for individual subject state fetches
  }
}

export function getSubjectState(url: string | null | undefined): string | null {
  if (!url) return null
  return getCached(subjectStateCache, url)
}

export async function listNotifications(settings: PluginSettings): Promise<GitHubNotification[]> {
  const cacheKey = JSON.stringify({
    token: settings.personalAccessToken,
    numberOfResults: settings.numberOfResults
  })
  const cached = getCached(notificationCache, cacheKey)
  if (cached) {
    return cached
  }

  const client = getClient(settings.personalAccessToken)
  const notifications = (
    await client.activity.listNotificationsForAuthenticatedUser({
      all: true,
      per_page: Math.min(Math.max(settings.numberOfResults, 1), 100)
    })
  ).data

  // Fetch issue/PR states in parallel to populate the subject state cache.
  // Each fetch is skipped if a valid cache entry already exists, so re-runs
  // only hit the network for entries whose TTL has expired.
  const subjectItems = notifications.filter(n => (n.subject.type === "Issue" || n.subject.type === "PullRequest") && n.subject.url)
  void Promise.allSettled(subjectItems.map(n => fetchSubjectState(n.subject.url, settings.personalAccessToken, n.updated_at)))

  return setCached(notificationCache, cacheKey, notifications, NOTIFICATION_CACHE_TTL_MS)
}

export function getIssueAssigneeLogins(issue: GitHubIssue): string[] {
  if (!issue.assignees) {
    return []
  }

  return issue.assignees.map(assignee => assignee.login).filter((login): login is string => Boolean(login))
}

export function matchesIssueSearch(issue: GitHubIssue, searchText: string): boolean {
  if (!searchText) {
    return true
  }

  const lower = searchText.toLowerCase()
  return (
    issue.title.toLowerCase().includes(lower) ||
    String(issue.number).includes(lower) ||
    getIssueRepositoryFullName(issue).includes(lower) ||
    issue.user?.login.toLowerCase().includes(lower) ||
    getIssueAssigneeLogins(issue).some(login => login.toLowerCase().includes(lower))
  )
}

export function matchesNotificationSearch(notification: GitHubNotification, searchText: string): boolean {
  if (!searchText) {
    return true
  }

  const lower = searchText.toLowerCase()
  return (
    notification.subject.title.toLowerCase().includes(lower) ||
    notification.repository.full_name.toLowerCase().includes(lower) ||
    getNotificationTypeTitle(notification).toLowerCase().includes(lower) ||
    getNotificationReasonLabel(notification).toLowerCase().includes(lower)
  )
}

export function invalidateIssueCaches(): void {
  issuesCache.clear()
}

export function invalidateNotificationCaches(): void {
  notificationCache.clear()
  subjectStateCache.clear()
}

export async function assignIssueToViewer(settings: PluginSettings, issue: GitHubIssue): Promise<void> {
  const viewer = await getViewer(settings)
  const client = getClient(settings.personalAccessToken)
  const [owner, repo] = getIssueRepositoryFullName(issue).split("/")

  await client.issues.addAssignees({
    owner,
    repo,
    issue_number: issue.number,
    assignees: [viewer.login]
  })

  invalidateIssueCaches()
}

export async function unassignIssueFromViewer(settings: PluginSettings, issue: GitHubIssue): Promise<void> {
  const viewer = await getViewer(settings)
  const client = getClient(settings.personalAccessToken)
  const [owner, repo] = getIssueRepositoryFullName(issue).split("/")

  await client.issues.removeAssignees({
    owner,
    repo,
    issue_number: issue.number,
    assignees: [viewer.login]
  })

  invalidateIssueCaches()
}

export async function closeIssue(settings: PluginSettings, issue: GitHubIssue, stateReason: "completed" | "not_planned"): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  const [owner, repo] = getIssueRepositoryFullName(issue).split("/")

  await client.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    state: "closed",
    state_reason: stateReason
  })

  invalidateIssueCaches()
}

export async function reopenIssue(settings: PluginSettings, issue: GitHubIssue): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  const [owner, repo] = getIssueRepositoryFullName(issue).split("/")

  await client.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    state: "open"
  })

  invalidateIssueCaches()
}

export async function markNotificationAsRead(settings: PluginSettings, threadId: string): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  await client.request("PATCH /notifications/threads/{thread_id}", {
    thread_id: parseInt(threadId, 10)
  })
  invalidateNotificationCaches()
}

export async function markNotificationAsDone(settings: PluginSettings, threadId: string): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  await client.request("DELETE /notifications/threads/{thread_id}", {
    thread_id: parseInt(threadId, 10)
  })
  invalidateNotificationCaches()
}

export async function unsubscribeFromNotification(settings: PluginSettings, threadId: string): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  await client.request("DELETE /notifications/threads/{thread_id}/subscription", {
    thread_id: parseInt(threadId, 10)
  })
  invalidateNotificationCaches()
}

export async function markAllNotificationsAsRead(settings: PluginSettings): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  await client.request("PUT /notifications")
  invalidateNotificationCaches()
}

export async function acceptRepositoryInvitation(settings: PluginSettings, notification: GitHubNotification): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  const invitations = await client.repos.listInvitationsForAuthenticatedUser()
  const invitation = invitations.data.find(item => item.repository.full_name.toLowerCase() === notification.repository.full_name.toLowerCase())

  if (!invitation) {
    throw new Error(`No pending invitation found for ${notification.repository.full_name}`)
  }

  await client.repos.acceptInvitationForAuthenticatedUser({
    invitation_id: invitation.id
  })

  invalidateNotificationCaches()
}
