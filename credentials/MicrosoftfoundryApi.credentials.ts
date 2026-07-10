import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MicrosoftfoundryApi implements ICredentialType {
	name = 'microsoftfoundryApi';

	displayName = 'Microsoft Foundry API';

	icon = { light: 'file:../nodes/Microsoftfoundry/microsoftfoundry.svg', dark: 'file:../nodes/Microsoftfoundry/microsoftfoundry.dark.svg' } as const;

	documentationUrl =
		'https://github.com/firesideit/n8n-nodes-microsoftfoundry?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint',
			name: 'endpoint',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'https://your-resource.services.ai.azure.com',
			description:
				'The base URL of your Microsoft Foundry resource. Do not include a trailing path such as /openai or /anthropic — the node appends the correct path based on the selected API type.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'The API key for your Microsoft Foundry resource',
		},
	];

	// Both headers are sent so the same credential authenticates against either
	// Foundry surface: the OpenAI-compatible route (/openai/v1) reads the
	// Authorization bearer header, while the Anthropic route (/anthropic/v1)
	// reads the x-api-key header. Sending the unused header is harmless.
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.endpoint.replace(/\\/+$/, "")}}/openai/v1',
			url: '/models',
			method: 'GET',
		},
	};
}
