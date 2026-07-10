# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-07-10

### Changed

- Reworked the package into a **Microsoft Foundry Chat Model** AI sub-node that
  supplies any Foundry model deployment as the chat model for n8n AI Agents.
- Credential now collects an **Endpoint** (Foundry resource base URL) and an
  **API Key**. Both `Authorization: Bearer` and `x-api-key` headers are sent so
  the same credential authenticates against either Foundry API surface.
- Added an **API Type** selector to choose between the OpenAI-compatible API
  (`/openai/v1`, for GPT / DeepSeek / Kimi / most models) and the Anthropic
  Messages API (`/anthropic/v1`, for Claude deployments).
- Added a **Deployment Name** parameter and Options (temperature, max tokens,
  top P, timeout, max retries).

### Added

- `AnthropicFoundryChatModel`, a `BaseChatModel` implementation that speaks the
  Anthropic Messages protocol (including streaming and tool calling) against the
  Foundry `/anthropic/v1/messages` endpoint.
- Declared `@n8n/ai-node-sdk` (`aiNodeSdkVersion: 1` + peer dependency).

### Removed

- Placeholder `user` and `company` resources from the initial scaffold.

### Notes

- Verified end-to-end against a live Foundry resource: the OpenAI-compatible
  path (`Kimi-K2.6`) and the Anthropic path (`claude-opus-4-8`, both
  `generate()` and streaming) authenticate and return responses.
- Some Foundry models reject certain sampling options — e.g. `claude-opus-4-8`
  returns `temperature is deprecated for this model`. The node only sends an
  option when you explicitly set it, so leave Temperature unset for such models.
