import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { userDescription } from './resources/user';
import { companyDescription } from './resources/company';

export class Microsoftfoundry implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Microsoftfoundry',
		name: 'microsoftfoundry',
		icon: { light: 'file:microsoftfoundry.svg', dark: 'file:microsoftfoundry.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Microsoftfoundry API',
		defaults: {
			name: 'Microsoftfoundry',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'microsoftfoundryApi', required: true }],
		requestDefaults: {
			baseURL: 'https://YOUR-FOUNDRY-RESOURCE.services.ai.azure.com',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'User',
						value: 'user',
					},
					{
						name: 'Company',
						value: 'company',
					},
				],
				default: 'user',
			},
			...userDescription,
			...companyDescription,
		],
	};
}
