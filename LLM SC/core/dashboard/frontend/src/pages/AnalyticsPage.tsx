import React from 'react';
import { ChartBarIcon, CalendarIcon } from '@heroicons/react/24/outline';

const AnalyticsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600">View performance metrics and insights for your clinic agents</p>
        </div>
        <button className="btn-secondary flex items-center">
          <CalendarIcon className="w-4 h-4 mr-2" />
          Date Range
        </button>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <ChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Analytics Dashboard</h3>
          <p className="text-gray-600 mb-6">
            Track conversations, bookings, response times, and client satisfaction metrics.
          </p>
          <p className="text-sm text-gray-500">
            Analytics data will appear here as your clinic agents handle more conversations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage; 