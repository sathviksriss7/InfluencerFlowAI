import { supabase } from '../lib/supabase'; 
import { outreachStorageService, type StoredOutreach, type ConversationMessage, type NewOutreachData } from './outreach-storage'; // MODIFIED: Import outreachStorageService and NewOutreachData
import { type Creator, type Campaign as CoreCampaign } from '../types'; // Renamed Campaign to CoreCampaign to avoid conflict
import { mockCreators } from '../mock-data/creators';

// +++ START OF NEW POLLING LOGIC (MODULE SCOPE) +++

interface CallArtifactsForService {
  full_recording_url?: string;
  full_recording_duration?: string;
  creator_transcript?: string;
  outreach_id?: string; // This is the outreach_id returned by the backend as part of call details
  conversation_history?: any[];
}

export interface PollingState {
  isPolling: boolean;
  isFetchingDetails: boolean;
  activePollingCallSid: string | null;      // The SID of the call currently being polled by the service
  lastInitiatedCallSid: string | null;    // The SID of the most recent call successfully initiated by the service
  currentPollOriginalOutreachId: string | null; // The original outreach_id associated when polling for activePollingCallSid started
  statusMessage: string | null;
  errorMessage: string | null;
  fetchedArtifactsForLastCall: CallArtifactsForService | null; // Artifacts for lastInitiatedCallSid
  pollingAttempts: number;
  outreachDataUpdated: boolean; // Flag to indicate outreach data in storage was modified
}

type PollingStateListener = (newState: PollingState) => void;

const MAX_POLLING_ATTEMPTS_SERVICE = 24;
const POLLING_INTERVAL_MS = 5000;

let servicePollingIntervalId: NodeJS.Timeout | null = null;
const servicePollingListeners: PollingStateListener[] = [];

let serviceCurrentPollingState: PollingState = {
  isPolling: false,
  isFetchingDetails: false,
  activePollingCallSid: null,
  lastInitiatedCallSid: null,
  currentPollOriginalOutreachId: null,
  statusMessage: null,
  errorMessage: null,
  fetchedArtifactsForLastCall: null,
  pollingAttempts: 0,
  outreachDataUpdated: false,
};

// THIS FUNCTION IS PROBLEMATIC as outreachStorageService.getAllOutreaches is now async
// It needs to be refactored to be async and awaited by its callers.
// For now, it will likely cause issues in the polling and negotiation agent logic that depends on it synchronously.
// MODIFIED: Make async and await the call to outreachStorageService.getAllOutreaches()
const _serviceGetAllOutreachesFromStorage = async (): Promise<StoredOutreach[]> => {
  try {
    if (outreachStorageService && typeof outreachStorageService.getAllOutreaches === 'function') { 
      return await outreachStorageService.getAllOutreaches(); 
    }
    console.warn("[ServicePolling] outreachStorageService.getAllOutreaches is not available (unexpected). Returning empty array.");
    return [];
  } catch (e) {
    console.error("[ServicePolling] Error calling (the old) outreachStorage.getAllOutreaches():", e);
    return [];
  }
};

const _serviceNotifyListeners = () => {
  const stateToNotify = { ...serviceCurrentPollingState };
  if (serviceCurrentPollingState.outreachDataUpdated) {
    serviceCurrentPollingState.outreachDataUpdated = false;
  }
  servicePollingListeners.forEach(listener => listener(stateToNotify));
};

const _serviceClearPollingInterval = () => {
  if (servicePollingIntervalId) {
    clearInterval(servicePollingIntervalId);
    servicePollingIntervalId = null;
  }
};

const _serviceResetPollingStateAfterCompletionOrError = (isError: boolean = false) => {
  _serviceClearPollingInterval();
  serviceCurrentPollingState.isPolling = false;
  serviceCurrentPollingState.pollingAttempts = 0;
  if (!isError && !serviceCurrentPollingState.errorMessage) {
    serviceCurrentPollingState.statusMessage = "Polling ended.";
  }
  // activePollingCallSid and currentPollOriginalOutreachId are cleared by the calling function logic
};

// Forward declared, implementation is after _serviceFetchAndStoreArtifacts
let servicePollStatusAsyncInternalImplementation: () => Promise<void>; 

const _serviceFetchAndStoreArtifacts = async (callSidToFetch: string, originalOutreachIdContext: string | null) => {
  if (!callSidToFetch) {
    serviceCurrentPollingState.errorMessage = "Cannot fetch details: Call SID missing.";
    serviceCurrentPollingState.isFetchingDetails = false;
    _serviceNotifyListeners();
    return;
  }

  console.log(`[ServicePolling] Fetching artifacts for SID: ${callSidToFetch}, Original Outreach Context ID: ${originalOutreachIdContext}`);
  serviceCurrentPollingState.isFetchingDetails = true;
  serviceCurrentPollingState.statusMessage = `Fetching details for ${callSidToFetch}...`;
  serviceCurrentPollingState.errorMessage = null; 
  serviceCurrentPollingState.outreachDataUpdated = false; 
  _serviceNotifyListeners();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated for fetching artifacts.");

    const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/call-details?call_sid=${callSidToFetch}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await response.json();

    if (data.success && data.details) {
      // Ensure timestamps in conversation_history are serializable (strings)
      if (data.details.conversation_history && Array.isArray(data.details.conversation_history)) {
        data.details.conversation_history.forEach((message: any) => {
          if (message && message.timestamp && !(typeof message.timestamp === 'string')) {
            try {
              message.timestamp = new Date(message.timestamp).toISOString();
            } catch (e) {
              console.warn(`[ServicePolling] Could not convert timestamp to ISOString for message:`, message, e);
              // If conversion fails, leave it as is or set to a default string
              message.timestamp = String(message.timestamp);
            }
          }
        });
      }

      serviceCurrentPollingState.fetchedArtifactsForLastCall = data.details as CallArtifactsForService;
      serviceCurrentPollingState.statusMessage = "Call details fetched.";

      const outreachIdFromBackendDetails = data.details.outreach_id;
      const outreachIdToUpdate = originalOutreachIdContext || outreachIdFromBackendDetails || callSidToFetch;
      
      // --- BEGIN DEBUG LOGGING ---
      console.log(`[ServicePolling Debug] Attempting to associate artifacts:
        Original Outreach Context ID (from polling start): ${originalOutreachIdContext}
        Outreach ID from Backend Details: ${outreachIdFromBackendDetails}
        Call SID (used as fallback for ID): ${callSidToFetch}
        ==> Effective outreachIdToUpdate: ${outreachIdToUpdate}`);
      // --- END DEBUG LOGGING ---

      const allOutreaches = await _serviceGetAllOutreachesFromStorage(); 
      
      // --- BEGIN DEBUG LOGGING ---
      if (allOutreaches && allOutreaches.length > 0) {
        console.log('[ServicePolling Debug] List of all_outreach_ids currently in service/storage:', allOutreaches.map(o => o.id));
      } else {
        console.warn('[ServicePolling Debug] No outreaches found in service/storage to match against.');
      }
      // --- END DEBUG LOGGING ---

      let targetOutreach = allOutreaches.find((o: StoredOutreach) => o.id === outreachIdToUpdate);

      if (targetOutreach) {
        // The backend has already saved individual messages and the voice_call_summary to the conversation_messages table.
        // The primary goal here is to update the main outreach record with direct call artifacts if needed
        // and to signal the UI that data has changed, so it can re-fetch the full history.

        const artifactsToUpdate: Partial<StoredOutreach> & { full_recording_url?: string, full_recording_duration?: string } = {
          lastContact: new Date(),
        };
        if (data.details.full_recording_url) {
          artifactsToUpdate.full_recording_url = data.details.full_recording_url;
        }
        if (data.details.full_recording_duration) {
          artifactsToUpdate.full_recording_duration = data.details.full_recording_duration;
        }

        // We will call a new function in outreachStorageService to update these specific fields.
        // For example: await outreachStorageService.updateOutreachArtifacts(outreachIdToUpdate, artifactsToUpdate);
        // This function needs to be created in outreach-storage.ts
        console.log(`[ServicePolling] Call details fetched for ${outreachIdToUpdate}. Artifacts to potentially update on outreach record:`, artifactsToUpdate);
        // console.warn(`[ServicePolling] Placeholder for calling outreachStorageService.updateOutreachArtifacts with above data.`);
        
        if (outreachIdToUpdate && artifactsToUpdate.lastContact) {
          try {
            const updateSuccess = await outreachStorageService.updateOutreachPrimaryArtifacts(outreachIdToUpdate, { lastContact: artifactsToUpdate.lastContact });
            if (updateSuccess) {
              console.log(`[ServicePolling] Successfully updated lastContact for outreach ${outreachIdToUpdate} via outreachStorageService.`);
            } else {
              console.warn(`[ServicePolling] Failed to update lastContact for outreach ${outreachIdToUpdate} via outreachStorageService.`);
            }
          } catch (e) {
            console.error(`[ServicePolling] Error calling updateOutreachPrimaryArtifacts for ${outreachIdToUpdate}:`, e);
          }
        }
        
        // Instead of merging history here, we mark data as updated.
        // The UI, upon seeing outreachDataUpdated = true, should re-fetch the outreach, 
        // which in turn should get its history from getConversationHistory, reflecting all backend-saved messages.
        serviceCurrentPollingState.outreachDataUpdated = true; 
        serviceCurrentPollingState.statusMessage = `Call details processed for ${outreachIdToUpdate}. UI should refresh history.`;
        
        console.log(`[ServicePolling Debug] SUCCESS: Processed artifacts for outreach ID: ${outreachIdToUpdate}. Signaled UI to update.`);
      } else {
        // --- MODIFIED ERROR LOGGING FOR CLARITY ---
        console.warn(`[ServicePolling Debug] FAILURE: Outreach with ID '${outreachIdToUpdate}' NOT FOUND in the list of currently known outreach IDs (see list above). Cannot save history for this call (SID: ${callSidToFetch}).`);
        serviceCurrentPollingState.errorMessage = `Details for call SID ${callSidToFetch} fetched, but its effective outreach ID '${outreachIdToUpdate}' was not found in local storage. History not saved.`;
        // --- END MODIFIED ERROR LOGGING ---
      }
    } else {
      throw new Error(data.error || `Failed to fetch details for ${callSidToFetch}`);
    }
      } catch (error: any) {
    console.error("[ServicePolling] Error fetching artifacts:", error);
    serviceCurrentPollingState.errorMessage = error.message || "Error fetching call artifacts.";
    serviceCurrentPollingState.fetchedArtifactsForLastCall = null; // Clear if fetch failed
  } finally {
    serviceCurrentPollingState.isFetchingDetails = false;
    // If polling was active for this specific SID, and fetch completes (success or error), clear active poll state.
    if (serviceCurrentPollingState.activePollingCallSid === callSidToFetch && serviceCurrentPollingState.isPolling) {
      _serviceResetPollingStateAfterCompletionOrError(!!serviceCurrentPollingState.errorMessage);
      serviceCurrentPollingState.activePollingCallSid = null; 
      serviceCurrentPollingState.currentPollOriginalOutreachId = null;
    }
    _serviceNotifyListeners();
  }
};

// Define the implementation of the polling status check function
servicePollStatusAsyncInternalImplementation = async () => {
  const sidToPoll = serviceCurrentPollingState.activePollingCallSid;
  const originalOutreachIdForThisPoll = serviceCurrentPollingState.currentPollOriginalOutreachId;

  if (!sidToPoll || !serviceCurrentPollingState.isPolling) {
    _serviceClearPollingInterval();
    return;
  }

  serviceCurrentPollingState.pollingAttempts++;
  serviceCurrentPollingState.statusMessage = `Polling attempt ${serviceCurrentPollingState.pollingAttempts} for ${sidToPoll}...`;
  serviceCurrentPollingState.outreachDataUpdated = false; // Reset flag before potential update
  _serviceNotifyListeners();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated for polling status.");

    const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/call-progress-status?call_sid=${sidToPoll}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    const data = await response.json();

    if (data.success) {
      serviceCurrentPollingState.statusMessage = `Status for ${sidToPoll}: ${data.status}`;
      if (data.status === "completed") {
        console.log(`[ServicePolling] Call ${sidToPoll} completed!`);
        _serviceClearPollingInterval();
        serviceCurrentPollingState.isPolling = false; // Mark as not polling *before* fetching artifacts
        _serviceNotifyListeners(); // Notify UI that polling stopped, fetching will start
        await _serviceFetchAndStoreArtifacts(sidToPoll, originalOutreachIdForThisPoll);
        // State related to activePollingCallSid (activePollingCallSid, currentPollOriginalOutreachId) 
        // is reset inside _serviceFetchAndStoreArtifacts' finally block if it was the actively polled SID.
      } else if (["processing", "queued", "ringing", "in-progress"].includes(data.status)) {
        if (serviceCurrentPollingState.pollingAttempts >= MAX_POLLING_ATTEMPTS_SERVICE) {
          console.warn(`[ServicePolling] Max polling attempts reached for ${sidToPoll}.`);
          serviceCurrentPollingState.errorMessage = `Polling for ${sidToPoll} timed out. Please fetch details manually if call completed.`;
          _serviceResetPollingStateAfterCompletionOrError(true);
          serviceCurrentPollingState.activePollingCallSid = null; 
          serviceCurrentPollingState.currentPollOriginalOutreachId = null;
        }
      } else { // Failed, no-answer, busy, canceled etc.
        console.warn(`[ServicePolling] Call ${sidToPoll} ended with status: ${data.status}.`);
        serviceCurrentPollingState.errorMessage = `Call ${sidToPoll} status: ${data.status}.`;
        _serviceResetPollingStateAfterCompletionOrError(true);
        serviceCurrentPollingState.activePollingCallSid = null; 
        serviceCurrentPollingState.currentPollOriginalOutreachId = null;
      }
    } else {
      throw new Error(data.error || `Failed to get status for ${sidToPoll}`);
    }
  } catch (error: any) {
    console.error("[ServicePolling] Error during polling status check:", error);
    serviceCurrentPollingState.errorMessage = error.message || "Error during polling status check.";
    _serviceResetPollingStateAfterCompletionOrError(true);
    serviceCurrentPollingState.activePollingCallSid = null; 
    serviceCurrentPollingState.currentPollOriginalOutreachId = null;
  }
  _serviceNotifyListeners();
};

// +++ END OF NEW POLLING LOGIC (MODULE SCOPE) +++

// ============================================================================
// AI AGENT SPECIFIC TYPE DEFINITIONS (Restored/Defined here)
// ============================================================================

// Define BrandInfo interface here if it's used by other agents
interface BrandInfo {
  name: string;
  industry: string;
  campaignGoals: string[];
  budget: { min: number; max: number; currency: string; };
  timeline: string;
  contentRequirements: string[];
}

export interface BusinessRequirements {
  companyName: string;
  industry: string[];
  productService: string;
  businessGoals: string[];
  campaignAudienceDescription: string;
  targetInfluencerDescription: string;
  demographics?: string; 
  campaignObjective: string[];
  keyMessage?: string;
  budgetRange: { min: number; max: number; }; 
  timeline: string;
  preferredPlatforms?: string[];
  contentTypes?: string[];
  specialRequirements?: string;
  outreachCount: number; 
  personalizedOutreach: boolean;
  locations: string[];
}

export interface GeneratedCampaign { // This is what CampaignBuildingAgent produces
  id: string; // ADDED: Campaign ID, expected from backend
  title: string; 
  brand: string; 
  industry?: string; // Added industry field
  description: string; 
  brief: string; 
  platforms: string[];
  minFollowers: number; 
  niches: string[]; 
  locations: string[]; 
  deliverables: string[];
  budgetMin: number; 
  budgetMax: number; 
  startDate: string; 
  endDate: string; 
  applicationDeadline: string;
  campaign_objective?: string[] | undefined;
  aiInsights: { strategy: string; reasoning: string; successFactors: string[]; potentialChallenges: string[]; optimizationSuggestions: string[]; };
  confidence: number; 
  agentVersion: string; 
  generatedAt: Date | string; // Allow string for data from backend, convert to Date in FE
}

export interface CreatorMatch {
  creator: Creator;
  score: number;
  reasoning: string;
  strengths: string[];
  concerns: string[];
  fitAnalysis: {
    audienceAlignment: number; contentQuality: number; engagementRate: number; 
    brandSafety: number; costEfficiency: number;
  };
  recommendedAction: 'highly_recommend' | 'recommend' | 'consider' | 'not_recommended';
  estimatedPerformance: {
    expectedReach: number; expectedEngagement: number; expectedROI: number;
  };
}

export interface NegotiationInsight {
  currentPhase: 'initial_interest' | 'price_discussion' | 'terms_negotiation' | 'closing';
  suggestedResponse: string; negotiationTactics: string[];
  recommendedOffer: { amount: number; reasoning: string; };
  nextSteps: string[];
}

export interface NegotiationResult {
  success: boolean; insight: NegotiationInsight | null; error?: string;
  method: 'ai_generated' | 'algorithmic_fallback';
}

export interface BatchNegotiationResult { /* ... as previously defined ... */ 
    totalProcessed: number; successful: number; failed: number;
    results: Array<{ outreach: StoredOutreach; result: NegotiationResult; }>;
    summary: { aiGenerated: number; algorithmicFallback: number; errors: string[]; };
}

export interface OutreachResult {
  creator: Creator; subject: string; message: string; status: 'sent' | 'failed';
  method: 'ai_generated' | 'template_based'; timestamp: Date;
}

export interface OutreachSummary {
  totalSent: number; aiGenerated: number; templateBased: number; failed: number;
  outreaches: OutreachResult[];
}

export interface AgentWorkflowResult {
  generatedCampaign: GeneratedCampaign;
  creatorMatches: CreatorMatch[];
  outreachSummary?: OutreachSummary;
  workflowInsights: {
    totalProcessingTime: number; agentsUsed: string[];
    confidenceScore: number; recommendedNextSteps: string[];
  };
}

// Specific types for CreatorDiscoveryAgent backend interaction
interface BackendQueryAnalysis { 
  intent: string;
  queryType: 'budget_optimization' | 'reach_maximization' | 'engagement_focused' | 'niche_targeting' | 'general_search';
  extractedCriteria: { 
    platforms?: string[]; 
    niches?: string[]; 
    followerRange?: string; 
    budget?: string; 
    location?: string; 
  };
  keyRequirements?: string[];
  confidence?: number;
}

interface BackendQueryAnalysisResponse { 
  success: boolean; 
  analysis?: BackendQueryAnalysis; 
  method?: 'ai_generated' | 'algorithmic_fallback'; 
  error?: string; 
}

// ============================================================================
// GLOBAL RATE LIMITER (Frontend-Side)
// ============================================================================
class GlobalRateLimiter {
  private static instance: GlobalRateLimiter;
  private requests: number[] = [];
  public maxRequests: number = 5; // Public for WorkflowOrchestrationAgent to read total
  private timeWindow: number = 60000;
  private constructor() {}
  static getInstance(): GlobalRateLimiter {
    if (!GlobalRateLimiter.instance) {
      GlobalRateLimiter.instance = new GlobalRateLimiter();
    }
    return GlobalRateLimiter.instance;
  }
  async waitIfNeeded(agentName: string = 'FrontendAgent'): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((time: number) => now - time < this.timeWindow);
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests.length > 0 ? Math.min(...this.requests) : now - this.timeWindow;
      const waitTime = Math.max(0, this.timeWindow - (now - oldestRequest) + 1000);
      console.log(`⏳ ${agentName} (FE): Global Rate Limit hit (${this.requests.length}/${this.maxRequests}). Waiting ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitIfNeeded(agentName);
    }
    this.requests.push(now);
    console.log(`🔄 ${agentName} (FE): API Call ${this.requests.length}/${this.maxRequests} in window.`);
  }
  getRemainingCalls(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    return Math.max(0, this.maxRequests - this.requests.length);
  }
}

// ============================================================================
// CAMPAIGN BUILDING AGENT
// ============================================================================
class CampaignBuildingAgent {
  async generateCampaign(requirements: BusinessRequirements): Promise<GeneratedCampaign> {
    console.log("📋 CB Agent (FE): Calling backend for campaign generation.");
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/campaign/generate`;
    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('CampaignBuildingAgent');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('❌ CB Agent (FE): No Supabase session for backend call.', sessionError);
        return this.generateLocalFallbackCampaign(requirements);
      }
      const response = await fetch(backendApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(requirements),
      });
      if (!response.ok) {
        const errResp = await response.json().catch(() => ({ error: `Backend error: ${response.status} ${response.statusText}` }));
        throw new Error(errResp.error);
      }
      const backendResponse = await response.json();
      if (!backendResponse.success || !backendResponse.campaign) {
        throw new Error(backendResponse.error || 'Invalid campaign data from backend');
      }
      console.log(`✅ CB Agent (FE): Received campaign from backend (${backendResponse.method}).`);
      
      // Parse campaign_objective if it's a string
      // The type of backendResponse.campaign.campaign_objective could be string | string[] | undefined from backend
      let parsedCampaignObjective: string[] | undefined = undefined;
      const rawCampaignObjective = backendResponse.campaign.campaign_objective;

      if (typeof rawCampaignObjective === 'string') {
        try {
          const objectives = JSON.parse(rawCampaignObjective);
          if (Array.isArray(objectives) && objectives.every(obj => typeof obj === 'string')) {
            parsedCampaignObjective = objectives as string[];
          } else {
            console.warn(`[CampaignBuildingAgent] campaign_objective was a string but not a valid JSON array of strings: ${rawCampaignObjective}. Setting to undefined.`);
            // Keep as undefined or could set to [rawCampaignObjective] if a single string objective is acceptable
          }
        } catch (e) {
          console.warn(`[CampaignBuildingAgent] Failed to parse campaign_objective string: ${rawCampaignObjective}. Error: ${e}. Setting to undefined.`);
        }
      } else if (Array.isArray(rawCampaignObjective) && rawCampaignObjective.every(obj => typeof obj === 'string')) {
        parsedCampaignObjective = rawCampaignObjective as string[];
      } else if (rawCampaignObjective !== undefined) {
        // It's some other type we don't expect for campaign_objective
        console.warn(`[CampaignBuildingAgent] campaign_objective from backend was an unexpected type: ${typeof rawCampaignObjective}. Value: ${rawCampaignObjective}. Setting to undefined.`);
      }
      // If rawCampaignObjective was undefined, parsedCampaignObjective remains undefined, which is fine.

      const campaignData = {
        ...backendResponse.campaign,
        campaign_objective: parsedCampaignObjective // Use the parsed/validated value
      } as GeneratedCampaign; // Asserting to GeneratedCampaign after modification

      // ---- START: Heuristic for default platforms and niches ----
      if (!campaignData.platforms || campaignData.platforms.length === 0) {
        const suggestedPlatforms = new Set<string>();
        const reqIndustries = requirements.industry?.map(i => i.toLowerCase()) || [];
        const campObjectives = (campaignData.campaign_objective || requirements.campaignObjective)?.map(o => o.toLowerCase()) || [];

        if (reqIndustries.includes('technology') || reqIndustries.includes('finance') || reqIndustries.includes('b2b')) {
          suggestedPlatforms.add('linkedin');
          suggestedPlatforms.add('twitter');
        }
        if (reqIndustries.includes('fashion') || reqIndustries.includes('beauty') || reqIndustries.includes('travel') || reqIndustries.includes('food & beverage')) {
          suggestedPlatforms.add('instagram');
          suggestedPlatforms.add('tiktok');
        }
        if (reqIndustries.includes('gaming')) {
          suggestedPlatforms.add('twitch');
          suggestedPlatforms.add('youtube');
          suggestedPlatforms.add('twitter');
        }
        if (campObjectives.includes('increase brand awareness') || campObjectives.includes('build community')) {
          suggestedPlatforms.add('instagram');
          suggestedPlatforms.add('tiktok');
          // suggestedPlatforms.add('facebook'); // Example if we add more
        }
        if (campObjectives.includes('drive sales') || campObjectives.includes('lead generation')) {
          suggestedPlatforms.add('linkedin'); // Good for B2B
          suggestedPlatforms.add('instagram'); // Good for B2C
        }
        
        // General default if still empty
        if (suggestedPlatforms.size === 0) {
            suggestedPlatforms.add('instagram');
            suggestedPlatforms.add('youtube');
        }
        campaignData.platforms = Array.from(suggestedPlatforms);
        console.log(`[CampaignBuildingAgent] Applied heuristic default platforms: ${campaignData.platforms.join(', ')}`);
      }

      if (!campaignData.niches || campaignData.niches.length === 0) {
        if (requirements.industry && requirements.industry.length > 0) {
          campaignData.niches = [requirements.industry[0]]; // Use the first industry as a default niche
          console.log(`[CampaignBuildingAgent] Applied heuristic default niche from industry: ${campaignData.niches.join(', ')}`);
        } else if (requirements.productService) {
           // Basic attempt to use product service if it's a single word, otherwise a generic default
           const productWords = requirements.productService.split(' ');
           if (productWords.length <= 2 && productWords[0].length > 3) { // Avoid very generic words like "A" or "The"
             campaignData.niches = [productWords[0]];
           } else {
             campaignData.niches = ['general interest'];
           }
           console.log(`[CampaignBuildingAgent] Applied heuristic default niche from product/service or generic: ${campaignData.niches.join(', ')}`);
        } else {
          campaignData.niches = ['general interest']; // Ultimate fallback
          console.log(`[CampaignBuildingAgent] Applied heuristic generic default niche: ${campaignData.niches.join(', ')}`);
        }
      }
      // ---- END: Heuristic for default platforms and niches ----

      return {
        ...campaignData,
        agentVersion: backendResponse.method === 'ai_generated' ? 'backend-ai-generated-v1.x' : (backendResponse.method || 'backend-fallback-v1.x'),
        generatedAt: new Date(campaignData.generatedAt || Date.now()),
        startDate: campaignData.startDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: campaignData.endDate || new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        applicationDeadline: campaignData.applicationDeadline || new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      };
    } catch (error) {
      console.error('❌ CB Agent (FE): Error calling backend, using local fallback.', error);
      return this.generateLocalFallbackCampaign(requirements);
    }
  }

  private generateLocalFallbackCampaign(requirements: BusinessRequirements): GeneratedCampaign {
    const now = new Date();
    const startDateDate = new Date(now);
    const endDateDate = new Date(now);
    endDateDate.setDate(startDateDate.getDate() + 30);
    const appDeadlineDate = new Date(startDateDate);
    appDeadlineDate.setDate(startDateDate.getDate() - 7);

    const startDate = startDateDate.toISOString().split('T')[0];
    const endDate = endDateDate.toISOString().split('T')[0];
    const appDeadline = appDeadlineDate.toISOString().split('T')[0];

    const industryText = requirements.industry && requirements.industry.length > 0 
      ? requirements.industry.join(', ') 
      : 'General';

    const campaignObjectivesArray: string[] | undefined = requirements.campaignObjective && requirements.campaignObjective.length > 0
      ? requirements.campaignObjective
      : undefined;
      
    const campaignObjectiveTextForBrief = campaignObjectivesArray ? campaignObjectivesArray.join(', ') : 'Not specified';

    // ---- START: Heuristic for default platforms and niches in FALLBACK ----
    let finalPlatforms = requirements.preferredPlatforms || [];
    if (!finalPlatforms || finalPlatforms.length === 0) {
        const suggestedPlatforms = new Set<string>();
        const reqIndustries = requirements.industry?.map(i => i.toLowerCase()) || [];
        const campObjectives = requirements.campaignObjective?.map(o => o.toLowerCase()) || [];

        if (reqIndustries.includes('technology') || reqIndustries.includes('finance') || reqIndustries.includes('b2b')) {
            suggestedPlatforms.add('linkedin');
            suggestedPlatforms.add('twitter');
        }
        if (reqIndustries.includes('fashion') || reqIndustries.includes('beauty') || reqIndustries.includes('travel') || reqIndustries.includes('food & beverage')) {
            suggestedPlatforms.add('instagram');
            suggestedPlatforms.add('tiktok');
        }
        if (reqIndustries.includes('gaming')) {
            suggestedPlatforms.add('twitch');
            suggestedPlatforms.add('youtube');
            suggestedPlatforms.add('twitter');
        }
         if (campObjectives.includes('increase brand awareness') || campObjectives.includes('build community')) {
            suggestedPlatforms.add('instagram');
            suggestedPlatforms.add('tiktok');
        }
        if (campObjectives.includes('drive sales') || campObjectives.includes('lead generation')) {
            suggestedPlatforms.add('linkedin');
            suggestedPlatforms.add('instagram');
        }
        if (suggestedPlatforms.size === 0) { // General default if still empty
            suggestedPlatforms.add('instagram');
            suggestedPlatforms.add('youtube');
        }
        finalPlatforms = Array.from(suggestedPlatforms);
        console.log(`[FallbackCampaign] Applied heuristic default platforms: ${finalPlatforms.join(', ')}`);
    }

    let finalNiches = (requirements.industry && requirements.industry.length > 0) ? [...requirements.industry] : [];
    if (!finalNiches || finalNiches.length === 0) {
        if (requirements.productService) {
            const productWords = requirements.productService.split(' ');
            if (productWords.length <= 2 && productWords[0].length > 3) {
                finalNiches = [productWords[0]];
            } else {
                finalNiches = ['general interest'];
            }
        } else {
            finalNiches = ['general interest'];
        }
        console.log(`[FallbackCampaign] Applied heuristic default niches: ${finalNiches.join(', ')}`);
    }
     // ---- END: Heuristic for default platforms and niches in FALLBACK ----

    return {
      id: `local-fallback-campaign-${Date.now()}`,
      title: `Exciting Campaign for ${requirements.companyName}`,
      brand: requirements.companyName,
      industry: (requirements.industry && requirements.industry.length > 0) ? requirements.industry[0] : 'General', // Added industry field
      description: `A dynamic campaign focusing on ${requirements.productService} for the ${industryText} sector. We aim to ${requirements.businessGoals.join(', ')}. Target audience (viewers): ${requirements.campaignAudienceDescription}. Target influencers (creators): ${requirements.targetInfluencerDescription}.`,
      brief: `Campaign Objectives: ${campaignObjectiveTextForBrief}. Key Message: ${requirements.keyMessage || 'Experience the best!'}. Platforms: ${finalPlatforms.join(', ')}. Content: ${(requirements.contentTypes || []).join(', ')}. Special Notes: ${requirements.specialRequirements || 'None'}`,
      platforms: finalPlatforms,
      minFollowers: 5000,
      niches: finalNiches,
      locations: ['Global'],
      deliverables: ['1 Instagram Post', '2 Instagram Stories'],
      budgetMin: requirements.budgetRange.min || 500,
      budgetMax: requirements.budgetRange.max || 2500,
      startDate: startDate,
      endDate: endDate,
      applicationDeadline: appDeadline,
      campaign_objective: campaignObjectivesArray,
      aiInsights: {
        strategy: "Standard engagement strategy. Focus on clear calls to action and visually appealing content.",
        reasoning: "Fallback strategy due to API limitations or errors. Provides a basic but functional campaign structure.",
        successFactors: ["Consistent posting", "Audience interaction"],
        potentialChallenges: ["Lower organic reach", "Generic messaging"],
        optimizationSuggestions: ["Boost posts with paid ads", "Run contests or giveaways"]
      },
      confidence: 0.4,
      agentVersion: 'local_fallback_v1.2',
      generatedAt: new Date(),
    };
  }
}

// ============================================================================
// CREATOR DISCOVERY AGENT
// ============================================================================
class CreatorDiscoveryAgent {
  async findCreators(campaign: GeneratedCampaign, searchQuery?: string): Promise<Creator[]> {
    console.log('🔍 CD Agent (FE): Entered findCreators. Campaign Title:', campaign.title);
    
    let effectiveSearchQuery = searchQuery || this.generateSearchQueryFromCampaign(campaign);
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const analyzeQueryUrl = `${baseBackendUrl}/api/creator/analyze-query`;
    let analysisResult: BackendQueryAnalysis | null = null;

    console.log('🔍 CD Agent (FE): Preparing for Step 1 - Analyze Query. URL:', analyzeQueryUrl);
    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('CreatorDiscoveryAgent.analyzeQuery');
      console.log('🔍 CD Agent (FE): Passed rate limiter for analyzeQuery.');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('❌ CD Agent (FE): No Supabase session for analyze-query.');
        throw new Error('No Supabase session for analyze-query');
      }
      console.log('🔍 CD Agent (FE): Got session for analyze-query. Token:', session.access_token ? ' vorhanden' : 'FEHLT');
      
      const payload = { query: effectiveSearchQuery, campaignContext: {title: campaign.title, niches: campaign.niches, platforms: campaign.platforms } };
      console.log('🔍 CD Agent (FE): Sending to analyze-query:', JSON.stringify(payload));
      const analyzeResponse = await fetch(analyzeQueryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(payload)
      });
      console.log('🔍 CD Agent (FE): analyze-query response status:', analyzeResponse.status);
      if (!analyzeResponse.ok) { 
        const errText = await analyzeResponse.text();
        console.error('❌ CD Agent (FE): analyze-query fetch error text:', errText);
        const errResp = JSON.parse(errText || '{}');
        throw new Error(errResp.error || `Backend error (analyze-query): ${analyzeResponse.status} ${analyzeResponse.statusText}`);
      }
      const backendAnalysis: BackendQueryAnalysisResponse = await analyzeResponse.json();
      if (backendAnalysis.success && backendAnalysis.analysis) {
        analysisResult = backendAnalysis.analysis;
        console.log(`✅ CD Agent (FE): Query analysis from backend (${backendAnalysis.method}). Intent: ${analysisResult.intent}`);
      } else {
        console.error('❌ CD Agent (FE): Invalid analysis from backend for creator discovery.', backendAnalysis.error);
        throw new Error(backendAnalysis.error || 'Invalid analysis from backend for creator discovery');
      }
    } catch (error) {
      console.error('❌ CD Agent (FE): CATCH block for analyze-query. Error:', error);
      analysisResult = this.localFallbackQueryAnalysis(effectiveSearchQuery);
      console.log('🔍 CD Agent (FE): Using local fallback for analysisResult due to error.');
    }

    if (!analysisResult) { // Should not happen if fallback is assigned, but as a safeguard
      console.error('❌ CD Agent (FE): CRITICAL - analysisResult is null even after fallback. Using emergency fallback.');
      analysisResult = this.localFallbackQueryAnalysis("general influencer search (critical fallback)");
    }

    console.log('🔍 CD Agent (FE): Preparing for Step 2 - Discover Creators from DB.');
    const discoverUrl = `${baseBackendUrl}/api/creators/discover`;
    
    const discoveryCriteria: any = {};
    if (campaign.platforms && campaign.platforms.length > 0) {
      discoveryCriteria.platforms = campaign.platforms;
    }
    if (campaign.niches && campaign.niches.length > 0) {
      discoveryCriteria.niches = campaign.niches;
    }
    if (campaign.minFollowers) {
      discoveryCriteria.min_followers = campaign.minFollowers;
    }

    // MODIFIED: Always set location to India for discovery
    discoveryCriteria.location = "India";
    // REMOVED: Old logic for locationForFilter
    /*
    let locationForFilter: string | undefined = undefined;
    if (campaign.locations && campaign.locations.length > 0) {
      if (campaign.locations.length === 1 && campaign.locations[0].toLowerCase() === 'global') {
        // If the campaign location is explicitly "Global", use "India" for filtering
        locationForFilter = "India";
      } else if (!campaign.locations.some(loc => loc.toLowerCase() === 'global')) {
        // If there are specific locations and none of them are "Global", use the first one
        locationForFilter = campaign.locations[0];
      } else {
        // If there are multiple locations and one of them is "Global", or other complex cases,
        // default to "India" for now. This could be refined if more specific handling for mixed lists is needed.
        locationForFilter = "India"; 
      }
    } else {
      // If campaign.locations is empty or undefined, default to India
      locationForFilter = "India";
    }
    
    if (locationForFilter) {
      discoveryCriteria.location = locationForFilter;
    }
    */
    
    console.log('🔍 CD Agent (FE): Criteria for DB discovery:', JSON.stringify(discoveryCriteria));

    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('CreatorDiscoveryAgent.discoverFromDB');
      console.log('🔍 CD Agent (FE): Passed rate limiter for discoverFromDB.');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('❌ CD Agent (FE): No Supabase session for discover-from-db.');
        throw new Error('No Supabase session for discover-from-db');
      }
      console.log('🔍 CD Agent (FE): Got session for discover-from-db. Token:', session.access_token ? ' vorhanden' : 'FEHLT');

      console.log('🔍 CD Agent (FE): Sending to discover-from-db. URL:', discoverUrl);
      const discoverResponse = await fetch(discoverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(discoveryCriteria)
      });
      console.log('🔍 CD Agent (FE): discover-from-db response status:', discoverResponse.status);

      if (!discoverResponse.ok) {
        const errText = await discoverResponse.text();
        console.error('❌ CD Agent (FE): discover-from-db fetch error text:', errText);
        const errResp = JSON.parse(errText || '{}');
        throw new Error(errResp.error || `Failed to discover creators from DB`);
      }

      const discoverData = await discoverResponse.json();
      if (discoverData.success && Array.isArray(discoverData.creators)) {
        console.log(`✅ CD Agent (FE): Received ${discoverData.creators.length} creators from backend DB discovery.`);
        return discoverData.creators as Creator[];
      } else {
        console.warn('CD Agent (FE): Backend DB discovery did not return a successful creator list.', discoverData.error);
        return [];
      }
    } catch (error) {
      console.error('❌ CD Agent (FE): CATCH block for discover-from-db. Error:', error);
      return [];
    }
  }

  private generateSearchQueryFromCampaign(campaign: GeneratedCampaign): string {
    return `Find influencers for campaign "${campaign.title}" focusing on niches like ${campaign.niches.join(', ')} on platforms ${campaign.platforms.join(', ')}. Budget is around ₹${campaign.budgetMin}-₹${campaign.budgetMax}.`;
  }

  private localFallbackQueryAnalysis(query: string): BackendQueryAnalysis {
    console.log(`🤖 CD Agent (FE): Using LOCAL FALLBACK query analysis for: "${query.substring(0,70)}..."`);
    const query_lower = query.toLowerCase();
    let queryType: BackendQueryAnalysis['queryType'] = "general_search";
    if (query_lower.includes("budget")) queryType = "budget_optimization";
    return { intent: "Local Fallback: General search for influencers.", queryType, extractedCriteria: { niches: ["any"] }, confidence: 0.1, keyRequirements: ["basic fit"] };
  }

  private filterMockCreatorsWithAnalysis(creators: Creator[], analysis: BackendQueryAnalysis, campaign: GeneratedCampaign): Creator[] {
    console.log('Frontend: CreatorDiscoveryAgent.filterMockCreatorsWithAnalysis using criteria:', analysis.extractedCriteria);
    const criteria = analysis.extractedCriteria;
    return creators.filter(creator => {
      let meetsAllCriteria = true;
      if (criteria.platforms && criteria.platforms.length > 0 && !criteria.platforms.includes("any")) {
        if (!criteria.platforms.some((p: string) => creator.platform.toLowerCase() === p.toLowerCase())) meetsAllCriteria = false;
      }
      if (criteria.niches && criteria.niches.length > 0 && !criteria.niches.includes("any")) {
        if (!creator.niche.some((n: string) => criteria.niches?.map((cn: string) => cn.toLowerCase()).includes(n.toLowerCase()))) meetsAllCriteria = false;
      }
      if (meetsAllCriteria && creator.metrics.followers < (campaign.minFollowers || 0)) meetsAllCriteria = false;
      return meetsAllCriteria;
    }).slice(0, 50); 
  }
}

// ============================================================================
// MATCHING & SCORING AGENT
// ============================================================================
class MatchingScoringAgent {
  private maxAIScoring = 1; 
  async scoreCreators(campaign: GeneratedCampaign, creators: Creator[]): Promise<CreatorMatch[]> {
    console.log("⚡ MS Agent (FE): Scoring creators. Will use backend for AI scoring.");
    const matches: CreatorMatch[] = []; let aiScoredCount = 0;
    for (const creator of creators) {
      let scoringCallResponse: { success: boolean; creatorMatch: Partial<CreatorMatch>; method: string; error?: string };
      if (aiScoredCount < this.maxAIScoring && GlobalRateLimiter.getInstance().getRemainingCalls() > 0) {
        scoringCallResponse = await this.scoreIndividualCreatorViaBackend(campaign, creator);
        if (scoringCallResponse.method === 'ai_generated' && scoringCallResponse.success) aiScoredCount++;
    } else {
        const fallbackData = this.localFallbackScoring(campaign, creator);
        scoringCallResponse = { success: true, creatorMatch: fallbackData, method: 'algorithmic_fallback' };
      }
      const baseMatchData = scoringCallResponse.creatorMatch;
      const finalCreatorMatch: CreatorMatch = {
        creator: creator, 
        score: baseMatchData.score ?? 0,
        reasoning: baseMatchData.reasoning ?? 'Algorithmic fallback or error.',
        strengths: baseMatchData.strengths ?? [], 
        concerns: baseMatchData.concerns ?? [],
        fitAnalysis: baseMatchData.fitAnalysis ?? { audienceAlignment: 30, contentQuality: 30, engagementRate: 30, brandSafety: 70, costEfficiency: 30 },
        recommendedAction: baseMatchData.recommendedAction ?? 'consider',
        estimatedPerformance: baseMatchData.estimatedPerformance ?? { expectedReach: creator.metrics.followers * 0.1, expectedEngagement: creator.metrics.followers * 0.005, expectedROI: 0.5 }
      };
      matches.push(finalCreatorMatch);
    }
    matches.sort((a, b) => b.score - a.score);
    console.log(`✅ MS Agent (FE): Finished. ${aiScoredCount} AI-scored, ${creators.length - aiScoredCount} algo.`);
    return matches;
  }

  private async scoreIndividualCreatorViaBackend(
    campaign: GeneratedCampaign, 
    creator: Creator
  ): Promise<{ success: boolean; creatorMatch: Partial<CreatorMatch>; method: string; error?: string }> {
    console.log(`📞 MS Agent (FE): Calling backend to AI score ${creator.name}`);
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/creator/score`;
    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('MatchingScoringAgent');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('No Supabase session for scoreIndividualCreatorViaBackend');
      const payload = { campaign, creator };
      const response = await fetch(backendApiUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, 
        body: JSON.stringify(payload)
      });
      if (!response.ok) { 
        const errResp = await response.json().catch(()=>({error: `Backend HTTP error ${response.status}`})); 
        throw new Error(errResp.error); 
      }
      const backendResponse = await response.json();
      if (!backendResponse.success || !backendResponse.creatorMatch) throw new Error(backendResponse.error || 'Invalid scoring data from backend');
      // Ensure the creatorMatch from backend is treated as Partial<CreatorMatch>
      return { success: true, creatorMatch: backendResponse.creatorMatch as Partial<CreatorMatch>, method: backendResponse.method as string };
    } catch (error) {
      console.error('❌ MS Agent (FE): Error calling backend for scoring, using local fallback.', error);
      return { success: false, creatorMatch: this.localFallbackScoring(campaign, creator), method: 'algorithmic_fallback', error: (error as Error).message };
    }
  }

  private localFallbackScoring(campaign: GeneratedCampaign, creator: Creator): CreatorMatch {
    console.log(`📝 MS Agent (FE): Using LOCAL FALLBACK scoring for ${creator.name}.`);
    let score = 25 + Math.floor(Math.random() * 30); 
    return {
      creator, score, reasoning: "Local fallback algorithmic score.", 
      strengths: ["Basic platform/niche check"], concerns: ["Full AI analysis pending"],
      fitAnalysis: { audienceAlignment: score, contentQuality: score-10, engagementRate: creator.metrics.engagementRate, brandSafety: 70, costEfficiency: 50 },
      recommendedAction: score > 60 ? 'recommend' : (score > 40 ? 'consider' : 'not_recommended'),
      estimatedPerformance: { expectedReach: Math.floor(creator.metrics.followers * 0.2), expectedEngagement: Math.floor(creator.metrics.followers * (creator.metrics.engagementRate/100) * 0.5), expectedROI: 1.0 }
    };
  }
}

// ============================================================================
// OUTREACH AGENT (Now directly calls Python Backend for message generation)
// ============================================================================
class OutreachAgent {
  // Removed direct Groq model dependencies, backend handles AI

  async executeOutreach(
    campaign: GeneratedCampaign, 
    creatorMatches: CreatorMatch[], 
    requirements: BusinessRequirements,
    campaignId: string // ADDED: campaignId parameter
  ): Promise<OutreachSummary> {
    const results: OutreachResult[] = [];
    let successfullySentCount = 0;
    let aiGeneratedCount = 0;
    let templateBasedCount = 0;
    let failedCount = 0;

    const qualifiedCreators = creatorMatches
      .filter(match => 
        match.recommendedAction === 'highly_recommend' || 
        match.recommendedAction === 'recommend' || 
        match.recommendedAction === 'consider'
      )
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const creatorsToOutreach = qualifiedCreators.slice(0, requirements.outreachCount);

    console.log(`[OutreachAgent] Initial matches: ${creatorMatches.length}, Qualified: ${qualifiedCreators.length}, To outreach (count ${requirements.outreachCount}): ${creatorsToOutreach.length}`);

    const brandInfo: BrandInfo = {
      name: campaign.brand || requirements.companyName,
      industry: requirements.industry.join(', '),
      campaignGoals: requirements.campaignObjective,
      budget: { min: campaign.budgetMin, max: campaign.budgetMax, currency: 'USD' },
      timeline: requirements.timeline,
      contentRequirements: campaign.deliverables,
    };

    for (const match of creatorsToOutreach) {
      if (!match.creator || !match.creator.id) {
        console.warn("[OutreachAgent] Skipping creator match due to missing creator or creator ID:", match);
        failedCount++;
        results.push({
          creator: match.creator || {} as Creator,
          subject: "Error: Missing Creator Info",
          message: "Creator data was incomplete, cannot proceed with outreach.",
          status: 'failed',
          method: 'template_based',
          timestamp: new Date(),
        });
        continue;
      }

      let subject = `Collaboration Opportunity: ${campaign.title} with ${brandInfo.name}`;
      let messageBody = `
Dear ${match.creator.name},

My name is [Your Name/Brand Rep Name] from ${brandInfo.name}. We're very impressed with your content on ${match.creator.platform} and your connection with your audience in the ${match.creator.niche.join(', ')} space.

We're running a campaign for "${campaign.title}" (${campaign.brief}) and believe your audience aligns perfectly with our goals: ${brandInfo.campaignGoals.join(', ')}. 
We're looking for authentic creators like you to help us spread the word about ${requirements.productService}. 
Key deliverables include: ${campaign.deliverables.join(', ')}. The campaign is scheduled to run from ${campaign.startDate} to ${campaign.endDate}.

We'd love to discuss a potential partnership. Are you available for a quick chat sometime next week?

Best regards,
[Your Name/Brand Rep Name]
${brandInfo.name}
      `.trim();
      
      let methodUsed: 'ai_generated' | 'template_based' = 'template_based';
      let aiReasoningForMetadata = "Standard initial outreach";

      if (requirements.personalizedOutreach) {
        console.log(`[OutreachAgent] Simulating AI personalized outreach for ${match.creator.name}`);
        subject = `✨ Personalized Collab Idea: ${match.creator.name} x ${brandInfo.name} for ${campaign.title}`;
        messageBody = `Hi ${match.creator.name} - We love your ${match.creator.niche[0]} content on ${match.creator.platform}! We at ${brandInfo.name} are working on an exciting new project, "${campaign.title}", and thought your style would be a perfect fit. Specifically, we're aiming to ${brandInfo.campaignGoals.join(', ')} and your recent work on [mention specific post/topic if available, otherwise generic positive] really caught our eye. Would you be open to exploring a collaboration?`;
        methodUsed = 'ai_generated';
        aiGeneratedCount++;
        aiReasoningForMetadata = campaign.aiInsights?.reasoning || "AI-assisted initial outreach";
      } else {
        templateBasedCount++;
      }

      let currentOutreachStatus: 'sent' | 'failed' = 'failed';
      let conversationMessageId: string | undefined = undefined;

      try {
        await GlobalRateLimiter.getInstance().waitIfNeeded('OutreachAgent.Gmail');

        // Step 1: Save the initial outreach record to the 'outreaches' table
        const savedOutreach = await this.saveOutreach(
          campaign, 
          match.creator, 
          subject, 
          messageBody, 
          false, 
          methodUsed, 
          campaignId,
          match.creator.phone_number
        );

        if (!savedOutreach || !savedOutreach.id) {
          console.error(`[OutreachAgent] Failed to save initial outreach record for ${match.creator.name}.`);
          throw new Error("Failed to save initial outreach record.");
        }
        const outreachId = savedOutreach.id;

        // Step 2: Check for Creator Email (Frontend Check)
        const creatorEmailExistsLocally = !!match.creator.email;
        if (!creatorEmailExistsLocally) {
          console.warn(`[OutreachAgent] No email found locally for creator ${match.creator.name} (ID: ${match.creator.id}). Backend will attempt DB lookup.`);
        }
        
        // Step 3: Log to conversation_messages (Pre-Send)
        const loggedConversationMessage = await outreachStorageService.addConversationMessage(
          outreachId,
          messageBody,
          'brand',
          'initial_outreach_gmail',
          {
            subject: subject,
            gmail_send_status: creatorEmailExistsLocally ? 'pending_gmail_send' : 'pending_email_lookup_by_backend',
            error_message: !creatorEmailExistsLocally ? 'Local email missing. Backend to verify and attempt send.' : undefined,
            ai_reasoning: aiReasoningForMetadata,
          }
        );

        if (!loggedConversationMessage || !loggedConversationMessage.id) {
          console.error(`[OutreachAgent] Failed to log initial outreach to conversation_messages for ${match.creator.name}.`);
          throw new Error("Failed to log to conversation_messages.");
        }
        conversationMessageId = loggedConversationMessage.id; // Store for potential error logging if API call itself fails

        // Step 4: Call Backend to Send via Gmail API
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.access_token) {
          console.error('[OutreachAgent] Authentication error, cannot make Gmail send API call:', sessionError);
          // Note: Backend is responsible for updating the conversation_message status upon actual send attempt failure.
          // This error is about the inability to even make the API call.
          throw new Error("Authentication failed before making Gmail send API call.");
        }

        const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
        const sendResponse = await fetch(`${backendUrl}/api/outreach/send-via-gmail`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            outreach_id: outreachId, // Backend uses this to find creator's email
            conversation_message_id: conversationMessageId,
            subject: subject,
            body: messageBody,
            // NO creator_email here in payload, backend will look it up
          }),
        });

        const sendResult = await sendResponse.json();

        if (sendResponse.ok && sendResult.success) {
          console.log(`[OutreachAgent] Backend API call for Gmail to ${match.creator.name} was successful. Backend handles final send status logging.`);
          currentOutreachStatus = 'sent'; // Mark as 'sent' from frontend perspective (API call succeeded)
          successfullySentCount++; 
        } else {
          console.error(`[OutreachAgent] Backend API call for Gmail to ${match.creator.name} failed. Error: ${sendResult.error || sendResponse.statusText || 'Unknown API error'}`);
          // The backend is responsible for updating the conversation_message.gmail_send_status to 'failed_gmail_send'.
          // If the API call itself failed (e.g., network error, 500), the conversation_message might remain in its 'pending' state.
          // This is acceptable as the backend didn't get a chance to process it.
          throw new Error(sendResult.error || `Backend API call for Gmail send failed with status: ${sendResponse.status}`);
        }

      } catch (error: any) {
        console.error(`[OutreachAgent] Critical error during executeOutreach for ${match.creator.name}: ${error.message}`, error);
        failedCount++;
        currentOutreachStatus = 'failed';
        // If conversationMessageId was set, it means the pre-send log happened.
        // The backend would be responsible for updating its status if the error occurred during/after the API call.
        // If error was before API call (e.g. saveOutreach, addConversationMessage), then that log reflects the state.
      }

      results.push({
        creator: match.creator,
        subject,
        message: messageBody,
        status: currentOutreachStatus,
        method: methodUsed,
        timestamp: new Date(),
      });
    } // End of for...of loop

    return {
      totalSent: successfullySentCount,
      aiGenerated: aiGeneratedCount,
      templateBased: templateBasedCount,
      failed: failedCount,
      outreaches: results,
    };
  }

  private async saveOutreach(
    campaign: GeneratedCampaign, 
    creator: Creator, 
    subject: string, 
    message: string, 
    isFailure: boolean = false, 
    methodUsed: string = 'template_based',
    campaignId: string, 
    creatorPhoneNumber?: string 
  ): Promise<StoredOutreach | null> { // Return type is already correct from previous successful edit
    try {
      if (!campaignId) {
        console.error("[OutreachAgent] campaignId is missing, cannot save outreach.");
        throw new Error("campaignId is required to save outreach.");
      }
      if (!creator || !creator.id) { 
        console.error("[OutreachAgent] Creator or Creator ID is missing, cannot save outreach.");
        throw new Error("Creator and Creator ID are required to save outreach.");
      }

      const outreachDetails: NewOutreachData = {
        campaign_id: campaignId, 
        creatorId: creator.id,
        creatorName: creator.name,
        creatorAvatar: creator.avatar,
        creatorPlatform: creator.platform,
        creatorPhoneNumber: creatorPhoneNumber, 
        subject: subject,
        body: message,
        status: isFailure ? 'declined' : 'contacted', 
        confidence: isFailure ? 0 : (campaign.confidence || 0.75), 
        reasoning: isFailure ? "Outreach attempt failed" : (campaign.aiInsights?.reasoning || "Standard outreach based on campaign match"),
        keyPoints: campaign.aiInsights?.successFactors || [],
        nextSteps: campaign.aiInsights?.optimizationSuggestions || ["Follow up if no response"], 
        brandName: campaign.brand,
        campaignContext: campaign.brief,
        notes: isFailure ? "Automated outreach failed." : "Initial outreach sent.",
        currentOffer: undefined, 
      };

      const savedOutreach = await outreachStorageService.saveOutreach(outreachDetails);
      if (savedOutreach) {
        console.log(`[OutreachAgent] Outreach for ${creator.name} (Campaign: ${campaignId}) saved with ID: ${savedOutreach.id}, Phone: ${creatorPhoneNumber || 'N/A'}`);
      } else {
        console.error(`[OutreachAgent] Failed to save outreach for ${creator.name} (Campaign: ${campaignId}) to storage service.`);
      }
      return savedOutreach; 
    } catch (error) {
      console.error(`[OutreachAgent] Error in internal saveOutreach for ${creator.name}: ${(error as Error).message}`, error);
      return null; 
    }
  }
}

// ============================================================================
// NEGOTIATION AGENT (REFACTORED)
// ============================================================================
class NegotiationAgent {
  // Original methods, potentially with minor corrections for consistency or to use new helpers
  
  // YOU NEED TO ENSURE THIS METHOD IS IMPLEMENTED OR AVAILABLE
  private summarizeConversationHistory(history: ConversationMessage[]): string {
    if (!history || history.length === 0) {
      return "No prior conversation history.";
    }
    // Example summarization logic (replace with your actual logic)
    const maxMessagesToSummarize = 10;
    const relevantMessages = history.slice(-maxMessagesToSummarize);
    return relevantMessages.map(msg => `${msg.sender === 'ai' ? 'AI' : 'Creator'}: ${msg.content.substring(0, 70)}...`).join('\n');
  }

  async generateNegotiationStrategy(outreach: StoredOutreach): Promise<NegotiationResult> {
    console.log("🚀 FE: NegotiationAgent.generateNegotiationStrategy calling backend");
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/negotiation/generate-strategy`;
    // MODIFIED: await the call to getConversationContext and use outreachStorageService
    const conversationContext = await outreachStorageService.getConversationContext(outreach.id);
    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('NegotiationAgent');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('No Supabase session for NegotiationAgent backend call');
      const payload = { ...outreach, conversationHistorySummary: conversationContext };
      const response = await fetch(backendApiUrl, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, 
        body: JSON.stringify(payload) 
      });
      if (!response.ok) { 
        const errResp = await response.json().catch(()=>({error: `Backend HTTP error ${response.status}`})); 
        throw new Error(errResp.error || `Backend error ${response.status}`); 
      }
      const backendResponse: NegotiationResult = await response.json();
      if (!backendResponse.success || !backendResponse.insight) {
        throw new Error(backendResponse.error || 'Invalid insight data from backend');
      }
      console.log('✅ FE: NegotiationAgent received strategy from backend:', backendResponse.method);
      return backendResponse;
    } catch (error) {
      console.error('❌ FE NegotiationAgent: Error calling backend for strategy, using local fallback.', error);
      return { 
        success: false, 
        insight: this.generateLocalFallbackStrategy(outreach), 
        method: 'algorithmic_fallback', 
        error: (error as Error).message 
      };
    }
  }

  private generateLocalFallbackStrategy(outreach: StoredOutreach): NegotiationInsight {
    console.log(`🤖 FE NegotiationAgent: Generating LOCAL FALLBACK strategy for ${outreach.status} stage.`);
    const baseOffer = outreach.currentOffer || 10000;
    // Simplified fallback logic based on current status
    if (outreach.status === 'interested') {
    return {
        currentPhase: 'initial_interest', 
        suggestedResponse: `Local Fallback (Interested): Hi ${outreach.creatorName}, let's discuss our exciting campaign!`, 
        negotiationTactics: ["local_fallback", "emphasize_value"], 
        recommendedOffer: {amount: Math.round(baseOffer * 1.1), reasoning: "Local fallback initial offer"}, 
        nextSteps: ["Schedule call", "Send brief"] 
      };
    } else if (outreach.status === 'negotiating') {
      return { 
        currentPhase: 'price_discussion', 
        suggestedResponse: `Local Fallback (Negotiating): Hi ${outreach.creatorName}, let's work on the terms.`, 
        negotiationTactics: ["local_fallback", "find_common_ground"], 
        recommendedOffer: {amount: Math.round(baseOffer * 1.05), reasoning: "Local fallback offer adjustment"}, 
        nextSteps: ["Clarify points", "Propose alternatives"] 
      };
    } else { // Default to a closing-like phase for other positive statuses
      return { 
        currentPhase: 'closing', 
        suggestedResponse: `Local Fallback (Closing): Hi ${outreach.creatorName}, glad we're moving forward!`, 
        negotiationTactics: ["local_fallback", "confirm_details"], 
        recommendedOffer: {amount: baseOffer, reasoning: "Local fallback final offer"}, 
        nextSteps: ["Prepare contract", "Outline next steps"] 
      };
    }
  }
  
  // Corrected to use _serviceGetAllOutreachesFromStorage and typed parameters
  // MODIFIED: Make async and await _serviceGetAllOutreachesFromStorage
  async getEligibleForNegotiation(): Promise<StoredOutreach[]> { 
    const allOutreaches = await _serviceGetAllOutreachesFromStorage(); 
    return allOutreaches.filter((o: StoredOutreach) => 
      o.status !== 'deal_closed' && o.status !== 'declined' && 
      o.status !== 'pending' && o.status !== 'contacted'
    ); 
  }

  // Corrected to use _serviceGetAllOutreachesFromStorage and typed parameters
  // MODIFIED: Make async and await _serviceGetAllOutreachesFromStorage
  async getPositiveResponseCreators(): Promise<StoredOutreach[]> { 
    const allOutreaches = await _serviceGetAllOutreachesFromStorage(); 
    return allOutreaches
      .filter((o: StoredOutreach) => ['interested', 'negotiating', 'deal_closed'].includes(o.status))
      .sort((a: StoredOutreach, b: StoredOutreach) => new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime());
  }
  
  // Preserved original logic, check if outreachStorageService.addConversationMessage/updateOutreachStatus are still correct
  // MODIFIED: Ensure this is async and awaits storage calls
  async updateOutreachWithNegotiation(
    outreachId: string, 
    message: string, 
    suggestedOffer: number,
    insight?: NegotiationInsight, 
    method?: 'ai_generated' | 'algorithmic_fallback'
  ): Promise<boolean> { 
    console.log(`📝 FE NegotiationAgent: Updating outreach ${outreachId} via outreachStorageService with new message.`);
    try {
      const messageType: ConversationMessage['type'] = insight ? 'negotiation' : 'update';
      const sender: ConversationMessage['sender'] = (insight && method === 'ai_generated') ? 'ai' : 'brand'; 
      
      await outreachStorageService.addConversationMessage(outreachId, message, sender, messageType, 
        insight ? { 
          aiMethod: method,
          strategy: insight.currentPhase, 
          tactics: insight.negotiationTactics,
          suggestedOffer: insight.recommendedOffer.amount,
          phase: insight.currentPhase 
        } : undefined
      );
      await outreachStorageService.updateOutreachStatus(outreachId, 'negotiating', undefined, suggestedOffer);

      serviceCurrentPollingState.outreachDataUpdated = true;
      _serviceNotifyListeners();
      return true;
    } catch (error) {
      console.error('Error updating outreach in NegotiationAgent:', error); 
      return false; 
    }
  }

  isAvailable(): boolean { 
    return true; // Assuming always available
  } 
  
  getRateLimitStatus(): { remaining: number; canMakeRequest: boolean } { 
    const globalStatus = GlobalRateLimiter.getInstance().getRemainingCalls();
    return { remaining: globalStatus, canMakeRequest: globalStatus > 0 };
  }

  // --- New Polling Service Interface Methods ---
  subscribeToPollingState(listener: PollingStateListener): void {
    if (!servicePollingListeners.includes(listener)) {
      servicePollingListeners.push(listener);
    }
    listener({ ...serviceCurrentPollingState }); // Immediately notify with current state
  }

  unsubscribeFromPollingState(listener: PollingStateListener): void {
    const index = servicePollingListeners.indexOf(listener);
    if (index > -1) {
      servicePollingListeners.splice(index, 1);
    }
  }

  getPollingStateSnapshot(): PollingState {
    return { ...serviceCurrentPollingState };
  }

  async initiateCallAndPoll(
    outreachIdForCallContext: string, 
    toPhoneNumber: string,
    messageToSpeak: string,
    creatorName: string,
    brandName: string,
    campaignObjective: string,
    conversationHistoryForSummary: ConversationMessage[]
  ): Promise<void> {
    console.log(`[ServicePolling] Attempting to initiate call for outreach: ${outreachIdForCallContext} to ${toPhoneNumber}`);
    // Clear any previous error/status from a prior attempt
    serviceCurrentPollingState.errorMessage = null;
    serviceCurrentPollingState.statusMessage = "Initiating call...";
    serviceCurrentPollingState.outreachDataUpdated = false;
    _serviceNotifyListeners();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Stop any existing polling interval before starting a new call.
      // This ensures we only poll for the latest initiated call.
      if (serviceCurrentPollingState.isPolling) {
        console.warn(`[ServicePolling] Cleared existing polling interval for SID ${serviceCurrentPollingState.activePollingCallSid} because a new call is being initiated.`);
        _serviceClearPollingInterval();
        serviceCurrentPollingState.isPolling = false;
        serviceCurrentPollingState.activePollingCallSid = null; // Clear active SID as polling stopped
        serviceCurrentPollingState.currentPollOriginalOutreachId = null;
        serviceCurrentPollingState.pollingAttempts = 0;
      }
      
      // Summarize the conversation history before sending to backend
      const summaryString = this.summarizeConversationHistory(conversationHistoryForSummary);

      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/make-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          to_phone_number: toPhoneNumber, 
          message: messageToSpeak, 
          outreach_id: outreachIdForCallContext,
          creator_name: creatorName,
          brand_name: brandName,
          campaign_objective: campaignObjective,
          conversationHistorySummary: summaryString
        })
      });

      const data = await response.json();

      if (response.ok && data.success && data.call_sid) {
        console.log(`[ServicePolling] Call initiated via service. SID: ${data.call_sid}. For Outreach Context: ${outreachIdForCallContext}`);
        serviceCurrentPollingState.lastInitiatedCallSid = data.call_sid;
        serviceCurrentPollingState.activePollingCallSid = data.call_sid;
        serviceCurrentPollingState.isPolling = true;
        serviceCurrentPollingState.statusMessage = `Call queued (SID: ${data.call_sid}). Polling started...`;
        serviceCurrentPollingState.errorMessage = null;
        serviceCurrentPollingState.pollingAttempts = 0;
        
        if (servicePollingIntervalId) clearInterval(servicePollingIntervalId);
        servicePollingIntervalId = setInterval(servicePollStatusAsyncInternalImplementation, POLLING_INTERVAL_MS);
        
        _serviceNotifyListeners();
        servicePollStatusAsyncInternalImplementation(); // Initial poll
      } else {
        throw new Error(data.error || `Call initiation failed: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error("[ServicePolling] Error in initiateCallAndPoll:", error);
      serviceCurrentPollingState.errorMessage = error.message || "Failed to initiate call via service.";
      serviceCurrentPollingState.isPolling = false; 
      serviceCurrentPollingState.activePollingCallSid = null; 
      serviceCurrentPollingState.currentPollOriginalOutreachId = null; 
      serviceCurrentPollingState.lastInitiatedCallSid = null;
      _serviceNotifyListeners();
    }
  }

  async manuallyFetchCallArtifacts(callSidToFetch?: string): Promise<void> {
    const sid = callSidToFetch || serviceCurrentPollingState.lastInitiatedCallSid;
    if (!sid) {
      serviceCurrentPollingState.errorMessage = "No Call SID available for manual fetch.";
      _serviceNotifyListeners();
      return;
    }
    
    const originalOutreachIdContextForFetch = (sid === serviceCurrentPollingState.activePollingCallSid) 
        ? serviceCurrentPollingState.currentPollOriginalOutreachId 
        : null; 

    if (serviceCurrentPollingState.isPolling && serviceCurrentPollingState.activePollingCallSid === sid) {
      _serviceClearPollingInterval();
      serviceCurrentPollingState.isPolling = false; 
      serviceCurrentPollingState.statusMessage = "Polling stopped for manual fetch.";
      _serviceNotifyListeners(); 
    }
    // _serviceFetchAndStoreArtifacts will handle resetting activePollingCallSid if it matches sid
    await _serviceFetchAndStoreArtifacts(sid, originalOutreachIdContextForFetch);
  }
}

// ============================================================================
// WORKFLOW ORCHESTRATION AGENT
// ============================================================================

// Define a type for the progress update callback
export type ProgressUpdateCallback = (progress: { 
  stageId: 'campaign' | 'discovery' | 'scoring' | 'outreach' | 'complete'; // Corresponds to WorkflowStep id
  status: 'running' | 'completed';
  duration?: number; // in milliseconds
  error?: string; // Optional error message for a stage
}) => void;

class WorkflowOrchestrationAgent {
  private campaignAgent = new CampaignBuildingAgent();
  private discoveryAgent = new CreatorDiscoveryAgent();
  private scoringAgent = new MatchingScoringAgent();
  private outreachAgent = new OutreachAgent();
  // This is an internal instance for the orchestrator's full workflow.
  // The UI uses the separately exported negotiationAgentService for direct interaction.
  private negotiationAgentInternal = new NegotiationAgent(); 

  async executeFullWorkflow(
    requirements: BusinessRequirements,
    onProgress?: ProgressUpdateCallback // Add the callback parameter
  ): Promise<AgentWorkflowResult> {
    console.log("🚀 Workflow Orchestrator (FE): Entered executeFullWorkflow. Requirements:", JSON.stringify(requirements, null, 2));
    const overallStartTime = Date.now();
    const initialGlobalCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
    console.log(`🚀 Workflow Orchestrator (FE): Initial global calls remaining: ${initialGlobalCalls}`);
      
    let generatedCampaign: GeneratedCampaign | undefined = undefined; // Initialize to undefined
    let discoveredCreators: Creator[] = [];
    let creatorMatches: CreatorMatch[] = [];
    let outreachSummary: OutreachSummary | undefined = undefined;

    try {
      // Stage 1: Campaign Generation
      onProgress?.({ stageId: 'campaign', status: 'running' });
      const campaignStartTime = Date.now();
      generatedCampaign = await this.campaignAgent.generateCampaign(requirements);
      const campaignDuration = Date.now() - campaignStartTime;
      onProgress?.({ stageId: 'campaign', status: 'completed', duration: campaignDuration });
      console.log(`🚀 Workflow Orchestrator (FE): Step 1 (Campaign Generation) COMPLETE. Title: ${generatedCampaign.title} (using ${generatedCampaign.agentVersion.includes('fallback') ? 'Fallback' : 'AI'}) Time: ${campaignDuration}ms`);
      console.log("🚀 Workflow Orchestrator (FE): Generated Campaign Object (from backend, includes DB ID):", JSON.stringify(generatedCampaign, null, 2));

      // Ensure generatedCampaign has an ID, as it's critical for next steps.
      if (!generatedCampaign || !generatedCampaign.id) {
        console.error("❌🚀 Workflow Orchestrator (FE): CRITICAL - generatedCampaign.id is missing after campaign generation from backend/fallback.");
        onProgress?.({ stageId: 'campaign', status: 'completed', error: "Campaign ID missing after generation." });
        // Halt workflow if campaign ID is missing
        throw new Error("Campaign ID is missing after generation step. Cannot proceed.");
      }
      const actualCampaignId = generatedCampaign.id; // This ID comes from the backend or fallback.
      console.log(`✅🚀 Workflow Orchestrator (FE): Using Campaign ID for subsequent steps: ${actualCampaignId}`);


      // Stage 2: Creator Discovery
      onProgress?.({ stageId: 'discovery', status: 'running' });
      const discoveryStartTime = Date.now();
      discoveredCreators = await this.discoveryAgent.findCreators(generatedCampaign, requirements.targetInfluencerDescription );
      const discoveryDuration = Date.now() - discoveryStartTime;
      onProgress?.({ stageId: 'discovery', status: 'completed', duration: discoveryDuration });
      console.log(`🚀 Workflow Orchestrator (FE): Step 2 (Discovery) COMPLETE. Found ${discoveredCreators.length} potential creators. Time: ${discoveryDuration}ms`);
      console.log("🚀 Workflow Orchestrator (FE): Discovered Creators (first 3):", JSON.stringify(discoveredCreators.slice(0,3), null, 2));

      if (discoveredCreators.length === 0) {
        console.warn("🚀 Workflow Orchestrator (FE): Workflow Halted at Discovery - No creators discovered. Cannot proceed to scoring or outreach.");
        // Mark subsequent steps as effectively skipped (or error if that's more appropriate)
        onProgress?.({ stageId: 'scoring', status: 'completed', duration: 0, error: "Skipped - No creators found" });
        onProgress?.({ stageId: 'outreach', status: 'completed', duration: 0, error: "Skipped - No creators found" });
        onProgress?.({ stageId: 'complete', status: 'completed', duration: 0 });

        return {
            generatedCampaign,
            creatorMatches: [],
            outreachSummary: { totalSent: 0, aiGenerated: 0, templateBased: 0, failed: 0, outreaches: [] },
            workflowInsights: {
                totalProcessingTime: Date.now() - overallStartTime,
                agentsUsed: ['CampaignBuilder', 'CreatorDiscovery'],
                confidenceScore: 0.3, 
                recommendedNextSteps: ["Widen campaign criteria (niches, platforms)", "Try a broader search query for creators"]
            }
        };
      }
      
      // Stage 3: Matching & Scoring
      onProgress?.({ stageId: 'scoring', status: 'running' });
      const scoringStartTime = Date.now();
      creatorMatches = await this.scoringAgent.scoreCreators(generatedCampaign, discoveredCreators);
      const scoringDuration = Date.now() - scoringStartTime;
      onProgress?.({ stageId: 'scoring', status: 'completed', duration: scoringDuration });
      console.log(`🚀 Workflow Orchestrator (FE): Step 3 (Scoring) COMPLETE. Scored ${creatorMatches.length} creators. Time: ${scoringDuration}ms`);
      console.log("🚀 Workflow Orchestrator (FE): Creator Matches (first 3):", JSON.stringify(creatorMatches.slice(0,3), null, 2));
      
      // Stage 4: Outreach
      onProgress?.({ stageId: 'outreach', status: 'running' });
      const outreachStartTime = Date.now();
      
      // MODIFIED: Use actualCampaignId directly (which is generatedCampaign.id)
      if (!actualCampaignId) { 
        console.error("❌🚀 Workflow Orchestrator (FE): CRITICAL - actualCampaignId is somehow missing before outreach step (should have been caught earlier).");
        outreachSummary = { totalSent: 0, aiGenerated: 0, templateBased: 0, failed: 1, outreaches: [{ creator: {} as Creator, subject: "Campaign ID Error", message: "Actual Campaign ID from DB missing", status: 'failed', method: 'template_based', timestamp: new Date()}] };
        onProgress?.({ stageId: 'outreach', status: 'completed', duration: 0, error: "Actual Campaign ID missing for outreach" });
      } else {
        outreachSummary = await this.outreachAgent.executeOutreach(generatedCampaign, creatorMatches.slice(0, requirements.outreachCount), requirements, actualCampaignId); 
      }
      const outreachDuration = Date.now() - outreachStartTime;
      onProgress?.({ stageId: 'outreach', status: 'completed', duration: outreachDuration });
      console.log(`🚀 Workflow Orchestrator (FE): Step 4 (Outreach) COMPLETE. Messages considered: ${outreachSummary?.outreaches?.length || 0}, Sent successfully: ${outreachSummary?.totalSent || 0}. Time: ${outreachDuration}ms`);
      console.log("🚀 Workflow Orchestrator (FE): Outreach Summary Object received by orchestrator:", JSON.stringify(outreachSummary, null, 2));

      const processingTime = Date.now() - overallStartTime;
      const finalGlobalCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
      const callsUsedThisWorkflow = initialGlobalCalls - finalGlobalCalls;
      console.log(`🚀 Workflow Orchestrator (FE): Workflow complete. Total time: ${processingTime}ms. API calls used this run: ${callsUsedThisWorkflow}`);
      
      onProgress?.({ stageId: 'complete', status: 'completed', duration: 0 });


      return {
        generatedCampaign,
        creatorMatches,
        outreachSummary, // This can be undefined if an error happened before outreach
        workflowInsights: {
          totalProcessingTime: processingTime,
          agentsUsed: ['CampaignBuilder', 'CreatorDiscovery', 'MatchingScoring', 'Outreach'],
          confidenceScore: Math.min(0.95, (generatedCampaign.confidence + (creatorMatches.length > 0 && creatorMatches.reduce((s,m)=>s+(m.score||0),0) > 0 ? (creatorMatches.reduce((s,m)=>s+(m.score||0),0)/creatorMatches.length/100) : 0.5))/2 + (callsUsedThisWorkflow > 0 ? 0.1 : 0) ),
          recommendedNextSteps: [
            `Review ${outreachSummary ? outreachSummary.totalSent : 0} outreaches.`,
            "Monitor responses for negotiation.", 
            `Frontend API calls used: ${callsUsedThisWorkflow}`
          ]
        }
      };

    } catch (error: any) {
      console.error("❌🚀 Workflow Orchestrator (FE): CRITICAL ERROR within executeFullWorkflow:", error);
      // Try to determine which stage failed for better progress reporting
      // This is a simplification; more robust stage tracking might be needed
      if (!generatedCampaign) onProgress?.({ stageId: 'campaign', status: 'completed', error: error.message });
      else if (discoveredCreators.length === 0 && !creatorMatches.length) onProgress?.({ stageId: 'discovery', status: 'completed', error: error.message });
      else if (!creatorMatches.length) onProgress?.({ stageId: 'scoring', status: 'completed', error: error.message });
      else onProgress?.({ stageId: 'outreach', status: 'completed', error: error.message });
      
      onProgress?.({ stageId: 'complete', status: 'completed', error: 'Workflow failed' });
      throw error; 
    }
  }

  // Method to access the internal negotiation agent if needed by other parts of aiAgentsService
  // However, the UI should primarily use the exported `negotiationAgentService`.
  getInternalNegotiationAgent(): NegotiationAgent { return this.negotiationAgentInternal; }

  isAvailable(): boolean {
    // A simple check, e.g., if a master API key for the orchestration features is set.
    // For now, let's assume it checks if the Groq API key (used by backend) might be generally available.
    // This is a placeholder; a more robust check for VITE_GROQ_API_KEY could be implemented if needed for frontend logic.
    return import.meta.env.VITE_GROQ_API_KEY ? true : false;
  }

  getRateLimitStatus(): { campaign: boolean; discovery: boolean; scoring: boolean; remaining: number } {
    const rem = GlobalRateLimiter.getInstance().getRemainingCalls(); 
    // Simplified: assuming each agent part of workflow might need a call
    return { campaign: rem > 2, discovery: rem > 1, scoring: rem > 0, remaining: rem };
  }
  
  getGlobalStatus(): { remaining: number; total: number; resetTime: number } {
    const limiter = GlobalRateLimiter.getInstance();
    return {
        remaining: limiter.getRemainingCalls(), 
        total: limiter.maxRequests, 
        resetTime: Date.now() + 60000 // Approximate reset, actual logic is in GlobalRateLimiter
    };
  }
}

export const aiAgentsService = new WorkflowOrchestrationAgent();

export const createExampleRequirements = (): BusinessRequirements => ({
  companyName: 'Innovatech Solutions',
  industry: ['Technology'],
  productService: 'Cloud-based AI Analytics Platform',
  businessGoals: ['Generate B2B leads', 'Increase enterprise demo requests by 20%'],
  campaignAudienceDescription: 'CTOs, VPs of Engineering, Data Science Managers in mid-to-large enterprises',
  targetInfluencerDescription: 'Tech-savvy YouTubers with 10k+ followers interested in AI, Big Data, Cloud Solutions',
  campaignObjective: ['Drive sign-ups for our upcoming webinar on AI in Finance.'],
  keyMessage: "Unlock financial insights with Innovatech's next-gen AI analytics.",
  budgetRange: { min: 100000, max: 500000 },
  timeline: '4 weeks until webinar',
  preferredPlatforms: ['linkedin', 'twitter'],
  contentTypes: ['Thought leadership articles', 'Webinar promotion posts', 'Short video explainers'],
  specialRequirements: 'Focus on creators with strong LinkedIn presence and case studies in finance.',
  outreachCount: 5,
  personalizedOutreach: true,
  locations: ['India'],
}); 

// Export the instance of the negotiation agent service (this was the last line before)
export const negotiationAgentService = new NegotiationAgent();
