import React from 'react';
import { DocumentTextIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';

const KnowledgeBasePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-gray-600">Upload and manage documents for your clinic agents</p>
        </div>
        <button className="btn-primary flex items-center">
          <CloudArrowUpIcon className="w-4 h-4 mr-2" />
          Upload Documents
        </button>
      </div>

      <div className="card">
        <div className="text-center py-12">
          <DocumentTextIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Document Management</h3>
          <p className="text-gray-600 mb-6">
            Upload PDFs, docs, and other files to enhance your clinic agents' knowledge base.
          </p>
          <button className="btn-primary flex items-center mx-auto">
            <CloudArrowUpIcon className="w-4 h-4 mr-2" />
            Upload Your First Document
          </button>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeBasePage; 