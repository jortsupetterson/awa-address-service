async function getSecretValue(env: Env, secretVersion: string): Promise<string> {
	const binding = (env as any)[`KEY_${secretVersion}`];
	if (!binding || typeof binding.get !== 'function') throw new Error(`Missing Secrets Store binding KEY_${secretVersion}`);
	const v = await binding.get();
	if (!v) throw new Error(`Empty secret for KEY_${secretVersion}`);
	return v;
}

export const maccer = {
	async hmac(env: Env, utils: any, dataBytes: Uint8Array, secretVersion: string, length: number): Promise<Uint8Array> {
		const secretValue = await getSecretValue(env, secretVersion);
		const secretBytes = te.encode(secretValue);
		const cryptoKey = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: { name: 'SHA-256' } }, false, ['sign']);
		const macBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes);
		const macBytes = new Uint8Array(macBuffer);
		const macTrim = macBytes.slice(0, length);
		return macTrim;
	},
};
