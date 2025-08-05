#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Try different possible database paths
const possiblePaths = [
  path.join(__dirname, '../core/shared/database/clinic.db'),
  path.join(__dirname, '../core/shared/database/clinic-test.db'),
  path.join(__dirname, '../core/shared/database/physio-chat.db'),
  path.join(__dirname, '../core/webhook-api/database/clinic.db'),
  path.join(__dirname, '../core/webhook-api/clinic.db')
];

console.log('🔧 Fixing timezone for existing Swift Clinic Test...');

let dbPath = null;
for (const path of possiblePaths) {
  if (fs.existsSync(path)) {
    dbPath = path;
    console.log(`✅ Found database at: ${path}`);
    break;
  }
}

if (!dbPath) {
  console.log('🔍 Database not found in expected locations. Looking for any .db files...');
  // Try to find any .db files
  const findResult = require('child_process').execSync('find ../core -name "*.db" 2>/dev/null || true', {encoding: 'utf8'});
  if (findResult.trim()) {
    console.log('📁 Found database files:');
    console.log(findResult);
    dbPath = findResult.trim().split('\n')[0]; // Use first found
  } else {
    console.error('❌ No database found. The clinic may not be created yet.');
    console.log('💡 Please ensure the clinic is created first by running the webhook API.');
    process.exit(1);
  }
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to clinic database');
  
  // First, let's see what tables exist
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('❌ Error listing tables:', err.message);
      process.exit(1);
    }
    
    console.log('📋 Available tables:', tables.map(t => t.name));
    
    if (tables.length === 0) {
      console.log('ℹ️  No tables found. Database is empty.');
      db.close();
      process.exit(0);
    }
    
    // Check if clinics table exists
    const hasClinicTable = tables.some(t => t.name === 'clinics');
    if (!hasClinicTable) {
      console.log('❌ No clinics table found. Looking for alternative table structures...');
      
      // Show schema for all tables
      tables.forEach(table => {
        db.all(`PRAGMA table_info(${table.name})`, (err, info) => {
          if (!err) {
            console.log(`\n📝 Schema for table '${table.name}':`);
            info.forEach(col => console.log(`  - ${col.name}: ${col.type}`));
          }
        });
      });
      
      setTimeout(() => {
        db.close();
      }, 1000);
      return;
    }
    
    // If clinics table exists, proceed with timezone update
    updateTimezone();
  });
});

function updateTimezone() {
  db.run(
    `UPDATE clinics SET timezone = 'Europe/London' WHERE timezone = 'UTC' OR timezone IS NULL`,
    function(err) {
      if (err) {
        console.error('❌ Error updating timezone:', err.message);
        process.exit(1);
      }
      
      console.log(`✅ Updated timezone for ${this.changes} clinic(s)`);
      
      // Verify the update
      db.get(`SELECT name, timezone FROM clinics LIMIT 1`, (err, row) => {
        if (err) {
          console.error('❌ Error verifying update:', err.message);
        } else if (row) {
          console.log(`✅ Verified: ${row.name} now has timezone: ${row.timezone}`);
        } else {
          console.log('ℹ️  No clinics found in database');
        }
        
        db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err.message);
          } else {
            console.log('✅ Database connection closed');
            console.log('🎉 Timezone fix complete! Restart the webhook API to apply changes.');
          }
        });
      });
    }
  );
} 