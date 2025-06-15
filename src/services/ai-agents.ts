import { supabase } from '../lib/supabase'; 
import { outreachStorage, type StoredOutreach, type ConversationMessage } from './outreach-storage';
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

const _serviceGetAllOutreachesFromStorage = (): StoredOutreach[] => {
  try {
    if (outreachStorage && typeof outreachStorage.getAllOutreaches === 'function') {
      return outreachStorage.getAllOutreaches();
    }
    console.warn("[ServicePolling] outreachStorage.getAllOutreaches is not available. Returning empty array.");
    return [];
  } catch (e) {
    console.error("[ServicePolling] Error calling outreachStorage.getAllOutreaches():", e);
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
      serviceCurrentPollingState.fetchedArtifactsForLastCall = data.details as CallArtifactsForService;
      serviceCurrentPollingState.statusMessage = "Call details fetched.";

      const outreachIdFromBackendDetails = data.details.outreach_id;
      // Prioritize original context, then backend, then SID itself as a last resort for ID.
      const outreachIdToUpdate = originalOutreachIdContext || outreachIdFromBackendDetails || callSidToFetch;
      
      const allOutreaches = _serviceGetAllOutreachesFromStorage();
      let targetOutreach = allOutreaches.find((o: StoredOutreach) => o.id === outreachIdToUpdate);

      if (targetOutreach) {
        const existingHistory = targetOutreach.conversationHistory || [];
        const historyWithoutThisCall = existingHistory.filter((msg: ConversationMessage) => msg.metadata?.call_sid !== callSidToFetch);
        
        const callTurns: Array<{ speaker: string, text: string }> = [];
        if (data.details.conversation_history && Array.isArray(data.details.conversation_history)) {
          data.details.conversation_history.forEach((turn: any) => {
            callTurns.push({
              speaker: turn.speaker || (turn.sender === 'creator' ? 'user' : 'ai'),
              text: turn.text || "[empty message]",
            });
          });
        }

        let newHistory = [...historyWithoutThisCall];
        if (callTurns.length > 0 || data.details.full_recording_url) {
          const summaryMsg: ConversationMessage = {
            id: `vcs-${callSidToFetch}-${Date.now()}`,
            content: `Voice call (SID: ${callSidToFetch}).${callTurns.length > 0 ? ` ${callTurns.length} turn(s) transcribed.` : ''}`,
            sender: 'ai', // Corrected sender type
            type: 'voice_call_summary',
            timestamp: new Date(),
            metadata: {
              call_sid: callSidToFetch,
              full_recording_url: data.details.full_recording_url,
              full_recording_duration: data.details.full_recording_duration,
              turns: callTurns,
            }
          };
          newHistory.push(summaryMsg);
        }
        
        const updatedOutreach = { ...targetOutreach, conversationHistory: newHistory, lastContact: new Date() };
        outreachStorage.saveOutreach(updatedOutreach);
        serviceCurrentPollingState.outreachDataUpdated = true; // Signal UI to refresh outreach data
        console.log(`[ServicePolling] Outreach ${outreachIdToUpdate} updated with call history.`);
      } else {
        console.warn(`[ServicePolling] Details fetched, but outreach ${outreachIdToUpdate} not found. Cannot save history.`);
        serviceCurrentPollingState.errorMessage = `Details fetched, but outreach ${outreachIdToUpdate} not found to save history.`;
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
  industry: string[]; // MODIFIED from string to string[]
  productService: string;
  businessGoals: string[];
  targetAudience: string;
  demographics?: string; 
  campaignObjective: string;
  keyMessage?: string;
  budgetRange: { min: number; max: number; }; 
  timeline: string;
  preferredPlatforms?: string[];
  contentTypes?: string[];
  specialRequirements?: string;
  outreachCount: number; 
  personalizedOutreach: boolean;
}

export interface GeneratedCampaign { // This is what CampaignBuildingAgent produces
  title: string; brand: string; description: string; brief: string; platforms: string[];
  minFollowers: number; niches: string[]; locations: string[]; deliverables: string[];
  budgetMin: number; budgetMax: number; startDate: string; endDate: string; applicationDeadline: string;
  aiInsights: { strategy: string; reasoning: string; successFactors: string[]; potentialChallenges: string[]; optimizationSuggestions: string[]; };
  confidence: number; agentVersion: string; generatedAt: Date | string; // Allow string for data from backend, convert to Date in FE
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
      const campaignData = backendResponse.campaign as GeneratedCampaign; // Type assertion
      return {
        ...campaignData,
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
    const startDate = now.toISOString().split('T')[0];
    const endDate = new Date(now.setDate(now.getDate() + 30)).toISOString().split('T')[0];
    const appDeadline = new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0]; // App deadline 1 week before start

    // Handle industry array for fallback
    const industryText = requirements.industry && requirements.industry.length > 0 
      ? requirements.industry.join(', ') 
      : 'General';

    return {
      title: `Exciting Campaign for ${requirements.companyName}`,
      brand: requirements.companyName,
      description: `A dynamic campaign focusing on ${requirements.productService} for the ${industryText} sector. We aim to ${requirements.businessGoals.join(', ')}. Target audience: ${requirements.targetAudience}`,
      brief: `Campaign Objective: ${requirements.campaignObjective}. Key Message: ${requirements.keyMessage || 'Experience the best!'}. Platforms: ${(requirements.preferredPlatforms || []).join(', ')}. Content: ${(requirements.contentTypes || []).join(', ')}. Special Notes: ${requirements.specialRequirements || 'None'}`,
      platforms: requirements.preferredPlatforms || ['instagram', 'youtube'],
      minFollowers: 5000,
      niches: requirements.industry && requirements.industry.length > 0 ? [...requirements.industry] : ['general interest'],
      locations: ['Global'],
      deliverables: ['1 Instagram Post', '2 Instagram Stories'],
      budgetMin: requirements.budgetRange.min || 500,
      budgetMax: requirements.budgetRange.max || 2500,
      startDate: startDate,
      endDate: endDate,
      applicationDeadline: appDeadline,
      aiInsights: {
        strategy: "Standard engagement strategy. Focus on clear calls to action and visually appealing content.",
        reasoning: "Fallback strategy due to API limitations or errors. Provides a basic but functional campaign structure.",
        successFactors: ["Consistent posting", "Audience interaction"],
        potentialChallenges: ["Lower organic reach", "Generic messaging"],
        optimizationSuggestions: ["Boost posts with paid ads", "Run contests or giveaways"]
      },
      confidence: 0.4,
      agentVersion: 'local_fallback_v1.1',
      generatedAt: new Date(),
    };
  }
}

// ============================================================================
// CREATOR DISCOVERY AGENT
// ============================================================================
class CreatorDiscoveryAgent {
  async findCreators(campaign: GeneratedCampaign, searchQuery?: string): Promise<Creator[]> {
    console.log('🔍 CD Agent (FE): Starting discovery. Will call backend for query analysis.');
    let effectiveSearchQuery = searchQuery || this.generateSearchQueryFromCampaign(campaign);
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/creator/analyze-query`;
    let analysisResult: BackendQueryAnalysis | null = null;
    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('CreatorDiscoveryAgent');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error('No Supabase session for CreatorDiscoveryAgent backend call.');
      
      const payload = { query: effectiveSearchQuery, campaignContext: {title: campaign.title, niches: campaign.niches, platforms: campaign.platforms } };
      const response = await fetch(backendApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(payload)
      });
      if (!response.ok) { 
        const errResp = await response.json().catch(()=>({error: `Backend error: ${response.status} ${response.statusText}`})); 
        throw new Error(errResp.error);
      }
      const backendResponse: BackendQueryAnalysisResponse = await response.json();
      if (backendResponse.success && backendResponse.analysis) {
        analysisResult = backendResponse.analysis;
        console.log(`✅ CD Agent (FE): Query analysis from backend (${backendResponse.method}). Intent: ${analysisResult.intent}`);
      } else {
        throw new Error(backendResponse.error || 'Invalid analysis from backend for creator discovery');
      }
    } catch (error) {
      console.error('❌ CD Agent (FE): Error calling backend for query analysis, using local fallback.', error);
      analysisResult = this.localFallbackQueryAnalysis(effectiveSearchQuery);
    }
    if (!analysisResult) analysisResult = this.localFallbackQueryAnalysis("general influencer search (critical fallback)");
    
    console.log('📝 CD Agent (FE): Filtering mockCreators with analysis:', analysisResult.extractedCriteria);
    return this.filterMockCreatorsWithAnalysis(mockCreators, analysisResult, campaign);
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
    requirements: BusinessRequirements
  ): Promise<OutreachSummary> {
    console.log(`📧 Outreach Agent (Core Workflow): Preparing to contact top ${requirements.outreachCount} creators via direct backend call.`);
    
    const topCreators = creatorMatches
      .filter(match => 
        match.recommendedAction === 'highly_recommend' || 
        match.recommendedAction === 'recommend' || 
        match.recommendedAction === 'consider'
      )
      .slice(0, requirements.outreachCount);
    
    if (topCreators.length === 0) {
      console.log('⚠️ Outreach Agent (Core Workflow): No qualified creators found for outreach.');
      return { totalSent: 0, aiGenerated: 0, templateBased: 0, failed: 0, outreaches: [] };
    }
    
    console.log(`🎯 Outreach Agent (Core Workflow): Selected ${topCreators.length} top creators.`);
    
    const outreachResults: OutreachResult[] = [];
    let aiGeneratedCount = 0;
    let templateBasedCount = 0;
    let failedCount = 0;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('❌ Outreach Agent (Core Workflow): No Supabase session for backend calls.', sessionError);
      topCreators.forEach(match => {
        outreachResults.push({ creator: match.creator, subject: 'Auth Error', message: 'User not authenticated for backend outreach.', status: 'failed', method: 'template_based', timestamp: new Date()});
        failedCount++;
      });
      return { totalSent: 0, aiGenerated: 0, templateBased: 0, failed: failedCount, outreaches: outreachResults }; 
    }
    const supabaseAccessToken = session.access_token;
    
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    // Using the /api/outreach/initial-message as it's designed for the first contact by an agent.
    // The backend can internally decide AI vs template based on 'personalizedOutreach' in requirements.
    const backendApiUrl = `${baseBackendUrl}/api/outreach/initial-message`; 
    
    for (const match of topCreators) {
      try {
        await GlobalRateLimiter.getInstance().waitIfNeeded('OutreachAgent.executeOutreach');
        
        const brandInfo: BrandInfo = {
            name: campaign.brand,
            industry: requirements.industry.join(', ') || 'General',
            campaignGoals: requirements.businessGoals,
            budget: { 
                min: campaign.budgetMin, 
                max: campaign.budgetMax, 
                currency: "INR" 
            },
            timeline: requirements.timeline,
            contentRequirements: campaign.deliverables || [] 
        };

        const payload = {
          creator: match.creator,
          brandInfo: brandInfo, 
          campaignContext: campaign.title, 
        };

        console.log(`📤 Outreach Agent (Core): Req for ${match.creator.name}. Token: ${supabaseAccessToken ? supabaseAccessToken.substring(0, 20) + '...' : 'MISSING!'}`);
        const response = await fetch(backendApiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${supabaseAccessToken}` 
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errResp = await response.json().catch(()=>({error: `Backend HTTP error ${response.status}`})); 
          console.error(`❌ Outreach Agent (Core): Backend error for ${match.creator.name}:`, errResp.error);
          throw new Error(errResp.error || `Backend request failed: ${response.statusText}`);
        }

        const backendResponse = await response.json(); // Expects { success, subject, message, method, reasoning?, keyPoints?, nextSteps?, confidence?, error? }
        if (!backendResponse.success || !backendResponse.subject || !backendResponse.message) {
          throw new Error(backendResponse.error || 'Invalid message data from backend for initial outreach');
        }
        
        const { subject, message, method } = backendResponse;

        if (method === 'ai_generated') aiGeneratedCount++;
        else templateBasedCount++;
        
        await this.saveOutreach(campaign, match.creator, subject, message, false, method as 'ai_generated' | 'template_based');
          
          outreachResults.push({
            creator: match.creator,
          subject,
          message,
            status: 'sent',
          method: method as 'ai_generated' | 'template_based',
            timestamp: new Date()
          });
        console.log(`✅ Outreach for ${match.creator.name} processed directly by backend (${method}) & saved.`);
        
      } catch (error) {
        failedCount++;
        console.error(`❌ Outreach Agent (Core Workflow): Error processing outreach for ${match.creator.name}:`, error);
        await this.saveOutreach(campaign, match.creator, "Error: Outreach Generation Failed (Core)", "Could not generate outreach message via backend. Manual review needed.", true, 'template_based');
        outreachResults.push({ creator: match.creator, subject: "Generation Error (Core)", message: "Failed to generate", status: 'failed', method: 'template_based', timestamp: new Date()});
      }
    }
    
    const summary: OutreachSummary = {
      totalSent: outreachResults.filter(r => r.status === 'sent').length,
      aiGenerated: aiGeneratedCount,
      templateBased: templateBasedCount,
      failed: failedCount,
      outreaches: outreachResults
    };
    
    console.log(`📊 Outreach Agent (Core Workflow) Summary: ${summary.totalSent} sent (${summary.aiGenerated} AI, ${summary.templateBased} template, ${summary.failed} failed).`);
    return summary;
  }

  private async saveOutreach(campaign: GeneratedCampaign, creator: Creator, subject: string, message: string, isFailure: boolean = false, methodUsed?: string): Promise<void> {
    try {
      const newOutreach: StoredOutreach = {
        id: `outreach-${creator.id}-${Date.now()}`,
        creatorId: creator.id,
        creatorName: creator.name,
        creatorAvatar: creator.avatar || '',
        creatorPlatform: creator.platform,
        creatorPhoneNumber: undefined,
        subject: subject,
        body: message,
        status: isFailure ? 'pending' : 'contacted',
        confidence: 0,
        reasoning: methodUsed || 'Direct outreach',
        keyPoints: [],
        nextSteps: [],
        brandName: campaign.brand,
        campaignContext: campaign.brief,
        createdAt: new Date(),
        lastContact: new Date(),
        notes: isFailure ? `Failed to send outreach via ${methodUsed || 'unknown method'}` : `Initial outreach sent via ${methodUsed || 'AI'}.`,
        conversationHistory: [],
      };
      outreachStorage.saveOutreach(newOutreach);
      console.log(`[OutreachAgent] Outreach for ${creator.name} saved.`);
    } catch (error) {
      console.error(`[OutreachAgent] Error saving outreach for ${creator.name}:`, error);
    }
  }
  // Local/direct AI/template generation methods are removed as backend handles this.
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
    // Assuming outreachStorage.getConversationContext exists and is correct
    const conversationContext = outreachStorage.getConversationContext(outreach.id); 
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
  getEligibleForNegotiation(): StoredOutreach[] { 
    const allOutreaches = _serviceGetAllOutreachesFromStorage();
    return allOutreaches.filter((o: StoredOutreach) => 
      o.status !== 'deal_closed' && o.status !== 'declined' && 
      o.status !== 'pending' && o.status !== 'contacted'
    ); 
  }

  // Corrected to use _serviceGetAllOutreachesFromStorage and typed parameters
  getPositiveResponseCreators(): StoredOutreach[] { 
    const allOutreaches = _serviceGetAllOutreachesFromStorage();
    return allOutreaches
      .filter((o: StoredOutreach) => ['interested', 'negotiating', 'deal_closed'].includes(o.status))
      .sort((a: StoredOutreach, b: StoredOutreach) => new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime());
  }
  
  // Preserved original logic, check if outreachStorage.addConversationMessage/updateOutreachStatus are still correct
  updateOutreachWithNegotiation(
    outreachId: string, 
    message: string, 
    suggestedOffer: number,
    insight?: NegotiationInsight, 
    method?: 'ai_generated' | 'algorithmic_fallback'
  ): boolean {
    console.log(`📝 FE NegotiationAgent: Updating outreach ${outreachId} via outreachStorage with new message.`);
    try {
      const messageType: ConversationMessage['type'] = insight ? 'negotiation' : 'update';
      // Sender is 'brand' if manually updated, 'ai' if AI insight is provided
      const sender: ConversationMessage['sender'] = (insight && method === 'ai_generated') ? 'ai' : 'brand'; 
      
      outreachStorage.addConversationMessage(outreachId, message, sender, messageType, 
        insight ? { 
          aiMethod: method,
          strategy: insight.currentPhase, // Assuming this aligns with your metadata needs
          tactics: insight.negotiationTactics,
          suggestedOffer: insight.recommendedOffer.amount,
          phase: insight.currentPhase 
        } : undefined
      );
      // Update overall status and offer
      outreachStorage.updateOutreachStatus(outreachId, 'negotiating', undefined, suggestedOffer);

      // If this update should reflect in components listening to polling state (e.g., for data refresh)
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
class WorkflowOrchestrationAgent {
  private campaignAgent = new CampaignBuildingAgent();
  private discoveryAgent = new CreatorDiscoveryAgent();
  private scoringAgent = new MatchingScoringAgent();
  private outreachAgent = new OutreachAgent();
  // This is an internal instance for the orchestrator's full workflow.
  // The UI uses the separately exported negotiationAgentService for direct interaction.
  private negotiationAgentInternal = new NegotiationAgent(); 

  async executeFullWorkflow(requirements: BusinessRequirements): Promise<AgentWorkflowResult> {
    console.log("🚀 Workflow Orchestrator (FE): Starting full agentic workflow...");
    const startTime = Date.now();
    const initialGlobalCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
      
      const generatedCampaign = await this.campaignAgent.generateCampaign(requirements);
    console.log(`Workflow Step 1 (Campaign): ${generatedCampaign.title} (using ${generatedCampaign.agentVersion.includes('fallback') ? 'Fallback' : 'AI'})`);

    const discoveredCreators = await this.discoveryAgent.findCreators(generatedCampaign, requirements.targetAudience );
    console.log(`Workflow Step 2 (Discovery): Found ${discoveredCreators.length} potential creators.`);

    if (discoveredCreators.length === 0) {
        console.warn("Workflow Halted: No creators discovered. Cannot proceed to scoring or outreach.");
        return {
            generatedCampaign,
            creatorMatches: [],
            outreachSummary: { totalSent: 0, aiGenerated: 0, templateBased: 0, failed: 0, outreaches: [] },
            workflowInsights: {
                totalProcessingTime: Date.now() - startTime,
                agentsUsed: ['CampaignBuilder', 'CreatorDiscovery'],
                confidenceScore: 0.3, 
                recommendedNextSteps: ["Widen campaign criteria (niches, platforms)", "Try a broader search query for creators"]
            }
        };
    }
      
      const creatorMatches = await this.scoringAgent.scoreCreators(generatedCampaign, discoveredCreators);
    console.log(`Workflow Step 3 (Scoring): Scored ${creatorMatches.length} creators.`);
      
      const outreachSummary = await this.outreachAgent.executeOutreach(generatedCampaign, creatorMatches, requirements);
    console.log(`Workflow Step 4 (Outreach): ${outreachSummary.totalSent} messages sent.`);

    // Example: Potentially use the internal negotiation agent for some automated follow-up insights
    // For now, it's not directly part of this simplified executeFullWorkflow
    // const negotiationInsights = await this.negotiationAgentInternal.getEligibleForNegotiation(); 
    // console.log(`Workflow Info: ${negotiationInsights.length} outreaches eligible for negotiation followup by internal agent.`);

    const processingTime = Date.now() - startTime;
    const finalGlobalCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
    const callsUsedThisWorkflow = initialGlobalCalls - finalGlobalCalls;

    return {
        generatedCampaign,
        creatorMatches,
        outreachSummary,
        workflowInsights: {
          totalProcessingTime: processingTime,
          agentsUsed: ['CampaignBuilder', 'CreatorDiscovery', 'MatchingScoring', 'Outreach'],
          confidenceScore: Math.min(0.95, (generatedCampaign.confidence + (creatorMatches.length > 0 ? (creatorMatches.reduce((s,m)=>s+(m.score||0),0)/creatorMatches.length/100) : 0.5))/2 + (callsUsedThisWorkflow > 0 ? 0.1 : 0) ),
          recommendedNextSteps: [`Review ${outreachSummary.totalSent} outreaches.`, "Monitor responses for negotiation.", `Frontend API calls used: ${callsUsedThisWorkflow}`]
        }
    };
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
  industry: ['Technology'], // MODIFIED to be an array
  productService: 'Cloud-based AI Analytics Platform',
  businessGoals: ['Generate B2B leads', 'Increase enterprise demo requests by 20%'],
  targetAudience: 'CTOs, VPs of Engineering, Data Science Managers in mid-to-large enterprises',
  demographics: 'Tech-savvy decision-makers, interested in AI, Big Data, Cloud Solutions',
  campaignObjective: 'Drive sign-ups for our upcoming webinar on AI in Finance.',
  keyMessage: 'Unlock financial insights with Innovatech\'s next-gen AI analytics.',
  budgetRange: { min: 100000, max: 500000 },
  timeline: '4 weeks until webinar',
  preferredPlatforms: ['linkedin', 'twitter'],
  contentTypes: ['Thought leadership articles', 'Webinar promotion posts', 'Short video explainers'],
  outreachCount: 5,
  personalizedOutreach: true,
  specialRequirements: 'Focus on creators with strong LinkedIn presence and case studies in finance.'
}); 

// Export the instance of the negotiation agent service (this was the last line before)
export const negotiationAgentService = new NegotiationAgent();
