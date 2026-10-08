# n8n-nodes-formgong

[Formgong](https://formgong.com) nodes for [n8n](https://n8n.io): start a workflow on every new form submission, list and create forms, and read recent submissions.

Formgong is a form backend. Point any HTML, React or AI-built form at it and each submission is stored, filtered for spam and sent to email, Telegram and webhooks.

## Installation

In n8n: **Settings → Community Nodes → Install** and enter `n8n-nodes-formgong`. See the [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Nodes

### Formgong Trigger

Starts the workflow when a form receives a submission.

1. Add the **Formgong Trigger** node and copy its **Production URL**.
2. In Formgong, open the form → **Webhooks** → add that URL.
3. Paste the form's webhook **signing secret** into the node. Requests without a valid `X-Signature` (HMAC-SHA256 of the raw body) are then rejected with 401.
4. Activate the workflow.

Output (one item per submission):

```json
{
  "event": "submission.created",
  "form": { "id": "6f1c2a9e-…", "name": "Contact" },
  "submission": {
    "id": "b3e04c51-…",
    "created_at": "2026-10-03T09:15:00.000Z",
    "page_url": "https://example.com/contact",
    "fields": { "name": "Ada", "email": "ada@example.com", "message": "Hi" },
    "is_spam": false
  }
}
```

The **Send test** button in Formgong sends `"event": "webhook.test"`; turn off **Include Test Events** to ignore it.

### Formgong

| Resource | Operation | What it does |
| --- | --- | --- |
| Form | Get Many | Lists the account's forms with their public access keys |
| Form | Create | Creates a form and returns its access key and endpoint |
| Submission | Get Many | Returns the most recent submissions of a form (up to 50) |

The node can also be used as a tool by n8n AI agents.

## Credentials

**Formgong API**: a personal API token (starts with `fgp_`). Create it in the Formgong dashboard under **Account → API tokens** with the scopes you need (`forms:read`, `forms:write`, `submissions:read`). The trigger needs no credentials.

Submitted field values are typed by website visitors. Treat them as untrusted data, especially when you pass them to an AI agent.

## Compatibility

Tested with n8n 1.x. Requires a Formgong account (free plan works).

## Resources

- [Formgong webhooks](https://formgong.com/en/docs/webhooks/)
- [Formgong API tokens and MCP](https://formgong.com/en/docs/mcp/)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
