import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  BuildingOfficeIcon,
  CogIcon,
  DocumentTextIcon,
  ChartBarIcon,
  PlusIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalClinics: number;
  activeWebhooks: number;
  documentsUploaded: number;
  monthlyConversations: number;
}

const DashboardHome: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalClinics: 0,
    activeWebhooks: 0,
    documentsUploaded: 0,
    monthlyConversations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch real dashboard stats from the API
      const response = await api.get('/api/dashboard/stats');
      if (response.success) {
        setStats(response.data);
      } else {
        throw new Error(response.error?.message || 'Failed to load dashboard data');
      }
    } catch (err: any) {
      console.error('Dashboard stats error:', err);
      setError(err.message || 'Failed to load dashboard data');
      
      // Fallback to mock data if API fails
      setStats({
        totalClinics: 0,
        activeWebhooks: 0,
        documentsUploaded: 0,
        monthlyConversations: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      name: 'Total Clinics',
      value: stats.totalClinics,
      icon: BuildingOfficeIcon,
      color: 'bg-blue-500',
      href: '/clinics',
    },
    {
      name: 'Active Webhooks',
      value: stats.activeWebhooks,
      icon: CogIcon,
      color: 'bg-green-500',
      href: '/webhooks',
    },
    {
      name: 'Documents Uploaded',
      value: stats.documentsUploaded,
      icon: DocumentTextIcon,
      color: 'bg-purple-500',
      href: '/knowledge-base',
    },
    {
      name: 'Monthly Conversations',
      value: stats.monthlyConversations,
      icon: ChartBarIcon,
      color: 'bg-orange-500',
      href: '/analytics',
    },
  ];

  const quickActions = [
    {
      name: 'Add New Clinic',
      description: 'Set up a new clinic with Cliniko integration',
      href: '/clinics',
      icon: BuildingOfficeIcon,
      color: 'text-blue-600',
    },
    {
      name: 'Create Webhook',
      description: 'Generate a new webhook endpoint for a clinic',
      href: '/webhooks',
      icon: CogIcon,
      color: 'text-green-600',
    },
    {
      name: 'Upload Documents',
      description: 'Add knowledge base documents for clinic agents',
      href: '/knowledge-base',
      icon: DocumentTextIcon,
      color: 'text-purple-600',
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to your SwiftClinic admin dashboard</p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.name}
            to={card.href}
            className="card hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 ${card.color} rounded-md flex items-center justify-center`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">{card.name}</dt>
                  <dd className="text-lg font-medium text-gray-900">{card.value}</dd>
                </dl>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-4">
            {quickActions.map((action) => (
              <Link
                key={action.name}
                to={action.href}
                className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <div className="flex-shrink-0">
                  <action.icon className={`w-6 h-6 ${action.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-900">{action.name}</p>
                  <p className="text-sm text-gray-500">{action.description}</p>
                </div>
                <div className="ml-auto">
                  <PlusIcon className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
              <span className="text-gray-600">Webhook created for "SwiftPhysio Downtown"</span>
              <span className="ml-auto text-gray-400">2h ago</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-blue-400 rounded-full mr-3"></div>
              <span className="text-gray-600">New clinic "HealthFirst" added</span>
              <span className="ml-auto text-gray-400">4h ago</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-purple-400 rounded-full mr-3"></div>
              <span className="text-gray-600">5 documents uploaded to knowledge base</span>
              <span className="ml-auto text-gray-400">1d ago</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 bg-orange-400 rounded-full mr-3"></div>
              <span className="text-gray-600">Webhook tested successfully</span>
              <span className="ml-auto text-gray-400">2d ago</span>
            </div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="card">
        <h2 className="text-lg font-medium text-gray-900 mb-4">System Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">Webhook API</p>
              <p className="text-xs text-gray-500">Operational</p>
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">Database</p>
              <p className="text-xs text-gray-500">Operational</p>
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-yellow-400 rounded-full mr-3"></div>
            <div>
              <p className="text-sm font-medium text-gray-900">OpenAI API</p>
              <p className="text-xs text-gray-500">Rate Limited</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome; 