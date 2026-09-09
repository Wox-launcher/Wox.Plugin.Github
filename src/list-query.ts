import { GitHubUserList } from "./types"

export function findUserList(lists: GitHubUserList[], name: string): GitHubUserList | undefined {
  const lower = name.trim().toLowerCase()
  if (!lower) {
    return undefined
  }

  return lists.find(list => list.name.toLowerCase() === lower)
}

export function matchesUserListSearch(list: GitHubUserList, searchText: string): boolean {
  if (!searchText) {
    return true
  }

  const lower = searchText.toLowerCase()
  return list.name.toLowerCase().includes(lower) || (list.description || "").toLowerCase().includes(lower) || list.slug.toLowerCase().includes(lower)
}

export function userListUrl(viewerLogin: string, list: GitHubUserList): string {
  return `https://github.com/stars/${viewerLogin}/lists/${list.slug}`
}

export function resolveUserListQuery(lists: GitHubUserList[], search: string, listName?: string): { list?: GitHubUserList; repoSearch: string; listSearch: string } {
  if (listName) {
    const list = findUserList(lists, listName)
    const repoSearch = search.trim().toLowerCase() === listName.trim().toLowerCase() ? "" : search
    return { list, repoSearch, listSearch: list ? "" : listName }
  }

  const exact = findUserList(lists, search)
  if (exact) {
    return { list: exact, repoSearch: "", listSearch: "" }
  }

  const firstSpace = search.indexOf(" ")
  if (firstSpace !== -1) {
    const head = search.slice(0, firstSpace)
    const rest = search.slice(firstSpace + 1)
    const list = findUserList(lists, head)
    if (list) {
      return { list, repoSearch: rest, listSearch: "" }
    }
  }

  return { listSearch: search, repoSearch: "" }
}
