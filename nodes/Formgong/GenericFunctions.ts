import type { IDataObject, IExecuteFunctions, IHookFunctions, ILoadOptionsFunctions, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

type McpResult = {
	content?: Array<{ type: string; text?: string }>;
	structuredContent?: IDataObject;
	isError?: boolean;
};

type McpResponse = {
	result?: McpResult;
	error?: { code: number; message: string };
};

/**
 * Calls one Formgong tool through its MCP endpoint (JSON-RPC over HTTPS, stateless).
 * Returns the tool's structured result; tool and protocol errors become n8n errors.
 */
export async function formgongTool(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
	name: string,
	args: IDataObject = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('formgongApi');
	const baseUrl = String(credentials.baseUrl || 'https://formgong.com').replace(/\/+$/, '');
	let response: McpResponse;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(this, 'formgongApi', {
			method: 'POST',
			url: `${baseUrl}/mcp`,
			headers: { Accept: 'application/json' },
			body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
			json: true,
		})) as McpResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
	if (response.error) {
		throw new NodeOperationError(this.getNode(), `Formgong: ${response.error.message}`);
	}
	const result = response.result ?? {};
	if (result.isError || !result.structuredContent) {
		const text = result.content?.find((part) => part.type === 'text')?.text ?? 'Unknown error';
		throw new NodeOperationError(this.getNode(), `Formgong: ${text}`);
	}
	return result.structuredContent;
}
