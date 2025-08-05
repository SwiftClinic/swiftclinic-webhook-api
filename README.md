# SwiftClinic Admin Dashboard

Automated deployment repository for the SwiftClinic admin dashboard.

## 🚀 Features

- **Auto-Detection**: Automatically detects Cliniko and Jane App configurations
- **Webhook Generation**: Creates unique webhook URLs for each clinic
- **Railway Integration**: Webhook URLs point to live Railway API
- **Multi-Tenant**: Complete data isolation and security
- **Automated Deployment**: GitHub Actions deployment to AWS

## 📋 Quick Start

1. **Configure GitHub Secrets** (see DEPLOYMENT.md)
2. **Push to main branch** → Auto-deploys to AWS
3. **Visit**: https://admin.swiftclinic.ai

## 🔧 Manual Deployment

If GitHub Actions fails, use the backup deployment package:

```bash
# From this directory
cd backend && npm run build && cd ..
mkdir -p deploy-package
cp -r backend/dist deploy-package/
cp backend/package.json deploy-package/
cp .env.production deploy-package/.env
cp firebase-service-account.json deploy-package/
zip -r webhook-updates.zip deploy-package/
```

## 📊 Services

- **Admin Dashboard**: https://admin.swiftclinic.ai
- **Webhook API**: https://swiftclinic-webhook-api-production.up.railway.app
- **Health Check**: https://admin.swiftclinic.ai/api/health

## 📁 Structure

```
├── backend/           # Dashboard backend (TypeScript/Node.js)
├── frontend/          # Dashboard frontend (React/TypeScript)
├── .github/workflows/ # GitHub Actions deployment
├── .env.production    # Production environment variables
└── firebase-service-account.json # Firebase credentials
```

## 🧪 Testing

```bash
# Test health endpoint
curl https://admin.swiftclinic.ai/api/health

# Test auto-detection
curl -X POST https://admin.swiftclinic.ai/api/clinics/detect-cliniko \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"test"}'
```

## 📚 Documentation

- [Deployment Setup](DEPLOYMENT.md) - GitHub Actions configuration
- [API Documentation](backend/README.md) - Backend API reference
- [Frontend Guide](frontend/README.md) - Frontend development guide🚀 Testing automated deployment system
🚀 Testing AWS connection with updated security group
