import { useState, useEffect, useMemo } from 'react';
import { outreachStorage, type OutreachSummary, type StoredOutreach } from '../services/outreach-storage';

export default function Dashboard() {
  const [outreachSummary, setOutreachSummary] = useState<OutreachSummary | null>(null);
  const [allOutreaches, setAllOutreaches] = useState<StoredOutreach[]>([]);
  
  // Filter states
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Load outreach data when component mounts
  useEffect(() => {
    const summary = outreachStorage.getOutreachSummary();
    const allData = outreachStorage.getAllOutreaches();
    setOutreachSummary(summary);
    setAllOutreaches(allData);
    
    // Initialize with all statuses selected
    if (summary && Object.keys(summary.statusCounts).length > 0) {
      setSelectedStatuses(new Set(Object.keys(summary.statusCounts)));
    }
  }, []);

  // Filtered data based on current filters
  const filteredOutreaches = useMemo(() => {
    let filtered = allOutreaches;

    // Filter by status
    if (selectedStatuses.size > 0 && selectedStatuses.size < 6) {
      filtered = filtered.filter(outreach => selectedStatuses.has(outreach.status));
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter(outreach => outreach.createdAt >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      filtered = filtered.filter(outreach => outreach.createdAt <= end);
    }

    return filtered;
  }, [allOutreaches, selectedStatuses, startDate, endDate]);

  // Calculate filtered summary
  const filteredSummary = useMemo(() => {
    if (filteredOutreaches.length === 0) {
      return {
        totalOutreaches: 0,
        statusCounts: {},
        recentOutreaches: [],
        successRate: 0
      };
    }

    // Calculate status counts for filtered data
    const statusCounts = filteredOutreaches.reduce((counts, outreach) => {
      counts[outreach.status] = (counts[outreach.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // Calculate success rate
    const successfulStatuses = ['interested', 'negotiating', 'deal_closed'];
    const successfulCount = successfulStatuses.reduce((count, status) => 
      count + (statusCounts[status] || 0), 0
    );
    const successRate = filteredOutreaches.length > 0 ? (successfulCount / filteredOutreaches.length) * 100 : 0;

    // Get recent outreaches (last 5 from filtered data)
    const recentOutreaches = filteredOutreaches.slice(0, 5);

    return {
      totalOutreaches: filteredOutreaches.length,
      statusCounts,
      recentOutreaches,
      successRate: Math.round(successRate)
    };
  }, [filteredOutreaches]);

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

  // Helper function to get progress bar color
  const getProgressBarColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'bg-yellow-400',
      contacted: 'bg-blue-400',
      interested: 'bg-green-400',
      negotiating: 'bg-orange-400',
      deal_closed: 'bg-purple-400',
      declined: 'bg-red-400'
    };
    return colorMap[status] || 'bg-gray-400';
  };

  // Helper function to get status icon
  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, string> = {
      pending: '⏳',
      contacted: '📧',
      interested: '😊',
      negotiating: '🤝',
      deal_closed: '✅',
      declined: '❌'
    };
    return iconMap[status] || '📋';
  };

  // Calculate percentage for each status
  const getStatusPercentage = (count: number, total: number) => {
    return total > 0 ? Math.round((count / total) * 100) : 0;
  };

  // Toggle status filter
  const toggleStatusFilter = (status: string) => {
    const newSelectedStatuses = new Set(selectedStatuses);
    if (newSelectedStatuses.has(status)) {
      newSelectedStatuses.delete(status);
    } else {
      newSelectedStatuses.add(status);
    }
    setSelectedStatuses(newSelectedStatuses);
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedStatuses(new Set(Object.keys(outreachSummary?.statusCounts || {})));
    setStartDate('');
    setEndDate('');
  };

  // Export functions
  const exportToCSV = () => {
    if (filteredOutreaches.length === 0) {
      alert('No data to export!');
      return;
    }

    const headers = [
      'Creator Name',
      'Platform',
      'Status',
      'Confidence',
      'Brand Name',
      'Created Date',
      'Last Contact',
      'Current Offer',
      'Notes'
    ];

    const csvData = filteredOutreaches.map(outreach => [
      outreach.creatorName,
      outreach.creatorPlatform,
      getStatusDisplayName(outreach.status),
      `${outreach.confidence}%`,
      outreach.brandName,
      outreach.createdAt.toLocaleDateString(),
      outreach.lastContact.toLocaleDateString(),
      outreach.currentOffer ? `$${outreach.currentOffer}` : 'N/A',
      outreach.notes || 'No notes'
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `outreach-data-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToJSON = () => {
    if (filteredOutreaches.length === 0) {
      alert('No data to export!');
      return;
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      totalRecords: filteredOutreaches.length,
      filters: {
        statuses: Array.from(selectedStatuses),
        startDate,
        endDate
      },
      summary: filteredSummary,
      outreaches: filteredOutreaches.map(outreach => ({
        ...outreach,
        createdAt: outreach.createdAt.toISOString(),
        lastContact: outreach.lastContact.toISOString()
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `outreach-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome to InfluencerFlowAI Dashboard
            </h1>
            <p className="text-gray-600">
              Manage your influencer marketing campaigns with AI-powered automation.
            </p>
          </div>
          
          {/* Filter and Export Controls */}
          {outreachSummary && outreachSummary.totalOutreaches > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors flex items-center gap-2"
              >
                🔍 {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                📊 Export CSV
              </button>
              <button
                onClick={exportToJSON}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                📄 Export JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && outreachSummary && outreachSummary.totalOutreaches > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">🔍 Filter Options</h3>
            <button
              onClick={clearFilters}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear All Filters
            </button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Filters */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Filter by Status:</h4>
              <div className="space-y-2">
                {Object.entries(outreachSummary.statusCounts).map(([status, count]) => (
                  <label key={status} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(status)}
                      onChange={() => toggleStatusFilter(status)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <span className="text-lg">{getStatusIcon(status)}</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
                      {getStatusDisplayName(status)}
                    </span>
                    <span className="text-sm text-gray-500">({count})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Date Range Filters */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Filter by Date Range:</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Start Date:
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    End Date:
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Filter Summary */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span>
                Showing <strong>{filteredSummary.totalOutreaches}</strong> of <strong>{outreachSummary.totalOutreaches}</strong> outreaches
              </span>
              {selectedStatuses.size < Object.keys(outreachSummary.statusCounts).length && (
                <span>• Filtered by {selectedStatuses.size} status(es)</span>
              )}
              {(startDate || endDate) && (
                <span>• Date filtered</span>
              )}
            </div>
          </div>
        </div>
      )}

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
                {filteredSummary.totalOutreaches}
              </p>
              {filteredSummary.totalOutreaches !== (outreachSummary?.totalOutreaches || 0) && (
                <p className="text-xs text-blue-600 mt-1">
                  of {outreachSummary?.totalOutreaches || 0} total
                </p>
              )}
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
                {filteredSummary.successRate}%
              </p>
              <p className="text-xs text-green-600 mt-1">
                {filteredSummary.totalOutreaches > 0 ? 'Based on filtered data' : 'No data yet'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Outreach Summary Section */}
      {filteredSummary && filteredSummary.totalOutreaches > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Enhanced Outreach Status Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                📊 Outreach Status Overview
              </h2>
              <div className="text-sm text-gray-500">
                {filteredSummary.totalOutreaches !== (outreachSummary?.totalOutreaches || 0) ? (
                  <>Filtered: {filteredSummary.totalOutreaches}</>
                ) : (
                  <>Total: {filteredSummary.totalOutreaches}</>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              {Object.entries(filteredSummary.statusCounts).map(([status, count]) => {
                const percentage = getStatusPercentage(count, filteredSummary.totalOutreaches);
                return (
                  <div key={status} className="space-y-2">
                    {/* Status Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getStatusIcon(status)}</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
                          {getStatusDisplayName(status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{count}</span>
                        <span className="text-sm text-gray-500">({percentage}%)</span>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${getProgressBarColor(status)}`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary Stats */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="font-semibold text-green-700">Positive Response</div>
                  <div className="text-lg font-bold text-green-600">
                    {((filteredSummary.statusCounts.interested || 0) + 
                      (filteredSummary.statusCounts.negotiating || 0) + 
                      (filteredSummary.statusCounts.deal_closed || 0))}
                  </div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="font-semibold text-blue-700">In Progress</div>
                  <div className="text-lg font-bold text-blue-600">
                    {((filteredSummary.statusCounts.pending || 0) + 
                      (filteredSummary.statusCounts.contacted || 0))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Outreaches */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                📧 Recent Outreaches
              </h2>
              <button
                onClick={() => {
                  const summary = outreachStorage.getOutreachSummary();
                  const allData = outreachStorage.getAllOutreaches();
                  setOutreachSummary(summary);
                  setAllOutreaches(allData);
                }}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                Refresh
              </button>
            </div>
            <div className="space-y-3">
              {filteredSummary.recentOutreaches.length > 0 ? (
                filteredSummary.recentOutreaches.map((outreach) => (
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
                  No outreaches match your current filters.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Call to Action for No Outreaches */}
      {(!filteredSummary || filteredSummary.totalOutreaches === 0) && outreachSummary && outreachSummary.totalOutreaches === 0 && (
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

      {/* No Results from Filters */}
      {filteredSummary && filteredSummary.totalOutreaches === 0 && outreachSummary && outreachSummary.totalOutreaches > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-yellow-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              🔍 No Results Found
            </h3>
            <p className="text-gray-600 mb-4">
              Your current filters don't match any outreaches. Try adjusting your filter criteria.
            </p>
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 