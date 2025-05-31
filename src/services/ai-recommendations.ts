import { type Creator } from '../types';

// Types for AI recommendations
export interface QueryAnalysis {
  intent: 'find_creators' | 'compare_creators' | 'campaign_match' | 'budget_optimization';
  criteria: {
    platforms?: string[];
    niches?: string[];
    locations?: string[];
    followerRange?: { min?: number; max?: number };
    budgetRange?: { min?: number; max?: number };
    engagementRate?: { min?: number; max?: number };
    contentTypes?: string[];
    demographics?: {
      ageRange?: string;
      gender?: string;
      countries?: string[];
    };
  };
  sentiment: 'positive' | 'neutral' | 'urgent';
  confidence: number;
}

export interface RecommendationResult {
  creator: Creator;
  score: number;
  reasons: string[];
  matchedCriteria: string[];
  concerns?: string[];
  aiInsights: string;
}

export interface AIRecommendationResponse {
  query: string;
  analysis: QueryAnalysis;
  recommendations: RecommendationResult[];
  totalResults: number;
  processingTime: number;
  suggestions: string[];
  aiSummary: string;
}

class AIRecommendationService {
  private platformKeywords = {
    instagram: ['instagram', 'ig', 'insta', 'posts', 'stories', 'reels', 'igtv'],
    youtube: ['youtube', 'yt', 'video', 'videos', 'channel', 'subscribers', 'views'],
    tiktok: ['tiktok', 'tt', 'short videos', 'viral', 'trending', 'fyp'],
    twitter: ['twitter', 'tweet', 'tweets', 'x', 'social media'],
    linkedin: ['linkedin', 'professional', 'b2b', 'business', 'corporate']
  };

  private nicheKeywords = {
    fitness: ['fitness', 'workout', 'gym', 'health', 'exercise', 'training', 'muscle', 'cardio'],
    beauty: ['beauty', 'makeup', 'cosmetics', 'skincare', 'glow', 'aesthetic'],
    fashion: ['fashion', 'style', 'outfit', 'clothing', 'trends', 'designer', 'ootd'],
    food: ['food', 'cooking', 'recipe', 'chef', 'cuisine', 'restaurant', 'dining'],
    travel: ['travel', 'vacation', 'trip', 'destination', 'adventure', 'explore'],
    technology: ['tech', 'technology', 'gadgets', 'software', 'review', 'innovation'],
    lifestyle: ['lifestyle', 'daily', 'routine', 'living', 'home', 'wellness'],
    gaming: ['gaming', 'games', 'esports', 'streamer', 'pc', 'console'],
    business: ['business', 'entrepreneur', 'startup', 'marketing', 'productivity'],
    art: ['art', 'creative', 'design', 'artist', 'drawing', 'painting'],
    music: ['music', 'musician', 'song', 'artist', 'concert', 'band'],
    education: ['education', 'learning', 'teaching', 'tutorial', 'knowledge'],
    parenting: ['parenting', 'family', 'kids', 'children', 'mom', 'dad'],
    pets: ['pets', 'animals', 'dog', 'cat', 'puppy', 'kitten'],
    outdoor: ['outdoor', 'hiking', 'camping', 'nature', 'adventure'],
    sustainability: ['sustainable', 'eco', 'green', 'environment', 'organic']
  };

  private budgetKeywords = {
    low: ['cheap', 'budget', 'affordable', 'low cost', 'economical', 'inexpensive'],
    medium: ['moderate', 'mid-range', 'reasonable', 'standard'],
    high: ['premium', 'expensive', 'high-end', 'luxury', 'top-tier'],
    flexible: ['flexible', 'negotiable', 'open to discussion']
  };

  private followerKeywords = {
    nano: ['nano', 'small', 'micro', 'niche', '1k', '5k', '10k'],
    micro: ['micro', 'growing', '50k', '100k'],
    mid: ['medium', 'established', '500k'],
    macro: ['macro', 'large', 'big', 'million', '1m', 'popular', 'famous']
  };

  private urgencyKeywords = {
    urgent: ['urgent', 'asap', 'immediately', 'quick', 'fast', 'soon', 'deadline'],
    normal: ['when possible', 'sometime', 'eventually'],
    flexible: ['flexible', 'no rush', 'whenever']
  };

  // Main function to process natural language queries
  public async processQuery(query: string, creators: Creator[]): Promise<AIRecommendationResponse> {
    const startTime = Date.now();
    
    // Analyze the query to extract intent and criteria
    const analysis = this.analyzeQuery(query);
    
    // Score and rank creators based on the analysis
    const scoredCreators = this.scoreCreators(creators, analysis);
    
    // Generate recommendations with explanations
    const recommendations = this.generateRecommendations(scoredCreators, analysis);
    
    // Generate AI insights and suggestions
    const aiSummary = this.generateAISummary(query, analysis, recommendations);
    const suggestions = this.generateSuggestions(analysis, recommendations);
    
    const processingTime = Date.now() - startTime;

    return {
      query,
      analysis,
      recommendations: recommendations.slice(0, 20), // Top 20 results
      totalResults: recommendations.length,
      processingTime,
      suggestions,
      aiSummary
    };
  }

  private analyzeQuery(query: string): QueryAnalysis {
    const lowerQuery = query.toLowerCase();
    
    // Detect intent
    let intent: QueryAnalysis['intent'] = 'find_creators';
    if (lowerQuery.includes('compare') || lowerQuery.includes('vs')) {
      intent = 'compare_creators';
    } else if (lowerQuery.includes('campaign') || lowerQuery.includes('match')) {
      intent = 'campaign_match';
    } else if (lowerQuery.includes('budget') || lowerQuery.includes('cost')) {
      intent = 'budget_optimization';
    }

    // Extract platforms
    const platforms: string[] = [];
    Object.entries(this.platformKeywords).forEach(([platform, keywords]) => {
      if (keywords.some(keyword => lowerQuery.includes(keyword))) {
        platforms.push(platform);
      }
    });

    // Extract niches
    const niches: string[] = [];
    Object.entries(this.nicheKeywords).forEach(([niche, keywords]) => {
      if (keywords.some(keyword => lowerQuery.includes(keyword))) {
        niches.push(niche);
      }
    });

    // Extract follower range
    let followerRange: { min?: number; max?: number } = {};
    if (lowerQuery.includes('nano') || lowerQuery.includes('small')) {
      followerRange = { min: 1000, max: 10000 };
    } else if (lowerQuery.includes('micro')) {
      followerRange = { min: 10000, max: 100000 };
    } else if (lowerQuery.includes('macro') || lowerQuery.includes('large')) {
      followerRange = { min: 100000, max: 1000000 };
    }

    // Extract numbers for follower counts
    const numberMatches = lowerQuery.match(/(\d+(?:k|m)?)/g);
    if (numberMatches) {
      numberMatches.forEach(match => {
        const value = this.parseNumberString(match);
        if (value > 1000) {
          if (!followerRange.min) followerRange.min = value;
          else if (!followerRange.max) followerRange.max = value;
        }
      });
    }

    // Extract budget preferences
    let budgetRange: { min?: number; max?: number } = {};
    if (lowerQuery.includes('budget') || lowerQuery.includes('cheap')) {
      budgetRange = { max: 2000 };
    } else if (lowerQuery.includes('premium') || lowerQuery.includes('expensive')) {
      budgetRange = { min: 5000 };
    }

    // Extract locations
    const locations: string[] = [];
    const locationKeywords = ['usa', 'us', 'america', 'uk', 'canada', 'australia', 'europe', 'asia'];
    locationKeywords.forEach(loc => {
      if (lowerQuery.includes(loc)) {
        locations.push(loc);
      }
    });

    // Detect sentiment/urgency
    let sentiment: QueryAnalysis['sentiment'] = 'neutral';
    if (this.urgencyKeywords.urgent.some(keyword => lowerQuery.includes(keyword))) {
      sentiment = 'urgent';
    }

    // Calculate confidence based on how many criteria we extracted
    const criteriaCount = platforms.length + niches.length + locations.length + 
                         (Object.keys(followerRange).length > 0 ? 1 : 0) +
                         (Object.keys(budgetRange).length > 0 ? 1 : 0);
    const confidence = Math.min(0.9, 0.3 + (criteriaCount * 0.15));

    return {
      intent,
      criteria: {
        platforms: platforms.length > 0 ? platforms : undefined,
        niches: niches.length > 0 ? niches : undefined,
        locations: locations.length > 0 ? locations : undefined,
        followerRange: Object.keys(followerRange).length > 0 ? followerRange : undefined,
        budgetRange: Object.keys(budgetRange).length > 0 ? budgetRange : undefined
      },
      sentiment,
      confidence
    };
  }

  private scoreCreators(creators: Creator[], analysis: QueryAnalysis): Array<{ creator: Creator; score: number }> {
    return creators.map(creator => {
      let score = 0;
      let maxPossibleScore = 0;

      // Platform matching (20% weight)
      maxPossibleScore += 20;
      if (analysis.criteria.platforms) {
        if (analysis.criteria.platforms.includes(creator.platform)) {
          score += 20;
        }
      } else {
        score += 10; // Partial score if no platform specified
      }

      // Niche matching (30% weight)
      maxPossibleScore += 30;
      if (analysis.criteria.niches) {
        const nicheMatches = analysis.criteria.niches.filter(niche => 
          creator.niche.some(creatorNiche => 
            creatorNiche.toLowerCase().includes(niche) || niche.includes(creatorNiche.toLowerCase())
          )
        );
        score += (nicheMatches.length / analysis.criteria.niches.length) * 30;
      } else {
        score += 15; // Partial score if no niche specified
      }

      // Follower range matching (20% weight)
      maxPossibleScore += 20;
      if (analysis.criteria.followerRange) {
        const { min, max } = analysis.criteria.followerRange;
        if ((!min || creator.metrics.followers >= min) && 
            (!max || creator.metrics.followers <= max)) {
          score += 20;
        } else {
          // Partial score based on how close they are
          const distance = Math.min(
            min ? Math.abs(creator.metrics.followers - min) / min : 0,
            max ? Math.abs(creator.metrics.followers - max) / max : 0
          );
          score += Math.max(0, 20 * (1 - distance));
        }
      } else {
        score += 10; // Partial score if no follower range specified
      }

      // Engagement rate bonus (15% weight)
      maxPossibleScore += 15;
      const engagementScore = Math.min(15, creator.metrics.engagementRate * 2);
      score += engagementScore;

      // Rating bonus (10% weight)
      maxPossibleScore += 10;
      score += (creator.rating / 5) * 10;

      // Verification bonus (5% weight)
      maxPossibleScore += 5;
      if (creator.verified) score += 5;

      // Normalize score to 0-100
      const normalizedScore = (score / maxPossibleScore) * 100;
      
      return { creator, score: Math.round(normalizedScore * 10) / 10 };
    }).sort((a, b) => b.score - a.score);
  }

  private generateRecommendations(
    scoredCreators: Array<{ creator: Creator; score: number }>, 
    analysis: QueryAnalysis
  ): RecommendationResult[] {
    return scoredCreators.map(({ creator, score }) => {
      const reasons: string[] = [];
      const matchedCriteria: string[] = [];
      const concerns: string[] = [];

      // Analyze why this creator was recommended
      if (analysis.criteria.platforms?.includes(creator.platform)) {
        reasons.push(`Active on ${creator.platform} as requested`);
        matchedCriteria.push('platform');
      }

      if (analysis.criteria.niches) {
        const nicheMatches = analysis.criteria.niches.filter(niche => 
          creator.niche.some(creatorNiche => 
            creatorNiche.toLowerCase().includes(niche) || niche.includes(creatorNiche.toLowerCase())
          )
        );
        if (nicheMatches.length > 0) {
          reasons.push(`Specializes in ${nicheMatches.join(', ')}`);
          matchedCriteria.push('niche');
        }
      }

      if (creator.metrics.engagementRate > 4.0) {
        reasons.push(`High engagement rate (${creator.metrics.engagementRate}%)`);
      }

      if (creator.verified) {
        reasons.push('Verified creator with authentic audience');
      }

      if (creator.rating >= 4.5) {
        reasons.push(`Excellent creator rating (${creator.rating}/5)`);
      }

      // Identify potential concerns
      if (analysis.criteria.followerRange) {
        const { min, max } = analysis.criteria.followerRange;
        if (min && creator.metrics.followers < min) {
          concerns.push(`Follower count (${creator.metrics.followers.toLocaleString()}) below requested minimum`);
        }
        if (max && creator.metrics.followers > max) {
          concerns.push(`Follower count (${creator.metrics.followers.toLocaleString()}) above requested maximum`);
        }
      }

      if (creator.metrics.engagementRate < 2.0) {
        concerns.push('Lower engagement rate may impact campaign performance');
      }

      // Generate AI insights
      const aiInsights = this.generateCreatorInsights(creator, analysis);

      return {
        creator,
        score,
        reasons,
        matchedCriteria,
        concerns: concerns.length > 0 ? concerns : undefined,
        aiInsights
      };
    });
  }

  private generateCreatorInsights(creator: Creator, analysis: QueryAnalysis): string {
    const insights: string[] = [];

    // Performance insights
    if (creator.metrics.engagementRate > 6.0) {
      insights.push("Exceptionally high engagement suggests strong audience connection.");
    } else if (creator.metrics.engagementRate > 4.0) {
      insights.push("Strong engagement rate indicates active and interested audience.");
    }

    // Audience insights
    if (creator.metrics.followers > 500000) {
      insights.push("Large reach potential for brand awareness campaigns.");
    } else if (creator.metrics.followers < 50000) {
      insights.push("Smaller audience may provide higher engagement and more personal connections.");
    }

    // Platform-specific insights
    if (creator.platform === 'tiktok' && creator.metrics.engagementRate > 7.0) {
      insights.push("TikTok's algorithm favors high-engagement content, increasing viral potential.");
    }

    if (creator.platform === 'youtube' && creator.metrics.avgViews > 50000) {
      insights.push("Strong video performance suggests good content quality and audience retention.");
    }

    // Response time insights
    if (creator.responseTime.includes('1 hour') || creator.responseTime.includes('2 hours')) {
      insights.push("Quick response time suggests professional approach to collaborations.");
    }

    return insights.length > 0 ? insights[0] : "Well-rounded creator profile with good fundamentals.";
  }

  private generateAISummary(query: string, analysis: QueryAnalysis, recommendations: RecommendationResult[]): string {
    const topCreators = recommendations.slice(0, 3);
    const avgScore = topCreators.reduce((sum, rec) => sum + rec.score, 0) / topCreators.length;
    
    let summary = `Found ${recommendations.length} creators for your query "${query}". `;
    
    if (avgScore > 80) {
      summary += "Found excellent matches with high relevance scores. ";
    } else if (avgScore > 60) {
      summary += "Found good matches that align well with your requirements. ";
    } else {
      summary += "Found some potential matches, though you may want to broaden your criteria. ";
    }

    if (analysis.criteria.platforms) {
      summary += `Focused on ${analysis.criteria.platforms.join(' and ')} creators. `;
    }

    if (analysis.criteria.niches) {
      summary += `Specialized in ${analysis.criteria.niches.join(' and ')} content. `;
    }

    if (recommendations.length > 0) {
      const topCreator = recommendations[0];
      summary += `Top recommendation: ${topCreator.creator.name} with ${topCreator.score}% match score.`;
    }

    return summary;
  }

  private generateSuggestions(analysis: QueryAnalysis, recommendations: RecommendationResult[]): string[] {
    const suggestions: string[] = [];

    // Suggest broadening criteria if few results
    if (recommendations.length < 5) {
      suggestions.push("Try broadening your criteria to see more creators");
      if (analysis.criteria.followerRange) {
        suggestions.push("Consider expanding your follower count range");
      }
    }

    // Suggest specific improvements
    if (!analysis.criteria.platforms) {
      suggestions.push("Specify platforms (Instagram, YouTube, TikTok) for more targeted results");
    }

    if (!analysis.criteria.niches) {
      suggestions.push("Add content categories (fashion, tech, food) to find specialized creators");
    }

    // Suggest budget considerations
    if (analysis.criteria.budgetRange?.max && analysis.criteria.budgetRange.max < 1000) {
      suggestions.push("Consider increasing budget for access to higher-tier creators");
    }

    // Suggest location targeting
    if (!analysis.criteria.locations) {
      suggestions.push("Add location preferences for geo-targeted campaigns");
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  private parseNumberString(str: string): number {
    const num = parseFloat(str.replace(/[km]/i, ''));
    if (str.toLowerCase().includes('k')) return num * 1000;
    if (str.toLowerCase().includes('m')) return num * 1000000;
    return num;
  }

  // Preset query suggestions for better UX
  public getQuerySuggestions(): string[] {
    return [
      "Find fitness influencers on Instagram with 50k+ followers",
      "Show me tech reviewers on YouTube for my gadget launch", 
      "Looking for fashion creators with high engagement rates",
      "Need food bloggers for restaurant campaign in NYC",
      "Find budget-friendly micro-influencers for startup",
      "Show beauty creators who work with skincare brands",
      "Looking for travel photographers for hotel campaign",
      "Find gaming streamers with young male audience",
      "Need business influencers on LinkedIn for B2B campaign",
      "Show me sustainable fashion advocates",
      "Find pet influencers for dog food brand",
      "Looking for parenting bloggers with family audience"
    ];
  }
}

export const aiRecommendationService = new AIRecommendationService(); 