import { buildNotificationUrl, getNotificationSubjectStateFromApiData, getNotificationSubtitle, NotificationLike } from "../github-format"
import { parsePluginQuery } from "../query"
import { parseRepositoryList } from "../settings"

describe("parsePluginQuery", () => {
  test("parses command mode from explicit command", () => {
    expect(parsePluginQuery("issues", "bug")).toEqual({
      mode: "issues",
      search: "bug",
      unreadOnly: false
    })
  })

  test("parses notifications unread shortcut from search text", () => {
    expect(parsePluginQuery(undefined, "notifications unread triage")).toEqual({
      mode: "notifications",
      search: "triage",
      unreadOnly: true
    })
  })
})

describe("parseRepositoryList", () => {
  test("parses comma and newline separated repositories", () => {
    expect(parseRepositoryList("Foo/Bar,\nfoo/bar\nbaz/qux")).toEqual(["foo/bar", "baz/qux"])
  })
})

describe("notification helpers", () => {
  const notification = {
    id: "42",
    unread: true,
    reason: "mention",
    updated_at: "2026-03-08T08:00:00Z",
    subject: {
      title: "Investigate flaky test",
      type: "Issue",
      url: "https://api.github.com/repos/octo/repo/issues/123",
      latest_comment_url: "https://api.github.com/repos/octo/repo/issues/comments/456"
    },
    repository: {
      full_name: "octo/repo",
      html_url: "https://github.com/octo/repo"
    }
  } as NotificationLike

  test("builds browser notification url with latest comment anchor", () => {
    expect(buildNotificationUrl(notification)).toBe("https://github.com/octo/repo/issues/123#issuecomment-456")
  })

  test("builds subtitle with issue number, repo and reason", () => {
    expect(getNotificationSubtitle(notification)).toBe("#123 • octo/repo • Mentioned")
  })

  test("parses closed issue notification state from subject response", () => {
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "closed" })).toBe("closed")
  })

  test("parses merged pull request notification state from subject response", () => {
    expect(getNotificationSubjectStateFromApiData("PullRequest", { state: "closed", merged_at: "2026-03-08T09:00:00Z" })).toBe("merged")
  })

  test("parses graphql style states from batched notification subject response", () => {
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "CLOSED" })).toBe("closed")
    expect(getNotificationSubjectStateFromApiData("PullRequest", { state: "CLOSED", merged: true })).toBe("merged")
  })
})
