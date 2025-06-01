import { useState } from 'react';
import { mockCampaigns } from '../mock-data/campaigns';
import { mockDeals } from '../mock-data/deals';
import { mockCreators } from '../mock-data/creators';
import { mockPaymentMilestones } from '../mock-data/payments';

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('30d');
  // const [selectedMetric, setSelectedMetric] = useState('overview'); // Currently unused but kept for future features

  // Calculate analytics data
  const totalSpent = mockPaymentMilestones
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const activeCampaigns = mockCampaigns.filter(c => c.status === 'active').length;
  const completedDeals = mockDeals.filter(d => d.status === 'completed').length;
  const avgEngagement = mockCreators.reduce((sum, c) => sum + c.metrics.engagementRate, 0) / mockCreators.length;

  // Campaign performance data
  const campaignPerformance = mockCampaigns.map(campaign => {
    const campaignDeals = mockDeals.filter(d => d.campaignId === campaign.id);
    const totalReach = campaignDeals.reduce((sum, deal) => {
      const creator = mockCreators.find(c => c.id === deal.creatorId);
      return sum + (creator?.metrics.followers || 0);
    }, 0);
    
    const totalSpent = mockPaymentMilestones
      .filter(p => campaignDeals.some(d => d.id === p.dealId) && p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    const avgEngagement = campaignDeals.reduce((sum, deal) => {
      const creator = mockCreators.find(c => c.id === deal.creatorId);
      return sum + (creator?.metrics.engagementRate || 0);
    }, 0) / Math.max(campaignDeals.length, 1);

    return {
      ...campaign,
      totalReach,
      totalSpent,
      avgEngagement,
      dealCount: campaignDeals.length,
      estimatedImpressions: Math.round(totalReach * (avgEngagement / 100) * 2.5), // Rough estimate
      costPerEngagement: totalSpent > 0 ? totalSpent / (totalReach * avgEngagement / 100) : 0
    };
  });

  // Top performing creators
  const topCreators = mockCreators
    .map(creator => {
      const creatorDeals = mockDeals.filter(d => d.creatorId === creator.id);
      const totalEarned = mockPaymentMilestones
        .filter(p => creatorDeals.some(d => d.id === p.dealId) && p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0);
      
      return {
        ...creator,
        dealCount: creatorDeals.length,
        totalEarned,
        completionRate: creatorDeals.filter(d => d.status === 'completed').length / Math.max(creatorDeals.length, 1)
      };
    })
    .sort((a, b) => b.totalEarned - a.totalEarned)
    .slice(0, 5);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return num.toString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-600">Track performance and ROI across your campaigns</p>
          </div>
          <div className="flex gap-3">
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
            </select>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Spend</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
              <p className="text-sm text-green-600">+12% from last month</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Reach</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(campaignPerformance.reduce((sum, c) => sum + c.totalReach, 0))}
              </p>
              <p className="text-sm text-blue-600">+8% from last month</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Engagement</p>
              <p className="text-2xl font-bold text-gray-900">{avgEngagement.toFixed(1)}%</p>
              <p className="text-sm text-green-600">+2.3% from last month</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Campaigns</p>
              <p className="text-2xl font-bold text-gray-900">{activeCampaigns}</p>
              <p className="text-sm text-gray-600">{completedDeals} completed deals</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Performance</h2>
          <div className="space-y-4">
            {campaignPerformance.map((campaign, _index) => (
              <div key={campaign.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-medium text-gray-900">{campaign.title}</h3>
                    <p className="text-sm text-gray-600">{campaign.brand}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                    campaign.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {campaign.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Reach</p>
                    <p className="font-semibold text-gray-900">{formatNumber(campaign.totalReach)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Spend</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(campaign.totalSpent)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Engagement</p>
                    <p className="font-semibold text-gray-900">{campaign.avgEngagement.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Performance Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Performance Score</span>
                    <span>{Math.round(campaign.avgEngagement * 10)}/100</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${Math.min(campaign.avgEngagement * 10, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Creators */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performing Creators</h2>
          <div className="space-y-4">
            {topCreators.map((creator, index) => (
              <div key={creator.id} className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                  <img
                    src={creator.avatar}
                    alt={creator.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h3 className="font-medium text-gray-900">{creator.name}</h3>
                    <p className="text-sm text-gray-600">{creator.username}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{formatNumber(creator.metrics.followers)} followers</span>
                      <span>•</span>
                      <span>{creator.metrics.engagementRate}% engagement</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatCurrency(creator.totalEarned)}</p>
                  <p className="text-sm text-gray-600">{creator.dealCount} campaigns</p>
                  <p className="text-xs text-green-600">{(creator.completionRate * 100).toFixed(0)}% completion</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ROI Analysis */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ROI Analysis</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Cost per Engagement</span>
              <span className="font-semibold text-gray-900">₹0.12</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Cost per Click</span>
              <span className="font-semibold text-gray-900">₹2.45</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">ROAS</span>
              <span className="font-semibold text-green-600">3.2x</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Conversion Rate</span>
              <span className="font-semibold text-gray-900">2.8%</span>
            </div>
          </div>
        </div>

        {/* Platform Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Performance</h2>
          <div className="space-y-3">
            {['instagram', 'youtube', 'twitter', 'linkedin'].map(platform => {
              const platformCreators = mockCreators.filter(c => c.platform === platform);
              const avgEngagement = platformCreators.reduce((sum, c) => sum + c.metrics.engagementRate, 0) / Math.max(platformCreators.length, 1);
              const totalReach = platformCreators.reduce((sum, c) => sum + c.metrics.followers, 0);
              
              return (
                <div key={platform} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900 capitalize">{platform}</p>
                    <p className="text-sm text-gray-600">{formatNumber(totalReach)} total reach</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{avgEngagement.toFixed(1)}%</p>
                    <p className="text-sm text-gray-600">avg engagement</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800">Payment Completed</p>
                <p className="text-xs text-green-600">₹2,800 to Pooja Nair</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-800">New Application</p>
                <p className="text-xs text-blue-600">Sarah Chen applied to fitness campaign</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-purple-800">Contract Signed</p>
                <p className="text-xs text-purple-600">Marcus Johnson signed tech review contract</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 