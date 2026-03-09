import { RestEndpointMethodTypes } from "@octokit/rest"

export type GitHubIssue = RestEndpointMethodTypes["search"]["issuesAndPullRequests"]["response"]["data"]["items"][number]

export type GitHubNotification = RestEndpointMethodTypes["activity"]["listNotificationsForAuthenticatedUser"]["response"]["data"][number]

export type GitHubViewer = RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]["data"]

export type RepositoryFilterMode = "all" | "include" | "exclude"

export type IssueSort = "updated-desc" | "updated-asc" | "created-desc" | "created-asc" | "comments-desc" | "comments-asc"

export type QueryMode = "home" | "issues" | "notifications"

export interface PluginSettings {
  personalAccessToken: string
  numberOfResults: number
  issueSort: IssueSort
  showCreated: boolean
  showAssigned: boolean
  showMentioned: boolean
  showRecentlyClosed: boolean
  repositoryFilterMode: RepositoryFilterMode
  repositoryList: string[]
}

export interface IssueSection {
  group: string
  groupScore: number
  issues: GitHubIssue[]
}

export interface MyIssuesResult {
  sections: IssueSection[]
  viewerLogin: string
}

export interface ParsedPluginQuery {
  mode: QueryMode
  search: string
  unreadOnly: boolean
}
