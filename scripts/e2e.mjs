// End-to-end check of the built nodes against a Formgong instance, with stand-ins for n8n's runtime.
// Usage: npm run build && FORMGONG_TOKEN=fgp_… FORMGONG_BASE_URL=http://localhost:8788 node scripts/e2e.mjs
// The token needs forms:write and submissions:read. It creates one form, one submission and one webhook
// (removed again at the end).
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Formgong } from '../dist/nodes/Formgong/Formgong.node.js';
import { FormgongTrigger } from '../dist/nodes/FormgongTrigger/FormgongTrigger.node.js';

const base = (process.env.FORMGONG_BASE_URL ?? 'https://formgong.com').replace(/\/+$/, '');
const token = process.env.FORMGONG_TOKEN;
assert.ok(token, 'set FORMGONG_TOKEN');

const helpers = {
	// Like n8n: the credential's token goes into the Authorization header of this one request.
	async httpRequestWithAuthentication(name, opts) {
		const credentials = await this.getCredentials(name);
		const res = await fetch(opts.url, {
			method: opts.method,
			headers: { ...opts.headers, 'content-type': 'application/json', authorization: `Bearer ${credentials.apiToken}` },
			body: JSON.stringify(opts.body),
		});
		const text = await res.text();
		if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`), { httpCode: String(res.status) });
		return JSON.parse(text);
	},
	returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
	constructExecutionMetaData: (items, { itemData }) => items.map((item) => ({ ...item, pairedItem: itemData })),
};
const node = { name: 'Formgong', type: 'n8n-nodes-formgong.formgong', typeVersion: 1, parameters: {} };
const context = (params, extra = {}) => ({
	getInputData: () => [{ json: {} }],
	getNodeParameter: (name, _i, fallback) => (name in params ? params[name] : fallback),
	getCredentials: async () => ({ apiToken: token, baseUrl: base }),
	getNode: () => node,
	continueOnFail: () => false,
	helpers,
	...extra,
});
const run = async (params) => (await new Formgong().execute.call(context(params)))[0].map((item) => item.json);

let step = 0;
const ok = (label) => console.log(`ok ${++step} ${label}`);

// Action node
const forms = await run({ resource: 'form', operation: 'getAll' });
assert.ok(forms.length >= 1 && forms[0].access_key?.startsWith('fk_'));
ok(`form getAll: ${forms.length} form(s)`);

const [created] = await run({ resource: 'form', operation: 'create', name: `n8n e2e ${Date.now()}`, notifyEmail: false });
const formId = created.form.id;
assert.match(created.form.access_key, /^fk_/);
ok('form create');

const options = await new Formgong().methods.loadOptions.getForms.call(context({}));
assert.ok(options.some((option) => option.value === formId));
ok('loadOptions getForms lists the new form');

const submit = await fetch(`${base}/submit`, {
	method: 'POST',
	headers: { 'content-type': 'application/json', accept: 'application/json', origin: 'https://example.com' },
	body: JSON.stringify({ access_key: created.form.access_key, name: 'Ada', email: 'ada@example.com', message: 'n8n e2e' }),
});
assert.equal((await submit.json()).success, true);
const submissions = await run({ resource: 'submission', operation: 'getAll', formId, limit: 5, includeSpam: false });
assert.equal(submissions.length, 1);
assert.equal(submissions[0].fields.message, 'n8n e2e');
assert.equal(submissions[0].form_id, formId);
ok('submission getAll returns the submission');

// Trigger: webhook lifecycle
const staticData = {};
const url = 'https://n8n.example.com/webhook/formgong-e2e';
const hook = context({ formId }, { getWorkflowStaticData: () => staticData, getNodeWebhookUrl: () => url });
const methods = new FormgongTrigger().webhookMethods.default;
assert.equal(await methods.checkExists.call(hook), false);
assert.equal(await methods.create.call(hook), true);
assert.ok(staticData.webhookId && /^[a-f0-9]{48}$/.test(staticData.signingKey));
assert.equal(await methods.checkExists.call(hook), true);
ok('trigger registers its webhook in Formgong');

// Trigger: signature check, with the body exactly as Formgong signs it
const body = JSON.stringify({ event: 'submission.created', form: { id: formId, name: 'x' }, submission: { id: 's', fields: { message: 'hi' } } });
const sign = (key) => `sha256=${createHmac('sha256', key).update(body).digest('hex')}`;
const deliver = async (signature, payload = body) => {
	let status = 200;
	const response = { status: (code) => ((status = code), { send: () => undefined }) };
	const request = { rawBody: Buffer.from(payload), body: JSON.parse(payload), header: (name) => (name === 'x-signature' ? signature : undefined) };
	const out = await new FormgongTrigger().webhook.call(
		context({ includeTestEvents: true }, { getRequestObject: () => request, getResponseObject: () => response, getWorkflowStaticData: () => staticData }),
	);
	return { status, out };
};
const good = await deliver(sign(staticData.signingKey));
assert.equal(good.out.workflowData[0][0].json.submission.fields.message, 'hi');
assert.equal((await deliver(sign('wrong-key'))).status, 401);
assert.equal((await deliver(sign(staticData.signingKey), body.replace('hi', 'hx'))).status, 401);
assert.equal((await deliver(undefined)).status, 401);
ok('trigger accepts a valid signature and rejects wrong key, changed body and no signature');

assert.equal(await methods.delete.call(hook), true);
assert.equal(staticData.webhookId, undefined);
const left = await run({ resource: 'form', operation: 'getAll' });
assert.ok(left.some((form) => form.id === formId));
ok('trigger removes its webhook');

// A bad token is an error, not an empty result
await assert.rejects(
	new Formgong().execute.call(context({ resource: 'form', operation: 'getAll' }, { getCredentials: async () => ({ apiToken: 'fgp_' + '0'.repeat(64), baseUrl: base }) })).then(() => {
		throw new Error('expected failure');
	}),
);
ok('bad credentials fail loudly');
console.log(`${step} checks passed`);
