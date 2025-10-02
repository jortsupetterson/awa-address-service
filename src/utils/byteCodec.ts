const byteCodec = {
	getBytes(bytesAmount = 32) {
		const bytes = new Uint8Array(bytesAmount);
		crypto.getRandomValues(bytes);
		return bytes;
	},
	getBase64url(bytesAmount = 32) {
		const bytes = new Uint8Array(bytesAmount);
		crypto.getRandomValues(bytes);
		let bin = '';
		const chunk = 0x8000;
		for (let o = 0; o < bytes.length; o += chunk) bin += String.fromCharCode(...bytes.subarray(o, o + chunk));
		return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},
	toBytes(contentType: string, content: any) {
		if (contentType === 'bytes') return content;
		if (contentType === 'hex') {
			const hex = content.toLowerCase();
			if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) throw new Error('Invalid hex string');
			const out = new Uint8Array(hex.length / 2);
			for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
			return out;
		}
		if (contentType === 'base64url') {
			const base64 = content.replace(/-/g, '+').replace(/_/g, '/');
			const pad = (4 - (base64.length % 4)) % 4;
			const bin = atob(base64 + '='.repeat(pad));
			const out = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
			return out;
		}
		throw new Error('Unsupported content type');
	},
	toHex(contentType: string, content: any) {
		const bytes = this.toBytes(contentType, content);
		const hexChars = new Array(bytes.length * 2);
		for (let i = 0; i < bytes.length; i++) {
			const v = bytes[i];
			hexChars[i * 2] = (v >>> 4).toString(16);
			hexChars[i * 2 + 1] = (v & 0x0f).toString(16);
		}
		return hexChars.join('');
	},
	toBase64url(contentType: string, content: any) {
		const bytes = this.toBytes(contentType, content);
		let bin = '';
		const chunk = 0x8000;
		for (let o = 0; o < bytes.length; o += chunk) bin += String.fromCharCode(...bytes.subarray(o, o + chunk));
		return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},
};

export default byteCodec;
