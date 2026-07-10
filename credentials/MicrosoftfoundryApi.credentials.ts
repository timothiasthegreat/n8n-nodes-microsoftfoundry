import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class MicrosoftfoundryApi implements ICredentialType {
	name = 'microsoftfoundryApi';

	displayName = 'Microsoftfoundry API';

	// Link to your community node's README
	documentationUrl = 'https://github.com/org/-microsoftfoundry?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://YOUR-FOUNDRY-RESOURCE.services.ai.azure.com',
			url: '/v1/user',
		},
	};
}
