import { ChatMessage, ConversationLog } from '../shared/types';
import { SecureDatabase } from '../shared/database';
import { DataAnonymizer } from '../shared/security/encryption';
import moment from 'moment-timezone';

interface UserInformation {
  name?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string; // YYYY-MM-DD format
  preferredService?: string;
  preferredDate?: string;
  preferredTime?: string;
  specialRequirements?: string;
  lastUpdated: Date;
  dateValidationIssue?: {
    original: string;
    correctedDate: string;
    correctDay: string;
  };
  // NEW: Track valid appointment IDs found in this session for cancellation validation
  validAppointmentIds?: string[];
  lastAppointmentSearch?: Date;
  patientId?: string; // NEW: Patient ID for reschedule operations
  
  // 🚨 CRITICAL: Operation tracking to prevent hallucinated success responses
  operationStatus?: {
    lastRescheduleAttempt?: {
      appointmentId: string;
      newDate: string;
      newTime: string;
      status: 'pending' | 'success' | 'failed';
      timestamp: Date;
    };
    lastCancellationAttempt?: {
      appointmentId: string;
      status: 'pending' | 'success' | 'failed';
      timestamp: Date;
    };
    lastBookingAttempt?: {
      status: 'pending' | 'success' | 'failed';
      timestamp: Date;
      appointmentId?: string;
    };
  };
}

interface ConversationMetadata {
  startedAt: Date;
  lastActivity: Date;
  userConsent: boolean;
  retentionExpiry: Date;
  clinicId: string;
  approvedForLearning?: boolean; // NEW: Manual approval flag
  qualityRating?: 'excellent' | 'good' | 'poor'; // NEW: Optional quality rating
  approvedAt?: Date; // NEW: When it was approved
}

export class ConversationManager {
  private conversations: Map<string, ChatMessage[]> = new Map();
  private conversationMetadata: Map<string, ConversationMetadata> = new Map();
  private userInformation: Map<string, UserInformation> = new Map(); // Sticky note for user details
  private database: SecureDatabase;

  constructor(database: SecureDatabase) {
    this.database = database;
    // Cleanup expired conversations every hour
    setInterval(() => {
      this.cleanupExpiredConversations();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Extract and store user information from message content
   */
  private extractUserInformation(sessionId: string, message: string, role: 'user' | 'assistant' | 'system'): void {
    // Only extract information from user and assistant messages
    if (role === 'system') return;
    
    const currentInfo = this.userInformation.get(sessionId) || { lastUpdated: new Date() };
    let updated = false;

    const lowerMessage = message.toLowerCase();

    // Extract name patterns
    const namePatterns = [
      /my name is ([a-zA-Z\s]+)/i,
      /i'm ([a-zA-Z\s]+)/i,
      /this is ([a-zA-Z\s]+)/i,
      /name:\s*([a-zA-Z\s]+)/i
    ];

    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && match[1] && match[1].trim().length > 1) {
        const extractedName = match[1].trim();
        // Validate it's a reasonable name (not just "a" or single letters)
        if (extractedName.length > 2 && /^[a-zA-Z\s]+$/.test(extractedName)) {
          currentInfo.name = extractedName;
          updated = true;
          console.log(`📝 [Memory] Extracted name: ${extractedName}`);
        }
      }
    }

    // Extract phone patterns
    const phonePatterns = [
      /phone.*?(?:is|:)?\s*([0-9\s\-\(\)]{8,})/i,
      /number.*?(?:is|:)?\s*([0-9\s\-\(\)]{8,})/i,
      /call.*?(?:me)?.*?(?:at|on)?\s*([0-9\s\-\(\)]{8,})/i,
      /([0-9]{3}[-\s]?[0-9]{3}[-\s]?[0-9]{4})/
    ];

    for (const pattern of phonePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const phone = match[1].replace(/[^\d]/g, ''); // Remove non-digits for validation
        if (phone.length >= 8 && phone.length <= 15) { // Reasonable phone number length
          currentInfo.phone = match[1].trim();
          updated = true;
          console.log(`📝 [Memory] Extracted phone: ${currentInfo.phone}`);
        }
      }
    }

    // Extract email patterns
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    const emailMatch = message.match(emailPattern);
    if (emailMatch && emailMatch[1]) {
      currentInfo.email = emailMatch[1];
      updated = true;
      console.log(`📝 [Memory] Extracted email: ${currentInfo.email}`);
    }

    // Extract date of birth patterns - COMPREHENSIVE FORMAT SUPPORT
    const dobPatterns = [
      // Standard formats with context - MUST have DOB/birth context words
      /(?:born|birth|dob|date of birth).*?(\d{4}-\d{2}-\d{2})/i,
      /(?:born|birth|dob|date of birth).*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
      /(?:born|birth|dob|date of birth).*?(\d{1,2}-\d{1,2}-\d{4})/i,
      
      // AMERICAN FORMAT: Month Day, Year (September 18th 2001, March 3rd 1995)
      /(?:born|birth|dob|date of birth).*?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i,
      /(?:born|birth|dob|date of birth).*?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i,
      
      // EUROPEAN FORMAT: Day Month Year (18th September 2001, 3 March 1995)
      /(?:born|birth|dob|date of birth).*?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      /(?:born|birth|dob|date of birth).*?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      /(?:born|birth|dob|date of birth).*?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i,
      
      // DIRECT MENTIONS (without context words) - catch dates mentioned anywhere in conversation
      // BUT ONLY for birth years (1900-2010 range to avoid future appointment dates)
      // American format with birth year validation
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(19\d{2}|200\d|201\d)/i,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(19\d{2}|200\d|201\d)/i,
      
      // European format with birth year validation
      /(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19\d{2}|200\d|201\d)/i,
      /(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(19\d{2}|200\d|201\d)/i,
      /(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(19\d{2}|200\d|201\d)/i,
      
      // YYYY-MM-DD format BUT ONLY for birth years and WITH additional context validation
      /(19\d{2}|200\d|201\d)-(\d{2})-(\d{2})/
    ];

    for (const pattern of dobPatterns) {
      const match = message.match(pattern);
      if (match) {
        let dobString = '';
        
        // Handle different format types based on match groups
        if (match.length >= 4 && match[1] && match[2] && match[3]) {
          // Check if this is American format (month first) or European format (day first)
          const isAmericanFormat = this.isAmericanDateFormat(match[1]);
          
          if (isAmericanFormat) {
            // American format: Month Day Year (e.g., "September 18th 2001")
            const monthName = match[1].toLowerCase();
            const day = match[2].padStart(2, '0');
            const year = match[3];
            
            const month = this.getMonthNumber(monthName);
            if (month) {
              dobString = `${year}-${month}-${day}`;
            }
          } else {
            // European format: Day Month Year (e.g., "18th September 2001")
            const day = match[1].padStart(2, '0');
            const monthName = match[2].toLowerCase();
            const year = match[3];
            
            const month = this.getMonthNumber(monthName);
            if (month) {
              dobString = `${year}-${month}-${day}`;
            }
          }
        } else if (match.length === 4 && match[1] && match[2] && match[3]) {
          // Handle YYYY-MM-DD format with birth year validation: (19\d{2}|200\d|201\d)-(\d{2})-(\d{2})
          const year = match[1];
          const month = match[2].padStart(2, '0');
          const day = match[3].padStart(2, '0');
          dobString = `${year}-${month}-${day}`;
        } else if (match[1]) {
          // Handle other formats (like YYYY-MM-DD, MM/DD/YYYY)
          dobString = match[1];
          
          // Convert various date formats to YYYY-MM-DD
          if (dobString.includes('/')) {
            const parts = dobString.split('/');
            if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
              const month = parts[0].padStart(2, '0');
              const day = parts[1].padStart(2, '0');
              const year = parts[2];
              dobString = `${year}-${month}-${day}`;
            }
          } else if (dobString.match(/\d{1,2}-\d{1,2}-\d{4}/)) {
            const parts = dobString.split('-');
            if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
              const month = parts[0].padStart(2, '0');
              const day = parts[1].padStart(2, '0');
              const year = parts[2];
              dobString = `${year}-${month}-${day}`;
            }
          }
        }
        
        // Validate the date and ensure it's a reasonable birth date
        if (dobString) {
          const date = new Date(dobString);
          const currentYear = new Date().getFullYear();
          const birthYear = date.getFullYear();
          
          if (!isNaN(date.getTime()) && 
              date.toISOString().split('T')[0] === dobString && 
              date <= new Date() &&
              birthYear >= 1900 && 
              birthYear <= currentYear &&
              birthYear <= 2015) { // Reasonable max birth year for patients
            currentInfo.dateOfBirth = dobString;
            updated = true;
            console.log(`📝 [Memory] Extracted date of birth: ${currentInfo.dateOfBirth}`);
            break; // Found a valid date, stop searching
          } else {
            console.log(`🚫 [Memory] Rejected potential DOB: ${dobString} (failed validation)`);
          }
        }
      }
    }

    // Extract service preferences
    const servicePatterns = [
      /(?:want|need|book|schedule).*?(standard appointment|first appointment)/i,
      /(?:looking for|interested in).*?(standard appointment|first appointment)/i
    ];

    for (const pattern of servicePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        currentInfo.preferredService = match[1];
        updated = true;
        console.log(`📝 [Memory] Extracted service preference: ${currentInfo.preferredService}`);
      }
    }

    // Extract date/time preferences
    const timePatterns = [
      /(?:at|around|prefer|want).*?(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i,
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
    ];

    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Convert time to 24-hour format
        const timeStr = match[1].replace(/\s/g, '').toLowerCase();
        const time24 = this.convertTo24HourFormat(timeStr);
        if (time24) {
          currentInfo.preferredTime = time24;
          updated = true;
          console.log(`📝 [Memory] Extracted and converted time preference: ${currentInfo.preferredTime}`);
        }
      }
    }

    const datePatterns = [
      /tomorrow/i,
      /next week/i,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, // Bare day names FIRST
      /(?:on|for)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
      /(\d{4}-\d{2}-\d{2})/
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        const dateRef = match[1] || match[0];
        
        // Use enhanced date parsing with day validation
        const dateResult = this.convertDateWithDayValidation(dateRef);
        
        if (dateResult.date) {
          // Validate that appointment dates are not in the past
          const appointmentDate = new Date(dateResult.date);
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
          
          if (appointmentDate >= today) {
            currentInfo.preferredDate = dateResult.date;
            updated = true;
            console.log(`📝 [Memory] Extracted appointment date: ${currentInfo.preferredDate}`);
            
            if (dateResult.dayMismatch && dateResult.correctDay) {
              console.log(`⚠️ [Memory] Date-day mismatch detected! User said "${dateRef}" but ${dateResult.date} is actually a ${dateResult.correctDay}`);
              // Store this for potential correction by the LLM
              currentInfo.dateValidationIssue = {
                original: dateRef,
                correctedDate: dateResult.date,
                correctDay: dateResult.correctDay
              };
            }
          } else {
            console.log(`🚫 [Memory] Rejected appointment date: ${dateResult.date} (date is in the past)`);
          }
        } else {
          // Fallback to old method if new method fails
          const convertedDate = this.convertToISODate(dateRef);
          if (convertedDate) {
            // Validate that appointment dates are not in the past
            const appointmentDate = new Date(convertedDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (appointmentDate >= today) {
              currentInfo.preferredDate = convertedDate;
              updated = true;
              console.log(`📝 [Memory] Extracted appointment date (fallback): ${currentInfo.preferredDate}`);
            } else {
              console.log(`🚫 [Memory] Rejected appointment date (fallback): ${convertedDate} (date is in the past)`);
            }
          }
        }
      }
    }

    if (updated) {
      currentInfo.lastUpdated = new Date();
      this.userInformation.set(sessionId, currentInfo);
      console.log(`📝 [Memory] Updated user information for session ${sessionId}:`, currentInfo);
    }
  }

  /**
   * Get accumulated user information for a session
   */
  getUserInformation(sessionId: string): UserInformation | null {
    return this.userInformation.get(sessionId) || null;
  }

  /**
   * Get a summary of gathered user information for LLM context
   */
  getUserInformationSummary(sessionId: string): string {
    const info = this.userInformation.get(sessionId);
    if (!info) return '';

    const parts: string[] = [];
    
    if (info.name) parts.push(`Name: ${info.name}`);
    if (info.phone) parts.push(`Phone: ${info.phone}`);
    if (info.email) parts.push(`Email: ${info.email}`);
    if (info.dateOfBirth) parts.push(`Date of Birth: ${info.dateOfBirth} (YYYY-MM-DD format)`);
    if (info.preferredService) parts.push(`Preferred Service: ${info.preferredService}`);
    if (info.preferredDate) parts.push(`Preferred Date: ${info.preferredDate}`);
    if (info.preferredTime) parts.push(`Preferred Time: ${info.preferredTime}`);
    if (info.specialRequirements) parts.push(`Special Requirements: ${info.specialRequirements}`);

    // Add date validation issues if present
    if (info.dateValidationIssue) {
      parts.push(`❗ DATE CORRECTION NEEDED: Customer said "${info.dateValidationIssue.original}" but ${info.dateValidationIssue.correctedDate} is actually a ${info.dateValidationIssue.correctDay}. Please gently correct this.`);
    }

    if (parts.length === 0) return '';

    return `\n--- GATHERED USER INFORMATION ---\n${parts.join('\n')}\n--- END USER INFO ---\n`;
  }

  /**
   * Get conversation history for a session, loading from database if not in memory
   */
  async getConversation(sessionId: string, clinicId?: string): Promise<ChatMessage[]> {
    let conversation = this.conversations.get(sessionId);
    
    // If not in memory, try loading from database
    if (!conversation && clinicId) {
      const loadedConversation = await this.loadConversationFromDatabase(sessionId, clinicId);
      if (loadedConversation) {
        conversation = loadedConversation;
        this.conversations.set(sessionId, conversation);
      }
    }
    
    if (!conversation) {
      conversation = [];
      this.conversations.set(sessionId, conversation);
    }
    
    // Update last activity
    const metadata = this.conversationMetadata.get(sessionId);
    if (metadata) {
      metadata.lastActivity = new Date();
    }

    return conversation;
  }

  /**
   * Get conversation context optimized for long conversations
   * Uses intelligent context management instead of just taking last N messages
   */
  async getConversationContext(sessionId: string, clinicId?: string, maxMessages: number = 50): Promise<ChatMessage[]> {
    const fullConversation = await this.getConversation(sessionId, clinicId);
    
    if (fullConversation.length <= maxMessages) {
      return fullConversation;
    }

    // For long conversations, use smart context selection:
    // 1. Always include the first few messages (context establishment)
    // 2. Include recent messages (prioritized)
    // 3. Include messages with important information (appointments, bookings, etc.)
    
    const contextMessages: ChatMessage[] = [];
    
    // Include first 5 messages for context establishment
    contextMessages.push(...fullConversation.slice(0, 5));
    
    // Find important messages (containing function calls or key information)
    const importantMessages = fullConversation.filter(msg => 
      (msg.functionCalls && msg.functionCalls.length > 0) ||
      this.containsImportantKeywords(msg.content)
    ).slice(-10); // Last 10 important messages
    
    // Add important messages (avoid duplicates)
    for (const msg of importantMessages) {
      if (!contextMessages.find(existing => existing.id === msg.id)) {
        contextMessages.push(msg);
      }
    }
    
    // Fill remaining slots with recent messages (prioritize the most recent)
    const remainingSlots = maxMessages - contextMessages.length;
    if (remainingSlots > 0) {
      const recentMessages = fullConversation.slice(-remainingSlots);
      for (const msg of recentMessages) {
        if (!contextMessages.find(existing => existing.id === msg.id)) {
          contextMessages.push(msg);
        }
      }
    }
    
    // Sort by timestamp to maintain conversation flow
    return contextMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Load conversation from database
   */
  private async loadConversationFromDatabase(sessionId: string, clinicId: string): Promise<ChatMessage[] | null> {
    try {
      const conversationLog = await this.database.getConversation(sessionId, clinicId);
      
      if (!conversationLog) return null;

      // Restore metadata
      this.conversationMetadata.set(sessionId, {
        startedAt: conversationLog.startedAt,
        lastActivity: new Date(),
        userConsent: conversationLog.userConsent,
        retentionExpiry: conversationLog.retentionExpiry,
        clinicId: conversationLog.clinicId
      });

      return conversationLog.messages;
    } catch (error) {
      console.error('Error loading conversation from database:', error);
      return null;
    }
  }

  /**
   * Check if message content contains important keywords for context retention
   */
  private containsImportantKeywords(content: string): boolean {
    const importantKeywords = [
      'appointment', 'booking', 'schedule', 'available', 'time', 'date',
      'phone', 'email', 'name', 'contact', 'address', 'symptom', 'pain',
      'medication', 'treatment', 'emergency', 'urgent', 'cancel', 'reschedule'
    ];
    
    const lowerContent = content.toLowerCase();
    return importantKeywords.some(keyword => lowerContent.includes(keyword));
  }

  /**
   * Add a message to the conversation with information extraction
   * NOTE: Conversations are kept in memory only until manually approved for learning
   */
  async addMessage(sessionId: string, message: ChatMessage, clinicId?: string): Promise<void> {
    // Extract user information from the message
    this.extractUserInformation(sessionId, message.content, message.role);

    // Get or create conversation
    let conversation = this.conversations.get(sessionId) || [];
    let metadata = this.conversationMetadata.get(sessionId);

    // Initialize metadata if new conversation
    if (!metadata) {
      metadata = {
        startedAt: new Date(),
        lastActivity: new Date(),
        userConsent: false, // Default to false, set explicitly when needed
        retentionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        clinicId: clinicId || '',
        approvedForLearning: false // NEW: Default to not approved
      };
      this.conversationMetadata.set(sessionId, metadata);
    }

    // Add message to conversation
    conversation.push(message);
    this.conversations.set(sessionId, conversation);

    // Update last activity
    metadata.lastActivity = new Date();

    // CHANGED: Do NOT automatically persist to database
    // Conversations stay in memory until manually approved for learning
    
    // For very long conversations (>500 messages), we still need to manage memory
    // but only persist if approved
    if (conversation.length > 500) {
      // Keep last 300 messages in memory, rest get discarded unless approved
      const messagesToKeep = conversation.slice(-300);
      this.conversations.set(sessionId, messagesToKeep);
      
      // Only persist if this conversation is approved for learning
      if (metadata.approvedForLearning && clinicId) {
        await this.persistConversationToDatabase(sessionId, clinicId || metadata.clinicId);
      }
    }
  }

  /**
   * Persist conversation to database
   */
  private async persistConversationToDatabase(sessionId: string, clinicId: string): Promise<void> {
    try {
      const conversation = this.conversations.get(sessionId);
      const metadata = this.conversationMetadata.get(sessionId);
      
      if (!conversation || !metadata) return;

      const conversationLog: Partial<ConversationLog> = {
        id: `${sessionId}_${Date.now()}`, // Unique ID for each save
        clinicId,
        sessionId,
        messages: conversation,
        startedAt: metadata.startedAt,
        userConsent: metadata.userConsent,
        anonymized: false,
        retentionExpiry: metadata.retentionExpiry
      };
      // endedAt is omitted since conversation is still active

      // Use upsert to update existing conversation
      await this.database.upsertConversation(conversationLog as ConversationLog);

    } catch (error) {
      console.error('Error persisting conversation to database:', error);
    }
  }

  /**
   * Set user consent for conversation logging
   */
  async setUserConsent(sessionId: string, consent: boolean): Promise<void> {
    let metadata = this.conversationMetadata.get(sessionId);
    
    if (!metadata) {
      metadata = {
        startedAt: new Date(),
        lastActivity: new Date(),
        userConsent: consent,
        retentionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clinicId: this.conversationMetadata.get(sessionId)?.clinicId || ''
      };
      this.conversationMetadata.set(sessionId, metadata);
    } else {
      metadata.userConsent = consent;
    }

    // If consent is revoked, anonymize the conversation immediately
    if (!consent) {
      await this.anonymizeConversation(sessionId);
    }
  }

  /**
   * Get conversation metadata
   */
  async getConversationMetadata(sessionId: string): Promise<any> {
    return this.conversationMetadata.get(sessionId) || null;
  }

  /**
   * Anonymize a conversation (remove PII)
   */
  async anonymizeConversation(sessionId: string): Promise<void> {
    const conversation = this.conversations.get(sessionId);
    if (!conversation) return;

    const anonymizedConversation = conversation.map(message => ({
      ...message,
      content: DataAnonymizer.anonymizeText(message.content),
      containsPII: false
    }));

    this.conversations.set(sessionId, anonymizedConversation);

    // Update metadata
    const metadata = this.conversationMetadata.get(sessionId);
    if (metadata) {
      metadata.userConsent = false;
    }
  }

  /**
   * Delete a conversation entirely
   */
  async deleteConversation(sessionId: string): Promise<void> {
    this.conversations.delete(sessionId);
    this.conversationMetadata.delete(sessionId);
    this.userInformation.delete(sessionId); // Also delete user information
  }

  /**
   * Get conversation as ConversationLog format for database storage
   */
  async getConversationLog(sessionId: string): Promise<ConversationLog | null> {
    const conversation = this.conversations.get(sessionId);
    const metadata = this.conversationMetadata.get(sessionId);

    if (!conversation || !metadata) return null;

    const log: Partial<ConversationLog> = {
      id: DataAnonymizer.generateAnonymousSessionId(),
      clinicId: metadata.clinicId || '', // Will be set by caller
      sessionId,
      messages: conversation,
      startedAt: metadata.startedAt,
      userConsent: metadata.userConsent,
      anonymized: false,
      retentionExpiry: metadata.retentionExpiry
    };
    // endedAt is omitted since conversation is still active

    return log as ConversationLog;
  }

  /**
   * Set conversation retention period
   */
  async setRetentionPeriod(sessionId: string, days: number): Promise<void> {
    const metadata = this.conversationMetadata.get(sessionId);
    if (metadata) {
      metadata.retentionExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Check if conversation contains PII
   */
  async containsPII(sessionId: string): Promise<boolean> {
    const conversation = this.conversations.get(sessionId);
    if (!conversation) return false;

    return conversation.some(message => message.containsPII);
  }

  /**
   * Get all active sessions (for monitoring)
   */
  async getActiveSessions(): Promise<Array<{
    sessionId: string;
    startedAt: Date;
    lastActivity: Date;
    messageCount: number;
    userConsent: boolean;
    containsPII: boolean;
  }>> {
    const sessions: Array<any> = [];

    for (const [sessionId, metadata] of this.conversationMetadata.entries()) {
      const conversation = this.conversations.get(sessionId) || [];
      const containsPII = conversation.some(msg => msg.containsPII);

      sessions.push({
        sessionId,
        startedAt: metadata.startedAt,
        lastActivity: metadata.lastActivity,
        messageCount: conversation.length,
        userConsent: metadata.userConsent,
        containsPII
      });
    }

    return sessions;
  }

  /**
   * Cleanup expired conversations (GDPR compliance)
   */
  private async cleanupExpiredConversations(): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    for (const [sessionId, metadata] of this.conversationMetadata.entries()) {
      // Check if conversation has expired
      if (metadata.retentionExpiry < now) {
        expiredSessions.push(sessionId);
        continue;
      }

      // Check if conversation is inactive for too long (24 hours)
      const inactiveThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (metadata.lastActivity < inactiveThreshold) {
        // If no user consent and contains PII, delete immediately
        const conversation = this.conversations.get(sessionId);
        const containsPII = conversation?.some(msg => msg.containsPII) || false;
        
        if (!metadata.userConsent && containsPII) {
          expiredSessions.push(sessionId);
          continue;
        }

        // Otherwise, anonymize after 7 days of inactivity
        const anonymizeThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (metadata.lastActivity < anonymizeThreshold && containsPII) {
          await this.anonymizeConversation(sessionId);
        }
      }
    }

    // Delete expired conversations
    for (const sessionId of expiredSessions) {
      await this.deleteConversation(sessionId);
    }

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired conversations`);
    }
  }

  /**
   * Get conversation statistics
   */
  async getStatistics(): Promise<{
    totalConversations: number;
    activeConversations: number;
    totalMessages: number;
    conversationsWithPII: number;
    conversationsWithConsent: number;
  }> {
    let totalMessages = 0;
    let conversationsWithPII = 0;
    let conversationsWithConsent = 0;

    for (const [sessionId, metadata] of this.conversationMetadata.entries()) {
      const conversation = this.conversations.get(sessionId) || [];
      totalMessages += conversation.length;

      if (conversation.some(msg => msg.containsPII)) {
        conversationsWithPII++;
      }

      if (metadata.userConsent) {
        conversationsWithConsent++;
      }
    }

    // Consider active if last activity within 1 hour
    const activeThreshold = new Date(Date.now() - 60 * 60 * 1000);
    const activeConversations = Array.from(this.conversationMetadata.values())
      .filter(metadata => metadata.lastActivity > activeThreshold).length;

    return {
      totalConversations: this.conversationMetadata.size,
      activeConversations,
      totalMessages,
      conversationsWithPII,
      conversationsWithConsent
    };
  }

  /**
   * Export conversation data (for GDPR data portability)
   */
  async exportConversationData(sessionId: string): Promise<any> {
    const conversation = this.conversations.get(sessionId);
    const metadata = this.conversationMetadata.get(sessionId);

    if (!conversation || !metadata) {
      return null;
    }

    return {
      sessionId,
      metadata: {
        startedAt: metadata.startedAt.toISOString(),
        lastActivity: metadata.lastActivity.toISOString(),
        userConsent: metadata.userConsent,
        retentionExpiry: metadata.retentionExpiry.toISOString()
      },
      messages: conversation.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        containsPII: msg.containsPII
      })),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Convert time from 12-hour format (e.g., "11am", "2:30pm") to 24-hour format (e.g., "11:00", "14:30")
   * ENHANCED to handle many different time formats
   */
  private convertTo24HourFormat(timeStr: string): string | null {
    try {
      // Clean the input
      const cleanTime = timeStr.trim().toLowerCase().replace(/\s+/g, '');
      
      // Handle various time formats
      const timeFormats = [
        'h:mma',           // 2:30pm
        'ha',              // 2pm
        'h:mm a',          // 2:30 pm
        'h a',             // 2 pm
        'HH:mm',           // 14:30 (already 24-hour)
        'H:mm',            // 9:30 (24-hour single digit)
        'HH',              // 14 (just hour, 24-hour)
        'H',               // 9 (just hour, 24-hour)
        'hmma',            // 230pm (no colon)
        'hha'              // 2pm (alternative)
      ];
      
      // Try parsing with different formats
      for (const format of timeFormats) {
        const time = moment(cleanTime, format, true);
        if (time.isValid()) {
          return time.format('HH:mm');
        }
      }
      
      // Handle special cases like "noon", "midnight"
      if (cleanTime.includes('noon') || cleanTime === '12pm') {
        return '12:00';
      }
      if (cleanTime.includes('midnight') || cleanTime === '12am') {
        return '00:00';
      }
      
      // Handle "quarter past", "half past", etc.
      const specialTimePatterns = [
        { pattern: /quarter\s*past\s*(\d{1,2})/i, offset: 15 },
        { pattern: /half\s*past\s*(\d{1,2})/i, offset: 30 },
        { pattern: /quarter\s*to\s*(\d{1,2})/i, offset: -15 }
      ];
      
      for (const { pattern, offset } of specialTimePatterns) {
        const match = timeStr.match(pattern);
        if (match && match[1]) {
          const hour = parseInt(match[1]);
          const adjustedHour = offset < 0 ? hour : hour;
          const minutes = offset < 0 ? 60 + offset : offset;
          const time = moment().hour(adjustedHour).minute(minutes);
          return time.format('HH:mm');
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to convert time: ${timeStr}`, error);
      return null;
    }
  }

  /**
   * Convert natural language dates to YYYY-MM-DD format
   * ENHANCED to handle many different date formats and edge cases
   */
  private convertToISODate(dateRef: string): string | null {
    try {
      const today = moment();
      const lowerDateRef = dateRef.toLowerCase().trim();
      
      // Handle relative dates
      if (lowerDateRef === 'tomorrow') {
        return today.clone().add(1, 'day').format('YYYY-MM-DD');
      }
      
      if (lowerDateRef === 'today') {
        return today.format('YYYY-MM-DD');
      }
      
      if (lowerDateRef === 'next week') {
        return today.clone().add(1, 'week').format('YYYY-MM-DD');
      }
      
      if (lowerDateRef === 'this week' || lowerDateRef === 'later this week') {
        return today.clone().add(3, 'days').format('YYYY-MM-DD');
      }
      
      // Handle "next [day]" and "this [day]"
      const nextDayMatch = lowerDateRef.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
      if (nextDayMatch && nextDayMatch[1]) {
        const dayName = nextDayMatch[1];
        const todayDayOfWeek = today.day(); // 0 = Sunday, 1 = Monday, etc.
        const targetDayOfWeek = moment().day(dayName).day(); // Get numeric day of week for target
        
        // Calculate next occurrence of this day
        let daysUntilTarget = targetDayOfWeek - todayDayOfWeek;
        
        // If it's the same day or already passed this week, go to next week
        if (daysUntilTarget <= 0) {
          daysUntilTarget += 7;
        }
        
        const targetDay = today.clone().add(daysUntilTarget, 'days');
        return targetDay.format('YYYY-MM-DD');
      }
      
      const thisDayMatch = lowerDateRef.match(/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
      if (thisDayMatch && thisDayMatch[1]) {
        const dayName = thisDayMatch[1];
        const todayDayOfWeek = today.day(); 
        const targetDayOfWeek = moment().day(dayName).day();
        
        // Calculate this week's occurrence
        let daysUntilTarget = targetDayOfWeek - todayDayOfWeek;
        
        // If it's already passed this week, go to next week
        if (daysUntilTarget < 0) {
          daysUntilTarget += 7;
        } else if (daysUntilTarget === 0) {
          // If it's today, use today unless it's very late in the day
          const currentHour = today.hour();
          if (currentHour >= 18) { // After 6 PM, assume they mean next week
            daysUntilTarget = 7;
          }
        }
        
        const targetDay = today.clone().add(daysUntilTarget, 'days');
        return targetDay.format('YYYY-MM-DD');
      }
      
      // Handle day names (e.g., "monday", "friday") - assume next occurrence
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (dayNames.includes(lowerDateRef)) {
        const todayDayOfWeek = today.day(); 
        const targetDayOfWeek = moment().day(lowerDateRef).day();
        
        // Calculate next occurrence of this day
        let daysUntilTarget = targetDayOfWeek - todayDayOfWeek;
        
        // If it's the same day, assume they mean next week (since they're booking ahead)
        // If it's already passed this week, go to next week
        if (daysUntilTarget <= 0) {
          daysUntilTarget += 7;
        }
        
        const targetDay = today.clone().add(daysUntilTarget, 'days');
        return targetDay.format('YYYY-MM-DD');
      }
      
      // Handle relative time periods
      const relativePatterns = [
        { pattern: /in\s+(\d+)\s+days?/i, unit: 'days' },
        { pattern: /in\s+(\d+)\s+weeks?/i, unit: 'weeks' },
        { pattern: /in\s+a\s+week/i, amount: 1, unit: 'week' },
        { pattern: /in\s+(\d+)\s+months?/i, unit: 'months' }
      ];
      
      for (const { pattern, unit, amount } of relativePatterns) {
        const match = lowerDateRef.match(pattern);
        if (match && match[1]) {
          const num = amount || parseInt(match[1]);
          return today.clone().add(num, unit as any).format('YYYY-MM-DD');
        }
      }
      
      // Handle date formats like "12/25/2024" or "25/12/2024"
      if (dateRef.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
        // Try both US format (MM/DD/YYYY) and European format (DD/MM/YYYY)
        const usDate = moment(dateRef, 'MM/DD/YYYY', true);
        const euroDate = moment(dateRef, 'DD/MM/YYYY', true);
        
        // Prefer US format if both are valid and different
        if (usDate.isValid()) {
          return usDate.format('YYYY-MM-DD');
        } else if (euroDate.isValid()) {
          return euroDate.format('YYYY-MM-DD');
        }
      }
      
      // Handle ISO format dates
      if (dateRef.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const date = moment(dateRef, 'YYYY-MM-DD', true);
        if (date.isValid()) {
          return dateRef; // Already in correct format
        }
      }
      
      // Handle natural language dates with flexible parsing
      const naturalDate = moment(dateRef, [
        'MMMM Do YYYY',     // September 18th 2001
        'MMMM D, YYYY',     // September 18, 2001
        'MMM Do YYYY',      // Sep 18th 2001
        'MMM D, YYYY',      // Sep 18, 2001
        'Do MMMM YYYY',     // 18th September 2001
        'D MMMM YYYY',      // 18 September 2001
        'Do MMM YYYY',      // 18th Sep 2001
        'D MMM YYYY'        // 18 Sep 2001
      ], true);
      
      if (naturalDate.isValid()) {
        return naturalDate.format('YYYY-MM-DD');
      }
      
      return null;
    } catch (error) {
      console.warn(`Failed to convert date: ${dateRef}`, error);
      return null;
    }
  }

  /**
   * Check if the first captured group represents a month name (American format)
   */
  private isAmericanDateFormat(firstGroup: string): boolean {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ];
    return monthNames.includes(firstGroup.toLowerCase());
  }

  /**
   * Convert month name to MM format
   */
  private getMonthNumber(monthName: string): string | null {
    const monthMap: { [key: string]: string } = {
      'january': '01', 'jan': '01',
      'february': '02', 'feb': '02',
      'march': '03', 'mar': '03',
      'april': '04', 'apr': '04',
      'may': '05',
      'june': '06', 'jun': '06',
      'july': '07', 'jul': '07',
      'august': '08', 'aug': '08',
      'september': '09', 'sep': '09',
      'october': '10', 'oct': '10',
      'november': '11', 'nov': '11',
      'december': '12', 'dec': '12'
    };
    
    return monthMap[monthName.toLowerCase()] || null;
  }

  /**
   * Check if the first captured group represents a month name (American format)
   */
  private isMonthFirst(dateStr: string): boolean {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    const parts = dateStr.toLowerCase().split(/[\s\/\-\.]+/);
    return parts.length > 0 && !!parts[0] && monthNames.includes(parts[0]);
  }

  /**
   * Enhanced date parsing that handles day-date combinations
   * Examples: "Tuesday August 5th", "Monday, January 15th", "Wed Jan 20"
   */
  convertDateWithDayValidation(dateRef: string): { date: string | null; dayMismatch?: boolean; correctDay?: string } {
    try {
      const lowerDateRef = dateRef.toLowerCase().trim();
      
      // Check for day-date combinations like "Tuesday August 5th"
      const dayDatePattern = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+(.+)$/i;
      const match = dateRef.match(dayDatePattern);
      
      if (match && match[1] && match[2]) {
        const specifiedDay = match[1].toLowerCase();
        const datePartial = match[2].trim();
        
        // Try to parse the date part
        const parsedDate = this.convertToISODate(datePartial);
        
        if (parsedDate) {
          const momentDate = moment(parsedDate, 'YYYY-MM-DD');
          const actualDay = momentDate.format('dddd').toLowerCase();
          
          if (actualDay === specifiedDay) {
            // Perfect match
            return { date: parsedDate };
          } else {
            // Day mismatch - return the parsed date but flag the issue
            return { 
              date: parsedDate, 
              dayMismatch: true, 
              correctDay: momentDate.format('dddd')
            };
          }
        }
      }
      
      // Fallback to regular date parsing
      const regularDate = this.convertToISODate(dateRef);
      return { date: regularDate };
      
    } catch (error) {
      console.warn(`Failed to parse date with day validation: ${dateRef}`, error);
      return { date: null };
    }
  }

  /**
   * Get all conversation sessions pending approval (in memory but not approved)
   * 
   * SESSION-LEVEL APPROACH: Each session represents a complete conversation flow
   * that will be rated as a whole unit for learning purposes.
   */
  getPendingApprovalConversations(): Array<{sessionId: string, metadata: ConversationMetadata, messageCount: number, lastMessage?: string}> {
    const pending: Array<{sessionId: string, metadata: ConversationMetadata, messageCount: number, lastMessage?: string}> = [];
    
    for (const [sessionId, metadata] of this.conversationMetadata.entries()) {
      if (!metadata.approvedForLearning) {
        const conversation = this.conversations.get(sessionId) || [];
        const lastMsg = conversation.length > 0 ? conversation[conversation.length - 1] : undefined;
        const lastMessage = lastMsg?.content?.substring(0, 100) + (lastMsg?.content && lastMsg.content.length > 100 ? '...' : '');
        
        pending.push({
          sessionId,
          metadata,
          messageCount: conversation.length,
          lastMessage
        });
      }
    }
    
    return pending.sort((a, b) => b.metadata.lastActivity.getTime() - a.metadata.lastActivity.getTime());
  }

  /**
   * Get full conversation session content for review
   * 
   * This allows reviewing the ENTIRE conversation flow before deciding
   * whether to approve the session for learning.
   */
  getConversationForReview(sessionId: string): {conversation: ChatMessage[], metadata: ConversationMetadata} | null {
    const conversation = this.conversations.get(sessionId);
    const metadata = this.conversationMetadata.get(sessionId);
    
    if (!conversation || !metadata) {
      return null;
    }
    
    return { conversation, metadata };
  }

  /**
   * Approve a complete conversation session for learning and persist to database
   * 
   * SESSION-LEVEL LEARNING: The entire conversation (all messages) becomes 
   * training data to teach the LLM complete interaction patterns.
   * 
   * @param sessionId - The session to approve
   * @param qualityRating - Quality rating for the entire session
   */
  async approveConversationForLearning(
    sessionId: string, 
    qualityRating: 'excellent' | 'good' | 'poor' = 'good'
  ): Promise<boolean> {
    const metadata = this.conversationMetadata.get(sessionId);
    const conversation = this.conversations.get(sessionId);
    
    if (!metadata || !conversation) {
      console.error(`Cannot approve session ${sessionId}: not found`);
      return false;
    }
    
    // Mark entire session as approved
    metadata.approvedForLearning = true;
    metadata.qualityRating = qualityRating;
    metadata.approvedAt = new Date();
    
    // Persist entire conversation session to database for learning
    try {
      await this.persistConversationToDatabase(sessionId, metadata.clinicId);
      console.log(`✅ Session ${sessionId} approved for learning (${qualityRating}) - ${conversation.length} messages stored`);
      return true;
    } catch (error) {
      console.error(`Failed to persist approved session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Reject a conversation session (remove from memory, will not be used for learning)
   * 
   * SESSION-LEVEL REJECTION: The entire conversation is discarded and will never
   * be used as training data.
   */
  rejectConversation(sessionId: string): boolean {
    const metadata = this.conversationMetadata.get(sessionId);
    const conversation = this.conversations.get(sessionId);
    
    if (!metadata || !conversation) {
      return false;
    }
    
    const messageCount = conversation.length;
    
    // Remove entire session from memory
    this.conversations.delete(sessionId);
    this.conversationMetadata.delete(sessionId);
    this.userInformation.delete(sessionId);
    
    console.log(`❌ Session ${sessionId} rejected and removed from memory (${messageCount} messages discarded)`);
    
    return true;
  }
  
  /**
   * Store valid appointment IDs found during search operations for session-specific validation
   */
  storeValidAppointmentIds(sessionId: string, appointmentIds: string[]): void {
    let userInfo = this.userInformation.get(sessionId);
    
    if (!userInfo) {
      userInfo = {
        lastUpdated: new Date(),
        validAppointmentIds: appointmentIds,
        lastAppointmentSearch: new Date()
      };
    } else {
      userInfo.validAppointmentIds = appointmentIds;
      userInfo.lastAppointmentSearch = new Date();
      userInfo.lastUpdated = new Date();
    }
    
    this.userInformation.set(sessionId, userInfo);
    
    console.log(`🔐 [ConversationManager] Stored ${appointmentIds.length} valid appointment IDs for session ${sessionId}:`, appointmentIds);
  }

  /**
   * Store patient ID for session (used for reschedule operations)
   */
  storePatientId(sessionId: string, patientId: string): void {
    let userInfo = this.userInformation.get(sessionId);
    
    if (!userInfo) {
      userInfo = {
        lastUpdated: new Date(),
        patientId: patientId
      };
    } else {
      userInfo.patientId = patientId;
      userInfo.lastUpdated = new Date();
    }
    
    this.userInformation.set(sessionId, userInfo);
    
    console.log(`🔐 [ConversationManager] Stored patient ID for session ${sessionId}:`, patientId);
  }

  /**
   * Get patient ID for session
   */
  getPatientId(sessionId: string): string | undefined {
    const userInfo = this.userInformation.get(sessionId);
    return userInfo?.patientId;
  }
  
  /**
   * Validate if an appointment ID is valid for the current session
   */
  isValidAppointmentIdForSession(sessionId: string, appointmentId: string): boolean {
    const userInfo = this.userInformation.get(sessionId);
    
    if (!userInfo || !userInfo.validAppointmentIds) {
      console.warn(`⚠️ [ConversationManager] No valid appointment IDs found for session ${sessionId}`);
      return false;
    }
    
    const isValid = userInfo.validAppointmentIds.includes(appointmentId);
    
    if (isValid) {
      console.log(`✅ [ConversationManager] Appointment ID ${appointmentId} is valid for session ${sessionId}`);
    } else {
      console.error(`🚨 [ConversationManager] CRITICAL: Appointment ID ${appointmentId} is NOT valid for session ${sessionId}`);
      console.error(`🚨 [ConversationManager] Valid IDs for this session:`, userInfo.validAppointmentIds);
    }
    
    return isValid;
  }
  
  /**
   * Get valid appointment IDs for debugging purposes
   */
  getValidAppointmentIds(sessionId: string): string[] {
    const userInfo = this.userInformation.get(sessionId);
    return userInfo?.validAppointmentIds || [];
  }
  
  /**
   * 🚨 CRITICAL: Track reschedule operation status to prevent hallucinated success
   */
  trackRescheduleOperation(sessionId: string, appointmentId: string, newDate: string, newTime: string, status: 'pending' | 'success' | 'failed'): void {
    const userInfo = this.userInformation.get(sessionId) || { lastUpdated: new Date() };
    
    if (!userInfo.operationStatus) {
      userInfo.operationStatus = {};
    }
    
    userInfo.operationStatus.lastRescheduleAttempt = {
      appointmentId,
      newDate,
      newTime,
      status,
      timestamp: new Date()
    };
    
    userInfo.lastUpdated = new Date();
    this.userInformation.set(sessionId, userInfo);
    
    console.log(`📊 [ConversationManager] Tracked reschedule operation: ${status} for appointment ${appointmentId}`);
  }
  
  /**
   * 🚨 CRITICAL: Track cancellation operation status to prevent hallucinated success
   */
  trackCancellationOperation(sessionId: string, appointmentId: string, status: 'pending' | 'success' | 'failed'): void {
    const userInfo = this.userInformation.get(sessionId) || { lastUpdated: new Date() };
    
    if (!userInfo.operationStatus) {
      userInfo.operationStatus = {};
    }
    
    userInfo.operationStatus.lastCancellationAttempt = {
      appointmentId,
      status,
      timestamp: new Date()
    };
    
    userInfo.lastUpdated = new Date();
    this.userInformation.set(sessionId, userInfo);
    
    console.log(`📊 [ConversationManager] Tracked cancellation operation: ${status} for appointment ${appointmentId}`);
  }
  
  /**
   * 🚨 CRITICAL: Track booking operation status to prevent hallucinated success
   */
  trackBookingOperation(sessionId: string, status: 'pending' | 'success' | 'failed', appointmentId?: string): void {
    const userInfo = this.userInformation.get(sessionId) || { lastUpdated: new Date() };
    
    if (!userInfo.operationStatus) {
      userInfo.operationStatus = {};
    }
    
    userInfo.operationStatus.lastBookingAttempt = {
      status,
      timestamp: new Date(),
      ...(appointmentId && { appointmentId })
    };
    
    userInfo.lastUpdated = new Date();
    this.userInformation.set(sessionId, userInfo);
    
    console.log(`📊 [ConversationManager] Tracked booking operation: ${status}${appointmentId ? ` (ID: ${appointmentId})` : ''}`);
  }
  
  /**
   * 🚨 CRITICAL: Get last reschedule operation status
   */
  getLastRescheduleStatus(sessionId: string): { status: 'pending' | 'success' | 'failed'; timestamp: Date } | null {
    const userInfo = this.userInformation.get(sessionId);
    return userInfo?.operationStatus?.lastRescheduleAttempt ? {
      status: userInfo.operationStatus.lastRescheduleAttempt.status,
      timestamp: userInfo.operationStatus.lastRescheduleAttempt.timestamp
    } : null;
  }
  
  /**
   * 🚨 CRITICAL: Get last cancellation operation status
   */
  getLastCancellationStatus(sessionId: string): { status: 'pending' | 'success' | 'failed'; timestamp: Date } | null {
    const userInfo = this.userInformation.get(sessionId);
    return userInfo?.operationStatus?.lastCancellationAttempt ? {
      status: userInfo.operationStatus.lastCancellationAttempt.status,
      timestamp: userInfo.operationStatus.lastCancellationAttempt.timestamp
    } : null;
  }
  
  /**
   * 🚨 CRITICAL: Get last booking operation status
   */
  getLastBookingStatus(sessionId: string): { status: 'pending' | 'success' | 'failed'; timestamp: Date } | null {
    const userInfo = this.userInformation.get(sessionId);
    return userInfo?.operationStatus?.lastBookingAttempt ? {
      status: userInfo.operationStatus.lastBookingAttempt.status,
      timestamp: userInfo.operationStatus.lastBookingAttempt.timestamp
    } : null;
  }
} 