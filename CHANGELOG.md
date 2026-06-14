# Changelog

This file records the main production changes I made while developing and maintaining the Coast Internet Radio website.

## 17 May 2026

- Added an opt-in returning-visitor count while keeping anonymous use available.
- Fixed feedback CSRF handling and replaced the browser delete prompt with a two-step confirmation.
- Added theme-aware station and presenter images.
- Improved mobile announcement, feedback form, history filters, admin navigation, and Station Helper layout.
- Expanded Station Helper wording and common listener questions.

## 16 May 2026

- Added first-party anonymous analytics and an authenticated analytics dashboard.
- Added visitor feedback collection and an authenticated review screen.
- Introduced daily summaries, monthly and yearly rollups, bounded recent-event data, and retention pruning.
- Added feature flags for analytics and feedback.
- Redesigned the playlist-history overview and added shared admin navigation.
- Updated the privacy notice to document the stored data and retention behaviour.

## 14 May 2026

- Split the public stylesheet into maintainable source partials with a generated production bundle.
- Added shared live-status rendering for now-playing, programme, and listener information.
- Added the browser-based Station Helper and its maintainable knowledge file.
- Added light theme, high contrast, larger text, and reduced-motion preferences.
- Improved mobile player behaviour, repeat-show handling, listener counts, and listening-directory links.
- Protected diagnostic routes and removed built-in backup credentials.
- Added automated structure, syntax, JSON, HTML-reference, and deployment checks.
