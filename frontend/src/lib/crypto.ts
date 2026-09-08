let cachedEncryptionKey: CryptoKey | null = null;

/**
 * @param {string} base64 - base64 编码的二进制数据
 * @returns {ArrayBuffer} 解码后的二进制数据
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * @param {string} password - 待加密的明文密码
 * @param {string} apiBase - 后端 API 根地址
 * @returns {Promise<string>} base64 编码的 RSA-OAEP 密文
 */
export async function encryptPasswordForLogin(
  password: string,
  apiBase: string,
): Promise<string> {
  if (cachedEncryptionKey === null) {
    const response = await fetch(`${apiBase}/auth/public-key`);
    if (!response.ok) {
      throw new Error("无法获取加密公钥，请稍后重试");
    }
    const payload = (await response.json()) as { publicKey?: string };
    if (!payload.publicKey) {
      throw new Error("加密公钥缺失，请稍后重试");
    }
    cachedEncryptionKey = await globalThis.crypto.subtle.importKey(
      "spki",
      base64ToArrayBuffer(payload.publicKey),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
  }
  const encoded = new TextEncoder().encode(password);
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    cachedEncryptionKey,
    encoded,
  );
  const bytes = new Uint8Array(encrypted);
  const chunks: string[] = [];
  for (const byte of bytes) {
    chunks.push(String.fromCharCode(byte));
  }
  return globalThis.btoa(chunks.join(""));
}
