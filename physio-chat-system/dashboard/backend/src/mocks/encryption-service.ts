/**
 * Mock Encryption Service
 * Temporary implementation for development/testing
 */

export class EncryptionService {
  constructor(_masterPassword: string) {
    console.log('🔒 Mock EncryptionService initialized');
  }

  async encrypt(data: string): Promise<string> {
    // Mock encryption - just base64 encode for development
    return Buffer.from(data).toString('base64');
  }

  async decrypt(encryptedData: string): Promise<string> {
    // Mock decryption - just base64 decode for development
    return Buffer.from(encryptedData, 'base64').toString('utf8');
  }

  hash(data: string): string {
    // Mock hashing - simple hash for development
    return `hash_${data.length}_${Date.now()}`;
  }

  generateSalt(): string {
    return `salt_${Math.random().toString(36).substring(2, 15)}`;
  }
} 