import { useParams, Link } from 'react-router-dom';
import { mockCreators } from '../mock-data/creators';
import { mockCampaigns } from '../mock-data/campaigns';
import { findCampaignsForCreator, getMatchQuality } from '../utils/matching';

export default function CreatorProfile() {
  const { id } = useParams<{ id: string }>();
  const creator = mockCreators.find(c => c.id === id);

  if (!creator) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Not Found</h2>
        <p className="text-gray-600 mb-4">The creator you're looking for doesn't exist.</p>
        <Link to="/creators" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Back to Creators
        </Link>
      </div>
    );
  }

  // Get recommended campaigns for this creator
  const recommendedCampaigns = findCampaignsForCreator(creator, mockCampaigns, 3, 50);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return num.toString();
  };

  const getPlatformIcon = (platform: string) => {
    const iconClass = "w-5 h-5";
    switch (platform) {
      case 'instagram':
        return <div className={`${iconClass} bg-pink-500 rounded-sm`}></div>;
      case 'youtube':
        return <div className={`${iconClass} bg-red-500 rounded-sm`}></div>;
      case 'tiktok':
        return <div className={`${iconClass} bg-black rounded-sm`}></div>;
      case 'twitter':
        return <div className={`${iconClass} bg-blue-400 rounded-sm`}></div>;
      default:
        return <div className={`${iconClass} bg-gray-400 rounded-sm`}></div>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link 
        to="/creators" 
        className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Creators
      </Link>

      {/* Creator Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-6">
          <img
            src={creator.avatar}
            alt={creator.name}
            className="w-32 h-32 rounded-full object-cover"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{creator.name}</h1>
              {creator.verified && (
                <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              )}
            </div>
            <p className="text-xl text-gray-600 mb-2">{creator.username}</p>
            <div className="flex items-center gap-2 mb-4">
              {getPlatformIcon(creator.platform)}
              <span className="text-gray-700 capitalize font-medium">{creator.platform}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{creator.location}</span>
            </div>
            <p className="text-gray-700 mb-4">{creator.bio}</p>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={`w-5 h-5 ${i < Math.floor(creator.rating) ? 'text-yellow-400' : 'text-gray-300'}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                ))}
              </div>
              <span className="text-gray-600">{creator.rating}/5</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{creator.responseTime}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors">
              Contact Creator
            </button>
            <button className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg transition-colors">
              Save Profile
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metrics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Metrics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{formatNumber(creator.metrics.followers)}</p>
              <p className="text-sm text-gray-600">Followers</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{creator.metrics.engagementRate}%</p>
              <p className="text-sm text-gray-600">Engagement Rate</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{formatNumber(creator.metrics.avgViews)}</p>
              <p className="text-sm text-gray-600">Avg Views</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{formatNumber(creator.metrics.avgLikes)}</p>
              <p className="text-sm text-gray-600">Avg Likes</p>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 7h-3V6a1 1 0 0 0-2 0v1h-4V6a1 1 0 0 0-2 0v1H5a1 1 0 0 0 0 2h2v2H5a1 1 0 0 0 0 2h2v6a1 1 0 0 0 2 0v-6h4v6a1 1 0 0 0 2 0v-6h2a1 1 0 0 0 0-2h-2V9h2a1 1 0 0 0 0-2zM10 9h4v2h-4V9z"/></svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">Post</p>
                <span className="text-lg font-semibold text-gray-900">₹{creator.rates.post.toLocaleString()}</span>
              </div>
            </div>

            {creator.rates.story && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Story</p>
                  <span className="text-lg font-semibold text-gray-900">₹{creator.rates.story.toLocaleString()}</span>
                </div>
              </div>
            )}

            {creator.rates.reel && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reel</p>
                  <span className="text-lg font-semibold text-gray-900">₹{creator.rates.reel.toLocaleString()}</span>
                </div>
              </div>
            )}

            {creator.rates.video && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Video</p>
                  <span className="text-lg font-semibold text-gray-900">₹{creator.rates.video.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demographics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Audience Demographics</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Age Range</p>
              <p className="text-lg text-gray-900">{creator.demographics.ageRange}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Top Countries</p>
              <div className="flex flex-wrap gap-2">
                {creator.demographics.topCountries.map((country, index) => (
                  <span key={index} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
                    {country}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Gender Split</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Female</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full">
                      <div 
                        className="h-2 bg-pink-500 rounded-full"
                        style={{ width: `${creator.demographics.genderSplit.female}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{creator.demographics.genderSplit.female}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Male</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full">
                      <div 
                        className="h-2 bg-blue-500 rounded-full"
                        style={{ width: `${creator.demographics.genderSplit.male}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{creator.demographics.genderSplit.male}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Niches */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Niches</h2>
          <div className="flex flex-wrap gap-2">
            {creator.niche.map((niche, index) => (
              <span
                key={index}
                className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium capitalize"
              >
                {niche}
              </span>
            ))}
          </div>
          
          {/* Recent Performance */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Performance</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Avg Comments</p>
                <p className="font-semibold text-gray-900">{formatNumber(creator.metrics.avgComments)}</p>
              </div>
              <div>
                <p className="text-gray-500">Response Rate</p>
                <p className="font-semibold text-gray-900">95%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Campaigns */}
      {recommendedCampaigns.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Recommended Campaigns</h2>
            <Link to="/campaigns" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All Campaigns →
            </Link>
          </div>
          
          <div className="space-y-4">
            {recommendedCampaigns.map((match) => {
              const quality = getMatchQuality(match.score);
              return (
                <div key={match.campaign.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900">{match.campaign.title}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          quality.color === 'green' ? 'bg-green-100 text-green-800' :
                          quality.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                          quality.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {match.score}% Match
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{match.campaign.brand}</p>
                      <p className="text-sm text-gray-700">{match.campaign.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        ₹{match.campaign.budget.min.toLocaleString()} - ₹{match.campaign.budget.max.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500">Budget</p>
                    </div>
                  </div>

                  {/* Match Reasons */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-xs font-medium text-green-700 mb-1">Why it's a good match:</p>
                      <ul className="text-xs text-green-600 space-y-1">
                        {match.matchReasons.slice(0, 3).map((reason, idx) => (
                          <li key={idx}>• {reason}</li>
                        ))}
                      </ul>
                    </div>
                    {match.concerns.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-amber-700 mb-1">Considerations:</p>
                        <ul className="text-xs text-amber-600 space-y-1">
                          {match.concerns.slice(0, 2).map((concern, idx) => (
                            <li key={idx}>• {concern}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-4">
                    <button className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                      Apply to Campaign
                    </button>
                    <Link 
                      to={`/campaigns/${match.campaign.id}`}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm text-center"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
} 