import { Link } from 'react-router-dom';
import { mockCampaigns } from '../mock-data/campaigns';

export default function Campaigns() {
  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'active':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'draft':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case 'in_review':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'completed':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'cancelled':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const getDaysUntilDeadline = (deadline: Date) => {
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-600">Manage your influencer marketing campaigns</p>
        </div>
        <Link 
          to="/campaigns/create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Create Campaign
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-4">
          <select className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option>All Status</option>
            <option>Active</option>
            <option>Draft</option>
            <option>In Review</option>
            <option>Completed</option>
          </select>
          <input
            type="text"
            placeholder="Search campaigns..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Campaign Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {mockCampaigns.map((campaign) => {
          const daysUntilDeadline = getDaysUntilDeadline(campaign.timeline.applicationDeadline);
          const progressPercentage = Math.round((campaign.selected / Math.max(campaign.applicants, 1)) * 100);

          return (
            <div key={campaign.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
              {/* Campaign Header */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900 mb-1">
                      {campaign.title}
                    </h3>
                    <p className="text-sm text-gray-600">{campaign.brand}</p>
                  </div>
                  <span className={getStatusBadge(campaign.status)}>
                    {campaign.status.replace('_', ' ')}
                  </span>
                </div>
                
                <p className="text-sm text-gray-700 mb-4 line-clamp-2">
                  {campaign.description}
                </p>

                {/* Budget and Timeline */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-sm text-gray-600">Budget</p>
                    <p className="font-semibold text-gray-900">
                      ₹{campaign.budget.min.toLocaleString()} - ₹{campaign.budget.max.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Deadline:</span>
                    <p className="font-medium text-gray-900">
                      {formatDate(campaign.timeline.applicationDeadline)}
                    </p>
                    {daysUntilDeadline > 0 && daysUntilDeadline <= 7 && (
                      <p className="text-xs text-orange-600">
                        {daysUntilDeadline} days left
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Campaign Progress */}
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">Progress</span>
                  <span className="text-sm text-gray-500">
                    {campaign.selected} / {campaign.applicants} creators
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{campaign.applicants} applications</span>
                  <span>{campaign.selected} selected</span>
                </div>
              </div>

              {/* Requirements Preview */}
              <div className="p-6 border-b border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Requirements</h4>
                <div className="flex flex-wrap gap-2 mb-3">
                  {campaign.requirements.platforms.map((platform, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md capitalize">
                      {platform}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-gray-500">
                  Min. {campaign.requirements.minFollowers.toLocaleString()} followers
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6">
                <div className="flex gap-2">
                  <Link
                    to={`/campaigns/${campaign.id}`}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-center text-sm"
                  >
                    View Details
                  </Link>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                    Edit
                  </button>
                  <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                    Analytics
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State for additional campaigns */}
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <div className="max-w-md mx-auto">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to create more campaigns?</h3>
          <p className="text-gray-500 mb-4">Start reaching more creators with targeted campaigns.</p>
          <Link 
            to="/campaigns/create"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Create New Campaign
          </Link>
        </div>
      </div>
    </div>
  );
} 