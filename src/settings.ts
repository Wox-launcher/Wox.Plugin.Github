import { Context, PublicAPI } from "@wox-launcher/wox-plugin"

import { IssueSort, PluginSettings, RepositoryFilterMode } from "./types"

export const DEFAULT_NUMBER_OF_RESULTS = 20
export const DEFAULT_SEARCH_TERMS = "author:@me"
export const DEFAULT_ISSUE_SORT: IssueSort = "updated-desc"

export const ISSUE_SORT_OPTIONS: Array<{ label: string; value: IssueSort }> = [
  { label: "Recently Updated", value: "updated-desc" },
  { label: "Least Recently Updated", value: "updated-asc" },
  { label: "Newest", value: "created-desc" },
  { label: "Oldest", value: "created-asc" },
  { label: "Most Commented", value: "comments-desc" },
  { label: "Least Commented", value: "comments-asc" }
]

function parseBoolean(input: string | undefined, defaultValue: boolean): boolean {
  if (input === undefined || input === "") {
    return defaultValue
  }

  return input === "true"
}

function parseNumber(input: string | undefined, defaultValue: number): number {
  if (!input) {
    return defaultValue
  }

  const parsed = parseInt(input, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue
  }

  return parsed
}

function parseRepositoryFilterMode(input: string | undefined): RepositoryFilterMode {
  if (input === "include" || input === "exclude") {
    return input
  }

  return "all"
}

function parseIssueSort(input: string | undefined): IssueSort {
  if (ISSUE_SORT_OPTIONS.some(option => option.value === input)) {
    return input as IssueSort
  }

  return DEFAULT_ISSUE_SORT
}

export function parseRepositoryList(input: string | undefined): string[] {
  if (!input) {
    return []
  }

  const unique = new Set<string>()
  input
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(item => item.length > 0)
    .forEach(item => unique.add(item.toLowerCase()))

  return Array.from(unique)
}

export async function getSettings(ctx: Context, api: PublicAPI): Promise<PluginSettings> {
  const [personalAccessToken, defaultSearchTerms, numberOfResults, issueSort, showCreated, showAssigned, showMentioned, showRecentlyClosed, repositoryFilterMode, repositoryList] = await Promise.all([
    api.GetSetting(ctx, "personalAccessToken"),
    api.GetSetting(ctx, "defaultSearchTerms"),
    api.GetSetting(ctx, "numberOfResults"),
    api.GetSetting(ctx, "issueSort"),
    api.GetSetting(ctx, "showCreated"),
    api.GetSetting(ctx, "showAssigned"),
    api.GetSetting(ctx, "showMentioned"),
    api.GetSetting(ctx, "showRecentlyClosed"),
    api.GetSetting(ctx, "repositoryFilterMode"),
    api.GetSetting(ctx, "repositoryList")
  ])

  return {
    personalAccessToken: (personalAccessToken || "").trim(),
    defaultSearchTerms: (defaultSearchTerms || DEFAULT_SEARCH_TERMS).trim(),
    numberOfResults: parseNumber(numberOfResults, DEFAULT_NUMBER_OF_RESULTS),
    issueSort: parseIssueSort(issueSort),
    showCreated: parseBoolean(showCreated, true),
    showAssigned: parseBoolean(showAssigned, true),
    showMentioned: parseBoolean(showMentioned, true),
    showRecentlyClosed: parseBoolean(showRecentlyClosed, false),
    repositoryFilterMode: parseRepositoryFilterMode(repositoryFilterMode),
    repositoryList: parseRepositoryList(repositoryList)
  }
}
