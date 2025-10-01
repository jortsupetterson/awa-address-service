const INVISIBLES_REGEX = /[\u0000-\u001F\u007F]|\p{Cf}/gu;

type Ok = { ok: true; normalized: string; local: string; domain: string };
type Err = { ok: false; error: string };
export type NormalizeResult = Ok | Err;

export function normalizeEmail(input: string): NormalizeResult {
	if (typeof input !== 'string') return { ok: false, error: 'type' };

	let value = input.replace(INVISIBLES_REGEX, '').replace(/\s+/g, ' ').trim();
	if (value.length === 0) return { ok: false, error: 'empty' };

	value = value.normalize('NFKC');

	const atFirst = value.indexOf('@');
	const atLast = value.lastIndexOf('@');
	if (atFirst <= 0 || atFirst !== atLast || atLast === value.length - 1) {
		return { ok: false, error: '@_count' };
	}

	let local = value.slice(0, atFirst);
	const domainRaw = value.slice(atFirst + 1);

	let domain: string;
	domain = new URL('http://' + domainRaw).hostname.toLowerCase();
	if (!domain) return { ok: false, error: 'domain_empty' };
	if (domain.endsWith('.')) return { ok: false, error: 'domain_trailing_dot' };
	if (domain.length > 253) return { ok: false, error: 'domain_len' };

	if (domain === 'googlemail.com') domain = 'gmail.com';

	const labels = domain.split('.');
	if (
		labels.length === 0 ||
		labels.some(
			(label) => label.length === 0 || label.length > 63 || !/^[a-z0-9-]+$/.test(label) || label.startsWith('-') || label.endsWith('-')
		)
	) {
		return { ok: false, error: 'domain_label' };
	}

	if (domain === 'gmail.com') {
		const p = local.indexOf('+');
		if (p >= 0) local = local.slice(0, p);
		local = local.replace(/\./g, '');
	}

	local = local.toLowerCase();

	if (local.length === 0 || local.length > 64) return { ok: false, error: 'local_len' };
	if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
		return { ok: false, error: 'local_dots' };
	}

	const normalized = `${local}@${domain}`;
	if (normalized.length > 254) return { ok: false, error: 'addr_len' };

	return { ok: true, normalized, local, domain };
}
