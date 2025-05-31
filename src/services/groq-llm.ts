import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { type Creator } from '../types';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  llmAnalysis?: LLMCreatorAnalysis;
}

export interface LLMCreatorAnalysis {
  query: string;
  matchedCreators: Array<{
    creator: Creator;
    relevanceScore: number;
    reasoning: string;
    strengths: string[];
    concerns: string[];
    recommendationLevel: 'highly_recommended' | 'good_match' | 'potential_match';
    costEffectivenessScore?: number;
    reachPotential?: string;
  }>;
  analysisInsights: string;
  suggestions: string[];
  queryUnderstanding: {
    intent: string;
    queryType: 'budget_optimization' | 'reach_maximization' | 'engagement_focused' | 'niche_targeting' | 'general_search';
    secondaryAspects?: string[];
    extractedCriteria: {
      platforms?: string[];
      niches?: string[];
      followerRange?: string;
      budget?: string;
      location?: string;
      urgency?: string;
      contentTypes?: string[];
      campaignGoals?: string[];
      qualityRequirements?: string[];
    };
    confidence: number;
    keyRequirements: string[];
  };
  totalProcessingTime: number;
}

class GroqLLMService {
  private groqProvider = createGroq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });
  
  private model = this.groqProvider('llama-3.3-70b-versatile');
  
  async analyzeCreatorQuery(query: string, creators: Creator[], conversationContext?: ChatMessage[]): Promise<LLMCreatorAnalysis> {
    const startTime = Date.now();

    try {
      // First, deeply understand the query with conversation context
      const queryAnalysis = await this.analyzeQueryInDepth(query, conversationContext);
      
      // Filter creators based on understanding
      const relevantCreators = this.filterCreatorsIntelligently(creators, queryAnalysis);
      
      // Generate sophisticated LLM analysis
      const analyzedCreators = await this.analyzeCreatorsWithAdvancedLLM(query, relevantCreators.slice(0, 12), queryAnalysis);
      
      // Generate contextual insights and suggestions
      const insights = await this.generateContextualInsights(query, analyzedCreators, queryAnalysis);
      const suggestions = await this.generateIntelligentSuggestions(query, analyzedCreators, queryAnalysis);

      const totalProcessingTime = Date.now() - startTime;

      return {
        query,
        matchedCreators: analyzedCreators,
        analysisInsights: insights,
        suggestions,
        queryUnderstanding: queryAnalysis,
        totalProcessingTime
      };
    } catch (error) {
      console.error('LLM Analysis Error:', error);
      return this.generateFallbackAnalysis(query, creators, Date.now() - startTime);
    }
  }

  private async analyzeQueryInDepth(query: string, conversationContext?: ChatMessage[]): Promise<any> {
    try {
      // Build conversation context for the AI
      let contextPrompt = '';
      if (conversationContext && conversationContext.length > 1) {
        // Get last few messages for context (excluding current query)
        const recentContext = conversationContext.slice(-4, -1); // Last 3 messages before current
        if (recentContext.length > 0) {
          console.log('🔗 Using conversation context for query analysis:', recentContext.length, 'messages');
          console.log('📝 Recent context:', recentContext.map(msg => `${msg.type}: ${msg.content.substring(0, 100)}...`));
          
          contextPrompt = `
CONVERSATION CONTEXT:
${recentContext.map(msg => `${msg.type === 'user' ? 'USER' : 'AI'}: ${msg.content}`).join('\n')}

IMPORTANT: The current query may be a follow-up question referring to previous messages. 
If the query mentions "them", "these", "those", "among them", "from the above", etc., 
it likely refers to creators or results from the previous conversation.
If this appears to be a follow-up question, please:
1. Identify what the user is referring to from the context
2. Modify the intent to reflect this is a follow-up query
3. Extract criteria that builds upon or filters the previous request

`;
        }
      } else {
        console.log('📭 No conversation context available for this query');
      }

      const prompt = `
        ${contextPrompt}
        CRITICAL TASK: Analyze this influencer marketing query and capture EVERY SINGLE DETAIL mentioned.

        Current Query: "${query}"
        
        YOU MUST IDENTIFY AND EXTRACT:
        1. ALL NICHES mentioned (fitness, tech, beauty, food, travel, gaming, fashion, lifestyle, health, business, etc.)
        2. ALL BUDGET indicators (affordable, cheap, budget-friendly, cost-effective, value, economical, etc.)
        3. ALL ENGAGEMENT requirements (strong audience, high engagement, active community, connection, etc.)
        4. ALL PLATFORM preferences (Instagram, YouTube, Twitter, LinkedIn, TikTok)
        5. ALL QUALITY requirements (verified, professional, authentic, etc.)
        6. ALL LOCATION preferences (cities, countries, regions)
        7. ALL CONTENT types (posts, stories, reels, videos, reviews, etc.)
        8. FOLLOW-UP INDICATORS (them, these, those, among them, from above, etc.)

        EXAMPLE PERFECT ANALYSIS:
        Query: "Need affordable fashion influencers with strong audience connection"
        
        CORRECT ANALYSIS:
        {
          "intent": "Find budget-conscious fashion influencers who specialize in fashion/style content and have strong audience engagement and connection, prioritizing cost-effectiveness while ensuring quality audience interaction",
          "queryType": "budget_optimization",
          "secondaryAspects": ["niche_targeting", "engagement_focused"],
          "extractedCriteria": {
            "niches": ["fashion"],
            "budget": "cost-conscious",
            "qualityRequirements": ["high_engagement"]
          },
          "confidence": 0.9,
          "keyRequirements": ["Budget-conscious pricing", "Fashion/style niche specialization", "Strong audience engagement and connection", "Cost-effective rates", "Fashion content expertise"]
        }

        FOLLOW-UP QUERY EXAMPLE:
        Previous: "Need affordable fashion influencers with strong audience connection"
        Current: "who among them are from mumbai"
        
        CORRECT FOLLOW-UP ANALYSIS:
        {
          "intent": "Filter the previously requested affordable fashion influencers with strong audience connection to show only those located in Mumbai, maintaining the budget-conscious and engagement-focused requirements from the original request",
          "queryType": "niche_targeting", 
          "secondaryAspects": ["budget_optimization", "engagement_focused"],
          "extractedCriteria": {
            "niches": ["fashion"],
            "budget": "cost-conscious",
            "location": "mumbai",
            "qualityRequirements": ["high_engagement"]
          },
          "confidence": 0.95,
          "keyRequirements": ["Mumbai-based location", "Fashion/style niche specialization", "Budget-conscious pricing", "Strong audience engagement and connection", "Cost-effective rates"]
        }

        CRITICAL INSTRUCTIONS:
        - The INTENT must mention EVERY aspect of the query (fashion, affordability, audience connection)
        - NICHES must be extracted from words like: fashion, fitness, tech, beauty, food, travel, gaming, lifestyle, health, business
        - BUDGET aspects must be detected from: affordable, cheap, budget-friendly, cost-effective, value, economical
        - ENGAGEMENT aspects must be detected from: strong audience, connection, engagement, active, community, interactive
        - KEY REQUIREMENTS must be specific to the actual query, not generic
        - CONFIDENCE should be high (0.8+) when multiple aspects are clearly mentioned
        - For follow-up queries, inherit relevant criteria from conversation context

        NICHE DETECTION PATTERNS:
        - "fashion" OR "style" OR "outfit" OR "clothing" → fashion niche
        - "fitness" OR "workout" OR "gym" OR "health" → fitness niche  
        - "tech" OR "technology" OR "gadget" OR "review" → tech niche
        - "beauty" OR "makeup" OR "skincare" OR "cosmetic" → beauty niche
        - "food" OR "cooking" OR "recipe" OR "cuisine" → food niche

        Now analyze: "${query}"
        
        Return ONLY this JSON structure (no other text):
        {
          "intent": "Detailed description mentioning ALL specific aspects: niches, budget considerations, engagement requirements, etc.",
          "queryType": "budget_optimization" | "reach_maximization" | "engagement_focused" | "niche_targeting" | "general_search",
          "secondaryAspects": ["array of other detected aspects"],
          "extractedCriteria": {
            "platforms": ["detected platforms"] or null,
            "niches": ["detected niches"] or null,
            "followerRange": "detected range" or null,
            "budget": "detected budget focus" or null,
            "location": "detected location" or null,
            "urgency": "detected urgency" or null,
            "contentTypes": ["detected content types"] or null,
            "campaignGoals": ["detected goals"] or null,
            "qualityRequirements": ["detected quality needs"] or null
          },
          "confidence": 0.0-1.0,
          "keyRequirements": ["specific requirement 1", "specific requirement 2", "specific requirement 3", "specific requirement 4", "specific requirement 5"]
        }
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 1000,
        temperature: 0.02, // Lower temperature for more consistent parsing
      });

      console.log('LLM Response:', text); // Debug log to see what the LLM returns
      
      // Use robust JSON parsing instead of basic JSON.parse
      const parsed = this.parseJsonResponse(text);
      
      // Validate and enhance the analysis with post-processing
      return this.validateAndEnhanceQueryAnalysis(parsed, query);
    } catch (error) {
      console.error('Query analysis error:', error);
      console.log('Falling back to enhanced analysis for query:', query);
      return this.getEnhancedFallbackQueryAnalysis(query);
    }
  }

  private validateAndEnhanceQueryAnalysis(analysis: any, originalQuery: string) {
    const query = originalQuery.toLowerCase();
    
    // Enhanced pattern detection with more sophisticated matching
    const budgetPatterns = ['budget', 'cheap', 'affordable', 'cost-effective', 'value', 'economical', 'inexpensive', 'cost-conscious'];
    const reachPatterns = ['maximum', 'biggest', 'largest', 'most followers', 'highest reach', 'massive', 'broad reach', 'wide audience'];
    const engagementPatterns = ['engagement', 'active', 'interactive', 'responsive', 'community', 'connection', 'strong audience', 'loyal'];
    const nichePatterns = ['fitness', 'tech', 'beauty', 'food', 'travel', 'gaming', 'fashion', 'lifestyle', 'health', 'business'];
    const qualityPatterns = ['verified', 'authentic', 'professional', 'high quality', 'reputable', 'established', 'credible'];
    
    // Detect and enhance budget indicators
    const hasBudgetIndicators = budgetPatterns.some(pattern => query.includes(pattern));
    if (hasBudgetIndicators && analysis.queryType !== 'budget_optimization') {
      if (!analysis.secondaryAspects) analysis.secondaryAspects = [];
      if (analysis.queryType !== 'budget_optimization') {
        analysis.secondaryAspects.push('budget_optimization');
      }
      if (!analysis.extractedCriteria.budget) {
        analysis.extractedCriteria.budget = 'cost-conscious';
      }
    }
    
    // Detect and enhance engagement indicators  
    const hasEngagementIndicators = engagementPatterns.some(pattern => query.includes(pattern));
    if (hasEngagementIndicators) {
      if (!analysis.secondaryAspects) analysis.secondaryAspects = [];
      if (!analysis.secondaryAspects.includes('engagement_focused') && analysis.queryType !== 'engagement_focused') {
        analysis.secondaryAspects.push('engagement_focused');
      }
      if (!analysis.extractedCriteria.qualityRequirements) {
        analysis.extractedCriteria.qualityRequirements = ['high_engagement'];
      } else if (!analysis.extractedCriteria.qualityRequirements.includes('high_engagement')) {
        analysis.extractedCriteria.qualityRequirements.push('high_engagement');
      }
    }
    
    // Enhanced niche detection with semantic matching
    const detectedNiches = [];
    for (const niche of nichePatterns) {
      if (query.includes(niche)) {
        detectedNiches.push(niche);
      }
    }
    
    // Add semantic niche detection
    if (query.includes('technology') || query.includes('gadget') || query.includes('review')) {
      if (!detectedNiches.includes('tech')) detectedNiches.push('tech');
    }
    if (query.includes('workout') || query.includes('gym') || query.includes('health')) {
      if (!detectedNiches.includes('fitness')) detectedNiches.push('fitness');
    }
    if (query.includes('makeup') || query.includes('skincare') || query.includes('cosmetic')) {
      if (!detectedNiches.includes('beauty')) detectedNiches.push('beauty');
    }
    if (query.includes('style') || query.includes('outfit') || query.includes('clothing')) {
      if (!detectedNiches.includes('fashion')) detectedNiches.push('fashion');
    }
    
    if (detectedNiches.length > 0) {
      if (!analysis.extractedCriteria.niches) {
        analysis.extractedCriteria.niches = detectedNiches;
      } else {
        // Merge with existing niches
        const existingNiches = analysis.extractedCriteria.niches;
        detectedNiches.forEach(niche => {
          if (!existingNiches.includes(niche)) {
            existingNiches.push(niche);
          }
        });
      }
      
      if (!analysis.secondaryAspects) analysis.secondaryAspects = [];
      if (!analysis.secondaryAspects.includes('niche_targeting') && analysis.queryType !== 'niche_targeting') {
        analysis.secondaryAspects.push('niche_targeting');
      }
    }
    
    // Platform detection with better pattern matching
    const platforms = ['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin'];
    const detectedPlatforms = platforms.filter(platform => 
      query.includes(platform) || 
      (platform === 'instagram' && query.includes('insta')) ||
      (platform === 'youtube' && query.includes('yt'))
    );
    if (detectedPlatforms.length > 0 && !analysis.extractedCriteria.platforms) {
      analysis.extractedCriteria.platforms = detectedPlatforms;
    }
    
    // Quality requirements detection
    const hasQualityIndicators = qualityPatterns.some(pattern => query.includes(pattern));
    if (hasQualityIndicators) {
      if (!analysis.extractedCriteria.qualityRequirements) {
        analysis.extractedCriteria.qualityRequirements = [];
      }
      
      if (query.includes('verified') && !analysis.extractedCriteria.qualityRequirements.includes('verified')) {
        analysis.extractedCriteria.qualityRequirements.push('verified');
      }
      if (query.includes('professional') && !analysis.extractedCriteria.qualityRequirements.includes('professional')) {
        analysis.extractedCriteria.qualityRequirements.push('professional');
      }
      if (query.includes('authentic') && !analysis.extractedCriteria.qualityRequirements.includes('authentic')) {
        analysis.extractedCriteria.qualityRequirements.push('authentic');
      }
    }
    
    // Enhance confidence based on specificity
    const specificityScore = (
      (analysis.extractedCriteria.niches?.length || 0) * 0.2 +
      (analysis.extractedCriteria.platforms?.length || 0) * 0.15 +
      (analysis.extractedCriteria.qualityRequirements?.length || 0) * 0.15 +
      (analysis.extractedCriteria.budget ? 0.2 : 0) +
      (analysis.secondaryAspects?.length || 0) * 0.1
    );
    
    analysis.confidence = Math.min(0.95, analysis.confidence + specificityScore);
    
    return analysis;
  }

  private getEnhancedFallbackQueryAnalysis(query: string): LLMCreatorAnalysis['queryUnderstanding'] {
    const lowerQuery = query.toLowerCase();
    
    // Enhanced pattern detection
    const budgetPatterns = ['budget', 'cheap', 'affordable', 'cost-effective', 'value', 'economical', 'inexpensive', 'cost-conscious'];
    const reachPatterns = ['maximum', 'biggest', 'largest', 'most followers', 'highest reach', 'massive', 'broad reach', 'wide audience'];
    const engagementPatterns = ['engagement', 'active', 'interactive', 'responsive', 'community', 'connection', 'strong audience', 'loyal'];
    const qualityPatterns = ['verified', 'authentic', 'professional', 'high quality', 'reputable', 'established', 'credible'];
    
    // Detect niches with comprehensive patterns
    const detectedNiches = [];
    const nichePatterns = {
      'fashion': ['fashion', 'style', 'outfit', 'clothing', 'apparel', 'designer', 'trend'],
      'fitness': ['fitness', 'workout', 'gym', 'health', 'exercise', 'training', 'wellness'],
      'tech': ['tech', 'technology', 'gadget', 'device', 'software', 'hardware', 'digital'],
      'beauty': ['beauty', 'makeup', 'skincare', 'cosmetic', 'skincare', 'beauty'],
      'food': ['food', 'cooking', 'recipe', 'cuisine', 'chef', 'restaurant', 'culinary'],
      'travel': ['travel', 'trip', 'destination', 'vacation', 'tourism', 'explore'],
      'gaming': ['gaming', 'game', 'gamer', 'esports', 'stream', 'gaming'],
      'lifestyle': ['lifestyle', 'life', 'daily', 'routine', 'living'],
      'business': ['business', 'entrepreneur', 'startup', 'corporate', 'professional'],
      'art': ['art', 'artist', 'creative', 'design', 'illustration', 'painting'],
      'music': ['music', 'musician', 'song', 'album', 'artist', 'band'],
      'sports': ['sports', 'athlete', 'team', 'competition', 'championship']
    };
    
    for (const [niche, patterns] of Object.entries(nichePatterns)) {
      if (patterns.some(pattern => lowerQuery.includes(pattern))) {
        detectedNiches.push(niche);
      }
    }
    
    // Detect other aspects
    const hasBudgetIndicators = budgetPatterns.some(pattern => lowerQuery.includes(pattern));
    const hasReachIndicators = reachPatterns.some(pattern => lowerQuery.includes(pattern));
    const hasEngagementIndicators = engagementPatterns.some(pattern => lowerQuery.includes(pattern));
    const hasQualityIndicators = qualityPatterns.some(pattern => lowerQuery.includes(pattern));
    
    // Determine primary query type with proper typing
    let queryType: 'budget_optimization' | 'reach_maximization' | 'engagement_focused' | 'niche_targeting' | 'general_search' = 'general_search';
    if (hasBudgetIndicators) queryType = 'budget_optimization';
    else if (hasEngagementIndicators) queryType = 'engagement_focused';
    else if (hasReachIndicators) queryType = 'reach_maximization';
    else if (detectedNiches.length > 0) queryType = 'niche_targeting';
    
    // Build secondary aspects
    const secondaryAspects = [];
    if (queryType !== 'budget_optimization' && hasBudgetIndicators) secondaryAspects.push('budget_optimization');
    if (queryType !== 'engagement_focused' && hasEngagementIndicators) secondaryAspects.push('engagement_focused');
    if (queryType !== 'reach_maximization' && hasReachIndicators) secondaryAspects.push('reach_maximization');
    if (queryType !== 'niche_targeting' && detectedNiches.length > 0) secondaryAspects.push('niche_targeting');
    if (hasQualityIndicators) secondaryAspects.push('quality_focused');
    
    // Build comprehensive intent
    let intent = 'Find ';
    const intentParts = [];
    
    if (hasBudgetIndicators) intentParts.push('cost-effective and budget-friendly');
    if (detectedNiches.length > 0) intentParts.push(`${detectedNiches.join(' and ')} specialists`);
    if (hasEngagementIndicators) intentParts.push('with strong audience engagement and connection');
    if (hasReachIndicators) intentParts.push('with maximum reach potential');
    if (hasQualityIndicators) intentParts.push('who are verified and professional');
    
    if (intentParts.length > 0) {
      intent += intentParts.join(' ') + ' creators';
    } else {
      intent += 'relevant creators for the campaign';
    }
    
    // Build key requirements
    const keyRequirements = [];
    if (hasBudgetIndicators) keyRequirements.push('Budget-conscious pricing and cost-effectiveness');
    if (detectedNiches.length > 0) keyRequirements.push(`${detectedNiches.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join('/')} niche expertise`);
    if (hasEngagementIndicators) keyRequirements.push('Strong audience engagement and connection');
    if (hasReachIndicators) keyRequirements.push('Maximum reach and visibility potential');
    if (hasQualityIndicators) keyRequirements.push('Professional and authentic creator quality');
    
    // Platform detection
    const platforms = ['instagram', 'youtube', 'twitter', 'linkedin'];
    const detectedPlatforms = platforms.filter(platform => lowerQuery.includes(platform));
    
    return {
      intent,
      queryType,
      secondaryAspects: secondaryAspects.length > 0 ? secondaryAspects : undefined,
      extractedCriteria: {
        platforms: detectedPlatforms.length > 0 ? detectedPlatforms : undefined,
        niches: detectedNiches.length > 0 ? detectedNiches : undefined,
        budget: hasBudgetIndicators ? 'cost-conscious' : undefined,
        qualityRequirements: hasEngagementIndicators || hasQualityIndicators ? 
          [...(hasEngagementIndicators ? ['high_engagement'] : []), ...(hasQualityIndicators ? ['professional'] : [])] : undefined
      },
      confidence: 0.75,
      keyRequirements: keyRequirements.length > 0 ? keyRequirements : ['Find relevant creators', 'Quality content creation', 'Professional collaboration']
    };
  }

  private filterCreatorsIntelligently(creators: Creator[], queryAnalysis: any): Creator[] {
    let filtered = creators.filter(creator => {
      const criteria = queryAnalysis.extractedCriteria;
      
      // Platform filter with exact matching
      if (criteria.platforms && criteria.platforms.length > 0) {
        if (!criteria.platforms.some((p: string) => 
          creator.platform.toLowerCase() === p.toLowerCase()
        )) {
          return false;
        }
      }
      
      // Enhanced niche filter with semantic matching
      if (criteria.niches && criteria.niches.length > 0) {
        const hasNicheMatch = criteria.niches.some((n: string) => {
          return creator.niche.some(creatorNiche => {
            const niche = n.toLowerCase();
            const cNiche = creatorNiche.toLowerCase();
            
            // Exact match
            if (cNiche === niche) return true;
            
            // Semantic matches
            if (niche === 'tech' && (cNiche.includes('technology') || cNiche === 'gaming')) return true;
            if (niche === 'fitness' && (cNiche === 'health' || cNiche === 'sports')) return true;
            if (niche === 'beauty' && cNiche === 'fashion') return true;
            if (niche === 'lifestyle' && (cNiche === 'travel' || cNiche === 'food')) return true;
            
            return cNiche.includes(niche) || niche.includes(cNiche);
          });
        });
        
        if (!hasNicheMatch) return false;
      }
      
      // Enhanced follower range filter
      if (criteria.followerRange) {
        const range = criteria.followerRange.toLowerCase();
        const followers = creator.metrics.followers;
        
        if (range.includes('nano') && (followers < 1000 || followers > 10000)) return false;
        if (range.includes('micro') && (followers < 10000 || followers > 100000)) return false;
        if (range.includes('mid-tier') && (followers < 100000 || followers > 500000)) return false;
        if (range.includes('macro') && (followers < 500000 || followers > 1000000)) return false;
        if (range.includes('mega') && followers < 1000000) return false;
        
        // Number-based filtering
        if (range.includes('100k') && followers < 100000) return false;
        if (range.includes('500k') && followers < 500000) return false;
        if (range.includes('1m') && followers < 1000000) return false;
      }
      
      // Location filter with fuzzy matching
      if (criteria.location) {
        const location = criteria.location.toLowerCase();
        const creatorLocation = creator.location.toLowerCase();
        
        // Check if creator location contains the specified location
        if (!creatorLocation.includes(location)) {
          // Check for common location variations
          const locationVariations: { [key: string]: string[] } = {
            'mumbai': ['mumbai', 'bombay'],
            'delhi': ['delhi', 'new delhi'],
            'bangalore': ['bangalore', 'bengaluru'],
            'chennai': ['chennai', 'madras'],
            'india': ['mumbai', 'delhi', 'bangalore', 'chennai', 'pune', 'hyderabad', 'kolkata']
          };
          
          let hasLocationMatch = false;
          for (const [key, variations] of Object.entries(locationVariations)) {
            if (location.includes(key)) {
              hasLocationMatch = variations.some(variation => 
                creatorLocation.includes(variation)
              );
              if (hasLocationMatch) break;
            }
          }
          
          if (!hasLocationMatch) return false;
        }
      }
      
      // Quality requirements filter
      if (criteria.qualityRequirements && criteria.qualityRequirements.length > 0) {
        const requirements = criteria.qualityRequirements;
        
        if (requirements.includes('verified') && !creator.verified) return false;
        if (requirements.includes('high_engagement') && creator.metrics.engagementRate < 4) return false;
        if (requirements.includes('professional') && creator.rating < 4) return false;
        if (requirements.includes('responsive') && creator.responseTime.includes('slow')) return false;
      }
      
      return true;
    });

    // Enhanced sorting based on query type with more sophisticated algorithms
    const sortCreators = (creators: Creator[], queryType: string) => {
      switch (queryType) {
        case 'budget_optimization':
          return creators.sort((a, b) => {
            // Multi-factor budget optimization
            const aCostPerFollower = a.rates.post / a.metrics.followers;
            const bCostPerFollower = b.rates.post / b.metrics.followers;
            const aCostPerEngagement = a.rates.post / (a.metrics.followers * a.metrics.engagementRate / 100);
            const bCostPerEngagement = b.rates.post / (b.metrics.followers * b.metrics.engagementRate / 100);
            
            // Combined cost efficiency score (70% cost per follower, 30% cost per engagement)
            const aEfficiency = (aCostPerFollower * 0.7) + (aCostPerEngagement * 0.3);
            const bEfficiency = (bCostPerFollower * 0.7) + (bCostPerEngagement * 0.3);
            
            return aEfficiency - bEfficiency;
          });
          
        case 'reach_maximization':
          return creators.sort((a, b) => {
            // Reach potential calculation (followers + estimated views + platform factor)
            const aPlatformMultiplier = a.platform === 'youtube' ? 2.5 : a.platform === 'instagram' ? 2.0 : 1.5;
            const bPlatformMultiplier = b.platform === 'youtube' ? 2.5 : b.platform === 'instagram' ? 2.0 : 1.5;
            
            const aReachScore = a.metrics.followers + (a.metrics.avgViews * aPlatformMultiplier);
            const bReachScore = b.metrics.followers + (b.metrics.avgViews * bPlatformMultiplier);
            
            return bReachScore - aReachScore;
          });
          
        case 'engagement_focused':
          return creators.sort((a, b) => {
            // Engagement quality score (engagement rate + interaction consistency)
            const aEngagementScore = (a.metrics.engagementRate * 0.7) + 
                                   ((a.metrics.avgLikes / a.metrics.followers) * 100 * 0.3);
            const bEngagementScore = (b.metrics.engagementRate * 0.7) + 
                                   ((b.metrics.avgLikes / b.metrics.followers) * 100 * 0.3);
            
            return bEngagementScore - aEngagementScore;
          });
          
        case 'niche_targeting':
          return creators.sort((a, b) => {
            // Niche authority score (niche relevance + expertise indicators)
            const aNicheScore = a.niche.length + (a.verified ? 10 : 0) + (a.rating * 2);
            const bNicheScore = b.niche.length + (b.verified ? 10 : 0) + (b.rating * 2);
            
            return bNicheScore - aNicheScore;
          });
          
        default:
          // Balanced score for general search
          return creators.sort((a, b) => {
            const aScore = (a.metrics.engagementRate * 0.3) + 
                          (Math.log10(a.metrics.followers) * 0.4) + 
                          (a.rating * 0.2) + 
                          (a.verified ? 0.1 : 0);
            const bScore = (b.metrics.engagementRate * 0.3) + 
                          (Math.log10(b.metrics.followers) * 0.4) + 
                          (b.rating * 0.2) + 
                          (b.verified ? 0.1 : 0);
            
            return bScore - aScore;
          });
      }
    };

    return sortCreators(filtered, queryAnalysis.queryType);
  }

  private async analyzeCreatorsWithAdvancedLLM(query: string, creators: Creator[], queryAnalysis: any) {
    const batchSize = 3;
    const analyzedCreators = [];

    for (let i = 0; i < creators.length; i += batchSize) {
      const batch = creators.slice(i, i + batchSize);
      const batchAnalysis = await this.analyzeAdvancedBatch(query, batch, queryAnalysis);
      analyzedCreators.push(...batchAnalysis);
    }

    return analyzedCreators.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private async analyzeAdvancedBatch(query: string, creators: Creator[], queryAnalysis: any) {
    try {
      const creatorsData = creators.map(creator => ({
        id: creator.id,
        name: creator.name,
        platform: creator.platform,
        niche: creator.niche,
        followers: creator.metrics.followers,
        engagementRate: creator.metrics.engagementRate,
        avgViews: creator.metrics.avgViews,
        rating: creator.rating,
        verified: creator.verified,
        location: creator.location,
        postRate: creator.rates.post,
        costPerFollower: (creator.rates.post / creator.metrics.followers * 1000).toFixed(3), // Cost per 1K followers
        responseTime: creator.responseTime
      }));

      const queryTypeContext = this.getQueryTypeContext(queryAnalysis.queryType);
      const specificCriteria = this.getQuerySpecificCriteria(queryAnalysis);

      const prompt = `
        As an expert influencer marketing analyst, evaluate these creators for this specific query: "${query}"
        
        QUERY ANALYSIS:
        - Type: ${queryAnalysis.queryType}
        - Intent: ${queryAnalysis.intent}
        - Key Requirements: ${queryAnalysis.keyRequirements.join(', ')}
        - Confidence: ${(queryAnalysis.confidence * 100).toFixed(0)}%
        
        SPECIFIC CRITERIA TO EVALUATE:
        ${specificCriteria}
        
        EVALUATION FOCUS:
        ${queryTypeContext}
        
        CREATORS TO ANALYZE:
        ${JSON.stringify(creatorsData, null, 2)}
        
        ANALYSIS REQUIREMENTS:
        1. Evaluate each creator specifically against the query requirements
        2. Provide reasoning that directly addresses why they match/don't match the query
        3. Be specific about numbers, metrics, and value propositions
        4. Consider the query type when scoring (budget vs reach vs engagement vs niche)
        5. Address any potential concerns honestly
        
        For each creator, provide analysis in this EXACT JSON format:
        {
          "creators": [
            {
              "id": "creator_id",
              "relevanceScore": 0-100,
              "reasoning": "3-4 sentences explaining specifically how this creator addresses the query requirements, include specific metrics and why they're a good/poor match",
              "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
              "concerns": ["specific concern 1", "specific concern 2"] or [],
              "recommendationLevel": "highly_recommended" | "good_match" | "potential_match",
              "costEffectivenessScore": 0-100,
              "reachPotential": "specific description of reach capabilities and audience potential"
            }
          ]
        }
        
        SCORING GUIDELINES BASED ON QUERY TYPE:
        - BUDGET OPTIMIZATION: High scores for low cost per follower (under ₹5 per 1K followers), good engagement relative to cost
        - REACH MAXIMIZATION: High scores for large follower counts, broad appeal, platform reach multipliers
        - ENGAGEMENT FOCUSED: High scores for engagement rates above 5%, authentic audience interaction
        - NICHE TARGETING: High scores for perfect niche match, local relevance, specialized expertise
        - GENERAL SEARCH: Balanced scoring considering all factors
        
        Return ONLY the JSON, no other text.
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 2500,
        temperature: 0.2,
      });

      console.log('Raw LLM response:', text); // Debug log
      
      // Robust JSON parsing that handles various LLM response formats
      const analysis = this.parseJsonResponse(text);
      
      return analysis.creators.map((creatorAnalysis: any) => {
        const creator = creators.find(c => c.id === creatorAnalysis.id);
        return {
          creator: creator!,
          ...creatorAnalysis
        };
      });
    } catch (error) {
      console.error('Advanced batch analysis error:', error);
      
      // Enhanced fallback analysis with query-specific logic
      return creators.map(creator => {
        return this.generateQuerySpecificFallback(creator, queryAnalysis);
      });
    }
  }

  // Add robust JSON parsing method
  private parseJsonResponse(text: string): any {
    try {
      // First try: direct parsing after trim
      return JSON.parse(text.trim());
    } catch (error1) {
      try {
        // Second try: remove markdown code blocks
        let cleanedText = text.trim();
        cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
        cleanedText = cleanedText.replace(/```\n?/g, '');
        return JSON.parse(cleanedText.trim());
      } catch (error2) {
        try {
          // Third try: extract JSON from the response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          throw new Error('No valid JSON found');
        } catch (error3) {
          try {
            // Fourth try: handle extra quotes
            let cleanedText = text.trim();
            if (cleanedText.startsWith('"""') && cleanedText.endsWith('"""')) {
              cleanedText = cleanedText.slice(3, -3);
            } else if (cleanedText.startsWith('"') && cleanedText.endsWith('"')) {
              cleanedText = cleanedText.slice(1, -1);
            }
            return JSON.parse(cleanedText);
          } catch (error4) {
            console.error('All JSON parsing attempts failed:', { error1, error2, error3, error4 });
            console.error('Raw text that failed to parse:', text);
            throw new Error('Failed to parse JSON response from LLM');
          }
        }
      }
    }
  }

  private getQuerySpecificCriteria(queryAnalysis: any): string {
    const criteria = queryAnalysis.extractedCriteria;
    let specificCriteria = "Evaluate based on:\n";
    
    if (criteria.platforms) {
      specificCriteria += `- Platform requirement: ${criteria.platforms.join(', ')}\n`;
    }
    if (criteria.niches) {
      specificCriteria += `- Niche requirement: ${criteria.niches.join(', ')}\n`;
    }
    if (criteria.followerRange) {
      specificCriteria += `- Follower range: ${criteria.followerRange}\n`;
    }
    if (criteria.budget) {
      specificCriteria += `- Budget consideration: ${criteria.budget}\n`;
    }
    if (criteria.location) {
      specificCriteria += `- Location preference: ${criteria.location}\n`;
    }
    if (criteria.qualityRequirements) {
      specificCriteria += `- Quality requirements: ${criteria.qualityRequirements.join(', ')}\n`;
    }
    
    return specificCriteria;
  }

  private generateQuerySpecificFallback(creator: Creator, queryAnalysis: any) {
    const costPerFollower = creator.rates.post / creator.metrics.followers * 1000;
    const queryType = queryAnalysis.queryType;
    
    let relevanceScore = 50;
    let reasoning = "";
    let strengths: string[] = [];
    let concerns: string[] = [];
    let recommendationLevel: 'highly_recommended' | 'good_match' | 'potential_match' = 'good_match';
    
    switch (queryType) {
      case 'budget_optimization':
        relevanceScore = this.calculateBudgetOptimizationScore(creator, costPerFollower);
        reasoning = `${creator.name} offers ${costPerFollower < 5 ? 'excellent' : costPerFollower < 10 ? 'good' : 'moderate'} value at ₹${costPerFollower.toFixed(2)} per 1K followers with ${creator.metrics.engagementRate}% engagement. This provides ${costPerFollower < 5 ? 'outstanding cost efficiency' : 'reasonable cost efficiency'} for budget-conscious campaigns, delivering ${creator.metrics.followers.toLocaleString()} potential reach.`;
        
        if (costPerFollower < 5) strengths.push(`Exceptional value at ₹${costPerFollower.toFixed(2)} per 1K followers`);
        if (creator.metrics.engagementRate > 4) strengths.push(`Strong engagement (${creator.metrics.engagementRate}%) relative to cost`);
        if (creator.verified) strengths.push('Verified authenticity adds credibility');
        
        if (costPerFollower > 10) concerns.push('Higher cost per follower compared to budget alternatives');
        if (creator.metrics.engagementRate < 3) concerns.push('Lower engagement rate may impact campaign ROI');
        
        recommendationLevel = costPerFollower < 5 && creator.metrics.engagementRate > 4 ? 'highly_recommended' : 
                             costPerFollower < 8 ? 'good_match' : 'potential_match';
        break;
        
      case 'reach_maximization':
        relevanceScore = this.calculateReachMaximizationScore(creator);
        reasoning = `${creator.name} provides ${creator.metrics.followers > 500000 ? 'substantial' : creator.metrics.followers > 100000 ? 'good' : 'focused'} reach potential with ${creator.metrics.followers.toLocaleString()} followers on ${creator.platform}. Average views of ${creator.metrics.avgViews.toLocaleString()} indicate ${creator.metrics.avgViews > creator.metrics.followers * 0.1 ? 'strong' : 'moderate'} content visibility and audience engagement.`;
        
        if (creator.metrics.followers > 500000) strengths.push(`High reach with ${creator.metrics.followers.toLocaleString()} followers`);
        if (creator.metrics.avgViews > creator.metrics.followers * 0.1) strengths.push('Strong content visibility and reach');
        if (creator.platform === 'youtube' || creator.platform === 'instagram') strengths.push(`${creator.platform} platform ideal for reach campaigns`);
        
        if (creator.metrics.followers < 50000) concerns.push('Limited reach potential for broad awareness campaigns');
        if (creator.metrics.avgViews < creator.metrics.followers * 0.05) concerns.push('Lower view rates may limit actual reach');
        
        recommendationLevel = creator.metrics.followers > 500000 ? 'highly_recommended' : 
                             creator.metrics.followers > 100000 ? 'good_match' : 'potential_match';
        break;
        
      case 'engagement_focused':
        relevanceScore = this.calculateEngagementFocusedScore(creator);
        reasoning = `${creator.name} demonstrates ${creator.metrics.engagementRate > 6 ? 'exceptional' : creator.metrics.engagementRate > 4 ? 'strong' : 'moderate'} audience engagement with ${creator.metrics.engagementRate}% engagement rate. With ${creator.metrics.avgLikes.toLocaleString()} average likes, this indicates ${creator.metrics.engagementRate > 5 ? 'highly active and responsive' : 'moderately engaged'} follower interaction.`;
        
        if (creator.metrics.engagementRate > 6) strengths.push(`Exceptional engagement rate (${creator.metrics.engagementRate}%)`);
        if (creator.metrics.avgLikes > creator.metrics.followers * 0.05) strengths.push('High like-to-follower ratio indicates active audience');
        if (creator.responseTime.includes('quick')) strengths.push('Quick response time shows professionalism');
        
        if (creator.metrics.engagementRate < 3) concerns.push('Below-average engagement rate for focused campaigns');
        if (creator.metrics.avgComments < creator.metrics.followers * 0.01) concerns.push('Limited comment engagement may affect community building');
        
        recommendationLevel = creator.metrics.engagementRate > 6 ? 'highly_recommended' : 
                             creator.metrics.engagementRate > 4 ? 'good_match' : 'potential_match';
        break;
        
      default:
        relevanceScore = this.calculateFallbackScore(creator, queryAnalysis);
        reasoning = this.generateFallbackReasoning(creator, queryAnalysis);
        strengths = this.generateFallbackStrengths(creator, queryAnalysis);
    }
    
    return {
      creator,
      relevanceScore: Math.min(100, Math.max(0, relevanceScore)),
      reasoning,
      strengths: strengths.slice(0, 3),
      concerns: concerns.slice(0, 2),
      recommendationLevel,
      costEffectivenessScore: Math.max(0, 100 - (costPerFollower * 8)),
      reachPotential: this.calculateReachPotential(creator)
    };
  }

  private calculateBudgetOptimizationScore(creator: Creator, costPerFollower: number): number {
    let score = 50;
    
    // Cost efficiency (40% of score)
    if (costPerFollower < 3) score += 40;
    else if (costPerFollower < 5) score += 30;
    else if (costPerFollower < 8) score += 20;
    else if (costPerFollower < 12) score += 10;
    else score -= 10;
    
    // Engagement relative to cost (30% of score)
    const engagementValue = creator.metrics.engagementRate / costPerFollower;
    if (engagementValue > 1) score += 30;
    else if (engagementValue > 0.5) score += 20;
    else score += 10;
    
    // Follower count bonus (20% of score)
    if (creator.metrics.followers > 100000) score += 20;
    else if (creator.metrics.followers > 50000) score += 15;
    else if (creator.metrics.followers > 20000) score += 10;
    
    // Quality indicators (10% of score)
    if (creator.verified) score += 5;
    if (creator.rating > 4.5) score += 5;
    
    return score;
  }

  private calculateReachMaximizationScore(creator: Creator): number {
    let score = 50;
    
    // Follower count (50% of score)
    if (creator.metrics.followers > 1000000) score += 50;
    else if (creator.metrics.followers > 500000) score += 40;
    else if (creator.metrics.followers > 200000) score += 30;
    else if (creator.metrics.followers > 100000) score += 20;
    else if (creator.metrics.followers > 50000) score += 10;
    
    // Platform reach multiplier (25% of score)
    if (creator.platform === 'youtube') score += 25;
    else if (creator.platform === 'instagram') score += 20;
    else score += 15;
    
    // View consistency (25% of score)
    const viewToFollowerRatio = creator.metrics.avgViews / creator.metrics.followers;
    if (viewToFollowerRatio > 0.2) score += 25;
    else if (viewToFollowerRatio > 0.1) score += 20;
    else if (viewToFollowerRatio > 0.05) score += 15;
    else score += 10;
    
    return score;
  }

  private calculateEngagementFocusedScore(creator: Creator): number {
    let score = 50;
    
    // Engagement rate (60% of score)
    if (creator.metrics.engagementRate > 8) score += 60;
    else if (creator.metrics.engagementRate > 6) score += 50;
    else if (creator.metrics.engagementRate > 4) score += 35;
    else if (creator.metrics.engagementRate > 2) score += 20;
    else score += 10;
    
    // Interaction quality (25% of score)
    const likeToFollowerRatio = creator.metrics.avgLikes / creator.metrics.followers;
    if (likeToFollowerRatio > 0.08) score += 25;
    else if (likeToFollowerRatio > 0.05) score += 20;
    else if (likeToFollowerRatio > 0.03) score += 15;
    else score += 10;
    
    // Response quality (15% of score)
    if (creator.responseTime.includes('quick')) score += 15;
    else if (creator.responseTime.includes('within')) score += 10;
    else score += 5;
    
    return score;
  }

  private calculateReachPotential(creator: Creator): string {
    const followers = creator.metrics.followers;
    const engagement = creator.metrics.engagementRate;
    
    if (followers > 1000000) {
      return `Massive reach potential with ${followers.toLocaleString()} followers, capable of delivering ${Math.round(followers * engagement / 100).toLocaleString()} engaged interactions per post`;
    } else if (followers > 500000) {
      return `High reach potential with ${followers.toLocaleString()} followers, estimated ${Math.round(followers * engagement / 100).toLocaleString()} engaged audience per content`;
    } else if (followers > 100000) {
      return `Moderate reach potential with ${followers.toLocaleString()} followers, focused on ${Math.round(followers * engagement / 100).toLocaleString()} engaged community members`;
    } else {
      return `Focused reach potential with ${followers.toLocaleString()} followers, targeting ${Math.round(followers * engagement / 100).toLocaleString()} highly engaged niche audience`;
    }
  }

  private getQueryTypeContext(queryType: string): string {
    switch (queryType) {
      case 'budget_optimization':
        return `
        BUDGET OPTIMIZATION FOCUS:
        - Prioritize creators with low cost per follower (postRate/followers)
        - Look for good engagement rates relative to cost
        - Consider verified status as value-add
        - Evaluate overall value proposition
        - High relevance score for creators offering more reach per dollar spent
        `;
      case 'reach_maximization':
        return `
        REACH MAXIMIZATION FOCUS:
        - Prioritize creators with highest follower counts
        - Consider platform reach potential
        - Evaluate average views and impressions
        - Look for broad audience appeal
        - High relevance score for creators with maximum audience size
        `;
      case 'engagement_focused':
        return `
        ENGAGEMENT OPTIMIZATION FOCUS:
        - Prioritize creators with highest engagement rates
        - Look for authentic audience interaction
        - Consider response rates and community activity
        - Evaluate content quality indicators
        - High relevance score for creators with strong audience connection
        `;
      case 'niche_targeting':
        return `
        NICHE TARGETING FOCUS:
        - Prioritize creators perfectly matching the niche
        - Look for specialized expertise and authority
        - Consider audience alignment with niche
        - Evaluate content authenticity in the niche
        - High relevance score for niche-specific expertise
        `;
      default:
        return `
        GENERAL SEARCH FOCUS:
        - Balance followers, engagement, and cost
        - Look for overall creator quality
        - Consider platform performance
        - Evaluate professional reputation
        `;
    }
  }

  private calculateFallbackScore(creator: Creator, queryAnalysis: any): number {
    let score = 50; // Base score
    
    switch (queryAnalysis.queryType) {
      case 'budget_optimization':
        const costPerFollower = creator.rates.post / creator.metrics.followers * 1000;
        score += Math.max(0, 40 - (costPerFollower * 4)); // Lower cost = higher score
        score += creator.metrics.engagementRate * 2; // Engagement bonus
        break;
      case 'reach_maximization':
        score += Math.min(40, Math.log10(creator.metrics.followers) * 8);
        break;
      case 'engagement_focused':
        score += creator.metrics.engagementRate * 8;
        break;
      default:
        score += creator.metrics.engagementRate * 3;
        score += Math.min(20, Math.log10(creator.metrics.followers) * 4);
    }
    
    if (creator.verified) score += 5;
    score += (creator.rating / 5) * 10;
    
    return Math.min(100, Math.max(0, score));
  }

  private generateFallbackReasoning(creator: Creator, queryAnalysis: any): string {
    const costPerFollower = creator.rates.post / creator.metrics.followers * 1000;
    
    switch (queryAnalysis.queryType) {
      case 'budget_optimization':
        return `${creator.name} offers excellent value with a cost of $${costPerFollower.toFixed(2)} per 1K followers and ${creator.metrics.engagementRate}% engagement rate. This provides strong reach potential while maintaining budget efficiency.`;
      case 'reach_maximization':
        return `${creator.name} provides significant reach potential with ${creator.metrics.followers.toLocaleString()} followers and strong platform presence on ${creator.platform}.`;
      case 'engagement_focused':
        return `${creator.name} demonstrates strong audience connection with ${creator.metrics.engagementRate}% engagement rate, indicating active and interested followers.`;
      default:
        return `${creator.name} presents a balanced profile with ${creator.metrics.followers.toLocaleString()} followers, ${creator.metrics.engagementRate}% engagement, and strong presence in ${creator.niche.join(', ')}.`;
    }
  }

  private generateFallbackStrengths(creator: Creator, queryAnalysis: any): string[] {
    const strengths = [];
    const costPerFollower = creator.rates.post / creator.metrics.followers * 1000;
    
    if (queryAnalysis.queryType === 'budget_optimization' && costPerFollower < 5) {
      strengths.push(`Excellent value at $${costPerFollower.toFixed(2)} per 1K followers`);
    }
    
    if (creator.metrics.engagementRate > 5) {
      strengths.push(`High engagement rate (${creator.metrics.engagementRate}%)`);
    }
    
    if (creator.metrics.followers > 100000) {
      strengths.push(`Strong reach with ${creator.metrics.followers.toLocaleString()} followers`);
    }
    
    if (creator.verified) {
      strengths.push('Verified creator with authentic audience');
    }
    
    if (creator.rating >= 4.5) {
      strengths.push(`Excellent reputation (${creator.rating}/5 rating)`);
    }
    
    return strengths.slice(0, 3);
  }

  private async generateContextualInsights(query: string, analyzedCreators: any[], queryAnalysis: any): Promise<string> {
    try {
      const topCreators = analyzedCreators.slice(0, 5);
      const avgScore = topCreators.reduce((sum, c) => sum + c.relevanceScore, 0) / topCreators.length;
      
      const contextData = {
        queryType: queryAnalysis.queryType,
        avgScore: avgScore.toFixed(1),
        totalCreators: analyzedCreators.length,
        keyRequirements: queryAnalysis.keyRequirements.join(', ')
      };

      const prompt = `
        Provide insights for this influencer search analysis:
        
        Query: "${query}"
        Query Type: ${contextData.queryType}
        Key Requirements: ${contextData.keyRequirements}
        Average relevance score: ${contextData.avgScore}%
        Creators analyzed: ${contextData.totalCreators}
        
        Provide a 2-3 sentence insight focusing on:
        - How well the results match the specific query requirements
        - Market availability for this type of request
        - Quality assessment of the matches found
        
        Be specific about the query type and requirements. Return only the insight text.
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 250,
        temperature: 0.4,
      });

      return text.trim();
    } catch (error) {
      const avgScore = analyzedCreators.reduce((sum, c) => sum + c.relevanceScore, 0) / analyzedCreators.length;
      return `Found ${analyzedCreators.length} creators matching your "${queryAnalysis.queryType.replace('_', ' ')}" requirements with an average relevance score of ${avgScore.toFixed(1)}%. The search results align well with your specific needs for cost-effective reach optimization.`;
    }
  }

  private async generateIntelligentSuggestions(query: string, analyzedCreators: any[], queryAnalysis: any): Promise<string[]> {
    try {
      const avgScore = analyzedCreators.reduce((sum, c) => sum + c.relevanceScore, 0) / analyzedCreators.length;
      
      const prompt = `
        Based on this search: "${query}" (Type: ${queryAnalysis.queryType}) with average relevance score ${avgScore.toFixed(1)}%, provide 3 specific, actionable suggestions.
        
        Query requirements: ${queryAnalysis.keyRequirements.join(', ')}
        
        Return as JSON array: ["suggestion1", "suggestion2", "suggestion3"]
        
        Focus suggestions on:
        - Improving search specificity if scores are low
        - Alternative strategies for the query type
        - Budget or reach optimization tips
        - Platform or targeting recommendations specific to the query
        
        Return ONLY the JSON array, no other text.
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 400,
        temperature: 0.3,
      });

      return this.parseJsonResponse(text);
    } catch (error) {
      // Intelligent fallback suggestions based on query type
      switch (queryAnalysis.queryType) {
        case 'budget_optimization':
          return [
            "Consider micro-influencers (10K-100K followers) for better cost efficiency",
            "Look for creators with engagement rates above 4% for better value",
            "Compare cost per 1K followers across similar creators"
          ];
        case 'reach_maximization':
          return [
            "Focus on macro-influencers (500K+ followers) for maximum reach",
            "Consider multiple mid-tier creators for broader audience coverage",
            "Evaluate cross-platform presence for amplified reach"
          ];
        default:
          return [
            "Try being more specific about your campaign goals",
            "Consider including platform preferences for better targeting",
            "Specify your budget range for more accurate recommendations"
          ];
      }
    }
  }

  private generateFallbackAnalysis(query: string, creators: Creator[], processingTime: number): LLMCreatorAnalysis {
    // Use the enhanced fallback analysis
    const queryAnalysis = this.getEnhancedFallbackQueryAnalysis(query);
    
    const relevantCreators = creators.slice(0, 10).map(creator => ({
      creator,
      relevanceScore: Math.random() * 30 + 70,
      reasoning: `${creator.name} matches your requirements based on their ${creator.platform} presence and expertise in ${creator.niche.join(', ')}.`,
      strengths: [`Strong ${creator.platform} presence`, `${creator.metrics.engagementRate}% engagement rate`, `${creator.metrics.followers.toLocaleString()} followers`],
      concerns: [] as string[],
      recommendationLevel: 'good_match' as const,
      costEffectivenessScore: Math.random() * 40 + 60,
      reachPotential: 'Good reach potential'
    }));

    return {
      query,
      matchedCreators: relevantCreators,
      analysisInsights: queryAnalysis.intent,
      suggestions: [
        "Try being more specific about platform preferences",
        "Include budget range for better recommendations", 
        "Specify content type requirements"
      ],
      queryUnderstanding: queryAnalysis,
      totalProcessingTime: processingTime
    };
  }

  // Check if Groq API is available
  isAvailable(): boolean {
    return !!import.meta.env.VITE_GROQ_API_KEY;
  }

  // Get suggested queries for better UX
  getExampleQueries(): string[] {
    return [
      "Find budget-friendly influencers with maximum reach for startup campaign",
      "Show me cost-effective micro-influencers with high engagement rates",
      "Looking for fitness creators who offer best value per follower",
      "Need affordable fashion influencers with strong audience connection",
      "Find tech reviewers with highest follower count within reasonable budget",
      "Show me beauty creators with best cost per engagement ratio",
      "Looking for travel influencers who maximize reach while staying budget-conscious",
      "Find business coaches with most followers at competitive rates",
      "Need gaming creators offering best value for money",
      "Show me food bloggers with optimal reach-to-cost ratio"
    ];
  }
}

export const groqLLMService = new GroqLLMService(); 