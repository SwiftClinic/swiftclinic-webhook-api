#!/usr/bin/env python3
"""
Test the working endpoint patterns we discovered to find available_times
"""

import requests
import json
import os
import base64
from datetime import datetime, timedelta

class WorkingPatternTester:
    def __init__(self, api_key: str, base_url: str = "https://api.uk2.cliniko.com/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        
        # Properly encode API key
        auth_string = f"{api_key}:"
        encoded_auth = base64.b64encode(auth_string.encode()).decode()
        
        self.session.headers.update({
            'Authorization': f'Basic {encoded_auth}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Working-Pattern-Tester/1.0'
        })
        
        self.practitioner_id = "1740586886222586607"  # Correct ID
    
    def test_working_patterns(self):
        """Test the working endpoint patterns for available_times"""
        
        print("🔍 TESTING WORKING ENDPOINT PATTERNS")
        print("=" * 60)
        print()
        
        # Step 1: Get appointment types from working practitioner endpoint
        print("1️⃣ GETTING APPOINTMENT TYPES FROM WORKING PRACTITIONER ENDPOINT")
        print("-" * 60)
        appointment_types = self.get_practitioner_appointment_types()
        
        if appointment_types:
            # Step 2: Test available_times with each appointment type using working patterns
            print("\n2️⃣ TESTING AVAILABLE_TIMES WITH DISCOVERED PATTERNS")
            print("-" * 60)
            self.test_available_times_with_working_patterns(appointment_types)
        
        # Step 3: Test alternative endpoint structures based on what works
        print("\n3️⃣ TESTING ALTERNATIVE STRUCTURES WITH WORKING ENDPOINTS")
        print("-" * 60)
        self.test_alternative_working_structures()
    
    def get_practitioner_appointment_types(self):
        """Get appointment types from the working practitioner endpoint"""
        url = f"{self.base_url}/practitioners/{self.practitioner_id}/appointment_types"
        
        try:
            print(f"   URL: {url}")
            response = self.session.get(url)
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                appointment_types = data.get('appointment_types', [])
                print(f"   ✅ Found {len(appointment_types)} appointment types:")
                
                for i, apt in enumerate(appointment_types, 1):
                    apt_id = apt.get('id')
                    apt_name = apt.get('name', 'Unknown')
                    active = not apt.get('archived_at')
                    
                    print(f"      {i}. {apt_name}")
                    print(f"         ID: {apt_id}")
                    print(f"         Active: {active}")
                    
                    # Check for online booking fields
                    online_fields = ['online_bookings', 'available_online', 'show_online', 'display_online']
                    for field in online_fields:
                        if field in apt:
                            print(f"         {field}: {apt[field]}")
                
                # Save the appointment types data
                with open('practitioner_appointment_types.json', 'w') as f:
                    json.dump(data, f, indent=2)
                print(f"   💾 Saved appointment types to: practitioner_appointment_types.json")
                
                return appointment_types
            else:
                print(f"   ❌ Error: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            print(f"   ❌ Exception: {e}")
            return None
    
    def test_available_times_with_working_patterns(self, appointment_types):
        """Test available_times using the appointment types from working practitioner endpoint"""
        
        # Date parameters
        today = datetime.now().date()
        next_week = today + timedelta(days=7)
        date_params = {
            'from': today.strftime('%Y-%m-%d'),
            'to': next_week.strftime('%Y-%m-%d')
        }
        
        for apt in appointment_types:
            apt_id = apt.get('id')
            apt_name = apt.get('name', 'Unknown')
            
            print(f"\n   🎯 Testing available_times for: {apt_name} (ID: {apt_id})")
            print(f"   {'─' * 50}")
            
            # Pattern 1: Direct from practitioner (following the working pattern)
            url1 = f"{self.base_url}/practitioners/{self.practitioner_id}/appointment_types/{apt_id}/available_times"
            self.test_available_times_endpoint(url1, date_params, f"practitioner_path_{apt_name}")
            
            # Pattern 2: Direct from appointment type (also working)
            url2 = f"{self.base_url}/appointment_types/{apt_id}/available_times"
            self.test_available_times_endpoint(url2, date_params, f"direct_apt_type_{apt_name}")
            
            # Pattern 3: Add practitioner as query parameter to global appointment type
            params_with_prac = {**date_params, 'practitioner_id': self.practitioner_id}
            self.test_available_times_endpoint(url2, params_with_prac, f"apt_type_with_prac_param_{apt_name}")
    
    def test_available_times_endpoint(self, url: str, params: dict, label: str):
        """Test a specific available_times endpoint"""
        
        try:
            print(f"      Testing: {url}")
            print(f"      Params: {params}")
            
            response = self.session.get(url, params=params)
            print(f"      Status: {response.status_code}")
            
            if response.status_code == 200:
                print(f"      🎉 SUCCESS! Available times endpoint works!")
                data = response.json()
                print(f"      Response keys: {list(data.keys())}")
                
                if 'available_times' in data:
                    times = data['available_times']
                    print(f"      📅 Found {len(times)} available time slots")
                    if times:
                        print(f"      📋 Sample slot: {times[0]}")
                
                # Save successful response
                filename = f"working_available_times_{label}.json"
                with open(filename, 'w') as f:
                    json.dump({
                        "endpoint": url,
                        "params": params,
                        "response": data
                    }, f, indent=2)
                print(f"      💾 Saved successful response to: {filename}")
                
            elif response.status_code == 422:
                print(f"      ⚠️  422 - Validation Error (may need different parameters)")
                try:
                    error_data = response.json()
                    print(f"      Error details: {error_data}")
                except:
                    print(f"      Error text: {response.text}")
                    
            elif response.status_code == 404:
                print(f"      ❌ 404 - Endpoint not found")
            else:
                print(f"      ❌ Status {response.status_code}: {response.text[:200]}")
                
        except Exception as e:
            print(f"      ❌ Exception: {e}")
        
        print()
    
    def test_alternative_working_structures(self):
        """Test alternative structures based on working endpoints"""
        
        # Since direct practitioner access works, try variations
        alternatives = [
            # Practitioner-based availability
            f"{self.base_url}/practitioners/{self.practitioner_id}/availability",
            f"{self.base_url}/practitioners/{self.practitioner_id}/schedule", 
            f"{self.base_url}/practitioners/{self.practitioner_id}/available_slots",
            f"{self.base_url}/practitioners/{self.practitioner_id}/bookable_times",
            
            # Maybe there's a different endpoint name for available times
            f"{self.base_url}/practitioners/{self.practitioner_id}/time_slots",
            f"{self.base_url}/practitioners/{self.practitioner_id}/booking_times",
            
            # Try with different URL patterns we haven't tested
            f"{self.base_url}/practitioners/{self.practitioner_id}/available",
            f"{self.base_url}/practitioners/{self.practitioner_id}/times"
        ]
        
        date_params = {
            'from': '2025-08-01',
            'to': '2025-08-07'
        }
        
        for url in alternatives:
            print(f"   Testing: {url}")
            try:
                # Test without params
                response = self.session.get(url)
                print(f"      No params: {response.status_code}")
                
                if response.status_code == 200:
                    print(f"      🎉 FOUND WORKING ENDPOINT!")
                    data = response.json()
                    print(f"      Response keys: {list(data.keys())}")
                    
                    filename = f"found_alternative_{url.split('/')[-1]}.json"
                    with open(filename, 'w') as f:
                        json.dump(data, f, indent=2)
                    print(f"      💾 Saved to: {filename}")
                
                # Test with params
                param_response = self.session.get(url, params=date_params)
                print(f"      With params: {param_response.status_code}")
                
                if param_response.status_code == 200:
                    print(f"      🎉 WORKS WITH PARAMETERS!")
                    data = param_response.json()
                    filename = f"found_alternative_with_params_{url.split('/')[-1]}.json"
                    with open(filename, 'w') as f:
                        json.dump(data, f, indent=2)
                    print(f"      💾 Saved to: {filename}")
                    
            except Exception as e:
                print(f"      ❌ Exception: {e}")
            
            print()

def main():
    print("🎯 Testing Working Endpoint Patterns for Available Times")
    print("=" * 60)
    print("Using the working endpoint structures we discovered")
    print("to find available_times functionality")
    print()
    
    # Get API key
    api_key = os.getenv('CLINIKO_API_KEY')
    if not api_key:
        api_key = input("Enter your Cliniko API key: ").strip()
    
    if not api_key:
        print("❌ API key required!")
        return
    
    # Run tests
    tester = WorkingPatternTester(api_key)
    tester.test_working_patterns()
    
    print("\n" + "="*60)
    print("🎯 TESTING COMPLETE")
    print("Check for any successful responses marked with 🎉")
    print("and examine saved JSON files for working endpoints!")

if __name__ == "__main__":
    main() 