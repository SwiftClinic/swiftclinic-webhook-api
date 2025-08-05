# 🔍 **Cliniko Auto-Detection Feature**

## 🎯 **Ultra User-Friendly Clinic Setup**

Now users only need their **Cliniko API key** - the system automatically detects everything else!

## 🚀 **New Auto-Detection Flow**

### **Step 1: User enters API key**
```
User Input: "sk_cliniko_api_key_12345..."
```

### **Step 2: Auto-detect shard and businesses**
```bash
curl -X POST http://localhost:3001/api/clinics/detect-cliniko \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk_cliniko_api_key_12345"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shard": "uk2",
    "businesses": [
      {
        "id": "12345",
        "name": "Downtown Physiotherapy",
        "country": "United Kingdom",
        "timezone": "Europe/London"
      }
    ],
    "autoDetected": true,
    "recommendations": {
      "preferredBusinessId": "12345",
      "timezone": "Europe/London",
      "country": "United Kingdom"
    }
  }
}
```

### **Step 3: Test connection (optional)**
```bash
curl -X POST http://localhost:3001/api/clinics/test-cliniko \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk_cliniko_api_key_12345",
    "shard": "uk2",
    "businessId": "12345"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "connectionValid": true,
    "businessExists": true,
    "practitionerCount": 3,
    "appointmentTypeCount": 5,
    "readyForBooking": true
  }
}
```

### **Step 4: Create clinic with auto-detected values**
```bash
curl -X POST http://localhost:3001/api/clinics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Downtown Physiotherapy",
    "contactInfo": {
      "email": "admin@downtown-physio.com",
      "phone": "+44 20 1234 5678",
      "address": "123 Main St, London, UK"
    },
    "businessHours": {
      "monday": {"open": "08:00", "close": "18:00"},
      "tuesday": {"open": "08:00", "close": "18:00"},
      "wednesday": {"open": "08:00", "close": "18:00"},
      "thursday": {"open": "08:00", "close": "18:00"},
      "friday": {"open": "08:00", "close": "17:00"}
    },
    "services": [
      "General Physiotherapy",
      "Sports Injury Rehabilitation",
      "Manual Therapy"
    ],
    "bookingSystem": "cliniko",
    "apiCredentials": {
      "apiKey": "sk_cliniko_api_key_12345"
    },
    "gdprSettings": {
      "dataRetentionDays": 30,
      "allowDataProcessing": true,
      "cookieConsent": true
    },
    "autoDetected": true
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clinic_abc123",
    "name": "Downtown Physiotherapy",
    "webhookUrl": "webhook_xyz789",
    "bookingSystem": "cliniko",
    "createdAt": "2024-01-20T10:30:00.000Z",
    "autoDetected": true,
    "clinikoInfo": {
      "shard": "uk2",
      "businessId": "12345"
    }
  }
}
```

## 🔧 **API Endpoints**

### **1. Auto-Detect Cliniko Configuration**
```
POST /api/clinics/detect-cliniko
```

**Request:**
```json
{
  "apiKey": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shard": "uk2|au1|us1|ca1",
    "businesses": [
      {
        "id": "string",
        "name": "string", 
        "country": "string",
        "timezone": "string"
      }
    ],
    "autoDetected": true,
    "recommendations": {
      "preferredBusinessId": "string",
      "timezone": "string",
      "country": "string"
    }
  }
}
```

### **2. Test Cliniko Connection**
```
POST /api/clinics/test-cliniko
```

**Request:**
```json
{
  "apiKey": "string",
  "shard": "uk2|au1|us1|ca1",
  "businessId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "connectionValid": true,
    "businessExists": true,
    "practitionerCount": 3,
    "appointmentTypeCount": 5,
    "readyForBooking": true
  }
}
```

## 🎨 **Frontend Implementation Example**

```html
<!DOCTYPE html>
<html>
<head>
    <title>Cliniko Auto-Detection Example</title>
    <style>
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .form-group { margin-bottom: 15px; }
        .button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        .success { color: green; }
        .error { color: red; }
        .loading { color: blue; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Auto-Detect Cliniko Setup</h1>
        
        <div class="form-group">
            <label>Cliniko API Key:</label>
            <input type="text" id="apiKey" placeholder="Enter your Cliniko API key..." style="width: 100%; padding: 8px;">
        </div>
        
        <button class="button" onclick="autoDetect()" style="background: #007cba; color: white;">
            🔍 Auto-Detect Configuration
        </button>
        
        <div id="results"></div>
        
        <div id="businessSelection" style="display: none;">
            <h3>Multiple Businesses Found:</h3>
            <select id="businessSelect" style="width: 100%; padding: 8px;">
                <option value="">Select a business...</option>
            </select>
            <button class="button" onclick="testConnection()" style="background: #28a745; color: white;">
                ✅ Test Connection
            </button>
        </div>
        
        <div id="connectionResults"></div>
    </div>

    <script>
        let detectedConfig = null;

        async function autoDetect() {
            const apiKey = document.getElementById('apiKey').value.trim();
            
            if (!apiKey) {
                showResult('error', 'Please enter your Cliniko API key');
                return;
            }

            showResult('loading', 'Auto-detecting Cliniko configuration...');

            try {
                const response = await fetch('http://localhost:3001/api/clinics/detect-cliniko', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ apiKey })
                });

                const data = await response.json();

                if (data.success) {
                    detectedConfig = data.data;
                    
                    let resultHTML = `
                        <div class="success">
                            <h3>✅ Auto-Detection Successful!</h3>
                            <p><strong>Shard:</strong> ${data.data.shard}</p>
                            <p><strong>Country:</strong> ${data.data.recommendations.country}</p>
                            <p><strong>Timezone:</strong> ${data.data.recommendations.timezone}</p>
                        </div>
                    `;

                    if (data.data.businesses.length === 1) {
                        resultHTML += `
                            <p><strong>Business:</strong> ${data.data.businesses[0].name} (ID: ${data.data.businesses[0].id})</p>
                            <button class="button" onclick="testConnection('${data.data.businesses[0].id}')" style="background: #28a745; color: white;">
                                ✅ Test Connection
                            </button>
                        `;
                    } else {
                        // Multiple businesses - show selection
                        const businessSelect = document.getElementById('businessSelect');
                        businessSelect.innerHTML = '<option value="">Select a business...</option>';
                        
                        data.data.businesses.forEach(business => {
                            const option = document.createElement('option');
                            option.value = business.id;
                            option.textContent = `${business.name} (${business.country})`;
                            businessSelect.appendChild(option);
                        });
                        
                        document.getElementById('businessSelection').style.display = 'block';
                    }

                    showResult('success', resultHTML);
                } else {
                    showResult('error', `Detection failed: ${data.error.message}`);
                }

            } catch (error) {
                showResult('error', `Error: ${error.message}`);
            }
        }

        async function testConnection(businessId = null) {
            if (!detectedConfig) {
                showResult('error', 'Please run auto-detection first');
                return;
            }

            const selectedBusinessId = businessId || document.getElementById('businessSelect')?.value;
            
            if (!selectedBusinessId) {
                showResult('error', 'Please select a business');
                return;
            }

            showConnectionResult('loading', 'Testing connection...');

            try {
                const response = await fetch('http://localhost:3001/api/clinics/test-cliniko', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        apiKey: document.getElementById('apiKey').value,
                        shard: detectedConfig.shard,
                        businessId: selectedBusinessId
                    })
                });

                const data = await response.json();

                if (data.success) {
                    let resultHTML = `
                        <div class="success">
                            <h3>✅ Connection Test Successful!</h3>
                            <p><strong>Practitioners:</strong> ${data.data.practitionerCount}</p>
                            <p><strong>Appointment Types:</strong> ${data.data.appointmentTypeCount}</p>
                            <p><strong>Ready for Booking:</strong> ${data.data.readyForBooking ? 'Yes ✅' : 'No ❌'}</p>
                        </div>
                    `;

                    if (data.data.readyForBooking) {
                        resultHTML += `
                            <button class="button" onclick="createClinic('${selectedBusinessId}')" style="background: #dc3545; color: white;">
                                🚀 Create Clinic
                            </button>
                        `;
                    }

                    showConnectionResult('success', resultHTML);
                } else {
                    showConnectionResult('error', `Connection test failed: ${data.error.message}`);
                }

            } catch (error) {
                showConnectionResult('error', `Error: ${error.message}`);
            }
        }

        function createClinic(businessId) {
            alert(`Ready to create clinic with:
            
Shard: ${detectedConfig.shard}
Business ID: ${businessId}
API Key: ${document.getElementById('apiKey').value}

This would now call the clinic creation API with all auto-detected values!`);
        }

        function showResult(type, message) {
            document.getElementById('results').innerHTML = `<div class="${type}">${message}</div>`;
        }

        function showConnectionResult(type, message) {
            document.getElementById('connectionResults').innerHTML = `<div class="${type}">${message}</div>`;
        }
    </script>
</body>
</html>
```

## 🎯 **User Experience Flow**

### **Perfect UX Flow:**

1. **User enters API key** → Click "Auto-Detect" 
2. **System detects everything** → Shows shard, businesses, timezone
3. **Single business?** → Auto-select and test connection
4. **Multiple businesses?** → User picks from dropdown
5. **Test connection** → Shows practitioners, appointment types, readiness
6. **Create clinic** → All fields pre-populated!

### **What Gets Auto-Detected:**

✅ **Shard** (uk2, au1, us1, ca1)  
✅ **Business ID(s)** - with names and countries  
✅ **Timezone** - for proper scheduling  
✅ **Country** - for localization  
✅ **Practitioner Count** - validation  
✅ **Appointment Types** - readiness check  
✅ **Connection Status** - health verification  

## 🔥 **Enhanced Clinic Creation**

The clinic creation endpoint now:

✅ **Auto-detects missing values** if only API key provided  
✅ **Validates all connections** before saving  
✅ **Handles multiple businesses** gracefully  
✅ **Returns auto-detection status** in response  
✅ **Provides detailed error messages** for troubleshooting  

## 🎯 **Error Handling**

### **Common Scenarios:**

- **Invalid API Key** → Clear error message
- **Multiple Businesses** → User selection required
- **No Practitioners** → Warning about booking readiness
- **No Appointment Types** → Setup guidance
- **Connection Timeout** → Retry suggestion
- **Shard Not Found** → Manual configuration option

## 🚀 **Benefits**

### **For Users:**
✅ **1-Click Setup** - Just paste API key  
✅ **No Technical Knowledge** - System handles complexity  
✅ **Instant Validation** - Know if setup works immediately  
✅ **Clear Guidance** - Helpful error messages and next steps  

### **For Developers:**
✅ **Robust Error Handling** - Comprehensive validation  
✅ **Detailed Logging** - Easy troubleshooting  
✅ **Extensible Design** - Easy to add more booking systems  
✅ **Production Ready** - Timeouts, retries, and graceful failures  

**The clinic setup is now incredibly user-friendly! 🎉** 