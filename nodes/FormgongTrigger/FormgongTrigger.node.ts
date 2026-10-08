import {
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';
import { formgongTool } from '../Formgong/GenericFunctions';
import { validSignature } from './signature';

type HookData = { webhookId?: string; signingKey?: string; formId?: string };

export class FormgongTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Formgong Trigger',
		name: 'formgongTrigger',
		icon: 'file:../../icons/formgong.svg',
		group: ['trigger'],
		version: 1,
		subtitle: 'New submission',
		description: 'Starts the workflow when a Formgong form receives a submission',
		defaults: { name: 'Formgong Trigger' },
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'formgongApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Form Name or ID',
				name: 'formId',
				type: 'options',
				required: true,
				default: '',
				typeOptions: { loadOptionsMethod: 'getForms' },
				description:
					'The form to watch. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Include Test Events',
				name: 'includeTestEvents',
				type: 'boolean',
				default: true,
				description:
					'Whether to start the workflow for the "Send test" button in Formgong (event webhook.test)',
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

	// Formgong registers the webhook on activation and removes it on deactivation.
	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as HookData;
				const formId = this.getNodeParameter('formId') as string;
				if (!data.webhookId || data.formId !== formId) return false;
				const result = await formgongTool.call(this, 'list_webhooks', { form_id: formId });
				const url = this.getNodeWebhookUrl('default');
				const webhooks = (result.webhooks as IDataObject[] | undefined) ?? [];
				return webhooks.some((webhook) => webhook.id === data.webhookId && webhook.url === url);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as HookData;
				const formId = this.getNodeParameter('formId') as string;
				const result = await formgongTool.call(this, 'create_webhook', {
					form_id: formId,
					url: this.getNodeWebhookUrl('default') as string,
				});
				data.webhookId = String((result.webhook as IDataObject).id);
				data.signingKey = String(result.signing_secret);
				data.formId = formId;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as HookData;
				if (data.webhookId && data.formId) {
					try {
						await formgongTool.call(this, 'delete_webhook', { form_id: data.formId, webhook_id: data.webhookId });
					} catch {
						return false;
					}
				}
				delete data.webhookId;
				delete data.signingKey;
				delete data.formId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const data = this.getWorkflowStaticData('node') as HookData;
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
		if (!data.signingKey || !raw || !validSignature(raw, req.header('x-signature'), data.signingKey)) {
			this.getResponseObject().status(401).send('Invalid Formgong signature');
			return { noWebhookResponse: true };
		}
		const body = (req.body ?? {}) as IDataObject;
		const includeTest = this.getNodeParameter('includeTestEvents', true) as boolean;
		if (!includeTest && body.event === 'webhook.test') return { webhookResponse: 'ignored test event' };
		return { workflowData: [this.helpers.returnJsonArray(body)] };
	}
}
