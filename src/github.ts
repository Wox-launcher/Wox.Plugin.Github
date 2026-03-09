import { Octokit } from "@octokit/rest"

import { getNotificationReasonLabel, getNotificationSubjectStateFromApiData, getNotificationTypeTitle, NotificationSubjectState } from "./github-format"
import { GitHubIssue, GitHubNotification, GitHubViewer, IssueSection, IssueSort, PluginSettings } from "./types"

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const VIEWER_CACHE_TTL_MS = 10 * 60 * 1000
const ISSUE_CACHE_TTL_MS = 45 * 1000
const SEARCH_CACHE_TTL_MS = 30 * 1000
const NOTIFICATION_CACHE_TTL_MS = 20 * 1000

const clientCache = new Map<string, Octokit>()
const viewerCache = new Map<string, CacheEntry<GitHubViewer>>()
const issuesCache = new Map<string, CacheEntry<IssueSection[]>>()
const issueSearchCache = new Map<string, CacheEntry<GitHubIssue[]>>()
const notificationCache = new Map<string, CacheEntry<GitHubNotification[]>>()
const notificationSubjectStateCache = new Map<string, CacheEntry<NotificationSubjectState>>()
const NOTIFICATION_STATE_BATCH_SIZE = 20

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

function expandMePlaceholders(input: string, viewerLogin: string): string {
  return input.replace(/(^|\s)(author|assignee|mentions|involves):@me\b/gi, (_match, prefix, qualifier) => {
    return `${prefix}${String(qualifier).toLowerCase()}:${viewerLogin}`
  })
}

type NotificationSubjectRef = {
  cacheKey: string
  number: number
  owner: string
  repository: string
  subjectType: "Issue" | "PullRequest"
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function getNotificationSubjectCacheKey(token: string, subjectUrl?: string | null): string | null {
  if (!subjectUrl) {
    return null
  }

  return `${token}:${subjectUrl}`
}

function parseNotificationSubjectRef(settings: PluginSettings, notification: GitHubNotification): NotificationSubjectRef | null {
  if ((notification.subject.type !== "Issue" && notification.subject.type !== "PullRequest") || !notification.subject.url) {
    return null
  }

  const match = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)$/.exec(notification.subject.url)
  if (!match) {
    return null
  }

  const cacheKey = getNotificationSubjectCacheKey(settings.personalAccessToken, notification.subject.url)
  if (!cacheKey) {
    return null
  }

  return {
    cacheKey,
    owner: match[1],
    repository: match[2],
    number: parseInt(match[4], 10),
    subjectType: notification.subject.type
  }
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

export async function getMyIssues(settings: PluginSettings): Promise<IssueSection[]> {
  const cacheKey = JSON.stringify({
    token: settings.personalAccessToken,
    issueSort: settings.issueSort,
    showCreated: settings.showCreated,
    showAssigned: settings.showAssigned,
    showMentioned: settings.showMentioned,
    showRecentlyClosed: settings.showRecentlyClosed,
    repositoryFilterMode: settings.repositoryFilterMode,
    repositoryList: settings.repositoryList
  })
  const cached = getCached(issuesCache, cacheKey)
  if (cached) {
    return cached
  }

  const viewer = await getViewer(settings)
  const updatedSince = `updated:>=${formatDate(60)}`

  const definitions: Array<{ enabled: boolean; group: string; groupScore: number; query: string; recentlyClosed?: boolean }> = [
    {
      enabled: settings.showCreated,
      group: "Created",
      groupScore: 400,
      query: `is:issue author:${viewer.login} archived:false is:open ${updatedSince}`
    },
    {
      enabled: settings.showAssigned,
      group: "Assigned",
      groupScore: 300,
      query: `is:issue assignee:${viewer.login} archived:false is:open ${updatedSince}`
    },
    {
      enabled: settings.showMentioned,
      group: "Mentioned",
      groupScore: 200,
      query: `is:issue mentions:${viewer.login} archived:false is:open ${updatedSince}`
    }
  ]

  if (settings.showRecentlyClosed) {
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

  return setCached(issuesCache, cacheKey, sections, ISSUE_CACHE_TTL_MS)
}

export async function searchIssues(settings: PluginSettings, searchText: string): Promise<GitHubIssue[]> {
  const viewer = await getViewer(settings)
  const cacheKey = JSON.stringify({
    token: settings.personalAccessToken,
    searchText,
    defaultSearchTerms: settings.defaultSearchTerms,
    issueSort: settings.issueSort,
    repositoryFilterMode: settings.repositoryFilterMode,
    repositoryList: settings.repositoryList,
    numberOfResults: settings.numberOfResults
  })
  const cached = getCached(issueSearchCache, cacheKey)
  if (cached) {
    return cached
  }

  const queryParts = ["is:issue", "archived:false"]
  const defaultTerms = expandMePlaceholders(settings.defaultSearchTerms, viewer.login)
  if (defaultTerms) {
    queryParts.push(defaultTerms)
  }
  if (searchText) {
    queryParts.push(expandMePlaceholders(searchText, viewer.login))
  }

  const issues = await runIssueSearch(settings, queryParts.join(" "))
  return setCached(issueSearchCache, cacheKey, issues, SEARCH_CACHE_TTL_MS)
}

export async function listNotifications(settings: PluginSettings): Promise<GitHubNotification[]> {
  const cacheKey = settings.personalAccessToken
  const cached = getCached(notificationCache, cacheKey)
  if (cached) {
    return cached
  }

  const client = getClient(settings.personalAccessToken)
  const notifications = await client.paginate(client.activity.listNotificationsForAuthenticatedUser, {
    all: true,
    per_page: 50
  })

  return setCached(notificationCache, cacheKey, notifications, NOTIFICATION_CACHE_TTL_MS)
}

export function getNotificationSubjectState(settings: PluginSettings, notification: GitHubNotification): NotificationSubjectState {
  const cacheKey = getNotificationSubjectCacheKey(settings.personalAccessToken, notification.subject.url)
  if (!cacheKey) {
    return null
  }

  return getCached(notificationSubjectStateCache, cacheKey)
}

export async function primeNotificationSubjectStates(settings: PluginSettings, notifications: GitHubNotification[]): Promise<void> {
  const client = getClient(settings.personalAccessToken)
  const refs = notifications.map(notification => parseNotificationSubjectRef(settings, notification)).filter((ref): ref is NotificationSubjectRef => ref !== null)
  const uniqueRefs = Array.from(new Map(refs.map(ref => [ref.cacheKey, ref])).values())
  const uncachedRefs = uniqueRefs.filter(ref => getCached(notificationSubjectStateCache, ref.cacheKey) === null)

  if (uncachedRefs.length === 0) {
    return
  }

  await Promise.all(
    chunkValues(uncachedRefs, NOTIFICATION_STATE_BATCH_SIZE).map(async batch => {
      const query = [
        "query NotificationSubjectStates {",
        ...batch.map((ref, index) => {
          return `  item${index}: repository(owner: ${JSON.stringify(ref.owner)}, name: ${JSON.stringify(ref.repository)}) { subject: issueOrPullRequest(number: ${String(ref.number)}) { __typename ... on Issue { state } ... on PullRequest { state merged } } }`
        }),
        "}"
      ].join("\n")

      try {
        const response = await client.request("POST /graphql", { query })
        const payload = response.data as {
          data?: Record<string, { subject?: { state?: unknown; merged?: unknown; merged_at?: unknown } | null }>
        }

        batch.forEach((ref, index) => {
          const subject = payload.data?.[`item${index}`]?.subject
          const state = subject ? getNotificationSubjectStateFromApiData(ref.subjectType, subject) : null
          setCached(notificationSubjectStateCache, ref.cacheKey, state, NOTIFICATION_CACHE_TTL_MS)
        })
      } catch {
        batch.forEach(ref => {
          setCached(notificationSubjectStateCache, ref.cacheKey, null, NOTIFICATION_CACHE_TTL_MS)
        })
      }
    })
  )
}

export function getIssueStateLabel(issue: GitHubIssue): string {
  if (issue.state === "closed" && issue.state_reason === "not_planned") {
    return "Closed as not planned"
  }

  if (issue.state === "closed" && issue.state_reason === "completed") {
    return "Closed as completed"
  }

  if (issue.state === "closed") {
    return "Closed"
  }

  return "Open"
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
  issueSearchCache.clear()
}

export function invalidateNotificationCaches(): void {
  notificationCache.clear()
  notificationSubjectStateCache.clear()
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
