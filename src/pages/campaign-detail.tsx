import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';
import { type StoredOutreach, type ConversationMessage } from '../services/outreach-storage';
import { type Creator } from '../types';
import AIOutreachManager from '../components/ai-outreach-manager';

// Expanded CampaignDetail interface to match backend response
interface CampaignDetail {
  id: string;
  title: string;
  description: string;
  brand?: string;
  brief?: string;
  status?: string;
  creation_method?: string;
  budget?: {
    min?: number | null;
    max?: number | null;
  };
  timeline?: {
    applicationDeadline?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  requirements?: {
    platforms?: string[];
    minFollowers?: number | null;
    niches?: string[];
    locations?: string[];
    deliverables?: string[];
  };
  aiInsights?: any; 
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  companyName?: string;
  productService?: string;
  campaignObjective?: string;
  campaignAudienceDescription?: string;
  targetInfluencerDescription?: string;
  keyMessage?: string;
}

const CampaignDetailPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const location = useLocation();
  const passedCampaign = location.state?.campaign as CampaignDetail | undefined;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(passedCampaign || null);
  const [loading, setLoading] = useState(!passedCampaign);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const { session, loading: authLoading } = useAuth();

  const [identifiedOutreaches, setIdentifiedOutreaches] = useState<StoredOutreach[]>([]);
  const [loadingOutreaches, setLoadingOutreaches] = useState<boolean>(true);
  const [outreachesError, setOutreachesError] = useState<string | null>(null);

  const [showOutreachManagerModal, setShowOutreachManagerModal] = useState<boolean>(false);
  const [selectedOutreachForPreparation, setSelectedOutreachForPreparation] = useState<StoredOutreach | null>(null);

  const fetchIdentifiedOutreaches = useCallback(async (currentCampaignId: string) => {
    if (!currentCampaignId) return;
    setLoadingOutreaches(true);
    setOutreachesError(null);
    try {
      const { data: rawData, error: sbError } = await supabase
        .from('outreaches')
        .select('*')
        .eq('campaign_id', currentCampaignId)
        .eq('status', 'identified')
        .order('created_at', { ascending: false });

      if (sbError) {
        console.error("Error fetching identified outreaches:", sbError);
        setOutreachesError(sbError.message);
        setIdentifiedOutreaches([]);
      } else if (rawData) {
        const mappedData: StoredOutreach[] = rawData.map((item: any) => ({
          id: item.id,
          userId: item.user_id,
          campaignId: item.campaign_id,
          creatorId: item.creator_id,
          creatorName: item.creator_name,
          creatorAvatar: item.creator_avatar,
          creatorPlatform: item.creator_platform,
          creatorPhoneNumber: item.creator_phone_number,
          subject: item.subject,
          body: item.body,
          status: item.status,
          confidence: item.confidence,
          reasoning: item.reasoning,
          keyPoints: item.key_points || [],
          nextSteps: item.next_steps || [],
          brandName: item.brand_name,
          campaignContext: item.campaign_context,
          createdAt: new Date(item.created_at),
          lastContact: new Date(item.last_contact),
          currentOffer: item.current_offer,
          notes: item.notes,
          conversationHistory: (item.conversation_history || []) as ConversationMessage[], 
        }));
        setIdentifiedOutreaches(mappedData);
      } else {
        setIdentifiedOutreaches([]);
      }
    } catch (err) {
        console.error("Unexpected error fetching identified outreaches:", err);
        setOutreachesError(err instanceof Error ? err.message : "An unknown error occurred.");
        setIdentifiedOutreaches([]);
    } finally {
        setLoadingOutreaches(false);
    }
  }, []);

  useEffect(() => {
    if (!passedCampaign) {
      setLoading(true);
    }

    if (authLoading) {
      if (!passedCampaign) setLoading(true); 
      return;
    }

    if (!session?.access_token) {
      setError("Authentication token not found. Please log in.");
      setLoading(false);
      setLoadingOutreaches(false);
      return;
    }
      
    if (campaignId) {
      const accessToken = session.access_token;
      const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendBaseUrl) {
        setError("Backend API URL is not configured. Please contact support.");
        setLoading(false);
        setLoadingOutreaches(false);
        return;
      }
      const apiUrl = `${backendBaseUrl}/api/campaigns/${campaignId}`;
      console.log("Attempting to fetch campaign details from:", apiUrl);

      fetch(apiUrl, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } })
        .then(response => {
          if (!response.ok) {
            if (response.status === 401) throw new Error('Unauthorized. Please check your login session or token.');
            if (response.status === 404) throw new Error('Campaign not found. It might have been deleted or the ID is incorrect.');
            return response.json().then(errData => { throw new Error(errData.error || `Network error: ${response.statusText}`); });
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.campaign) setCampaign(data.campaign);
          else if (!passedCampaign || (passedCampaign && passedCampaign.id !== data.campaign?.id)) {
            setError(data.error || "Failed to fetch campaign details.");
          }
        })
        .catch(err => { 
            console.error("Error fetching campaign details:", err);
            if (!passedCampaign) setError(err.message);
        })
        .finally(() => setLoading(false));

      fetchIdentifiedOutreaches(campaignId);

    } else {
      setError("Campaign ID not found in URL.");
      setLoading(false);
      setLoadingOutreaches(false);
    }
  }, [campaignId, session, authLoading, passedCampaign, fetchIdentifiedOutreaches]);

  if ((loading && !campaign) || (authLoading && !campaign) ) {
    return <div className="p-4 text-center text-gray-700">Loading campaign details...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-600">Error: {error}</div>;
  }

  if (!campaign) {
    return <div className="p-4 text-center text-gray-700">Campaign not found.</div>;
  }

  const handleCancelAICampaign = async () => {
    if (!campaign || !campaignId || !session?.access_token) {
      toast.error("Cannot cancel campaign: Missing critical data or authentication.");
      return;
    }

    const confirmCancel = window.confirm("Are you sure you want to cancel this AI-generated campaign? This action cannot be undone and will set its status to 'cancelled'.");
    if (!confirmCancel) {
      return;
    }

    setIsCancelling(true);
    setError(null);

    try {
      const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendBaseUrl) {
        toast.error("Backend API URL is not configured.");
        setIsCancelling(false);
        return;
      }
      const apiUrl = `${backendBaseUrl}/api/campaigns/${campaignId}`;
      console.log("Attempting to cancel campaign from detail page (PUT request) to:", apiUrl); // DEBUG

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || `Failed to cancel campaign. Status: ${response.status}`);
      }

      if (responseData.success && responseData.campaign) {
        setCampaign(responseData.campaign);
        toast.success("AI Campaign cancelled successfully!");
      } else {
        setCampaign(prev => prev ? { ...prev, status: 'cancelled' } : null);
        toast.success("AI Campaign status updated to cancelled!");
      }
    } catch (err) {
      console.error("Error cancelling AI campaign:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred while cancelling.");
      toast.error(err instanceof Error ? err.message : "Failed to cancel campaign. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
          return dateString; 
      }
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return dateString; 
    }
  };

  const handlePrepareOutreach = (outreach: StoredOutreach) => {
    console.log("Campaign state when preparing outreach:", campaign);
    if (!campaign) {
        toast.error("Campaign details are not loaded yet. Please wait and try again.");
        return;
    }
    console.log("Prepare outreach for (StoredOutreach):", outreach);
    setSelectedOutreachForPreparation(outreach);
    setShowOutreachManagerModal(true);
  };

  const handleCloseOutreachManager = () => {
    setShowOutreachManagerModal(false);
    setSelectedOutreachForPreparation(null); // Clear selected outreach
    if (campaign && campaign.id) {
        fetchIdentifiedOutreaches(campaign.id); // Re-fetch to update the list
    }
  };

  const mapStoredOutreachToCreator = (outreach: StoredOutreach): Creator => {
    return {
      id: outreach.creatorId,
      name: outreach.creatorName,
      username: outreach.creatorName,
      platform: outreach.creatorPlatform as Creator['platform'] || 'instagram',
      avatar: outreach.creatorAvatar || '',
      niche: [],
      location: '',
      bio: '',
      verified: false,
      phone_number: outreach.creatorPhoneNumber || undefined,
      email: undefined,
      metrics: { followers: 0, avgViews: 0, engagementRate: 0, avgLikes: 0, avgComments: 0 },
      rates: { post: 0 },
      demographics: { ageRange: '', topCountries: [], genderSplit: { male: 0, female: 0, other: 0 } },
      rating: 0,
      responseTime: '',
    };
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-xl rounded-lg p-6 space-y-6">
        
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-3xl font-bold text-gray-800 mr-4 break-words">{campaign.title}</h1>
          <div className="flex-shrink-0 space-x-2 flex items-center">
            {campaign.creation_method !== 'ai' && (
              <Link 
                to={`/campaigns/${campaignId}/edit`}
                className="text-sm bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-3 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-white"
              >
                Edit Campaign
              </Link>
            )}
            {campaign.creation_method === 'ai' && campaign.status !== 'cancelled' && campaign.status !== 'completed' && (
              <button
                onClick={handleCancelAICampaign}
                disabled={isCancelling}
                className="text-sm bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-3 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white disabled:bg-red-300 disabled:cursor-not-allowed"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel AI Campaign'}
              </button>
            )}
          <Link 
            to="/campaigns" 
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white"
          >
            &larr; Back to Campaigns
          </Link>
          </div>
        </div>

        {campaign.brand && <p className="text-lg text-blue-600">Brand: <span className="font-semibold text-gray-700">{campaign.brand}</span></p>}
        {campaign.status && (
          <p className="text-md text-gray-600">Status: 
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
              campaign.status === 'draft' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 
              campaign.status === 'active' ? 'bg-green-100 text-green-800 border border-green-300' : 
              campaign.status === 'completed' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
              campaign.status === 'cancelled' ? 'bg-red-100 text-red-800 border border-red-300' :
              'bg-gray-100 text-gray-800 border border-gray-300'
            }`}>
              {campaign.status.toUpperCase()}
            </span>
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Description and Brief Section */}
          <div className="bg-gray-50 shadow-sm rounded-lg p-4 space-y-3 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-700 border-b border-gray-300 pb-2">Campaign Overview</h2>
            <div>
              <h3 className="text-md font-semibold text-gray-600">Description:</h3>
              <p className="text-gray-700 text-sm">{campaign.description || 'N/A'}</p>
            </div>
            {campaign.brief && (
              <div>
                <h3 className="text-md font-semibold text-gray-600">Brief:</h3>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">{campaign.brief}</p>
              </div>
            )}
          </div>

          {/* Budget and Timeline Section */}
          <div className="bg-gray-50 shadow-sm rounded-lg p-4 space-y-3 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-700 border-b border-gray-300 pb-2">Budget & Timeline</h2>
            {campaign.budget && (
              <div>
                <h3 className="text-md font-semibold text-gray-600">Budget:</h3>
                <p className="text-gray-700 text-sm">
                  Min: {campaign.budget.min?.toLocaleString() ?? 'N/A'} - Max: {campaign.budget.max?.toLocaleString() ?? 'N/A'}
                </p>
              </div>
            )}
            {campaign.timeline && (
              <div>
                <h3 className="text-md font-semibold text-gray-600">Timeline:</h3>
                <ul className="list-disc list-inside text-gray-700 text-sm space-y-1">
                  <li>Application Deadline: {formatDate(campaign.timeline.applicationDeadline)}</li>
                  <li>Start Date: {formatDate(campaign.timeline.startDate)}</li>
                  <li>End Date: {formatDate(campaign.timeline.endDate)}</li>
                </ul>
              </div>
            )}
            {campaign.createdAt && (
                 <div>
                    <h3 className="text-md font-semibold text-gray-600">Created On:</h3>
                    <p className="text-gray-700 text-sm">{formatDate(campaign.createdAt)}</p>
                </div>
            )}
            {campaign.updatedAt && (
                 <div className="mt-3">
                    <h3 className="text-md font-semibold text-gray-600">Last Updated:</h3>
                    <p className="text-gray-700 text-sm">{formatDate(campaign.updatedAt)}</p>
                </div>
            )}
          </div>
        </div>
        
        {/* Requirements Section */}
        {campaign.requirements && (
          <div className="bg-gray-50 shadow-sm rounded-lg p-4 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-700 mb-3 border-b border-gray-300 pb-2">Influencer Requirements</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 text-sm">
              <div>
                <h3 className="font-semibold text-gray-600 mb-0.5">Platforms:</h3>
                <p className="text-gray-700">{campaign.requirements.platforms?.join(', ') || 'N/A'}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-600 mb-0.5">Min. Followers:</h3>
                <p className="text-gray-700">{campaign.requirements.minFollowers?.toLocaleString() ?? 'N/A'}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-600 mb-0.5">Niches:</h3>
                <p className="text-gray-700">{campaign.requirements.niches?.join(', ') || 'N/A'}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-600 mb-0.5">Locations:</h3>
                <p className="text-gray-700">{campaign.requirements.locations?.join(', ') || 'N/A'}</p>
              </div>
              <div className="lg:col-span-2">
                <h3 className="font-semibold text-gray-600 mb-0.5">Deliverables:</h3>
                <p className="text-gray-700">{campaign.requirements.deliverables?.join(', ') || 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Original Brief Input Section - NEW */}
        {(campaign.companyName || campaign.productService || campaign.campaignObjective || campaign.campaignAudienceDescription || campaign.targetInfluencerDescription || campaign.keyMessage) && (
            <div className="bg-gray-50 shadow-sm rounded-lg p-4 border border-gray-200 mt-6">
                <h2 className="text-xl font-semibold text-gray-700 mb-3 border-b border-gray-300 pb-2">Original Brief Input</h2>
                <div className="space-y-3 text-sm">
                    {campaign.companyName && (
                        <div>
                            <h3 className="font-semibold text-gray-600 mb-0.5">Company Name:</h3>
                            <p className="text-gray-700">{campaign.companyName}</p>
                        </div>
                    )}
                    {campaign.productService && (
                        <div>
                            <h3 className="font-semibold text-gray-600 mb-0.5">Product/Service:</h3>
                            <p className="text-gray-700">{campaign.productService}</p>
                        </div>
                    )}
                    {campaign.campaignObjective && (
                        <div>
                            <h3 className="font-semibold text-gray-600 mb-0.5">Campaign Objective:</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">{campaign.campaignObjective}</p>
                        </div>
                    )}
                    {campaign.campaignAudienceDescription && (
                        <div>
                            <h3 className="font-semibold text-gray-600 mb-0.5">Campaign's Target Audience (Viewers):</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">{campaign.campaignAudienceDescription}</p>
                        </div>
                    )}
                    {campaign.targetInfluencerDescription && (
                        <div>
                            <h3 className="font-semibold text-gray-600 mb-0.5">Target Influencer Profile (Creators):</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">{campaign.targetInfluencerDescription}</p>
                        </div>
                    )}
                    {campaign.keyMessage && (
                        <div>
                            <h3 className="font-semibold text-gray-600 mb-0.5">Key Message:</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">{campaign.keyMessage}</p>
                        </div>
                    )}
                </div>
            </div>
        )}

        {/* AI Insights Section (MODIFIED FOR STRUCTURED DISPLAY) */}
        {campaign.aiInsights && typeof campaign.aiInsights === 'object' && Object.keys(campaign.aiInsights).length > 0 && (
          <div className="bg-gray-50 shadow-sm rounded-lg p-4 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-700 mb-3 border-b border-gray-300 pb-2">AI Insights</h2>
            <div className="space-y-4 text-sm">
              {campaign.aiInsights.strategy && (
                <div>
                  <h3 className="font-semibold text-gray-600 mb-0.5">Strategy:</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{campaign.aiInsights.strategy}</p>
                </div>
              )}
              {campaign.aiInsights.reasoning && (
                <div className="mt-3">
                  <h3 className="font-semibold text-gray-600 mb-0.5">Reasoning:</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{campaign.aiInsights.reasoning}</p>
                </div>
              )}
              {Array.isArray(campaign.aiInsights.successFactors) && campaign.aiInsights.successFactors.length > 0 && (
                <div className="mt-3">
                  <h3 className="font-semibold text-gray-600 mb-1">Success Factors:</h3>
                  <ul className="list-disc list-inside pl-1 space-y-0.5">
                    {campaign.aiInsights.successFactors.map((factor: string, index: number) => (
                      <li key={`sf-${index}`} className="text-gray-700">{factor}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(campaign.aiInsights.potentialChallenges) && campaign.aiInsights.potentialChallenges.length > 0 && (
                <div className="mt-3">
                  <h3 className="font-semibold text-gray-600 mb-1">Potential Challenges:</h3>
                  <ul className="list-disc list-inside pl-1 space-y-0.5">
                    {campaign.aiInsights.potentialChallenges.map((challenge: string, index: number) => (
                      <li key={`pc-${index}`} className="text-gray-700">{challenge}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(campaign.aiInsights.optimizationSuggestions) && campaign.aiInsights.optimizationSuggestions.length > 0 && (
                <div className="mt-3">
                  <h3 className="font-semibold text-gray-600 mb-1">Optimization Suggestions:</h3>
                  <ul className="list-disc list-inside pl-1 space-y-0.5">
                    {campaign.aiInsights.optimizationSuggestions.map((suggestion: string, index: number) => (
                      <li key={`os-${index}`} className="text-gray-700">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Fallback for any other unexpected keys, displayed simply */}
              {Object.entries(campaign.aiInsights)
                .filter(([key]) => !['strategy', 'reasoning', 'successFactors', 'potentialChallenges', 'optimizationSuggestions'].includes(key))
                .map(([key, value]) => {
                  if (value && (typeof value === 'string' || (Array.isArray(value) && value.length > 0))) {
                    return (
                      <div key={key} className="mt-3">
                        <h3 className="font-semibold text-gray-600 mb-0.5">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</h3>
                        {typeof value === 'string' && <p className="text-gray-700 whitespace-pre-wrap">{value}</p>}
                        {Array.isArray(value) && (
                          <ul className="list-disc list-inside pl-1 space-y-0.5">
                            {value.map((item: any, index: number) => (
                              <li key={`${key}-${index}`} className="text-gray-700">{String(item)}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  }
                  return null;
              })}
            </div>
          </div>
        )}

        {/* Identified Creators for Outreach Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Identified Creators for Outreach</h3>
          {loadingOutreaches && <p className="text-gray-600">Loading identified creators...</p>}
          {outreachesError && <p className="text-red-600">Error loading outreaches: {outreachesError}</p>}
          {!loadingOutreaches && identifiedOutreaches.length > 0 && (
            <div className="space-y-4">
              {identifiedOutreaches.map((outreach) => (
                <div key={outreach.id} className="bg-gray-50 p-4 rounded-lg shadow-sm flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900">{outreach.creatorName || 'N/A'}</h4>
                    <p className="text-sm text-gray-600">Platform: {outreach.creatorPlatform || 'N/A'}</p>
                    <p className="text-sm text-gray-500">Status: <span className="font-semibold capitalize">{outreach.status}</span></p>
                  </div>
                  <button
                    onClick={() => handlePrepareOutreach(outreach)}
                    className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
                    disabled={isCancelling}
                  >
                    {isCancelling && selectedOutreachForPreparation?.id === outreach.id ? 'Loading...' : 'Prepare Outreach'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!loadingOutreaches && identifiedOutreaches.length === 0 && (
            <div className="text-center py-6">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No Identified Creators</h3>
              <p className="mt-1 text-sm text-gray-500">
                No creators have been assigned for outreach to this campaign with 'identified' status yet.
              </p>
              <div className="mt-6">
                <Link
                  to="/creators"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                  Find & Assign Creators
                </Link>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Modal for AIOutreachManager */}
      {showOutreachManagerModal && selectedOutreachForPreparation && campaign && (
        <div 
          style={{ 
            position: 'fixed', 
            top: '0', 
            left: '0', 
            width: '100%', 
            height: '100%', 
            backgroundColor: 'rgba(0,0,0,0.75)',
            zIndex: 1050, 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem' 
          }}
          onClick={handleCloseOutreachManager} 
        >
          <div 
            className="bg-white p-0 rounded-lg shadow-xl max-w-4xl w-full" // p-0 because AIOutreachManager has its own padding
            style={{ maxHeight: '90vh', overflow: 'hidden' }} // overflow hidden because AIOutreachManager handles its own scrolling
            onClick={(e) => e.stopPropagation()} 
          >
            <AIOutreachManager
                searchResults={[mapStoredOutreachToCreator(selectedOutreachForPreparation)]}
                campaignId={campaign.id}
                onClose={handleCloseOutreachManager}
                existingOutreachIdToUpdate={selectedOutreachForPreparation.id}
                initialBrandName={campaign.brand} // Pass campaign brand
                initialCampaignBrief={campaign.brief} // Pass campaign brief
                // initialBrandIndustry can be omitted to use default from AIOutreachManager
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignDetailPage;

const styleId = 'custom-scrollbar-style';
if (typeof window !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style');
  style.id = styleId;
  style.innerHTML = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #e5e7eb; /* gray-200 */
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #3b82f6; /* blue-500 */
      border-radius: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #2563eb; /* blue-600 */
    }
  `;
  document.head.appendChild(style);
} 