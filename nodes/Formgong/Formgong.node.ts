import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { formgongTool } from './GenericFunctions';

export class Formgong implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Formgong',
		name: 'formgong',
		icon: 'file:../../icons/formgong.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and create Formgong forms and read their submissions',
		defaults: { name: 'Formgong' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'formgongApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Form', value: 'form' },
					{ name: 'Submission', value: 'submission' },
				],
				default: 'submission',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['form'] } },
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a form and get its public access key',
						action: 'Create a form',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'List the forms of the account',
						action: 'Get many forms',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['submission'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Get the most recent submissions of a form',
						action: 'Get many submissions',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'Contact – example.com',
				displayOptions: { show: { resource: ['form'], operation: ['create'] } },
				description: 'Shown in the dashboard and in the email subject',
			},
			{
				displayName: 'Email Notifications',
				name: 'notifyEmail',
				type: 'boolean',
				default: true,
				displayOptions: { show: { resource: ['form'], operation: ['create'] } },
				description:
					'Whether to email submissions to the account address (each one on Pro and Business, a daily digest on Free)',
			},
			{
				displayName: 'Form Name or ID',
				name: 'formId',
				type: 'options',
				required: true,
				default: '',
				typeOptions: { loadOptionsMethod: 'getForms' },
				displayOptions: { show: { resource: ['submission'] } },
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 50 },
				default: 50,
				displayOptions: { show: { resource: ['submission'] } },
				description: 'Max number of results to return',
			},
			{
				displayName: 'Include Spam',
				name: 'includeSpam',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['submission'] } },
				description: 'Whether to include submissions marked as spam',
			},
		],
	};

	methods = {
		loadOptions: {
			async getForms(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const result = await formgongTool.call(this, 'list_forms');
				const forms = (result.forms as IDataObject[] | undefined) ?? [];
				return forms.map((form) => ({ name: String(form.name), value: String(form.id) }));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let rows: IDataObject[] = [];
				if (resource === 'form' && operation === 'getAll') {
					const result = await formgongTool.call(this, 'list_forms');
					rows = ((result.forms as IDataObject[] | undefined) ?? []).map((form) => ({
						...form,
						endpoint: result.endpoint,
					}));
				} else if (resource === 'form' && operation === 'create') {
					const result = await formgongTool.call(this, 'create_form', {
						name: this.getNodeParameter('name', i) as string,
						notify_email: this.getNodeParameter('notifyEmail', i) as boolean,
					});
					rows = [result];
				} else if (resource === 'submission' && operation === 'getAll') {
					const formId = this.getNodeParameter('formId', i) as string;
					const result = await formgongTool.call(this, 'list_recent_submissions', {
						form_id: formId,
						limit: this.getNodeParameter('limit', i) as number,
						include_spam: this.getNodeParameter('includeSpam', i) as boolean,
					});
					rows = ((result.submissions as IDataObject[] | undefined) ?? []).map((submission) => ({
						form_id: formId,
						...submission,
					}));
				}
				out.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(rows), {
						itemData: { item: i },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
