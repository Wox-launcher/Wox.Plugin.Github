# GitHub

Wox plugin for GitHub issue and notification management, modeled after the core Raycast GitHub flows but scoped to:

- Personal Access Token authentication
- My issues
- Notification management

## Install

```bash
wpm install github
```

## Configure

Set `Personal Access Token` in plugin settings.

Recommended classic PAT scopes:

- `repo`
- `notifications`
- `read:org`
- `read:user`

Quick token URL:

<https://github.com/settings/tokens/new?description=Wox%20GitHub%20Plugin&scopes=repo,read:org,read:user,notifications>

## Usage

```text
gh
gh issues
gh issues flaky
gh notifications
gh notifications unread
gh notifications review
```

## Settings

- `Number of Results`: max issues or notifications fetched per request
- `Issue Sort`: sorting for `issues`
- `Show Created / Assigned / Mentioned / Recently Closed`: controls groups in `issues`
- `Repository Filter Mode` + `Repository List`: include or exclude repositories for issues and notifications

## Implemented Actions

Issues:

- Open in browser
- Copy URL/title
- Assign or unassign yourself
- Close as completed
- Close as not planned
- Reopen

Notifications:

- Open in browser
- Mark as read
- Mark as done
- Unsubscribe
- Mark all unread as read
- Accept repository invitations
