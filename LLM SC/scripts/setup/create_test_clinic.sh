#!/bin/bash

# Replace YOUR_API_KEY_HERE with your actual Cliniko API key
API_KEY="${1:-YOUR_API_KEY_HERE}"

if [ "$API_KEY" = "YOUR_API_KEY_HERE" ]; then
    echo "❌ Please provide your Cliniko API key as the first argument:"
    echo "   ./create_test_clinic.sh YOUR_ACTUAL_API_KEY"
    exit 1
fi

echo "🏥 Creating test clinic with configurable data from environment variables..."

# Use environment variables with fallback defaults
CLINIC_NAME="${FALLBACK_CLINIC_NAME:-Demo Physiotherapy Clinic}"
CLINIC_EMAIL="${FALLBACK_CLINIC_EMAIL:-info@demo-clinic.com}"
CLINIC_PHONE="${FALLBACK_CLINIC_PHONE:-+1-555-123-4567}"
CLINIC_ADDRESS="${FALLBACK_CLINIC_ADDRESS:-123 Health Street, Demo City, DC 12345}"
CLINIC_TIMEZONE="${FALLBACK_CLINIC_TIMEZONE:-America/New_York}"
CLINIC_SERVICES="${FALLBACK_CLINIC_SERVICES:-General Consultation,Follow-up Appointment}"
CLINIKO_SHARD="${CLINIKO_SHARD:-us1}"
CLINIKO_BUSINESS_ID="${CLINIKO_BUSINESS_ID:-your-business-id-here}"

echo "📋 Creating clinic with:"
echo "   Name: $CLINIC_NAME"
echo "   Email: $CLINIC_EMAIL"
echo "   Timezone: $CLINIC_TIMEZONE"
echo "   Services: $CLINIC_SERVICES"
echo ""

curl -X POST http://localhost:3001/api/clinics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'$CLINIC_NAME'",
    "contactInfo": {
      "email": "'$CLINIC_EMAIL'",
      "phone": "'$CLINIC_PHONE'",
      "address": "'$CLINIC_ADDRESS'"
    },
    "businessHours": {
      "monday": { "open": "09:00", "close": "17:00" },
      "tuesday": { "open": "09:00", "close": "17:00" },
      "wednesday": { "open": "09:00", "close": "17:00" },
      "thursday": { "open": "09:00", "close": "17:00" },
      "friday": { "open": "09:00", "close": "17:00" },
      "saturday": { "closed": true },
      "sunday": { "closed": true }
    },
    "services": ["'$(echo $CLINIC_SERVICES | sed 's/,/", "/g')'"],
    "bookingSystem": "cliniko",
    "timezone": "'$CLINIC_TIMEZONE'",
    "apiCredentials": {
      "apiKey": "'$API_KEY'",
      "shard": "'$CLINIKO_SHARD'", 
      "businessId": "'$CLINIKO_BUSINESS_ID'"
    },
    "gdprSettings": {
      "dataRetentionDays": 30,
      "enableDataExport": true,
      "enableDataDeletion": true
    },
    "autoDetected": true
  }' | jq

echo ""
echo "✅ Clinic created using environment configuration!"
echo "💡 To customize: Set environment variables like FALLBACK_CLINIC_NAME, FALLBACK_CLINIC_EMAIL, etc."
echo "📝 Note the webhookUrl for testing the brain."
