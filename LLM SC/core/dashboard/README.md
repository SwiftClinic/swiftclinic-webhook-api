# SwiftClinic Admin Dashboard

A modern, secure admin dashboard for managing your SwiftClinic.ai physiotherapy clinic automation system with **Firebase backend** and **custom domain hosting**.

## 🚀 **Now with Firebase Integration!**

- ✅ **Firebase Firestore** - Persistent cloud database
- ✅ **Custom Domain Ready** - Deploy to `www.swiftclinic.ai/admin`
- ✅ **Real-time Dashboard Stats** - Live data from Firebase
- ✅ **Scalable Architecture** - Cloud-native design

## Features

- 🏥 **Clinic Management**: Connect and manage multiple Cliniko clinic integrations
- 🔗 **Webhook Management**: Create, test, and monitor webhook endpoints
- 📚 **Knowledge Base**: Upload and organize documents for clinic agents
- 📊 **Analytics**: Track performance metrics and insights (now with real data!)
- 🔒 **Secure Authentication**: Password-protected admin access
- 📱 **Responsive Design**: Works on desktop, tablet, and mobile
- 🔥 **Firebase Backend**: Persistent cloud storage with real-time capabilities

## Quick Start (Development)

### Prerequisites

- Node.js 18+
- npm 9+
- Firebase project with Firestore enabled
- Firebase Admin SDK service account JSON

### Installation

1. **Set up Firebase:**
   ```bash
   # Copy template and configure with your Firebase details
   cp firebase-service-account.json.template firebase-service-account.json
   # Edit firebase-service-account.json with your project details
   ```

2. **Install dependencies:**
   ```bash
   cd dashboard/backend
   npm install
   
   cd ../frontend
   npm install
   ```

3. **Configure environment:**
   ```bash
   # Update .env in project root with Firebase settings
   FIREBASE_SERVICE_ACCOUNT_PATH=LLM\ SC/core/dashboard/firebase-service-account.json
   MASTER_PASSWORD=your-secure-password
   ```

4. **Start the development servers:**
   ```bash
   # From project root
   npm run dev:dashboard
   
   # Or individually:
   npm run dev:dashboard-backend  # Port 3001
   npm run dev:dashboard-frontend # Port 3002
   ```

5. **Access the dashboard:**
   - Frontend: http://localhost:3002
   - Backend API: http://localhost:3001

### Default Login

- **Email**: Any valid email (e.g., admin@swiftclinic.ai)
- **Password**: `admin123`

## 🌐 Production Deployment

Your dashboard is now ready to be deployed to **www.swiftclinic.ai/admin**!

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete deployment instructions including:
- Firebase configuration
- Custom domain setup with nginx
- SSL certificate configuration
- Environment variables for production

Quick deployment checklist:
1. ✅ Firebase project configured
2. ✅ Service account JSON ready
3. ✅ Frontend built for production (`npm run build`)
4. ✅ Backend deployed to your server
5. ✅ Web server configured for `/admin` path
6. ✅ Environment variables set

## Dashboard Sections

### 🏠 Dashboard Home
- **Real-time statistics** from Firebase
- Overview of clinic statistics
- Quick action buttons
- Recent activity feed
- System status indicators

### 🏥 Clinics
- View all connected clinics (stored in Firebase)
- Add new Cliniko integrations with auto-detection
- Configure clinic settings
- Monitor connection status

### 🔗 Webhooks
- Create webhook endpoints (stored in Firebase)
- Test webhook functionality
- Monitor webhook activity
- Debug webhook issues

### 📚 Knowledge Base
- Upload documents (PDFs, Word docs, etc.) to Firebase
- Organize by clinic
- Manage agent training materials
- Track document usage

### 📊 Analytics
- Real-time conversation metrics from Firebase
- Booking conversion rates
- Response time analytics
- Client satisfaction scores

## Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- React Router (navigation)
- Axios (HTTP client)
- Heroicons (icons)

**Backend:**
- Node.js + Express
- TypeScript
- **Firebase Firestore** (cloud database)
- Firebase Admin SDK
- JWT/Session authentication
- Security middleware

## Firebase Collections

The dashboard creates and manages these Firestore collections:

- `clinics` - Clinic configurations and settings
- `webhooks` - Webhook endpoints and status
- `knowledge_documents` - Knowledge base files and content
- `analytics` - Performance metrics and statistics
- `health` - System health check data

## Environment Variables

### Backend (.env in project root)
```bash
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_PATH=LLM\ SC/core/dashboard/firebase-service-account.json

# Server Configuration
PORT=3001
NODE_ENV=production
BASE_URL=https://www.swiftclinic.ai

# Security
MASTER_PASSWORD=your-very-secure-password
ALLOWED_ORIGINS=https://www.swiftclinic.ai,https://swiftclinic.ai
```

### Frontend (.env in frontend folder)
```bash
# API Configuration
VITE_API_BASE_URL=https://www.swiftclinic.ai/api

# Authentication
VITE_ADMIN_PASSWORD=admin123

# App Configuration
VITE_APP_NAME=SwiftClinic Admin
VITE_APP_VERSION=1.0.0
```

## API Endpoints

### Authentication
- `GET /health` - Health check
- `GET /api/health` - API health check

### Dashboard
- `GET /api/dashboard/stats` - **NEW!** Real dashboard statistics

### Clinics
- `GET /api/clinics` - List all clinics
- `POST /api/clinics` - Create new clinic
- `PUT /api/clinics/:id` - Update clinic
- `DELETE /api/clinics/:id` - Delete clinic
- `POST /api/clinics/detect-cliniko` - Auto-detect Cliniko settings
- `POST /api/clinics/detect-jane` - Auto-detect Jane App settings

### Webhooks
- `GET /api/webhooks` - List webhooks
- `POST /api/webhooks` - Create webhook
- `POST /api/webhooks/:id/test` - Test webhook
- `DELETE /api/webhooks/:id` - Delete webhook

### Knowledge Base
- `GET /api/knowledge-base/:clinicId` - Get documents
- `POST /api/knowledge-base/:clinicId/upload` - Upload document
- `DELETE /api/knowledge-base/:clinicId/documents/:docId` - Delete document

### Analytics
- `GET /api/analytics/dashboard` - Get dashboard analytics
- `GET /api/analytics/:clinicId` - Get clinic-specific analytics
- `POST /api/analytics` - Record analytics data

## Security Features

- 🔐 Password-based authentication
- 🛡️ Rate limiting on API endpoints
- 🔒 HTTPS enforcement (production)
- 🚫 CORS protection
- 📝 Security headers (Helmet.js)
- 🔍 Request logging and monitoring
- 🔥 **Firebase security rules**
- 🔐 **Encrypted credentials storage**

## Migration from SQLite

If you have existing SQLite data, the Firebase service provides the same interface, making migration seamless. The data structure maps directly:

- SQLite `clinics` table → Firebase `clinics` collection
- SQLite `knowledge_documents` table → Firebase `knowledge_documents` collection
- SQLite `webhooks` table → Firebase `webhooks` collection

## Troubleshooting

### Common Issues

1. **Firebase connection errors**: Check service account JSON and permissions
2. **Port conflicts**: Change ports in package.json scripts
3. **CORS errors**: Update backend CORS configuration for your domain
4. **Build failures**: Check Node.js and npm versions
5. **Auth issues**: Verify environment variables

### Logs

- Backend logs: Console output when running dev server
- Frontend logs: Browser developer console
- Production logs: PM2, systemd, or your hosting provider
- **Firebase logs**: Firebase Console > Functions/Firestore

## Support

For issues or questions:
1. Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment help
2. Review Firebase Console for data and errors
3. Test with the provided examples
4. Check environment variables are correctly set

---

**🎯 Your dashboard will be available at: https://www.swiftclinic.ai/admin**

**Built for SwiftClinic.ai** - Revolutionizing physiotherapy clinic automation with cloud-native technology 