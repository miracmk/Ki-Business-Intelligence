/**
 * AES-256-GCM encryption for CRM credentials stored in DB.
 * Key comes from ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../../config/env.js';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96-bit IV recommended for GCM
const TAG_LEN = 16; // auth tag bytes
function getKey() {
    return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}
export function encrypt(plaintext) {
    const key = getKey();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: iv(hex):tag(hex):ciphertext(hex)
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}
export function decrypt(ciphertext) {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    if (!ivHex || !tagHex || !encHex)
        throw new Error('Invalid ciphertext format');
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc).toString('utf8') + decipher.final('utf8');
}
export function encryptJson(obj) {
    return encrypt(JSON.stringify(obj));
}
export function decryptJson(ciphertext) {
    return JSON.parse(decrypt(ciphertext));
}
//# sourceMappingURL=crypto.js.map