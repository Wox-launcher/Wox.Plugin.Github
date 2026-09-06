import { QueryHint } from "@wox-launcher/wox-plugin"

import { IssueRef, ParsedPluginQuery, QueryMode } from "./types"

export const ISSUE_HINT_ID = "issue"

const COMMAND_ALIASES: Record<string, QueryMode> = {
  issue: "issues",
  issues: "issues",
  notification: "notifications",
  notifications: "notifications",
  star: "starred",
  stars: "starred",
  starred: "starred"
}

const ISSUE_REF_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/

function normalizeSearch(input: string): string {
  return input.trim().replace(/\s+/g, " ")
}

export function buildIssueDetailQuery(triggerKeyword: string, repository: string, issueNumber: number): { QueryText: string; QueryHint: QueryHint } {
  const trigger = triggerKeyword.trim() || "gh"
  const issueRef = `${repository}#${issueNumber}`
  const commandPrefix = `${trigger} issues `
  return {
    QueryText: `${commandPrefix}${issueRef}`,
    QueryHint: {
      Elements: [
        { Id: "command", Kind: "text", Text: commandPrefix },
        { Id: ISSUE_HINT_ID, Kind: "block", Value: issueRef }
      ]
    }
  }
}

export function parseIssueRefFromHint(hint?: QueryHint): IssueRef | undefined {
  const issue = hint?.Elements.find(element => element.Id === ISSUE_HINT_ID && element.Kind === "block")
  if (!issue || issue.Kind !== "block") {
    return undefined
  }

  return parseIssueRef(issue.Value)
}

export function parseIssueRef(input: string): IssueRef | undefined {
  const match = ISSUE_REF_PATTERN.exec(input.trim())
  if (!match) {
    return undefined
  }

  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10)
  }
}

function withIssueRef(parsed: ParsedPluginQuery, hint?: QueryHint): ParsedPluginQuery {
  if (parsed.mode !== "issues") {
    return parsed
  }

  const issueRef = parseIssueRefFromHint(hint) || parseIssueRef(parsed.search)
  return issueRef ? { ...parsed, issueRef } : parsed
}

export function parsePluginQuery(command: string | undefined, search: string, hint?: QueryHint): ParsedPluginQuery {
  const normalizedCommand = (command || "").trim().toLowerCase()
  const normalizedSearch = normalizeSearch(search)

  if (normalizedCommand === "issues") {
    return withIssueRef({ mode: "issues", search: normalizedSearch, unreadOnly: false }, hint)
  }

  if (normalizedCommand === "starred") {
    return { mode: "starred", search: normalizedSearch, unreadOnly: false }
  }

  if (normalizedCommand === "notifications") {
    if (normalizedSearch.toLowerCase().startsWith("unread ")) {
      return { mode: "notifications", search: normalizeSearch(normalizedSearch.slice(7)), unreadOnly: true }
    }

    if (normalizedSearch.toLowerCase() === "unread") {
      return { mode: "notifications", search: "", unreadOnly: true }
    }

    return { mode: "notifications", search: normalizedSearch, unreadOnly: false }
  }

  if (normalizedSearch.length > 0) {
    const firstSpace = normalizedSearch.indexOf(" ")
    // Only enter command mode when the user has typed a space after the token
    // (trailing space is lost by normalizeSearch's trim, so check raw search)
    const hasSpaceAfterToken = search.trimStart().includes(" ")
    const firstToken = (firstSpace === -1 ? normalizedSearch : normalizedSearch.slice(0, firstSpace)).toLowerCase()
    const rest = firstSpace === -1 ? "" : normalizeSearch(normalizedSearch.slice(firstSpace + 1))
    const mode = COMMAND_ALIASES[firstToken]

    if (mode && (firstSpace !== -1 || hasSpaceAfterToken)) {
      if (rest.toLowerCase().startsWith("unread ")) {
        return { mode, search: normalizeSearch(rest.slice(7)), unreadOnly: true }
      }

      if (rest.toLowerCase() === "unread") {
        return { mode, search: "", unreadOnly: true }
      }

      return withIssueRef({ mode, search: rest, unreadOnly: false }, hint)
    }
  }

  return { mode: "home", search: normalizedSearch, unreadOnly: false }
}
