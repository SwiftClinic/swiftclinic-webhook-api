import crypto from 'crypto';
import { EncryptedCredentials } from '../types';

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly TAG_LENGTH = 16; // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits

  private masterKey: Buffer;
  private saltHex: string;

  constructor(masterPassword: string, salt?: string) {
    const saltBuffer = salt ? Buffer.from(salt, 'hex') : crypto.randomBytes(EncryptionService.SALT_LENGTH);
    this.saltHex = salt ? salt : saltBuffer.toString('hex');
    this.masterKey = crypto.pbkdf2Sync(
      masterPassword,
      saltBuffer,
      100000,
      EncryptionService.KEY_LENGTH,
      'sha512'
    );
  }

  /**
   * Encrypt sensitive data with AES-256-GCM
   * Returns base64-encoded encrypted data with IV and auth tag
   */
  encrypt(plaintext: string): EncryptedCredentials {
    try {
      const iv = crypto.randomBytes(EncryptionService.IV_LENGTH);
      const cipher = crypto.createCipheriv(EncryptionService.ALGORITHM, this.masterKey, iv);
      cipher.setAAD(Buffer.from('physio-chat-system', 'utf8'));

      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const authTag = cipher.getAuthTag();

      return {
        data: encrypted,
        iv: iv.toString('base64'),
        tag: authTag.toString('base64'),
        salt: this.saltHex
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: EncryptedCredentials): string {
    try {
      // If the record carries its own salt, derive a key using that salt to avoid MASTER_PASSWORD salt drift issues
      if (encryptedData.salt) {
        const derived = crypto.pbkdf2Sync(
          process.env.MASTER_PASSWORD || '',
          Buffer.from(encryptedData.salt, 'hex'),
          100000,
          EncryptionService.KEY_LENGTH,
          'sha512'
        );
        this.masterKey = derived;
        this.saltHex = encryptedData.salt;
      }
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.tag, 'base64');
      const decipher = crypto.createDecipheriv(EncryptionService.ALGORITHM, this.masterKey, iv);
      
      decipher.setAAD(Buffer.from('physio-chat-system', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData.data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  /**
   * Generate secure random tokens for webhook URLs and session IDs
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash data for integrity verification (used for knowledge base documents)
   */
  static generateChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate a secure master key from password
   */
  static deriveMasterKey(password: string, salt: string): string {
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    return key.toString('hex');
  }

  /**
   * Validate password strength for master password
   */
  static validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * GDPR-compliant data anonymization utilities
 */
export class DataAnonymizer {
  
  /**
   * Remove or hash personally identifiable information from text
   */
  static anonymizeText(text: string): string {
    // Remove email addresses
    text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
    
    // Remove phone numbers (various formats)
    text = text.replace(/(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g, '[PHONE]');
    
    // Remove potential names (simple heuristic - improve based on needs)
    text = text.replace(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g, '[NAME]');
    
    // Remove potential addresses (basic pattern)
    text = text.replace(/\d+\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Way|Place|Pl)\b/gi, '[ADDRESS]');
    
    return text;
  }

  /**
   * Check if text contains potential PII
   */
  static containsPII(text: string): boolean {
    const piiPatterns = [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
      /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/, // Phone
      /\b\d{3}-?\d{2}-?\d{4}\b/, // SSN pattern
      /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/ // Potential names
    ];

    return piiPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Generate anonymized session ID that can't be traced back
   */
  static generateAnonymousSessionId(): string {
    return crypto.randomUUID();
  }
} 