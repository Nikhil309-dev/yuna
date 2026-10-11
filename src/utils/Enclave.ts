import crypto from 'node:crypto';
import { config } from '#config/config';

export class Enclave {

  static encrypt(plaintext: string, secretKey: string = config.token || 'yuna-default-secret-key-32chars!!'): string {
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    return `${iv.toString('base64')}:${authTag}:${encrypted}`;
  }

  static decrypt(encryptedPayload: string, secretKey: string = config.token || 'yuna-default-secret-key-32chars!!'): string {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format.');
    }

    const [ivB64, authTagB64, ciphertextB64] = parts;
    const key = crypto.createHash('sha256').update(secretKey).digest();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export default Enclave;

// Made by Nikhil Under CodeX Devs
