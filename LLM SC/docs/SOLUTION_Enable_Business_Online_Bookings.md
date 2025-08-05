# 🎯 SOLUTION: Enable Business Online Bookings

## Root Cause Found ✅

The `available_times` API endpoints are returning 404 because **your business is not enabled for online bookings** at the business level.

**Current Status:**
- ❌ Business: `show_in_online_bookings: false` 
- ✅ Practitioner: `show_in_online_bookings: true`
- ✅ Standard Appointment: `show_in_online_bookings: true`
- ✅ First Appointment: `show_in_online_bookings: true`

## Steps to Fix

### 1. Login to Cliniko Admin Panel
- Go to your Cliniko account: `https://your-account.cliniko.com`
- Login with your admin credentials

### 2. Navigate to Online Bookings Settings
- Click **Settings** in the main menu
- Select **Online Bookings** from the settings menu

### 3. Enable Business Online Bookings
- Find the setting **"Show this business in online bookings"**
- **Enable/Toggle this setting to ON**
- Make sure it's set to `True` or checked

### 4. Configure Additional Settings (Optional)
- Set **Lead time** for advance bookings
- Configure **Cancellation policy**
- Choose whether to **show prices**
- Set **confirmation policies**

### 5. Save Settings
- Click **Save** or **Update** to apply changes
- Wait a few minutes for settings to propagate

## After Enabling

Once you've enabled business-level online bookings:

### Test the Available Times Endpoint:
```bash
curl -X GET \
  "https://api.uk2.cliniko.com/v1/businesses/1740586889502532285/practitioners/1740586886222586607/appointment_types/1740586888823054369/available_times?from=2025-08-01&to=2025-08-07" \
  -H "Authorization: Basic $(echo -n 'YOUR_API_KEY:' | base64)" \
  -H "Accept: application/json"
```

### Or run our test script:
```bash
python3 test_next_available_time.py
```

## Expected Result

After enabling business online bookings, the `available_times` endpoints should:
- Return status **200 OK** instead of 404
- Provide available time slots in JSON format
- Work with your n8n workflow

## Your Account Details

- **Business**: SwiftClinic Test (ID: 1740586889502532285)
- **Practitioner**: Henry Juliano (ID: 1740586886222586607)  
- **Appointment Types**: 
  - Standard Appointment (ID: 1740586888823054369)
  - First Appointment (ID: 1740586889158598690)
- **API Shard**: UK2

## Need Help?

If you can't find the online bookings settings or need assistance:
- Check Cliniko Help: https://help.cliniko.com/en/collections/51-let-your-patients-book-online
- Contact Cliniko Support: support@cliniko.com

This should resolve the 404 errors and make the `available_times` API endpoints work for your n8n integration! 