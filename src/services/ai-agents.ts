import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { type Creator, type Campaign } from '../types';
import { mockCreators } from '../mock-data/creators';
import { groqLLMService } from './groq-llm';
import { outreachStorage } from './outreach-storage';

// ============================================================================
// RATE LIMITING & RETRY UTILITIES
// ============================================================================

class GlobalRateLimiter {
  private static instance: GlobalRateLimiter;
  private requests: number[] = [];
  private maxRequests: number = 3; // Very conservative: 3 requests per minute globally
  private timeWindow: number = 60000; // 1 minute

  static getInstance(): GlobalRateLimiter {
    if (!GlobalRateLimiter.instance) {
      GlobalRateLimiter.instance = new GlobalRateLimiter();
    }
    return GlobalRateLimiter.instance;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Remove requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    // If we're at the limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest) + 2000; // Add 2s buffer
      console.log(`⏳ Global rate limit reached (${this.requests.length}/${this.maxRequests}). Waiting ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitIfNeeded(); // Recursively check again
    }
    
    // Record this request
    this.requests.push(now);
    console.log(`🔄 API call ${this.requests.length}/${this.maxRequests} in current window`);
  }

  getRemainingCalls(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    return Math.max(0, this.maxRequests - this.requests.length);
  }
}

class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number = 2, timeWindowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindowMs;
  }

  async waitIfNeeded(): Promise<void> {
    // First check global rate limit
    await GlobalRateLimiter.getInstance().waitIfNeeded();
    
    const now = Date.now();
    
    // Remove requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    // If we're at the limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest) + 1000; // Add 1s buffer
      console.log(`⏳ Local rate limit reached. Waiting ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitIfNeeded(); // Recursively check again
    }
    
    // Record this request
    this.requests.push(now);
  }
}

class RetryHandler {
  static async withRetry<T>(
    fn: () => Promise<T>, 
    maxRetries: number = 2, // Reduced retries
    baseDelay: number = 3000 // Longer base delay
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const isRateLimit = error?.message?.toLowerCase().includes('rate limit') || 
                           error?.message?.toLowerCase().includes('too many') ||
                           error?.status === 429;
        
        if (attempt === maxRetries || !isRateLimit) {
          throw error;
        }
        
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`🔄 Rate limit hit. Attempt ${attempt} failed, waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
}

// ============================================================================
// AGENT INTERFACES & TYPES
// ============================================================================

export interface BusinessRequirements {
  // Core Business Info
  companyName: string;
  industry: string;
  productService: string;
  businessGoals: string[];
  
  // Target Audience
  targetAudience: string;
  demographics: string;
  
  // Campaign Context
  campaignObjective: string;
  keyMessage: string;
  
  // Constraints
  budgetRange: {
    min: number;
    max: number;
  };
  timeline: string;
  
  // Preferences (optional)
  preferredPlatforms?: string[];
  avoidPlatforms?: string[];
  contentTypes?: string[];
  specialRequirements?: string;
  
  // Outreach Configuration
  outreachCount: number; // Number of top creators to contact automatically
  personalizedOutreach: boolean; // Whether to use AI for personalized messages
}

export interface GeneratedCampaign {
  // Generated Campaign Details
  title: string;
  brand: string;
  description: string;
  brief: string;
  
  // AI-Generated Requirements
  platforms: string[];
  minFollowers: number;
  niches: string[];
  locations: string[];
  deliverables: string[];
  
  // AI-Optimized Budget
  budgetMin: number;
  budgetMax: number;
  
  // AI-Calculated Timeline
  startDate: string;
  endDate: string;
  applicationDeadline: string;
  
  // AI Insights
  aiInsights: {
    strategy: string;
    reasoning: string;
    successFactors: string[];
    potentialChallenges: string[];
    optimizationSuggestions: string[];
  };
  
  // Agent Metadata
  confidence: number;
  agentVersion: string;
  generatedAt: Date;
}

export interface CreatorMatch {
  creator: Creator;
  score: number;
  reasoning: string;
  strengths: string[];
  concerns: string[];
  fitAnalysis: {
    audienceAlignment: number;
    contentQuality: number;
    engagementRate: number;
    brandSafety: number;
    costEfficiency: number;
  };
  recommendedAction: 'highly_recommend' | 'recommend' | 'consider' | 'not_recommended';
  estimatedPerformance: {
    expectedReach: number;
    expectedEngagement: number;
    expectedROI: number;
  };
}

export interface AgentWorkflowResult {
  generatedCampaign: GeneratedCampaign;
  creatorMatches: CreatorMatch[];
  outreachSummary?: OutreachSummary;
  workflowInsights: {
    totalProcessingTime: number;
    agentsUsed: string[];
    confidenceScore: number;
    recommendedNextSteps: string[];
  };
}

// ============================================================================
// CAMPAIGN BUILDING AGENT
// ============================================================================

class CampaignBuildingAgent {
  private groqProvider = createGroq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });
  private model = this.groqProvider('llama-3.3-70b-versatile');

  async generateCampaign(requirements: BusinessRequirements): Promise<GeneratedCampaign> {
    console.log('📋 Campaign Building Agent: Checking API availability...');
    
    // Check if we have any API calls remaining
    const remainingCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
    console.log(`🔄 Remaining API calls: ${remainingCalls}/3`);
    
    if (remainingCalls < 1) {
      console.log('⚠️ No API calls remaining - using offline campaign generation');
      return this.generateFallbackCampaign(requirements);
    }

    const prompt = `
      You are an expert campaign strategist with 15+ years of experience in influencer marketing. Generate a comprehensive, data-driven campaign based on business requirements.

      BUSINESS REQUIREMENTS ANALYSIS:
      Company: ${requirements.companyName}
      Industry: ${requirements.industry}
      Product/Service: ${requirements.productService}
      Business Goals: ${requirements.businessGoals.join(', ')}
      
      Target Audience: ${requirements.targetAudience}
      Demographics: ${requirements.demographics}
      
      Campaign Objective: ${requirements.campaignObjective}
      Key Message: ${requirements.keyMessage}
      
      Budget Range: ₹${requirements.budgetRange.min} - ₹${requirements.budgetRange.max}
      Timeline: ${requirements.timeline}
      
      Preferred Platforms: ${requirements.preferredPlatforms?.join(', ') || 'No preference'}
      Content Types: ${requirements.contentTypes?.join(', ') || 'Open to suggestions'}
      Special Requirements: ${requirements.specialRequirements || 'None'}

      CAMPAIGN GENERATION REQUIREMENTS:
      1. STRATEGIC TITLE: Create compelling campaign title (5-8 words)
      2. PLATFORM OPTIMIZATION: Choose 2-4 platforms based on audience and objectives
      3. AUDIENCE SIZING: Determine optimal follower count requirements
      4. NICHE TARGETING: Select 2-5 relevant content niches
      5. GEO-TARGETING: Choose appropriate locations (focus on India unless specified)
      6. DELIVERABLE STRATEGY: Design content mix for maximum impact
      7. BUDGET OPTIMIZATION: Distribute budget efficiently across creators
      8. TIMELINE PLANNING: Set realistic deadlines with buffer time
      9. SUCCESS METRICS: Define KPIs and success factors
      10. RISK MITIGATION: Identify challenges and solutions

      PLATFORM DECISION MATRIX:
      - Instagram: Visual products, lifestyle, fashion, food, travel
      - YouTube: Educational, tech reviews, detailed demos, storytelling
      - TikTok: Gen Z audience, viral content, entertainment, challenges
      - LinkedIn: B2B, professional services, thought leadership
      - Twitter: News, tech, real-time engagement, customer service

      FOLLOWER COUNT STRATEGY:
      - Nano (1K-10K): High engagement, authentic, cost-effective
      - Micro (10K-100K): Good balance, niche expertise
      - Mid-tier (100K-500K): Broader reach, professional content
      - Macro (500K+): Mass reach, brand awareness

      Generate response in this EXACT JSON format:
      {
        "title": "Strategic campaign title",
        "brand": "${requirements.companyName}",
        "description": "Compelling 2-3 sentence campaign description",
        "brief": "Detailed campaign brief (200-300 words) including objectives, messaging, audience insights, and success metrics",
        "platforms": ["platform1", "platform2"],
        "minFollowers": 10000,
        "niches": ["niche1", "niche2", "niche3"],
        "locations": ["India", "other_locations"],
        "deliverables": ["Instagram Posts", "Stories", "Reels"],
        "budgetMin": ${Math.floor(requirements.budgetRange.min * 0.8)},
        "budgetMax": ${Math.floor(requirements.budgetRange.max * 0.9)},
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD", 
        "applicationDeadline": "YYYY-MM-DD",
        "aiInsights": {
          "strategy": "Strategic approach explanation",
          "reasoning": "Why these choices were made",
          "successFactors": ["factor1", "factor2", "factor3"],
          "potentialChallenges": ["challenge1", "challenge2"],
          "optimizationSuggestions": ["suggestion1", "suggestion2", "suggestion3"]
        },
        "confidence": 0.85-0.95
      }

      Focus on creating data-driven, strategic campaigns that maximize ROI and achieve business objectives.
    `;

    try {
      console.log('🤖 Making AI API call for campaign generation...');
      
      const result = await RetryHandler.withRetry(async () => {
        const { text } = await generateText({
          model: this.model,
          prompt,
          maxTokens: 3000,
          temperature: 0.3,
        });
        return text;
      }, 1, 5000); // Only 1 retry with 5s delay

      const parsed = this.parseResponse(result);
      console.log('✅ AI campaign generation successful');
      
      return {
        ...parsed,
        agentVersion: 'campaign-builder-v1.0',
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('❌ Campaign Building Agent AI Error:', error);
      console.log('🔄 Falling back to offline campaign generation...');
      return this.generateFallbackCampaign(requirements);
    }
  }

  private parseResponse(text: string): any {
    try {
      // Clean and parse JSON response
      const cleanedText = text.trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?$/g, '')
        .replace(/```/g, '');
      
      return JSON.parse(cleanedText);
    } catch (error) {
      // Fallback parsing logic
      throw new Error('Failed to parse campaign generation response');
    }
  }

  private generateFallbackCampaign(requirements: BusinessRequirements): GeneratedCampaign {
    console.log('🤖 Generating campaign using offline algorithms...');
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);
    const deadline = new Date(startDate);
    deadline.setDate(deadline.getDate() - 3);

    // Smart platform selection based on industry and goals
    const platformMap: Record<string, string[]> = {
      'Technology': ['youtube', 'linkedin', 'twitter'],
      'Fashion': ['instagram', 'tiktok', 'youtube'],
      'Food & Beverage': ['instagram', 'youtube', 'tiktok'],
      'Fitness': ['instagram', 'youtube', 'tiktok'],
      'Beauty': ['instagram', 'tiktok', 'youtube'],
      'Gaming': ['youtube', 'tiktok', 'twitter'],
      'Education': ['youtube', 'linkedin', 'instagram'],
      'Finance': ['linkedin', 'youtube', 'twitter']
    };

    const suggestedPlatforms = platformMap[requirements.industry] || ['instagram', 'youtube'];
    const finalPlatforms = requirements.preferredPlatforms?.length 
      ? requirements.preferredPlatforms 
      : suggestedPlatforms.slice(0, 2);

    // Smart niche selection based on industry
    const nicheMap: Record<string, string[]> = {
      'Technology': ['technology', 'productivity', 'startup'],
      'Fashion': ['fashion', 'lifestyle', 'style'],
      'Food & Beverage': ['food', 'cooking', 'lifestyle'],
      'Fitness': ['fitness', 'health', 'wellness'],
      'Beauty': ['beauty', 'skincare', 'lifestyle'],
      'Gaming': ['gaming', 'entertainment', 'technology'],
      'Education': ['education', 'learning', 'career'],
      'Finance': ['finance', 'investing', 'business']
    };

    const suggestedNiches = nicheMap[requirements.industry] || ['lifestyle', 'general'];

    return {
      title: `${requirements.companyName} ${requirements.campaignObjective.split(' ')[0]} Campaign`,
      brand: requirements.companyName,
      description: `Strategic influencer campaign to ${requirements.campaignObjective.toLowerCase()} for ${requirements.productService}`,
      brief: `This comprehensive influencer marketing campaign aims to ${requirements.campaignObjective.toLowerCase()} by partnering with carefully selected creators who can authentically promote ${requirements.productService} to our target audience: ${requirements.targetAudience}. Our multi-platform approach focuses on ${finalPlatforms.join(' and ')} to maximize reach and engagement.`,
      platforms: finalPlatforms,
      minFollowers: 10000,
      niches: suggestedNiches,
      locations: ['India'],
      deliverables: ['Posts', 'Stories', 'Videos'],
      budgetMin: Math.floor(requirements.budgetRange.min * 0.8),
      budgetMax: Math.floor(requirements.budgetRange.max * 0.9),
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      applicationDeadline: deadline.toISOString().split('T')[0],
      aiInsights: {
        strategy: `Algorithmic campaign generation focused on ${requirements.industry.toLowerCase()} sector with ${finalPlatforms.join(' and ')} platform optimization`,
        reasoning: 'Campaign generated using proven algorithmic strategies tailored to industry best practices',
        successFactors: ['Authentic creator partnerships', 'Clear brand messaging', 'Platform-optimized content'],
        potentialChallenges: ['Creator availability', 'Content scheduling', 'Performance tracking'],
        optimizationSuggestions: ['A/B test different creator tiers', 'Monitor engagement metrics closely', 'Adjust messaging based on early results']
      },
      confidence: 0.75, // Good confidence for algorithmic generation
      agentVersion: 'campaign-builder-v1.0',
      generatedAt: new Date()
    };
  }
}

// ============================================================================
// CREATOR DISCOVERY AGENT
// ============================================================================

class CreatorDiscoveryAgent {
  private groqProvider = createGroq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });
  private model = this.groqProvider('llama-3.3-70b-versatile');

  async findCreators(campaign: GeneratedCampaign): Promise<Creator[]> {
    console.log('🔍 Creator Discovery Agent: Checking API availability...');
    
    // Check if we have any API calls remaining
    const remainingCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
    console.log(`🔄 Remaining API calls: ${remainingCalls}/3`);
    
    if (remainingCalls < 1) {
      console.log('⚠️ No API calls remaining - using algorithmic creator search');
      return this.fallbackCreatorSearch(campaign);
    }

    // Use existing LLM service for creator discovery with rate limiting
    const searchQuery = this.generateSearchQuery(campaign);
    
    try {
      console.log('🤖 Using AI for creator discovery...');
      
      const analysis = await RetryHandler.withRetry(async () => {
        return await groqLLMService.analyzeCreatorQuery(
          searchQuery,
          mockCreators,
          []
        );
      }, 1, 5000); // Only 1 retry with 5s delay
      
      const discoveredCreators = analysis.matchedCreators.map(mc => mc.creator);
      console.log(`✅ AI discovered ${discoveredCreators.length} creators`);
      return discoveredCreators;
      
    } catch (error) {
      console.error('❌ Creator Discovery Agent AI Error:', error);
      console.log('🔄 Falling back to algorithmic creator search...');
      return this.fallbackCreatorSearch(campaign);
    }
  }

  private generateSearchQuery(campaign: GeneratedCampaign): string {
    return `Find ${campaign.niches.join(' and ')} influencers on ${campaign.platforms.join(' and ')} with ${campaign.minFollowers}+ followers, good engagement rates, and content that aligns with ${campaign.brand} brand values. Budget range ₹${campaign.budgetMin}-₹${campaign.budgetMax}. Focus on creators who can create ${campaign.deliverables.join(', ')} for a ${campaign.brief.substring(0, 100)}... campaign.`;
  }

  private fallbackCreatorSearch(campaign: GeneratedCampaign): Creator[] {
    console.log('🤖 Using enhanced algorithmic creator filtering...');
    
    // Enhanced fallback: filter creators based on campaign criteria with advanced scoring
    const scoredCreators = mockCreators
      .map(creator => {
        let score = 0;
        
        // Platform match (high weight)
        if (campaign.platforms.includes(creator.platform)) score += 30;
        
        // Follower count match
        if (creator.metrics.followers >= campaign.minFollowers) score += 20;
        
        // Niche alignment (high weight)
        const nicheMatches = creator.niche.filter(n => campaign.niches.includes(n)).length;
        score += nicheMatches * 15;
        
        // Budget compatibility
        if (creator.rates.post <= campaign.budgetMax) score += 15;
        if (creator.rates.post <= campaign.budgetMin * 2) score += 10; // Sweet spot
        
        // Quality indicators
        if (creator.metrics.engagementRate > 4) score += 10;
        if (creator.verified) score += 8;
        if (creator.rating >= 4) score += 7;
        
        // Location preference (bonus for India)
        if (campaign.locations.includes('India') && creator.location.includes('India')) score += 5;
        
        return { creator, score };
      })
      .filter(item => item.score > 40) // Only keep reasonably good matches
      .sort((a, b) => b.score - a.score)
      .slice(0, 30) // Return top 30 creators
      .map(item => item.creator);
    
    console.log(`✅ Algorithmic search found ${scoredCreators.length} quality creators`);
    return scoredCreators;
  }
}

// ============================================================================
// MATCHING & SCORING AGENT
// ============================================================================

class MatchingScoringAgent {
  private groqProvider = createGroq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });
  private model = this.groqProvider('llama-3.3-70b-versatile');
  private maxAIScoring = 1; // VERY conservative: Only 1 creator gets AI scoring

  async scoreCreators(campaign: GeneratedCampaign, creators: Creator[]): Promise<CreatorMatch[]> {
    console.log(`🎯 Scoring ${creators.length} creators (AI: ${Math.min(this.maxAIScoring, creators.length)}, Algorithmic: ${Math.max(0, creators.length - this.maxAIScoring)})`);
    
    // Check remaining API calls
    const remainingCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
    console.log(`🔄 Remaining API calls: ${remainingCalls}/3`);
    
    // First, do enhanced algorithmic scoring for ALL creators
    const allScored = creators.map(creator => this.enhanceFallbackScoring(campaign, creator))
      .sort((a, b) => b.score - a.score);
    
    // Only use AI for the top 1 creator if we have API calls remaining
    if (remainingCalls > 0 && allScored.length > 0) {
      try {
        console.log(`🤖 Using AI to score top creator: ${allScored[0].creator.name}`);
        
        const aiScoredTop = await this.scoreIndividualCreatorSafe(campaign, allScored[0].creator);
        
        // Replace the first result with AI-scored version
        allScored[0] = aiScoredTop;
        console.log(`✅ AI scoring completed for top creator`);
        
      } catch (error) {
        console.error(`❌ AI scoring failed for top creator:`, error);
        console.log('🔄 Keeping algorithmic score for all creators');
      }
    } else {
      console.log('⚠️ No API calls remaining or no creators - using algorithmic scoring only');
    }
    
    // Re-sort by final scores
    return allScored.sort((a, b) => b.score - a.score);
  }

  private async scoreIndividualCreatorSafe(campaign: GeneratedCampaign, creator: Creator): Promise<CreatorMatch> {
    try {
      const prompt = `
        Score this creator for the campaign (0-100). Keep response brief.

        CAMPAIGN: ${campaign.title}
        Budget: ₹${campaign.budgetMin}-₹${campaign.budgetMax}
        Platforms: ${campaign.platforms.join(', ')}
        Niches: ${campaign.niches.join(', ')}

        CREATOR:
        ${creator.name} - ${creator.platform}
        Followers: ${creator.metrics.followers.toLocaleString()}
        Engagement: ${creator.metrics.engagementRate}%
        Niches: ${creator.niche.join(', ')}
        Rate: ₹${creator.rates.post}

        Respond ONLY with this JSON:
        {
          "score": 85,
          "reason": "Brief explanation",
          "action": "highly_recommend"
        }
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 500, // Much smaller response
        temperature: 0.1,
      });

      const analysis = JSON.parse(text.trim());

      return {
        creator,
        score: Math.min(analysis.score || 50, 100),
        reasoning: analysis.reason || 'AI analysis',
        strengths: ['AI-verified match', 'Good campaign fit'],
        concerns: analysis.score < 70 ? ['Needs closer evaluation'] : [],
        fitAnalysis: {
          audienceAlignment: Math.min(analysis.score, 100),
          contentQuality: creator.rating * 20,
          engagementRate: Math.min(creator.metrics.engagementRate * 20, 100),
          brandSafety: 85,
          costEfficiency: creator.rates.post <= (campaign.budgetMax / 2) ? 90 : 70
        },
        recommendedAction: analysis.action || 'consider',
        estimatedPerformance: {
          expectedReach: Math.floor(creator.metrics.followers * 0.8),
          expectedEngagement: Math.floor(creator.metrics.followers * creator.metrics.engagementRate / 100),
          expectedROI: 2.8
        }
      };
      
    } catch (error) {
      console.error('Individual AI scoring failed:', error);
      throw error;
    }
  }

  private enhanceFallbackScoring(campaign: GeneratedCampaign, creator: Creator): CreatorMatch {
    let score = 0;
    const reasons: string[] = [];
    const strengths: string[] = [];
    const concerns: string[] = [];
    
    // Platform match (25 points max)
    if (campaign.platforms.includes(creator.platform)) {
      score += 25;
      reasons.push(`perfect ${creator.platform} platform match`);
      strengths.push(`Strong ${creator.platform} presence`);
    }
    
    // Follower count (20 points max)
    if (creator.metrics.followers >= campaign.minFollowers) {
      const followerBonus = Math.min(15, Math.floor(creator.metrics.followers / campaign.minFollowers) * 2);
      score += followerBonus;
      if (creator.metrics.followers > campaign.minFollowers * 2) {
        strengths.push('Large audience reach');
      }
    } else {
      concerns.push('Below minimum follower requirement');
    }
    
    // Niche alignment (25 points max)
    const nicheMatches = creator.niche.filter(n => campaign.niches.includes(n));
    if (nicheMatches.length > 0) {
      score += nicheMatches.length * 8;
      reasons.push(`${nicheMatches.join(', ')} niche alignment`);
      strengths.push('Content niche alignment');
    } else {
      concerns.push('Limited niche overlap');
    }
    
    // Budget compatibility (15 points max)
    if (creator.rates.post <= campaign.budgetMax) {
      score += 10;
      if (creator.rates.post <= campaign.budgetMin * 1.5) {
        score += 5;
        strengths.push('Budget-friendly rates');
      }
    } else {
      concerns.push('Above budget range');
    }
    
    // Engagement rate (15 points max)
    if (creator.metrics.engagementRate > 3) {
      score += Math.min(15, creator.metrics.engagementRate * 2);
      if (creator.metrics.engagementRate > 5) {
        strengths.push('Excellent engagement rate');
      }
    } else {
      concerns.push('Low engagement rate');
    }
    
    // Quality indicators (remaining points)
    if (creator.verified) {
      score += 5;
      strengths.push('Verified creator');
    }
    if (creator.rating >= 4) {
      score += 5;
      strengths.push('High creator rating');
    }
    if (creator.responseTime === 'Fast') {
      score += 3;
      strengths.push('Quick response time');
    }

    // Cap the score
    score = Math.min(score, 100);
    
    // Generate reasoning
    const enhancedReasoning = reasons.length > 0 
      ? `Strong match: ${reasons.join(', ')}`
      : 'Basic campaign compatibility with room for improvement';

    // Determine recommendation
    let recommendedAction: 'highly_recommend' | 'recommend' | 'consider' | 'not_recommended';
    if (score >= 80) recommendedAction = 'highly_recommend';
    else if (score >= 65) recommendedAction = 'recommend';
    else if (score >= 45) recommendedAction = 'consider';
    else recommendedAction = 'not_recommended';

    return {
      creator,
      score,
      reasoning: enhancedReasoning,
      strengths: strengths.length > 0 ? strengths : ['Available for campaign'],
      concerns: concerns.length > 0 ? concerns : [],
      fitAnalysis: {
        audienceAlignment: Math.min(score, 100),
        contentQuality: creator.rating * 20,
        engagementRate: Math.min(creator.metrics.engagementRate * 15, 100),
        brandSafety: 80,
        costEfficiency: creator.rates.post <= campaign.budgetMax ? 85 : 50
      },
      recommendedAction,
      estimatedPerformance: {
        expectedReach: Math.floor(creator.metrics.followers * 0.75),
        expectedEngagement: Math.floor(creator.metrics.followers * creator.metrics.engagementRate / 100),
        expectedROI: score > 70 ? 2.8 : 2.2
      }
    };
  }
}

// ============================================================================
// OUTREACH AGENT
// ============================================================================

interface OutreachResult {
  creator: Creator;
  subject: string;
  message: string;
  status: 'sent' | 'failed';
  method: 'ai_generated' | 'template_based';
  timestamp: Date;
}

interface OutreachSummary {
  totalSent: number;
  aiGenerated: number;
  templateBased: number;
  failed: number;
  outreaches: OutreachResult[];
}

class OutreachAgent {
  private groqProvider = createGroq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });
  private model = this.groqProvider('llama-3.3-70b-versatile');

  async executeOutreach(
    campaign: GeneratedCampaign, 
    creatorMatches: CreatorMatch[], 
    requirements: BusinessRequirements
  ): Promise<OutreachSummary> {
    console.log(`📧 Outreach Agent: Preparing to contact top ${requirements.outreachCount} creators`);
    
    // Select top creators based on score and recommendation
    const topCreators = creatorMatches
      .filter(match => match.recommendedAction === 'highly_recommend' || match.recommendedAction === 'recommend')
      .slice(0, requirements.outreachCount);
    
    if (topCreators.length === 0) {
      console.log('⚠️ No qualified creators found for outreach');
      return {
        totalSent: 0,
        aiGenerated: 0,
        templateBased: 0,
        failed: 0,
        outreaches: []
      };
    }
    
    console.log(`🎯 Selected ${topCreators.length} top creators for outreach`);
    
    const outreachResults: OutreachResult[] = [];
    let aiGenerated = 0;
    let templateBased = 0;
    let failed = 0;
    
    // Check if we have API calls for personalized outreach
    const remainingCalls = GlobalRateLimiter.getInstance().getRemainingCalls();
    const canUseAI = requirements.personalizedOutreach && remainingCalls > 0;
    
    console.log(`🤖 Outreach method: ${canUseAI ? 'AI-personalized' : 'Template-based'} (${remainingCalls} API calls remaining)`);
    
    for (const match of topCreators) {
      try {
        let subject: string;
        let message: string;
        let method: 'ai_generated' | 'template_based';
        
        if (canUseAI && GlobalRateLimiter.getInstance().getRemainingCalls() > 0) {
          // Generate AI-personalized outreach
          const aiResult = await this.generatePersonalizedOutreach(campaign, match, requirements);
          subject = aiResult.subject;
          message = aiResult.message;
          method = 'ai_generated';
          aiGenerated++;
          console.log(`✨ AI-generated personalized outreach for ${match.creator.name}`);
        } else {
          // Use template-based outreach
          const templateResult = this.generateTemplateOutreach(campaign, match, requirements);
          subject = templateResult.subject;
          message = templateResult.message;
          method = 'template_based';
          templateBased++;
          console.log(`📝 Template-based outreach for ${match.creator.name}`);
        }
        
        // Save to outreach storage
        await this.saveOutreach(campaign, match.creator, subject, message);
        
        outreachResults.push({
          creator: match.creator,
          subject,
          message,
          status: 'sent',
          method,
          timestamp: new Date()
        });
        
        console.log(`✅ Outreach sent to ${match.creator.name}`);
        
      } catch (error) {
        console.error(`❌ Failed to send outreach to ${match.creator.name}:`, error);
        
        // Still try template-based as fallback
        try {
          const templateResult = this.generateTemplateOutreach(campaign, match, requirements);
          await this.saveOutreach(campaign, match.creator, templateResult.subject, templateResult.message);
          
          outreachResults.push({
            creator: match.creator,
            subject: templateResult.subject,
            message: templateResult.message,
            status: 'sent',
            method: 'template_based',
            timestamp: new Date()
          });
          
          templateBased++;
          console.log(`✅ Fallback template outreach sent to ${match.creator.name}`);
        } catch (fallbackError) {
          failed++;
          outreachResults.push({
            creator: match.creator,
            subject: `Partnership Opportunity with ${campaign.brand}`,
            message: 'Failed to generate outreach message',
            status: 'failed',
            method: 'template_based',
            timestamp: new Date()
          });
        }
      }
    }
    
    const summary: OutreachSummary = {
      totalSent: outreachResults.filter(r => r.status === 'sent').length,
      aiGenerated,
      templateBased,
      failed,
      outreaches: outreachResults
    };
    
    console.log(`📊 Outreach Summary: ${summary.totalSent} sent (${aiGenerated} AI, ${templateBased} template, ${failed} failed)`);
    
    return summary;
  }

  private async generatePersonalizedOutreach(
    campaign: GeneratedCampaign, 
    match: CreatorMatch, 
    requirements: BusinessRequirements
  ): Promise<{ subject: string; message: string }> {
    
    const prompt = `
      Generate a personalized, professional outreach email for an influencer collaboration.
      
      CAMPAIGN DETAILS:
      Company: ${campaign.brand}
      Product/Service: ${requirements.productService}
      Campaign: ${campaign.title}
      Objective: ${requirements.campaignObjective}
      Budget Range: ₹${campaign.budgetMin}-₹${campaign.budgetMax}
      Key Message: ${requirements.keyMessage}
      
      CREATOR DETAILS:
      Name: ${match.creator.name}
      Platform: ${match.creator.platform}
      Followers: ${match.creator.metrics.followers.toLocaleString()}
      Niches: ${match.creator.niche.join(', ')}
      Why they're a good fit: ${match.reasoning}
      
      EMAIL REQUIREMENTS:
      - Professional but friendly tone
      - Highlight why they're specifically chosen
      - Mention their content/niche alignment
      - Include campaign value proposition
      - Suggest next steps
      - Keep it concise (2-3 paragraphs)
      - Include a clear call-to-action
      
      Generate response in this EXACT JSON format:
      {
        "subject": "Partnership Opportunity: [Specific to creator/niche]",
        "message": "Professional email content here..."
      }
      
      Make it authentic and avoid generic language.
    `;

    const { text } = await generateText({
      model: this.model,
      prompt,
      maxTokens: 800,
      temperature: 0.3,
    });

    const parsed = JSON.parse(text.trim());
    return {
      subject: parsed.subject || `Partnership Opportunity with ${campaign.brand}`,
      message: parsed.message || 'AI generation failed - using fallback template'
    };
  }

  private generateTemplateOutreach(
    campaign: GeneratedCampaign, 
    match: CreatorMatch, 
    requirements: BusinessRequirements
  ): { subject: string; message: string } {
    
    const subject = `Partnership Opportunity: ${campaign.brand} x ${match.creator.name}`;
    
    const message = `Hi ${match.creator.name},

I hope this message finds you well! I'm reaching out from ${campaign.brand} because we've been following your ${match.creator.platform} content in the ${match.creator.niche.join(' and ')} space, and we're genuinely impressed by your engagement and authentic voice.

We're launching ${campaign.title} and believe your audience of ${match.creator.metrics.followers.toLocaleString()}+ followers would be a perfect fit for our ${requirements.productService}. Your content style and ${match.creator.niche.join(', ')} focus align perfectly with our campaign objectives.

We'd love to discuss a collaboration that would be mutually beneficial. Our campaign budget allows for competitive compensation, and we're flexible on content format and timing to match your style.

Would you be interested in learning more about this partnership opportunity? I'd be happy to send over more details and discuss how we can work together.

Looking forward to hearing from you!

Best regards,
${campaign.brand} Partnership Team

P.S. We chose you specifically because ${match.reasoning}`;

    return { subject, message };
  }

  private async saveOutreach(
    campaign: GeneratedCampaign,
    creator: Creator,
    subject: string,
    message: string
  ): Promise<void> {
    try {
      outreachStorage.saveOutreach({
        id: `auto-${Date.now()}-${creator.id}`,
        creatorId: creator.id,
        creatorName: creator.name,
        creatorAvatar: creator.avatar,
        creatorPlatform: creator.platform,
        subject,
        body: message,
        status: 'contacted',
        confidence: 85, // High confidence for AI-selected creators
        reasoning: 'Auto-generated outreach from Agentic AI workflow',
        keyPoints: ['AI-selected creator', 'Campaign fit verified', 'Automated outreach'],
        nextSteps: ['Wait for response', 'Follow up in 3 days if needed'],
        brandName: campaign.brand,
        campaignContext: campaign.title,
        createdAt: new Date(),
        lastContact: new Date(),
        notes: 'Generated by Agentic AI system'
      });
      
      console.log(`💾 Outreach saved to storage for ${creator.name}`);
    } catch (error) {
      console.error('Failed to save outreach to storage:', error);
    }
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

  async executeFullWorkflow(requirements: BusinessRequirements): Promise<AgentWorkflowResult> {
    const startTime = Date.now();
    console.log('🤖 Starting Agentic AI Workflow...');
    
    const globalLimiter = GlobalRateLimiter.getInstance();
    const initialCalls = globalLimiter.getRemainingCalls();
    console.log(`📊 Starting with ${initialCalls}/3 API calls available`);

    try {
      // Step 1: Generate Campaign
      console.log('📋 Agent 1: Building campaign strategy...');
      const step1Start = Date.now();
      
      const generatedCampaign = await this.campaignAgent.generateCampaign(requirements);
      const step1Duration = Date.now() - step1Start;
      const callsAfterCampaign = globalLimiter.getRemainingCalls();
      console.log(`✅ Campaign generated in ${step1Duration}ms: ${generatedCampaign.title}`);
      console.log(`📊 API calls remaining: ${callsAfterCampaign}/3`);

      // Step 2: Discover Creators
      console.log('🔍 Agent 2: Discovering creators...');
      const step2Start = Date.now();
      
      const discoveredCreators = await this.discoveryAgent.findCreators(generatedCampaign);
      const step2Duration = Date.now() - step2Start;
      const callsAfterDiscovery = globalLimiter.getRemainingCalls();
      console.log(`✅ Found ${discoveredCreators.length} potential creators in ${step2Duration}ms`);
      console.log(`📊 API calls remaining: ${callsAfterDiscovery}/3`);

      // Step 3: Score & Match Creators
      console.log('⚡ Agent 3: Scoring creator matches...');
      const step3Start = Date.now();
      
      const creatorMatches = await this.scoringAgent.scoreCreators(generatedCampaign, discoveredCreators);
      const step3Duration = Date.now() - step3Start;
      const finalCalls = globalLimiter.getRemainingCalls();
      console.log(`✅ Scored ${creatorMatches.length} creator matches in ${step3Duration}ms`);
      console.log(`📊 Final API calls remaining: ${finalCalls}/3`);

      // Step 4: Outreach
      console.log('📧 Agent 4: Sending outreach messages...');
      const step4Start = Date.now();
      
      const outreachSummary = await this.outreachAgent.executeOutreach(generatedCampaign, creatorMatches, requirements);
      const step4Duration = Date.now() - step4Start;
      const finalCallsAfterOutreach = globalLimiter.getRemainingCalls();
      console.log(`✅ Outreach completed in ${step4Duration}ms`);
      console.log(`📊 Final API calls remaining: ${finalCallsAfterOutreach}/3`);

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      const totalApiCalls = initialCalls - finalCallsAfterOutreach;

      // Calculate overall confidence based on AI availability and results quality
      const aiUsageRatio = totalApiCalls / 3; // How much AI was actually used
      const resultsQuality = creatorMatches.length > 0 ? 
        (creatorMatches.reduce((sum, m) => sum + m.score, 0) / creatorMatches.length / 100) : 0.5;
      
      const overallConfidence = Math.min(
        (generatedCampaign.confidence * 0.5 + resultsQuality * 0.3 + aiUsageRatio * 0.2),
        0.95
      );

      const result: AgentWorkflowResult = {
        generatedCampaign,
        creatorMatches,
        outreachSummary,
        workflowInsights: {
          totalProcessingTime: processingTime,
          agentsUsed: ['CampaignBuilder', 'CreatorDiscovery', 'MatchingScoring', 'Outreach'],
          confidenceScore: overallConfidence,
          recommendedNextSteps: this.generateRecommendations(creatorMatches, generatedCampaign, totalApiCalls)
        }
      };

      console.log(`🎉 Agentic AI Workflow completed successfully in ${processingTime}ms!`);
      console.log(`📊 Used ${totalApiCalls}/3 API calls | Overall confidence: ${Math.round(overallConfidence * 100)}%`);
      return result;

    } catch (error) {
      console.error('❌ Agentic AI Workflow failed:', error);
      
      // Provide helpful error messages for common issues
      if (error instanceof Error) {
        if (error.message.includes('rate limit') || error.message.includes('429') || error.message.includes('too many')) {
          throw new Error('🚨 Rate limit exceeded. The system has automatically switched to algorithmic analysis. Wait 1-2 minutes before trying again for full AI analysis.');
        } else if (error.message.includes('API key') || error.message.includes('401')) {
          throw new Error('🔑 API authentication failed. Please check your Groq API key configuration in .env.local file.');
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          throw new Error('🌐 Network issue detected. Please check your internet connection and try again.');
        }
      }
      
      throw new Error('⚠️ Workflow execution failed. The system uses fallback algorithms when API issues occur. Please try again or proceed with algorithmic results.');
    }
  }

  private generateRecommendations(matches: CreatorMatch[], campaign: GeneratedCampaign, apiCallsUsed: number): string[] {
    const recommendations = [];
    
    const highQualityMatches = matches.filter(m => m.score > 80).length;
    const totalMatches = matches.length;
    
    // API usage recommendations
    if (apiCallsUsed === 0) {
      recommendations.push('All results generated using advanced algorithmic analysis');
      recommendations.push('For AI-enhanced scoring, wait 1-2 minutes and rerun the workflow');
    } else if (apiCallsUsed < 2) {
      recommendations.push('Partial AI analysis completed - results combine AI and algorithmic scoring');
    } else {
      recommendations.push('Full AI analysis completed for optimal creator matching');
    }
    
    // Quality recommendations
    if (highQualityMatches === 0) {
      recommendations.push('Consider adjusting campaign criteria for better creator matches');
      recommendations.push('Review budget allocation to attract higher-quality creators');
    } else if (highQualityMatches < 3) {
      recommendations.push('Found some good matches - consider expanding search criteria');
      recommendations.push('Review top matches and launch targeted outreach');
    } else {
      recommendations.push('Excellent creator matches found - ready to launch outreach');
      recommendations.push('Consider A/B testing with different creator tiers');
    }
    
    if (campaign.platforms.length > 2) {
      recommendations.push('Multi-platform strategy detected - ensure consistent messaging');
    }
    
    recommendations.push('Set up campaign tracking and performance monitoring');
    
    return recommendations;
  }

  isAvailable(): boolean {
    return !!(import.meta.env.VITE_GROQ_API_KEY);
  }

  getRateLimitStatus(): { campaign: boolean; discovery: boolean; scoring: boolean; remaining: number } {
    const remaining = GlobalRateLimiter.getInstance().getRemainingCalls();
    const available = this.isAvailable() && remaining > 0;
    
    return {
      campaign: available,
      discovery: available,
      scoring: available,
      remaining
    };
  }
}

// ============================================================================
// MAIN SERVICE EXPORT
// ============================================================================

export const aiAgentsService = new WorkflowOrchestrationAgent();

// Helper function to create example business requirements
export const createExampleRequirements = (): BusinessRequirements => ({
  companyName: 'TechFlow Solutions',
  industry: 'Technology',
  productService: 'AI-powered productivity software',
  businessGoals: ['Increase brand awareness', 'Drive app downloads', 'Build developer community'],
  targetAudience: 'Tech professionals and developers aged 25-40',
  demographics: 'Urban professionals, high income, early adopters',
  campaignObjective: 'Launch new product and drive 10K+ app downloads',
  keyMessage: 'Revolutionize your workflow with AI-powered productivity',
  budgetRange: {
    min: 50000,
    max: 200000
  },
  timeline: '6 weeks',
  preferredPlatforms: ['youtube', 'linkedin', 'twitter'],
  contentTypes: ['Product demos', 'Tutorial videos', 'Developer testimonials'],
  outreachCount: 5,
  personalizedOutreach: true
}); 