import { Context, PublicAPI } from "@wox-launcher/wox-plugin"
import { Octokit } from "@octokit/rest"

import { getNotificationReasonLabel, getNotificationSubjectStateFromApiData, getNotificationTypeTitle } from "./github-format"
import { GitHubIssue, GitHubIssueComment, GitHubNotification, GitHubRepository, GitHubViewer, IssueSection, IssueSort, MyIssuesResult, PluginSettings, StarredSort } from "./types"

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const DAY_IN_MS = 24 * 60 * 60 * 1000
const MAX_OPEN_ISSUE_AGE_DAYS = 365
const VIEWER_CACHE_TTL_MS = 10 * 60 * 1000
const ISSUE_CACHE_TTL_MS = 45 * 1000
const NOTIFICATION_CACHE_TTL_MS = 20 * 1000
const STARRED_CACHE_TTL_MS = 30 * 60 * 1000
const STARRED_STALE_MAX_AGE_MS = 7 * DAY_IN_MS
const STARRED_PER_PAGE = 100
const STARRED_MAX_PAGES = 2

const clientCache = new Map<string, Octokit>()
const viewerCache = new Map<string, CacheEntry<GitHubViewer>>()
const issuesCache = new Map<string, CacheEntry<MyIssuesResult>>()
const notificationCache = new Map<string, CacheEntry<GitHubNotification[]>>()
const starredCache = new Map<string, CacheEntry<GitHubRepository[]>>()
const subjectStateCache = new Map<string, CacheEntry<string>>()

// ---------------------------------------------------------------------------
// Subject state persistence via Wox SDK SaveSetting/GetSetting
// ---------------------------------------------------------------------------

const STATE_SETTING_KEY = "_subjectStateCacheV2"
const STARRED_SETTING_KEY = "_starredReposCache"

let _bgCtx: Context | null = null
let _api: PublicAPI | null = null

type PersistedStateEntry = { state: string; expiresAt: number }

type PersistedStarredCache = {
  key: string
  fetchedAt: number
  expiresAt: number
  repos: GitHubRepository[]
}

const starredRefreshInFlight = new Map<string, Promise<GitHubRepository[]>>()

export async function initGithub(ctx: Context, api: PublicAPI): Promise<void> {
  _bgCtx = ctx
  _api = api
  try {
    const raw = await api.GetSetting(ctx, STATE_SETTING_KEY)
    if (raw) {
      const data = JSON.parse(raw) as Record<string, PersistedStateEntry>
      const now = Date.now()
      for (const [url, entry] of Object.entries(data)) {
        if (entry.expiresAt > now) {
          subjectStateCache.set(url, { value: entry.state, expiresAt: entry.expiresAt })
        }
      }
    }
  } catch {
    // malformed or missing – start with empty cache
  }

  await loadStarredCacheFromSettings()
}

function saveStateCacheToSettings(): void {
  if (!_api || !_bgCtx) return
  const data: Record<string, PersistedStateEntry> = {}
  for (const [url, entry] of Array.from(subjectStateCache.entries())) {
    data[url] = { state: entry.value, expiresAt: entry.expiresAt }
  }
  void _api.SaveSetting(_bgCtx, STATE_SETTING_KEY, JSON.stringify(data), false)
}

function toCachedStarredRepo(repo: GitHubRepository): GitHubRepository {
  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    html_url: repo.html_url,
    starred_at: repo.starred_at,
    owner: repo.owner
      ? {
          login: repo.owner.login,
          avatar_url: repo.owner.avatar_url
        }
      : null
  } as GitHubRepository
}

async function loadStarredCacheFromSettings(): Promise<void> {
  if (!_api || !_bgCtx) return
  try {
    const raw = await _api.GetSetting(_bgCtx, STARRED_SETTING_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as PersistedStarredCache
    if (!data?.key || !Array.isArray(data.repos)) return
    if (Date.now() - data.fetchedAt > STARRED_STALE_MAX_AGE_MS) return
    starredCache.set(data.key, { value: data.repos, expiresAt: data.expiresAt })
  } catch {
    // malformed or missing
  }
}

function saveStarredCacheToSettings(key: string, repos: GitHubRepository[], expiresAt: number): void {
  if (!_api || !_bgCtx) return
  const payload: PersistedStarredCache = {
    key,
    fetchedAt: Date.now(),
    expiresAt,
    repos
  }
  void _api.SaveSetting(_bgCtx, STARRED_SETTING_KEY, JSON.stringify(payload), false)
}

function getStarredCacheEntry(key: string): { repos: GitHubRepository[]; fresh: boolean } | null {
  const entry = starredCache.get(key)
  if (!entry) {
    return null
  }

  return {
    repos: entry.value,
    fresh: entry.expiresAt >= Date.now()
  }
}

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

  const isTerminal = state === "closed" || state === "not_planned" || state === "merged"
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

function isIssueCreatedWithinDays(issue: Pick<GitHubIssue, "created_at">, days: number, now = Date.now()): boolean {
  const createdAt = new Date(issue.created_at).getTime()
  if (Number.isNaN(createdAt)) {
    return false
  }

  return now - createdAt <= days * DAY_IN_MS
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

export function compareIssues(left: GitHubIssue, right: GitHubIssue, issueSort: IssueSort): number {
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
    numberOfResults: settings.numberOfResults,
    createdSince: formatDate(MAX_OPEN_ISSUE_AGE_DAYS)
  })
  const cached = getCached(issuesCache, cacheKey)
  if (cached) {
    return cached
  }

  const viewer = await getViewer(settings)
  const createdSince = `created:>=${formatDate(MAX_OPEN_ISSUE_AGE_DAYS)}`
  const definitions: Array<{ enabled: boolean; group: string; groupScore: number; query: string; recentlyClosed?: boolean }> = [
    {
      enabled: settings.showCreated,
      group: "Created",
      groupScore: 400,
      query: `is:issue author:${viewer.login} archived:false is:open ${createdSince}`
    },
    {
      enabled: settings.showAssigned,
      group: "Assigned",
      groupScore: 300,
      query: `is:issue assignee:${viewer.login} archived:false is:open ${createdSince}`
    },
    {
      enabled: settings.showMentioned,
      group: "Mentioned",
      groupScore: 200,
      query: `is:issue mentions:${viewer.login} archived:false is:open ${createdSince}`
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
        issues: (await runIssueSearch(settings, definition.query)).filter(issue => definition.recentlyClosed === true || isIssueCreatedWithinDays(issue, MAX_OPEN_ISSUE_AGE_DAYS))
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

export async function getIssueByRef(settings: PluginSettings, owner: string, repo: string, issueNumber: number): Promise<GitHubIssue> {
  const client = getClient(settings.personalAccessToken)

  try {
    const response = await client.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    })
    if (response.data.body) {
      return response.data as GitHubIssue
    }
  } catch {
    // fall through to cache
  }

  const cached = await getMyIssues(settings)
  const fullName = `${owner}/${repo}`.toLowerCase()
  for (const section of cached.sections) {
    const found = section.issues.find(issue => getIssueRepositoryFullName(issue) === fullName && issue.number === issueNumber)
    if (found?.body) {
      return found
    }
  }

  const response = await client.issues.get({
    owner,
    repo,
    issue_number: issueNumber
  })
  return response.data as GitHubIssue
}

const ISSUE_COMMENT_PAGE_SIZE = 50

export async function listIssueComments(settings: PluginSettings, owner: string, repo: string, issueNumber: number): Promise<GitHubIssueComment[]> {
  try {
    const client = getClient(settings.personalAccessToken)
    const response = await client.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: ISSUE_COMMENT_PAGE_SIZE
    })
    return response.data
  } catch {
    return []
  }
}

async function fetchSubjectState(url: string, subjectType: string, token: string, updatedAt: string): Promise<void> {
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
    const data = (await response.json()) as { state?: string; merged?: boolean; merged_at?: string; state_reason?: string }
    const state = getNotificationSubjectStateFromApiData(subjectType, data)
    if (state) {
      setCached(subjectStateCache, url, state, subjectStateTtl(updatedAt, state))
      saveStateCacheToSettings()
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
  void Promise.allSettled(subjectItems.map(n => fetchSubjectState(n.subject.url, n.subject.type, settings.personalAccessToken, n.updated_at)))

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

function normalizeStarredRepo(item: unknown): GitHubRepository {
  if (!item || typeof item !== "object") {
    throw new Error("Invalid starred repository payload")
  }

  const payload = item as { starred_at?: string; repo?: GitHubRepository }
  if (payload.repo) {
    return { ...payload.repo, starred_at: payload.starred_at }
  }

  return item as GitHubRepository
}

async function refreshStarredRepos(settings: PluginSettings, cacheKey: string): Promise<GitHubRepository[]> {
  const inFlight = starredRefreshInFlight.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const request = (async () => {
    const client = getClient(settings.personalAccessToken)
    const repos: GitHubRepository[] = []

    for (let page = 1; page <= STARRED_MAX_PAGES; page++) {
      const response = await client.activity.listReposStarredByAuthenticatedUser({
        sort: "created",
        direction: "desc",
        per_page: STARRED_PER_PAGE,
        page,
        headers: {
          accept: "application/vnd.github.star+json"
        }
      })
      repos.push(...response.data.map(item => toCachedStarredRepo(normalizeStarredRepo(item))))
      if (response.data.length < STARRED_PER_PAGE) {
        break
      }
    }

    const cached = setCached(starredCache, cacheKey, repos, STARRED_CACHE_TTL_MS)
    saveStarredCacheToSettings(cacheKey, cached, Date.now() + STARRED_CACHE_TTL_MS)
    return cached
  })().finally(() => {
    starredRefreshInFlight.delete(cacheKey)
  })

  starredRefreshInFlight.set(cacheKey, request)
  return request
}

export async function listStarredRepos(settings: PluginSettings): Promise<GitHubRepository[]> {
  const cacheKey = JSON.stringify({
    token: settings.personalAccessToken
  })
  const cached = getStarredCacheEntry(cacheKey)
  if (cached?.fresh) {
    return cached.repos
  }

  if (cached) {
    void refreshStarredRepos(settings, cacheKey)
    return cached.repos
  }

  return refreshStarredRepos(settings, cacheKey)
}

export function compareStarredRepos(left: GitHubRepository, right: GitHubRepository, sort: StarredSort): number {
  switch (sort) {
    case "stars-desc":
      return right.stargazers_count - left.stargazers_count
    case "starred-desc":
    default:
      return new Date(right.starred_at || 0).getTime() - new Date(left.starred_at || 0).getTime()
  }
}

export function matchesRepositorySearch(repository: GitHubRepository, searchText: string): boolean {
  if (!searchText) {
    return true
  }

  const lower = searchText.toLowerCase()
  return (
    repository.full_name.toLowerCase().includes(lower) ||
    repository.name.toLowerCase().includes(lower) ||
    (repository.description || "").toLowerCase().includes(lower) ||
    (repository.language || "").toLowerCase().includes(lower) ||
    (repository.owner?.login || "").toLowerCase().includes(lower)
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

export function invalidateStarredCaches(): void {
  starredCache.clear()
  starredRefreshInFlight.clear()
  if (_api && _bgCtx) {
    void _api.SaveSetting(_bgCtx, STARRED_SETTING_KEY, "", false)
  }
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
