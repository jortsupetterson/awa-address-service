// src/index.ts
import { WorkerEntrypoint } from 'cloudflare:workers';
import { normalizeEmail } from './normalize.js';

/**
 * Env bindings (tyypitetty selvästi).
 */
interface Env {
	// Key ID bounds (top-level rotation model)
	KID_CURRENT: string; // esim. "2025Q4"
	KID_OLDEST: string; // esim. "2025Q2"

	// Fyysisten shardien määrä (wrangler vars -> string; parse int kun tarvitset)
	NUM_PHYSICAL_SHARDS?: string;

	// Secret Store (avaimet: address_hmac_key.<KID>)
	SECRETS?: { get(name: string): Promise<string | null> };

	// D1 per pShard (lisäät myöhemmin):
	// ADDRESSES_SHARD_0?: D1Database; ...

	// Dev-tilan reititys (vain kehitykseen): "1" = dev-router päällä
	DEV_ROUTING?: string;
}

/**
 * Sisäinen RPC-palvelu. ÄLÄ default-exporttaa tätä.
 * Varsinainen logiikka lisätään myöhemmin.
 */
export class AwaAddressService extends WorkerEntrypoint<Env> {
	/**
	 * Syöte: raaka email (string).
	 * Tuotos: base64url-enkoodattu 32-tavuinen credentialsAddress (string).
	 */
	async getAddressFromEmail(_email: string): Promise<string> {
		// TODO: canonicalize -> HMAC-128 (KID_CURRENT..KID_OLDEST) -> select/insert -> credentialsAddress
		return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // placeholder (32B b64url)
	}

	/**
	 * Migroi identiteetti vanhasta emailista uuteen.
	 * Tuotos: sama credentialsAddress (base64url).
	 */
	async migrateAddressToNewEmail(_oldEmail: string, _newEmail: string): Promise<string> {
		// TODO: resolve old -> credentialsAddress, compute new index (KID_CURRENT), write new shard row -> return credentialsAddress
		return 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; // placeholder
	}
}

/**
 * Default module worker export.
 * DEV-tilassa (env.DEV_ROUTING === "1") avaa väliaikaiset reitit testaukseen:
 *   • GET /?email=...                 -> AwaAddressService.getAddressFromEmail
 *   • GET /migration?old=...&new=...  -> AwaAddressService.migrateAddressToNewEmail
 * Deployssa (ei DEV_ROUTING) aina long-cached 404.
 */
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const isDev = env.DEV_ROUTING === '1';

		if (isDev) {
			// Instansoi RPC-palvelu vain dev-reititystä varten.
			const rpc = new AwaAddressService(ctx, env);

			if (url.pathname === '/email') {
				const email = url.searchParams.get('email');
				const normalized = normalizeEmail(String(email));
				return Response.json({ result: normalized });
			}
			if (url.pathname === '/migration') {
				const oldEmail = url.searchParams.get('old') ?? '';
				const newEmail = url.searchParams.get('new') ?? '';
				if (!oldEmail || !newEmail) {
					return Response.json({ error: 'missing query params: old, new' });
				}
				const credentialsAddress = await rpc.migrateAddressToNewEmail(oldEmail, newEmail);
				return Response.json({ credentialsAddress });
			}

			if (url.pathname === '/' && url.searchParams.has('email')) {
				const email = url.searchParams.get('email') ?? '';
				if (!email) Response.json({ error: 'missing query param: email' });
				const credentialsAddress = await rpc.getAddressFromEmail(email);
				return Response.json({ credentialsAddress });
			}
		}

		// Deploy-käytös (ja kaikki muut reitit): pitkällä välimuistilla 404
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
