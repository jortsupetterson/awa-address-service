export default async function handleGetAddressFromEmail({ email, utils }: { email: string; utils: any }): Promise<string | null> {
	const op = utils.normalizeEmail(email);
	return op.normalized;
}
