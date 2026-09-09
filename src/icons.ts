import { WoxImage } from "@wox-launcher/wox-plugin"

function createSvgIcon(path: string, color = "currentColor"): WoxImage {
  return {
    ImageType: "svg",
    ImageData: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="${color}" d="${path}"/></svg>`
  } as WoxImage
}

const IconIssue = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"/><path fill="#currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 0 0-13 0"/></svg>'
} as WoxImage

const IconIssueOpen = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#39BC6E" d="M8 9.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"/><path fill="#39BC6E" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 0 0-13 0"/></svg>'
} as WoxImage

const IconIssueClosed = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#8759E1" d="M11.28 6.78a.75.75 0 0 0-1.06-1.06L7.25 8.69L5.78 7.22a.75.75 0 0 0-1.06 1.06l2 2a.75.75 0 0 0 1.06 0z"/><path fill="#8759E1" d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-1.5 0a6.5 6.5 0 1 0-13 0a6.5 6.5 0 0 0 13 0"/></svg>'
} as WoxImage

const IconIssueNotPlanned = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#8B949E" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0M1.5 8a6.5 6.5 0 1 0 13 0a6.5 6.5 0 0 0-13 0m9.78-2.22l-7.5 7.5a.749.749 0 0 1-1.275-.326a.749.749 0 0 1 .215-.734l7.5-7.5a.749.749 0 0 1 1.275.326a.749.749 0 0 1-.215.734Z"/></svg>'
} as WoxImage

const IconNotificationInbox = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="currentColor" d="M2.8 2.06A1.75 1.75 0 0 1 4.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25v-4.5q0-.154.06-.295Zm1.61.44a.25.25 0 0 0-.23.152L1.887 8H4.75a.75.75 0 0 1 .6.3L6.625 10h2.75l1.275-1.7a.75.75 0 0 1 .6-.3h2.863L11.82 2.652a.25.25 0 0 0-.23-.152Zm10.09 7h-2.875l-1.275 1.7a.75.75 0 0 1-.6.3h-3.5a.75.75 0 0 1-.6-.3L4.375 9.5H1.5v3.75c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25Z"/></svg>'
} as WoxImage

const IconNotificationInboxColored = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#2563EB" d="M2.8 2.06A1.75 1.75 0 0 1 4.41 1h7.18c.7 0 1.333.417 1.61 1.06l2.74 6.395c.04.093.06.194.06.295v4.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25v-4.5q0-.154.06-.295Zm1.61.44a.25.25 0 0 0-.23.152L1.887 8H4.75a.75.75 0 0 1 .6.3L6.625 10h2.75l1.275-1.7a.75.75 0 0 1 .6-.3h2.863L11.82 2.652a.25.25 0 0 0-.23-.152Zm10.09 7h-2.875l-1.275 1.7a.75.75 0 0 1-.6.3h-3.5a.75.75 0 0 1-.6-.3L4.375 9.5H1.5v3.75c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25Z"/></svg>'
} as WoxImage

const IconRepositoryTag = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="currentColor" d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.75 1.75 0 0 1 1 7.775m1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2a1 1 0 0 1 0-2"/></svg>'
} as WoxImage

const IconPullRequestOpen = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#39BC6E" d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.73 5.73 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218M4.25 13.5a.75.75 0 1 0 0-1.5a.75.75 0 0 0 0 1.5m8.5-4.5a.75.75 0 1 0 0-1.5a.75.75 0 0 0 0 1.5M5 3.25a.75.75 0 1 0 0 .005z"/></svg>'
} as WoxImage

const IconPullRequestMerged = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#8759E1" d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>'
} as WoxImage

const IconPullRequestClosed = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#EF4444" d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>'
} as WoxImage

const IconActionOpenExternal = createSvgIcon(
  "M9.603 1H14.5v4.897h-1.5V3.56L7.78 8.78L6.72 7.72L11.94 2.5H9.603zM3.75 2h4.5v1.5h-4.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-4.5H14v4.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5A1.75 1.75 0 0 1 3.75 2",
  "#2563EB"
)
const IconActionCopy = createSvgIcon(
  "M2.75 2A1.75 1.75 0 0 0 1 3.75v7.5C1 12.216 1.784 13 2.75 13H4V3.75c0-.966.784-1.75 1.75-1.75zM5.5 3.75c0-.138.112-.25.25-.25h7.5c.138 0 .25.112.25.25v9.5a.25.25 0 0 1-.25.25h-7.5a.25.25 0 0 1-.25-.25zM5.75 2A1.75 1.75 0 0 0 4 3.75v9.5c0 .966.784 1.75 1.75 1.75h7.5A1.75 1.75 0 0 0 15 13.25v-9.5A1.75 1.75 0 0 0 13.25 2z",
  "#4B5563"
)
const IconActionAssign = createSvgIcon(
  "M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8m0 1.5c-2.47 0-4.75 1.246-4.75 2.75c0 .414.336.75.75.75h6.25v-1.5H4.904c.326-.415 1.493-1 3.096-1m5.25-1.25v1.5h1.5v1.5h-1.5v1.5h-1.5v-1.5h-1.5v-1.5h1.5v-1.5z",
  "#2563EB"
)
const IconActionUnassign = createSvgIcon(
  "M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8m0 1.5c-2.47 0-4.75 1.246-4.75 2.75c0 .414.336.75.75.75h6.25v-1.5H4.904c.326-.415 1.493-1 3.096-1m2.75-.25h4v1.5h-4z",
  "#D97706"
)
const IconActionClose = createSvgIcon("M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1m3.03 4.97a.75.75 0 0 0-1.06-1.06L7 7.88L6.03 6.91a.75.75 0 1 0-1.06 1.06l1.5 1.5a.75.75 0 0 0 1.06 0z", "#8759E1")
const IconActionSkip = createSvgIcon(
  "M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1m3.53 3.47a.75.75 0 0 0-1.06 0L8 6.94L5.53 4.47a.75.75 0 0 0-1.06 1.06L6.94 8l-2.47 2.47a.75.75 0 1 0 1.06 1.06L8 9.06l2.47 2.47a.75.75 0 0 0 1.06-1.06L9.06 8l2.47-2.47a.75.75 0 0 0 0-1.06",
  "#6B7280"
)
const IconActionReopen = createSvgIcon(
  "M8 1a7 7 0 1 1-6.93 8H2.6a.75.75 0 0 0 0-1.5H.75A.75.75 0 0 0 0 8.25V10.1a.75.75 0 0 0 1.5 0V9A5.5 5.5 0 1 0 8 2.5c-1.64 0-3.11.72-4.12 1.87a.75.75 0 1 0 1.12 1C5.72 4.47 6.8 4 8 4a4 4 0 1 1-4 4a.75.75 0 0 0-1.5 0A5.5 5.5 0 0 0 8 13.5A5.5 5.5 0 0 0 8 2.5",
  "#2563EB"
)
const IconActionMarkRead = createSvgIcon(
  "M1.75 3h12.5c.69 0 1.25.56 1.25 1.25v7.5c0 .69-.56 1.25-1.25 1.25H1.75A1.25 1.25 0 0 1 .5 11.75v-7.5C.5 3.56 1.06 3 1.75 3m0 1.5a.25.25 0 0 0-.157.055L8 9.673l6.407-5.118a.25.25 0 0 0-.157-.055zm12.25 7v-5.03l-5.53 4.423a.75.75 0 0 1-.938 0L2 6.47v5.03z",
  "#2563EB"
)
const IconActionDone = createSvgIcon(
  "M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1m2.78 4.72a.75.75 0 0 0-1.06 0L7.25 8.19L6.28 7.22a.75.75 0 0 0-1.06 1.06l1.5 1.5a.75.75 0 0 0 1.06 0l3-3a.75.75 0 0 0 0-1.06",
  "#16A34A"
)
const IconActionUnsubscribe = createSvgIcon(
  "M8 14a4 4 0 0 0 2.93-1.276l1.348 1.35a.75.75 0 1 0 1.06-1.061L2.987 2.662A.75.75 0 0 0 1.927 3.72l1.31 1.311A4.98 4.98 0 0 0 3 6.5c0 2.325-.99 3.574-1.886 4.255A.75.75 0 0 0 1.5 12h9.28L8.53 9.75H4.064c.376-.676.686-1.686.686-3.25c0-.308.036-.607.103-.893l5.54 5.54A3.98 3.98 0 0 1 8 12.5m.03-11A4.97 4.97 0 0 1 13 8v1.75a.75.75 0 0 0 1.5 0V8a6.47 6.47 0 0 0-6.469-6.5a.75.75 0 1 0 0 1.5",
  "#DC2626"
)
const IconActionAccept = createSvgIcon(
  "M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1m3.28 4.72a.75.75 0 0 0-1.06 0L7 8.94L5.78 7.72a.75.75 0 1 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 0 0 0-1.06",
  "#16A34A"
)

const IconStar = {
  ImageType: "svg",
  ImageData:
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 16 16"><path fill="#E3B341" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25"/></svg>'
} as WoxImage

const IconList = createSvgIcon(
  "M2.75 2.5h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5ZM2.75 7h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2.75 7ZM2.75 11.5h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5Z",
  "#58A6FF"
)

const IconComment = createSvgIcon(
  "M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.5 0v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25H2.75a.25.25 0 0 0-.25.25Z",
  "#9CA3AF"
)

const IconGitHub = {
  ImageType: "relative",
  ImageData: "images/app.svg"
} as WoxImage

export {
  IconIssue,
  IconIssueOpen,
  IconIssueClosed,
  IconIssueNotPlanned,
  IconNotificationInbox,
  IconNotificationInboxColored,
  IconRepositoryTag,
  IconPullRequestOpen,
  IconPullRequestMerged,
  IconPullRequestClosed,
  IconActionOpenExternal,
  IconActionCopy,
  IconActionAssign,
  IconActionUnassign,
  IconActionClose,
  IconActionSkip,
  IconActionReopen,
  IconActionMarkRead,
  IconActionDone,
  IconActionUnsubscribe,
  IconActionAccept,
  IconComment,
  IconStar,
  IconList,
  IconGitHub
}
