// src/index.ts

declare global {
	var te: TextEncoder;
}

globalThis.te = new TextEncoder();

import { WorkerEntrypoint } from 'cloudflare:workers';
import handleGetAddressFromEmail from './handlers/handleGetAddressFromEmail';
import { normalizeEmail } from './utils/normalize';
import byteCodec from './utils/byteCodec';
import { sharder } from './utils/sharder';
import { maccer } from './utils/maccer';
import { mailer } from './utils/mailer';

let __vMap: any;
function getVmap(env: Env) {
	if (__vMap) return __vMap;
	const pShardNamesArr = env.PHYSICAL_SHARD_NAMES;
	const vMapBuffer = new Uint32Array(1_048_576);
	for (let slotIndex = 0; slotIndex < 1_048_576; slotIndex++) {
		vMapBuffer[slotIndex] = slotIndex % pShardNamesArr.length;
	}
	__vMap = vMapBuffer;
	return __vMap;
}

const utilityDedupCahe = {
	normalizeEmail,
	byteCodec,
	sharder,
	getVmap,
	maccer,
	mailer,
};
export class AwaAddressService extends WorkerEntrypoint<Env> {
	/**
	 * Syöte: raaka email (string).
	 * Tuotos: base64url-enkoodattu 32-tavuinen credentialsAddress (string).
	 */
	async getAddressFromEmail(_email: string): Promise<any> {
		return await handleGetAddressFromEmail({ env: this.env, ctx: this.ctx, email: _email, utils: utilityDedupCahe });
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
			if (url.pathname === '/migration') {
				const oldEmail = url.searchParams.get('old') ?? '';
				const newEmail = url.searchParams.get('new') ?? '';
				if (!oldEmail || !newEmail) {
					return Response.json({ error: 'missing query params: old, new' });
				}
				const result = await rpc.migrateAddressToNewEmail(oldEmail, newEmail);
				return Response.json(result);
			}

			if (url.pathname === '/' && url.searchParams.has('email')) {
				const email = url.searchParams.get('email') ?? '';
				if (!email) Response.json({ error: 'missing query param: email' });
				const result = await rpc.getAddressFromEmail(email);
				return Response.json({ result });
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
