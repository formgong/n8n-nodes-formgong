import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Formgong signs each webhook body with HMAC-SHA256 and sends `X-Signature: sha256=<hex>`.
 * True only when the header matches the raw body for this secret.
 */
export function validSignature(rawBody: Buffer | string, header: string | undefined, secret: string): boolean {
	const match = /^sha256=([a-f0-9]{64})$/i.exec((header ?? '').trim());
	if (!match || !secret) return false;
	const expected = createHmac('sha256', secret).update(rawBody).digest();
	const given = Buffer.from(match[1], 'hex');
	return given.length === expected.length && timingSafeEqual(given, expected);
}
