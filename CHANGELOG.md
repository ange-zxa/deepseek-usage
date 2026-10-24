# Changelog

All notable changes to DeepSeek Usage are documented here.

## [0.4.0] - 2026-10-25

### Added

- Whale-girl mascot with four moods (calm, happy, sleepy, surprised) and a thinking pose while refreshing.
- Comic-style speech bubble and refreshed dashboard styling.

### Changed

- The panel now distinguishes a missing API key from a failed balance request.
- Fetch errors show their actual message, with Retry and Update API Key actions.

## [0.3.3] - 2026-10-25

### Added

- The extension activates on startup (`onStartupFinished`), so the status bar appears without opening the sidebar.

### Changed

- Auto-refresh interval changed from 30 seconds to 5 minutes.
- The balance also refreshes when the VS Code window regains focus, throttled to once per minute.

## [0.3.1] - 2026-10-25

### Added

- ESLint configuration and unit tests for balance response parsing.
- Clear errors for invalid API keys, rate limits, server errors, and timeouts.

### Changed

- A single polling loop serves both the panel and the status bar, and concurrent requests are coalesced.
- The webview receives the latest cached balance on load instead of issuing its own request.
- The API key is now stored under `deepseek-usage.apiKey`; keys saved under the old name are migrated automatically.
- Content Security Policy now uses `webview.cspSource`.

## [0.3.0] - 2026-05-17

- Initial release: balance dashboard, status bar indicator, and keychain-backed API key storage.
