export const sharder = {
	vShardSlotFromHash(hash: Uint8Array) {
		return ((hash[0] << 12) | (hash[1] << 4) | (hash[2] >>> 4)) & 0xfffff;
	},
};
