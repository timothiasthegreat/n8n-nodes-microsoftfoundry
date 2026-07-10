# n8n-nodes-microsoftfoundry

This is an n8n community node. It lets you use any **Microsoft Foundry** (Azure AI Foundry) model deployment as the chat model for n8n AI Agents.

[Microsoft Foundry](https://learn.microsoft.com/azure/ai-foundry/) is Microsoft's platform for deploying and serving AI models — including OpenAI (GPT), Anthropic (Claude), DeepSeek, Kimi, and many others — behind a single resource endpoint. This node exposes those deployments as a **Chat Model sub-node**, so any model you have deployed in Foundry can drive an n8n **AI Agent**, **Basic LLM Chain**, or any other node that accepts a language model connection.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Node configuration](#node-configuration)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-microsoftfoundry`.

## Operations

This package provides a single node — **Microsoft Foundry Chat Model**. It is a *sub-node*: instead of running as a workflow step, it attaches to the **Chat Model** input of an AI node (AI Agent, Basic LLM Chain, etc.) and supplies the underlying language model.

It supports both wire protocols that Foundry exposes on a resource, selected with the **API Type** parameter:

| API Type | Foundry route | Typical deployments |
|----------|---------------|---------------------|
| **OpenAI-Compatible (GPT, DeepSeek, Kimi, …)** | `/openai/v1/chat/completions` | GPT, DeepSeek, Kimi, and most models |
| **Anthropic (Claude)** | `/anthropic/v1/messages` | Claude deployments |

The Anthropic path supports non-streaming and streaming responses as well as tool calling, so Claude deployments work with n8n AI Agents that use tools.

## Credentials

You need a **Microsoft Foundry resource** with at least one model deployed. From the resource you need:

- **Endpoint** — the resource base URL, e.g. `https://your-resource.services.ai.azure.com`. Do **not** include a trailing `/openai` or `/anthropic` path; the node appends the correct path based on the selected API Type.
- **API Key** — a key for the Foundry resource.

Create a **Microsoft Foundry API** credential in n8n and fill in both fields. The credential sends both an `Authorization: Bearer <key>` header (for the OpenAI-compatible route) and an `x-api-key` header (for the Anthropic route), so the same credential authenticates against either API surface. The credential test calls `GET {endpoint}/openai/v1/models`.

## Node configuration

| Parameter | Description |
|-----------|-------------|
| **API Type** | Choose *OpenAI-Compatible* or *Anthropic (Claude)* to match how your deployment is served. |
| **Deployment Name** | The name of the model deployment in your Foundry resource (e.g. `gpt-4o`, `Kimi-K2.6`, `DeepSeek-R1`, `claude-opus-4-8`). This becomes the `model` sent to the API. |

Under **Options**:

| Option | Notes |
|--------|-------|
| **Sampling Temperature** | Randomness of output. Only sent when set — some models (e.g. `claude-opus-4-8`) reject it; leave unset for those. |
| **Maximum Number of Tokens** | Max tokens to generate. **Required** for Anthropic (Claude) deployments (defaults to 1024 on that path). |
| **Top P** | Nucleus sampling. |
| **Timeout (Ms)** | Maximum time to wait for a response. |
| **Max Retries** | Number of retries on a failed request. |

## Compatibility

- Requires an n8n version with AI/LangChain sub-node support (AI Agent nodes). Built against `@n8n/ai-node-sdk` (`aiNodeSdkVersion: 1`).
- Verified end-to-end against a live Foundry resource with `Kimi-K2.6` (OpenAI path) and `claude-opus-4-8` (Anthropic path, both non-streaming and streaming).

## Usage

1. Add an **AI Agent** (or **Basic LLM Chain**) node to your workflow.
2. On its **Chat Model** input, add the **Microsoft Foundry Chat Model** node.
3. Select or create a **Microsoft Foundry API** credential (Endpoint + API Key).
4. Set **API Type** to match your deployment (OpenAI-Compatible for most models, Anthropic for Claude).
5. Enter the **Deployment Name** exactly as it appears in your Foundry resource.
6. Optionally set Options such as Maximum Number of Tokens (set this for Claude).

New to n8n's AI features? See the [Try it out](https://docs.n8n.io/try-it-out/) and [Advanced AI](https://docs.n8n.io/advanced-ai/) documentation.

### Notes and known caveats

- **Claude and `temperature`**: some Foundry Claude deployments (e.g. `claude-opus-4-8`) return `temperature is deprecated for this model`. The node only sends an option when you explicitly set it, so leave **Sampling Temperature** blank for such models.
- **Reasoning models**: models that spend tokens on internal reasoning (e.g. Kimi) may consume the full **Maximum Number of Tokens** budget before producing visible text. Increase the limit if replies come back empty.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Microsoft / Azure AI Foundry documentation](https://learn.microsoft.com/azure/ai-foundry/)
* [Use Claude models in Foundry](https://learn.microsoft.com/azure/ai-foundry/foundry-models/how-to/use-foundry-models-claude)

## Version history

### 0.2.0

- Reworked the package into a **Microsoft Foundry Chat Model** AI sub-node supplying any Foundry deployment to n8n AI Agents.
- Endpoint + API Key credential sending both `Authorization` and `x-api-key` headers.
- **API Type** selector for the OpenAI-compatible and Anthropic Messages APIs.
- Added `AnthropicFoundryChatModel` (streaming + tool calling) for the `/anthropic/v1/messages` route.
- Removed the initial placeholder `user`/`company` scaffold.

See [CHANGELOG.md](CHANGELOG.md) for full details.
