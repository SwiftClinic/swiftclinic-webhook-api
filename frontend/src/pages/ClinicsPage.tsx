import React, { useState, useEffect } from 'react';
import { PlusIcon, BuildingOfficeIcon, MapPinIcon, ClockIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline';
import apiService from '../services/api';

// Add clinic flow state management
interface ClinicDetectionData {
  pmsType: 'cliniko' | 'jane';
  shard?: string;
  subdomain?: string;
  businesses?: Array<{
    id: string;
    name: string;
    country: string;
    timezone: string;
  }>;
  clinics?: Array<{
    id: string;
    name: string;
    country?: string;
    timezone?: string;
  }>;
}

const ClinicsPage: React.FC = () => {
  const [clinics, setClinics] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showClinicDetails, setShowClinicDetails] = useState(false);
  const [selectedClinicForDetails, setSelectedClinicForDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Add clinic flow state
  const [addClinicStep, setAddClinicStep] = useState<'select-pms' | 'api-key' | 'detection' | 'select-clinic'>('select-pms');
  const [selectedPMS, setSelectedPMS] = useState<'cliniko' | 'jane' | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [detectionLoading, setDetectionLoading] = useState(false);
  const [detectionData, setDetectionData] = useState<ClinicDetectionData | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const [addingClinic, setAddingClinic] = useState(false);

  useEffect(() => {
    fetchClinics();
  }, []);

  const fetchClinics = async () => {
    try {
      const response = await apiService.getClinics();
      setClinics(response.data);
    } catch (error) {
      console.error('Error fetching clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetAddClinicFlow = () => {
    setAddClinicStep('select-pms');
    setSelectedPMS(null);
    setApiKey('');
    setDetectionLoading(false);
    setDetectionData(null);
    setDetectionError(null);
    setSelectedBusiness(null);
    setAddingClinic(false);
  };

  const handlePMSSelection = (pmsType: 'cliniko' | 'jane') => {
    setSelectedPMS(pmsType);
    setAddClinicStep('api-key');
  };

  const handleAPIKeySubmit = async () => {
    if (!apiKey.trim() || !selectedPMS) return;

    setDetectionLoading(true);
    setDetectionError(null);

    try {
      const endpoint = selectedPMS === 'cliniko' ? '/api/clinics/detect-cliniko' : '/api/clinics/detect-jane';
      const response = await apiService.post(endpoint, { apiKey });
      
      if (response.success) {
        const detectionResult: ClinicDetectionData = {
          pmsType: selectedPMS,
          ...(selectedPMS === 'cliniko' ? {
            shard: response.data.shard,
            businesses: response.data.businesses
          } : {
            subdomain: response.data.subdomain,
            clinics: response.data.clinics
          })
        };
        
        setDetectionData(detectionResult);
        setAddClinicStep('select-clinic');
      } else {
        setDetectionError(response.error?.message || 'Auto-detection failed');
      }
    } catch (error: any) {
      setDetectionError(error.response?.data?.error?.message || 'Connection failed');
    } finally {
      setDetectionLoading(false);
    }
  };

  const handleAddClinic = async (businessId: string) => {
    if (!detectionData || !selectedPMS) return;

    setAddingClinic(true);
    setDetectionError(null);

    try {
      // Find the selected business and get its real services
      const selectedBusiness = detectionData.businesses?.find(b => b.id === businessId) || 
                              detectionData.clinics?.find(c => c.id === businessId);
      
      const clinicData = {
        name: selectedBusiness?.name || 'Auto-detected Clinic',
        contactInfo: {
          email: '',
          phone: '',
          address: ''
        },
        businessHours: {
          monday: { open: '09:00', close: '17:00', isOpen: true },
          tuesday: { open: '09:00', close: '17:00', isOpen: true },
          wednesday: { open: '09:00', close: '17:00', isOpen: true },
          thursday: { open: '09:00', close: '17:00', isOpen: true },
          friday: { open: '09:00', close: '17:00', isOpen: true },
          saturday: { open: '09:00', close: '13:00', isOpen: false },
          sunday: { open: '09:00', close: '13:00', isOpen: false }
        },
        services: selectedBusiness?.services || [], // Use real services from Cliniko detection
        bookingSystem: selectedPMS === 'cliniko' ? 'cliniko' : 'jane-app',
        timezone: selectedBusiness?.timezone || 'UTC', // Include timezone from business API
        apiCredentials: {
          apiKey,
          ...(selectedPMS === 'cliniko' ? {
            shard: detectionData.shard,
            businessId
          } : {
            subdomain: detectionData.subdomain,
            clinicId: businessId
          })
        },
        gdprSettings: {
          dataRetentionDays: 2555, // 7 years
          anonymizeAfterDays: 2555,
          enableDataExport: true,
          enableDataDeletion: true
        },
        autoDetected: true
      };

      console.log('🏥 [ClinicsPage] Creating clinic with real services:', clinicData.services);

      const response = await apiService.createClinic(clinicData);
      
      if (response.success) {
        await fetchClinics();
        setShowAddForm(false);
        resetAddClinicFlow();
      } else {
        setDetectionError(response.error?.message || 'Failed to add clinic');
      }
    } catch (error: any) {
      setDetectionError(error.response?.data?.error?.message || 'Failed to add clinic');
    } finally {
      setAddingClinic(false);
    }
  };

  const handleViewClinicDetails = (clinic: any) => {
    setSelectedClinicForDetails(clinic);
    setShowClinicDetails(true);
  };

  const handleCreateWebhook = async () => {
    if (!selectedClinicForDetails) return;

    try {
      setLoading(true);
      // Here you can implement webhook creation logic
      // For now, we'll just show a success message
      alert(`Webhook created for ${selectedClinicForDetails.name}!`);
      setShowClinicDetails(false);
    } catch (error) {
      console.error('Error creating webhook:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && clinics.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-bold text-gray-900">Clinic Management</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage your connected clinics and their configurations.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            onClick={() => setShowAddForm(true)}
            className="btn-primary"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Clinic
          </button>
        </div>
      </div>

      {/* Clinics List */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {clinics.map((clinic) => (
          <div key={clinic.id} className="card hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <BuildingOfficeIcon className="h-8 w-8 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{clinic.name}</h3>
                  <p className="text-sm text-gray-500 capitalize">{clinic.bookingSystem}</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              {clinic.contactInfo?.email && (
                <div className="flex items-center">
                  <span className="font-medium">Email:</span>
                  <span className="ml-2">{clinic.contactInfo.email}</span>
                </div>
              )}
              {clinic.contactInfo?.phone && (
                <div className="flex items-center">
                  <span className="font-medium">Phone:</span>
                  <span className="ml-2">{clinic.contactInfo.phone}</span>
                </div>
              )}
              <div className="flex items-center">
                <ClockIcon className="h-4 w-4 mr-2" />
                <span>Created {new Date(clinic.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
              <button 
                onClick={() => handleViewClinicDetails(clinic)}
                className="btn-secondary w-full flex items-center justify-center"
              >
                <EyeIcon className="h-4 w-4 mr-2" />
                View Details
              </button>
            </div>
          </div>
        ))}

        {/* Add Clinic Card */}
        <div
          onClick={() => setShowAddForm(true)}
          className="card border-2 border-dashed border-gray-300 hover:border-indigo-500 cursor-pointer transition-colors"
        >
          <div className="flex flex-col items-center justify-center py-12">
            <PlusIcon className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-sm font-medium text-gray-900">Add New Clinic</p>
            <p className="text-xs text-gray-500">Connect with Cliniko or Jane App</p>
          </div>
        </div>
      </div>

      {/* Enhanced Add Clinic Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => {
              setShowAddForm(false);
              resetAddClinicFlow();
            }}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                
                {/* Step 1: PMS Selection */}
                {addClinicStep === 'select-pms' && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Choose Your Practice Management System</h3>
                    <p className="text-sm text-gray-500 mb-6">Select which PMS your clinic uses to get started.</p>
                    
                    <div className="space-y-4">
                      {/* Cliniko Option */}
                      <div
                        onClick={() => handlePMSSelection('cliniko')}
                        className="border-2 border-gray-200 rounded-lg p-4 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">C</span>
                          </div>
                          <div>
                            <h4 className="text-base font-medium text-gray-900">Cliniko</h4>
                            <p className="text-sm text-gray-500">Popular practice management for healthcare professionals</p>
                          </div>
                        </div>
                      </div>

                      {/* Jane App Option */}
                      <div
                        onClick={() => handlePMSSelection('jane')}
                        className="border-2 border-gray-200 rounded-lg p-4 cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">J</span>
                          </div>
                          <div>
                            <h4 className="text-base font-medium text-gray-900">Jane App</h4>
                            <p className="text-sm text-gray-500">Modern practice management for health and wellness</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: API Key Input */}
                {addClinicStep === 'api-key' && (
                  <div>
                    <div className="flex items-center mb-4">
                      <button
                        onClick={() => setAddClinicStep('select-pms')}
                        className="text-gray-400 hover:text-gray-600 mr-3"
                      >
                        ←
                      </button>
                      <h3 className="text-lg font-medium text-gray-900">
                        Enter Your {selectedPMS === 'cliniko' ? 'Cliniko' : 'Jane App'} API Key
                      </h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          API Key
                        </label>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          className="input-field"
                          placeholder={`Your ${selectedPMS === 'cliniko' ? 'Cliniko' : 'Jane App'} API key`}
                        />
                        <p className="mt-2 text-sm text-gray-500">
                          {selectedPMS === 'cliniko' 
                            ? 'Find your API key in Cliniko Settings > API Access'
                            : 'Find your API key in Jane App Settings > Integrations'
                          }
                        </p>
                      </div>

                      {detectionError && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-3">
                          <p className="text-sm text-red-600">{detectionError}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Detection Loading */}
                {addClinicStep === 'detection' && (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Detecting Configuration</h3>
                    <p className="text-sm text-gray-500">
                      Auto-detecting your {selectedPMS === 'cliniko' ? 'Cliniko shard and businesses' : 'Jane App clinics'}...
                    </p>
                  </div>
                )}

                {/* Step 4: Clinic Selection */}
                {addClinicStep === 'select-clinic' && detectionData && (
                  <div>
                    <div className="flex items-center mb-4">
                      <button
                        onClick={() => setAddClinicStep('api-key')}
                        className="text-gray-400 hover:text-gray-600 mr-3"
                      >
                        ←
                      </button>
                      <h3 className="text-lg font-medium text-gray-900">
                        Select Your {selectedPMS === 'cliniko' ? 'Business' : 'Clinic'}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {selectedPMS === 'cliniko' && detectionData.businesses?.map((business) => (
                        <div
                          key={business.id}
                          className="border rounded-lg p-4 hover:border-indigo-500 cursor-pointer transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{business.name}</h4>
                              <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                                <span className="flex items-center">
                                  <MapPinIcon className="h-4 w-4 mr-1" />
                                  {business.country}
                                </span>
                                <span>{business.timezone}</span>
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                  {detectionData.shard?.toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleAddClinic(business.id)}
                              className="btn-primary"
                              disabled={addingClinic}
                            >
                              {addingClinic ? 'Adding...' : 'Add Clinic'}
                            </button>
                          </div>
                        </div>
                      ))}

                      {selectedPMS === 'jane' && detectionData.clinics?.map((clinic) => (
                        <div
                          key={clinic.id}
                          className="border rounded-lg p-4 hover:border-indigo-500 cursor-pointer transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium text-gray-900">{clinic.name}</h4>
                              <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                                {clinic.country && (
                                  <span className="flex items-center">
                                    <MapPinIcon className="h-4 w-4 mr-1" />
                                    {clinic.country}
                                  </span>
                                )}
                                {clinic.timezone && <span>{clinic.timezone}</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => handleAddClinic(clinic.id)}
                              className="btn-primary"
                              disabled={addingClinic}
                            >
                              {addingClinic ? 'Adding...' : 'Add Clinic'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {detectionError && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
                        <p className="text-sm text-red-600">{detectionError}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                {addClinicStep === 'api-key' && (
                  <button
                    onClick={handleAPIKeySubmit}
                    disabled={!apiKey.trim() || detectionLoading}
                    className="btn-primary ml-3"
                  >
                    {detectionLoading ? 'Detecting...' : 'Auto-Detect'}
                  </button>
                )}
                
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    resetAddClinicFlow();
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clinic Details Modal */}
      {showClinicDetails && selectedClinicForDetails && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowClinicDetails(false)}></div>
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Clinic Details</h3>
                  <button
                    onClick={() => setShowClinicDetails(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Basic Info */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Basic Information</h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Name:</span>
                        <span className="text-sm font-medium text-gray-900">{selectedClinicForDetails.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Booking System:</span>
                        <span className="text-sm font-medium text-gray-900 capitalize">{selectedClinicForDetails.bookingSystem}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Status:</span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Created:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(selectedClinicForDetails.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  {(selectedClinicForDetails.contactInfo?.email || selectedClinicForDetails.contactInfo?.phone) && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Contact Information</h4>
                      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        {selectedClinicForDetails.contactInfo?.email && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Email:</span>
                            <span className="text-sm font-medium text-gray-900">{selectedClinicForDetails.contactInfo.email}</span>
                          </div>
                        )}
                        {selectedClinicForDetails.contactInfo?.phone && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Phone:</span>
                            <span className="text-sm font-medium text-gray-900">{selectedClinicForDetails.contactInfo.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Webhook Info */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Integration</h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Webhook URL:</span>
                        <span className="text-sm font-mono text-gray-900">{selectedClinicForDetails.webhookUrl}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Auto-detected:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {selectedClinicForDetails.autoDetected ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleCreateWebhook}
                  className="btn-primary ml-3"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Webhook'}
                </button>
                <button
                  onClick={() => setShowClinicDetails(false)}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicsPage; 