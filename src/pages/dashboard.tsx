import { useState, useEffect, useMemo } from 'react';
import { outreachStorageService, type OutreachSummary, type StoredOutreach } from '../services/outreach-storage';

export default function Dashboard() {
  const [outreachSummary, setOutreachSummary] = useState<OutreachSummary | null>(null);
  const [allOutreaches, setAllOutreaches] = useState<StoredOutreach[]>([]);
  
  // Filter states
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load outreach data when component mounts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const summary = await outreachStorageService.getOutreachSummary();
        const allData = await outreachStorageService.getAllOutreaches();
        setOutreachSummary(summary);
        setAllOutreaches(allData);
        
        if (summary && Object.keys(summary.statusCounts).length > 0) {
          setSelectedStatuses(new Set(Object.keys(summary.statusCounts)));
        }
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        // Optionally set an error state here to display to the user
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
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
            <p className="text-sm text-gray-600">
              Manage your influencer marketing campaigns with AI-powered automation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            <button 
                onClick={exportToCSV}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
                Export CSV
            </button>
            <button 
                onClick={exportToJSON}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
                Export JSON
            </button>
          </div>
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
        {/* Total Creators Card */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 truncate">Total Creators</p>
              <p className="text-2xl font-semibold text-gray-900">
                {isLoading ? '...' : outreachSummary?.totalCreators ?? '0'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Campaigns Card */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 truncate">Active Campaigns</p>
              <p className="text-2xl font-semibold text-gray-900">
                {isLoading ? '...' : outreachSummary?.activeCampaigns ?? '0'}
              </p>
            </div>
          </div>
        </div>

        {/* Total Outreaches Card - This one should use filteredSummary for dynamic updates with filters */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 truncate">Total Outreaches</p>
              <p className="text-2xl font-semibold text-gray-900">
                {isLoading ? '...' : filteredSummary.totalOutreaches}
              </p>
            </div>
          </div>
        </div>

        {/* Success Rate Card - This one should use filteredSummary for dynamic updates with filters */}
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-yellow-500 rounded-md p-3">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.135 3.135 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.135 3.135 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.135-3.135 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.135-3.135z" /></svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 truncate">Success Rate</p>
              <p className="text-2xl font-semibold text-gray-900">
                {isLoading ? '...' : `${filteredSummary.successRate}%`}
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
                onClick={async () => {
                  const summary = await outreachStorageService.getOutreachSummary();
                  const allData = await outreachStorageService.getAllOutreaches();
                  setOutreachSummary(summary);
                  setAllOutreaches(allData);
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m-15.357-2a8.001 8.001 0 0115.357-2m0 0H15" />
                </svg>
                Refresh Data
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