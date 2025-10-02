export default async function handleGetAddressFromEmail({ env, utils, email }: { env: Env; utils: any; email: string }): Promise<any> {
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
		return { credentialsAddress: utils.byteCodec.toBase64url('bytes', b) };
	}

	const newCredBytes = utils.byteCodec.getBytes(32);
	await db.batch([
		db.prepare(`INSERT OR IGNORE INTO credentials (cred_addr) VALUES (?)`).bind(newCredBytes),
		db
			.prepare(
				`INSERT OR IGNORE INTO address_index_map (vshard, pseudo_idx, kid, cred_pk)
			 SELECT ?, ?, ?, cred_pk FROM credentials WHERE cred_addr = ?`
			)
			.bind(vShard, currentMacBytes, env.KID_CURRENT, newCredBytes),
	]);

	const out = utils.byteCodec.toBase64url('bytes', newCredBytes);
	await env.KV_CACHE.put(currentMacKey, out);
	const mailRes = await utils.mailer.send(env, {
		senderAddress: 'DoNotReply@notifications.authentication.center',
		recipients: { to: [{ address: emailResult.normalized }] },
		content: { subject: 'Olet tunnistautumassa palveluun', plainText: 'Kertakäyttökoodisi 123456' },
		replyTo: [{ address: 'web.authentication.center@gmail.com' }],
		userEngagementTrackingDisabled: true,
	});

	return { credentialsAddress: out, result: mailRes };
}
