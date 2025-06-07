import { type Creator } from '../types';

// This interface defines the expected structure for creator query analysis results.
// It's used by frontend components to type the analysis results, 
// even though the analysis itself is now primarily performed by the backend.
export interface LLMCreatorAnalysis {
  query: string;
  matchedCreators: Array<{
    creator: Creator;
    relevanceScore: number;
    reasoning: string;
    strengths: string[];
    concerns: string[];
    recommendationLevel: 'highly_recommend' | 'good_match' | 'potential_match';
    costEffectivenessScore?: number;
    reachPotential?: string;
  }>;
  analysisInsights: string; // This would typically come from the backend now.
  suggestions: string[];    // This would typically come from the backend now.
  queryUnderstanding: { // This structure is what the backend /api/creator/analyze-query returns in its 'analysis' field
    intent: string;
    queryType: 'budget_optimization' | 'reach_maximization' | 'engagement_focused' | 'niche_targeting' | 'general_search';
    secondaryAspects?: string[];
    extractedCriteria: {
      platforms?: string[];
      niches?: string[];
      followerRange?: string; 
      budget?: string;
      location?: string;
      // Urgency, contentTypes, campaignGoals, qualityRequirements might be simplified or handled by backend
    };
    confidence: number;
    keyRequirements: string[];
  };
  totalProcessingTime: number; // This would reflect backend + frontend processing if relevant
}

class GroqLLMService {
  // All direct Groq API interactions, model initialization, 
  // and complex prompt engineering methods have been moved to the Python backend.
  // This service is now significantly reduced in scope.

  // This method can remain if the UI uses it directly for search suggestions.
  getExampleQueries(): string[] {
    return [
      "Find budget-friendly influencers with maximum reach for startup campaign",
      "Show me cost-effective micro-influencers with high engagement rates",
      "Looking for fitness creators who offer best value per follower",
      "Need affordable fashion influencers with strong audience connection",
      "Find tech reviewers with highest follower count within reasonable budget",
      // Add more diverse examples as needed
    ];
  }

  // Methods like analyzeCreatorQuery, analyzeQueryInDepth, parseJsonResponse, isAvailable, etc., 
  // are now deprecated in this frontend service as their core responsibilities are handled by the backend.
}

export const groqLLMService = new GroqLLMService(); 