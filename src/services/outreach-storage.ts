import { supabase } from '../lib/supabase'; // Import Supabase client
// import { type Creator } from '../types'; // Currently unused but may be needed later

// Define interfaces for our outreach data structure
export interface ConversationMessage {
  id: string; // Will be Supabase generated UUID
  outreach_id?: string; // Foreign key to outreaches table
  user_id?: string; // Foreign key to auth.users
  content: string;
  sender: 'brand' | 'creator' | 'ai';
  timestamp: Date;
  type: 'outreach' | 'response' | 'negotiation' | 'update' | 'call_log' | 'voice_transcript' | 'call_exchange' | 'voice_call_summary';
  metadata?: {
    aiMethod?: 'ai_generated' | 'algorithmic_fallback';
    strategy?: string;
    tactics?: string[];
    suggestedOffer?: number;
    phase?: string;
    errorInfo?: string;
    call_sid?: string;
    recording_url?: string;
    recording_duration?: string;
    creator_segment_recording_sid?: string;
    full_recording_url?: string;
    full_recording_duration?: string;
    turns?: Array<{
      speaker: string;
      text: string;
      audio_url?: string;
    }>;
  };
}

export interface StoredOutreach {
  id: string; // Will be Supabase generated UUID
  user_id?: string; // Foreign key to auth.users
  campaign_id?: string; // Foreign key to a campaigns table
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  creatorPlatform: string;
  creatorPhoneNumber?: string;
  subject: string;
  body: string; // Initial outreach message content
  status: 'pending' | 'contacted' | 'interested' | 'negotiating' | 'deal_closed' | 'declined';
  confidence: number;
  reasoning: string;
  keyPoints: string[];
  nextSteps: string[];
  brandName: string;
  campaignContext: string;
  createdAt: Date;
  lastContact: Date;
  currentOffer?: number;
  notes: string;
  conversationHistory: ConversationMessage[];
}

// Type for data passed to saveOutreach, before Supabase generates ID and timestamps
export type NewOutreachData = Omit<StoredOutreach, 'id' | 'createdAt' | 'lastContact' | 'conversationHistory' | 'user_id' | 'campaign_id'> & {
  campaign_id: string; // campaign_id is mandatory for a new outreach
};

export interface OutreachSummary {
  totalOutreaches: number;
  statusCounts: Record<string, number>;
  recentOutreaches: StoredOutreach[];
  successRate: number;
}

class OutreachStorageService {
  // private storageKey = 'influencer_outreaches'; // No longer needed

  /**
   * Save a new outreach to Supabase
   */
  async saveOutreach(outreachData: NewOutreachData): Promise<StoredOutreach | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ User not authenticated. Cannot save outreach.');
        throw new Error('User not authenticated');
      }
      const userId = user.id;

      const newOutreachRecord = {
        user_id: userId,
        campaign_id: outreachData.campaign_id,
        creator_id: outreachData.creatorId,
        creator_name: outreachData.creatorName,
        creator_avatar: outreachData.creatorAvatar,
        creator_platform: outreachData.creatorPlatform,
        creator_phone_number: outreachData.creatorPhoneNumber,
        subject: outreachData.subject,
        body: outreachData.body, // Storing initial message here as per table design
        status: outreachData.status || 'pending',
        confidence: outreachData.confidence,
        reasoning: outreachData.reasoning,
        key_points: outreachData.keyPoints,
        next_steps: outreachData.nextSteps,
        brand_name: outreachData.brandName,
        campaign_context: outreachData.campaignContext,
        current_offer: outreachData.currentOffer,
        notes: outreachData.notes,
        // Supabase will default created_at and last_contact
      };

      const { data: savedOutreach, error: outreachError } = await supabase
        .from('outreaches')
        .insert(newOutreachRecord)
        .select()
        .single();

      if (outreachError) {
        console.error('❌ Error saving outreach to Supabase:', outreachError);
        throw outreachError;
      }

      if (!savedOutreach) {
        console.error('❌ No data returned after saving outreach.');
        return null;
      }
      
      console.log('✅ Outreach saved to Supabase, ID:', savedOutreach.id);

      // Now save the initial message to conversation_messages
      const initialMessageContent = savedOutreach.body; // Use body from the saved outreach
      const initialMessage: Omit<ConversationMessage, 'id' | 'timestamp'> = {
        outreach_id: savedOutreach.id,
        user_id: userId,
        content: initialMessageContent,
        sender: 'brand',
        type: 'outreach',
        // metadata can be added if needed
      };

      const { data: savedMessage, error: messageError } = await supabase
        .from('conversation_messages')
        .insert(initialMessage)
        .select()
        .single();

      if (messageError) {
        console.error('❌ Error saving initial conversation message to Supabase:', messageError);
        // Optional: decide if we should roll back the outreach insert or handle this state
        throw messageError;
      }
      
      if (!savedMessage) {
        console.error('❌ No data returned after saving initial message.');
        // This is problematic as the outreach expects a conversation history
        return null; 
      }

      console.log('✅ Initial conversation message saved to Supabase, ID:', savedMessage.id);
      
      // Construct the StoredOutreach object to return
      const fullOutreach: StoredOutreach = {
        ...outreachData, // Spread the original input data
        id: savedOutreach.id,
        user_id: userId,
        campaign_id: outreachData.campaign_id, 
        createdAt: new Date(savedOutreach.created_at),
        lastContact: new Date(savedOutreach.last_contact || savedOutreach.created_at),
        conversationHistory: [{
          id: savedMessage.id,
          outreach_id: savedMessage.outreach_id,
          user_id: savedMessage.user_id,
          content: savedMessage.content,
          sender: savedMessage.sender as 'brand' | 'creator' | 'ai',
          timestamp: new Date(savedMessage.timestamp),
          type: savedMessage.type as ConversationMessage['type'],
          metadata: savedMessage.metadata || undefined,
        }],
      };
      
      return fullOutreach;

    } catch (error) {
      console.error('❌ Error in saveOutreach service method:', error);
      return null;
    }
  }

  /**
   * Get all outreaches from Supabase for the authenticated user
   */
  async getAllOutreaches(): Promise<StoredOutreach[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('⚠️ User not authenticated. Cannot load outreaches.');
        return [];
      }
      const userId = user.id;

      const { data: outreachRecords, error: outreachError } = await supabase
        .from('outreaches')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (outreachError) {
        console.error('❌ Error loading outreaches from Supabase:', outreachError);
        throw outreachError;
      }

      if (!outreachRecords) return [];

      const storedOutreaches: StoredOutreach[] = [];

      for (const record of outreachRecords) {
        const { data: messages, error: messagesError } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('outreach_id', record.id)
          .order('timestamp', { ascending: true });

        if (messagesError) {
          console.error(`❌ Error loading messages for outreach ${record.id}:`, messagesError);
          // Decide how to handle this: skip this outreach, return partial, etc.
          // For now, we'll create the outreach with empty history.
        }
        
        const conversationHistory: ConversationMessage[] = (messages || []).map(msg => ({
          id: msg.id,
          outreach_id: msg.outreach_id,
          user_id: msg.user_id,
          content: msg.content,
          sender: msg.sender as 'brand' | 'creator' | 'ai',
          timestamp: new Date(msg.timestamp),
          type: msg.type as ConversationMessage['type'],
          metadata: msg.metadata || undefined,
        }));
        
        storedOutreaches.push({
          id: record.id,
          user_id: record.user_id,
          campaign_id: record.campaign_id,
          creatorId: record.creator_id,
          creatorName: record.creator_name,
          creatorAvatar: record.creator_avatar,
          creatorPlatform: record.creator_platform,
          creatorPhoneNumber: record.creator_phone_number,
          subject: record.subject,
          body: record.body, // This is the initial message
          status: record.status as StoredOutreach['status'],
          confidence: record.confidence,
          reasoning: record.reasoning,
          keyPoints: record.key_points || [],
          nextSteps: record.next_steps || [],
          brandName: record.brand_name,
          campaignContext: record.campaign_context,
          createdAt: new Date(record.created_at),
          lastContact: new Date(record.last_contact || record.created_at),
          currentOffer: record.current_offer,
          notes: record.notes,
          conversationHistory: conversationHistory,
        });
      }
      
      console.log('INFO: Loaded ' + storedOutreaches.length + ' outreaches from Supabase.');
      return storedOutreaches;

    } catch (error) {
      console.error('❌ Error in getAllOutreaches service method:', error);
      return [];
    }
  }

  /**
   * Get outreaches for a specific creator
   */
  getOutreachesForCreator(creatorId: string): StoredOutreach[] {
    // THIS METHOD IS NOW OUTDATED AND NEEDS REFACTORING FOR SUPABASE
    // For now, it will return an empty array or could call getAllOutreaches and filter locally,
    // but that's inefficient. Ideally, it should query Supabase directly.
    console.warn("getOutreachesForCreator is not yet updated for Supabase and will return empty results or use old logic.");
    // const allOutreaches = this.getAllOutreaches(); // This is now async!
    // return allOutreaches.filter(outreach => outreach.creatorId === creatorId);
    return []; 
  }

  /**
   * Add a new message to the conversation history in Supabase
   */
  async addConversationMessage(
    outreachId: string, 
    content: string, 
    sender: 'brand' | 'creator' | 'ai',
    type: ConversationMessage['type'],
    metadata?: ConversationMessage['metadata']
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const newMessageData = {
        outreach_id: outreachId,
        user_id: user.id,
        content,
        sender,
        type,
        metadata,
        // Supabase will default timestamp
      };

      const { error: messageError } = await supabase
        .from('conversation_messages')
        .insert(newMessageData);

      if (messageError) {
        console.error('❌ Error adding conversation message to Supabase:', messageError);
        throw messageError;
      }

      // Also update the last_contact field on the parent outreach
      const { error: updateError } = await supabase
        .from('outreaches')
        .update({ last_contact: new Date().toISOString() })
        .eq('id', outreachId);

      if (updateError) {
        console.warn('⚠️ Error updating last_contact on outreach:', updateError);
        // Not a critical failure, but good to log
      }
      
      console.log('✅ Conversation message added to Supabase.');

    } catch (error) {
      console.error('❌ Error in addConversationMessage service method:', error);
    }
  }

  /**
   * Update outreach status in Supabase
   */
  async updateOutreachStatus(outreachId: string, status: StoredOutreach['status'], notes?: string, currentOffer?: number): Promise<void> {
    try {
      // Construct the update object with explicit snake_case for current_offer
      const updateData: { 
        status: StoredOutreach['status']; 
        last_contact: string;
        current_offer?: number; // Explicitly snake_case
        notes?: string; 
      } = {
        status,
        last_contact: new Date().toISOString(),
      };

      if (currentOffer !== undefined) {
        updateData.current_offer = currentOffer; // Use snake_case here
      }
      
      if (notes !== undefined) {
        updateData.notes = notes; // Assuming 'notes' column in DB is 'notes' (typically snake_cased if not an exact match)
                                  // StoredOutreach interface uses 'notes', so this should map to 'notes' or 'note' in DB.
                                  // If 'notes' column is also an issue, it would need similar explicit mapping.
      }

      const { error } = await supabase
        .from('outreaches')
        .update(updateData) // Pass the object with explicit snake_case field
        .eq('id', outreachId);
      
      if (error) {
        console.error('❌ Error updating outreach status in Supabase:', error);
        throw error;
      }

      // If 'notes' were provided and intended as a status update message:
      if (notes) {
         await this.addConversationMessage(outreachId, `Status updated to ${status}. ${notes}`, 'brand', 'update');
      } else {
         await this.addConversationMessage(outreachId, `Status updated to ${status}.`, 'brand', 'update');
      }
      
      console.log('✅ Outreach status updated in Supabase:', status);

    } catch (error) {
      console.error('❌ Error in updateOutreachStatus service method:', error);
    }
  }

  /**
   * Get conversation history for an outreach from Supabase
   */
  async getConversationHistory(outreachId: string): Promise<ConversationMessage[]> {
    try {
      const { data: messages, error } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('outreach_id', outreachId)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error(`❌ Error loading conversation history for outreach ${outreachId}:`, error);
        throw error;
      }

      return (messages || []).map(msg => ({
        id: msg.id,
        outreach_id: msg.outreach_id,
        user_id: msg.user_id,
        content: msg.content,
        sender: msg.sender as 'brand' | 'creator' | 'ai',
        timestamp: new Date(msg.timestamp),
        type: msg.type as ConversationMessage['type'],
        metadata: msg.metadata || undefined,
      }));
    } catch (error) {
      console.error('❌ Error in getConversationHistory service method:', error);
      return [];
    }
  }

  /**
   * Get conversation context for AI prompts (remains largely the same logic, but uses async getConversationHistory)
   */
  async getConversationContext(outreachId: string): Promise<string> {
    const history = await this.getConversationHistory(outreachId);
    
    if (history.length === 0) return '';
    
    return history.map(msg => {
      const senderLabel = msg.sender === 'brand' ? 'You' : msg.sender === 'creator' ? 'Creator' : 'AI Assistant';
      const timeStr = msg.timestamp.toLocaleDateString(); // Consider using toLocaleTimeString for more precision if needed
      return `[${timeStr}] ${senderLabel}: ${msg.content}`;
    }).join('\n\n');
  }

  /**
   * Get outreach summary for dashboard (this will need significant refactoring for Supabase)
   */
  async getOutreachSummary(): Promise<OutreachSummary> {
    // THIS METHOD IS NOW OUTDATED AND NEEDS COMPLETE REFACTORING FOR SUPABASE
    // It requires querying Supabase for counts, statuses, etc.
    console.warn("getOutreachSummary is not yet updated for Supabase and will return empty/default results.");
    return {
      totalOutreaches: 0,
      statusCounts: {},
      recentOutreaches: [],
      successRate: 0
    };
  }

  /**
   * Delete an outreach and its messages from Supabase
   */
  async deleteOutreach(outreachId: string): Promise<void> {
    try {
      // Supabase is configured with ON DELETE CASCADE for conversation_messages,
      // so deleting the outreach should automatically delete its messages.
      const { error } = await supabase
        .from('outreaches')
        .delete()
        .eq('id', outreachId);

      if (error) {
        console.error('❌ Error deleting outreach from Supabase:', error);
        throw error;
      }
      console.log('✅ Outreach deleted from Supabase:', outreachId);
    } catch (error) {
      console.error('❌ Error in deleteOutreach service method:', error);
    }
  }

  /**
   * Clear all outreaches for the current user from Supabase (Use with caution!)
   */
  async clearAllOutreaches(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // First delete all conversation messages for the user (optional, as CASCADE should handle it)
      // This is more explicit if we want to be certain or if CASCADE isn't set on user_id for messages.
      // However, our DDL for conversation_messages has ON DELETE CASCADE for outreach_id, not directly user_id.
      // So, deleting from 'outreaches' is the primary action.

      const { error } = await supabase
        .from('outreaches')
        .delete()
        .eq('user_id', user.id);
      
      if (error) {
        console.error('❌ Error clearing all outreaches from Supabase:', error);
        throw error;
      }
      console.log('✅ All outreaches for the current user cleared from Supabase.');
    } catch (error) {
      console.error('❌ Error in clearAllOutreaches service method:', error);
    }
  }
}

export const outreachStorageService = new OutreachStorageService(); 