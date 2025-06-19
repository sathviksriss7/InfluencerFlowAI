import { type Creator } from '../types';

// Types for campaign AI assistant
export interface CampaignRequirement {
  budget: { min: number; max: number };
  timeline: { duration: number; urgency: 'low' | 'medium' | 'high' };
  goals: Array<'brand_awareness' | 'engagement' | 'conversions' | 'reach' | 'sales'>;
  targetAudience: {
    ageRange: string;
    gender: 'male' | 'female' | 'all';
    interests: string[];
    geography: string[];
  };
  contentTypes: string[];
  platforms: string[];
  industry: string;
}

export interface CampaignSuggestion {
  strategy: string;
  recommendedCreatorTypes: {
    type: string;
    followerRange: { min: number; max: number };
    reason: string;
    estimatedCost: { min: number; max: number };
    expectedReach: { min: number; max: number };
  }[];
  budgetAllocation: {
    category: string;
    percentage: number;
    amount: number;
    description: string;
  }[];
  timelineRecommendation: {
    phase: string;
    duration: string;
    activities: string[];
  }[];
  riskFactors: string[];
  successMetrics: string[];
  aiInsights: string;
}

export interface CampaignAnalysisResponse {
  requirements: CampaignRequirement;
  suggestion: CampaignSuggestion;
  recommendedCreators: Creator[];
  estimatedROI: {
    conservative: number;
    optimistic: number;
    explanation: string;
  };
  alternatives: {
    title: string;
    description: string;
    budgetImpact: string;
    expectedOutcome: string;
  }[];
  processingTime: number;
}

class CampaignAIAssistant {
  // Industry-specific insights
  private industryStrategies = {
    fashion: {
      bestPlatforms: ['instagram', 'tiktok'],
      contentTypes: ['outfit posts', 'styling videos', 'lookbooks'],
      keyMetrics: ['engagement', 'brand mention'],
      seasonality: 'High seasonal impact'
    },
    fitness: {
      bestPlatforms: ['instagram', 'youtube', 'tiktok'],
      contentTypes: ['workout videos', 'transformation posts', 'tips'],
      keyMetrics: ['engagement', 'app downloads', 'sign-ups'],
      seasonality: 'Peak in January and summer'
    },
    beauty: {
      bestPlatforms: ['instagram', 'youtube', 'tiktok'],
      contentTypes: ['tutorials', 'before/after', 'reviews'],
      keyMetrics: ['engagement', 'website traffic', 'sales'],
      seasonality: 'Consistent year-round'
    },
    tech: {
      bestPlatforms: ['youtube', 'twitter', 'linkedin'],
      contentTypes: ['reviews', 'tutorials', 'unboxings'],
      keyMetrics: ['views', 'click-through', 'pre-orders'],
      seasonality: 'Peak during product launches'
    },
    food: {
      bestPlatforms: ['instagram', 'tiktok', 'youtube'],
      contentTypes: ['recipes', 'restaurant visits', 'cooking videos'],
      keyMetrics: ['engagement', 'location visits', 'orders'],
      seasonality: 'Holiday peaks'
    }
  };

  // Creator tier recommendations based on goals
  private creatorTierStrategies = {
    brand_awareness: {
      macro: { weight: 0.4, reason: 'Large reach for brand exposure' },
      mid: { weight: 0.4, reason: 'Balanced reach and engagement' },
      micro: { weight: 0.2, reason: 'Authentic community building' }
    },
    engagement: {
      macro: { weight: 0.2, reason: 'Lower engagement rates typically' },
      mid: { weight: 0.3, reason: 'Moderate engagement with good reach' },
      micro: { weight: 0.5, reason: 'Highest engagement rates' }
    },
    conversions: {
      macro: { weight: 0.3, reason: 'Trust and authority influence purchases' },
      mid: { weight: 0.4, reason: 'Good balance of trust and relatability' },
      micro: { weight: 0.3, reason: 'High trust in niche communities' }
    },
    reach: {
      macro: { weight: 0.6, reason: 'Maximum audience reach' },
      mid: { weight: 0.3, reason: 'Extended reach with better targeting' },
      micro: { weight: 0.1, reason: 'Limited but highly targeted reach' }
    },
    sales: {
      macro: { weight: 0.4, reason: 'Celebrity endorsement drives purchase decisions' },
      mid: { weight: 0.4, reason: 'Trusted recommendations from established creators' },
      micro: { weight: 0.2, reason: 'High conversion in niche product categories' }
    }
  };

  public async analyzeCampaignRequirements(
    description: string,
    budget: number,
    goals: string[],
    industry: string,
    creators: Creator[]
  ): Promise<CampaignAnalysisResponse> {
    const startTime = Date.now();

    // Parse campaign requirements
    const requirements = this.parseRequirements(description, budget, goals, industry);
    
    // Generate strategic suggestions
    const suggestion = this.generateCampaignStrategy(requirements);
    
    // Find matching creators
    const recommendedCreators = this.findMatchingCreators(requirements, creators);
    
    // Calculate ROI estimates
    const estimatedROI = this.calculateROIEstimate(requirements, suggestion);
    
    // Generate alternatives
    const alternatives = this.generateAlternativeStrategies(requirements);
    
    const processingTime = Date.now() - startTime;

    return {
      requirements,
      suggestion,
      recommendedCreators,
      estimatedROI,
      alternatives,
      processingTime
    };
  }

  private parseRequirements(
    description: string,
    budget: number,
    goals: string[],
    industry: string
  ): CampaignRequirement {
    const lowerDesc = description.toLowerCase();
    
    // Extract timeline urgency
    const urgency = lowerDesc.includes('urgent') || lowerDesc.includes('asap') ? 'high' :
                   lowerDesc.includes('soon') || lowerDesc.includes('quick') ? 'medium' : 'low';
    
    // Extract platforms
    const platforms: string[] = [];
    if (lowerDesc.includes('instagram')) platforms.push('instagram');
    if (lowerDesc.includes('youtube')) platforms.push('youtube');
    if (lowerDesc.includes('tiktok')) platforms.push('tiktok');
    if (lowerDesc.includes('twitter')) platforms.push('twitter');
    if (lowerDesc.includes('linkedin')) platforms.push('linkedin');
    
    // If no platforms specified, use industry defaults
    if (platforms.length === 0 && this.industryStrategies[industry as keyof typeof this.industryStrategies]) {
      platforms.push(...this.industryStrategies[industry as keyof typeof this.industryStrategies].bestPlatforms);
    }

    // Extract content types
    const contentTypes: string[] = [];
    if (lowerDesc.includes('video')) contentTypes.push('videos');
    if (lowerDesc.includes('post')) contentTypes.push('posts');
    if (lowerDesc.includes('story')) contentTypes.push('stories');
    if (lowerDesc.includes('review')) contentTypes.push('reviews');
    if (lowerDesc.includes('tutorial')) contentTypes.push('tutorials');

    return {
      budget: { min: budget * 0.8, max: budget * 1.2 },
      timeline: { duration: 30, urgency },
      goals: goals as CampaignRequirement['goals'],
      targetAudience: {
        ageRange: '18-34', // Default, could be extracted from description
        gender: 'all',
        interests: this.extractInterests(description),
        geography: ['United States'] // Default
      },
      contentTypes: contentTypes.length > 0 ? contentTypes : ['posts', 'stories'],
      platforms: platforms.length > 0 ? platforms : ['instagram'],
      industry
    };
  }

  private extractInterests(description: string): string[] {
    const interests: string[] = [];
    const interestKeywords = {
      fitness: ['fitness', 'workout', 'health', 'gym'],
      fashion: ['fashion', 'style', 'clothing', 'outfit'],
      beauty: ['beauty', 'makeup', 'skincare', 'cosmetics'],
      food: ['food', 'cooking', 'recipe', 'restaurant'],
      travel: ['travel', 'vacation', 'destination'],
      technology: ['tech', 'gadget', 'software', 'app'],
      lifestyle: ['lifestyle', 'daily', 'routine'],
      business: ['business', 'professional', 'career']
    };

    const lowerDesc = description.toLowerCase();
    Object.entries(interestKeywords).forEach(([interest, keywords]) => {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        interests.push(interest);
      }
    });

    return interests;
  }

  private generateCampaignStrategy(requirements: CampaignRequirement): CampaignSuggestion {
    const { budget, goals, industry } = requirements;
    
    // Determine strategy based on primary goal
    const primaryGoal = goals[0];
    let strategy = '';
    
    switch (primaryGoal) {
      case 'brand_awareness':
        strategy = 'Multi-tier influencer approach focusing on reach and brand visibility across key platforms';
        break;
      case 'engagement':
        strategy = 'Micro-influencer focused strategy emphasizing authentic content and community interaction';
        break;
      case 'conversions':
        strategy = 'Performance-driven approach with tracking links and conversion-optimized content';
        break;
      case 'reach':
        strategy = 'Macro-influencer strategy prioritizing maximum audience exposure and brand mention';
        break;
      default:
        strategy = 'Balanced multi-objective approach combining reach, engagement, and conversion elements';
    }

    // Generate creator type recommendations
    const creatorTypes = this.generateCreatorTypeRecommendations(requirements);
    
    // Budget allocation
    const budgetAllocation = this.generateBudgetAllocation(requirements);
    
    // Timeline recommendations
    const timelineRecommendation = this.generateTimelineRecommendation(requirements);
    
    // Risk factors
    const riskFactors = this.identifyRiskFactors(requirements);
    
    // Success metrics
    const successMetrics = this.defineSuccessMetrics(requirements);
    
    // AI insights
    const aiInsights = this.generateAIInsights(requirements);

    return {
      strategy,
      recommendedCreatorTypes: creatorTypes,
      budgetAllocation,
      timelineRecommendation,
      riskFactors,
      successMetrics,
      aiInsights
    };
  }

  private generateCreatorTypeRecommendations(requirements: CampaignRequirement) {
    const { budget, goals } = requirements;
    const primaryGoal = goals[0];
    
    const recommendations = [];
    
    // Get strategy weights for primary goal
    const strategy = this.creatorTierStrategies[primaryGoal] || this.creatorTierStrategies.brand_awareness;
    
    // Macro influencers (500k+ followers)
    if (strategy.macro.weight > 0 && budget.max > 5000) {
      recommendations.push({
        type: 'Macro Influencers',
        followerRange: { min: 500000, max: 2000000 },
        reason: strategy.macro.reason,
        estimatedCost: { min: 5000, max: 15000 },
        expectedReach: { min: 250000, max: 800000 }
      });
    }
    
    // Mid-tier influencers (100k-500k followers)
    if (strategy.mid.weight > 0 && budget.max > 2000) {
      recommendations.push({
        type: 'Mid-tier Influencers',
        followerRange: { min: 100000, max: 500000 },
        reason: strategy.mid.reason,
        estimatedCost: { min: 2000, max: 8000 },
        expectedReach: { min: 50000, max: 250000 }
      });
    }
    
    // Micro influencers (10k-100k followers)
    if (strategy.micro.weight > 0) {
      recommendations.push({
        type: 'Micro Influencers',
        followerRange: { min: 10000, max: 100000 },
        reason: strategy.micro.reason,
        estimatedCost: { min: 500, max: 3000 },
        expectedReach: { min: 5000, max: 50000 }
      });
    }
    
    return recommendations;
  }

  private generateBudgetAllocation(requirements: CampaignRequirement) {
    const { budget } = requirements;
    const totalBudget = budget.max;
    
    return [
      {
        category: 'Creator Fees',
        percentage: 70,
        amount: totalBudget * 0.7,
        description: 'Payment to influencers for content creation and posting'
      },
      {
        category: 'Content Production',
        percentage: 15,
        amount: totalBudget * 0.15,
        description: 'Additional production costs, props, and creative assets'
      },
      {
        category: 'Platform & Tools',
        percentage: 10,
        amount: totalBudget * 0.1,
        description: 'Analytics tools, management platform, and tracking'
      },
      {
        category: 'Contingency',
        percentage: 5,
        amount: totalBudget * 0.05,
        description: 'Buffer for additional creators or extended campaign duration'
      }
    ];
  }

  private generateTimelineRecommendation(requirements: CampaignRequirement) {
    const phases = [
      {
        phase: 'Planning & Outreach',
        duration: '1-2 weeks',
        activities: [
          'Creator research and selection',
          'Campaign brief development',
          'Contract negotiations'
        ]
      },
      {
        phase: 'Content Creation',
        duration: '2-3 weeks',
        activities: [
          'Content planning and approval',
          'Creator content production',
          'Review and feedback cycles'
        ]
      },
      {
        phase: 'Campaign Execution',
        duration: '1-4 weeks',
        activities: [
          'Content publishing schedule',
          'Real-time monitoring',
          'Community engagement'
        ]
      },
      {
        phase: 'Analysis & Reporting',
        duration: '1 week',
        activities: [
          'Performance data collection',
          'ROI analysis and reporting',
          'Campaign insights documentation'
        ]
      }
    ];

    // Adjust based on urgency
    if (requirements.timeline.urgency === 'high') {
      phases.forEach(phase => {
        phase.duration = phase.duration.replace(/(\d+)-(\d+)/, (match, min, max) => {
          return min; // Use minimum duration for urgent campaigns
        });
      });
    }

    return phases;
  }

  private identifyRiskFactors(requirements: CampaignRequirement): string[] {
    const risks = [];
    
    if (requirements.budget.max < 2000) {
      risks.push('Limited budget may restrict access to high-tier creators');
    }
    
    if (requirements.timeline.urgency === 'high') {
      risks.push('Tight timeline may limit creator availability and content quality');
    }
    
    if (requirements.platforms.length === 1) {
      risks.push('Single platform dependency increases risk if algorithm changes occur');
    }
    
    if (requirements.goals.includes('conversions') && !requirements.contentTypes.includes('reviews')) {
      risks.push('Conversion goals may be challenging without authentic product reviews');
    }
    
    return risks;
  }

  private defineSuccessMetrics(requirements: CampaignRequirement): string[] {
    const metrics: string[] = [];
    
    requirements.goals.forEach(goal => {
      switch (goal) {
        case 'brand_awareness':
          metrics.push('Brand mention increase', 'Reach and impressions', 'Brand search volume');
          break;
        case 'engagement':
          metrics.push('Engagement rate', 'Comments and shares', 'User-generated content');
          break;
        case 'conversions':
          metrics.push('Click-through rate', 'Conversion rate', 'Cost per acquisition');
          break;
        case 'reach':
          metrics.push('Total reach', 'Unique impressions', 'Audience growth');
          break;
        case 'sales':
          metrics.push('Revenue generated', 'Units sold', 'Return on ad spend');
          break;
      }
    });
    
    return [...new Set(metrics)]; // Remove duplicates
  }

  private generateAIInsights(requirements: CampaignRequirement): string {
    const insights = [];
    
    // Budget insights
    if (requirements.budget.max > 10000) {
      insights.push('Your budget allows for a premium multi-tier creator strategy.');
    } else if (requirements.budget.max < 2000) {
      insights.push('Consider focusing on micro-influencers for maximum engagement within budget.');
    }
    
    // Timeline insights
    if (requirements.timeline.urgency === 'high') {
      insights.push('Urgent timelines work best with creators who have quick response times.');
    }
    
    // Industry insights
    const industryStrategy = this.industryStrategies[requirements.industry as keyof typeof this.industryStrategies];
    if (industryStrategy) {
      insights.push(`${industryStrategy.seasonality} affects ${requirements.industry} campaigns.`);
    }
    
    // Goal-specific insights
    if (requirements.goals.includes('engagement') && requirements.goals.includes('reach')) {
      insights.push('Balancing engagement and reach requires a mix of creator tiers.');
    }
    
    return insights[0] || 'Campaign appears well-structured for your objectives.';
  }

  private findMatchingCreators(requirements: CampaignRequirement, creators: Creator[]): Creator[] {
    return creators
      .filter(creator => {
        // Platform match
        if (!requirements.platforms.includes(creator.platform)) return false;
        
        // Niche/interest match
        const hasMatchingNiche = requirements.targetAudience.interests.some(interest =>
          creator.niche.some(niche => 
            niche.toLowerCase().includes(interest.toLowerCase()) ||
            interest.toLowerCase().includes(niche.toLowerCase())
          )
        );
        
        return hasMatchingNiche || requirements.targetAudience.interests.length === 0;
      })
      .sort((a, b) => {
        // Sort by relevance score
        const aScore = this.calculateCreatorRelevanceScore(a, requirements);
        const bScore = this.calculateCreatorRelevanceScore(b, requirements);
        return bScore - aScore;
      })
      .slice(0, 15); // Top 15 recommendations
  }

  private calculateCreatorRelevanceScore(creator: Creator, requirements: CampaignRequirement): number {
    let score = 0;
    
    // Platform match
    if (requirements.platforms.includes(creator.platform)) score += 20;
    
    // Niche match
    const nicheMatches = requirements.targetAudience.interests.filter(interest =>
      creator.niche.some(niche => 
        niche.toLowerCase().includes(interest.toLowerCase()) ||
        interest.toLowerCase().includes(niche.toLowerCase())
      )
    ).length;
    score += nicheMatches * 15;
    
    // Engagement rate (higher is better)
    score += creator.metrics.engagementRate * 2;
    
    // Rating
    score += creator.rating * 5;
    
    // Verification bonus
    if (creator.verified) score += 10;
    
    // Budget fit
    if (creator.rates.post <= requirements.budget.max * 0.3) score += 10;
    
    return score;
  }

  private calculateROIEstimate(requirements: CampaignRequirement, suggestion: CampaignSuggestion) {
    const budget = requirements.budget.max;
    
    // Calculate based on industry benchmarks and goals
    let conservativeMultiplier = 1.5;
    let optimisticMultiplier = 4.0;
    
    // Adjust based on goals
    if (requirements.goals.includes('conversions')) {
      conservativeMultiplier = 2.0;
      optimisticMultiplier = 6.0;
    }
    
    if (requirements.goals.includes('brand_awareness')) {
      conservativeMultiplier = 1.2;
      optimisticMultiplier = 3.0;
    }
    
    return {
      conservative: Math.round(budget * conservativeMultiplier),
      optimistic: Math.round(budget * optimisticMultiplier),
      explanation: `ROI estimates based on ${requirements.industry} industry benchmarks and campaign goals`
    };
  }

  private generateAlternativeStrategies(requirements: CampaignRequirement) {
    const alternatives = [];
    
    // Budget alternatives
    if (requirements.budget.max > 5000) {
      alternatives.push({
        title: 'Cost-Optimized Approach',
        description: 'Focus on micro-influencers to reduce costs while maintaining engagement',
        budgetImpact: '-40% budget requirement',
        expectedOutcome: 'Higher engagement rates, smaller reach'
      });
    } else {
      alternatives.push({
        title: 'Premium Upgrade',
        description: 'Increase budget to access mid-tier influencers for broader reach',
        budgetImpact: '+60% budget increase',
        expectedOutcome: 'Significantly increased reach and brand awareness'
      });
    }
    
    // Platform alternatives
    if (requirements.platforms.length === 1) {
      alternatives.push({
        title: 'Multi-Platform Strategy',
        description: 'Expand to additional platforms for diversified audience reach',
        budgetImpact: '+25% for cross-platform content',
        expectedOutcome: 'Reduced platform risk, broader audience'
      });
    }
    
    // Timeline alternatives
    if (requirements.timeline.urgency === 'high') {
      alternatives.push({
        title: 'Extended Timeline',
        description: 'Allow more time for creator selection and content refinement',
        budgetImpact: 'Same budget, better value',
        expectedOutcome: 'Higher quality content, better creator availability'
      });
    }
    
    return alternatives;
  }
}

export const campaignAIAssistant = new CampaignAIAssistant(); 