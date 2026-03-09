# GitHub

Wox plugin for GitHub issue and notification management, modeled after the core Raycast GitHub flows but scoped to:

- Personal Access Token authentication
- My issues
- Global issue search
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
gh search author:@me label:bug
gh notifications
gh notifications unread
gh notifications review
```

## Settings

- `Default Search Terms`: prepended to the `search` command
- `Number of Results`: max issue count per request
- `Issue Sort`: sorting for `issues` and `search`
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
