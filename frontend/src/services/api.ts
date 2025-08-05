import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    // Use environment variable for API URL, fallback to production
    const baseURL = import.meta.env.VITE_API_URL || 'https://admin.swiftclinic.ai/api';
    
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
    return this.post('/auth/login', credentials);
  }

  public async register(userData: { 
    name: string; 
    email: string; 
    password: string; 
    role: string; 
  }): Promise<any> {
    return this.post('/auth/register', userData);
  }

  public async logout(): Promise<any> {
    return this.post('/auth/logout');
  }

  public async refreshToken(): Promise<any> {
    return this.post('/auth/refresh');
  }

  public async forgotPassword(email: string): Promise<any> {
    return this.post('/auth/forgot-password', { email });
  }

  public async resetPassword(token: string, password: string): Promise<any> {
    return this.post('/auth/reset-password', { token, password });
  }

  // User Management
  public async getCurrentUser(): Promise<any> {
    return this.get('/users/me');
  }

  public async updateProfile(userData: any): Promise<any> {
    return this.put('/users/me', userData);
  }

  public async changePassword(passwordData: { 
    currentPassword: string; 
    newPassword: string; 
  }): Promise<any> {
    return this.put('/users/me/password', passwordData);
  }

  // Dashboard Data
  public async getDashboardStats(): Promise<any> {
    return this.get('/dashboard/stats');
  }

  public async getRecentActivity(): Promise<any> {
    return this.get('/dashboard/activity');
  }

  // Clinic Management
  public async getClinics(): Promise<any> {
    return this.get('/clinics');
  }

  public async getClinic(id: string): Promise<any> {
    return this.get(`/clinics/${id}`);
  }

  public async createClinic(data: any): Promise<any> {
    return this.post('/clinics', data);
  }

  public async updateClinic(id: string, data: any): Promise<any> {
    return this.put(`/clinics/${id}`, data);
  }

  public async deleteClinic(id: string): Promise<any> {
    return this.delete(`/clinics/${id}`);
  }

  // PMS Detection Methods
  public async detectCliniko(apiKey: string): Promise<any> {
    return this.post('/clinics/detect-cliniko', { apiKey });
  }

  public async detectJane(apiKey: string): Promise<any> {
    return this.post('/clinics/detect-jane', { apiKey });
  }

  public async detectPMS(apiKey: string, pmsType?: 'cliniko' | 'jane'): Promise<any> {
    return this.post('/clinics/detect-pms', { apiKey, pmsType });
  }

  public async testClinikoConnection(data: {
    apiKey: string;
    shard: string;
    businessId?: string;
  }): Promise<any> {
    return this.post('/clinics/test-cliniko', data);
  }

  // Analytics
  public async getAnalytics(timeRange: string = '7d'): Promise<any> {
    return this.get(`/analytics?range=${timeRange}`);
  }

  public async getConversationMetrics(): Promise<any> {
    return this.get('/analytics/conversations');
  }

  public async getBookingMetrics(): Promise<any> {
    return this.get('/analytics/bookings');
  }

  // Settings
  public async getSettings(): Promise<any> {
    return this.get('/settings');
  }

  public async updateSettings(settings: any): Promise<any> {
    return this.put('/settings', settings);
  }

  // Knowledge Base
  public async getKnowledgeBase(): Promise<any> {
    return this.get('/knowledge');
  }

  public async updateKnowledgeBase(data: any): Promise<any> {
    return this.put('/knowledge', data);
  }
}

export default new ApiService(); 