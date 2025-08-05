#!/usr/bin/env python3
"""
Cliniko API Test Script
Test connection to Cliniko API and retrieve business information
"""

import requests
import json
import os
import base64
from typing import Dict, Any, Optional

class ClinikoAPITester:
    def __init__(self, api_key: str, base_url: str = "https://api.uk2.cliniko.com/v1"):
        """
        Initialize the Cliniko API tester
        
        Args:
            api_key: Your Cliniko API key
            base_url: Base URL for Cliniko API (default: UK shard)
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        
        # Properly encode API key with colon for basic auth
        # Cliniko expects: base64(api_key:)
        auth_string = f"{api_key}:"
        encoded_auth = base64.b64encode(auth_string.encode()).decode()
        
        # Set up authentication headers
        self.session.headers.update({
            'Authorization': f'Basic {encoded_auth}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Cliniko-API-Tester/1.0'
        })
    
    def test_connection(self) -> bool:
        """
        Test the API connection
        
        Returns:
            bool: True if connection successful, False otherwise
        """
        try:
            response = self.session.get(f"{self.base_url}/businesses")
            print(f"Connection test status: {response.status_code}")
            if response.status_code != 200:
                print(f"Response headers: {dict(response.headers)}")
                print(f"Response body: {response.text}")
            return response.status_code == 200
        except Exception as e:
            print(f"Connection test failed: {e}")
            return False
    
    def get_businesses(self) -> Optional[Dict[str, Any]]:
        """
        Retrieve all businesses from Cliniko
        
        Returns:
            Dict containing business data or None if failed
        """
        try:
            response = self.session.get(f"{self.base_url}/businesses")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error: {e}")
            print(f"Response: {response.text}")
            return None
        except Exception as e:
            print(f"Error retrieving businesses: {e}")
            return None

    def get_practitioners(self, business_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve practitioners for a specific business
        
        Args:
            business_id: The business ID
            
        Returns:
            Dict containing practitioners data or None if failed
        """
        try:
            url = f"{self.base_url}/businesses/{business_id}/practitioners"
            response = self.session.get(url)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error getting practitioners: {e}")
            print(f"Response: {response.text}")
            return None
        except Exception as e:
            print(f"Error retrieving practitioners: {e}")
            return None

    def get_appointment_types(self, business_id: str, practitioner_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve appointment types for a specific business and practitioner
        
        Args:
            business_id: The business ID
            practitioner_id: The practitioner ID
            
        Returns:
            Dict containing appointment types data or None if failed
        """
        try:
            url = f"{self.base_url}/businesses/{business_id}/practitioners/{practitioner_id}/appointment_types"
            response = self.session.get(url)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error getting appointment types: {e}")
            print(f"Response: {response.text}")
            return None
        except Exception as e:
            print(f"Error retrieving appointment types: {e}")
            return None

    def get_available_times(self, business_id: str, practitioner_id: str, appointment_type_id: str, 
                          from_date: str = None, to_date: str = None) -> Optional[Dict[str, Any]]:
        """
        Retrieve available appointment times - THIS IS THE ENDPOINT YOU NEED FOR N8N
        
        Args:
            business_id: The business ID
            practitioner_id: The practitioner ID
            appointment_type_id: The appointment type ID
            from_date: Start date (YYYY-MM-DD format, optional)
            to_date: End date (YYYY-MM-DD format, optional)
            
        Returns:
            Dict containing available times data or None if failed
        """
        try:
            url = f"{self.base_url}/businesses/{business_id}/practitioners/{practitioner_id}/appointment_types/{appointment_type_id}/available_times"
            
            # Add query parameters if provided
            params = {}
            if from_date:
                params['from'] = from_date
            if to_date:
                params['to'] = to_date
            
            print(f"🔍 Testing available times endpoint: {url}")
            if params:
                print(f"📅 Query parameters: {params}")
            
            response = self.session.get(url, params=params)
            print(f"Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Response headers: {dict(response.headers)}")
                print(f"Response body: {response.text}")
            
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            print(f"HTTP Error getting available times: {e}")
            print(f"Response: {response.text}")
            return None
        except Exception as e:
            print(f"Error retrieving available times: {e}")
            return None
    
    def print_business_info(self, businesses_data: Dict[str, Any]) -> None:
        """
        Print formatted business information
        
        Args:
            businesses_data: Response data from businesses API
        """
        businesses = businesses_data.get('businesses', [])
        
        if not businesses:
            print("No businesses found.")
            return
        
        print(f"\n📋 Found {len(businesses)} business(es):")
        print("=" * 50)
        
        for business in businesses:
            print(f"🏢 Business Name: {business.get('business_name', 'N/A')}")
            print(f"🆔 Business ID: {business.get('id', 'N/A')}")
            print(f"📍 Address: {business.get('address_1', 'N/A')}")
            print(f"🏙️  City: {business.get('city', 'N/A')}")
            print(f"🌏 Country: {business.get('country', 'N/A')}")
            print(f"⏰ Time Zone: {business.get('time_zone', 'N/A')}")
            print(f"📧 Contact: {business.get('contact_information', 'N/A')}")
            print(f"🌐 Website: {business.get('website_address', 'N/A')}")
            print(f"📅 Created: {business.get('created_at', 'N/A')}")
            
            # Show if archived
            if business.get('archived_at'):
                print(f"🗃️  Archived: {business.get('archived_at')}")
            else:
                print("✅ Status: Active")
            
            print("-" * 30)


def test_specific_endpoint():
    """Test the specific endpoint the user needs for n8n"""
    print("\n" + "="*60)
    print("🎯 TESTING SPECIFIC ENDPOINT FOR N8N WORKFLOW")
    print("="*60)
    
    # Get credentials
    api_key = os.getenv('CLINIKO_API_KEY')
    if not api_key:
        api_key = input("Enter your Cliniko API key: ").strip()
    
    business_id = input("Enter Business ID: ").strip()
    practitioner_id = input("Enter Practitioner ID: ").strip()
    appointment_type_id = input("Enter Appointment Type ID: ").strip()
    
    # Optional date range
    from_date = input("Enter 'from' date (YYYY-MM-DD, or press Enter to skip): ").strip()
    to_date = input("Enter 'to' date (YYYY-MM-DD, or press Enter to skip): ").strip()
    
    if not from_date:
        from_date = None
    if not to_date:
        to_date = None
    
    # Initialize tester with UK2 shard
    tester = ClinikoAPITester(api_key, "https://api.uk2.cliniko.com/v1")
    
    # Test the specific endpoint
    available_times = tester.get_available_times(
        business_id, practitioner_id, appointment_type_id, from_date, to_date
    )
    
    if available_times:
        print("✅ Available times retrieved successfully!")
        print(f"📄 Response structure: {list(available_times.keys())}")
        
        # Save response for analysis
        with open('available_times_response.json', 'w') as f:
            json.dump(available_times, f, indent=2)
        print("💾 Response saved to: available_times_response.json")
        
        # Print sample data
        if 'available_times' in available_times:
            times = available_times['available_times']
            print(f"📅 Found {len(times)} available time slots")
            if times:
                print("📋 First few slots:")
                for i, slot in enumerate(times[:3]):
                    print(f"  {i+1}. {slot}")
    else:
        print("❌ Failed to retrieve available times!")
        print("\n🔧 For n8n troubleshooting:")
        print("1. Verify all IDs are correct")
        print("2. Check that the practitioner has appointment types configured")
        print("3. Ensure the appointment type is active and available")
        print("4. Verify the date range is valid")


def main():
    """Main function to run the API test"""
    print("🔗 Cliniko API Connection Tester (UK2 Shard)")
    print("=" * 50)
    
    # Get API key from environment variable or user input
    api_key = os.getenv('CLINIKO_API_KEY')
    
    if not api_key:
        print("💡 Tip: Set CLINIKO_API_KEY environment variable to avoid entering it each time")
        api_key = input("Enter your Cliniko API key: ").strip()
    
    if not api_key:
        print("❌ API key is required!")
        return
    
    # Initialize the API tester with UK2 shard
    print("🌍 Using UK2 shard (api.uk2.cliniko.com)")
    tester = ClinikoAPITester(api_key, "https://api.uk2.cliniko.com/v1")
    
    # Test connection
    print("\n🔍 Testing API connection...")
    if not tester.test_connection():
        print("❌ Connection test failed!")
        print("\nTroubleshooting tips:")
        print("1. Check your API key is correct")
        print("2. Verify you're using the UK2 shard")
        print("3. Ensure your Cliniko account has API access enabled")
        print("4. Check if your API key has proper permissions")
        return
    
    print("✅ Connection successful!")
    
    # Get businesses
    print("\n📋 Retrieving businesses...")
    businesses_data = tester.get_businesses()
    
    if businesses_data is None:
        print("❌ Failed to retrieve businesses!")
        return
    
    # Print business information
    tester.print_business_info(businesses_data)
    
    # Also save raw data to file for reference
    with open('cliniko_businesses.json', 'w') as f:
        json.dump(businesses_data, f, indent=2)
    print(f"\n💾 Raw API response saved to: cliniko_businesses.json")
    
    print("\n🎉 Basic API test completed successfully!")
    
    # Ask if user wants to test the specific endpoint
    test_endpoint = input("\n❓ Do you want to test the available_times endpoint for n8n? (y/n): ").strip().lower()
    if test_endpoint in ['y', 'yes']:
        test_specific_endpoint()


if __name__ == "__main__":
    main() 