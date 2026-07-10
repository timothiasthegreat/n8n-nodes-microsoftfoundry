import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';
import { supplyModel, type ChatModelConfig } from '@n8n/ai-node-sdk';
import { AnthropicFoundryChatModel } from './AnthropicFoundryChatModel';

interface FoundryOptions {
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	timeout?: number;
	maxRetries?: number;
}

export class MicrosoftFoundryChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Microsoft Foundry Chat Model',
		name: 'microsoftFoundryChatModel',
		icon: { light: 'file:microsoftfoundry.svg', dark: 'file:microsoftfoundry.dark.svg' },
		group: ['transform'],
		version: [1],
		description: 'Use any Microsoft Foundry model deployment as a chat model for AI Agents',
		defaults: {
			name: 'Microsoft Foundry Chat Model',
		},
		subtitle: '={{$parameter["apiType"] + ": " + $parameter["deploymentName"]}}',
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://github.com/timothiasthegreat/n8n-nodes-microsoftfoundry',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [{ name: 'microsoftfoundryApi', required: true }],
		properties: [
			{
				displayName: 'API Type',
				name: 'apiType',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Anthropic (Claude)',
						value: 'anthropic',
						description: 'For Claude deployments served on the Anthropic Messages API (/anthropic/v1)',
					},
					{
						name: 'OpenAI-Compatible (GPT, DeepSeek, Kimi, …)',
						value: 'openai',
						description: 'For deployments served on the OpenAI-compatible API (/openai/v1)',
					},
				],
				default: 'openai',
				description:
					'Which Foundry API surface the deployment uses. Claude deployments use the Anthropic Messages API; most other models use the OpenAI-compatible API.',
			},
			{
				displayName: 'Deployment Name',
				name: 'deploymentName',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'e.g. gpt-4o, Kimi-K2.6, DeepSeek-R1, claude-opus-4-8',
				description: 'The name of the model deployment in your Foundry resource',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						typeOptions: { minValue: 0 },
						description: 'Maximum number of times to retry a failed request',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						default: 1024,
						typeOptions: { minValue: 1 },
						description:
							'The maximum number of tokens to generate. Required for Anthropic (Claude) deployments.',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.7,
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
						description:
							'Controls randomness: lower values are more deterministic, higher values more creative',
					},
					{
						displayName: 'Timeout (Ms)',
						name: 'timeout',
						type: 'number',
						default: 60000,
						typeOptions: { minValue: 1 },
						description: 'Maximum time in milliseconds to wait for a response',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
						description:
							'Nucleus sampling: consider only tokens within the top P probability mass',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('microsoftfoundryApi');
		const endpoint = (credentials.endpoint as string).replace(/\/+$/, '');
		const apiKey = credentials.apiKey as string;
		const apiType = this.getNodeParameter('apiType', itemIndex) as 'openai' | 'anthropic';
		const model = this.getNodeParameter('deploymentName', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as FoundryOptions;

		if (apiType === 'openai') {
			return supplyModel(this, {
				type: 'openai',
				baseUrl: `${endpoint}/openai/v1`,
				apiKey,
				model,
				temperature: options.temperature,
				topP: options.topP,
				maxTokens: options.maxTokens && options.maxTokens > 0 ? options.maxTokens : undefined,
				timeout: options.timeout,
				maxRetries: options.maxRetries,
			});
		}

		const config: ChatModelConfig = {
			temperature: options.temperature,
			topP: options.topP,
			maxTokens: options.maxTokens ?? 1024,
			timeout: options.timeout,
			maxRetries: options.maxRetries,
		};

		const chatModel = new AnthropicFoundryChatModel(
			model,
			`${endpoint}/anthropic/v1`,
			{
				httpRequest: async (method, url, body, headers) => {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'microsoftfoundryApi',
						{ method, url, body, headers, json: true },
					);
					return { body: response };
				},
				openStream: async (method, url, body, headers) => {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'microsoftfoundryApi',
						{ method, url, body, headers, encoding: 'stream' },
					);
					return { body: response as AsyncIterable<Buffer | Uint8Array> };
				},
			},
			config,
		);

		return supplyModel(this, chatModel);
	}
}
