#!/usr/bin/env python3
"""
Test the next_available_time endpoint suggested by the user
"""

import requests
import json
import os
import base64
from datetime import datetime, timedelta

class NextAvailableTimeTester:
    def __init__(self, api_key: str, base_url: str = "https://api.uk2.cliniko.com/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        
        # Properly encode API key
        auth_string = f"{api_key}:"
        encoded_auth = base64.b64encode(auth_string.encode()).decode()
        
        self.session.headers.update({
            'Authorization': f'Basic {encoded_auth}',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'NextAvailableTime-Tester/1.0'
        })
        
        self.business_id = "1740586889502532285"
        self.practitioner_id = "1740586886222586607"  # Correct ID
        self.appointment_type_ids = ["1740586888823054369", "1740586889158598690"]
    
    def test_next_available_time_endpoints(self):
        """Test the next_available_time endpoints"""
        
        print("🎯 TESTING NEXT_AVAILABLE_TIME ENDPOINTS")
        print("=" * 60)
        print()
        
        # Test the exact endpoint suggested by user
        print("1️⃣ TESTING USER'S SUGGESTED ENDPOINT")
        print("-" * 50)
        self.test_user_suggested_endpoint()
        
        # Test variations of next_available_time
        print("\n2️⃣ TESTING NEXT_AVAILABLE_TIME VARIATIONS")
        print("-" * 50)
        self.test_next_available_time_variations()
        
        # Test with different parameters
        print("\n3️⃣ TESTING WITH DIFFERENT PARAMETERS")
        print("-" * 50)
        self.test_with_parameters()
    
    def test_user_suggested_endpoint(self):
        """Test the exact endpoint the user suggested"""
        
        for apt_id in self.appointment_type_ids:
            # Get appointment type name for better logging
            apt_name = self.get_appointment_type_name(apt_id)
            
            print(f"   Testing appointment type: {apt_name} (ID: {apt_id})")
            
            # User's suggested endpoint structure
            url = f"{self.base_url}/businesses/{self.business_id}/practitioners/{self.practitioner_id}/appointment_types/{apt_id}/next_available_time"
            
            print(f"   URL: {url}")
            
            try:
                # Test without parameters first
                response = self.session.get(url)
                print(f"   Status: {response.status_code}")
                
                if response.status_code == 200:
                    print(f"   🎉 SUCCESS! next_available_time works!")
                    data = response.json()
                    print(f"   Response keys: {list(data.keys())}")
                    
                    # Pretty print the response
                    print(f"   Response data:")
                    print(json.dumps(data, indent=4))
                    
                    # Save successful response
                    filename = f"success_next_available_time_{apt_name.replace(' ', '_')}.json"
                    with open(filename, 'w') as f:
                        json.dump({
                            "endpoint": url,
                            "appointment_type": apt_name,
                            "appointment_type_id": apt_id,
                            "response": data
                        }, f, indent=2)
                    print(f"   💾 Saved successful response to: {filename}")
                    
                elif response.status_code == 422:
                    print(f"   ⚠️  422 - Validation Error (may need parameters)")
                    try:
                        error_data = response.json()
                        print(f"   Error details: {json.dumps(error_data, indent=4)}")
                    except:
                        print(f"   Error text: {response.text}")
                        
                elif response.status_code == 404:
                    print(f"   ❌ 404 - Endpoint not found")
                    
                else:
                    print(f"   ⚠️  Status {response.status_code}")
                    print(f"   Response: {response.text[:200]}")
                    
            except Exception as e:
                print(f"   ❌ Exception: {e}")
            
            print()
    
    def test_next_available_time_variations(self):
        """Test different URL structures for next_available_time"""
        
        apt_id = self.appointment_type_ids[0]  # Use first appointment type
        apt_name = self.get_appointment_type_name(apt_id)
        
        print(f"   Testing variations with: {apt_name} (ID: {apt_id})")
        print()
        
        # Different URL patterns to test
        variations = [
            # Direct from appointment type
            f"{self.base_url}/appointment_types/{apt_id}/next_available_time",
            
            # From practitioner first
            f"{self.base_url}/practitioners/{self.practitioner_id}/appointment_types/{apt_id}/next_available_time",
            
            # From business first (different structure)
            f"{self.base_url}/businesses/{self.business_id}/appointment_types/{apt_id}/next_available_time",
            
            # Global next available time
            f"{self.base_url}/next_available_time",
            
            # Practitioner's next available time
            f"{self.base_url}/practitioners/{self.practitioner_id}/next_available_time",
            
            # Business next available time
            f"{self.base_url}/businesses/{self.business_id}/next_available_time"
        ]
        
        for i, url in enumerate(variations, 1):
            print(f"      Variation {i}: {url}")
            
            try:
                response = self.session.get(url)
                print(f"         Status: {response.status_code}")
                
                if response.status_code == 200:
                    print(f"         🎉 SUCCESS!")
                    data = response.json()
                    print(f"         Response keys: {list(data.keys())}")
                    
                    filename = f"success_variation_{i}_next_available_time.json"
                    with open(filename, 'w') as f:
                        json.dump({
                            "endpoint": url,
                            "variation": i,
                            "response": data
                        }, f, indent=2)
                    print(f"         💾 Saved to: {filename}")
                    
                elif response.status_code == 422:
                    print(f"         ⚠️  422 - May need parameters")
                    
                elif response.status_code != 404:
                    print(f"         ⚠️  Different status: {response.status_code}")
                    
            except Exception as e:
                print(f"         ❌ Exception: {e}")
            
            print()
    
    def test_with_parameters(self):
        """Test next_available_time endpoints with various parameters"""
        
        apt_id = self.appointment_type_ids[0]
        apt_name = self.get_appointment_type_name(apt_id)
        
        # Base URL (user's suggested endpoint)
        url = f"{self.base_url}/businesses/{self.business_id}/practitioners/{self.practitioner_id}/appointment_types/{apt_id}/next_available_time"
        
        print(f"   Testing parameters with: {apt_name}")
        print(f"   Base URL: {url}")
        print()
        
        # Different parameter combinations
        param_sets = [
            # No parameters
            {},
            
            # Date range
            {
                'from': '2025-08-01',
                'to': '2025-08-07'
            },
            
            # Just from date
            {
                'from': '2025-08-01'
            },
            
            # Today onwards
            {
                'from': datetime.now().strftime('%Y-%m-%d')
            },
            
            # With time constraints
            {
                'from': '2025-08-01',
                'to': '2025-08-07',
                'time_from': '09:00',
                'time_to': '17:00'
            },
            
            # With business and practitioner (redundant but testing)
            {
                'business_id': self.business_id,
                'practitioner_id': self.practitioner_id,
                'from': '2025-08-01'
            }
        ]
        
        for i, params in enumerate(param_sets, 1):
            print(f"      Parameter set {i}: {params}")
            
            try:
                response = self.session.get(url, params=params)
                print(f"         Status: {response.status_code}")
                
                if response.status_code == 200:
                    print(f"         🎉 SUCCESS with parameters!")
                    data = response.json()
                    print(f"         Response keys: {list(data.keys())}")
                    
                    # Show the next available time
                    if 'next_available_time' in data:
                        print(f"         📅 Next available: {data['next_available_time']}")
                    
                    filename = f"success_with_params_{i}_next_available_time.json"
                    with open(filename, 'w') as f:
                        json.dump({
                            "endpoint": url,
                            "params": params,
                            "response": data
                        }, f, indent=2)
                    print(f"         💾 Saved to: {filename}")
                    
                elif response.status_code == 422:
                    print(f"         ⚠️  422 - Validation Error")
                    try:
                        error_data = response.json()
                        print(f"         Error: {json.dumps(error_data, indent=8)}")
                    except:
                        print(f"         Error text: {response.text}")
                        
                elif response.status_code != 404:
                    print(f"         ⚠️  Status {response.status_code}: {response.text[:100]}")
                    
            except Exception as e:
                print(f"         ❌ Exception: {e}")
            
            print()
    
    def get_appointment_type_name(self, apt_id: str) -> str:
        """Get the name of an appointment type"""
        try:
            url = f"{self.base_url}/appointment_types/{apt_id}"
            response = self.session.get(url)
            if response.status_code == 200:
                data = response.json()
                return data.get('name', 'Unknown')
        except:
            pass
        return 'Unknown'

def main():
    print("🎯 Testing Next Available Time Endpoint")
    print("=" * 50)
    print("Testing the next_available_time endpoint suggested by user")
    print("URL pattern: /businesses/{business_id}/practitioners/{practitioner_id}/appointment_types/{appointment_type_id}/next_available_time")
    print()
    
    # Get API key
    api_key = os.getenv('CLINIKO_API_KEY')
    if not api_key:
        api_key = input("Enter your Cliniko API key: ").strip()
    
    if not api_key:
        print("❌ API key required!")
        return
    
    # Run tests
    tester = NextAvailableTimeTester(api_key)
    tester.test_next_available_time_endpoints()
    
    print("\n" + "="*60)
    print("🎯 NEXT_AVAILABLE_TIME TESTING COMPLETE")
    print("Check for any successful responses marked with 🎉")

if __name__ == "__main__":
    main() 