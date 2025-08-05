# 🏥 Physio Chat System

A secure, GDPR-compliant, intelligent webchat system for physiotherapy clinics with centralized management dashboard.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PHYSIO CHAT SYSTEM                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Dashboard     │    │   Webhook API   │                │
│  │   (Frontend)    │◄──►│   (LLM Brain)   │                │
│  │                 │    │                 │                │
│  │ • Clinic Setup  │    │ • AI Chat       │                │
│  │ • Knowledge Mgt │    │ • Booking Ops   │                │
│  │ • Webhook URLs  │    │ • GDPR Compliant│                │
│  └─────────────────┘    └─────────────────┘                │
│           │                       │                        │
│           ▼                       ▼                        │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Dashboard     │    │   Clinic        │                │
│  │   Backend       │    │   Websites      │                │
│  │                 │    │                 │                │
│  │ • Secure DB     │    │ • Webchat UI    │                │
│  │ • Encryption    │    │ • User Facing   │                │
│  │ • GDPR Tools    │    │                 │                │
│  └─────────────────┘    └─────────────────┘                │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                       │
│  │   Booking APIs  │                                       │
│  │                 │                                       │
│  │ • Jane App      │                                       │
│  │ • Acuity        │                                       │
│  │ • SimplePractice│                                       │
│  │ • Custom APIs   │                                       │
│  └─────────────────┘                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## ✨ Key Features

### 🔒 Security & Compliance
- **AES-256-GCM encryption** for all sensitive data
- **GDPR-compliant** data handling with automatic retention and deletion
- **Rate limiting** and DDoS protection
- **Security logging** and audit trails
- **Input sanitization** and XSS protection

### 🏥 Clinic Management
- **Multi-clinic support** with isolated configurations
- **Unique webhook URLs** for each clinic
- **Booking system integrations** (Jane App, Acuity, SimplePractice, etc.)
- **Knowledge base management** for FAQs and policies
- **Business hours and service configuration**

### 🤖 AI Chat Features
- **Natural conversation flow** using advanced LLMs
- **Function calling** for structured task execution
- **Context preservation** across conversation sessions
- **Automatic PII detection** and anonymization
- **Fallback to human handoff** when needed

### 📊 Management Dashboard
- **Easy clinic setup** with guided configuration
- **Real-time monitoring** and analytics
- **Knowledge base uploads** (PDFs, text, web content)
- **API credential management** (encrypted storage)
- **GDPR compliance tools** and data export

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm 9+
- Git

### 1. Install Dependencies
```bash
# Install main project dependencies
npm install

# Install dashboard backend dependencies
cd dashboard/backend && npm install

# Install dashboard frontend dependencies (when created)
# cd dashboard/frontend && npm install
```

### 2. Configure Environment
```bash
# Copy environment template
cp configs/environment.template .env

# Edit the .env file with your secure passwords
# CRITICAL: Change MASTER_PASSWORD and SESSION_SECRET
```

### 3. Start Development Servers
```bash
# Start dashboard backend
npm run dev:dashboard-backend

# Start webhook API (when created)
# npm run dev:webhook

# Start all services
# npm run dev:all
```

### 4. Access Dashboard
- Dashboard Backend: http://localhost:3001
- Dashboard Frontend: http://localhost:3000 (when created)
- Health Check: http://localhost:3001/health

## 🏥 Setting Up Your First Clinic

### 1. Create Clinic Configuration
```bash
POST /api/clinics
Content-Type: application/json

{
  "name": "Downtown Physiotherapy",
  "contactInfo": {
    "email": "admin@downtown-physio.com",
    "phone": "+1234567890", 
    "address": "123 Main St, City, State"
  },
  "businessHours": {
    "monday": { "open": "08:00", "close": "18:00" },
    "tuesday": { "open": "08:00", "close": "18:00" },
    "wednesday": { "open": "08:00", "close": "18:00" },
    "thursday": { "open": "08:00", "close": "18:00" },
    "friday": { "open": "08:00", "close": "17:00" },
    "saturday": null,
    "sunday": null
  },
  "services": [
    "General Physiotherapy",
    "Sports Injury Rehabilitation", 
    "Post-Surgery Recovery",
    "Pain Management"
  ],
  "bookingSystem": "jane-app",
  "apiCredentials": {
    "apiKey": "your-jane-app-api-key",
    "secret": "your-jane-app-secret"
  },
  "gdprSettings": {
    "dataRetentionDays": 30,
    "allowDataProcessing": true,
    "cookieConsent": true,
    "privacyPolicyUrl": "https://downtown-physio.com/privacy"
  }
}
```

### 2. Get Your Webhook URL
```bash
GET /api/clinics/{clinic-id}/webhook-url
```

Response:
```json
{
  "success": true,
  "data": {
    "webhookUrl": "webhook_abc123def456...",
    "fullWebhookEndpoint": "https://your-domain.com/webhook/webhook_abc123def456..."
  }
}
```

### 3. Add to Your Website
```html
<!-- Add this to your clinic's website -->
<script src="your-webchat-widget.js"></script>
<script>
  PhysioChat.init({
    webhookUrl: 'webhook_abc123def456...',
    // Additional customization options
  });
</script>
```

## 🔧 API Documentation

### Clinic Management
- `GET /api/clinics` - List all clinics
- `POST /api/clinics` - Create new clinic
- `GET /api/clinics/:id` - Get clinic details
- `PUT /api/clinics/:id` - Update clinic
- `DELETE /api/clinics/:id` - Delete clinic (GDPR compliant)
- `GET /api/clinics/:id/webhook-url` - Get webhook URL

### Knowledge Base Management
- `GET /api/knowledge-base/:clinicId` - Get knowledge base
- `POST /api/knowledge-base/:clinicId/documents` - Upload document
- `POST /api/knowledge-base/:clinicId/faqs` - Add FAQ

### Analytics & Monitoring
- `GET /api/analytics/dashboard` - Get dashboard analytics
- `GET /health` - System health check

## 📁 Project Structure

```
physio-chat-system/
├── dashboard/
│   ├── backend/          # Dashboard API server
│   │   ├── src/
│   │   │   ├── index.ts          # Main server
│   │   │   ├── routes/           # API routes
│   │   │   ├── middleware/       # Security & validation
│   │   │   └── utils/            # Utilities & logging
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/         # Dashboard UI (to be created)
├── webhook-api/          # LLM webhook service (to be created)
├── shared/               # Shared utilities
│   ├── database/         # Secure database layer
│   ├── security/         # Encryption & GDPR tools
│   └── types/            # TypeScript definitions
├── data/                 # Local database storage
├── logs/                 # Security & audit logs
├── configs/              # Configuration templates
├── docs/                 # Documentation
└── package.json          # Main project config
```

## 🔐 Security Features

### Data Protection
- **AES-256-GCM encryption** for API credentials
- **PBKDF2 key derivation** with 100,000 iterations
- **Secure session management** with httpOnly cookies
- **Input validation** and sanitization on all endpoints
- **SQL injection prevention** with parameterized queries

### GDPR Compliance
- **Automatic data retention** with configurable expiry
- **PII detection** and anonymization in logs
- **Right to erasure** implementation
- **Data processing consent** tracking
- **Audit logging** for compliance reporting

### Monitoring & Logging
- **Security incident detection** and alerting
- **Request rate limiting** per IP and session
- **Comprehensive audit trails** for data access
- **Error handling** without information leakage
- **Health monitoring** and uptime tracking

## 🚨 Security Configuration

### Required Environment Variables
```bash
# Generate strong passwords
MASTER_PASSWORD=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 64)

# Set in your .env file
echo "MASTER_PASSWORD=$MASTER_PASSWORD" >> .env
echo "SESSION_SECRET=$SESSION_SECRET" >> .env
```

### Production Deployment Checklist
- [ ] Change all default passwords
- [ ] Enable HTTPS with valid SSL certificates
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy
- [ ] Review GDPR compliance settings
- [ ] Test incident response procedures

## 🤝 Contributing

This is a private system built for specific clinic management needs. For issues or enhancements:

1. Review security implications of any changes
2. Ensure GDPR compliance is maintained
3. Test thoroughly in development environment
4. Document any new configuration requirements

## 📞 Support

For technical support or security concerns:
- Email: [Your Support Email]
- Security Issues: [Your Security Contact]
- GDPR/DPO Contact: [Data Protection Officer]

---

**⚠️ Security Notice**: This system handles sensitive healthcare data. Always follow security best practices and comply with local data protection regulations. 