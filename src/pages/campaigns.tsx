import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
// import { mockCampaigns } from '../mock-data/campaigns'; // Will be replaced by fetched data
import { useAuth } from '../contexts/AuthContext'; // Import useAuth
import { toast } from 'react-toastify'; // Import toast

// Define a placeholder Campaign type - replace with your actual type
interface Campaign {
  id: string;
  title: string;
  brand: string;
  status: 'active' | 'draft' | 'in_review' | 'completed' | 'cancelled'; // Make status more specific if possible
  description: string;
  budget: {
    min: number | null; // Allow null
    max: number | null; // Allow null
  };
  timeline: {
    applicationDeadline: string | Date | null; // Allow null
    startDate?: string | Date | null; 
    endDate?: string | Date | null;
  };
  applicants: number;
  selected: number;
  requirements: {
    platforms: string[];
    minFollowers: number | null; // Allow null
  };
  platforms?: string[];
  niches?: string[];
  deliverables?: string[];
  locations?: string[];
  ai_insights?: any; // Use a more specific type if known
  user_id?: string;
  created_at?: string | Date;
  updatedAt?: string | Date;
  creation_method?: string; // Added creation_method

  // ADDED Original Requirements fields (optional, as list view might not fetch them)
  companyName?: string;
  productService?: string;
  campaignObjective?: string;
  targetCreators?: string;
  keyMessage?: string;
}

// Modified to accept token as an argument
const fetchCampaignsFromAPI = async (token: string | null): Promise<Campaign[]> => {
  if (!token) {
    console.error("Authentication token not found. Cannot fetch campaigns.");
    throw new Error("User not authenticated. Please log in.");
  }

  const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL;
  if (!backendBaseUrl) {
    console.error("VITE_BACKEND_API_URL is not set in environment variables.");
    throw new Error("Backend API URL is not configured. Please contact support.");
  }
  const apiUrl = `${backendBaseUrl}/api/campaigns`;
  console.log("Attempting to fetch campaigns from:", apiUrl); // DEBUG: Log the full URL

  const response = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    let errorMessage = `Failed to fetch campaigns: ${response.statusText} (Status: ${response.status})`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      const textError = await response.text();
      if (textError) errorMessage += ` - ${textError}`;
    }
    console.error("API Error:", errorMessage);
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (data && data.success && Array.isArray(data.campaigns)) {
    return data.campaigns as Campaign[];
  } else {
    const errorMsg = data.error || "Received invalid campaign data format from API.";
    console.error("Data Format Error:", errorMsg, data);
    throw new Error(errorMsg);
  }
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingCampaignId, setCancellingCampaignId] = useState<string | null>(null); // For disabling cancel button
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all"); // State for status filter
  const auth = useAuth(); // Use the AuthContext

  useEffect(() => {
    const loadCampaigns = async () => {
      if (!auth.session?.access_token && !auth.loading) { // Check if auth loading is complete
        setError("User not authenticated. Please log in.");
        setIsLoading(false);
        return;
      }
      if (auth.loading) { // If auth is still loading, wait.
        setIsLoading(true); // Keep loading true
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        // Pass the token from auth context
        const fetchedCampaigns = await fetchCampaignsFromAPI(auth.session?.access_token || null);
        console.log("Fetched campaigns from API:", fetchedCampaigns);
        setCampaigns(fetchedCampaigns);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error("Failed to load campaigns:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Only load campaigns if auth is not loading initially or after auth state changes
    if (!auth.loading) {
        loadCampaigns();
    }
    // Re-run if auth.session changes (e.g., user logs in/out) or auth.loading status changes
  }, [auth.session, auth.loading]); 

  const handleStatusFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedStatusFilter(event.target.value);
  };

  const handleCancelAICampaignOnCard = async (campaignId: string) => {
    if (!auth.session?.access_token) {
      toast.error("Authentication token not found. Please log in.");
      return;
    }
    if (!window.confirm("Are you sure you want to cancel this AI-generated campaign? This action cannot be undone.")) {
      return;
    }

    setCancellingCampaignId(campaignId);

    try {
      const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendBaseUrl) {
        toast.error("Backend API URL is not configured.");
        setCancellingCampaignId(null);
        return;
      }
      const apiUrl = `${backendBaseUrl}/api/campaigns/${campaignId}`;
      console.log("Attempting to cancel campaign (PUT request) to:", apiUrl); // DEBUG

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.session.access_token}`,
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "An unknown error occurred" }));
        throw new Error(errorData.message || `Failed to cancel campaign (status ${response.status})`);
      }

      // const updatedCampaign = await response.json(); // Backend returns the updated campaign

      setCampaigns(prevCampaigns =>
        prevCampaigns.map(c =>
          c.id === campaignId ? { ...c, status: 'cancelled' } : c
        )
      );
      toast.success("AI Campaign cancelled successfully!");

    } catch (err) {
      console.error("Error cancelling AI campaign:", err);
      toast.error(err instanceof Error ? err.message : "An unknown error occurred while cancelling.");
    } finally {
      setCancellingCampaignId(null);
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    if (selectedStatusFilter === "all" || selectedStatusFilter === "") {
      return true; // Show all if "all" or empty is selected
    }
    return campaign.status === selectedStatusFilter;
  });

  const getStatusBadge = (status?: string | null) => {
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

  const getCreationMethodBadge = (creationMethod?: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full ml-2"; // Added ml-2 for spacing
    if (creationMethod === 'ai') {
      return `${baseClasses} bg-purple-100 text-purple-800`;
    } else if (creationMethod === 'human') {
      return `${baseClasses} bg-teal-100 text-teal-800`;
    }
    return undefined; // Return undefined instead of null for className compatibility
  };

  const formatDate = (dateInput: string | Date) => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const getDaysUntilDeadline = (deadlineInput: string | Date | null): number | null => { // Allow null input, return number or null
    if (!deadlineInput) { // Handle null or empty string
      return null;
    }
    const deadline = typeof deadlineInput === 'string' ? new Date(deadlineInput) : deadlineInput;
    if (isNaN(deadline.getTime())) { // Check if date is invalid after attempting to create it
      return null;
    }
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Updated retry logic to use auth.session.access_token
  const handleRetry = () => {
    if (!auth.session?.access_token && !auth.loading) {
      setError("User not authenticated. Please log in to retry.");
      setIsLoading(false);
      return;
    }
    if (auth.loading) return; // Don't retry if auth is still resolving

    setIsLoading(true);
    setError(null);
    fetchCampaignsFromAPI(auth.session?.access_token || null)
      .then(setCampaigns)
      .catch(err => {
        setError(err instanceof Error ? err.message : 'An unknown error occurred during retry');
        console.error("Retry failed:", err);
      })
      .finally(() => setIsLoading(false));
  };

  // Show loading indicator if auth is loading OR campaigns are loading
  if (auth.loading || isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-xl text-gray-700">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
        <button 
            onClick={handleRetry} // Use the new handleRetry
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Try Again
          </button>
      </div>
    );
  }

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

      {/* Filter Bar - Consider making these functional later */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex gap-4">
          <select 
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={selectedStatusFilter}
            onChange={handleStatusFilterChange}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="in_review">In Review</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="text"
            placeholder="Search campaigns..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Campaign Grid */}
      {filteredCampaigns.length === 0 ? (
         <div className="text-center py-12 bg-white rounded-lg shadow">
         <div className="max-w-md mx-auto">
           <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns found</h3>
           <p className="text-gray-500 mb-4">It looks like you haven\'t created any campaigns yet. Get started by creating your first one!</p>
           <Link 
             to="/campaigns/create"
             className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
           >
             Create New Campaign
           </Link>
         </div>
       </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map((campaign) => {
            const daysUntilDeadline = campaign.timeline.applicationDeadline ? getDaysUntilDeadline(campaign.timeline.applicationDeadline) : null;
            const progressPercentage = Math.round(((campaign.selected ?? 0) / Math.max(campaign.applicants ?? 1, 1)) * 100);
            
            const budgetMinDisplay = campaign.budget?.min === null || campaign.budget?.min === undefined ? 'N/A' : `₹${Number(campaign.budget.min).toLocaleString()}`;
            const budgetMaxDisplay = campaign.budget?.max === null || campaign.budget?.max === undefined ? 'N/A' : `₹${Number(campaign.budget.max).toLocaleString()}`;
            const displayBudget = budgetMinDisplay !== 'N/A' || budgetMaxDisplay !== 'N/A';

            const minFollowersDisplay = campaign.requirements?.minFollowers === null || campaign.requirements?.minFollowers === undefined ? 'N/A' : Number(campaign.requirements.minFollowers).toLocaleString();

          return (
              <div key={campaign.id} className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300">
                <div className="p-6 flex-grow">
                <div className="flex justify-between items-start mb-3">
                    <h2 className="text-xl font-semibold text-gray-800 truncate" title={campaign.title}>{campaign.title}</h2>
                    {/* Status and Creation Method Badges */}
                    <div className="flex items-center flex-shrink-0">
                      <span className={getStatusBadge(campaign.status)}>{campaign.status || 'unknown'}</span>
                      {campaign.creation_method && (
                        <span className={getCreationMethodBadge(campaign.creation_method)}>
                          {campaign.creation_method === 'ai' ? 'AI' : 'Human'}
                        </span>
                        )}
                </div>
              </div>
                  <p className="text-sm text-gray-600 mb-1">Brand: {campaign.brand || 'N/A'}</p>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2" title={campaign.description}>{campaign.description || 'No description available.'}</p>

                  <div className="space-y-2 text-sm text-gray-700 mb-4">
                    <div>
                      <span className="font-medium">Budget:</span> 
                      {displayBudget ? (
                        `${budgetMinDisplay} - ${budgetMaxDisplay}`
                      ) : 'Not specified'}
              </div>
                    <div>
                      <span className="font-medium">Apply by:</span> 
                      {campaign.timeline.applicationDeadline ? formatDate(campaign.timeline.applicationDeadline) : 'Not set'}
                      {' '}
                      {campaign.status !== 'completed' && campaign.status !== 'cancelled' && daysUntilDeadline !== null && daysUntilDeadline >= 0 && (
                          <span className="text-xs text-red-600">({daysUntilDeadline} days left)</span>
                      )}
                      {campaign.status !== 'completed' && campaign.status !== 'cancelled' && daysUntilDeadline !== null && daysUntilDeadline < 0 && (
                          <span className="text-xs text-gray-500">(Deadline passed)</span>
                        )}
                    </div>
                    {campaign.timeline.startDate && (
                      <div><span className="font-medium">Starts:</span> {formatDate(campaign.timeline.startDate)}</div>
                    )}
                    </div>
                </div>

                <div className="bg-gray-50 p-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600 space-x-4">
                      {/* <span>Creators: {campaign.applicants || 0}</span> */}
                      {/* Placeholder for selected count if available */}
                      {/* | Selected: {campaign.selected || 0} */}
                      
                      {/* Cancel Button for AI Campaigns */}
                      {campaign.creation_method === 'ai' && 
                       campaign.status !== 'cancelled' && 
                       campaign.status !== 'completed' && (
                    <button 
                          onClick={() => handleCancelAICampaignOnCard(campaign.id)}
                          disabled={cancellingCampaignId === campaign.id}
                          className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                          {cancellingCampaignId === campaign.id ? 'Cancelling...' : 'Cancel Campaign'}
                  </button>
                      )}
                    </div>
                    <Link 
                      to={`/campaigns/${campaign.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      View Details &rarr;
                    </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Empty State for additional campaigns - This might be redundant if the campaigns.length === 0 check above handles it well */}
      {/* Conditionally render this only if there ARE campaigns, but you want to encourage more */}
      {campaigns.length > 0 && filteredCampaigns.length === 0 && selectedStatusFilter !== 'all' && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="max-w-md mx-auto">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0m9.172-9.172a4 4 0 010 5.656m-5.656 5.656a4 4 0 01-5.656 0M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Campaigns Match "{selectedStatusFilter}"</h3>
            <p className="text-gray-500 mb-4">Try selecting a different status or viewing all campaigns.</p>
            <button 
              onClick={() => setSelectedStatusFilter("all")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Show All Campaigns
            </button>
          </div>
        </div>
      )}
      {campaigns.length > 0 && (
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
      )}
    </div>
  );
} 