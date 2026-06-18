# Changelog

## v0.2.0 - 2026-06-19

### Added

- Added streaming chat completions for DeepSeek, SiliconFlow, and custom OpenAI-compatible providers.
- Added plain-text live output while the model is generating, with Markdown rendered after completion.
- Added provider-returned reasoning display when available.
- Added collapsible reasoning panels: reasoning is expanded while the model is thinking and collapsed after completion.

### Changed

- Reasoning content is kept for display only and is not sent back in future chat context.

## v0.1.0 - 2026-06-19

### Added

- Added the initial Chrome Manifest V3 side panel extension.
- Added current page reading with user-controlled context inclusion.
- Added local API Key storage for DeepSeek, SiliconFlow, and custom OpenAI-compatible providers.
- Added editable system prompt, configurable context message limit, custom model IDs, and Markdown rendering.
