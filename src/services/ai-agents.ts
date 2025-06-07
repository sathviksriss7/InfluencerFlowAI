import { supabase } from '../lib/supabase'; 
import { outreachStorage, type StoredOutreach, type ConversationMessage } from './outreach-storage';
import { type Creator, type Campaign as CoreCampaign } from '../types'; // Renamed Campaign to CoreCampaign to avoid conflict
import { mockCreators } from '../mock-data/creators';

// ============================================================================
// AI AGENT SPECIFIC TYPE DEFINITIONS (Restored/Defined here)
// ============================================================================

export interface BusinessRequirements {
  companyName: string; industry: string; productService: string; businessGoals: string[];
  targetAudience: string; demographics?: string; campaignObjective: string; keyMessage?: string;
  budgetRange: { min: number; max: number; }; timeline: string; preferredPlatforms?: string[];
  contentTypes?: string[]; specialRequirements?: string; outreachCount: number; personalizedOutreach: boolean;
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
    console.log('🤖 CB Agent (FE): Generating local fallback campaign.');
    const startDate = new Date(); startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate); endDate.setDate(endDate.getDate() + 30);
    const deadline = new Date(startDate); deadline.setDate(deadline.getDate() - 3);
    const finalPlatforms = requirements.preferredPlatforms?.slice(0, 2) || ['instagram', 'youtube'];
    const suggestedNiches = [requirements.industry?.toLowerCase() || 'general', 'lifestyle'];
    return {
      title: `${requirements.companyName} Fallback Campaign (FE)`,
      brand: requirements.companyName,
      description: `Local fallback: Campaign for ${requirements.productService}`,
      brief: `Local fallback brief for ${requirements.companyName}. Target: ${requirements.targetAudience}. Objective: ${requirements.campaignObjective}`,
      platforms: finalPlatforms, minFollowers: 10000, niches: suggestedNiches, locations: ['India'], deliverables: ['1 Post', '2 Stories'],
      budgetMin: Math.floor(requirements.budgetRange.min * 0.7), budgetMax: Math.floor(requirements.budgetRange.max * 0.8),
      startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0], applicationDeadline: deadline.toISOString().split('T')[0],
      aiInsights: { strategy: `Local FE fallback strategy. Focus on ${finalPlatforms.join(', ')}.`, reasoning: 'Local fallback used.', successFactors: ['Clear CTA', 'Relevant Content'], potentialChallenges: ['Generic messaging'], optimizationSuggestions: ['Customize heavily'] },
      confidence: 0.35, agentVersion: 'campaign-builder-fallback-fe-v1.3', generatedAt: new Date()
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
            industry: requirements.industry,
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
    console.log(`💾 OutreachAgent (Core): Saving outreach for ${creator.name} (failed: ${isFailure}, method: ${methodUsed})`);
    try {
      const initialMessage: ConversationMessage = {
        id: `msg-${Date.now()}-core-outreach-${creator.id}`,
        content: message,
        sender: 'brand',
        timestamp: new Date(),
        type: 'outreach',
        metadata: { 
            aiMethod: methodUsed as ('ai_generated' | 'algorithmic_fallback' | undefined),
            ...(isFailure && { errorInfo: "Generation via backend failed" }) 
        }
      };
      outreachStorage.saveOutreach({
        id: `core-auto-${Date.now()}-${creator.id}`,
        creatorId: creator.id, creatorName: creator.name, creatorAvatar: creator.avatar, creatorPlatform: creator.platform,
        subject, body: message, 
        status: isFailure ? 'pending' : 'contacted',
        confidence: isFailure ? 0 : (methodUsed === 'ai_generated' ? 85 : 60), 
        reasoning: isFailure ? 'Failed to generate/process outreach via backend (Core)' : `Outreach ${methodUsed || 'processed'} via backend service (Core)`,
        keyPoints: isFailure ? ['Backend processing error (Core)'] : [`Processed by backend (${methodUsed}) (Core)`],
        nextSteps: isFailure ? ['Manual review needed (Core)'] : ['Await creator response', 'Monitor for engagement'],
        brandName: campaign.brand, campaignContext: campaign.title,
        createdAt: new Date(), lastContact: new Date(), 
        notes: isFailure ? `Core: Failed for ${creator.name}.` : `Core: Initial outreach for ${creator.name} (${methodUsed}).`, 
        conversationHistory: [initialMessage] 
      });
    } catch (error) {
      console.error('Failed to save outreach to storage (Core OutreachAgent):', error);
    }
  }
  // Local/direct AI/template generation methods are removed as backend handles this.
}

// ============================================================================
// NEGOTIATION AGENT
// ============================================================================
class NegotiationAgent {
  async generateNegotiationStrategy(outreach: StoredOutreach): Promise<NegotiationResult> {
    console.log("🚀 FE: NegotiationAgent.generateNegotiationStrategy calling backend");
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/negotiation/generate-strategy`;
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
        throw new Error(errResp.error); 
      }
      const backendResponse: NegotiationResult = await response.json(); // Type assertion
      if (!backendResponse.success || !backendResponse.insight) throw new Error(backendResponse.error || 'Invalid insight data from backend');
      console.log('✅ FE: NegotiationAgent received strategy from backend:', backendResponse.method);
      return backendResponse;
    } catch (error) {
      console.error('❌ FE NegotiationAgent: Error calling backend, using local fallback.', error);
      return { success: false, insight: this.generateLocalFallbackStrategy(outreach), method: 'algorithmic_fallback', error: (error as Error).message };
    }
  }

  private generateLocalFallbackStrategy(outreach: StoredOutreach): NegotiationInsight {
    console.log(`🤖 FE NegotiationAgent: Generating LOCAL FALLBACK strategy for ${outreach.status} stage.`);
    const baseOffer = outreach.currentOffer || 10000;
    if (outreach.status === 'interested') return { currentPhase: 'initial_interest', suggestedResponse: `Local Fallback (Interested): Hi ${outreach.creatorName}, let's discuss our exciting campaign!`, negotiationTactics: ["local_fallback", "emphasize_value"], recommendedOffer: {amount: Math.round(baseOffer * 1.1), reasoning: "Local fallback offer"}, nextSteps: ["Schedule call", "Send brief"] };
    else if (outreach.status === 'negotiating') return { currentPhase: 'price_discussion', suggestedResponse: `Local Fallback (Negotiating): Hi ${outreach.creatorName}, let's work on the terms.`, negotiationTactics: ["local_fallback", "find_common_ground"], recommendedOffer: {amount: Math.round(baseOffer * 1.05), reasoning: "Local fallback offer adjustment"}, nextSteps: ["Clarify points", "Propose alternatives"] };
    else return { currentPhase: 'closing', suggestedResponse: `Local Fallback (Closing): Hi ${outreach.creatorName}, glad we're moving forward!`, negotiationTactics: ["local_fallback", "confirm_details"], recommendedOffer: {amount: baseOffer, reasoning: "Local fallback final offer"}, nextSteps: ["Prepare contract", "Outline next steps"] };
  }
  
  getEligibleForNegotiation(): StoredOutreach[] { return outreachStorage.getAllOutreaches().filter(o => o.status !== 'deal_closed' && o.status !== 'declined' && o.status !== 'pending' && o.status !== 'contacted'); }
  getPositiveResponseCreators(): StoredOutreach[] { return outreachStorage.getAllOutreaches().filter(o => ['interested', 'negotiating', 'deal_closed'].includes(o.status)); }
  
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
      const sender: ConversationMessage['sender'] = insight && method === 'ai_generated' ? 'ai' : 'brand';
      
      outreachStorage.addConversationMessage(outreachId, message, sender, messageType, 
        insight ? { 
          aiMethod: method,
          strategy: insight.currentPhase,
          tactics: insight.negotiationTactics,
          suggestedOffer: insight.recommendedOffer.amount,
          phase: insight.currentPhase 
        } : undefined
      );
      outreachStorage.updateOutreachStatus(outreachId, 'negotiating', undefined, suggestedOffer);
      return true;
    } catch (error) {
      console.error('Error updating outreach in NegotiationAgent:', error); 
      return false; 
    }
  }
  isAvailable(): boolean { return true; } 
  getRateLimitStatus(): { remaining: number; canMakeRequest: boolean } { 
    const globalStatus = GlobalRateLimiter.getInstance().getRemainingCalls();
    return { remaining: globalStatus, canMakeRequest: globalStatus > 0 };
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
  private negotiationAgent = new NegotiationAgent();

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

  getNegotiationAgent(): NegotiationAgent { return this.negotiationAgent; }
  isAvailable(): boolean { return true; } 
  getRateLimitStatus(): { campaign: boolean; discovery: boolean; scoring: boolean; remaining: number } { 
    const rem = GlobalRateLimiter.getInstance().getRemainingCalls(); 
    return { campaign: rem>0, discovery: rem>0, scoring: rem>0, remaining: rem };
  }
  getGlobalStatus(): { remaining: number; total: number; resetTime: number } {
    return { remaining: GlobalRateLimiter.getInstance().getRemainingCalls(), total: GlobalRateLimiter.getInstance().maxRequests, resetTime: Date.now() + 60000 };
  }
}

export const aiAgentsService = new WorkflowOrchestrationAgent();
export const negotiationAgentService = aiAgentsService.getNegotiationAgent(); 

export const createExampleRequirements = (): BusinessRequirements => ({
  companyName: 'Innovatech Solutions',
  industry: 'Technology',
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

// Ensure BrandInfo type definition is present if used here, or imported correctly.
// For this edit, assuming BrandInfo is part of the imported ../types or defined globally.
interface BrandInfo {
  name: string;
  industry: string;
  campaignGoals: string[];
  budget: { min: number; max: number; currency: string; };
  timeline: string;
  contentRequirements: string[];
} 