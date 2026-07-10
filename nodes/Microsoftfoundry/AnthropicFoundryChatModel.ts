import {
	BaseChatModel,
	getParametersJsonSchema,
	parseSSEStream,
	type ChatModelConfig,
	type GenerateResult,
	type Message,
	type MessageContent,
	type StreamChunk,
	type FinishReason,
	type Tool,
} from '@n8n/ai-node-sdk';
import type { IHttpRequestMethods } from 'n8n-workflow';

/**
 * Transport callbacks injected from the node's `supplyData`, where the
 * authenticated HTTP helpers are available. The model class itself stays
 * transport-agnostic.
 */
export interface AnthropicRequests {
	httpRequest: (
		method: IHttpRequestMethods,
		url: string,
		body?: object,
		headers?: Record<string, string>,
	) => Promise<{ body: unknown }>;
	openStream: (
		method: IHttpRequestMethods,
		url: string,
		body?: object,
		headers?: Record<string, string>,
	) => Promise<{ body: AsyncIterable<Buffer | Uint8Array> }>;
}

const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicContentBlock {
	type: string;
	text?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
}

interface AnthropicResponse {
	id?: string;
	content?: AnthropicContentBlock[];
	stop_reason?: string;
	usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicStreamEvent {
	type?: string;
	index?: number;
	message?: { usage?: { input_tokens?: number } };
	content_block?: { type?: string; id?: string; name?: string };
	delta?: {
		type?: string;
		text?: string;
		partial_json?: string;
		stop_reason?: string;
	};
	usage?: { output_tokens?: number };
	error?: unknown;
}

function mapStopReason(reason?: string): FinishReason {
	switch (reason) {
		case 'end_turn':
		case 'stop_sequence':
			return 'stop';
		case 'max_tokens':
			return 'length';
		case 'tool_use':
			return 'tool-calls';
		default:
			return 'other';
	}
}

/**
 * Chat model for Claude deployments served through Microsoft Foundry's
 * Anthropic Messages API surface (`/anthropic/v1/messages`). The Foundry
 * OpenAI-compatible route does not serve Claude, so this speaks the Anthropic
 * wire protocol directly.
 */
export class AnthropicFoundryChatModel extends BaseChatModel {
	constructor(
		modelId: string,
		private baseUrl: string,
		private requests: AnthropicRequests,
		defaultConfig?: ChatModelConfig,
	) {
		super('anthropic-foundry', modelId, defaultConfig);
	}

	private extractText(content: MessageContent[]): string {
		return content
			.filter((c): c is Extract<MessageContent, { type: 'text' }> => c.type === 'text')
			.map((c) => c.text)
			.join('');
	}

	/**
	 * Convert n8n messages into the Anthropic payload shape. System messages are
	 * hoisted into a top-level `system` string; tool results (n8n `tool` role)
	 * become `tool_result` blocks inside a user message.
	 */
	private toAnthropic(messages: Message[]): {
		system?: string;
		msgs: Array<{ role: 'user' | 'assistant'; content: unknown[] }>;
	} {
		const systemParts: string[] = [];
		const msgs: Array<{ role: 'user' | 'assistant'; content: unknown[] }> = [];

		for (const message of messages) {
			if (message.role === 'system') {
				systemParts.push(this.extractText(message.content));
				continue;
			}

			const role: 'user' | 'assistant' = message.role === 'assistant' ? 'assistant' : 'user';
			const content: unknown[] = [];

			for (const block of message.content) {
				switch (block.type) {
					case 'text':
						if (block.text) content.push({ type: 'text', text: block.text });
						break;
					case 'tool-call':
						content.push({
							type: 'tool_use',
							id: block.toolCallId,
							name: block.toolName,
							input: safeParseJson(block.input),
						});
						break;
					case 'tool-result':
						content.push({
							type: 'tool_result',
							tool_use_id: block.toolCallId,
							content:
								typeof block.result === 'string' ? block.result : JSON.stringify(block.result),
							...(block.isError ? { is_error: true } : {}),
						});
						break;
					default:
						break;
				}
			}

			if (content.length > 0) msgs.push({ role, content });
		}

		const system = systemParts.filter(Boolean).join('\n\n');
		return { system: system || undefined, msgs };
	}

	private buildToolDefs(): Array<Record<string, unknown>> | undefined {
		const functionTools = this.tools.filter(
			(t): t is Extract<Tool, { type: 'function' }> => t.type === 'function',
		);
		if (functionTools.length === 0) return undefined;
		return functionTools.map((tool) => ({
			name: tool.name,
			...(tool.description ? { description: tool.description } : {}),
			input_schema: getParametersJsonSchema(tool),
		}));
	}

	private buildBody(messages: Message[], config?: ChatModelConfig, stream = false): object {
		const cfg = this.mergeConfig(config);
		const { system, msgs } = this.toAnthropic(messages);
		const tools = this.buildToolDefs();
		return {
			model: this.modelId,
			// max_tokens is required by the Anthropic Messages API.
			max_tokens: cfg.maxTokens ?? 1024,
			messages: msgs,
			...(system ? { system } : {}),
			...(cfg.temperature != null ? { temperature: cfg.temperature } : {}),
			...(cfg.topP != null ? { top_p: cfg.topP } : {}),
			...(cfg.topK != null ? { top_k: cfg.topK } : {}),
			...(cfg.stopSequences?.length ? { stop_sequences: cfg.stopSequences } : {}),
			...(tools ? { tools } : {}),
			...(stream ? { stream: true } : {}),
		};
	}

	private headers(): Record<string, string> {
		return {
			'anthropic-version': ANTHROPIC_VERSION,
			'Content-Type': 'application/json',
		};
	}

	async generate(messages: Message[], config?: ChatModelConfig): Promise<GenerateResult> {
		const body = this.buildBody(messages, config, false);
		const response = await this.requests.httpRequest(
			'POST',
			`${this.baseUrl}/messages`,
			body,
			this.headers(),
		);
		const data = response.body as AnthropicResponse;

		const content: MessageContent[] = [];
		for (const block of data.content ?? []) {
			if (block.type === 'text' && block.text) {
				content.push({ type: 'text', text: block.text });
			} else if (block.type === 'tool_use') {
				content.push({
					type: 'tool-call',
					toolCallId: block.id,
					toolName: block.name ?? '',
					input: JSON.stringify(block.input ?? {}),
				});
			}
		}
		if (content.length === 0) content.push({ type: 'text', text: '' });

		const promptTokens = data.usage?.input_tokens ?? 0;
		const completionTokens = data.usage?.output_tokens ?? 0;

		return {
			id: data.id,
			finishReason: mapStopReason(data.stop_reason),
			message: { id: data.id, role: 'assistant', content },
			usage: {
				promptTokens,
				completionTokens,
				totalTokens: promptTokens + completionTokens,
			},
		};
	}

	async *stream(messages: Message[], config?: ChatModelConfig): AsyncIterable<StreamChunk> {
		const body = this.buildBody(messages, config, true);
		const response = await this.requests.openStream(
			'POST',
			`${this.baseUrl}/messages`,
			body,
			this.headers(),
		);

		// Track content blocks by index so tool_use argument deltas can be
		// attributed to the right tool call.
		const toolBlocks: Record<number, { id?: string; name?: string }> = {};
		let finishReason: FinishReason = 'stop';
		let promptTokens = 0;
		let completionTokens = 0;

		for await (const event of parseSSEStream(
			response.body as AsyncIterableIterator<Buffer | Uint8Array>,
		)) {
			if (!event.data) continue;
			let payload: AnthropicStreamEvent;
			try {
				payload = JSON.parse(event.data) as AnthropicStreamEvent;
			} catch {
				continue;
			}

			switch (payload.type) {
				case 'message_start':
					promptTokens = payload.message?.usage?.input_tokens ?? promptTokens;
					break;
				case 'content_block_start':
					if (payload.content_block?.type === 'tool_use') {
						toolBlocks[payload.index ?? 0] = {
							id: payload.content_block.id,
							name: payload.content_block.name,
						};
						yield {
							type: 'tool-call-delta',
							id: payload.content_block.id,
							name: payload.content_block.name,
						};
					}
					break;
				case 'content_block_delta':
					if (payload.delta?.type === 'text_delta') {
						yield { type: 'text-delta', delta: payload.delta.text ?? '' };
					} else if (payload.delta?.type === 'input_json_delta') {
						yield {
							type: 'tool-call-delta',
							id: toolBlocks[payload.index ?? 0]?.id,
							name: toolBlocks[payload.index ?? 0]?.name,
							argumentsDelta: payload.delta.partial_json ?? '',
						};
					}
					break;
				case 'message_delta':
					if (payload.delta?.stop_reason) {
						finishReason = mapStopReason(payload.delta.stop_reason);
					}
					completionTokens = payload.usage?.output_tokens ?? completionTokens;
					break;
				case 'message_stop':
					break;
				case 'error':
					yield { type: 'error', error: payload.error };
					return;
				default:
					break;
			}
		}

		yield {
			type: 'finish',
			finishReason,
			usage: {
				promptTokens,
				completionTokens,
				totalTokens: promptTokens + completionTokens,
			},
		};
	}
}

function safeParseJson(input: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(input);
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}
