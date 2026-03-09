import { ParsedPluginQuery, QueryMode } from "./types"

const COMMAND_ALIASES: Record<string, QueryMode> = {
  issue: "issues",
  issues: "issues",
  notification: "notifications",
  notifications: "notifications"
}

function normalizeSearch(input: string): string {
  return input.trim().replace(/\s+/g, " ")
}

export function parsePluginQuery(command: string | undefined, search: string): ParsedPluginQuery {
  const normalizedCommand = (command || "").trim().toLowerCase()
  const normalizedSearch = normalizeSearch(search)

  if (normalizedCommand === "issues") {
    return { mode: "issues", search: normalizedSearch, unreadOnly: false }
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
    const firstToken = (firstSpace === -1 ? normalizedSearch : normalizedSearch.slice(0, firstSpace)).toLowerCase()
    const rest = firstSpace === -1 ? "" : normalizeSearch(normalizedSearch.slice(firstSpace + 1))
    const mode = COMMAND_ALIASES[firstToken]

    if (mode === "notifications") {
      if (rest.toLowerCase().startsWith("unread ")) {
        return { mode, search: normalizeSearch(rest.slice(7)), unreadOnly: true }
      }

      if (rest.toLowerCase() === "unread") {
        return { mode, search: "", unreadOnly: true }
      }

      return { mode, search: rest, unreadOnly: false }
    }

    if (mode) {
      return { mode, search: rest, unreadOnly: false }
    }
  }

  return { mode: "home", search: normalizedSearch, unreadOnly: false }
}
