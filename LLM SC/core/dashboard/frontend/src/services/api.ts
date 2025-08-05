import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    // Use environment variable or fallback to production URL
    const baseURL = import.meta.env.VITE_API_BASE_URL || 'https://admin.swiftclinic.ai/api';
    
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Important for CORS with credentials
    });
    
    console.log('API Service initialized with baseURL:', baseURL);
  }

  // Generic HTTP methods
  private async get<T = any>(endpoint: string): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(endpoint);
    return response.data;
  }

  public async post<T = any>(endpoint: string, data?: any): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(endpoint, data);
    return response.data;
  }

  private async put<T = any>(endpoint: string, data?: any): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(endpoint, data);
    return response.data;
  }

  private async delete<T = any>(endpoint: string): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(endpoint);
    return response.data;
  }

  // Authentication
  public async login(credentials: { email: string; password: string }): Promise<any> {
    return this.post('/api/auth/login', credentials);
  }

  public async register(userData: { 
    name: string; 
    email: string; 
    password: string; 
    role: string; 
  }): Promise<any> {
    return this.post('/api/auth/register', userData);
  }

  public async logout(): Promise<any> {
    return this.post('/api/auth/logout');
  }

  public async refreshToken(): Promise<any> {
    return this.post('/api/auth/refresh');
  }

  public async forgotPassword(email: string): Promise<any> {
    return this.post('/api/auth/forgot-password', { email });
  }

  public async resetPassword(token: string, password: string): Promise<any> {
    return this.post('/api/auth/reset-password', { token, password });
  }

  // User Management
  public async getCurrentUser(): Promise<any> {
    return this.get('/api/users/me');
  }

  public async updateProfile(userData: any): Promise<any> {
    return this.put('/api/users/me', userData);
  }

  public async changePassword(passwordData: { 
    currentPassword: string; 
    newPassword: string; 
  }): Promise<any> {
    return this.put('/api/users/me/password', passwordData);
  }

  // Dashboard Data
  public async getDashboardStats(): Promise<any> {
    return this.get('/api/dashboard/stats');
  }

  public async getRecentActivity(): Promise<any> {
    return this.get('/api/dashboard/activity');
  }

  // Clinic Management
  public async getClinics(): Promise<any> {
    return this.get('/api/clinics');
  }

  public async getClinic(id: string): Promise<any> {
    return this.get(`/api/clinics/${id}`);
  }

  public async createClinic(data: any): Promise<any> {
    return this.post('/api/clinics', data);
  }

  public async updateClinic(id: string, data: any): Promise<any> {
    return this.put(`/api/clinics/${id}`, data);
  }

  public async deleteClinic(id: string): Promise<any> {
    return this.delete(`/api/clinics/${id}`);
  }

  // PMS Detection Methods
  public async detectCliniko(apiKey: string): Promise<any> {
    return this.post('/api/clinics/detect-cliniko', { apiKey });
  }

  public async detectJane(apiKey: string): Promise<any> {
    return this.post('/api/clinics/detect-jane', { apiKey });
  }

  public async detectPMS(apiKey: string, pmsType?: 'cliniko' | 'jane'): Promise<any> {
    return this.post('/api/clinics/detect-pms', { apiKey, pmsType });
  }

  public async testClinikoConnection(data: {
    apiKey: string;
    shard: string;
    businessId?: string;
  }): Promise<any> {
    return this.post('/api/clinics/test-cliniko', data);
  }

  // Analytics
  public async getAnalytics(timeRange: string = '7d'): Promise<any> {
    return this.get(`/api/analytics?range=${timeRange}`);
  }

  public async getConversationMetrics(): Promise<any> {
    return this.get('/api/analytics/conversations');
  }

  public async getBookingMetrics(): Promise<any> {
    return this.get('/api/analytics/bookings');
  }

  // Settings
  public async getSettings(): Promise<any> {
    return this.get('/api/settings');
  }

  public async updateSettings(settings: any): Promise<any> {
    return this.put('/api/settings', settings);
  }

  // Knowledge Base
  public async getKnowledgeBase(): Promise<any> {
    return this.get('/api/knowledge');
  }

  public async updateKnowledgeBase(data: any): Promise<any> {
    return this.put('/api/knowledge', data);
  }
}

export default new ApiService(); 