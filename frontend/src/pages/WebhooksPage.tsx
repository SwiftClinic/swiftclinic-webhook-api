import React from 'react';
import { CogIcon, PlusIcon, PlayIcon } from '@heroicons/react/24/outline';

const WebhooksPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-gray-600">Create and manage webhook endpoints for your clinics</p>
        </div>
        <button className="btn-primary flex items-center">
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Webhook
        </button>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <CogIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Webhooks Management</h3>
          <p className="text-gray-600 mb-6">
            Create, test, and monitor webhook endpoints for seamless clinic integration.
          </p>
          <button className="btn-primary flex items-center mx-auto">
            <PlayIcon className="w-4 h-4 mr-2" />
            Test Webhook
          </button>
        </div>
      </div>
    </div>
  );
};

export default WebhooksPage; 