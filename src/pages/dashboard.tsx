import { useState, useEffect } from 'react';
import { outreachStorage, type OutreachSummary } from '../services/outreach-storage';

export default function Dashboard() {
  const [count, setCount] = useState(0);
  const [outreachSummary, setOutreachSummary] = useState<OutreachSummary | null>(null);

  // Load outreach data when component mounts
  useEffect(() => {
    const summary = outreachStorage.getOutreachSummary();
    setOutreachSummary(summary);
  }, []);

  // Helper function to get status display name
  const getStatusDisplayName = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'Pending',
      contacted: 'Contacted',
      interested: 'Interested',
      negotiating: 'Negotiating',
      deal_closed: 'Deal Closed',
      declined: 'Declined'
    };
    return statusMap[status] || status;
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'text-yellow-600 bg-yellow-100',
      contacted: 'text-blue-600 bg-blue-100',
      interested: 'text-green-600 bg-green-100',
      negotiating: 'text-orange-600 bg-orange-100',
      deal_closed: 'text-purple-600 bg-purple-100',
      declined: 'text-red-600 bg-red-100'
    };
    return colorMap[status] || 'text-gray-600 bg-gray-100';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome to InfluencerFlowAI Dashboard
        </h1>
        <p className="text-gray-600">
          Manage your influencer marketing campaigns with AI-powered automation.
        </p>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Total Creators</h3>
              <p className="text-2xl font-semibold text-gray-900">1,247</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Active Campaigns</h3>
              <p className="text-2xl font-semibold text-gray-900">12</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Total Outreaches</h3>
              <p className="text-2xl font-semibold text-gray-900">
                {outreachSummary?.totalOutreaches || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
              <p className="text-2xl font-semibold text-gray-900">
                {outreachSummary?.successRate || 0}%
              </p>
              <p className="text-xs text-green-600 mt-1">
                {outreachSummary && outreachSummary.totalOutreaches > 0 ? 'Based on responses' : 'No data yet'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Outreach Summary Section */}
      {outreachSummary && outreachSummary.totalOutreaches > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Outreach Status Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              📊 Outreach Status Overview
            </h2>
            <div className="space-y-3">
              {Object.entries(outreachSummary.statusCounts).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                      {getStatusDisplayName(status)}
                    </span>
                  </div>
                  <span className="font-semibold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Outreaches */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                📧 Recent Outreaches
              </h2>
              <button
                onClick={() => setOutreachSummary(outreachStorage.getOutreachSummary())}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {outreachSummary.recentOutreaches.length > 0 ? (
                outreachSummary.recentOutreaches.map((outreach) => (
                  <div key={outreach.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <img
                      src={outreach.creatorAvatar}
                      alt={outreach.creatorName}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{outreach.creatorName}</h3>
                      <p className="text-sm text-gray-600">{outreach.creatorPlatform}</p>
                      <p className="text-xs text-gray-500">
                        {outreach.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(outreach.status)}`}>
                      {getStatusDisplayName(outreach.status)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">
                  No outreaches yet. Use the AI Creator Search to find creators and start outreach!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call to Action for No Outreaches */}
      {outreachSummary && outreachSummary.totalOutreaches === 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-6">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-purple-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              📧 Start Your First Outreach Campaign!
            </h3>
            <p className="text-gray-600 mb-4">
              Use our AI-powered tools to find creators and generate personalized outreach emails.
            </p>
            <div className="flex justify-center gap-3">
              <a
                href="/creators"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                🔍 Find Creators
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Demo Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Interactive Demo
        </h2>
        <p className="text-gray-600 mb-4">
          Click the button below to test React functionality:
        </p>
        <button 
          onClick={() => setCount(count + 1)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Count: {count}
        </button>
        {count > 0 && (
          <p className="mt-3 text-sm text-green-600">
            ✓ React state management is working! You've clicked {count} times.
          </p>
        )}
      </div>
    </div>
  );
} 