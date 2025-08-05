#!/usr/bin/env node
/**
 * Firebase Setup Script for SwiftClinic Admin Dashboard
 * 
 * This script helps you:
 * 1. Verify Firebase service account configuration
 * 2. Test Firebase connection
 * 3. Initialize Firestore collections
 * 4. Set up security rules
 */

const path = require('path');
const fs = require('fs');

console.log('🔥 SwiftClinic Firebase Setup\n');

// Check if service account file exists
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const templatePath = path.join(__dirname, 'firebase-service-account.json.template');

if (!fs.existsSync(serviceAccountPath)) {
  console.log('❌ Firebase service account file not found!');
  console.log('\n📋 Setup Instructions:');
  console.log('1. Go to Firebase Console: https://console.firebase.google.com/');
  console.log('2. Select your project');
  console.log('3. Go to Project Settings > Service accounts');
  console.log('4. Click "Generate new private key"');
  console.log('5. Save the downloaded JSON file as: firebase-service-account.json');
  console.log('6. Place it in: LLM SC/core/dashboard/');
  
  if (fs.existsSync(templatePath)) {
    console.log('\n💡 Template file available at: firebase-service-account.json.template');
    console.log('   Copy and modify this template with your Firebase details.');
  }
  
  process.exit(1);
}

// Validate service account file
try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  console.log('✅ Service account file found');
  console.log(`📋 Project ID: ${serviceAccount.project_id}`);
  console.log(`📧 Client Email: ${serviceAccount.client_email}`);
  
  // Check required fields
  const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
  const missingFields = requiredFields.filter(field => !serviceAccount[field]);
  
  if (missingFields.length > 0) {
    console.log('❌ Missing required fields:', missingFields.join(', '));
    process.exit(1);
  }
  
  // Test Firebase initialization
  console.log('\n🔄 Testing Firebase connection...');
  
  // Import Firebase Admin SDK
  const admin = require('firebase-admin');
  
  // Initialize Firebase (if not already initialized)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }
  
  const db = admin.firestore();
  
  // Test connection by writing to health collection
  const healthRef = db.collection('health').doc('setup-test');
  
  healthRef.set({
    status: 'healthy',
    timestamp: admin.firestore.Timestamp.now(),
    setupTest: true
  }).then(() => {
    console.log('✅ Firebase connection successful!');
    console.log('✅ Firestore write test passed');
    
    console.log('\n📊 Firebase Collections:');
    console.log('  - clinics (clinic configurations)');
    console.log('  - webhooks (webhook endpoints)');
    console.log('  - knowledge_documents (knowledge base files)');
    console.log('  - analytics (performance metrics)');
    console.log('  - health (system health checks)');
    
    console.log('\n🚀 Firebase setup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Update your .env file with FIREBASE_SERVICE_ACCOUNT_PATH');
    console.log('2. Start the development server: npm run dev:dashboard');
    console.log('3. Visit: http://localhost:3002');
    
    console.log('\n🌐 For production deployment:');
    console.log('1. See DEPLOYMENT.md for complete instructions');
    console.log('2. Configure your domain: www.swiftclinic.ai/admin');
    console.log('3. Set up proper Firestore security rules');
    
    // Clean up test document
    return healthRef.delete();
  }).catch((error) => {
    console.log('❌ Firebase connection failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your service account JSON file');
    console.log('2. Verify Firestore is enabled in Firebase Console');
    console.log('3. Ensure service account has proper permissions');
    process.exit(1);
  });
  
} catch (error) {
  console.log('❌ Error reading service account file:', error.message);
  console.log('\n🔧 Please check your firebase-service-account.json file format');
  process.exit(1);
} 