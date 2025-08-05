# 🧠 Cliniko Brain Example - Complete System Walkthrough

This document demonstrates how the **Cliniko Brain** works within the complete physio chat system using the **correct Cliniko API endpoints**.

## 🏗️ System Architecture

```
Patient Website Chat Widget
           ↓
POST /webhook/webhook_abc123
           ↓
Webhook API (Port 3002)
           ↓
LLM Brain (OpenAI GPT-4)
           ↓
Cliniko Adapter (with UK2/AU1 shard support)
           ↓
Cliniko API (api.uk2.cliniko.com)
```

## 🔧 **Updated Cliniko API Integration**

The brain now uses the **correct** Cliniko API endpoints:

### **Available Times**
```
GET /businesses/{business_id}/practitioners/{practitioner_id}/appointment_types/{appointment_type_id}/available_times
```

### **Book Appointment**
```
POST /individual_appointments
```

### **Find/Create Patients**
```
GET /patients
POST /patients
```

### **Cancel Appointments**
```
PATCH /individual_appointments/{id}/cancel
```

### **Reschedule Appointments**
```
PATCH /individual_appointments/{id}
```

### **Find Appointments**
```
GET /individual_appointments
```

## 🚀 Complete Setup and Test

### 1. **Start Both Services**

```bash
# Terminal 1: Start Dashboard Backend
npm run dev:dashboard-backend

# Terminal 2: Start Webhook API (Cliniko Brain)
npm run dev:webhook

# Or start both together:
npm run dev:all
```

### 2. **Create a Clinic via Dashboard API (Updated)**

```bash
curl -X POST http://localhost:3001/api/clinics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Downtown Physiotherapy",
    "contactInfo": {
      "email": "admin@downtown-physio.com",
      "phone": "+1234567890",
      "address": "123 Main St, Toronto, ON"
    },
    "businessHours": {
      "monday": {"open": "08:00", "close": "18:00"},
      "tuesday": {"open": "08:00", "close": "18:00"},
      "wednesday": {"open": "08:00", "close": "18:00"},
      "thursday": {"open": "08:00", "close": "18:00"},
      "friday": {"open": "08:00", "close": "17:00"},
      "saturday": null,
      "sunday": null
    },
    "services": [
      "General Physiotherapy",
      "Sports Injury Rehabilitation", 
      "Post-Surgery Recovery",
      "Manual Therapy",
      "Dry Needling"
    ],
    "bookingSystem": "cliniko",
    "apiCredentials": {
      "apiKey": "your-cliniko-api-key-here",
      "shard": "uk2",
      "businessId": "your-business-id-here"
    },
    "gdprSettings": {
      "dataRetentionDays": 30,
      "allowDataProcessing": true,
      "cookieConsent": true,
      "privacyPolicyUrl": "https://downtown-physio.com/privacy"
    }
  }'
```

**📋 Required Cliniko Fields:**
- **`apiKey`**: Your Cliniko API key
- **`shard`**: Your Cliniko shard (e.g., 'uk2', 'au1', 'us1', 'ca1')
- **`businessId`**: Your Cliniko business ID (required for availability API)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clinic_abc123",
    "name": "Downtown Physiotherapy",
    "webhookUrl": "webhook_xyz789abc123def456",
    "bookingSystem": "cliniko",
    "createdAt": "2024-01-20T10:30:00.000Z"
  }
}
```

### 3. **Test the Cliniko Connection**

```bash
curl -X POST http://localhost:3002/test-connection/webhook_xyz789abc123def456
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "bookingSystem": "cliniko",
    "message": "Successfully connected to Cliniko",
    "details": {
      "systemInfo": {
        "name": "Cliniko",
        "version": "1.0.0",
        "features": ["booking", "cancellation", "rescheduling"]
      },
      "testedAt": "2024-01-20T10:35:00.000Z"
    }
  }
}
```

## 💬 Chat Examples with the Cliniko Brain

### Example 1: Simple Booking Request

**Patient Message:**
```bash
curl -X POST http://localhost:3002/webhook/webhook_xyz789abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hi, I need to book an appointment for my back pain",
    "sessionId": "session_001",
    "userConsent": true
  }'
```

**LLM Brain Processing:**
1. **Intent Detection:** "booking" (confidence: 0.8)
2. **Function Called:** `check_availability` 
3. **Cliniko API Called:** `GET /businesses/{businessId}/practitioners/{practitionerId}/appointment_types/{appointmentTypeId}/available_times`
4. **Response Generated:** Natural language with available options

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "I'd be happy to help you book an appointment for your back pain. I can see we have several options available this week for general physiotherapy or sports injury rehabilitation. What day works best for you? We have availability:\n\n• Tuesday at 10:00 AM with Dr. Sarah Johnson\n• Wednesday at 2:30 PM with Dr. Mike Chen\n• Thursday at 9:00 AM with Dr. Sarah Johnson\n• Friday at 11:00 AM with Dr. Mike Chen\n\nWould any of these times work for you?",
    "sessionId": "session_001",
    "requiresFollowUp": true,
    "metadata": {
      "intent": "check-availability",
      "confidence": 0.9,
      "functionCallsExecuted": 1
    }
  }
}
```

### Example 2: Complete Booking Process

**Follow-up Message:**
```bash
curl -X POST http://localhost:3002/webhook/webhook_xyz789abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Yes, Tuesday at 10 AM with Dr. Johnson sounds perfect. My name is John Smith and my phone is 416-555-0123",
    "sessionId": "session_001",
    "userConsent": true
  }'
```

**LLM Brain Processing:**
1. **Intent Detection:** "book-appointment" (confidence: 0.9)
2. **Data Extraction:** 
   - Name: "John Smith"
   - Phone: "416-555-0123"
   - Time: "Tuesday 10:00 AM"
   - Practitioner: "Dr. Johnson"
3. **Function Called:** `book_appointment`
4. **Cliniko API Calls:** 
   - `GET /patients` (find patient)
   - `POST /patients` (create if not found)
   - `POST /individual_appointments` (create appointment)

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Perfect! I've successfully booked your appointment:\n\n📅 **Appointment Confirmed**\n• **Date:** Tuesday, January 23rd at 10:00 AM\n• **Practitioner:** Dr. Sarah Johnson\n• **Service:** General Physiotherapy (45 minutes)\n• **Patient:** John Smith\n• **Confirmation Code:** CLN-12345\n\nYou'll receive a confirmation email shortly. Please arrive 10 minutes early for your first visit to complete any necessary paperwork.\n\nIs there anything else I can help you with today?",
    "sessionId": "session_001", 
    "requiresFollowUp": false,
    "metadata": {
      "intent": "book-appointment",
      "confidence": 0.95,
      "functionCallsExecuted": 1
    }
  }
}
```

### Example 3: Cancellation Request

**Patient Message:**
```bash
curl -X POST http://localhost:3002/webhook/webhook_xyz789abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need to cancel my appointment. My confirmation code is CLN-12345",
    "sessionId": "session_002",
    "userConsent": true
  }'
```

**LLM Brain Processing:**
1. **Intent Detection:** "cancel-appointment" (confidence: 0.9)
2. **Function Called:** `cancel_appointment`
3. **Cliniko API Called:** `PATCH /individual_appointments/12345/cancel`

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "I've successfully cancelled your appointment (CLN-12345) for Tuesday, January 23rd at 10:00 AM with Dr. Sarah Johnson.\n\nYour appointment slot is now available for other patients. If you'd like to reschedule, I'd be happy to help you find a new time that works better.\n\nWould you like me to check for alternative appointment times?",
    "sessionId": "session_002",
    "requiresFollowUp": true,
    "metadata": {
      "intent": "cancel-appointment", 
      "confidence": 0.9,
      "functionCallsExecuted": 1
    }
  }
}
```

### Example 4: Information Request

**Patient Message:**
```bash
curl -X POST http://localhost:3002/webhook/webhook_xyz789abc123def456 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are your business hours and what services do you offer?",
    "sessionId": "session_003",
    "userConsent": true
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Here's information about Downtown Physiotherapy:\n\n🕒 **Business Hours:**\n• Monday - Thursday: 8:00 AM - 6:00 PM\n• Friday: 8:00 AM - 5:00 PM\n• Saturday & Sunday: Closed\n\n🏥 **Services We Offer:**\n• General Physiotherapy\n• Sports Injury Rehabilitation\n• Post-Surgery Recovery\n• Manual Therapy\n• Dry Needling\n\n📍 **Location:**\n123 Main St, Toronto, ON\n📞 Phone: +1234567890\n📧 Email: admin@downtown-physio.com\n\nWould you like to book an appointment for any of these services?",
    "sessionId": "session_003",
    "requiresFollowUp": true,
    "metadata": {
      "intent": "information",
      "confidence": 0.7,
      "functionCallsExecuted": 0
    }
  }
}
```

## 🔄 How the Updated Cliniko Brain Works

### 1. **Shard-Aware API Connection**
- Dynamically constructs API base URL: `https://api.{shard}.cliniko.com/v1`
- Supports all Cliniko shards: `uk2`, `au1`, `us1`, `ca1`
- Defaults to `uk2` if shard not specified

### 2. **Business ID Integration**
- Uses business ID for availability checks
- Endpoint: `/businesses/{businessId}/practitioners/{practitionerId}/appointment_types/{appointmentTypeId}/available_times`
- Required for proper appointment slot retrieval

### 3. **Correct API Endpoints**
```typescript
// Available times (NEW correct endpoint)
GET /businesses/{businessId}/practitioners/{practitionerId}/appointment_types/{appointmentTypeId}/available_times

// Individual appointments (Updated)
POST /individual_appointments     // Create
GET /individual_appointments      // Find
PATCH /individual_appointments/{id}     // Reschedule
PATCH /individual_appointments/{id}/cancel  // Cancel

// Patient management (Updated)
GET /patients?q={search}&email={email}    // Search patients
POST /patients                           // Create patient
```

### 4. **Enhanced Error Handling**
- Validates business ID presence
- Validates shard format
- Better API error messages
- Graceful fallbacks for API issues

### 5. **Improved Data Handling**
- Correct field mapping (`appointment_start` vs `starts_at`)
- Proper patient search with query parameters
- Enhanced appointment data structure

## 🔧 **Required Cliniko Setup**

### **Finding Your Cliniko Details:**

1. **API Key**: Cliniko Settings → Integrations → API
2. **Shard**: Look at your Cliniko URL (e.g., `https://app.uk2.cliniko.com` = shard `uk2`)
3. **Business ID**: API call to `/businesses` or check in URL patterns

### **Common Shards:**
- **UK2**: United Kingdom (most common)
- **AU1**: Australia 
- **US1**: United States
- **CA1**: Canada

## 🎯 Key Improvements

### ✅ **Correct API Endpoints**
- Uses official Cliniko API structure
- Proper business/practitioner/appointment_type hierarchy
- Individual appointments endpoint for all booking operations

### ✅ **Multi-Shard Support**
- Dynamic shard selection
- Automatic URL construction
- Support for global Cliniko deployments

### ✅ **Enhanced Validation**
- Business ID requirement
- Shard validation
- Comprehensive credential checking

### ✅ **Better Error Handling**
- Specific Cliniko error messages
- API timeout handling
- Graceful degradation

## 🚀 Next Steps

1. **Get Your Cliniko Details**:
   - API Key from your Cliniko settings
   - Note your shard (from your Cliniko URL)
   - Find your business ID

2. **Test the Connection**:
   - Use the updated clinic creation format
   - Test with the connection endpoint

3. **Start Booking**:
   - Send real patient messages
   - Test the full booking flow

The **Updated Cliniko Brain** now properly integrates with Cliniko's actual API structure! 🎉

**Ready to handle real patient conversations with proper Cliniko integration!** 🔥 