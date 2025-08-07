import OpenAI from 'openai';
import moment from 'moment-timezone';
import { SecureDatabase } from '../../../shared/database';
import { ClinicConfig } from '../../../shared/types';
import { BaseBookingAdapter } from '../booking-adapters/base-booking-adapter';
import { ConversationManager } from './conversation-manager';
import { EncryptionService } from '../../../shared/security/encryption';
import { BookingAdapterFactory } from '../booking-adapters/adapter-factory';

export interface FunctionCall {
  name: string;
  parameters: any;
  result: any;
  timestamp: Date;
}

export interface LLMResponse {
  message: string;
  requiresFollowUp: boolean;
  functionCalls: FunctionCall[];
  metadata: {
    intent: string;
    confidence: number;
    context?: any;
    knowledgeContextUsed?: boolean;
  };
}

export interface ChatRequest {
  message: string;
  sessionId: string;
  clinicConfig: ClinicConfig;
  userConsent: boolean;
  metadata?: any;
}

export class LLMBrain {
  private openai: OpenAI;
  private conversationManager: ConversationManager;
  private database: SecureDatabase;

  constructor(database: SecureDatabase) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    this.conversationManager = new ConversationManager(database);
    this.database = database;

    console.log('✅ [LLMBrain] Initialized with simplified knowledge retrieval using official Pinecone pattern');
  }

  // Knowledge retrieval now uses direct Pinecone API calls per request (RAG pattern)

  // NEW: Getter for conversation manager (used by approval endpoints)
  getConversationManager(): ConversationManager {
    return this.conversationManager;
  }

  async processMessage(
    request: ChatRequest, 
    bookingAdapter: BaseBookingAdapter
  ): Promise<LLMResponse> {
    try {
      console.log('🧠 [LLMBrain] Processing message:', request.message);

      // Step 1: Pre-search knowledge base for context augmentation (following RAG pattern from image)
      const knowledgeContext = await this.searchKnowledgeForContext(request.message);

      // Store the current message
      await this.conversationManager.addMessage(request.sessionId, {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: request.message,
        timestamp: new Date(),
        containsPII: false
      }, request.clinicConfig.id);

      // Build conversation history with augmented context
      const conversationHistory = await this.conversationManager.getConversationContext(
        request.sessionId, 
        request.clinicConfig.id, 
        20
      );
      const messages = await this.buildChatMessages(
        request.message, 
        conversationHistory, 
        request.clinicConfig,
        request.sessionId,
        knowledgeContext // Pass knowledge context for prompt augmentation
      );

      // Define available tools (without search_knowledge_base - context is pre-injected)
      const tools = this.defineBookingTools(request.sessionId);

      // Make single LLM call with augmented context
      const completionParams: any = {
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000
      };

      if (tools.length > 0) {
        completionParams.tools = tools;
        completionParams.tool_choice = 'auto';
      }

      const completion = await this.openai.chat.completions.create(completionParams);

      const assistantMessage = completion.choices[0]?.message;
      if (!assistantMessage) {
        throw new Error('No response from OpenAI');
      }

      // Process function calls if any
      const functionCalls: FunctionCall[] = [];
      let finalMessage = assistantMessage.content || 'I apologize, but I encountered an issue processing your request.';

      if (assistantMessage.tool_calls?.length) {
        console.log('🔧 [LLMBrain] Processing function calls:', assistantMessage.tool_calls.length);
        
        for (const toolCall of assistantMessage.tool_calls) {
          try {
            const result = await this.executeToolCall(
              toolCall,
              bookingAdapter,
              request.clinicConfig,
              request.sessionId
            );

            functionCalls.push({
              name: toolCall.function.name,
              parameters: JSON.parse(toolCall.function.arguments),
              result: result,
              timestamp: new Date()
            });
          } catch (error) {
            console.error('❌ [LLMBrain] Function call failed:', error);
            functionCalls.push({
              name: toolCall.function.name,
              parameters: {},
              result: { error: 'Function execution failed' },
              timestamp: new Date()
            });
          }
        }

        // If we have function calls, make a follow-up call to get the final response
        if (functionCalls.length > 0) {
          const followUpMessages = [
            ...messages,
            assistantMessage,
            {
              role: 'tool' as const,
              content: JSON.stringify(functionCalls.map(fc => fc.result)),
              tool_call_id: assistantMessage.tool_calls?.[0]?.id || 'unknown'
            }
          ];

          const followUpCompletion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: followUpMessages,
            temperature: 0.7,
            max_tokens: 2000
          });

          finalMessage = followUpCompletion.choices[0]?.message?.content || finalMessage;
        }
      }

      // Store the assistant's response
      await this.conversationManager.addMessage(request.sessionId, {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: finalMessage,
        timestamp: new Date(),
        containsPII: false
      }, request.clinicConfig.id);

      // Generate response metadata
      const intent = this.detectIntent(request.message, functionCalls);
      const requiresFollowUp = this.requiresFollowUp(intent, functionCalls);

      console.log('✅ [LLMBrain] Message processed successfully');

      return {
        message: finalMessage,
        requiresFollowUp,
        functionCalls,
        metadata: {
          intent: intent.type,
          confidence: intent.confidence,
          context: intent.context,
          knowledgeContextUsed: knowledgeContext.totalResults > 0 // Track if knowledge was used
        }
      };

    } catch (error) {
      console.error('❌ [LLMBrain] Error processing message:', error);
      
      return {
        message: 'I apologize, but I encountered an issue processing your request. Please try again or contact our staff for assistance.',
        requiresFollowUp: false,
        functionCalls: [],
        metadata: {
          intent: 'error',
          confidence: 1.0,
          context: { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      };
    }
  }

  private async buildChatMessages(
    currentMessage: string, 
    conversationHistory: any[], 
    clinicConfig: ClinicConfig,
    sessionId: string,
    knowledgeContext?: any
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
    
    // System prompt with clinic-specific information and gathered user details
    const systemPrompt = await this.buildSystemPrompt(clinicConfig, sessionId);
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history (now using smart context from conversation manager)
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: currentMessage
    });

    // Add knowledge context if available
    if (knowledgeContext && knowledgeContext.totalResults > 0) {
      messages.push({
        role: 'system',
        content: `Knowledge context: ${knowledgeContext.query}\n\n${knowledgeContext.results.map((result: any) => `- ${result.question}\n${result.answer}`).join('\n')}`
      });
    }

    return messages;
  }

  private async buildSystemPrompt(clinicConfig: ClinicConfig, sessionId: string): Promise<string> {
    const businessHoursText = Object.entries(clinicConfig.businessHours)
      .map(([day, hours]) => {
        if (!hours) return `${day}: Closed`;
        return `${day}: ${hours.open} - ${hours.close}`;
      })
      .join('\n');

    const today = moment().format('dddd, MMMM Do YYYY');
    
    // Calculate next Tuesday using the same logic as conversation manager
    const todayMoment = moment();
    const todayDayOfWeek = todayMoment.day(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.
    const tuesdayDayOfWeek = 2; // Tuesday is day 2
    let daysUntilTuesday = tuesdayDayOfWeek - todayDayOfWeek;
    
    // If it's the same day or already passed this week, go to next week
    if (daysUntilTuesday <= 0) {
      daysUntilTuesday += 7;
    }
    
    const nextTuesday = todayMoment.clone().add(daysUntilTuesday, 'days');
    const formattedNextTuesday = nextTuesday.format('dddd, MMMM Do YYYY');

    // CRITICAL FIX: Get user information summary to provide context to LLM
    const userInfoSummary = this.conversationManager.getUserInformationSummary(sessionId);

    return `You are an AI appointment booking assistant for ${clinicConfig.name}. You help patients book appointments and answer questions about availability.

**TODAY'S CONTEXT:**
- Today is: ${today}
- Next Tuesday would be: ${formattedNextTuesday}

**CORE PRINCIPLES:**
- Be conversational, helpful, and professional 
- Always prioritize the patient's preferred time and date
- Provide clear, specific information about availability
- When specific times are unavailable, offer concrete alternatives

**CRITICAL: AVAILABILITY CHECKING RULE**
🚨 ABSOLUTE REQUIREMENT:
- ALWAYS call check_availability before making any availability claims or suggestions. REQUIRED when customers request specific times or dates for appointments. ALWAYS verify availability through function calls.
- When customers mention specific times/dates, immediately call check_availability
- Base all availability responses on actual function results
- USE function call results to provide accurate availability information

**CRITICAL: DATE INTERPRETATION**
When patients use relative dates, interpret them as the NEXT future occurrence:
- "Tuesday" = the next occurring Tuesday (this week if it hasn't passed, next week if it has)
- "next Tuesday" = the Tuesday after this week's Tuesday
- "Friday" = the next occurring Friday
- "tomorrow" = the day after today

IMPORTANT: Before making check_availability calls, ALWAYS check if user information has been extracted and stored for this session. Use the stored preferredDate if available, as it has been processed with proper future date logic.

**CRITICAL: AVAILABILITY QUERY TYPES**
🚨 DISTINGUISH between these query types when calling check_availability:

1. **SPECIFIC TIME QUERIES** (include preferredTime in function call):
   - "Can I book at 2:45 PM tomorrow?"
   - "Is 3:00 PM available on Tuesday?"
   - "I need an appointment at exactly 11:00 AM"

2. **GENERAL AVAILABILITY QUERIES** (DO NOT include preferredTime):
   - "Can I reschedule for sometime tomorrow?"
   - "What times are available on Tuesday?"
   - "Are there any other times available?"
   - "Show me all available slots"

For GENERAL AVAILABILITY queries, DO NOT include preferredTime parameter even if session data contains a preferred time. This ensures all available slots are returned.

**CRITICAL: SERVICE NAMES**
You MUST use ONLY these exact service names from our clinic: ${clinicConfig.services.join(', ')}
- When users ask for "appointment", "consultation", "physio", etc., map them to our exact service names
- If unsure which service they want, ask them to choose from our available services
- ALWAYS use our exact service names in all communications and function calls

**AVAILABILITY RESPONSES:**
When checking availability, you receive multiple types of results:

1. **SPECIFIC TIME CHECK** (when patient requests exact time):
   - If specificTimeCheck.isAvailable = true: "Great! [Time] on [Date] is available"
   - If specificTimeCheck.isAvailable = false: "I checked [Time] on [Date] specifically, and it's not available"
   - Always mention the exact time you checked: "I checked Tuesday at 2:00 PM specifically"

2. **NEAREST AVAILABLE TIME** (when specific time unavailable but other slots exist on same day):
   - If nearestAvailableTime is provided: Offer the nearest time as an alternative
   - Example: "The closest available time is [nearestTime] which is [X] minutes [earlier/later]"
   - Ask: "Would you like to book [nearestTime] instead?"

3. **ALTERNATIVE SUGGESTIONS** (when specific time unavailable):
   - If slots exist on requested day: List actual available times on that day first
   - If nearestAvailableTime exists: Prioritize mentioning it first, then other times
   - Then suggest other days if no availability on requested date
   - Be specific: "Available times on Tuesday are 9:00 AM, 12:00 PM, and 3:00 PM"
   - Ask: "Would you like to book one of these times instead?"

4. **NO AVAILABILITY ON REQUESTED DATE**:
   - If totalSlotsOnDay = 0: "There are no available appointments on [Date]"
   - Suggest alternative dates: "I can check other dates for you"
   - Offer specific alternatives: "The next available date is [Date]"

**CRITICAL: DATE-SPECIFIC QUERIES:**
When users ask about availability for a specific day (e.g., "Is there availability on Thursday?"):
1. If totalSlotsOnDay > 0 but slots array contains no same-day entries, prioritize checking the requested day specifically
2. If slots array contains same-day entries, list them all with proper displayTime formatting
3. If slots array only contains other-day entries despite totalSlotsOnDay > 0, mention you found alternatives but focus on the requested day
4. ALWAYS prioritize same-day information over alternative days when user asks about a specific day

**CRITICAL: TIMEZONE HANDLING:**
- ALWAYS use clinic local times when speaking to patients
- When nearestAvailableTime is provided, use nearestAvailableTime.displayTime for patient communication
- When displaying appointment slots, use the displayTime field which is already in 12-hour format
- USE clinic local timezone (Europe/London) for all patient-facing time communications
- PRIORITIZE displayTime fields over raw UTC data when communicating with patients

**TIMEZONE HANDLING EXAMPLES:**
When you see nearestAvailableTime with displayTime "9:00 AM", always use that exact time in your response.
The displayTime field is already formatted correctly for patient communication.

**MANDATORY: When mentioning ANY time to patients:**
1. ALWAYS use displayTime values from nearestAvailableTime objects
2. USE displayTime fields from slot objects which provide patient-ready formatting
3. RELY on displayTime field formatting for patient communication (e.g., "9:00 AM")
4. CONVERT times yourself using clinic timezone (Europe/London) when displayTime is unavailable

**CRITICAL: SLOT TIME FORMATTING:**
When listing available appointment slots to patients:
- ALWAYS use the displayTime field from each slot object when available
- USE displayTime formatting for patient communication (e.g., "10:00 AM", "2:00 PM")
- PRIORITIZE displayTime fields over raw timestamp data in patient responses
- FORMAT times yourself in 12-hour format with AM/PM when displayTime is missing

**RESPONSE FORMATTING:**
Format your responses using markdown for better readability and visual appeal:
- Use **bold text** for important information like appointment times and dates
- Use bullet points (•) for lists of available times or services
- Use numbered lists (1., 2., 3.) when showing step-by-step processes
- Use > blockquotes for important notices or reminders
- Use \`code formatting\` for appointment IDs or reference numbers

**INFORMATION COLLECTION FORMATTING:**
When collecting information from users, ALWAYS use this specific format:
- Use dashes (-) for listing requested information items
- Make each requested information item **bold**
- Use this exact format for information collection:

**Example of correct information collection format:**
"Absolutely! I'd be happy to help you make a booking.

Could you please provide me with the following details:

- **Your full name**
- **Your phone number**
- **Your date of birth** (YYYY-MM-DD format)
- **The type of service you need** (Standard Appointment or First Appointment)
- **Your preferred date and time for the appointment**"

**FORMATTING EXAMPLES:**
When listing appointment times:
"Here are your **available appointment times** for Thursday:
• **2:45 PM** - Henry Juliano (Standard Appointment)
• **3:30 PM** - Henry Juliano (Standard Appointment)  
• **4:15 PM** - Henry Juliano (Standard Appointment)

Would you like me to **book one of these times** for you?"

**CRITICAL: AVAILABILITY DISPLAY LIMIT**
When showing general availability (user asks "sometime [day]", "anytime [day]", etc.):
- **LIMIT to first 4 available slots** to avoid overwhelming the user
- **If more than 4 slots available**, add this message after listing the first 4:

"We have **X other available times** if these don't work for you. Just let me know if you'd like to see more options!"

**Example with many slots:**
"Here are your **available appointment times** for Wednesday, August 6th, 2025:

• **9:00 AM** - Henry Juliano (Standard Appointment) 
• **10:45 AM** - Henry Juliano (Standard Appointment) 
• **11:30 AM** - Henry Juliano (Standard Appointment) 
• **12:15 PM** - Henry Juliano (Standard Appointment) 

We have **5 other available times** if these don't work for you. Just let me know if you'd like to see more options!

Which time works best for you?"

When showing booking confirmation:
"✅ **Appointment Booked Successfully!**

**Appointment Details:**
• **Date:** Thursday, August 7th, 2025
• **Time:** 2:45 PM
• **Service:** Standard Appointment
• **Practitioner:** Henry Juliano
• **Reference:** \`REF_12345\`

> **Important:** Please arrive 10 minutes before your appointment time."

**BOOKING INFORMATION:**
- Services: ${clinicConfig.services.join(', ')}
- Practitioners: All practitioners available unless patient specifies preference
- Business Hours: 
${businessHoursText}

**KNOWLEDGE BASE ACCESS:**
You have access to relevant clinic information through context that is automatically provided when available. This context includes:
- Clinic policies (parking, payment, cancellation policies, insurance coverage)
- Treatment information and procedures (what to expect, preparation instructions)
- General clinic information (hours, location, contact details, accessibility)
- Service descriptions and pricing information
- Pre/post-treatment instructions and care guidelines
- Insurance and billing questions
- Appointment preparation requirements

**Knowledge Base Guidelines:**
- When relevant context is provided in your prompt, use that information to give accurate, helpful responses
- Present information naturally and conversationally - avoid formal phrases like "According to our clinic information" or "Our records show"
- Present information as if you're a knowledgeable clinic staff member giving helpful advice
- If context is provided but doesn't fully answer the question, use what's available and offer to help further
- If no relevant context is available for a question, explain that you'll need staff to follow up with specific details
- Integrate provided context seamlessly into helpful, human-like responses

**Examples of Natural Knowledge Base Responses:**
✅ GOOD: "For your appointment, it's best to wear comfortable, loose-fitting clothing like shorts and a t-shirt."

✅ GOOD: "You can park right behind our building - there's plenty of space there."

✅ GOOD: "We accept most major insurance plans! Just bring your insurance card and we'll handle the rest."

**CONVERSATION CONTEXT:**
${userInfoSummary || 'No previous context for this user.'}

**APPOINTMENT RESCHEDULE FLOW:**
When a client wants to reschedule an appointment, follow this exact process:

1. **Gather Required Information:**
   - Ask for their **full name**
   - Ask for their **phone number**

2. **Search for Patient:**
   - Use the search_patient_for_cancellation function with the name and phone number
   - If no patient found, politely inform them and ask them to double-check the information
   - If patient found, proceed to step 3

3. **Display Current Appointments:**
   - Show ALL upcoming appointments in a clear, formatted list
   - Include: date, time, practitioner, service type for each appointment
   - Use numbered list format for easy selection

4. **Appointment Selection:**
   - If **multiple appointments**: Ask them to specify which appointment they want to reschedule by number or details
   - If **only one appointment**: Confirm the specific appointment details before proceeding
   - Always confirm the exact appointment before rescheduling

5. **Gather New Date/Time:**
   - Ask for their **preferred new date and time**
   - Be specific: "What date and time would you like to reschedule to?"
   - Accept various formats but confirm back in clear format

6. **Check Availability:**
   - Use the check_availability function to verify the requested new date/time is available
   - Include the same service type from their current appointment
   - If **AVAILABLE**: Proceed to step 7
   - If **NOT AVAILABLE**: 
     - Show alternative times for the same day if available
     - Offer nearest available time alternatives
     - Ask them to choose from available options or suggest a different date

7. **Final Confirmation:**
   - Show both the current appointment details and the new requested details
   - Ask for explicit confirmation: "I'll reschedule your appointment from [OLD] to [NEW]. Is this correct?"
   - Only proceed with rescheduling after receiving clear confirmation

8. **Reschedule the Appointment:**
   - **CRITICAL**: Extract the appointment ID from the search_patient_for_cancellation function result you received earlier in this conversation
   - **CRITICAL**: Extract the practitioner ID and service ID from the check_availability function result you just received
   - **CRITICAL**: Extract the patient ID from the search_patient_for_cancellation function result you received earlier in this conversation
   - Use the reschedule_appointment function with:
     - **appointmentId**: The EXACT APPOINTMENT ID from the search results
     - **newDate**: The confirmed new date from availability checking 
     - **newTime**: The confirmed new time from availability checking
     - **practitionerId**: The practitionerId from the availability check result (e.g., "1740586886222586607")
     - **serviceId**: The serviceId from the availability check result (e.g., "1740586888823054369")
     - **patientId**: The patient ID from the search results (e.g., "1743684445862371896")
     - **businessId**:  Use "${businessId}" (extract from clinic configuration)
   - Provide confirmation of the successful reschedule
   - Offer any additional assistance

**RESCHEDULE FORMATTING EXAMPLES:**

When showing current appointments for selection:
"I found your patient record. Here are your upcoming appointments:

1. **Tuesday, January 28th, 2025 at 2:45 PM**
   Practitioner: Henry Juliano
   Service: Standard Appointment
   Duration: 30 minutes

2. **Friday, January 31st, 2025 at 10:00 AM**
   Practitioner: Sarah Johnson
   Service: First Appointment
   Duration: 60 minutes

Which appointment would you like to reschedule? Please let me know the number or specific details."

When confirming availability for new time:
"Great! I checked **Thursday, February 6th at 3:00 PM** and it's available.

**Reschedule Summary:**
• **Current Appointment:** Tuesday, January 28th, 2025 at 2:45 PM
• **New Appointment:** Thursday, February 6th, 2025 at 3:00 PM
• **Practitioner:** Henry Juliano
• **Service:** Standard Appointment

Would you like me to confirm this reschedule?"

When showing alternative times:
"I checked **Tuesday, February 4th at 2:00 PM** specifically, but it's not available.

**Available times on Tuesday, February 4th:**
• **9:00 AM** - Henry Juliano (Standard Appointment)
• **11:30 AM** - Henry Juliano (Standard Appointment)  
• **4:15 PM** - Henry Juliano (Standard Appointment)

Would you like to book one of these times instead, or would you prefer a different date?"

**CRITICAL RESCHEDULE RULES:**
- ALWAYS use search_patient_for_cancellation to find the patient's appointments first
- ALWAYS check availability using check_availability before confirming new times
- ALWAYS obtain explicit patient confirmation before rescheduling
- ALWAYS display both current and new appointment details before confirming
- ALWAYS extract the appointment ID from the search results, not examples
- ALWAYS verify the new time is available before proceeding
- Be helpful and offer alternatives when the preferred time is unavailable
- Use the same service type and duration from their current appointment
- **REQUIRED**: Extract appointment ID from the "id" field in the search response
- **REQUIRED**: Use exact appointment ID returned by search_patient_for_cancellation

**APPOINTMENT CANCELLATION FLOW:**
When a client wants to cancel an appointment, follow this exact process:

1. **Gather Required Information:**
   - Ask for their **full name**
   - Ask for their **phone number**

2. **Search for Patient:**
   - Use the search_patient_for_cancellation function with the name and phone number
   - If no patient found, politely inform them and ask them to double-check the information
   - If patient found, proceed to step 3

3. **Display Upcoming Appointments:**
   - Show ALL upcoming appointments in a clear, formatted list
   - Include: date, time, practitioner, service type for each appointment
   - Use numbered list format for easy selection

4. **Appointment Selection:**
   - If **multiple appointments**: Ask them to specify which appointment they want to cancel by number or details
   - If **only one appointment**: Confirm the specific appointment details before proceeding
   - Always confirm the exact appointment before cancelling

5. **Final Confirmation:**
   - Show the full appointment details to be cancelled
   - Ask for explicit confirmation: "Are you sure you want to cancel this appointment?"
   - Only proceed with cancellation after receiving clear confirmation

6. **Collect Cancellation Reason:**
   - After confirmation, ask: "Could you please tell me the reason for cancellation?"
   - Present these options: "feeling better, condition worse, sick, away, work, or other"
   - Wait for their response before proceeding

7. **Cancel the Appointment:**
   - **CRITICAL**: Extract the appointment ID from the search_patient_for_cancellation function result you just received in this conversation. Do NOT use any example IDs from these instructions.
   - Use the cancel_appointment function with the **EXACT APPOINTMENT ID** from the search results
   - **REQUIRED**: Find the appointment ID from the search_patient_for_cancellation result in this conversation
   - **REQUIRED**: Look for the "id" field in the appointments array (e.g., "EXAMPLE_ID_123")
   - **REQUIRED**: Copy the exact numeric ID string from the search results - do not use any placeholder text
   - **REQUIRED**: The appointment ID will be a long numeric string like "EXAMPLE_ID_456"
   - Include the appropriate cancellation reason code
   - Provide confirmation of the cancellation
   - Offer to help with rebooking if they need a new appointment

**CANCELLATION FORMATTING EXAMPLES:**

When showing a SINGLE appointment for selection:
"I found your patient record. Here is your upcoming appointment:

**Thursday, August 7th, 2025 at 2:00 PM**
Practitioner: Henry Juliano
Service: First Appointment
Duration: 45 minutes

Is this the appointment you would like to cancel?"

When showing MULTIPLE appointments for selection:
"I found your patient record. Here are your upcoming appointments:

1. **Tuesday, January 28th, 2025 at 2:45 PM**
   Practitioner: Henry Juliano
   Service: Standard Appointment
   Duration: 30 minutes

2. **Friday, January 31st, 2025 at 10:00 AM**
   Practitioner: Sarah Johnson
   Service: First Appointment
   Duration: 60 minutes

Which appointment would you like to cancel? Please let me know the number or specific details."

When confirming cancellation:
"I'll cancel the following appointment for you:

**Appointment to Cancel:**
• **Date:** Tuesday, January 28th, 2025
• **Time:** 2:45 PM
• **Practitioner:** Henry Juliano  
• **Service:** Standard Appointment

Are you sure you want to cancel this appointment? Please confirm."

When collecting cancellation reason:
"Could you please tell me the reason for cancellation? You can choose from:
- Feeling better
- Condition worse  
- Sick
- Away
- Work
- Other"

**CRITICAL CANCELLATION RULES:**
- ALWAYS obtain explicit patient confirmation before proceeding with cancellation
- ALWAYS display the complete appointment details before cancelling
- ALWAYS collect a cancellation reason before proceeding
- ALWAYS confirm details even when patient has only one appointment
- Be empathetic and offer to help with rebooking
- **REQUIRED**: Use the exact appointment ID from the search_patient_for_cancellation results
- **REQUIRED**: Extract appointment ID from the "id" field in the search response
- **REQUIRED**: Ensure appointment ID comes directly from function call results, not examples
- Map cancellation reasons: feeling better=10, condition worse=20, sick=30, away=40, work=60, other=50

**APPOINTMENT ID USAGE:**
When search returns: \`{ "id": "SEARCH_RESULT_ID_789", "date": "Wednesday, August 6th 2025", ... }\`
✅ CORRECT: Use appointmentId: "SEARCH_RESULT_ID_789" (extract the numeric ID from search results)
✅ CORRECT: Always use the exact numeric ID returned by search_patient_for_cancellation
❌ INCORRECT: Use appointmentId: "1" (this is the list number, not the appointment ID)
❌ INCORRECT: Use placeholder text or examples as appointment ID

Remember: Always be helpful, accurate, and efficient in scheduling appointments!`;
  }

  private defineBookingTools(sessionId: string): any[] {
    // Get valid appointment IDs for this session
    const validAppointmentIds = this.conversationManager.getValidAppointmentIds(sessionId);
    
    // Base tools that are always available
    const baseTools = [
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'MANDATORY: Always call this function before making ANY availability claims or suggestions. REQUIRED when customers request specific times or dates for appointments. ALWAYS verify availability through function calls before responding.',
          parameters: {
            type: 'object',
            properties: {
              serviceType: {
                type: 'string',
                description: 'The type of service/treatment needed'
              },
              preferredDate: {
                type: 'string',
                description: 'Preferred date in YYYY-MM-DD format'
              },
              preferredTime: {
                type: 'string',
                description: 'Preferred time in HH:mm format (optional)'
              },
              practitionerName: {
                type: 'string',
                description: 'Specific practitioner name if requested (optional)'
              },
              searchDays: {
                type: 'number',
                description: 'Number of days to search ahead (default: 7)'
              }
            },
            required: ['serviceType', 'preferredDate']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'book_appointment',
          description: 'Book a new appointment for a patient',
          parameters: {
            type: 'object',
            properties: {
              patientName: {
                type: 'string',
                description: 'Full name of the patient'
              },
              patientPhone: {
                type: 'string',
                description: 'Patient phone number'
              },
              dateOfBirth: {
                type: 'string',
                description: 'Patient date of birth in YYYY-MM-DD format (optional if patient is existing)'
              },
              patientEmail: {
                type: 'string',
                description: 'Patient email address (optional - not collected by default)'
              },
              serviceType: {
                type: 'string',
                description: 'Type of service/treatment'
              },
              preferredDate: {
                type: 'string',
                description: 'Appointment date in YYYY-MM-DD format (example: 2025-08-01)'
              },
              preferredTime: {
                type: 'string',
                description: 'Appointment time in HH:mm format (example: 14:30)'
              },
              duration: {
                type: 'number',
                description: 'Appointment duration in minutes (optional)'
              },
              notes: {
                type: 'string',
                description: 'Any special notes or requirements (optional)'
              },
              therapistPreference: {
                type: 'string',
                description: 'Preferred therapist/practitioner name (optional)'
              }
            },
            required: ['patientName', 'patientPhone', 'serviceType', 'preferredDate', 'preferredTime']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_existing_patient',
          description: 'Search for an existing patient by name and contact details (use when patient says they have booked before)',
          parameters: {
            type: 'object',
            properties: {
              patientName: {
                type: 'string',
                description: 'Full name of the patient'
              },
              patientPhone: {
                type: 'string',
                description: 'Patient phone number (optional if email provided)'
              },
              patientEmail: {
                type: 'string',
                description: 'Patient email address (optional if phone provided)'
              }
            },
            required: ['patientName']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_new_patient_booking',
          description: 'Create a new patient and book an appointment (use when patient says they are new to the clinic)',
          parameters: {
            type: 'object',
            properties: {
              patientName: {
                type: 'string',
                description: 'Full name of the patient'
              },
              dateOfBirth: {
                type: 'string',
                description: 'Patient date of birth in YYYY-MM-DD format (REQUIRED - example: 1990-05-15)'
              },
              patientPhone: {
                type: 'string',
                description: 'Patient phone number (required if email not provided)'
              },
              patientEmail: {
                type: 'string',
                description: 'Patient email address (required if phone not provided)'
              },
              serviceType: {
                type: 'string',
                description: 'Type of service/treatment'
              },
              preferredDate: {
                type: 'string',
                description: 'Appointment date in YYYY-MM-DD format (example: 2025-08-01)'
              },
              preferredTime: {
                type: 'string',
                description: 'Appointment time in HH:mm format (example: 14:30)'
              },
              duration: {
                type: 'number',
                description: 'Appointment duration in minutes (optional)'
              },
              notes: {
                type: 'string',
                description: 'Any special notes or requirements (optional)'
              },
              therapistPreference: {
                type: 'string',
                description: 'Preferred therapist/practitioner name (optional)'
              }
            },
            required: ['patientName', 'dateOfBirth', 'serviceType', 'preferredDate', 'preferredTime']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'find_existing_appointments',
          description: 'Find existing appointments for a patient',
          parameters: {
            type: 'object',
            properties: {
              patientEmail: {
                type: 'string',
                description: 'Patient email address'
              },
              patientPhone: {
                type: 'string',
                description: 'Patient phone number'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_patient_for_cancellation',
          description: 'Search for a patient by name and phone number to find their upcoming appointments for cancellation',
          parameters: {
            type: 'object',
            properties: {
              patientName: {
                type: 'string',
                description: 'Full name of the patient'
              },
              phoneNumber: {
                type: 'string',
                description: 'Patient phone number'
              }
            },
            required: ['patientName', 'phoneNumber']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'reschedule_appointment',
          description: 'Reschedule an existing appointment to a new date/time',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'The appointment ID to reschedule'
              },
              newDate: {
                type: 'string',
                description: 'New date in YYYY-MM-DD format'
              },
              newTime: {
                type: 'string',
                description: 'New time in HH:mm format'
              },
              practitionerId: {
                type: 'string',
                description: 'The practitioner ID from availability check results'
              },
              serviceId: {
                type: 'string',
                description: 'The service ID from availability check results'
              },
              patientId: {
                type: 'string',
                description: 'The patient ID from search results'
              },
              businessId: {
                type: 'string',
                description: 'The business ID from the clinic configuration'
              }
            },
            required: ['appointmentId', 'newDate', 'newTime']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_clinic_services',
          description: 'Get list of available services offered by the clinic',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_practitioners',
          description: 'Get list of available practitioners/therapists',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      }
    ];

    // NOTE: search_knowledge_base function removed - we now use direct context injection (RAG pattern)
    // Knowledge base content is pre-searched and injected directly into the system prompt for better performance
    
    // const hasKnowledgeBase = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME && process.env.OPENAI_API_KEY);
    // 
    // if (hasKnowledgeBase) {
    //   console.log('🧠 [LLMBrain] Adding search_knowledge_base function - knowledge retrieval available');
    //   
    //   baseTools.push({
    //     type: 'function',
    //     function: {
    //       name: 'search_knowledge_base',
    //       description: 'Search the clinic\'s knowledge base for answers to frequently asked questions, policies, procedures, and general information',
    //       parameters: {
    //         type: 'object',
    //         properties: {
    //           query: {
    //             type: 'string',
    //             description: 'The question or topic to search for in the knowledge base'
    //           },
    //           category: {
    //             type: 'string',
    //             description: 'Optional category filter: policies, procedures, services, general, billing, or appointments'
    //           }
    //         },
    //         required: ['query']
    //       } as any
    //     }
    //   });
    // } else {
    //   console.log('⚠️ [LLMBrain] Knowledge base search not available - search_knowledge_base function not added');
    // }

    // CRITICAL FIX: Only include cancel_appointment function if we have valid appointment IDs for this session
    if (validAppointmentIds.length > 0) {
      console.log(`🔒 [LLMBrain] Adding cancel_appointment function with restricted IDs for session ${sessionId}:`, validAppointmentIds);
      
      baseTools.push({
        type: 'function',
        function: {
          name: 'cancel_appointment',
          description: 'Cancel an existing appointment with a reason. CRITICAL: You can ONLY use appointment IDs that were found in the current conversation search results.',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'string',
                description: 'The exact appointment ID from the search results in this conversation',
                enum: validAppointmentIds // 🔒 CRITICAL: LLM can ONLY use these specific IDs
              } as any, // Fix TypeScript enum constraint issue
              cancellationReason: {
                type: 'integer',
                description: 'Reason for cancellation: 10=feeling better, 20=condition worse, 30=sick, 40=away, 50=other, 60=work',
                enum: [10, 20, 30, 40, 50, 60]
              }
            },
            required: ['appointmentId', 'cancellationReason']
          } as any // Fix TypeScript constraints for dynamic enum
        }
      });
    } else {
      console.log(`🚫 [LLMBrain] No valid appointment IDs found for session ${sessionId} - cancel_appointment function NOT available`);
    }

    return baseTools;
  }

  private async executeToolCall(
    toolCall: any,
    bookingAdapter: BaseBookingAdapter,
    clinicConfig: ClinicConfig,
    sessionId: string
  ): Promise<any> {
    const { function: functionCall } = toolCall;
    const parameters = JSON.parse(functionCall.arguments || '{}');

    console.log(`Executing tool: ${functionCall.name}`, parameters);

    try {
      switch (functionCall.name) {
        case 'check_availability':
          return await this.checkAvailability(parameters, bookingAdapter, sessionId);
        
        case 'book_appointment':
          return await this.bookAppointment(parameters, bookingAdapter, sessionId);
        
        case 'search_existing_patient':
          return await this.searchExistingPatient(parameters, bookingAdapter);
        
        case 'create_new_patient_booking':
          return await this.createNewPatientBooking(parameters, bookingAdapter, sessionId);
        
        case 'find_existing_appointments':
          return await this.findExistingAppointments(parameters, bookingAdapter);
        
        case 'search_patient_for_cancellation':
          return await this.searchPatientForCancellation(parameters, bookingAdapter, sessionId);
        
        case 'cancel_appointment':
          return await this.cancelAppointment(parameters, bookingAdapter, sessionId);
        
        case 'reschedule_appointment':
          return await this.rescheduleAppointment(parameters, bookingAdapter, sessionId);
        
        case 'get_clinic_services':
          return await bookingAdapter.getServices();
        
        case 'get_practitioners':
          return await bookingAdapter.getPractitioners();
        
        // NOTE: search_knowledge_base removed - now uses direct context injection
        
        default:
          return { error: `Unknown tool: ${functionCall.name}` };
      }
    } catch (error) {
      console.error(`Error executing tool ${functionCall.name}:`, error);
      return { 
        error: error instanceof Error ? error.message : 'Tool execution failed' 
      };
    }
  }

  /**
   * Check appointment availability
   * 
   * CRITICAL TIMEZONE HANDLING:
   * - All times returned to LLM are in clinic local timezone (Europe/London)
   * - nearestAvailableTime.displayTime provides patient-ready format (e.g., "9:00 AM")
   * - Raw startTime fields are removed from LLM-visible data to prevent UTC confusion
   * - See system prompt for explicit LLM instructions on timezone handling
   */
  private async checkAvailability(
    parameters: any, 
    bookingAdapter: BaseBookingAdapter, 
    sessionId: string
  ): Promise<any> {
    console.log(`🚨 [DEBUG] checkAvailability called with parameters:`, parameters);
    console.log(`🚨 [DEBUG] sessionId:`, sessionId);
    
    // Get gathered user information to enhance the availability check
    const userInfo = this.conversationManager.getUserInformation(sessionId);
    console.log(`🚨 [DEBUG] userInfo:`, userInfo);
    
    // ENHANCED: Validate dates and prevent DOB from being used as appointment date
    let finalDate = parameters.preferredDate;
    if (userInfo?.preferredDate) {
      // Validate that the extracted date is not in the past (which would indicate it's not an appointment date)
      const extractedDate = new Date(userInfo.preferredDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Only use conversation manager's date if:
      // 1. It was extracted recently (within 10 seconds)
      // 2. It's not in the past (not a DOB or historical date)
      // 3. It's not obviously a birth year (before 2020)
      const timeDiff = userInfo.lastUpdated ? Date.now() - userInfo.lastUpdated.getTime() : Infinity;
      const isRecentExtraction = timeDiff < 10000;
      const isValidAppointmentDate = extractedDate >= today;
      const isNotBirthYear = extractedDate.getFullYear() >= 2020;
      
      if (isRecentExtraction && isValidAppointmentDate && isNotBirthYear) {
        finalDate = userInfo.preferredDate;
        console.log(`🔧 [LLM] Using conversation manager's extracted date: ${finalDate} (overriding LLM parameter: ${parameters.preferredDate})`);
      } else {
        console.log(`🚫 [LLM] Rejecting conversation manager's date: ${userInfo.preferredDate} (recent: ${isRecentExtraction}, valid: ${isValidAppointmentDate}, not birth year: ${isNotBirthYear})`);
        console.log(`🔧 [LLM] Using LLM parameter date instead: ${parameters.preferredDate}`);
        
        // Additional validation: Reject if LLM parameter date is also in the past
        if (parameters.preferredDate) {
          const llmDate = new Date(parameters.preferredDate);
          if (llmDate < today) {
            console.log(`🚫 [LLM] ERROR: LLM parameter date is also in the past: ${parameters.preferredDate}`);
            return {
              slots: [],
              availableTimePatterns: null,
              searchParams: { 
                serviceType: parameters.serviceType,
                preferredDate: parameters.preferredDate,
                preferredTime: parameters.preferredTime,
                error: "Invalid date: appointment date cannot be in the past"
              },
              specificTimeCheck: null,
              nearestAvailableTime: null
            };
          }
        }
      }
    }
    
    // EXPERT FIX: Detect date-specific queries and force single-day search
    const isDateSpecificQuery = await this.isDateSpecificQuery(parameters, sessionId);
    console.log(`🎯 [EXPERT FIX] Date-specific query detected: ${isDateSpecificQuery}`);
    
    // SIMPLE FIX: Trust the LLM's parameter choices for availability queries
    // If LLM omitted preferredTime -> user wants general availability (all slots)  
    // If LLM included preferredTime -> user wants specific time check
    
    let finalPreferredTime = parameters.preferredTime;
    
    if (!parameters.preferredTime) {
      // LLM deliberately omitted preferredTime -> show all available slots
      finalPreferredTime = undefined;
      console.log(`✅ [SIMPLE FIX] LLM omitted preferredTime -> showing all available slots for general availability`);
    } else {
      console.log(`✅ [SIMPLE FIX] LLM provided specific time: ${finalPreferredTime}`);
    }
    
    console.log(`✅ [SIMPLE FIX] FINAL preferredTime to use: ${finalPreferredTime}`);
    
    const searchParams: any = {
      serviceType: parameters.serviceType || userInfo?.preferredService,
      preferredDate: finalDate,
      preferredTime: finalPreferredTime,
      practitionerName: parameters.practitionerName,
      searchDays: isDateSpecificQuery ? 1 : (parameters.searchDays || 7) // 🎯 KEY FIX
    };

    console.log('🔍 [LLM] Checking availability with params:', searchParams);
    console.log('📝 [LLM] Original parameters:', parameters);
    console.log('📝 [LLM] User info used:', userInfo);
    
    let specificTimeCheck = null;
    let nearestAvailableTime = null;
    
    // PHASE 1: Check specific time and get ALL slots for the requested day
    if (searchParams.preferredTime && searchParams.preferredDate) {
      console.log('🔍 [LLM] Checking specific time availability');
      
      // Get all available slots for the requested date
      const slots = await bookingAdapter.getAvailableSlots(searchParams);
      
      // FIXED: Ensure all slots have displayTime for proper LLM formatting
      slots.forEach(slot => {
        if (!slot.displayTime) {
          const slotTime = new Date(slot.startTime);
          slot.displayTime = slotTime.toLocaleTimeString('en-GB', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true,
            timeZone: 'Europe/London'
          });
        }
      });
      
      // Check if the specific time is available
      const requestedDateTime = new Date(`${searchParams.preferredDate}T${searchParams.preferredTime}:00`);
      const specificSlot = slots.find(slot => {
        const slotTime = new Date(slot.startTime);
        return Math.abs(slotTime.getTime() - requestedDateTime.getTime()) < 60000; // Within 1 minute
      });
      
      specificTimeCheck = {
        requestedTime: searchParams.preferredTime,
        requestedDate: searchParams.preferredDate,
        isAvailable: !!specificSlot,
        exactSlot: specificSlot || null,
        totalSlotsOnDay: slots.length
      };
      
      // Find nearest available time if specific time not available
      if (!specificSlot && slots.length > 0) {
        // FIXED: Two-phase approach to prioritize same-day alternatives
        const requestedDate = searchParams.preferredDate;
        const requestedDateOnly = requestedDate ? new Date(requestedDate).toDateString() : null;
        
        // Phase 1: Try to find slots on the same day as requested
        const sameDaySlots = slots.filter(slot => {
          const slotDate = new Date(slot.startTime).toDateString();
          return slotDate === requestedDateOnly;
        });
        
        // Phase 2: If no same-day slots, use all available slots
        const candidateSlots = sameDaySlots.length > 0 ? sameDaySlots : slots;
        
        console.log(`🎯 [PRIORITY FIX] Same-day slots found: ${sameDaySlots.length}, using: ${candidateSlots === sameDaySlots ? 'SAME-DAY' : 'ALL-DAYS'}`);
        
        // Sort candidate slots by time proximity to requested time
        const sortedSlots = candidateSlots.sort((a, b) => 
          Math.abs(new Date(a.startTime).getTime() - requestedDateTime.getTime()) -
          Math.abs(new Date(b.startTime).getTime() - requestedDateTime.getTime())
        );
        
        const nearestSlot = sortedSlots[0];
        if (nearestSlot) {
          const nearestTime = new Date(nearestSlot.startTime);
          const minutesDiff = Math.abs(nearestTime.getTime() - requestedDateTime.getTime()) / (1000 * 60);
          
          nearestAvailableTime = {
            slot: nearestSlot,
            timeString: nearestTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
            minutesDifference: Math.round(minutesDiff),
            direction: nearestTime > requestedDateTime ? 'later' : 'earlier',
            practitionerName: nearestSlot.practitionerName,
            serviceName: nearestSlot.serviceName,
            // CRITICAL FIX: Add displayTime for LLM
            displayTime: nearestTime.toLocaleTimeString('en-GB', { 
              hour: 'numeric', 
              minute: '2-digit', 
              hour12: true 
            })
          };
          
          console.log(`🎯 [PRIORITY FIX] Selected nearest time: ${nearestAvailableTime.displayTime} on ${new Date(nearestSlot.startTime).toDateString()}`);
        }
      }
      
      return {
        slots,
        searchParams,
        specificTimeCheck,
        nearestAvailableTime
      };
    }
    
    // Fallback for general availability check
    const slots = await bookingAdapter.getAvailableSlots(searchParams);
    
    // FIXED: Ensure all slots have displayTime for proper LLM formatting
    slots.forEach(slot => {
      if (!slot.displayTime) {
        const slotTime = new Date(slot.startTime);
        slot.displayTime = slotTime.toLocaleTimeString('en-GB', { 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true,
          timeZone: 'Europe/London'
        });
      }
    });
    
    return {
      slots,
      searchParams
    };
  }

  private async isDateSpecificQuery(parameters: any, sessionId: string): Promise<boolean> {
    try {
      const userInfo = this.conversationManager.getUserInformation(sessionId);
      
      // Get the last user message to analyze the query pattern
      const conversationHistory = await this.conversationManager.getConversationContext(sessionId, '', 1);
      const lastUserMessage = conversationHistory?.[0]?.content || '';
      
      console.log(`🔍 [EXPERT FIX] Analyzing message: "${lastUserMessage}"`);
      
      return (
        // Pattern 1: "any availability on [day]" or "availability on [day]"
        /any\s+availability\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lastUserMessage) ||
        /availability\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lastUserMessage) ||
        
        // Pattern 2: User asked for specific day without specific time
        (!parameters.preferredTime && parameters.preferredDate) ||
        
        // Pattern 3: Follow-up query about same date with availability keywords
        (userInfo?.preferredDate === parameters.preferredDate && 
         /(availability|available|free|open|slots)/i.test(lastUserMessage)) ||
        
        // Pattern 4: "Is there [anything] on [day]"
        /is\s+there\s+.*\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lastUserMessage) ||
        
        // Pattern 5: "What times are available [day]"
        /what\s+times\s+.*\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lastUserMessage) ||
        
        // Pattern 6: "availability for [day]" or "available for [day]"
        /(availability|available)\s+(for\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lastUserMessage) ||
        
        // Pattern 7: Direct day queries like "Thursday?" or "What about Thursday?"
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\?/i.test(lastUserMessage)
      );
    } catch (error) {
      console.warn(`⚠️ [EXPERT FIX] Error detecting date-specific query:`, error);
      return false;
    }
  }

  /**
   * Detect if user is asking for general availability (e.g., "sometime tomorrow", "any times") 
   * vs specific time availability (e.g., "2:45 PM tomorrow")
   */
  private async isGeneralAvailabilityQuery(parameters: any, sessionId: string): Promise<boolean> {
    try {
      console.log(`🚨 [AVAILABILITY FIX] Method called with parameters:`, parameters);
      
      const conversationHistory = await this.conversationManager.getConversationContext(sessionId, '', 1);
      const lastUserMessage = conversationHistory?.[0]?.content || '';
      
      console.log(`🔍 [AVAILABILITY FIX] Raw conversation history:`, conversationHistory);
      console.log(`🔍 [AVAILABILITY FIX] Analyzing message: "${lastUserMessage}"`);
      
      // If user explicitly provided a time parameter, it's NOT a general availability query
      if (parameters.preferredTime) {
        console.log(`🔍 [AVAILABILITY FIX] User provided preferredTime: ${parameters.preferredTime} - NOT general availability`);
        return false;
      }
      
      // If message contains specific time mentions, it's NOT general availability
      const timePatterns = [
        /\b\d{1,2}:\d{2}\b/,           // "2:45", "14:30"
        /\b\d{1,2}\s*(am|pm)\b/i,      // "2 PM", "9 AM"
        /\b\d{1,2}:\d{2}\s*(am|pm)\b/i // "2:45 PM", "9:30 AM"
      ];
      
      const hasSpecificTime = timePatterns.some(pattern => pattern.test(lastUserMessage));
      console.log(`🔍 [AVAILABILITY FIX] Message contains specific time: ${hasSpecificTime}`);
      
      if (hasSpecificTime) {
        console.log(`🔍 [AVAILABILITY FIX] Message contains specific time - NOT general availability`);
        return false;
      }
      
      // Patterns that indicate GENERAL availability queries - ENHANCED
      const generalAvailabilityPatterns = [
        // Enhanced "sometime" patterns
        /can\s+i\s+do\s+sometime/i,                        // "Can I do sometime tomorrow"
        /can\s+i\s+reschedule\s+for\s+sometime/i,          // "Can I reschedule for sometime tomorrow"
        /reschedule\s+for\s+sometime/i,                    // "reschedule for sometime tomorrow"
        /sometime\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        /any\s+time\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        
        // "Other times" patterns  
        /any\s+other\s+times?\?/i,                         // "any other times?"
        /are\s+there\s+any\s+other\s+times?/i,            // "are there any other times"
        /is\s+there\s+any\s+other\s+times?/i,             // "is there any other times"
        
        // "What times" patterns
        /what\s+times\s+are\s+available/i,                 // "what times are available"
        /what\s+(other\s+)?times\s+do\s+you\s+have/i,      // "what times do you have"
        
        // General availability patterns
        /when\s+are\s+you\s+available/i,                   // "when are you available"
        /what\s+about\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\?/i, // "what about tomorrow?"
        /availability\s+(for\s+)?(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, // "availability for tomorrow"
        
        // Additional patterns for common phrases
        /what.*times.*tomorrow/i,                          // "what times tomorrow"
        /available.*tomorrow/i,                            // "available tomorrow"
        /free.*tomorrow/i                                  // "free tomorrow"
      ];
      
      const isGeneralQuery = generalAvailabilityPatterns.some(pattern => {
        const matches = pattern.test(lastUserMessage);
        console.log(`🔍 [AVAILABILITY FIX] Testing pattern ${pattern} against "${lastUserMessage}": ${matches}`);
        return matches;
      });
      
      console.log(`🔍 [AVAILABILITY FIX] General availability patterns matched: ${isGeneralQuery}`);
      console.log(`🚨 [AVAILABILITY FIX] FINAL RESULT: ${isGeneralQuery}`);
      
      return isGeneralQuery;
      
    } catch (error) {
      console.warn(`⚠️ [AVAILABILITY FIX] Error detecting general availability query:`, error);
      return false;
    }
  }

  private detectIntent(message: string, functionCalls: FunctionCall[]): { type: string; confidence: number; context: any } {
    const lowerMessage = message.toLowerCase();
    
    if (functionCalls.length > 0) {
      const firstCall = functionCalls[0];
      if (firstCall) {
        const functionName = firstCall.name;
        return {
          type: functionName.replace('_', '-'),
          confidence: 0.9,
          context: { functionCall: functionName }
        };
      }
    }
    
    if (lowerMessage.includes('book') || lowerMessage.includes('appointment')) {
      return { type: 'booking', confidence: 0.7, context: { keywords: ['book', 'appointment'] } };
    }
    
    return { type: 'general', confidence: 0.5, context: {} };
  }

  private requiresFollowUp(intent: { type: string }, functionCalls: FunctionCall[]): boolean {
    if (functionCalls.length > 0) return false; // Function calls usually provide complete responses
    if (intent.type === 'booking') return true;
    return false;
  }

  private async bookAppointment(parameters: any, bookingAdapter: BaseBookingAdapter, sessionId: string): Promise<any> {
    return await bookingAdapter.createAppointment(parameters);
  }

  private async searchExistingPatient(parameters: any, bookingAdapter: BaseBookingAdapter): Promise<any> {
    return await bookingAdapter.searchExistingPatient(
      parameters.patientName,
      parameters.patientPhone,
      parameters.patientEmail
    );
  }

  private async createNewPatientBooking(parameters: any, bookingAdapter: BaseBookingAdapter, sessionId: string): Promise<any> {
    return await bookingAdapter.createNewPatientBooking(parameters);
  }

  private async findExistingAppointments(parameters: any, bookingAdapter: BaseBookingAdapter): Promise<any> {
    return await bookingAdapter.findExistingAppointments(
      parameters.patientEmail,
      parameters.patientPhone
    );
  }

  private async searchPatientForCancellation(parameters: any, bookingAdapter: BaseBookingAdapter, sessionId: string): Promise<any> {
    try {
      console.log('🔍 [LLMBrain] Searching patient for cancellation:', parameters);
      
      // Search for patient by name and phone number
      const patient = await bookingAdapter.searchPatientByNameAndPhone(
        parameters.patientName,
        parameters.phoneNumber
      );

      if (!patient) {
        return {
          success: false,
          error: 'No patient found with the provided name and phone number. Please check the information and try again.'
        };
      }

      // Get patient's upcoming appointments
      const upcomingAppointments = await bookingAdapter.getPatientUpcomingAppointments(patient);

      // Filter out diagnostic entries for real appointments
      const realAppointments = upcomingAppointments.filter(apt => apt.id !== 'DIAGNOSTIC_ERROR');

      if (realAppointments.length === 0) {
        // Check if we have diagnostic errors to report
        const diagnosticError = upcomingAppointments.find(apt => apt.id === 'DIAGNOSTIC_ERROR') as any;
        
        if (diagnosticError) {
          return {
            success: false,
            error: 'There was an error retrieving your appointment details. Please try again or contact us directly.',
            patient: {
              name: `${patient.first_name} ${patient.last_name}`,
              id: patient.id
            },
            diagnostics: diagnosticError.diagnostics
          };
        }
        
        return {
          success: true,
          patient: {
            name: `${patient.first_name} ${patient.last_name}`,
            id: patient.id
          },
          appointments: [],
          message: 'Patient found but has no upcoming appointments to cancel.'
        };
      }

      // CRITICAL: Store valid appointment IDs for this session to prevent cross-session contamination
      const appointmentIds = realAppointments.map(apt => apt.id);
      this.conversationManager.storeValidAppointmentIds(sessionId, appointmentIds);
      
      // CRITICAL: Store patient ID for this session to ensure correct patient in reschedule operations
      this.conversationManager.storePatientId(sessionId, patient.id);
      
      return {
        success: true,
        patient: {
          name: `${patient.first_name} ${patient.last_name}`,
          id: patient.id
        },
        appointments: realAppointments,
        message: `Found ${realAppointments.length} upcoming appointment${realAppointments.length === 1 ? '' : 's'} for this patient.`
      };

    } catch (error: any) {
      console.error('❌ [LLMBrain] Error searching patient for cancellation:', error);
      return {
        success: false,
        error: 'An error occurred while searching for the patient. Please try again.'
      };
    }
  }

  private async cancelAppointment(parameters: any, bookingAdapter: BaseBookingAdapter, sessionId: string): Promise<any> {
    try {
      console.log('🗑️ [LLMBrain] Cancelling appointment with parameters:', parameters);
      console.log('🔍 [LLMBrain] Appointment ID being used for cancellation:', parameters.appointmentId);
      console.log('🔍 [LLMBrain] Session ID:', sessionId);
      
      // Validate parameters
      if (!parameters.appointmentId) {
        return {
          success: false,
          error: 'Appointment ID is required for cancellation'
        };
      }
      
      if (!parameters.cancellationReason) {
        return {
          success: false,
          error: 'Cancellation reason is required'
        };
      }
      
      // CRITICAL FIX: Session-specific appointment ID validation
      if (!this.conversationManager.isValidAppointmentIdForSession(sessionId, parameters.appointmentId)) {
        console.error('🚨 [LLMBrain] CRITICAL: Appointment ID does not belong to this session!');
        console.error('🚨 [LLMBrain] This prevents cross-session appointment ID contamination');
        console.error('🚨 [LLMBrain] Session:', sessionId);
        console.error('🚨 [LLMBrain] Attempted appointment ID:', parameters.appointmentId);
        console.error('🚨 [LLMBrain] Valid IDs for this session:', this.conversationManager.getValidAppointmentIds(sessionId));
        return {
          success: false,
          error: 'Invalid appointment reference for this session. Please search for the patient again to get the correct appointment details.'
        };
      }
      
      // Additional validation: Check if appointmentId looks like a list number instead of real ID
      if (parameters.appointmentId === '1' || parameters.appointmentId === '2' || parameters.appointmentId === '3') {
        console.error('🚨 [LLMBrain] CRITICAL: LLM used list number as appointment ID instead of real ID!');
        console.error('🚨 [LLMBrain] This indicates the LLM is not following instructions correctly');
        return {
          success: false,
          error: 'Invalid appointment ID detected. Please try the cancellation process again.'
        };
      }
      
      // CRITICAL FIX: Detect if LLM is using the hard-coded example ID from system prompt
      if (parameters.appointmentId === 'EXAMPLE_ID_123' || 
          parameters.appointmentId === 'EXAMPLE_ID_456' || 
          parameters.appointmentId === 'SEARCH_RESULT_ID_789' ||
          parameters.appointmentId === 'REF_12345' ||
          parameters.appointmentId === '1743832592823624507' ||
          parameters.appointmentId === '1744133738440172081' ||
          parameters.appointmentId === '1743814656973087538') {
        console.error('🚨 [LLMBrain] CRITICAL: LLM used example appointment ID from system prompt instead of actual search results!');
        console.error('🚨 [LLMBrain] This is a prompt confusion issue - LLM ignored actual function call results');
        console.error('🚨 [LLMBrain] Expected actual appointment ID from search_patient_for_cancellation response');
        return {
          success: false,
          error: 'System error: Invalid appointment reference detected. Please restart the cancellation process.'
        };
      }
      
      // CRITICAL FIX: Detect if LLM is using the placeholder text instead of actual appointment ID
      if (parameters.appointmentId === 'ACTUAL_APPOINTMENT_ID_FROM_SEARCH_RESULTS') {
        console.error('🚨 [LLMBrain] CRITICAL: LLM used placeholder text as appointment ID instead of actual search results!');
        console.error('🚨 [LLMBrain] This is a prompt confusion issue - LLM should extract the real ID from function call results');
        console.error('🚨 [LLMBrain] Expected numeric appointment ID from search_patient_for_cancellation response');
        return {
          success: false,
          error: 'System error: Must use the actual appointment ID from search results, not placeholder text. Please restart the cancellation process.'
        };
      }
      
      // CRITICAL FIX: Detect any placeholder-like text patterns
      if (typeof parameters.appointmentId === 'string' && 
          (parameters.appointmentId.includes('ACTUAL') || 
           parameters.appointmentId.includes('PLACEHOLDER') ||
           parameters.appointmentId.includes('EXAMPLE') ||
           parameters.appointmentId.includes('SEARCH_RESULTS'))) {
        console.error('🚨 [LLMBrain] CRITICAL: LLM used placeholder-like text as appointment ID!');
        console.error('🚨 [LLMBrain] Appointment ID contains placeholder keywords:', parameters.appointmentId);
        return {
          success: false,
          error: 'System error: Placeholder pattern detected in appointment ID. Please restart the cancellation process.'
        };
      }
      
      // Validate appointment ID format (should be a long numeric string)
      if (!/^\d{10,}$/.test(parameters.appointmentId)) {
        console.error('🚨 [LLMBrain] Invalid appointment ID format:', parameters.appointmentId);
        return {
          success: false,
          error: 'Invalid appointment ID format. Please try the cancellation process again.'
        };
      }
      
      // Map cancellation reason to description for logging
      const reasonMap: { [key: number]: string } = {
        10: 'Feeling better',
        20: 'Condition worse',
        30: 'Sick',
        40: 'Away',
        50: 'Other',
        60: 'Work'
      };
      
      const reasonDescription = reasonMap[parameters.cancellationReason] || 'Unknown reason';
      console.log(`🗑️ [LLMBrain] Cancelling appointment ${parameters.appointmentId} - Reason: ${reasonDescription} (${parameters.cancellationReason})`);
      console.log(`✅ [LLMBrain] Session validation passed for appointment ID: ${parameters.appointmentId}`);
      
      const result = await bookingAdapter.cancelAppointment(parameters.appointmentId, parameters.cancellationReason);
      
      if (result) {
        console.log('✅ [LLMBrain] Appointment cancelled successfully');
        return {
          success: true,
          message: `Your appointment has been successfully cancelled. Reason: ${reasonDescription}`
        };
      } else {
        console.error('❌ [LLMBrain] Appointment cancellation failed');
        return {
          success: false,
          error: 'Failed to cancel appointment. Please try again or contact us directly.'
        };
      }
      
    } catch (error: any) {
      console.error('❌ [LLMBrain] Error in cancelAppointment:', error);
      return {
        success: false,
        error: 'An error occurred while cancelling the appointment. Please try again.'
      };
    }
  }

  private async rescheduleAppointment(parameters: any, bookingAdapter: BaseBookingAdapter, sessionId: string): Promise<any> {
    try {
      console.log('🔄 [LLMBrain] Rescheduling appointment with parameters:', parameters);
      
      // CRITICAL FIX: Detect if LLM is using hard-coded example IDs from system prompt
      if (parameters.appointmentId === 'EXAMPLE_ID_123' || 
          parameters.appointmentId === 'EXAMPLE_ID_456' || 
          parameters.appointmentId === 'SEARCH_RESULT_ID_789' ||
          parameters.appointmentId === 'REF_12345' ||
          parameters.appointmentId === '1743832592823624507' ||
          parameters.appointmentId === '1744133738440172081' ||
          parameters.appointmentId === '1743814656973087538') {
        console.error('🚨 [LLMBrain] CRITICAL: LLM used example appointment ID from system prompt instead of actual search results!');
        console.error('🚨 [LLMBrain] This is a prompt confusion issue - LLM ignored function call results');
        console.error('🚨 [LLMBrain] Expected: Real appointment ID from search_patient_for_cancellation results');
        console.error('🚨 [LLMBrain] Received: Example ID from system prompt instructions');
        return {
          success: false,
          error: 'Please use the appointment ID from your search results, not the example from instructions.'
        };
      }
      
      // CRITICAL: Validate appointment ID against session's valid appointment IDs (same as cancellation)
      const validAppointmentIds = this.conversationManager.getValidAppointmentIds(sessionId);
      console.log('📋 [LLMBrain] Valid appointment IDs for session:', validAppointmentIds);
      
      if (!validAppointmentIds || validAppointmentIds.length === 0) {
        console.error('🚫 [LLMBrain] No valid appointment IDs found for session:', sessionId);
        return {
          success: false,
          error: 'No valid appointments found for this session. Please search for your appointments first.'
        };
      }
      
      // Check if the appointment ID exists in this session's valid appointments
      if (!validAppointmentIds.includes(parameters.appointmentId)) {
        console.error('🚫 [LLMBrain] Appointment ID not valid for this session:', {
          providedId: parameters.appointmentId,
          validIds: validAppointmentIds,
          sessionId: sessionId
        });
        return {
          success: false,
          error: 'Invalid appointment ID. Please select from your found appointments.'
        };
      }
      
      console.log('✅ [LLMBrain] Session validation passed for appointment ID:', parameters.appointmentId);
      
      // CRITICAL: Use the correct patient ID from session storage, not from LLM parameters
      const sessionPatientId = this.conversationManager.getPatientId(sessionId);
      
      if (!sessionPatientId) {
        console.error('🚫 [LLMBrain] No patient ID found in session storage:', sessionId);
        return {
          success: false,
          error: 'Patient information not found. Please search for your appointments first.'
        };
      }
      
      console.log('✅ [LLMBrain] Using correct patient ID from session:', sessionPatientId);
      console.log('⚠️ [LLMBrain] LLM provided patient ID (ignored):', parameters.patientId);
      
      // Combine date and time into a proper Date object
      const newDateTime = new Date(`${parameters.newDate}T${parameters.newTime}:00`);
      console.log('🔄 [LLMBrain] Rescheduling to new date/time:', newDateTime.toISOString());
      
      // Call the booking adapter to reschedule
      const result = await bookingAdapter.rescheduleAppointment(
        parameters.appointmentId,
        newDateTime,
        parameters.practitionerId,  // ✅ Pass through practitioner ID from availability check
        parameters.serviceId,       // ✅ Pass through service ID from availability check
        sessionPatientId,           // ✅ FIXED: Use correct patient ID from session storage
        parameters.businessId       // ✅ Pass through business ID from configuration
      );
      
      if (result.success) {
        console.log('✅ [LLMBrain] Appointment rescheduled successfully');
        return {
          success: true,
          appointmentId: result.appointmentId,
          newDateTime: result.scheduledDateTime,
          practitioner: result.therapistName,
          message: 'Appointment successfully rescheduled!'
        };
      } else {
        console.error('❌ [LLMBrain] Failed to reschedule appointment:', result.error);
        
        // ✅ CRITICAL: Log detailed error information for debugging
        if (result.details) {
          console.error('❌ [LLMBrain] Detailed error info:', JSON.stringify(result.details, null, 2));
          
          if (result.details.validationErrors) {
            console.error('❌ [LLMBrain] Cliniko validation errors:', JSON.stringify(result.details.validationErrors, null, 2));
          }
        }
        
        return {
          success: false,
          error: result.error || 'Failed to reschedule appointment. Please try again.',
          details: result.details || null
        };
      }
      
    } catch (error: any) {
      console.error('❌ [LLMBrain] Error rescheduling appointment:', error);
      return {
        success: false,
        error: 'An error occurred while rescheduling the appointment. Please try again.'
      };
    }
  }

  private detectAvailabilityRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Specific patterns that indicate availability checking is needed
    const availabilityPatterns = [
      // Time + date requests
      /\b\d{1,2}(:\d{2})?\s*(am|pm)?\s+on\s+\w+/,  // "9am on Thursday"
      /\b(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+\d{1,2}/,  // "Thursday at 9"
      /\bcan\s+i\s+book\s+.*\d{1,2}(:\d{2})?\s*(am|pm)?/,  // "can I book at 9am"
      /\bis\s+.*\d{1,2}(:\d{2})?\s*(am|pm)?.*available/,  // "is 9am available"
      /\bavailable.*\d{1,2}(:\d{2})?\s*(am|pm)?/,  // "available at 9am"
      
      // Direct availability requests
      /\bcheck.*availability/,
      /\bwhat.*times.*available/,
      /\bwhen.*available/,
      /\bavailable.*times/,
      /\bfree.*slots/,
      
      // Specific appointment requests with times
      /\b(standard|first)?\s*appointment.*\d{1,2}(:\d{2})?\s*(am|pm)?/,
      /\b\d{1,2}(:\d{2})?\s*(am|pm)?.*appointment/
    ];
    
    return availabilityPatterns.some(pattern => pattern.test(lowerMessage));
  }

  private detectBookingRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Only trigger booking for confirmed booking requests (not just enquiries)
    const bookingPatterns = [
      /\bbook\s+that/,  // "book that"
      /\byes.*book/,  // "yes, book it"
      /\bconfirm.*booking/,  // "confirm booking"
      /\bschedule.*appointment/,  // "schedule the appointment"
      /\bi'll\s+take\s+that/,  // "I'll take that time"
      /\bthat\s+works/,  // "that works for me"
      /\bperfect.*book/  // "perfect, book it"
    ];
    
    return bookingPatterns.some(pattern => pattern.test(lowerMessage));
  }

  private detectCancellationRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Detect cancellation requests
    const cancellationPatterns = [
      /\bcancel\s+(my\s+)?appointment/,  // "cancel my appointment"
      /\bcancel\s+(an\s+)?appointment/,  // "cancel an appointment"
      /\bneed\s+to\s+cancel/,  // "need to cancel"
      /\bwant\s+to\s+cancel/,  // "want to cancel"
      /\bcancel.*booking/,  // "cancel booking"
      /\bcancel\s+(my\s+)?booking/,  // "cancel my booking"
      /\bi\s+need\s+to\s+cancel/,  // "I need to cancel"
      /\bcan\s+i\s+cancel/,  // "can I cancel"
      /\bhow.*cancel/,  // "how do I cancel"
      /\bcancel.*session/  // "cancel session"
    ];
    
    return cancellationPatterns.some(pattern => pattern.test(lowerMessage));
  }

  /**
   * Detect if user is confirming a reschedule based on conversation context
   */
  private async detectRescheduleConfirmation(message: string, sessionId: string, conversationHistory: any[]): Promise<boolean> {
    const lowerMessage = message.toLowerCase().trim();
    
    // Common confirmation patterns
    const confirmationPatterns = [
      /^yes\s*please\s*$/,          // "yes please"
      /^yes\s*$/,                   // "yes"
      /^yep\s*$/,                   // "yep"
      /^yeah\s*$/,                  // "yeah"
      /^that\s*works\s*$/,          // "that works"
      /^perfect\s*$/,               // "perfect"
      /^sounds\s+good\s*$/,         // "sounds good"
      /^go\s+ahead\s*$/,            // "go ahead"
      /^confirm\s*$/,               // "confirm"
      /^book\s+it\s*$/,             // "book it"
      /^do\s+it\s*$/,               // "do it"
      /^that's\s+fine\s*$/,         // "that's fine"
      /^ok\s*$/,                    // "ok"
      /^okay\s*$/                   // "okay"
    ];
    
    // Check if message matches confirmation pattern
    const isConfirmation = confirmationPatterns.some(pattern => pattern.test(lowerMessage));
    
    if (!isConfirmation) {
      return false;
    }
    
    console.log('🔍 [LLMBrain] Detected confirmation pattern:', lowerMessage);
    
    // Check conversation context for reschedule flow
    const recentMessages = conversationHistory.slice(-10); // Look at last 10 messages
    let hasRescheduleContext = false;
    let hasAvailabilityCheck = false;
    let hasPatientSearch = false;
    
    for (const msg of recentMessages) {
      const content = msg.content?.toLowerCase() || '';
      
      // Check for reschedule mentions
      if (content.includes('reschedule') || content.includes('change') || content.includes('move')) {
        hasRescheduleContext = true;
      }
      
      // Check for availability confirmation context
      if (content.includes('available') || content.includes('check') || content.includes('friday') || 
          content.includes('9:30') || content.includes('time')) {
        hasAvailabilityCheck = true;
      }
      
      // Check for patient search
      if (content.includes('found your patient') || content.includes('upcoming appointment')) {
        hasPatientSearch = true;
      }
    }
    
    // Must have reschedule context AND availability check AND patient search to be a reschedule confirmation
    const isRescheduleConfirmation = hasRescheduleContext && hasAvailabilityCheck && hasPatientSearch;
    
    console.log('🔍 [LLMBrain] Reschedule context analysis:', {
      message: lowerMessage,
      hasRescheduleContext,
      hasAvailabilityCheck,
      hasPatientSearch,
      isRescheduleConfirmation
    });
    
    return isRescheduleConfirmation;
  }

  /**
   * Search the knowledge base for FAQ and clinic information
   */
  private async searchKnowledgeBase(parameters: any): Promise<any> {
    try {
      const { query, category } = parameters;

      console.log('🧠 [LLMBrain] Searching knowledge base:', { query, category });

      // Check if environment variables are available for knowledge retrieval
      const pineconeApiKey = process.env.PINECONE_API_KEY;
      const pineconeIndexName = process.env.PINECONE_INDEX_NAME;
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!pineconeApiKey || !pineconeIndexName || !openaiApiKey) {
        console.warn('⚠️ [LLMBrain] Knowledge retrieval not available - missing environment variables');
        return {
          query,
          results: [],
          totalResults: 0,
          error: 'Knowledge base temporarily unavailable. Please contact our staff directly for this information.'
        };
      }

      // Import dynamically to avoid module loading issues
      const OpenAIClass = (await import('openai')).default;
      const { Pinecone } = await import('@pinecone-database/pinecone');

      const openai = new OpenAIClass({ apiKey: openaiApiKey });
      const pinecone = new Pinecone({ apiKey: pineconeApiKey });
      const index = pinecone.index(pineconeIndexName);

      // Create query embedding (official pattern)
      const embeddingResponse = await openai.embeddings.create({
        input: query,
        model: 'text-embedding-3-small'
      });

      if (!embeddingResponse.data || embeddingResponse.data.length === 0) {
        throw new Error('Failed to create embedding for query');
      }

      const queryVector = embeddingResponse.data[0]!.embedding;

      // Prepare query options
      const queryOptions: any = {
        vector: queryVector,
        topK: 3,
        includeMetadata: true,
        includeValues: false
      };

      // Add category filter if specified
      if (category) {
        queryOptions.filter = {
          category: { $eq: category }
        };
      }

      // Query Pinecone (official pattern)
      const searchResults = await index.query(queryOptions);

      // Filter by minimum score
      const minScore = parseFloat(process.env.KNOWLEDGE_MIN_SCORE || '0.25');
      const relevantResults = searchResults.matches?.filter((match: any) => 
        match.score >= minScore
      ) || [];

      console.log('✅ [LLMBrain] Knowledge search completed:', {
        query: query,
        resultsFound: relevantResults.length,
        totalMatches: searchResults.matches?.length || 0,
        minScore: minScore
      });

      // Format response for LLM
      return {
        query: query,
        results: relevantResults.map((match: any) => ({
          question: match.metadata.question,
          answer: match.metadata.answer,
          category: match.metadata.category,
          relevanceScore: match.score
        })),
        totalResults: relevantResults.length
      };

    } catch (error) {
      console.error('❌ [LLMBrain] Knowledge base search failed:', error);
      
      return {
        query: parameters.query || 'unknown',
        results: [],
        totalResults: 0,
        error: 'Failed to search knowledge base. Please try again or contact our staff for assistance.'
      };
    }
  }

  /**
   * Search knowledge base for context augmentation (RAG pattern from image)
   */
  private async searchKnowledgeForContext(userQuery: string): Promise<any> {
    try {
      // Check if environment variables are available
      const pineconeApiKey = process.env.PINECONE_API_KEY;
      const pineconeIndexName = process.env.PINECONE_INDEX_NAME;
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!pineconeApiKey || !pineconeIndexName || !openaiApiKey) {
        console.warn('⚠️ [LLMBrain] Knowledge retrieval not available - missing environment variables');
        return { query: userQuery, results: [], totalResults: 0 };
      }

      // Import APIs dynamically
      const OpenAIClass = (await import('openai')).default;
      const { Pinecone } = await import('@pinecone-database/pinecone');

      const openai = new OpenAIClass({ apiKey: openaiApiKey });
      const pinecone = new Pinecone({ apiKey: pineconeApiKey });
      const index = pinecone.index(pineconeIndexName);

      // Create query embedding
      const embeddingResponse = await openai.embeddings.create({
        input: userQuery,
        model: 'text-embedding-3-small'
      });

      if (!embeddingResponse.data || embeddingResponse.data.length === 0) {
        return { query: userQuery, results: [], totalResults: 0 };
      }

      const queryVector = embeddingResponse.data[0]!.embedding;

      // Query Pinecone
      const searchResults = await index.query({
        vector: queryVector,
        topK: 3,
        includeMetadata: true,
        includeValues: false
      });

      // Filter by minimum score
      const minScore = parseFloat(process.env.KNOWLEDGE_MIN_SCORE || '0.25');
      const relevantResults = searchResults.matches?.filter((match: any) => 
        match.score >= minScore
      ) || [];

      console.log('🔍 [RAG] Knowledge context search:', {
        query: userQuery,
        resultsFound: relevantResults.length,
        minScore: minScore
      });

      return {
        query: userQuery,
        results: relevantResults.map((match: any) => ({
          question: match.metadata.question,
          answer: match.metadata.answer,
          category: match.metadata.category,
          relevanceScore: match.score
        })),
        totalResults: relevantResults.length
      };

    } catch (error) {
      console.error('❌ [RAG] Knowledge context search failed:', error);
      return { query: userQuery, results: [], totalResults: 0 };
    }
  }
}