import { ExecutionContext } from '@cloudflare/workers-types';

export default async function handleGetAddressFromEmail({
	env,
	ctx,
	utils,
	email,
}: {
	env: Env;
	ctx: ExecutionContext;
	utils: any;
	email: string;
}): Promise<any> {
	const emailResult = utils.normalizeEmail(email);
	const emailBytes = te.encode(emailResult.normalized);
	const emailHashBuffer = await crypto.subtle.digest('SHA-256', emailBytes);
	const vShard = utils.sharder.vShardSlotFromHash(new Uint8Array(emailHashBuffer));

	const currentMacBytes = await utils.maccer.hmac(env, utils, emailBytes, env.KID_CURRENT, 16);
	const currentMacKey = utils.byteCodec.toBase64url('bytes', currentMacBytes);
	const kvHit = await env.KV_CACHE.get(currentMacKey);
	if (kvHit) return { credentialsAddress: kvHit };

	const legacyKids = env.LEGACY_KIDS;
	const legacyMacBytes: Uint8Array[] = [];
	for (const kid of legacyKids) legacyMacBytes.push(await utils.maccer.hmac(env, utils, emailBytes, kid, 16));

	const allPseudoIdxBytes = [currentMacBytes, ...legacyMacBytes];
	const kids = [env.KID_CURRENT, ...legacyKids];

	const vMap = utils.getVmap(env);
	const pShardIndex = vMap[vShard];
	const pShard = env.PHYSICAL_SHARD_NAMES[pShardIndex];
	const db = env[`AWA_ADDRESSES_D1_${pShard}`];

	const macPlaceholders = allPseudoIdxBytes.map(() => '?').join(',');
	const kidPlaceholders = kids.map(() => '?').join(',');

	const row = await db
		.prepare(
			`SELECT c.cred_addr AS cred
			 FROM address_index_map a
			 JOIN credentials c ON c.cred_pk = a.cred_pk
			 WHERE a.vshard = ?
			   AND a.pseudo_idx IN (${macPlaceholders})
			   AND a.kid IN (${kidPlaceholders})
			 ORDER BY a.kid DESC
			 LIMIT 1`
		)
		.bind(vShard, ...allPseudoIdxBytes, ...kids)
		.first<{ cred: ArrayBuffer }>();

	if (row?.cred) {
		const b = new Uint8Array(row.cred);
		const out = utils.byteCodec.toBase64url('bytes', b);
		ctx.waitUntil(env.KV_CACHE.put(currentMacKey, out));
		return { credentialsAddress: out };
	}

	return null;
}
