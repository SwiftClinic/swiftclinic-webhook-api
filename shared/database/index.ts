import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { ClinicConfig, ConversationLog, GDPRSettings } from '../types';
import { EncryptionService, DataAnonymizer } from '../security/encryption';

export class SecureDatabase {
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  private encryptionService: EncryptionService;

  constructor(private dbPath: string, masterPassword: string) {
    this.encryptionService = new EncryptionService(masterPassword);
  }

  /**
   * Initialize database with GDPR-compliant schema
   */
  async initialize(): Promise<void> {
    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    // Enable WAL mode for better performance and concurrent access
    await this.db.exec('PRAGMA journal_mode = WAL');
    await this.db.exec('PRAGMA synchronous = NORMAL');
    await this.db.exec('PRAGMA temp_store = MEMORY');
    await this.db.exec('PRAGMA mmap_size = 268435456'); // 256MB

    await this.createTables();
    await this.setupGDPRCompliance();
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Clinics table with encrypted sensitive data
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS clinics (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_email TEXT,
        contact_phone TEXT,
        contact_address TEXT,
        business_hours TEXT,
        services TEXT,
        booking_system TEXT NOT NULL,
        encrypted_credentials TEXT NOT NULL,
        webhook_url TEXT UNIQUE NOT NULL,
        timezone TEXT, -- IANA timezone identifier
        gdpr_settings TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Knowledge base documents
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('pdf', 'text', 'webpage')),
        checksum TEXT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
      )
    `);

    // FAQs
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS faqs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
      )
    `);

    // Conversation logs with GDPR compliance
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_logs (
        id TEXT PRIMARY KEY,
        clinic_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        messages TEXT NOT NULL, -- JSON array of messages
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        user_consent BOOLEAN NOT NULL DEFAULT 0,
        anonymized BOOLEAN DEFAULT 0,
        retention_expiry DATETIME NOT NULL,
        contains_pii BOOLEAN DEFAULT 0,
        FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
      )
    `);

    // GDPR audit log
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS gdpr_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL CHECK (action IN ('data_access', 'data_deletion', 'data_export', 'consent_granted', 'consent_revoked')),
        clinic_id TEXT,
        session_id TEXT,
        user_identifier TEXT, -- email or phone (hashed)
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT, -- JSON with additional info
        ip_address TEXT
      )
    `);

    // Create indexes for performance
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_clinics_webhook ON clinics(webhook_url)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_clinic ON conversation_logs(clinic_id)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversation_logs(session_id)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_expiry ON conversation_logs(retention_expiry)');
    await this.db.exec('CREATE INDEX IF NOT EXISTS idx_knowledge_clinic ON knowledge_documents(clinic_id)');
  }

  private async setupGDPRCompliance(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Create trigger to update updated_at timestamp
    await this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_clinics_timestamp 
      AFTER UPDATE ON clinics 
      BEGIN 
        UPDATE clinics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  }

  /**
   * Create a new clinic configuration (simplified for testing)
   */
  async createClinic(config: Omit<ClinicConfig, 'id' | 'webhookUrl' | 'createdAt' | 'updatedAt'>): Promise<ClinicConfig> {
    if (!this.db) throw new Error('Database not initialized');

    const id = EncryptionService.generateSecureToken(16);
    const webhookUrl = `webhook_${EncryptionService.generateSecureToken(32)}`;
    
    console.log(`[DB] Creating clinic with ID: ${id}, webhook: ${webhookUrl}`);

    // For testing: store credentials as plain JSON (not encrypted)
    const credentialsJson = JSON.stringify(config.apiCredentials);

    const clinic: ClinicConfig = {
      ...config,
      id,
      webhookUrl,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.db.run(`
      INSERT INTO clinics (
        id, name, contact_email, contact_phone, contact_address,
        business_hours, services, booking_system, encrypted_credentials,
        webhook_url, timezone, gdpr_settings, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      clinic.id,
      clinic.name,
      clinic.contactInfo.email,
      clinic.contactInfo.phone,
      clinic.contactInfo.address,
      JSON.stringify(clinic.businessHours),
      JSON.stringify(clinic.services),
      clinic.bookingSystem,
      credentialsJson,  // Store as plain JSON for testing
      clinic.webhookUrl,
      clinic.timezone || 'UTC', // Store timezone from business API
      JSON.stringify(clinic.gdprSettings),
      clinic.isActive ? 1 : 0
    ]);

    console.log(`[DB] Clinic created successfully: ${clinic.id}`);
    return clinic;
  }

  /**
   * Get clinic by webhook URL (simplified for testing)
   */
  async getClinicByWebhook(webhookUrl: string): Promise<ClinicConfig | null> {
    if (!this.db) throw new Error('Database not initialized');

    console.log(`[DB DEBUG] Looking for webhook: ${webhookUrl}`);
    
    const row = await this.db.get(`
      SELECT * FROM clinics WHERE webhook_url = ? AND is_active = 1
    `, [webhookUrl]);

    if (!row) {
      console.log(`[DB DEBUG] No clinic found for webhook: ${webhookUrl}`);
      return null;
    }

    console.log(`[DB DEBUG] Found clinic: ${row.name} (ID: ${row.id})`);

    try {
      // For testing: read credentials as plain JSON (not encrypted)
      const apiCredentials = JSON.parse(row.encrypted_credentials);
      console.log(`[DB DEBUG] Loaded credentials for shard: ${apiCredentials.shard}`);

      return {
        id: row.id,
        name: row.name,
        contactInfo: {
          email: row.contact_email,
          phone: row.contact_phone,
          address: row.contact_address
        },
        businessHours: JSON.parse(row.business_hours),
        services: JSON.parse(row.services),
        bookingSystem: row.booking_system,
        apiCredentials: apiCredentials, // Use the correct variable name
        knowledgeBase: await this.getKnowledgeBase(row.id),
        webhookUrl: row.webhook_url,
        timezone: row.timezone || 'UTC', // Load timezone from database
        gdprSettings: JSON.parse(row.gdpr_settings),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        isActive: Boolean(row.is_active)
      };
    } catch (error) {
      console.error(`[DB DEBUG] Error loading clinic:`, error);
      throw error;
    }
  }

  /**
   * Get all clinics for dashboard
   */
  async getAllClinics(): Promise<ClinicConfig[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(`
      SELECT * FROM clinics WHERE is_active = 1 ORDER BY created_at DESC
    `);

    const clinics: ClinicConfig[] = [];
    
    for (const row of rows) {
      // For testing: read credentials as plain JSON (not encrypted)
      const apiCredentials = JSON.parse(row.encrypted_credentials);

      clinics.push({
        id: row.id,
        name: row.name,
        contactInfo: {
          email: row.contact_email,
          phone: row.contact_phone,
          address: row.contact_address
        },
        businessHours: JSON.parse(row.business_hours),
        services: JSON.parse(row.services),
        bookingSystem: row.booking_system,
        apiCredentials: apiCredentials, // Use plain JSON for testing
        knowledgeBase: await this.getKnowledgeBase(row.id),
        webhookUrl: row.webhook_url,
        timezone: row.timezone || 'UTC', // Load timezone from database
        gdprSettings: JSON.parse(row.gdpr_settings),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        isActive: Boolean(row.is_active)
      });
    }

    return clinics;
  }

  /**
   * Store conversation with GDPR compliance
   */
  async storeConversation(log: ConversationLog): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if messages contain PII
    const containsPII = log.messages.some(msg => (DataAnonymizer as any).containsPII(msg.content));

    await this.db.run(`
      INSERT INTO conversation_logs (
        id, clinic_id, session_id, messages, started_at, ended_at,
        user_consent, anonymized, retention_expiry, contains_pii
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      log.id,
      log.clinicId,
      log.sessionId,
      JSON.stringify(log.messages),
      log.startedAt.toISOString(),
      log.endedAt?.toISOString() || null,
      log.userConsent ? 1 : 0,
      log.anonymized ? 1 : 0,
      log.retentionExpiry.toISOString(),
      containsPII ? 1 : 0
    ]);
  }

  /**
   * Retrieve conversation from database
   */
  async getConversation(sessionId: string, clinicId: string): Promise<ConversationLog | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.get(`
        SELECT * FROM conversation_logs 
        WHERE session_id = ? AND clinic_id = ?
        ORDER BY started_at DESC 
        LIMIT 1
      `, [sessionId, clinicId]);

      if (!result) return null;

      return {
        id: result.id,
        clinicId: result.clinic_id,
        sessionId: result.session_id,
        messages: JSON.parse(result.messages),
        startedAt: new Date(result.started_at),
        endedAt: result.ended_at ? new Date(result.ended_at) : undefined,
        userConsent: result.user_consent === 1,
        anonymized: result.anonymized === 1,
        retentionExpiry: new Date(result.retention_expiry)
      } as ConversationLog;
    } catch (error) {
      console.error('Error retrieving conversation:', error);
      return null;
    }
  }

  /**
   * Update existing conversation or insert new one
   */
  async upsertConversation(log: ConversationLog): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if messages contain PII
    const containsPII = log.messages.some(msg => (DataAnonymizer as any).containsPII(msg.content));

    await this.db.run(`
      INSERT OR REPLACE INTO conversation_logs (
        id, clinic_id, session_id, messages, started_at, ended_at,
        user_consent, anonymized, retention_expiry, contains_pii
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      log.id,
      log.clinicId,
      log.sessionId,
      JSON.stringify(log.messages),
      log.startedAt.toISOString(),
      log.endedAt?.toISOString() || null,
      log.userConsent ? 1 : 0,
      log.anonymized ? 1 : 0,
      log.retentionExpiry.toISOString(),
      containsPII ? 1 : 0
    ]);
  }

  /**
   * GDPR compliance: Automatically delete expired data
   */
  async performGDPRCleanup(): Promise<{ deletedConversations: number; anonymizedConversations: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();

    // Delete expired conversations
    const deleteResult = await this.db.run(`
      DELETE FROM conversation_logs 
      WHERE retention_expiry < ? OR (user_consent = 0 AND contains_pii = 1)
    `, [now]);

    // Anonymize conversations that are close to expiry but still within retention period
    const anonymizeThreshold = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now
    
    const toAnonymize = await this.db.all(`
      SELECT id, messages FROM conversation_logs 
      WHERE retention_expiry < ? AND retention_expiry >= ? AND anonymized = 0 AND contains_pii = 1
    `, [anonymizeThreshold, now]);

    let anonymizedCount = 0;
    for (const row of toAnonymize) {
      const messages = JSON.parse(row.messages);
      const anonymizedMessages = messages.map((msg: any) => ({
        ...msg,
        content: (DataAnonymizer as any).anonymizeText(msg.content),
        containsPII: false
      }));

      await this.db.run(`
        UPDATE conversation_logs 
        SET messages = ?, anonymized = 1, contains_pii = 0 
        WHERE id = ?
      `, [JSON.stringify(anonymizedMessages), row.id]);

      anonymizedCount++;
    }

    return {
      deletedConversations: deleteResult.changes || 0,
      anonymizedConversations: anonymizedCount
    };
  }

  private async getKnowledgeBase(clinicId: string) {
    if (!this.db) throw new Error('Database not initialized');

    const documents = await this.db.all(`
      SELECT * FROM knowledge_documents WHERE clinic_id = ?
    `, [clinicId]);

    const faqs = await this.db.all(`
      SELECT * FROM faqs WHERE clinic_id = ? AND is_active = 1
    `, [clinicId]);

    return {
      id: `kb_${clinicId}`,
      clinicId: clinicId,
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.name, // Map name to title
        content: doc.content,
        category: doc.type, // Map type to category
        lastUpdated: doc.uploadedAt
      })),
      faqs: faqs.map(faq => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        priority: 1 // Default priority
      })),
      policies: [],
      lastUpdated: new Date()
    };
  }

  /**
   * Get all active FAQs across all clinics (for sync purposes)
   */
  async getAllActiveFAQs(): Promise<Array<{
    id: string;
    clinic_id: string;
    question: string;
    answer: string;
    category: string;
    is_active: boolean;
    created_at: string;
  }>> {
    if (!this.db) throw new Error('Database not initialized');

    const faqs = await this.db.all(`
      SELECT * FROM faqs 
      WHERE is_active = 1 
      ORDER BY clinic_id, category, created_at
    `);

    return faqs as Array<{
      id: string;
      clinic_id: string;
      question: string;
      answer: string;
      category: string;
      is_active: boolean;
      created_at: string;
    }>;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
} 