import { type Creator } from '../types';
import { supabase } from '../lib/supabase'; // For JWT token
import { outreachStorage } from './outreach-storage'; // Added missing import
// Assuming GlobalRateLimiter is exported from ai-agents.ts or a shared util file
// import { GlobalRateLimiter } from './ai-agents'; // Or from '../utils/rate-limiter';
// For now, let's mock a GlobalRateLimiter if it's not directly importable to satisfy TS for this edit.
// In a real scenario, ensure proper import or a shared utility.
const GlobalRateLimiter = {
    getInstance: () => ({
        waitIfNeeded: async (agentName?: string) => {
            console.log(`Mock GlobalRateLimiter: ${agentName} proceeding.`);
            return Promise.resolve();
        }
    })
};

interface OutreachEmail {
  id: string;
  creatorId: string;
  subject: string;
  body: string;
  type: 'initial_outreach' | 'follow_up' | 'negotiation' | 'contract_discussion';
  timestamp: Date;
  campaignContext?: string;
  brandInfo?: BrandInfo;
}

interface BrandInfo {
  name: string;
  industry: string;
  campaignGoals: string[];
  budget: {
    min: number;
    max: number;
    currency: string;
  };
  timeline: string;
  contentRequirements: string[];
}

interface NegotiationContext {
  currentOffer: number;
  creatorAskingPrice?: number;
  negotiationRound: number;
  previousMessages: string[];
  dealBreakers?: string[];
  flexibleTerms?: string[];
}

interface AIOutreachResponse {
  email: OutreachEmail;
  subject?: string;
  message?: string;
  reasoning: string;
  keyPoints: string[];
  nextSteps: string[];
  confidence: number;
  method?: 'ai_generated' | 'algorithmic_fallback';
}

class AIOutreachService {
  /**
   * Generate initial outreach email by CALLING THE PYTHON BACKEND.
   */
  async generateInitialOutreach(
    creator: Creator, 
    brandInfo: BrandInfo,
    campaignContext: string
  ): Promise<AIOutreachResponse> {
    console.log(`📧 AI Outreach Service (FE): Requesting initial outreach for ${creator.name} from backend.`);
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/outreach/initial-message`;

    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('AIOutreachService.initial');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('❌ AI Outreach (FE): No Supabase session for backend call.', sessionError);
        return this.generateLocalFallbackOutreach(creator, brandInfo, campaignContext, "User not authenticated");
      }

      const payload = { creator, brandInfo, campaignContext };
      const response = await fetch(backendApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errResp = await response.json().catch(() => ({ error: `Backend error: ${response.status} ${response.statusText}` }));
        console.error('❌ AI Outreach (FE): Backend call for initial outreach failed:', errResp.error);
        return this.generateLocalFallbackOutreach(creator, brandInfo, campaignContext, errResp.error);
      }

      const backendResponse = await response.json(); // Expects { success, subject, message, reasoning, keyPoints, nextSteps, confidence, method, error? }
      if (!backendResponse.success || !backendResponse.subject || !backendResponse.message) {
        console.error('❌ AI Outreach (FE): Invalid response from backend initial outreach:', backendResponse.error);
        return this.generateLocalFallbackOutreach(creator, brandInfo, campaignContext, backendResponse.error || 'Invalid backend response');
      }
      
      console.log(`✅ AI Outreach (FE): Received initial outreach for ${creator.name} from backend (${backendResponse.method}).`);
      
      const email: OutreachEmail = {
        id: `outreach_${Date.now()}_${creator.id}`,
        creatorId: creator.id,
        subject: backendResponse.subject,
        body: backendResponse.message, 
        type: 'initial_outreach',
        timestamp: new Date(),
        campaignContext,
        brandInfo
      };

      return {
        email,
        reasoning: backendResponse.reasoning || "Strategy from backend.",
        keyPoints: backendResponse.keyPoints || ["Key points from backend."],
        nextSteps: backendResponse.nextSteps || ["Follow up as per backend."],
        confidence: backendResponse.confidence || 0.7,
        method: backendResponse.method
      };

    } catch (error) {
      console.error('❌ AI Outreach (FE): Error calling backend for initial outreach:', error);
      return this.generateLocalFallbackOutreach(creator, brandInfo, campaignContext, (error as Error).message);
    }
  }

  /**
   * DEPRECATED: Negotiation email generation is now handled by NegotiationAgent in ai-agents.ts,
   * which calls its own backend endpoint.
   */
  async generateNegotiationEmail(): Promise<AIOutreachResponse> {
    console.warn("DEPRECATED: AIOutreachService.generateNegotiationEmail called. Use NegotiationAgent service in ai-agents.ts.");
    throw new Error("generateNegotiationEmail is deprecated and moved to NegotiationAgent service calling a backend API.");
  }

  /**
   * Generate follow-up email by CALLING THE PYTHON BACKEND.
   */
  async generateFollowUpEmail(
    creator: Creator,
    brandInfo: BrandInfo,
    daysSinceLastContact: number,
    previousEmailType: string,
    outreachId?: string // Optional: to fetch conversation context
  ): Promise<AIOutreachResponse> {
    console.log(`📧 AI Outreach Service (FE): Requesting follow-up for ${creator.name} from backend.`);
    const baseBackendUrl = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:5001";
    const backendApiUrl = `${baseBackendUrl}/api/outreach/follow-up-message`;

    let conversationContext: string | undefined = undefined;
    if (outreachId) {
      conversationContext = outreachStorage.getConversationContext(outreachId);
    }

    try {
      await GlobalRateLimiter.getInstance().waitIfNeeded('AIOutreachService.followUp');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('❌ AI Outreach (FE): No Supabase session for follow-up backend call.', sessionError);
        return this.generateLocalFallbackFollowUp(creator, brandInfo, `Auth error - Days since contact: ${daysSinceLastContact}`);
      }

      const payload = { 
        creator, 
        brandInfo, 
        daysSinceLastContact, 
        previousEmailType,
        ...(conversationContext && { conversationContext })
      };

      const response = await fetch(backendApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errResp = await response.json().catch(() => ({ error: `Backend error: ${response.status} ${response.statusText}` }));
        console.error('❌ AI Outreach (FE): Backend call for follow-up failed:', errResp.error);
        return this.generateLocalFallbackFollowUp(creator, brandInfo, `Backend error - Days since contact: ${daysSinceLastContact}`);
      }

      const backendResponse = await response.json(); 
      if (!backendResponse.success || !backendResponse.subject || !backendResponse.message) {
        console.error('❌ AI Outreach (FE): Invalid response from backend follow-up:', backendResponse.error);
        return this.generateLocalFallbackFollowUp(creator, brandInfo, backendResponse.error || 'Invalid backend response');
      }
      
      console.log(`✅ AI Outreach (FE): Received follow-up for ${creator.name} from backend (${backendResponse.method}).`);
      
      const email: OutreachEmail = {
        id: `followup_${Date.now()}_${creator.id}`,
        creatorId: creator.id,
        subject: backendResponse.subject,
        body: backendResponse.message, 
        type: 'follow_up',
        timestamp: new Date(),
        brandInfo,
        // campaignContext might not be directly relevant for a follow-up email object, 
        // but it was part of the original payload to the backend.
      };

      return {
        email,
        reasoning: backendResponse.reasoning || "Follow-up strategy from backend.",
        keyPoints: backendResponse.keyPoints || ["Key points from backend."],
        nextSteps: backendResponse.nextSteps || ["Follow up as per backend."],
        confidence: backendResponse.confidence || 0.75,
        method: backendResponse.method
      };

    } catch (error) {
      console.error('❌ AI Outreach (FE): Error calling backend for follow-up:', error);
      return this.generateLocalFallbackFollowUp(creator, brandInfo, (error as Error).message);
    }
  }

  // Local fallback for initial outreach - kept on frontend for resilience
  private generateLocalFallbackOutreach(creator: Creator, brandInfo: BrandInfo, campaignContext: string, errorInfo: string = "AI generation failed"): AIOutreachResponse {
    console.log(`🤖 AI Outreach (FE): Generating LOCAL FALLBACK initial outreach for ${creator.name}. Error: ${errorInfo}`);
    const subject = `Collaboration Inquiry: ${brandInfo.name} x ${creator.name}`;
    const body = `Hi ${creator.name},\n\nHope you are doing well.\n\nWe at ${brandInfo.name} are very impressed with your work on ${creator.platform} and would like to discuss a potential collaboration for our campaign: ${campaignContext.substring(0,100)}...\n\nPlease let us know if this is something you might be interested in exploring further.\n\nBest regards,\nThe ${brandInfo.name} Team`;
    const email: OutreachEmail = {
      id: `fallback_outreach_${Date.now()}_${creator.id}`,
      creatorId: creator.id, subject, body, type: 'initial_outreach', timestamp: new Date(), campaignContext, brandInfo
    };
    return {
      email, reasoning: `Fallback due to: ${errorInfo}`, keyPoints: ["Standard outreach template"], 
      nextSteps: ["Await reply"], confidence: 0.4, method: 'algorithmic_fallback'
    };
  }
  
  // Local fallback for follow-up - kept on frontend for resilience
  private generateLocalFallbackFollowUp(creator: Creator, brandInfo: BrandInfo, context: string = "General follow-up"): AIOutreachResponse {
    console.log(`🤖 AI Outreach (FE): Generating LOCAL FALLBACK follow-up for ${creator.name}. Context: ${context}`);
    const subject = `Following Up: ${brandInfo.name} Collaboration with ${creator.name}`;
    const body = `Hi ${creator.name},\n\nJust wanted to gently follow up on our previous message regarding a potential collaboration with ${brandInfo.name}. We're still very interested in exploring how we could work together.\n\nContext: ${context}\n\nPlease let us know your thoughts when you have a moment.\n\nThanks!\nThe ${brandInfo.name} Team`;
    const email: OutreachEmail = {
      id: `fallback_followup_${Date.now()}_${creator.id}`,
      creatorId: creator.id, subject, body, type: 'follow_up', timestamp: new Date(), brandInfo
    };
    return {
      email, reasoning: "Standard local fallback follow-up.", keyPoints: ["Gentle reminder"], 
      nextSteps: ["Monitor for response"], confidence: 0.35, method: 'algorithmic_fallback' 
    };
  }

  // Example BrandInfo can be kept for testing or UI examples
  getExampleBrandInfo(): BrandInfo {
    return {
        name: "EcoWear Collective", industry: "Sustainable Fashion",
        campaignGoals: ["Increase brand awareness", "Drive sales for new recycled apparel line"],
        budget: { min: 50000, max: 150000, currency: "INR" },
        timeline: "Next 8 weeks",
        contentRequirements: ["1 Instagram Reel", "3 Stories", "1 blog post"]
    };
  }
}

export const aiOutreachService = new AIOutreachService();
export type { OutreachEmail, BrandInfo, NegotiationContext, AIOutreachResponse }; 