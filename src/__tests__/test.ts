import {
  buildNotificationUrl,
  escapeHtml,
  formatCompactIssueDate,
  formatGitHubIssueHtml,
  getIssueHtmlBadge,
  getNotificationSubjectStateFromApiData,
  getNotificationSubtitle,
  getSizedAvatarUrl,
  NotificationLike,
  toIssueBodyHtml
} from "../github-format"
import { applyHtmlTemplate } from "../html-template"
import { buildIssueDetailQuery, buildListDetailQuery, parseIssueRef, parseIssueRefFromHint, parsePluginQuery } from "../query"
import { resolveUserListQuery } from "../list-query"
import { parseRepositoryList } from "../settings"

describe("parsePluginQuery", () => {
  test("parses command mode from explicit command", () => {
    expect(parsePluginQuery("issues", "bug")).toEqual({
      mode: "issues",
      search: "bug",
      unreadOnly: false
    })
  })

  test("parses issue detail refs from issues search", () => {
    expect(parseIssueRef("myraxion/wox.plugin.linkding#6")).toEqual({
      owner: "myraxion",
      repo: "wox.plugin.linkding",
      number: 6
    })
    expect(parsePluginQuery("issues", "myraxion/wox.plugin.linkding#6")).toEqual({
      mode: "issues",
      search: "myraxion/wox.plugin.linkding#6",
      unreadOnly: false,
      issueRef: {
        owner: "myraxion",
        repo: "wox.plugin.linkding",
        number: 6
      }
    })
  })

  test("reads issue detail refs from a query hint block", () => {
    const query = buildIssueDetailQuery("gh", "myraxion/wox.plugin.linkding", 6)
    expect(query.QueryText).toBe("gh issues myraxion/wox.plugin.linkding#6")
    expect(query.QueryHint.Elements).toEqual([
      { Id: "command", Kind: "text", Text: "gh issues " },
      { Id: "issue", Kind: "block", Value: "myraxion/wox.plugin.linkding#6" }
    ])
    expect(parseIssueRefFromHint(query.QueryHint)).toEqual({
      owner: "myraxion",
      repo: "wox.plugin.linkding",
      number: 6
    })
    expect(parsePluginQuery("issues", "", query.QueryHint)).toEqual({
      mode: "issues",
      search: "",
      unreadOnly: false,
      issueRef: {
        owner: "myraxion",
        repo: "wox.plugin.linkding",
        number: 6
      }
    })
  })

  test("treats removed search command as plain home search text", () => {
    expect(parsePluginQuery(undefined, "search bug")).toEqual({
      mode: "home",
      search: "search bug",
      unreadOnly: false
    })
  })

  test("parses starred command from explicit command and search alias", () => {
    expect(parsePluginQuery("starred", "wox")).toEqual({
      mode: "starred",
      search: "wox",
      unreadOnly: false
    })
    expect(parsePluginQuery(undefined, "starred wox")).toEqual({
      mode: "starred",
      search: "wox",
      unreadOnly: false
    })
  })

  test("parses lists command from explicit command and search alias", () => {
    expect(parsePluginQuery("lists", "AI")).toEqual({
      mode: "lists",
      search: "AI",
      unreadOnly: false
    })
    expect(parsePluginQuery(undefined, "lists Launcher")).toEqual({
      mode: "lists",
      search: "Launcher",
      unreadOnly: false
    })
  })

  test("reads list name from a query hint block", () => {
    const query = buildListDetailQuery("gh", "桌面技术栈")
    expect(query.QueryText).toBe("gh lists 桌面技术栈")
    expect(parsePluginQuery("lists", "桌面技术栈", query.QueryHint)).toEqual({
      mode: "lists",
      search: "桌面技术栈",
      unreadOnly: false,
      listName: "桌面技术栈"
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

describe("resolveUserListQuery", () => {
  const lists = [
    { id: "1", name: "AI", description: null, slug: "ai", isPrivate: false, itemsCount: 23 },
    { id: "2", name: "Launcher", description: null, slug: "launcher", isPrivate: false, itemsCount: 21 }
  ]

  test("opens a list on exact name match and treats extra text as repo search", () => {
    expect(resolveUserListQuery(lists, "AI flutter")).toEqual({
      list: lists[0],
      repoSearch: "flutter",
      listSearch: ""
    })
  })

  test("filters lists when the name is not an exact match", () => {
    expect(resolveUserListQuery(lists, "laun")).toEqual({
      listSearch: "laun",
      repoSearch: ""
    })
  })
})

describe("formatCompactIssueDate", () => {
  const now = Date.parse("2026-09-06T12:00:00.000Z")

  test("uses compact relative time for the last day", () => {
    expect(formatCompactIssueDate("2026-09-06T11:59:30.000Z", now)).toBe("now")
    expect(formatCompactIssueDate("2026-09-06T11:50:00.000Z", now)).toBe("10m")
    expect(formatCompactIssueDate("2026-09-06T09:00:00.000Z", now)).toBe("3h")
    expect(formatCompactIssueDate("2026-09-05T12:00:00.000Z", now)).toBe("1d")
  })

  test("uses month and day after the first day", () => {
    expect(formatCompactIssueDate("2026-09-04T12:00:00.000Z", now)).toBe("Sep 4")
    expect(formatCompactIssueDate("2026-08-13T12:00:00.000Z", now)).toBe("Aug 13")
  })

  test("includes the year for older issues", () => {
    expect(formatCompactIssueDate("2025-09-04T12:00:00.000Z", now)).toBe("Sep 4, 2025")
  })
})

describe("issue html preview", () => {
  test("replaces template variables without interpreting dollar signs", () => {
    expect(applyHtmlTemplate("<p>{{title}} {{price}}</p>", { title: "Cost", price: "$5" })).toBe("<p>Cost $5</p>")
  })

  test("escapes untrusted title text", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
  })

  test("keeps html images and converts markdown images", () => {
    expect(toIssueBodyHtml('<img alt="Image" src="https://github.com/user-attachments/assets/abc">', "empty")).toContain('<img alt="Image" src="https://github.com/user-attachments/assets/abc">')
    expect(toIssueBodyHtml("hello\n\n![Image](https://github.com/user-attachments/assets/abc)", "empty")).toContain('<img alt="Image" src="https://github.com/user-attachments/assets/abc">')
    expect(toIssueBodyHtml('Wox支持selection query\n\n<img alt="Image" src="https://github.com/user-attachments/assets/abc">', "empty")).toContain("<p>Wox支持selection query</p>")
  })

  test("maps closed not planned issues to the gray badge", () => {
    expect(getIssueHtmlBadge({ state: "closed", state_reason: "not_planned" })).toBe("not_planned")
    expect(getIssueHtmlBadge({ state: "open" })).toBe("open")
  })

  test("renders a github-style issue document", () => {
    const html = formatGitHubIssueHtml({
      title: "feat: 支持 Selection Query 查询",
      number: 6,
      body: '<img alt="Image" src="https://github.com/user-attachments/assets/abc">',
      repository: "myraxion/wox.plugin.linkding",
      stateText: "Open",
      badge: "open",
      author: "qianlifeng",
      openedText: "opened 13h",
      emptyBody: "No description provided.",
      labels: [{ name: "enhancement", color: "a2eeef" }],
      comments: [
        {
          author: "reviewer",
          createdText: "commented 1h",
          body: "looks good"
        }
      ]
    })

    expect(html).toContain('class="gh-title"')
    expect(html).toContain("#6")
    expect(html).toContain('class="gh-badge open"')
    expect(html).toContain("qianlifeng")
    expect(html).toContain("opened 13h")
    expect(html).toContain("enhancement")
    expect(html).toContain('<img alt="Image" src="https://github.com/user-attachments/assets/abc">')
    expect(html).toContain("reviewer")
    expect(html).toContain("commented 1h")
    expect(html).toContain("looks good")
    expect(html).not.toContain("<script>")
  })
})

describe("getSizedAvatarUrl", () => {
  test("appends avatar size to github urls", () => {
    expect(getSizedAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe("https://avatars.githubusercontent.com/u/1?v=4&s=40")
    expect(getSizedAvatarUrl("https://avatars.githubusercontent.com/u/1")).toBe("https://avatars.githubusercontent.com/u/1?s=40")
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
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "closed", state_reason: "completed" })).toBe("closed")
  })

  test("parses not planned and duplicate issue states from subject response", () => {
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "closed", state_reason: "not_planned" })).toBe("not_planned")
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "CLOSED", state_reason: "NOT_PLANNED" })).toBe("not_planned")
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "closed", state_reason: "duplicate" })).toBe("not_planned")
  })

  test("parses merged pull request notification state from subject response", () => {
    expect(getNotificationSubjectStateFromApiData("PullRequest", { state: "closed", merged_at: "2026-03-08T09:00:00Z" })).toBe("merged")
  })

  test("parses graphql style states from batched notification subject response", () => {
    expect(getNotificationSubjectStateFromApiData("Issue", { state: "CLOSED" })).toBe("closed")
    expect(getNotificationSubjectStateFromApiData("PullRequest", { state: "CLOSED", merged: true })).toBe("merged")
  })
})
