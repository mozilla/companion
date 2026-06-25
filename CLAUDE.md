# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Companion is a Firefox WebExtension sidebar built for Firefox Enterprise power users who run everything in the browser (Gmail, Slack, Zoom, Google Workspace, etc.). It shows upcoming Google Calendar events and recent Drive documents, with meeting join buttons and desktop notifications. Features are driven by real workflow friction — fixing quirks of the all-in-browser enterprise experience. Licensed under MPL 2.0.

## Development

No build step. Load the extension directly in Firefox:
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on" and select `manifest.json`

**Lint:**
```bash
npx eslint . --ext .js
```

**Release:** Triggered automatically by GitHub Actions when `manifest.json` version is bumped on `main`. Signs XPI via AMO and creates a GitHub release.

**Secrets needed** (for release only): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`

## Architecture

Three distinct contexts — they cannot share memory or call each other's functions directly; all cross-context communication goes through `browser.storage.local` and `browser.runtime.sendMessage`.

### Background (`background/background.js`)
- Polls Google Calendar every 10 minutes and Google Drive on demand
- Fires desktop notifications at meeting start and 10 min before
- Persists events and docs to `browser.storage.local`
- Key classes: `OnlineServices` (API orchestration), `OAuth2` (token management)

### Sidebar (`frontend/sidebar.js` + `index.html`)
- Reads from `browser.storage.local` (does not call APIs directly)
- Renders today/tomorrow event cards with status badges (Now/Soon/Later)
- Detects conference links (Zoom, Teams, Meet, Webex, etc.) by regex in `onlineserviceshelper.js`
- Opens meeting links in existing tab if possible, otherwise new tab

### Options (`frontend/options.js` + `options.html`)
- Handles Google account connect/disconnect only

## Key Conventions

- **Plain ES6 JS, no build tooling, no frameworks** — keep it that way. The project was intentionally converted from TypeScript + Lit + Vite + yarn to plain HTML/CSS/JS. Don't introduce build steps or frameworks.
- Formatting: 2-space tabs, single quotes, trailing commas, no semicolons (`.prettierrc`)
- HTML sanitization is done in the sidebar before rendering event descriptions — always sanitize user-controlled content before `innerHTML`
- OAuth2 uses XHR (not `fetch`) intentionally to preserve the `Origin` header for Microsoft OAuth compatibility
- Localization via `_locales/en/messages.json` and `browser.i18n.getMessage()`
- Only the primary calendar is shown (not secondary/shared calendars)
- "Tomorrow" means next Monday when today is Friday

## Firefox-Specific Gotchas

- Notifications **require** `iconUrl` set to `browser.runtime.getURL('icon48.png')` — omitting it breaks notifications
- Firefox does **not** support notification `buttons` — don't add them
- Footer needs `z-index: 50` to prevent compact event icons from bleeding through the settings popup
- Opening a URL should focus the existing tab's window, not just switch to the tab

## UI Structure

- **Hero card**: current or next event shown prominently at the top
- **Compact list**: remaining events for the day shown below the hero card
- **Settings popup** (gear icon): contains today/tomorrow toggle, notifications toggle, disconnect button; stays open when toggling views
- **Manual refresh button**: spinning icon while refresh is in progress
- Event descriptions render as HTML with a show/hide toggle; conference URLs are filtered out of the description
- Attachments from the calendar event are shown in a Documents section
- Notification click opens the conference URL if one exists, otherwise opens the calendar event
