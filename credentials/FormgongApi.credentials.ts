import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FormgongApi implements ICredentialType {
	name = 'formgongApi';

	displayName = 'Formgong API';

	icon: Icon = { light: 'file:../icons/formgong.svg', dark: 'file:../icons/formgong.dark.svg' };

	documentationUrl = 'https://formgong.com/en/docs/mcp/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A personal API token (starts with fgp_). Create one in the Formgong dashboard under Account → API tokens.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://formgong.com',
			description: 'Change only for a self-hosted or test instance',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	// An invalid token gets HTTP 401 from /mcp; a valid one lists the account's forms.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/mcp',
			method: 'POST',
			body: {
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/call',
				params: { name: 'list_forms', arguments: {} },
			},
		},
	};
}
