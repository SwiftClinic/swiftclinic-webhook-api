import { ChatMessage } from '../../../shared/types';
import moment from 'moment-timezone';

/**
 * Intelligent Context Manager - Fixes conversation flow issues
 * 
 * This module solves critical problems:
 * 1. Date confusion between birth dates and appointment dates
 * 2. Lost context when user references previously offered slots
 * 3. Poor conversation flow and reference resolution
 */

export interface ConversationOffer {
  type: 'availability' | 'appointment_details' | 'service_options';
  offeredAt: Date;
  details: {
    date?: string;           // YYYY-MM-DD
    time?: string;           // HH:MM
    slots?: Array<{
      date: string;
      time: string;
      displayTime: string;
      practitioner?: string;
      service?: string;
    }>;
    services?: string[];
    appointmentId?: string;
  };
  context: string; // What was offered in natural language
}

export interface UserReference {
  message: string;
  timestamp: Date;
  extracted: {
    timeReference?: string;      // "9:30", "2pm", etc.
    dateReference?: string;      // "tomorrow", "Friday", etc.
    serviceReference?: string;   // Service name
    confirmed?: boolean;         // "yes", "that works", etc.
  };
  resolvedTo?: {
    date: string;
    time: string;
    source: 'previous_offer' | 'new_request';
  };
}

export interface IntelligentContext {
  sessionId: string;
  recentOffers: ConversationOffer[];
  userReferences: UserReference[];
  lastUpdated: Date;
}

export class IntelligentContextManager {
  private contexts: Map<string, IntelligentContext> = new Map();

  /**
   * Record what was offered to the user
   */
  recordOffer(sessionId: string, offer: ConversationOffer): void {
    const context = this.getOrCreateContext(sessionId);
    
    // Keep only last 5 offers to prevent memory bloat
    context.recentOffers.unshift(offer);
    if (context.recentOffers.length > 5) {
      context.recentOffers = context.recentOffers.slice(0, 5);
    }
    
    context.lastUpdated = new Date();
    console.log(`🧠 [IntelligentContext] Recorded offer for session ${sessionId}:`, {
      type: offer.type,
      date: offer.details.date,
      time: offer.details.time,
      slotsCount: offer.details.slots?.length
    });
  }

  /**
   * Intelligently resolve user references using conversation context
   */
  resolveUserReference(sessionId: string, userMessage: string): UserReference {
    const context = this.getOrCreateContext(sessionId);
    
    const reference: UserReference = {
      message: userMessage,
      timestamp: new Date(),
      extracted: this.extractReferences(userMessage)
    };

    // Try to resolve the reference using recent offers
    if (reference.extracted.timeReference && !reference.extracted.dateReference) {
      // User mentioned a time without a date - likely referring to previously offered slots
      const resolved = this.resolveTimeReference(
        reference.extracted.timeReference, 
        context.recentOffers
      );
      
      if (resolved) {
        reference.resolvedTo = {
          ...resolved,
          source: 'previous_offer'
        };
        console.log(`🎯 [IntelligentContext] Resolved "${reference.extracted.timeReference}" to ${resolved.date} at ${resolved.time} from previous offer`);
      }
    }

    // Store the reference
    context.userReferences.unshift(reference);
    if (context.userReferences.length > 10) {
      context.userReferences = context.userReferences.slice(0, 10);
    }

    context.lastUpdated = new Date();
    return reference;
  }

  /**
   * Get the most likely intended date/time based on context
   */
  getIntendedDateTime(sessionId: string): { date?: string; time?: string } | null {
    const context = this.contexts.get(sessionId);
    if (!context) return null;

    const latestReference = context.userReferences[0];
    if (!latestReference) return null;

    if (latestReference.resolvedTo) {
      return {
        date: latestReference.resolvedTo.date,
        time: latestReference.resolvedTo.time
      };
    }

    return null;
  }

  /**
   * Check if a user message is likely referencing a previous offer
   */
  isReferencingPreviousOffer(sessionId: string, userMessage: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context || context.recentOffers.length === 0) return false;

    const lowerMessage = userMessage.toLowerCase();
    
    // Confirmation words that suggest user is responding to an offer
    const confirmationWords = [
      'yes', 'ok', 'okay', 'sure', 'that works', 'sounds good',
      'perfect', 'fine', 'good', 'let\'s do', 'can we do',
      'book that', 'take that', 'i\'ll take'
    ];

    // Time references without explicit dates
    const timeOnlyPattern = /\b(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?\b/i;
    const hasTimeOnly = timeOnlyPattern.test(lowerMessage);

    // Day references that could be from previous offers
    const dayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const hasDayOnly = dayPattern.test(lowerMessage);

    return (
      confirmationWords.some(word => lowerMessage.includes(word)) ||
      (hasTimeOnly && !this.hasExplicitDate(lowerMessage)) ||
      (hasDayOnly && !this.hasExplicitDate(lowerMessage))
    );
  }

  /**
   * Get context summary for LLM prompting
   */
  getContextSummary(sessionId: string): string {
    const context = this.contexts.get(sessionId);
    if (!context || context.recentOffers.length === 0) return '';

    const latestOffer = context.recentOffers[0];
    if (!latestOffer) return '';
    
    const timeSinceOffer = Date.now() - latestOffer.offeredAt.getTime();
    
    // Only include recent offers (within last 10 minutes)
    if (timeSinceOffer > 10 * 60 * 1000) return '';

    let summary = '\n--- RECENT CONVERSATION CONTEXT ---\n';
    
    if (latestOffer.type === 'availability' && latestOffer.details.slots) {
      summary += `I just offered these available times:\n`;
      latestOffer.details.slots.slice(0, 4).forEach(slot => {
        summary += `• ${slot.displayTime} on ${moment(slot.date).format('dddd, MMMM Do')}\n`;
      });
      if (latestOffer.details.slots.length > 4) {
        summary += `• And ${latestOffer.details.slots.length - 4} more times available\n`;
      }
      summary += `\nIf the user mentions a time without a date, they are likely referring to one of these offered slots.\n`;
    } else if (latestOffer.type === 'appointment_details') {
      summary += `I just showed appointment details for: ${latestOffer.details.date} at ${latestOffer.details.time}\n`;
    }

    // Add recent reference resolution
    const latestReference = context.userReferences[0];
    if (latestReference?.resolvedTo && timeSinceOffer < 2 * 60 * 1000) {
      summary += `\nThe user's last message was resolved to: ${latestReference.resolvedTo.date} at ${latestReference.resolvedTo.time}\n`;
    }

    summary += '--- END CONTEXT ---\n';
    return summary;
  }

  private getOrCreateContext(sessionId: string): IntelligentContext {
    let context = this.contexts.get(sessionId);
    if (!context) {
      context = {
        sessionId,
        recentOffers: [],
        userReferences: [],
        lastUpdated: new Date()
      };
      this.contexts.set(sessionId, context);
    }
    return context;
  }

  private extractReferences(message: string): UserReference['extracted'] {
    const lowerMessage = message.toLowerCase();
    const extracted: UserReference['extracted'] = {};

    // Extract time references
    const timePatterns = [
      /\b(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i,
      /\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b/i,
      /\b(\d{1,2}):(\d{2})\b/
    ];

    for (const pattern of timePatterns) {
      const match = message.match(pattern);
      if (match) {
        extracted.timeReference = match[0].trim();
        break;
      }
    }

    // Extract date references
    const datePatterns = [
      /\b(tomorrow|today|next week)\b/i,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
      /\b(\d{4}-\d{2}-\d{2})\b/
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        extracted.dateReference = match[1] || match[0];
        break;
      }
    }

    // Extract confirmation indicators
    const confirmationWords = [
      'yes', 'ok', 'okay', 'sure', 'that works', 'sounds good',
      'perfect', 'fine', 'good', 'let\'s do', 'can we do'
    ];
    
    extracted.confirmed = confirmationWords.some(word => lowerMessage.includes(word));

    return extracted;
  }

  private resolveTimeReference(
    timeRef: string, 
    recentOffers: ConversationOffer[]
  ): { date: string; time: string } | null {
    
    // Find the most recent availability offer
    const availabilityOffer = recentOffers.find(offer => 
      offer.type === 'availability' && offer.details.slots
    );

    if (!availabilityOffer?.details.slots) return null;

    // Normalize the time reference
    const normalizedTime = this.normalizeTimeReference(timeRef);
    if (!normalizedTime) return null;

    // Find matching slot
    const matchingSlot = availabilityOffer.details.slots.find(slot => {
      const slotTime = this.normalizeTimeReference(slot.displayTime);
      return slotTime === normalizedTime;
    });

    if (matchingSlot) {
      return {
        date: matchingSlot.date,
        time: matchingSlot.time
      };
    }

    return null;
  }

  private normalizeTimeReference(timeStr: string): string | null {
    // Convert various time formats to HH:MM
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/i;
    const match = timeStr.match(timePattern);
    
    if (!match || !match[1]) return null;

    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const meridiem = match[3]?.toLowerCase().replace(/\./g, '');

    if (meridiem === 'pm' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private hasExplicitDate(message: string): boolean {
    const explicitDatePatterns = [
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,      // MM/DD/YYYY
      /\b\d{4}-\d{2}-\d{2}\b/,              // YYYY-MM-DD
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i
    ];

    return explicitDatePatterns.some(pattern => pattern.test(message));
  }

  /**
   * Cleanup old contexts (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, context] of this.contexts.entries()) {
      if (now - context.lastUpdated.getTime() > maxAge) {
        this.contexts.delete(sessionId);
        console.log(`🧹 [IntelligentContext] Cleaned up expired context for session ${sessionId}`);
      }
    }
  }
}