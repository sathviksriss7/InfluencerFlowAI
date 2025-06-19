import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AICreatorSearchLLM from '../components/ai-creator-search-llm';
import { supabase } from '../lib/supabase';
import { type Creator, type Campaign } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

export default function Creators() {
  const [searchMode, setSearchMode] = useState<'filter' | 'ai'>('filter');
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [nicheFilter, setNicheFilter] = useState('all');
  const [sortBy, setSortBy] = useState('followers');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // State for creators fetched from Supabase
  const [allCreators, setAllCreators] = useState<Creator[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [errorCreators, setErrorCreators] = useState<string | null>(null);

  // State for assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCreatorForAssignment, setSelectedCreatorForAssignment] = useState<Creator | null>(null);
  const [assignableCampaigns, setAssignableCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignIdForAssignment, setSelectedCampaignIdForAssignment] = useState<string | ''>(''); // Initialize with empty string for select
  const [isFetchingCampaigns, setIsFetchingCampaigns] = useState(false);
  const [isAssigningCreator, setIsAssigningCreator] = useState(false);
  
  const { session } = useAuth();

  // Fetch creators from Supabase on component mount
  useEffect(() => {
    const fetchCreators = async () => {
      setLoadingCreators(true);
      setErrorCreators(null);
      try {
        const { data, error } = await supabase
          .from('creators') // Assuming your table is named 'creators'
          .select('*'); // Adjust columns as needed, e.g., Supabase might auto-convert snake_case

        if (error) {
          console.error("Error fetching creators from Supabase:", error);
          throw error;
        }
        // Ensure data is not null and is an array (Supabase might return null if table is empty)
        setAllCreators(data || []); 
      } catch (err: any) {
        setErrorCreators(err.message || "Failed to fetch creators.");
        setAllCreators([]); // Set to empty array on error
      } finally {
        setLoadingCreators(false);
      }
    };

    fetchCreators();
  }, []);

  // Get unique platforms and niches for filters from fetched data
  const platforms = useMemo(() => {
    if (loadingCreators || errorCreators || !allCreators.length) return [];
    return [...new Set(allCreators.map(creator => creator.platform))].filter(Boolean);
  }, [allCreators, loadingCreators, errorCreators]);

  const niches = useMemo(() => {
    if (loadingCreators || errorCreators || !allCreators.length) return [];
    return [...new Set(allCreators.flatMap(creator => Array.isArray(creator.niche) ? creator.niche : []).filter(Boolean))];
  }, [allCreators, loadingCreators, errorCreators]);

  // Filter and sort creators
  const filteredCreators = useMemo(() => {
    if (loadingCreators || errorCreators) return []; // Return empty if loading or error
    let filtered = allCreators.filter(creator => {
      const searchTermLower = searchTerm.toLowerCase();
      const nameMatch = creator.name.toLowerCase().includes(searchTermLower);
      const usernameMatch = creator.username?.toLowerCase().includes(searchTermLower) || false;
      const locationMatch = creator.location?.toLowerCase().includes(searchTermLower) || false;
      const nicheMatch = Array.isArray(creator.niche) && creator.niche.some(n => n.toLowerCase().includes(searchTermLower));

      const matchesSearch = searchTerm === '' || nameMatch || usernameMatch || locationMatch || nicheMatch;

      const matchesPlatform = platformFilter === 'all' || creator.platform === platformFilter;
      const matchesNiche = nicheFilter === 'all' || (Array.isArray(creator.niche) && creator.niche.includes(nicheFilter));

      return matchesSearch && matchesPlatform && matchesNiche;
    });

    // Sort results
    filtered.sort((a, b) => {
      let aValue: string | number | undefined;
      let bValue: string | number | undefined;
      
      switch (sortBy) {
        case 'followers': // Assumes metrics.followers exists
          aValue = a.metrics?.followers;
          bValue = b.metrics?.followers;
          break;
        case 'engagement': // Check for engagement_rate (snake_case) or engagementRate (camelCase)
          aValue = (a.metrics as any)?.engagement_rate ?? a.metrics?.engagementRate;
          bValue = (b.metrics as any)?.engagement_rate ?? b.metrics?.engagementRate;
          break;
        case 'rating': // Directly from schema: rating numeric(3,1)
          aValue = a.rating;
          bValue = b.rating;
          break;
        case 'name': // Directly from schema: name text
          aValue = a.name;
          bValue = b.name;
          break;
        default:
          return 0;
      }

      // Handle cases where values might be undefined for sorting
      if (aValue === undefined && bValue === undefined) return 0;
      if (aValue === undefined) return sortOrder === 'asc' ? 1 : -1; // Undefined items go to the end (asc) or start (desc)
      if (bValue === undefined) return sortOrder === 'asc' ? -1 : 1; // Undefined items go to the end (asc) or start (desc)

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      // Ensure numeric comparison if types are numbers after handling undefined
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }
      return 0; // Fallback for mixed types or other scenarios, though ideally types are consistent for a sort key
    });

    return filtered;
  }, [searchTerm, platformFilter, nicheFilter, sortBy, sortOrder, allCreators, loadingCreators, errorCreators]);

  const getVerificationIcon = (verified: boolean | null | undefined) => {
    if (!verified) return null;
    return (
      <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    );
  };

  const getPlatformIcon = (platform: string) => {
    const iconClass = "w-4 h-4";
    switch (platform) {
      case 'instagram':
        return <div className={`${iconClass} bg-gradient-to-br from-purple-600 to-pink-500 rounded`}></div>;
      case 'youtube':
        return <div className={`${iconClass} bg-red-600 rounded`}></div>;
      case 'tiktok':
        return <div className={`${iconClass} bg-black rounded`}></div>;
      case 'twitter':
        return <div className={`${iconClass} bg-blue-400 rounded`}></div>;
      case 'linkedin':
        return <div className={`${iconClass} bg-blue-700 rounded`}></div>;
      default:
        return <div className={`${iconClass} bg-gray-400 rounded`}></div>;
    }
  };

  const formatFollowers = (followers: number) => {
    if (followers >= 1000000) {
      return `${(followers / 1000000).toFixed(1)}M`;
    } else if (followers >= 1000) {
      return `${(followers / 1000).toFixed(0)}k`;
    }
    return followers.toString();
  };

  const fetchAssignableCampaigns = async () => {
    if (!session) {
      toast.error('You must be logged in to fetch campaigns.');
      return;
    }
    setIsFetchingCampaigns(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/api/campaigns`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch campaigns' }));
        throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAssignableCampaigns(data.campaigns || []); // Assuming backend returns { campaigns: [...] }
      if (!data.campaigns || data.campaigns.length === 0) {
        toast.info('No campaigns found to assign to.');
      }
    } catch (error: any) {
      console.error('Error fetching assignable campaigns:', error);
      toast.error(`Error fetching campaigns: ${error.message}`);
      setAssignableCampaigns([]);
    } finally {
      setIsFetchingCampaigns(false);
    }
  };

  const handleOpenAssignModal = (creator: Creator) => {
    setSelectedCreatorForAssignment(creator);
    setSelectedCampaignIdForAssignment(''); // Reset selected campaign
    setShowAssignModal(true);
    fetchAssignableCampaigns(); // Fetch campaigns when modal is opened
  };

  const handleCloseAssignModal = () => {
    setShowAssignModal(false);
    setSelectedCreatorForAssignment(null);
    setAssignableCampaigns([]);
    setSelectedCampaignIdForAssignment('');
  };

  const handleAssignCreator = async () => {
    if (!session || !selectedCreatorForAssignment || !selectedCampaignIdForAssignment) {
      toast.error('Missing information to assign creator.');
      return;
    }
    setIsAssigningCreator(true);
    try {
      const payload = {
        campaign_id: selectedCampaignIdForAssignment,
        creator_id: selectedCreatorForAssignment.id,
        creator_name: selectedCreatorForAssignment.name,
        creator_avatar: selectedCreatorForAssignment.avatar,
        creator_platform: selectedCreatorForAssignment.platform,
      };

      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/api/outreaches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to assign creator to campaign.');
      }

      toast.success(`${selectedCreatorForAssignment.name} assigned to campaign successfully!`);
      handleCloseAssignModal();
      // Optionally, refetch outreaches or update UI to reflect the assignment
    } catch (error: any) {
      console.error('Error assigning creator:', error);
      toast.error(`Error assigning creator: ${error.message}`);
    } finally {
      setIsAssigningCreator(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Discover Creators</h1>
        <p className="text-gray-600">Find the perfect creators for your campaigns using traditional search or AI-powered natural language recommendations</p>
      </div>

      {/* Unified Creator Discovery Interface */}
      <div className="bg-white rounded-lg shadow">
        {/* Search Mode Toggle */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Creator Search</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Search Mode:</span>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setSearchMode('filter')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    searchMode === 'filter'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Traditional Search
                  </div>
                </button>
                <button
                  onClick={() => setSearchMode('ai')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    searchMode === 'ai'
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    AI Search
                    <span className="ml-1 px-2 py-0.5 bg-white bg-opacity-20 text-xs rounded-full">
                      Groq
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>
          
          {searchMode === 'filter' && (
            <p className="text-sm text-gray-600">
              Use filters and search terms to find creators based on specific criteria
            </p>
          )}
          
          {searchMode === 'ai' && (
            <p className="text-sm text-gray-600">
              Ask in natural language to get AI-powered creator recommendations with intelligent insights
            </p>
          )}
        </div>

        <div className="p-6">
          {searchMode === 'filter' ? (
            /* Traditional Search & Filter Interface */
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                    Search creators
                  </label>
                  <input
                    type="text"
                    id="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, username, location, or niche..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label htmlFor="platform" className="block text-sm font-medium text-gray-700 mb-1">
                    Platform
                  </label>
                  <select
                    id="platform"
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Platforms</option>
                    {platforms.map(platform => (
                      <option key={platform} value={platform}>
                        {platform.charAt(0).toUpperCase() + platform.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="niche" className="block text-sm font-medium text-gray-700 mb-1">
                    Niche
                  </label>
                  <select
                    id="niche"
                    value={nicheFilter}
                    onChange={(e) => setNicheFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Categories</option>
                    {niches.map(niche => (
                      <option key={niche} value={niche}>
                        {niche.charAt(0).toUpperCase() + niche.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sort Options */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="followers">Followers</option>
                    <option value="engagement">Engagement Rate</option>
                    <option value="rating">Rating</option>
                    <option value="name">Name</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
                  </button>
                </div>
                <div className="text-sm text-gray-600">
                  {filteredCreators.length} creators found
                </div>
              </div>

              {/* Creators Grid */}
              {loadingCreators ? (
                <div className="text-center py-12 col-span-full">
                  <p className="text-gray-500">Loading creators...</p>
                </div>
              ) : errorCreators ? (
                <div className="text-center py-12 col-span-full text-red-600">
                  <p>Error: {errorCreators}</p>
                </div>
              ) : filteredCreators.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredCreators.map((creator) => (
                    <div
                      key={creator.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col justify-between hover:shadow-lg transition-shadow relative"
                    >
                      <button
                        onClick={() => handleOpenAssignModal(creator)}
                        className="absolute top-2 right-2 bg-blue-200 hover:bg-green-600 text-white font-bold w-6 h-6 rounded-full flex items-center justify-center text-sm transition-colors z-10"
                        aria-label="Assign to campaign"
                        disabled={isAssigningCreator || isFetchingCampaigns}
                      >
                        +
                      </button>
                      
                      <div>
                        <Link to={`/creators/${creator.id}`}>
                          <div className="flex items-start gap-3">
                            <img
                              src={creator.avatar}
                              alt={creator.name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900 truncate">{creator.name}</h3>
                                {getVerificationIcon(creator.verified)}
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{creator.username}</p>
                              <div className="flex items-center gap-2 mb-2">
                                {getPlatformIcon(creator.platform)}
                                <span className="text-xs text-gray-500 capitalize">{creator.platform}</span>
                              </div>
                            </div>
                          </div>
                        </Link>

                        <div className="mt-3 space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {creator.niche.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                            {creator.niche.length > 2 && (
                              <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                +{creator.niche.length - 2}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                            <div>
                              <span className="font-medium text-gray-900">{formatFollowers(creator.metrics?.followers || 0)}</span>
                              <br />Followers
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">
                                {(((creator.metrics as any)?.engagement_rate ?? creator.metrics?.engagementRate) || 0).toFixed(1)}%
                              </span>
                              <br />Engagement
                            </div>
                            <div>
                              <span className="font-medium text-gray-900">{creator.rating ?? 'N/A'}/5</span>
                              <br />Rating
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100">
                            <div className="flex justify-between items-center">
                              <div className="text-center">
                                <p className="font-semibold text-gray-900">₹{((creator.rates as any)?.post ?? (creator.rates as any)?.per_post) || 'N/A'}/post</p>
                                <p className="text-xs text-gray-500">Starting rate</p>
                              </div>
                              <span className="text-xs text-gray-500">
                                {creator.location ?? 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 col-span-full">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {searchTerm || platformFilter !== 'all' || nicheFilter !== 'all' 
                      ? "No creators match your current filters"
                      : "No creators found in the database"}
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {searchTerm || platformFilter !== 'all' || nicheFilter !== 'all' 
                      ? "Try adjusting your filters or search terms"
                      : "Check back later or add new creators."}
                  </p>
                  {(searchTerm || platformFilter !== 'all' || nicheFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setSearchTerm('');
                        setPlatformFilter('all');
                        setNicheFilter('all');
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* AI-Powered Search Interface */
            <div className="h-[700px]">
              <AICreatorSearchLLM />
            </div>
          )}
        </div>
      </div>

      {/* Assignment Modal */}
      {showAssignModal && selectedCreatorForAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Assign <span className="text-blue-600">{selectedCreatorForAssignment.name}</span> to Campaign
            </h2>
            
            <div>
              <label htmlFor="campaignSelect" className="block text-sm font-medium text-gray-700 mb-1">
                Select Campaign
              </label>
              <select
                id="campaignSelect"
                value={selectedCampaignIdForAssignment}
                onChange={(e) => setSelectedCampaignIdForAssignment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={isFetchingCampaigns || assignableCampaigns.length === 0}
              >
                <option value="" disabled>{isFetchingCampaigns ? 'Loading campaigns...' : 'Select a campaign'}</option>
                {assignableCampaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.title} (ID: {campaign.id.substring(0,8)})
                  </option>
                ))}
              </select>
              {isFetchingCampaigns && <p className='text-xs text-gray-500 mt-1'>Fetching campaigns...</p>}
              {!isFetchingCampaigns && assignableCampaigns.length === 0 && <p className='text-xs text-red-500 mt-1'>No campaigns available to assign.</p>}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseAssignModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                disabled={isAssigningCreator}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignCreator}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                disabled={!selectedCampaignIdForAssignment || isAssigningCreator || isFetchingCampaigns}
              >
                {isAssigningCreator ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 