import { supabase } from '../lib/supabase'; // Import Supabase client
import { toast } from 'react-toastify'; // ADDED: Import toast
// import { type Creator } from '../types'; // Currently unused but may be needed later

// --- Metadata Interface Definitions ---
// Base for metadata that might include a call_sid, but it's not always required at base level
interface BaseCallMetadata {
  call_sid?: string;
}

// Metadata for AI-driven negotiation messages
export interface AiNegotiationMetadata extends BaseCallMetadata {
  aiMethod?: 'ai_generated' | 'algorithmic_fallback';
  strategy?: string;
  tactics?: string[];
  suggestedOffer?: number;
  phase?: string;
  errorInfo?: string; // For errors specific to AI negotiation generation
}

// Metadata for voice call summaries
export interface VoiceCallSummaryMetadata extends BaseCallMetadata {
  call_sid: string; // A summary is always tied to a specific call SID
  full_recording_url: string;
  full_recording_duration: string;
  human_readable_summary?: string;
  error_message?: string; // For errors during call processing or summary/recording retrieval
  turns?: Array<{
    speaker: string;
    text: string;
    audio_url?: string; // URL to audio snippet for this turn
  }>;
  // The following might be redundant if full_recording_url covers all cases
  // recording_url?: string; 
  // recording_duration?: string;
}

// Metadata for voice transcripts
export interface VoiceTranscriptMetadata extends BaseCallMetadata {
  call_sid: string; // A transcript is tied to a specific call SID
  turns: Array<{
    speaker: string;
    text: string;
    audio_url?: string;
  }>;
}

// Metadata for call exchange messages (e.g., specific segments or events in a call)
export interface CallExchangeMetadata extends BaseCallMetadata {
  call_sid: string; // An exchange is part of a call
  creator_segment_recording_sid?: string; // If there's a specific recording SID for a segment
  turns?: Array<{ // May include turns or be a more general log
    speaker: string;
    text: string;
  }>;
}

// Metadata for simple call logs (e.g., "call started", "call failed")
export interface CallLogMetadata extends BaseCallMetadata {
  call_sid: string; // Log is tied to a call
  // 'content' field of the message can hold the log message itself
}

// Metadata for call recording messages
export interface CallRecordingMetadata extends BaseCallMetadata {
  // Currently, the content field of the message holds "Call recording available. Duration: ..."
  // If backend adds specific metadata fields like recording_url or duration here, define them.
  // For now, call_sid from BaseCallMetadata is sufficient.
  recording_url?: string; // Optional: if backend provides direct link in this message type
  duration?: string;    // Optional: e.g., "35s"
}

// NEW: Metadata for messages sent via Gmail
export interface GmailSentMessageMetadata { // No BaseCallMetadata needed here unless a call is involved
  subject: string;
  gmail_send_status: 'pending_gmail_send' | 'sent_via_gmail' | 'failed_gmail_send' | string; // string for future statuses
  gmail_message_id?: string;
  ai_reasoning?: string;   // For AI-generated emails like follow-ups
  ai_confidence?: number; // For AI-generated emails
  error_message?: string;  // If sending failed
}

// --- ConversationMessage Discriminated Union ---
interface MessageBase {
  id: string;
  outreach_id?: string;
  user_id?: string;
  content: string;
  sender: 'brand' | 'creator' | 'ai'; // MODIFIED: Reverted 'user_via_gmail' as Gmail messages will now use 'brand'
  timestamp: Date;
}

// For simple text-based messages or those with generic/currently undefined metadata
export type GenericMessage = MessageBase & {
  type: 'outreach' | 'response' | 'update'; // Add other types here if they don't have strongly-typed metadata yet
  metadata?: Record<string, any>; // Allows any other metadata for flexibility, or make it stricter e.g. Partial<BaseCallMetadata>
};

export type AiNegotiationMessage = MessageBase & {
  type: 'negotiation';
  metadata: AiNegotiationMetadata;
};

export type CallLogMessage = MessageBase & {
  type: 'call_log';
  metadata: CallLogMetadata;
};

export type VoiceTranscriptMessage = MessageBase & {
  type: 'voice_transcript';
  metadata: VoiceTranscriptMetadata;
};

export type CallExchangeMessage = MessageBase & {
  type: 'call_exchange';
  metadata: CallExchangeMetadata;
};

export type VoiceCallSummaryMessage = MessageBase & {
  type: 'voice_call_summary';
  metadata: VoiceCallSummaryMetadata;
};

export type CallRecordingMessage = MessageBase & {
  type: 'call_recording';
  metadata: CallRecordingMetadata; // Using the new metadata type
};

// NEW: Type for messages sent via Gmail
export type GmailSentMessage = MessageBase & {
  type: 'initial_outreach_gmail' | 'follow_up_gmail' | 'negotiation_message_gmail';
  sender: 'brand'; // MODIFIED: Changed from 'user_via_gmail' to 'brand' for consistency
  metadata: GmailSentMessageMetadata;
};

// The main ConversationMessage type is now a union of all specific message types
export type ConversationMessage =
  | GenericMessage
  | AiNegotiationMessage
  | CallLogMessage
  | VoiceTranscriptMessage
  | CallExchangeMessage
  | VoiceCallSummaryMessage
  | CallRecordingMessage // Added CallRecordingMessage
  | GmailSentMessage; // ADDED: GmailSentMessage to the union

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
  totalCreators?: number; // Added for unique creators count
  activeCampaigns?: number; // Added for active campaigns count
}

// --- Helper function to map database message record to ConversationMessage union type ---
function mapDbMessageToConversationMessage(dbMsg: any): ConversationMessage {
  const baseMessage = {
    id: dbMsg.id,
    outreach_id: dbMsg.outreach_id,
    user_id: dbMsg.user_id,
    content: dbMsg.content,
    sender: dbMsg.sender as 'brand' | 'creator' | 'ai', // MODIFIED: Reverted, as 'user_via_gmail' is no longer a distinct top-level sender type here. dbMsg.sender from DB should be 'brand' for these.
    timestamp: new Date(dbMsg.timestamp),
    // Ensure metadata is at least an empty object if null/undefined from DB
    // Individual types will then validate or use their specific metadata shapes
    metadata: dbMsg.metadata || {}, 
  };

  // Discriminate based on type
  // Explicitly list all known types in the switch
  switch (dbMsg.type as ConversationMessage['type']) {
    case 'negotiation':
      return { ...baseMessage, type: 'negotiation', metadata: dbMsg.metadata as AiNegotiationMetadata };
    case 'call_log':
      return { ...baseMessage, type: 'call_log', metadata: dbMsg.metadata as CallLogMetadata };
    case 'voice_transcript':
      return { ...baseMessage, type: 'voice_transcript', metadata: dbMsg.metadata as VoiceTranscriptMetadata };
    case 'call_exchange':
      return { ...baseMessage, type: 'call_exchange', metadata: dbMsg.metadata as CallExchangeMetadata };
    case 'voice_call_summary':
      return { ...baseMessage, type: 'voice_call_summary', metadata: dbMsg.metadata as VoiceCallSummaryMetadata };
    case 'call_recording': // Added case for call_recording
      return { ...baseMessage, type: 'call_recording', metadata: dbMsg.metadata as CallRecordingMetadata };
    case 'initial_outreach_gmail': 
    case 'follow_up_gmail':      
    case 'negotiation_message_gmail': // ADDED case for negotiation_message_gmail
      return {
        ...baseMessage,
        type: dbMsg.type, 
        sender: 'brand', 
        metadata: dbMsg.metadata as GmailSentMessageMetadata
      };
    case 'outreach':
    case 'response':
    case 'update':
      return { ...baseMessage, type: dbMsg.type, metadata: dbMsg.metadata }; // GenericMessage allows flexible metadata
    default:
      // Fallback for any unhandled or new types - treat as generic.
      // Consider logging a warning here for unexpected types.
      const unknownType: string = dbMsg.type;
      console.warn(`Unknown message type "${unknownType}" encountered in mapDbMessageToConversationMessage. Treating as generic 'update'.`);
      return { ...baseMessage, type: 'update', metadata: dbMsg.metadata }; // Default to 'update' for safety
  }
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
        body: outreachData.body,
        status: outreachData.status || 'pending',
        confidence: outreachData.confidence,
        reasoning: outreachData.reasoning,
        key_points: outreachData.keyPoints,
        next_steps: outreachData.nextSteps,
        brand_name: outreachData.brandName,
        campaign_context: outreachData.campaignContext,
        current_offer: outreachData.currentOffer,
        notes: outreachData.notes,
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

      const fullOutreach: StoredOutreach = {
        ...outreachData, 
        id: savedOutreach.id,
        user_id: userId,
        campaign_id: outreachData.campaign_id, 
        createdAt: new Date(savedOutreach.created_at),
        lastContact: new Date(savedOutreach.last_contact || savedOutreach.created_at),
        conversationHistory: [], 
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
        const { data: messagesData, error: messagesError } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('outreach_id', record.id)
          .order('timestamp', { ascending: true });

        if (messagesError) {
          console.error(`❌ Error loading messages for outreach ${record.id}:`, messagesError);
        }
        
        const conversationHistory: ConversationMessage[] = (messagesData || []).map(mapDbMessageToConversationMessage);
        
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
          body: record.body, 
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
      return storedOutreaches;
    } catch (error) {
      console.error('❌ Error in getAllOutreaches:', error);
      return [];
    }
  }

  async getOutreachesForCreator(creatorId: string): Promise<StoredOutreach[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('⚠️ User not authenticated. Cannot load outreaches for creator.');
        return [];
      }
      const userId = user.id;

      const { data: outreachRecords, error: outreachError } = await supabase
        .from('outreaches')
        .select('*')
        .eq('user_id', userId)
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      if (outreachError) {
        console.error('❌ Error loading outreaches for creator from Supabase:', outreachError);
        throw outreachError;
      }
      if (!outreachRecords) return [];

      const storedOutreaches: StoredOutreach[] = [];
       for (const record of outreachRecords) {
        const { data: messagesData, error: messagesError } = await supabase
          .from('conversation_messages')
          .select('*')
          .eq('outreach_id', record.id)
          .order('timestamp', { ascending: true });

        if (messagesError) {
          console.error(`❌ Error loading messages for outreach ${record.id}:`, messagesError);
        }
        const conversationHistory: ConversationMessage[] = (messagesData || []).map(mapDbMessageToConversationMessage);
        
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
          body: record.body,
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
      return storedOutreaches;

    } catch(e) {
      console.error("Error fetching outreaches for creator", e);
      return [];
    }
  }

  async addConversationMessage(
    outreachId: string, 
    content: string, 
    sender: 'brand' | 'creator' | 'ai', // MODIFIED: Reverted, as 'user_via_gmail' flows through 'brand' now
    type: ConversationMessage['type'], 
    metadata?: any 
  ): Promise<ConversationMessage | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ User not authenticated. Cannot add message.');
        throw new Error('User not authenticated');
      }

      const newMessageRecord = {
        outreach_id: outreachId,
        user_id: user.id, // Associate message with the acting user
        content,
        sender,
        type,
        metadata: metadata || {}, // Ensure metadata is at least an empty object if undefined
      };

      const { data: savedMessageData, error } = await supabase
        .from('conversation_messages')
        .insert(newMessageRecord)
        .select()
        .single();

      if (error) {
        console.error('❌ Error adding conversation message to Supabase:', error);
        throw error;
      }
      if (!savedMessageData) {
         console.error('❌ No data returned after saving message.');
        return null;
      }
      
      console.log('✅ Conversation message added to Supabase, ID:', savedMessageData.id);
      return mapDbMessageToConversationMessage(savedMessageData);

    } catch (e) {
      console.error('❌ Error in addConversationMessage:', e);
      return null;
    }
  }

  /**
   * Update outreach status in Supabase
   */
  async updateOutreachStatus(outreachId: string, status: StoredOutreach['status'], notes?: string, currentOffer?: number): Promise<void> {
    try {
      // The `updates` object is for the database, so it should use snake_case for db columns.
      // However, its type derivation from Partial<StoredOutreach> will use camelCase.
      // We need to construct the db_updates object carefully.
      const db_updates: { status: StoredOutreach['status']; last_contact: string; current_offer?: number; notes?: string } = {
        status,
        last_contact: new Date().toISOString(), // Update last_contact time
      };
      
      if (notes !== undefined) {
        db_updates.notes = notes;
      }
      if (currentOffer !== undefined) {
        db_updates.current_offer = currentOffer; // This is the database column name
      }

      const { error } = await supabase
        .from('outreaches')
        .update(db_updates) // Use the db_updates object with snake_case
        .eq('id', outreachId);

      if (error) {
        console.error('❌ Error updating outreach status in Supabase:', error);
        throw error;
      }
      console.log(`✅ Outreach ${outreachId} status updated to ${status}.`);
    } catch (e) {
      console.error('❌ Error in updateOutreachStatus:', e);
      // Decide on error handling strategy, e.g., rethrow or log
    }
  }

  /**
   * Get conversation history for an outreach from Supabase
   */
  async getConversationHistory(outreachId: string): Promise<ConversationMessage[]> {
    try {
      const { data: messagesData, error } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('outreach_id', outreachId)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error(`❌ Error loading conversation history for outreach ${outreachId}:`, error);
        throw error;
      }
      return (messagesData || []).map(mapDbMessageToConversationMessage);
    } catch (e) {
      console.error(`❌ Error in getConversationHistory for outreach ${outreachId}:`, e);
      return [];
    }
  }

  /**
   * Get conversation context for AI prompts (remains largely the same logic, but uses async getConversationHistory)
   */
  async getConversationContext(outreachId: string): Promise<string> {
    try {
      const history = await this.getConversationHistory(outreachId);
      // Simple concatenation for now, can be made more sophisticated
      return history.map(msg => `${msg.sender.toUpperCase()}: ${msg.content}`).join('\n');
    } catch (error) {
      console.error(`Error getting conversation context for outreach ${outreachId}:`, error);
      return ""; // Return empty string or handle error as appropriate
    }
  }

  /**
   * Get outreach summary for dashboard (this will need significant refactoring for Supabase)
   */
  async getOutreachSummary(): Promise<OutreachSummary> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated for outreach summary");

      // Fetch all outreaches for status counts and total
      const { data: allUserOutreaches, error: allOutreachesError } = await supabase
        .from('outreaches')
        .select('status, created_at, creator_id') // Added creator_id for distinct count
        .eq('user_id', user.id);

      if (allOutreachesError) {
        console.error("Error fetching outreaches for summary (counts/total/creators):", allOutreachesError);
        throw allOutreachesError;
      }
      if (!allUserOutreaches) {
        return { totalOutreaches: 0, statusCounts: {}, recentOutreaches: [], successRate: 0, totalCreators: 0, activeCampaigns: 0 };
      }

      const totalOutreaches = allUserOutreaches.length;
      const statusCounts: Record<string, number> = {};
      // const uniqueCreatorIds = new Set<string>(); // No longer needed for total creators from outreaches

      allUserOutreaches.forEach(o => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        // if (o.creator_id) { // We will get total creators from the 'creators' table directly
        //   uniqueCreatorIds.add(o.creator_id);
        // }
      });
      // const totalCreators = uniqueCreatorIds.size; // This is now count of *contacted* unique creators

      // Fetch TOTAL CREATORS count (from the creators table)
      let totalCreators = 0;
      try {
        // Assuming a global 'creators' table. If creators are user-specific and that should be reflected here,
        // add .eq('user_id', user.id) if applicable to your 'creators' table schema.
        const { count, error: creatorsError } = await supabase
          .from('creators') // Assuming your main creators table is named 'creators'
          .select('id', { count: 'exact', head: true });

        if (creatorsError) {
          console.error("Error fetching total creators count:", creatorsError);
        } else {
          totalCreators = count || 0;
        }
      } catch (creatorsEx) {
        console.error("Exception fetching total creators count:", creatorsEx);
      }
      
      // Fetch recent outreaches
      const selectFieldsForRecent = 'id, user_id, campaign_id, creator_id, creator_name, creator_avatar, creator_platform, subject, body, status, confidence, reasoning, key_points, next_steps, brand_name, campaign_context, created_at, last_contact, current_offer, notes';
      const { data: recentOutreachRecords, error: recentOutreachesError } = await supabase
        .from('outreaches')
        .select(selectFieldsForRecent)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentOutreachesError) {
        console.error("Error fetching recent outreaches for summary:", recentOutreachesError);
      }
      const recentOutreaches: StoredOutreach[] = (recentOutreachRecords || []).map(record => ({
        id: record.id,
        user_id: record.user_id,
        campaign_id: record.campaign_id,
        creatorId: record.creator_id,
        creatorName: record.creator_name,
        creatorAvatar: record.creator_avatar,
        creatorPlatform: record.creator_platform,
        subject: record.subject,
        body: record.body,
        status: record.status,
        confidence: record.confidence,
        reasoning: record.reasoning,
        keyPoints: record.key_points || [],
        nextSteps: record.next_steps || [],
        brandName: record.brand_name,
        campaignContext: record.campaign_context,
        createdAt: new Date(record.created_at),
        lastContact: new Date(record.last_contact),
        currentOffer: record.current_offer,
        notes: record.notes,
        conversationHistory: [], 
      }));

      // Fetch active campaigns count
      let activeCampaigns = 0;
      try {
        const { count, error: campaignsError } = await supabase
          .from('campaigns') // Assuming your campaigns table is named 'campaigns'
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'active'); // Assuming 'active' is the status for active campaigns

        if (campaignsError) {
          console.error("Error fetching active campaigns count:", campaignsError);
          // Don't throw, allow summary to proceed, activeCampaigns will be 0 or previous value
        } else {
          activeCampaigns = count || 0;
        }
      } catch (campaignsEx) {
        console.error("Exception fetching active campaigns count:", campaignsEx);
      }

      const successfulDeals = statusCounts['deal_closed'] || 0;
      const successRate = totalOutreaches > 0 ? Math.round((successfulDeals / totalOutreaches) * 100) : 0;

      return {
        totalOutreaches,
        statusCounts,
        recentOutreaches,
        successRate,
        totalCreators, // Now sourced from 'creators' table count
        activeCampaigns,
      };
    } catch (e) {
      console.error("Error fetching outreach summary:", e);
      return { totalOutreaches: 0, statusCounts: {}, recentOutreaches: [], successRate: 0, totalCreators: 0, activeCampaigns: 0 };
    }
  }

  /**
   * Delete an outreach and its messages from Supabase
   */
  async deleteOutreach(outreachId: string): Promise<void> {
    try {
      // First, delete associated conversation messages (due to potential foreign key constraints or just for cleanup)
      const { error: messagesError } = await supabase
        .from('conversation_messages')
        .delete()
        .eq('outreach_id', outreachId);

      if (messagesError) {
        console.error(`❌ Error deleting conversation messages for outreach ${outreachId}:`, messagesError);
        throw messagesError;
      }

      // Then, delete the outreach record itself
      const { error: outreachError } = await supabase
        .from('outreaches')
        .delete()
        .eq('id', outreachId);

      if (outreachError) {
        console.error(`❌ Error deleting outreach ${outreachId}:`, outreachError);
        throw outreachError;
      }
      console.log(`✅ Outreach ${outreachId} and its messages deleted successfully.`);
    } catch (e) {
      console.error(`❌ Error in deleteOutreach for ${outreachId}:`, e);
      // Rethrow or handle as appropriate
      throw e;
    }
  }

  /**
   * Clear all outreaches for the current user from Supabase (Use with caution!)
   */
  async clearAllOutreaches(): Promise<void> {
    // USE WITH EXTREME CAUTION - This will delete all outreaches and their messages for the current user.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ User not authenticated. Cannot clear all outreaches.');
        throw new Error('User not authenticated');
      }
      
      // Get all outreach IDs for the user
      const { data: outreachRecords, error: fetchError } = await supabase
        .from('outreaches')
        .select('id')
        .eq('user_id', user.id);

      if (fetchError) {
        console.error('❌ Error fetching outreach IDs for deletion:', fetchError);
        throw fetchError;
      }

      if (outreachRecords && outreachRecords.length > 0) {
        const outreachIds = outreachRecords.map(r => r.id);

        // Delete messages for these outreaches
        const { error: messagesError } = await supabase
          .from('conversation_messages')
          .delete()
          .in('outreach_id', outreachIds);
        
        if (messagesError) {
          console.error('❌ Error deleting conversation messages during clearAllOutreaches:', messagesError);
          // Decide if to proceed with deleting outreaches or to stop and throw
        }

        // Delete the outreaches
        const { error: outreachesError } = await supabase
          .from('outreaches')
          .delete()
          .in('id', outreachIds);

        if (outreachesError) {
          console.error('❌ Error deleting outreaches during clearAllOutreaches:', outreachesError);
          throw outreachesError;
        }
        console.log(`✅ All outreaches and messages for user ${user.id} cleared.`);
      } else {
        console.log('ℹ️ No outreaches found for the user to clear.');
      }
    } catch (e) {
      console.error('❌ Error in clearAllOutreaches:', e);
      throw e; // Rethrow to indicate failure
    }
  }

  // NEW METHOD to update specific fields on the outreach record itself
  async updateOutreachPrimaryArtifacts(
    outreachId: string, 
    artifacts: { 
      lastContact?: Date; 
      // We can add other direct fields from the 'outreaches' table here if needed in the future
      // e.g., full_recording_url?: string; (if we decide to duplicate this on the outreach table)
    }
  ): Promise<boolean> {
    if (!outreachId || !artifacts || Object.keys(artifacts).length === 0) {
      console.warn("[OutreachStorageService] updateOutreachPrimaryArtifacts: outreachId or artifacts missing or empty.");
      return false;
    }

    const updates: Partial<any> = {}; // Use 'any' for updates object to match Supabase table column names flexibly

    if (artifacts.lastContact) {
      updates.last_contact = artifacts.lastContact.toISOString(); // Assuming 'last_contact' is the DB column name
    }

    // Add other fields to 'updates' if present in 'artifacts' and corresponding DB columns exist
    // Example: if (artifacts.full_recording_url) updates.last_call_recording_url = artifacts.full_recording_url;

    if (Object.keys(updates).length === 0) {
      console.log("[OutreachStorageService] updateOutreachPrimaryArtifacts: No updatable fields provided in artifacts.");
      return true; // No error, just nothing to update
    }

    try {
      const { error } = await supabase
        .from('outreaches')
        .update(updates)
        .eq('id', outreachId);

      if (error) {
        console.error(`[OutreachStorageService] Error updating outreach ${outreachId} primary artifacts:`, error);
        return false;
      }
      console.log(`[OutreachStorageService] Outreach ${outreachId} primary artifacts updated successfully with:`, updates);
      return true;
    } catch (e) {
      console.error(`[OutreachStorageService] Exception updating outreach ${outreachId} primary artifacts:`, e);
      return false;
    }
  }

  /**
   * Update details of an existing outreach record in Supabase.
   */
  async updateOutreachDetails(
    outreachId: string,
    updates: Partial<Pick<StoredOutreach, 'subject' | 'body' | 'confidence' | 'reasoning' | 'keyPoints' | 'nextSteps' | 'brandName' | 'campaignContext' | 'notes' | 'currentOffer'>> & { status: StoredOutreach['status'] }
  ): Promise<StoredOutreach | null> {
    if (!outreachId) {
      console.error("❌ Attempted to update outreach without an ID.");
      toast.error("Outreach ID is missing, cannot update.");
      return null;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("❌ User not authenticated for updating outreach.");
        toast.error("Authentication required to update outreach.");
        throw new Error("User not authenticated");
      }

      // Map camelCase fields from 'updates' to snake_case for the database
      const dbUpdatePayload: any = {
        subject: updates.subject,
        body: updates.body,
        status: updates.status,
        confidence: updates.confidence,
        reasoning: updates.reasoning,
        notes: updates.notes,
        current_offer: updates.currentOffer, // Supabase expects snake_case
        key_points: updates.keyPoints,       // Supabase expects snake_case
        next_steps: updates.nextSteps,       // Supabase expects snake_case
        brand_name: updates.brandName,       // Supabase expects snake_case
        campaign_context: updates.campaignContext, // Supabase expects snake_case
        last_contact: new Date().toISOString(),
      };

      // Remove undefined fields from payload to avoid overwriting with null in Supabase
      Object.keys(dbUpdatePayload).forEach(key => {
        if (dbUpdatePayload[key] === undefined) {
          delete dbUpdatePayload[key];
        }
      });
      
      if (Object.keys(dbUpdatePayload).length === 0) {
          console.warn("⚠️ No fields to update for outreach ID:", outreachId);
          // Optionally fetch and return the current record if no actual update is made
          // For now, returning null or potentially the existing record if fetched.
          // Let's assume an update always implies some change and proceed.
          // If only last_contact is to be updated, dbUpdatePayload will not be empty.
      }


      const { data: updatedRecord, error } = await supabase
        .from('outreaches')
        .update(dbUpdatePayload)
        .eq('id', outreachId)
        .select()
        .single();

      if (error) {
        console.error(`❌ Error updating outreach ID ${outreachId} in Supabase:`, error);
        toast.error(`Failed to update outreach: ${error.message}`);
        throw error;
      }
      
      if (!updatedRecord) {
        console.warn(`⚠️ No data returned after updating outreach ID ${outreachId}, but no error.`);
        toast.warn("Outreach update seemed successful but no data was returned.");
        return null; // Or handle as a specific case, e.g., re-fetch
      }
      
      console.log('✅ Outreach updated successfully in Supabase, ID:', updatedRecord.id);

      // Map snake_case fields from DB record back to camelCase for StoredOutreach type
      const result: StoredOutreach = {
        ...updatedRecord,
        creatorId: updatedRecord.creator_id,
        creatorName: updatedRecord.creator_name,
        creatorAvatar: updatedRecord.creator_avatar,
        creatorPlatform: updatedRecord.creator_platform,
        creatorPhoneNumber: updatedRecord.creator_phone_number,
        keyPoints: updatedRecord.key_points || [], // Ensure array for empty
        nextSteps: updatedRecord.next_steps || [], // Ensure array for empty
        brandName: updatedRecord.brand_name,
        campaignContext: updatedRecord.campaign_context,
        currentOffer: updatedRecord.current_offer,
        // Assuming conversationHistory, createdAt, etc., are handled appropriately if needed
        // For an update, conversationHistory isn't directly modified here.
        // Timestamps like createdAt are not changed. lastContact is updated.
        // Ensure all StoredOutreach fields are present, using defaults or mapped values.
        // The spread `...updatedRecord` handles fields with same names.
        // We need to ensure all fields of StoredOutreach are covered.
        // The most critical are those that differ in casing.
        id: updatedRecord.id,
        user_id: updatedRecord.user_id,
        campaign_id: updatedRecord.campaign_id,
        subject: updatedRecord.subject,
        body: updatedRecord.body,
        status: updatedRecord.status,
        confidence: updatedRecord.confidence,
        reasoning: updatedRecord.reasoning,
        notes: updatedRecord.notes,
        createdAt: new Date(updatedRecord.created_at), // Ensure Date object
        lastContact: new Date(updatedRecord.last_contact), // Ensure Date object
        conversationHistory: updatedRecord.conversation_history || [], // Assuming it might be fetched or handled elsewhere
      };

      return result;
    } catch (err) {
      console.error(`❌ Error in updateOutreachDetails service method for ID ${outreachId}:`, err);
      // Ensure toast is imported in this file if not already
      // import { toast } from 'react-toastify';
      if (!(err instanceof Error && err.message.includes("User not authenticated"))) { // Avoid double toast for auth
        toast.error("An unexpected error occurred while updating outreach details.");
      }
      return null;
    }
  }
}

export const outreachStorageService = new OutreachStorageService(); 