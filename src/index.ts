// src/index.ts
import { WorkerEntrypoint } from 'cloudflare:workers';

/**
 * Env bindings you plan to use later. Keep them typed even if unused in the shell.
 */
interface Env {
	// Key ID bounds (top-level rotation model)
	KID_CURRENT: string; // e.g. "2025Q4"
	KID_OLDEST: string; // e.g. "2025Q2"

	// Number of physical shards (string in wrangler vars; parse to int when needed)
	NUM_PHYSICAL_SHARDS?: string;

	// Secret Store binding (keys named: address_hmac_key.<KID>)
	SECRETS?: { get(name: string): Promise<string | null> };

	// D1 per pShard will be added later; for the shell we omit them.
	// Example: ADDRESSES_SHARD_0: D1Database; ...

	// Dev toggle: if "1", enable dev routes in fetch (off in deploy)
	DEV_ROUTING?: string;
}

/**
 * Internal RPC service. DO NOT default-export this class.
 * Keep these methods thin; real logic will land here later.
 */
export class AwaAddressService extends WorkerEntrypoint<Env> {
	/**
	 * Input: raw user email (string).
	 * Output: base64url-encoded 32-byte credentialsAddress (string).
	 */
	async getAddressFromEmail(email: string): Promise<string> {
		// TODO: implement: canonicalize -> HMAC-128 (KID_CURRENT..KID_OLDEST lookup) -> select/insert -> return credentialsAddress
		// Shell return value (deterministic placeholder for dev):
		return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // 43-char base64url for 32 bytes (placeholder)
	}

	/**
	 * Migrate existing identity from oldEmail to newEmail.
	 * Output: same credentialsAddress (base64url) after migration.
	 */
	async migrateAddressToNewEmail(oldEmail: string, newEmail: string): Promise<string> {
		// TODO: implement: resolve old -> credentialsAddress, compute new index (KID_CURRENT), write new shard row -> return credentialsAddress
		// Shell return value (placeholder):
		return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
	}
}

/**
 * Default module worker export.
 * - In DEV mode (`env.DEV_ROUTING === "1"`), exposes two temporary routes for manual testing:
 *   • GET /?email=...                 -> calls AwaAddressService.getAddressFromEmail
 *   • GET /migration?old=...&new=...  -> calls AwaAddressService.migrateAddressToNewEmail
 * - In DEPLOY (no DEV_ROUTING), always returns cached 404 with long immutable cache.
 */
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const isDev = env.DEV_ROUTING === '1';

		if (isDev) {
			// Instantiate the RPC service class on-demand for dev routing only.
			const rpc = new AwaAddressService(env, ctx);

			if (url.pathname === '/migration') {
				const oldEmail = url.searchParams.get('old') ?? '';
				const newEmail = url.searchParams.get('new') ?? '';
				if (!oldEmail || !newEmail) {
					return json({ error: 'missing query params: old, new' }, 400);
				}
				const credentialsAddress = await rpc.migrateAddressToNewEmail(oldEmail, newEmail);
				return json({ credentialsAddress });
			}

			if (url.pathname === '/' && url.searchParams.has('email')) {
				const email = url.searchParams.get('email') ?? '';
				if (!email) return json({ error: 'missing query param: email' }, 400);
				const credentialsAddress = await rpc.getAddressFromEmail(email);
				return json({ credentialsAddress });
			}
		}

		// Deployment behavior (and for any non-dev route): long-cached 404
		const cached = await caches.default.match(request);
		if (cached) return cached;

		const response = new Response(null, {
			status: 404,
			headers: { 'cache-control': 'public, max-age=31536000, immutable' },
		});

		ctx.waitUntil(caches.default.put(request, response.clone()));
		return response;
	},
};

// --- tiny helper ---
function json(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}
