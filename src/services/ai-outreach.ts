import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import { type Creator } from '../types';

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
  reasoning: string;
  keyPoints: string[];
  nextSteps: string[];
  confidence: number;
}

class AIOutreachService {
  private groqProvider = createGroq({
    apiKey: import.meta.env.VITE_GROQ_API_KEY,
  });
  
  private model = this.groqProvider('llama-3.3-70b-versatile');

  /**
   * Generate initial outreach email to a creator
   */
  async generateInitialOutreach(
    creator: Creator, 
    brandInfo: BrandInfo,
    campaignContext: string
  ): Promise<AIOutreachResponse> {
    try {
      const prompt = `
        You are an expert influencer marketing strategist with 10+ years of experience in creator outreach. Generate a highly personalized, compelling outreach email that builds genuine relationships and drives responses.

        CREATOR PROFILE ANALYSIS:
        - Name: ${creator.name} (${creator.username})
        - Platform: ${creator.platform}
        - Audience: ${creator.metrics.followers.toLocaleString()} followers
        - Engagement: ${creator.metrics.engagementRate}% (${creator.metrics.engagementRate > 3 ? 'HIGH' : creator.metrics.engagementRate > 1.5 ? 'GOOD' : 'NEEDS IMPROVEMENT'})
        - Content Niches: ${creator.niche.join(', ')}
        - Location: ${creator.location}
        - Creator Rating: ${creator.rating}/5 stars
        - Response Time: ${creator.responseTime}
        - Verified Status: ${creator.verified ? 'Verified ✓' : 'Not verified'}
        - Current Rate: ₹${creator.rates.post} per post

        BRAND COLLABORATION DETAILS:
        - Brand: ${brandInfo.name}
        - Industry: ${brandInfo.industry}
        - Campaign Objectives: ${brandInfo.campaignGoals.join(', ')}
        - Budget Allocation: ₹${brandInfo.budget.min} - ₹${brandInfo.budget.max}
        - Project Timeline: ${brandInfo.timeline}
        - Deliverables: ${brandInfo.contentRequirements.join(', ')}
        - Campaign Context: ${campaignContext}

        OUTREACH STRATEGY REQUIREMENTS:
        1. PERSONALIZATION: Reference specific content, recent posts, or achievements
        2. VALUE PROPOSITION: Clear mutual benefits and growth opportunities
        3. SOCIAL PROOF: Mention brand credibility and previous successful collaborations
        4. ENGAGEMENT METRICS: Acknowledge their audience quality and engagement
        5. CULTURAL RELEVANCE: Use Indian market context and cultural nuances
        6. PROFESSIONAL TONE: Respectful, enthusiastic but not pushy
        7. CLEAR NEXT STEPS: Specific call-to-action with easy response options
        8. RELATIONSHIP BUILDING: Focus on long-term partnership potential

        WRITING GUIDELINES:
        - Keep subject line compelling but not salesy (6-10 words)
        - Email body should be 200-300 words maximum
        - Use warm, conversational tone while maintaining professionalism
        - Include specific numbers (engagement rate, follower count) to show research
        - Mention 2-3 specific reasons why they're a perfect fit
        - End with clear next steps and timeline expectations
        - Use Indian currency (₹) and cultural context appropriately

        Generate a response in this EXACT JSON format:
        {
          "subject": "Compelling subject line that mentions collaboration",
          "body": "Complete personalized email body with greeting, personalized introduction, specific brand opportunity, why they're perfect fit, collaboration details, benefits, next steps, and warm closing",
          "reasoning": "Strategic explanation of personalization approach and why this messaging will resonate with this specific creator",
          "keyPoints": ["specific personalization element 1", "unique value proposition 2", "strategic relationship building element 3"],
          "nextSteps": ["creator response action", "brand follow-up action", "timeline expectation"],
          "confidence": 0.85-0.95
        }

        Focus on creating authentic connections that lead to long-term partnerships, not just one-off transactions.
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 2000,
        temperature: 0.4, // Slightly higher for more creative personalization
      });

      const aiResponse = this.parseJsonResponse(text);
      
      // Validate and clean the response
      const cleanedResponse = this.validateAndCleanResponse(aiResponse);
      
      const email: OutreachEmail = {
        id: `outreach_${Date.now()}`,
        creatorId: creator.id,
        subject: cleanedResponse.subject,
        body: cleanedResponse.body,
        type: 'initial_outreach',
        timestamp: new Date(),
        campaignContext,
        brandInfo
      };

      return {
        email,
        reasoning: cleanedResponse.reasoning,
        keyPoints: cleanedResponse.keyPoints,
        nextSteps: cleanedResponse.nextSteps,
        confidence: cleanedResponse.confidence
      };

    } catch (error) {
      console.error('Error generating initial outreach:', error);
      return this.generateFallbackOutreach(creator, brandInfo, campaignContext);
    }
  }

  /**
   * Generate negotiation response email
   */
  async generateNegotiationEmail(
    creator: Creator,
    brandInfo: BrandInfo,
    negotiationContext: NegotiationContext
  ): Promise<AIOutreachResponse> {
    try {
      const prompt = `
        You are an expert negotiation specialist for influencer marketing deals. Generate a professional negotiation email response.

        CREATOR: ${creator.name} (@${creator.username})
        - Platform: ${creator.platform}
        - Followers: ${creator.metrics.followers.toLocaleString()}
        - Engagement: ${creator.metrics.engagementRate}%
        - Current Rate: ₹${creator.rates.post}

        BRAND: ${brandInfo.name}
        - Budget Range: ₹${brandInfo.budget.min} - ₹${brandInfo.budget.max}

        NEGOTIATION CONTEXT:
        - Current Brand Offer: ₹${negotiationContext.currentOffer}
        - Creator Asking Price: ₹${negotiationContext.creatorAskingPrice || 'Not specified'}
        - Negotiation Round: ${negotiationContext.negotiationRound}
        - Previous Messages: ${negotiationContext.previousMessages.join(' | ')}

        NEGOTIATION STRATEGY:
        1. Find middle ground if prices are far apart
        2. Emphasize value proposition and mutual benefits
        3. Suggest alternative compensation (bonuses, long-term partnership, etc.)
        4. Be respectful but firm on budget constraints
        5. Offer creative solutions (package deals, performance bonuses)
        6. Maintain professional relationship even if deal doesn't work out

        Generate response in JSON format:
        {
          "subject": "Re: Collaboration Opportunity - Let's Find Common Ground",
          "body": "Professional negotiation email with specific counteroffer and reasoning",
          "reasoning": "Why this negotiation approach was chosen",
          "keyPoints": ["negotiation point 1", "point 2", "point 3"],
          "nextSteps": ["next step 1", "next step 2"],
          "confidence": 0.0-1.0
        }
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 1200,
        temperature: 0.4,
      });

      const aiResponse = this.parseJsonResponse(text);
      
      // Validate and clean the response
      const cleanedResponse = this.validateAndCleanResponse(aiResponse);
      
      const email: OutreachEmail = {
        id: `negotiation_${Date.now()}`,
        creatorId: creator.id,
        subject: cleanedResponse.subject,
        body: cleanedResponse.body,
        type: 'negotiation',
        timestamp: new Date(),
        brandInfo
      };

      return {
        email,
        reasoning: cleanedResponse.reasoning,
        keyPoints: cleanedResponse.keyPoints,
        nextSteps: cleanedResponse.nextSteps,
        confidence: cleanedResponse.confidence
      };

    } catch (error) {
      console.error('Error generating negotiation email:', error);
      return this.generateFallbackNegotiation(creator, brandInfo, negotiationContext);
    }
  }

  /**
   * Generate follow-up email
   */
  async generateFollowUpEmail(
    creator: Creator,
    brandInfo: BrandInfo,
    daysSinceLastContact: number,
    previousEmailType: string
  ): Promise<AIOutreachResponse> {
    try {
      const followUpStrategy = this.determineFollowUpStrategy(daysSinceLastContact, previousEmailType);
      
      const prompt = `
        You are an expert relationship manager specializing in creator partnerships. Generate an intelligent follow-up email that re-engages creators while respecting their time and decision-making process.

        CREATOR CONTEXT:
        - Name: ${creator.name} (${creator.username})
        - Platform: ${creator.platform}
        - Audience: ${creator.metrics.followers.toLocaleString()} followers
        - Engagement Rate: ${creator.metrics.engagementRate}%
        - Content Focus: ${creator.niche.join(', ')}
        - Location: ${creator.location}
        - Rating: ${creator.rating}/5 stars
        - Response Time: ${creator.responseTime}

        BRAND & CAMPAIGN:
        - Brand: ${brandInfo.name}
        - Industry: ${brandInfo.industry}
        - Budget: ₹${brandInfo.budget.min} - ₹${brandInfo.budget.max}
        - Timeline: ${brandInfo.timeline}

        FOLLOW-UP CONTEXT:
        - Days Since Last Contact: ${daysSinceLastContact}
        - Previous Email Type: ${previousEmailType}
        - Follow-up Strategy: ${followUpStrategy.strategy}
        - Recommended Tone: ${followUpStrategy.tone}
        - Key Focus: ${followUpStrategy.focus}

        FOLLOW-UP INTELLIGENCE GUIDELINES:
        ${this.getFollowUpGuidelines(daysSinceLastContact, previousEmailType)}

        STRATEGIC APPROACH:
        1. TIMING ACKNOWLEDGMENT: Reference the time gap appropriately
        2. VALUE ADDITION: Provide new information, updates, or incentives
        3. SOFT PRESSURE: Gentle urgency without being pushy
        4. EASY EXIT: Give them an easy way to decline gracefully
        5. RELATIONSHIP PRESERVATION: Keep door open for future opportunities
        6. SOCIAL PROOF: Mention any new achievements or testimonials
        7. FLEXIBILITY: Show willingness to adapt terms or timing

        Generate a response in this EXACT JSON format:
        {
          "subject": "Strategic follow-up subject that adds value or urgency",
          "body": "Complete follow-up email with time-appropriate greeting, acknowledgment of previous contact, new value proposition or update, clear options for response/decline, and relationship-preserving closing",
          "reasoning": "Strategic explanation of follow-up timing, approach, and expected effectiveness",
          "keyPoints": ["timing strategy", "value addition element", "relationship preservation tactic"],
          "nextSteps": ["creator response options", "brand action plan", "timeline expectations"],
          "confidence": 0.75-0.90
        }

        Focus on re-engagement without damaging the potential relationship.
      `;

      const { text } = await generateText({
        model: this.model,
        prompt,
        maxTokens: 1500,
        temperature: 0.35,
      });

      const aiResponse = this.parseJsonResponse(text);
      
      // Validate and clean the response
      const cleanedResponse = this.validateAndCleanResponse(aiResponse);
      
      const email: OutreachEmail = {
        id: `followup_${Date.now()}`,
        creatorId: creator.id,
        subject: cleanedResponse.subject,
        body: cleanedResponse.body,
        type: 'follow_up',
        timestamp: new Date(),
        brandInfo
      };

      return {
        email,
        reasoning: cleanedResponse.reasoning,
        keyPoints: cleanedResponse.keyPoints,
        nextSteps: cleanedResponse.nextSteps,
        confidence: cleanedResponse.confidence
      };

    } catch (error) {
      console.error('Error generating follow-up email:', error);
      return this.generateFallbackFollowUp(creator, brandInfo);
    }
  }

  /**
   * Determine follow-up strategy based on timing and context
   */
  private determineFollowUpStrategy(daysSinceLastContact: number, previousEmailType: string) {
    if (daysSinceLastContact <= 3) {
      return {
        strategy: 'Too Soon - Wait Longer',
        tone: 'Patient',
        focus: 'Give them space'
      };
    } else if (daysSinceLastContact <= 7) {
      return {
        strategy: 'Gentle Reminder',
        tone: 'Friendly and Understanding',
        focus: 'Soft check-in with additional value'
      };
    } else if (daysSinceLastContact <= 14) {
      return {
        strategy: 'Value-Added Follow-up',
        tone: 'Professional with New Information',
        focus: 'Share updates, testimonials, or improved offer'
      };
    } else if (daysSinceLastContact <= 30) {
      return {
        strategy: 'Strategic Re-engagement',
        tone: 'Direct but Respectful',
        focus: 'Last attempt with best offer or deadline'
      };
    } else {
      return {
        strategy: 'Relationship Preservation',
        tone: 'Gracious and Future-Focused',
        focus: 'Keep door open for future opportunities'
      };
    }
  }

  /**
   * Get specific guidelines based on follow-up timing
   */
  private getFollowUpGuidelines(daysSinceLastContact: number, previousEmailType: string): string {
    if (daysSinceLastContact <= 7) {
      return `
        EARLY FOLLOW-UP (${daysSinceLastContact} days):
        - Acknowledge they might still be considering
        - Provide additional information or social proof
        - No pressure, just gentle value addition
        - Mention other creators' positive experiences
        - Offer to answer any questions`;
    } else if (daysSinceLastContact <= 14) {
      return `
        MID-TERM FOLLOW-UP (${daysSinceLastContact} days):
        - Reference campaign timeline and urgency
        - Share any new brand achievements or press coverage
        - Offer slight incentive or flexibility in terms
        - Provide testimonials from similar creators
        - Give clear deadline for response`;
    } else if (daysSinceLastContact <= 30) {
      return `
        LATE FOLLOW-UP (${daysSinceLastContact} days):
        - This is likely the final outreach attempt
        - Provide best possible offer or terms
        - Create gentle urgency with campaign deadlines
        - Offer alternative collaboration formats
        - Make it easy to decline gracefully`;
    } else {
      return `
        RELATIONSHIP PRESERVATION (${daysSinceLastContact}+ days):
        - Acknowledge this campaign may not be right for them
        - Keep door open for future collaborations
        - Share brand's continued growth and success
        - Offer to stay in touch for future opportunities
        - Express genuine appreciation for their content`;
    }
  }

  /**
   * Parse JSON response with fallback handling
   */
  private parseJsonResponse(text: string): any {
    // Only log in development mode to reduce console noise
    const isDev = import.meta.env.DEV;
    
    if (isDev) {
      console.log('🔍 Raw LLM Response:', text.substring(0, 100) + '...');
    }
    
    try {
      // First, try direct JSON parsing
      const parsed = JSON.parse(text.trim());
      if (isDev) {
        console.log('✅ Direct JSON parse successful');
      }
      return parsed;
    } catch (error1) {
      // Try markdown cleanup silently
      try {
        let cleanedText = text.trim();
        cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
        cleanedText = cleanedText.replace(/```\n?/g, '');
        const parsed = JSON.parse(cleanedText.trim());
        if (isDev) {
          console.log('✅ Cleaned JSON parse successful');
        }
        return parsed;
      } catch (error2) {
        // Try JSON extraction silently
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (isDev) {
              console.log('✅ Extracted JSON parse successful');
            }
            return parsed;
          }
          throw new Error('No valid JSON found');
        } catch (error3) {
          // Try fixing common issues silently
          try {
            let fixedText = text.trim();
            
            const startIndex = fixedText.indexOf('{');
            if (startIndex > 0) {
              fixedText = fixedText.substring(startIndex);
            }
            
            const endIndex = fixedText.lastIndexOf('}');
            if (endIndex >= 0) {
              fixedText = fixedText.substring(0, endIndex + 1);
            }
            
            fixedText = fixedText
              .replace(/,\s*}/g, '}')
              .replace(/,\s*]/g, ']')
              .replace(/'/g, '"')
              .replace(/(\w+):/g, '"$1":')
              .replace(/""/g, '"');
            
            const parsed = JSON.parse(fixedText);
            if (isDev) {
              console.log('✅ Fixed JSON parse successful');
            }
            return parsed;
          } catch (error4) {
            // Only log detailed errors in development mode
            if (isDev) {
              console.warn('⚠️ JSON parsing failed, using intelligent fallback extraction');
            }
            
            // Use intelligent content extraction without logging errors
            return this.intelligentContentExtraction(text);
          }
        }
      }
    }
  }

  /**
   * Intelligent content extraction when JSON parsing fails
   */
  private intelligentContentExtraction(text: string): any {
    const isDev = import.meta.env.DEV;
    
    // Try to extract specific fields using regex
    const subjectMatch = text.match(/"subject":\s*"([^"]+)"/);
    const bodyMatch = text.match(/"body":\s*"([^"]+)"/);
    const reasoningMatch = text.match(/"reasoning":\s*"([^"]+)"/);
    const confidenceMatch = text.match(/"confidence":\s*([\d.]+)/);
    
    let extractedBody = '';
    
    if (bodyMatch) {
      extractedBody = bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      // Extract email-like content from the raw text
      extractedBody = this.extractEmailContentFromText(text);
    }
    
    const result = {
      subject: subjectMatch ? subjectMatch[1] : "Collaboration Opportunity with TechFlow India",
      body: extractedBody,
      reasoning: reasoningMatch ? reasoningMatch[1] : "AI-generated personalized outreach email",
      keyPoints: [
        "Personalized introduction based on creator's profile",
        "Clear collaboration opportunity description", 
        "Professional communication with clear next steps"
      ],
      nextSteps: [
        "Await creator's response",
        "Schedule follow-up call if interested",
        "Prepare detailed campaign brief"
      ],
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8
    };
    
    if (isDev) {
      console.log('🛠️ Used intelligent content extraction');
    }
    
    return result;
  }

  /**
   * Extract email content from raw text when JSON parsing fails
   */
  private extractEmailContentFromText(text: string): string {
    // Try to find email-like content in the text
    const lines = text.split('\n');
    const emailLines: string[] = [];
    let foundEmailStart = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip JSON keys and metadata
      if (trimmedLine.startsWith('"') && (
        trimmedLine.includes('subject') || 
        trimmedLine.includes('reasoning') || 
        trimmedLine.includes('keyPoints') || 
        trimmedLine.includes('nextSteps') ||
        trimmedLine.includes('confidence')
      )) {
        continue;
      }
      
      // Look for greeting patterns
      if (trimmedLine.match(/^(Dear|Hi|Hello|Greetings)/i)) {
        foundEmailStart = true;
      }
      
      if (foundEmailStart && trimmedLine.length > 0 && !trimmedLine.startsWith('{') && !trimmedLine.startsWith('}')) {
        emailLines.push(trimmedLine);
      }
      
      // Stop at signature patterns
      if (trimmedLine.match(/^(Best regards|Sincerely|Thanks|Thank you)/i)) {
        emailLines.push(trimmedLine);
        break;
      }
    }
    
    if (emailLines.length === 0) {
      return "Dear Creator,\n\nI hope this message finds you well. We'd love to discuss a potential collaboration opportunity with you.\n\nBest regards,\nMarketing Team";
    }
    
    return emailLines.join('\n\n');
  }

  /**
   * Generate fallback outreach email if AI fails
   */
  private generateFallbackOutreach(creator: Creator, brandInfo: BrandInfo, campaignContext: string): AIOutreachResponse {
    const email: OutreachEmail = {
      id: `fallback_${Date.now()}`,
      creatorId: creator.id,
      subject: `Collaboration Opportunity with ${brandInfo.name}`,
      body: `Dear ${creator.name},

I hope this email finds you well! I came across your ${creator.platform} profile and was impressed by your content in the ${creator.niche.join(' and ')} space.

We're working with ${brandInfo.name} on an exciting campaign and believe you'd be a perfect fit based on your ${creator.metrics.followers.toLocaleString()} followers and ${creator.metrics.engagementRate}% engagement rate.

Campaign Details:
- Brand: ${brandInfo.name}
- Budget Range: ₹${brandInfo.budget.min} - ₹${brandInfo.budget.max}
- Timeline: ${brandInfo.timeline}

Would you be interested in learning more about this collaboration opportunity? I'd love to discuss the details and see if we can create something amazing together.

Looking forward to hearing from you!

Best regards,
Marketing Team`,
      type: 'initial_outreach',
      timestamp: new Date(),
      campaignContext,
      brandInfo
    };

    return {
      email,
      reasoning: "Fallback template used due to AI processing error",
      keyPoints: ["Professional introduction", "Clear opportunity description", "Next steps provided"],
      nextSteps: ["Wait for creator response", "Follow up in 3-5 days if no response"],
      confidence: 0.7
    };
  }

  private generateFallbackNegotiation(creator: Creator, brandInfo: BrandInfo, negotiationContext: NegotiationContext): AIOutreachResponse {
    const middleGround = Math.round((negotiationContext.currentOffer + (negotiationContext.creatorAskingPrice || creator.rates.post)) / 2);
    
    const email: OutreachEmail = {
      id: `fallback_nego_${Date.now()}`,
      creatorId: creator.id,
      subject: `Re: Collaboration Discussion - Finding Common Ground`,
      body: `Hi ${creator.name},

Thank you for your interest in collaborating with ${brandInfo.name}. I appreciate you sharing your rate expectations.

After reviewing our budget and the value you bring, I'd like to propose ₹${middleGround} for this collaboration. This reflects both our budget considerations and recognition of your quality content and engagement.

Additionally, we'd be happy to discuss:
- Performance bonuses based on engagement metrics
- Long-term partnership opportunities
- Cross-platform content package deals

Would this work for you? I'm open to discussing how we can make this collaboration beneficial for both parties.

Best regards,
Marketing Team`,
      type: 'negotiation',
      timestamp: new Date(),
      brandInfo
    };

    return {
      email,
      reasoning: "Fallback negotiation template with middle-ground pricing",
      keyPoints: ["Compromise offer", "Additional value propositions", "Open to further discussion"],
      nextSteps: ["Await creator response", "Prepare alternative compensation structures"],
      confidence: 0.6
    };
  }

  private generateFallbackFollowUp(creator: Creator, brandInfo: BrandInfo): AIOutreachResponse {
    const email: OutreachEmail = {
      id: `fallback_followup_${Date.now()}`,
      creatorId: creator.id,
      subject: `Following Up - ${brandInfo.name} Collaboration`,
      body: `Hi ${creator.name},

I wanted to follow up on our previous conversation about the collaboration opportunity with ${brandInfo.name}.

I understand you're probably busy with your content creation and other commitments. If the timing isn't right or if you have any questions about the partnership, please let me know.

If you're not interested at the moment, no worries at all! I'd love to keep you in mind for future opportunities that might be a better fit.

Thanks for your time!

Best regards,
Marketing Team`,
      type: 'follow_up',
      timestamp: new Date(),
      brandInfo
    };

    return {
      email,
      reasoning: "Polite follow-up with easy exit option",
      keyPoints: ["Respectful of their time", "Open door for future", "Easy response options"],
      nextSteps: ["Respect their decision", "Note for future opportunities"],
      confidence: 0.8
    };
  }

  /**
   * Check if AI service is available
   */
  isAvailable(): boolean {
    return !!import.meta.env.VITE_GROQ_API_KEY;
  }

  /**
   * Get example brand info for testing
   */
  getExampleBrandInfo(): BrandInfo {
    return {
      name: "TechFlow India",
      industry: "Technology",
      campaignGoals: ["Product awareness", "User acquisition", "Brand building"],
      budget: {
        min: 5000,
        max: 25000,
        currency: "₹"
      },
      timeline: "2 weeks",
      contentRequirements: ["Instagram post", "Story coverage", "Product review"]
    };
  }

  /**
   * Validate and clean the AI response to ensure proper structure
   */
  private validateAndCleanResponse(response: any): any {
    const isDev = import.meta.env.DEV;
    
    if (isDev) {
      console.log('🧹 Cleaning AI response');
    }
    
    // Ensure we have a proper response structure
    const cleaned = {
      subject: String(response.subject || 'Collaboration Opportunity').trim(),
      body: this.cleanEmailBody(String(response.body || '')),
      reasoning: String(response.reasoning || 'AI-generated outreach email').trim(),
      keyPoints: Array.isArray(response.keyPoints) ? response.keyPoints : ['Personalized outreach', 'Professional communication'],
      nextSteps: Array.isArray(response.nextSteps) ? response.nextSteps : ['Await response', 'Follow up if needed'],
      confidence: typeof response.confidence === 'number' ? response.confidence : 0.8
    };
    
    if (isDev) {
      console.log('✅ Response cleaned successfully');
    }
    return cleaned;
  }

  /**
   * Clean email body to remove any JSON artifacts or formatting issues
   */
  private cleanEmailBody(body: string): string {
    const isDev = import.meta.env.DEV;
    let cleaned = body.trim();
    
    // Remove any JSON-like artifacts that might have leaked in
    cleaned = cleaned
      .replace(/\\n/g, '\n')  // Fix escaped newlines
      .replace(/\\"/g, '"')   // Fix escaped quotes
      .replace(/^"|"$/g, '')  // Remove surrounding quotes
      .replace(/^\{.*?\}$/gs, '') // Remove any JSON objects
      .replace(/"reasoning".*$/gm, '') // Remove reasoning lines
      .replace(/"keyPoints".*$/gm, '') // Remove keyPoints lines
      .replace(/"nextSteps".*$/gm, '') // Remove nextSteps lines
      .replace(/"confidence".*$/gm, '') // Remove confidence lines
      .replace(/^\s*[\{\}]\s*$/gm, '') // Remove standalone braces
      .replace(/^\s*,\s*$/gm, '') // Remove standalone commas
      .trim();
    
    // If the body is still empty or looks like JSON, provide a fallback
    if (!cleaned || cleaned.length < 10 || cleaned.startsWith('{') || cleaned.includes('"subject"')) {
      if (isDev) {
        console.log('⚠️ Email body appears to be malformed, using fallback');
      }
      cleaned = "Dear Creator,\n\nI hope this email finds you well! We came across your profile and were impressed by your content and engagement.\n\nWe'd love to discuss a potential collaboration opportunity that aligns with your style and audience.\n\nLooking forward to hearing from you!\n\nBest regards,\nMarketing Team";
    }
    
    return cleaned;
  }
}

export const aiOutreachService = new AIOutreachService();
export type { OutreachEmail, BrandInfo, NegotiationContext, AIOutreachResponse }; 