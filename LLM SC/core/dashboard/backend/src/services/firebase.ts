import * as admin from 'firebase-admin';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import { EncryptionService } from '../../../../shared/security/encryption';
import { ClinicConfig, ConversationLog, APIResponse } from '../../../../shared/types';

export interface FirebaseClinic {
  id: string;
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  businessHours?: any;
  services?: string[];
  bookingSystem: string;
  encryptedCredentials: string;
  webhookUrl: string;
  timezone?: string;
  gdprSettings?: any;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FirebaseKnowledgeDocument {
  id: string;
  clinicId: string;
  name: string;
  content: string;
  type: 'pdf' | 'text' | 'webpage';
  checksum: string;
  uploadedAt: Timestamp;
}

export interface FirebaseWebhook {
  id: string;
  clinicId: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: Timestamp;
  lastTriggered?: Timestamp;
}

export interface FirebaseAnalytics {
  id: string;
  clinicId: string;
  date: string; // YYYY-MM-DD
  totalConversations: number;
  totalBookings: number;
  avgResponseTime: number;
  clientSatisfaction: number;
  createdAt: Timestamp;
}

export class FirebaseService {
  private db: Firestore;
  private encryptionService: EncryptionService;

  constructor(
    serviceAccountPath: string,
    masterPassword: string
  ) {
    // Initialize Firebase Admin SDK
    const serviceAccount = require(serviceAccountPath);
    
    // Check if Firebase is already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    }

    this.db = getFirestore();
    this.encryptionService = new EncryptionService(masterPassword);
  }

  // ===================================================================
  // CLINIC MANAGEMENT
  // ===================================================================

  async createClinic(clinicData: Partial<FirebaseClinic>): Promise<string> {
    try {
      const clinicRef = this.db.collection('clinics').doc();
      const now = Timestamp.now();
      
      const clinic: FirebaseClinic = {
        id: clinicRef.id,
        name: clinicData.name || '',
        contactEmail: clinicData.contactEmail,
        contactPhone: clinicData.contactPhone,
        contactAddress: clinicData.contactAddress,
        businessHours: clinicData.businessHours,
        services: clinicData.services || [],
        bookingSystem: clinicData.bookingSystem || 'cliniko',
        encryptedCredentials: clinicData.encryptedCredentials || '',
        webhookUrl: clinicData.webhookUrl || '',
        timezone: clinicData.timezone,
        gdprSettings: clinicData.gdprSettings,
        isActive: clinicData.isActive ?? true,
        createdAt: now,
        updatedAt: now
      };

      await clinicRef.set(clinic);
      return clinicRef.id;
    } catch (error) {
      throw new Error(`Failed to create clinic: ${error}`);
    }
  }

  async getClinics(): Promise<FirebaseClinic[]> {
    try {
      const snapshot = await this.db.collection('clinics')
        .where('isActive', '==', true)
        .orderBy('createdAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => doc.data() as FirebaseClinic);
    } catch (error) {
      throw new Error(`Failed to fetch clinics: ${error}`);
    }
  }

  async getClinicById(clinicId: string): Promise<FirebaseClinic | null> {
    try {
      const doc = await this.db.collection('clinics').doc(clinicId).get();
      return doc.exists ? doc.data() as FirebaseClinic : null;
    } catch (error) {
      throw new Error(`Failed to fetch clinic: ${error}`);
    }
  }

  async updateClinic(clinicId: string, updates: Partial<FirebaseClinic>): Promise<void> {
    try {
      await this.db.collection('clinics').doc(clinicId).update({
        ...updates,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw new Error(`Failed to update clinic: ${error}`);
    }
  }

  async deleteClinic(clinicId: string): Promise<void> {
    try {
      await this.db.collection('clinics').doc(clinicId).update({
        isActive: false,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      throw new Error(`Failed to delete clinic: ${error}`);
    }
  }

  // ===================================================================
  // KNOWLEDGE BASE MANAGEMENT
  // ===================================================================

  async uploadDocument(documentData: Omit<FirebaseKnowledgeDocument, 'id' | 'uploadedAt'>): Promise<string> {
    try {
      const docRef = this.db.collection('knowledge_documents').doc();
      const document: FirebaseKnowledgeDocument = {
        id: docRef.id,
        ...documentData,
        uploadedAt: Timestamp.now()
      };

      await docRef.set(document);
      return docRef.id;
    } catch (error) {
      throw new Error(`Failed to upload document: ${error}`);
    }
  }

  async getDocuments(clinicId: string): Promise<FirebaseKnowledgeDocument[]> {
    try {
      const snapshot = await this.db.collection('knowledge_documents')
        .where('clinicId', '==', clinicId)
        .orderBy('uploadedAt', 'desc')
        .get();
      
      return snapshot.docs.map(doc => doc.data() as FirebaseKnowledgeDocument);
    } catch (error) {
      throw new Error(`Failed to fetch documents: ${error}`);
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    try {
      await this.db.collection('knowledge_documents').doc(documentId).delete();
    } catch (error) {
      throw new Error(`Failed to delete document: ${error}`);
    }
  }

  // ===================================================================
  // WEBHOOK MANAGEMENT
  // ===================================================================

  async createWebhook(webhookData: Omit<FirebaseWebhook, 'id' | 'createdAt'>): Promise<string> {
    try {
      const webhookRef = this.db.collection('webhooks').doc();
      const webhook: FirebaseWebhook = {
        id: webhookRef.id,
        ...webhookData,
        createdAt: Timestamp.now()
      };

      await webhookRef.set(webhook);
      return webhookRef.id;
    } catch (error) {
      throw new Error(`Failed to create webhook: ${error}`);
    }
  }

  async getWebhooks(clinicId?: string): Promise<FirebaseWebhook[]> {
    try {
      let query = this.db.collection('webhooks').where('isActive', '==', true);
      
      if (clinicId) {
        query = query.where('clinicId', '==', clinicId);
      }
      
      const snapshot = await query.orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(doc => doc.data() as FirebaseWebhook);
    } catch (error) {
      throw new Error(`Failed to fetch webhooks: ${error}`);
    }
  }

  async updateWebhookLastTriggered(webhookId: string): Promise<void> {
    try {
      await this.db.collection('webhooks').doc(webhookId).update({
        lastTriggered: Timestamp.now()
      });
    } catch (error) {
      throw new Error(`Failed to update webhook: ${error}`);
    }
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    try {
      await this.db.collection('webhooks').doc(webhookId).update({
        isActive: false
      });
    } catch (error) {
      throw new Error(`Failed to delete webhook: ${error}`);
    }
  }

  // ===================================================================
  // ANALYTICS
  // ===================================================================

  async recordAnalytics(analyticsData: Omit<FirebaseAnalytics, 'id' | 'createdAt'>): Promise<string> {
    try {
      const analyticsRef = this.db.collection('analytics').doc();
      const analytics: FirebaseAnalytics = {
        id: analyticsRef.id,
        ...analyticsData,
        createdAt: Timestamp.now()
      };

      await analyticsRef.set(analytics);
      return analyticsRef.id;
    } catch (error) {
      throw new Error(`Failed to record analytics: ${error}`);
    }
  }

  async getAnalytics(clinicId?: string, startDate?: string, endDate?: string): Promise<FirebaseAnalytics[]> {
    try {
      let query: any = this.db.collection('analytics');
      
      if (clinicId) {
        query = query.where('clinicId', '==', clinicId);
      }
      
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }
      
      const snapshot = await query.orderBy('date', 'desc').get();
      return snapshot.docs.map((doc: any) => doc.data() as FirebaseAnalytics);
    } catch (error) {
      throw new Error(`Failed to fetch analytics: ${error}`);
    }
  }

  // ===================================================================
  // DASHBOARD STATS
  // ===================================================================

  async getDashboardStats(): Promise<{
    totalClinics: number;
    activeWebhooks: number;
    documentsUploaded: number;
    monthlyConversations: number;
  }> {
    try {
      const [clinicsSnapshot, webhooksSnapshot, documentsSnapshot, analyticsSnapshot] = await Promise.all([
        this.db.collection('clinics').where('isActive', '==', true).get(),
        this.db.collection('webhooks').where('isActive', '==', true).get(),
        this.db.collection('knowledge_documents').get(),
        this.db.collection('analytics').get()
      ]);

      // Calculate monthly conversations from analytics
      const monthlyConversations = analyticsSnapshot.docs
        .map(doc => doc.data() as FirebaseAnalytics)
        .reduce((sum, analytics) => sum + (analytics.totalConversations || 0), 0);

      return {
        totalClinics: clinicsSnapshot.size,
        activeWebhooks: webhooksSnapshot.size,
        documentsUploaded: documentsSnapshot.size,
        monthlyConversations
      };
    } catch (error) {
      throw new Error(`Failed to fetch dashboard stats: ${error}`);
    }
  }

  // ===================================================================
  // UTILITY METHODS
  // ===================================================================

  async healthCheck(): Promise<boolean> {
    try {
      await this.db.collection('health').doc('check').set({
        timestamp: Timestamp.now(),
        status: 'healthy'
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async close(): Promise<void> {
    // Firebase Admin SDK doesn't require explicit closing
    // Resources are automatically managed
  }
} 