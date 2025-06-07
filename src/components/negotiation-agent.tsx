import React, { useState, useEffect, useMemo } from 'react';
import { 
  negotiationAgentService, 
  aiAgentsService,
  type NegotiationResult,
  // type BatchNegotiationResult, // Comment out if only used by batch logic
} from '../services/ai-agents';
import { type StoredOutreach, outreachStorage, type ConversationMessage } from '../services/outreach-storage';
import { supabase } from '../lib/supabase';

interface NegotiationState {
  isGenerating: boolean;
  currentOutreachId: string | null;
  generatedMessage: string;
  negotiationStrategy: string;
  suggestedOffer: number | null;
  method: 'ai_generated' | 'algorithmic_fallback' | null;
}

// interface BatchNegotiationState { /* ... Comment out if only used by batch logic ... */}

interface CallArtifacts {
  full_recording_url?: string;
  full_recording_duration?: string;
  creator_transcript?: string;
  outreach_id?: string;
  // add other fields if your backend returns more
}

const NegotiationAgent: React.FC = () => {
  const [allOutreaches, setAllOutreaches] = useState<StoredOutreach[]>([]);
  const [selectedOutreach, setSelectedOutreach] = useState<StoredOutreach | null>(null);
  const [negotiationState, setNegotiationState] = useState<NegotiationState>({
    isGenerating: false,
    currentOutreachId: null,
    generatedMessage: '',
    negotiationStrategy: '',
    suggestedOffer: null,
    method: null
  });
  // Comment out batch state
  // const [batchState, setBatchState] = useState<BatchNegotiationState>({
  //   isProcessing: false, results: null, showResults: false, autoApplied: false
  // });
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});
  const [lastCallSid, setLastCallSid] = useState<string | null>(null);
  const [lastCallDetails, setLastCallDetails] = useState<CallArtifacts | null>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [pollingIntervalId, setPollingIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [activelyPollingSid, setActivelyPollingSid] = useState<string | null>(null);
  const [pollingAttempts, setPollingAttempts] = useState(0);
  const MAX_POLLING_ATTEMPTS = 24; // 24 attempts * 5 seconds = 120 seconds (2 minutes)

  // Need a ref for pollingIntervalId to ensure clearInterval uses the correct ID in rapidly changing scenarios
  const pollingIntervalIdRef = React.useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on component unmount
  useEffect(() => {
    // When component unmounts, clear the interval using the ref
    return () => {
      if (pollingIntervalIdRef.current) {
        clearInterval(pollingIntervalIdRef.current);
        console.log("[Polling] Cleaned up polling interval on unmount using ref.");
      }
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Load outreach data
  useEffect(() => {
    const loadOutreaches = () => {
      const outreaches = negotiationAgentService.getPositiveResponseCreators();
      setAllOutreaches(outreaches);
    };
    
    loadOutreaches();
    // Refresh every 30 seconds to pick up changes
    const interval = setInterval(loadOutreaches, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter creators with positive response status (now done by service)
  const positiveResponseCreators = useMemo(() => allOutreaches, [allOutreaches]);

  // Get eligible creators for batch negotiation
  const eligibleCreators = useMemo(() => {
    return negotiationAgentService.getEligibleForNegotiation();
  }, [allOutreaches]);

  // Handle batch negotiation execution
  // const handleBatchNegotiation = async (autoApply: boolean = false) => {
  //   // ... entire function body ...
  // };

  // Generate negotiation strategy using service (for individual creators)
  const handleGenerateNegotiation = async (outreach: StoredOutreach) => {
    setNegotiationState(prev => ({
      ...prev,
      isGenerating: true,
      currentOutreachId: outreach.id,
      generatedMessage: '',
      negotiationStrategy: '',
      suggestedOffer: null,
      method: null
    }));

    try {
      console.log('🤝 Generating individual negotiation strategy for', outreach.creatorName);
      const result: NegotiationResult = await negotiationAgentService.generateNegotiationStrategy(outreach);
      
      if (result.success && result.insight) {
        const insight = result.insight;
        
        setNegotiationState({
          isGenerating: false,
          currentOutreachId: outreach.id,
          generatedMessage: insight.suggestedResponse,
          negotiationStrategy: `${insight.currentPhase.replace('_', ' ')} - ${insight.negotiationTactics.join(', ')}`,
          suggestedOffer: insight.recommendedOffer.amount,
          method: result.method
        });

        setSelectedOutreach(outreach);
      } else {
        throw new Error(result.error || 'Failed to generate negotiation strategy');
      }
    } catch (error) {
      console.error('🤝 Error generating negotiation strategy:', error);
      setNegotiationState(prev => ({
        ...prev,
        isGenerating: false,
        currentOutreachId: null
      }));
    }
  };

  // Update outreach using service
  const handleSendNegotiation = async (outreach: StoredOutreach) => {
    if (negotiationState.suggestedOffer && negotiationState.generatedMessage) {
      // Create insight object from negotiation state for metadata storage
      const insight: any = negotiationState.method && {
        currentPhase: 'negotiating' as const,
        suggestedResponse: negotiationState.generatedMessage,
        negotiationTactics: negotiationState.negotiationStrategy.split(' - ')[1]?.split(', ') || [],
        recommendedOffer: {
          amount: negotiationState.suggestedOffer,
          reasoning: 'User-approved AI generated offer'
        },
        nextSteps: ['Wait for creator response', 'Follow up if needed']
      };

      const success = negotiationAgentService.updateOutreachWithNegotiation(
        outreach.id,
        negotiationState.generatedMessage,
        negotiationState.suggestedOffer,
        insight,
        negotiationState.method || undefined
      );
      
      if (success) {
        // Refresh data
        const updatedOutreaches = negotiationAgentService.getPositiveResponseCreators();
        setAllOutreaches(updatedOutreaches);
        
        // Clear negotiation state
        setNegotiationState({
          isGenerating: false,
          currentOutreachId: null,
          generatedMessage: '',
          negotiationStrategy: '',
          suggestedOffer: null,
          method: null
        });
        setSelectedOutreach(null);
      }
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      interested: 'text-green-600 bg-green-100 border-green-200',
      negotiating: 'text-orange-600 bg-orange-100 border-orange-200',
      deal_closed: 'text-purple-600 bg-purple-100 border-purple-200'
    };
    return colorMap[status] || 'text-gray-600 bg-gray-100 border-gray-200';
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, string> = {
      interested: '😊',
      negotiating: '🤝',
      deal_closed: '✅'
    };
    return iconMap[status] || '📋';
  };

  // Get rate limit status from service
  const rateLimitStatus = negotiationAgentService.getRateLimitStatus();
  const globalStatus = aiAgentsService.getGlobalStatus();

  // --- Polling Function for Call Status ---
  const pollCallStatus = async (callSidToPoll: string) => {
    // If this poll is for a SID that is no longer the actively polled one, just stop.
    if (activelyPollingSid !== callSidToPoll) {
      console.log(`[Polling] Stale poll for ${callSidToPoll}, active is ${activelyPollingSid}. Interval should have been cleared by startPollingForCall.`);
      // The interval that called this should have been cleared by a newer startPollingForCall.
      // However, to be safe, if we find it, clear it.
      if (pollingIntervalIdRef.current) { // Check ref
         // This specific interval instance might be hard to clear if a new one was set on the same ref/state var.
         // This log indicates a potential race condition or mis-clearing.
      }
      return; 
    }
    
    console.log(`[Polling] Attempt ${pollingAttempts + 1}/${MAX_POLLING_ATTEMPTS} for SID: ${callSidToPoll}`);
    // setPollingAttempts(prev => prev + 1); // Managed by startPollingForCall setting to 0 initially

    // Correctly increment attempts for the *current* polling session
    const currentAttempts = pollingAttemptsRef.current + 1;
    pollingAttemptsRef.current = currentAttempts;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn("[Polling] No session, stopping poll for", callSidToPoll);
        if (pollingIntervalIdRef.current) clearInterval(pollingIntervalIdRef.current);
        setPollingIntervalId(null);
        setActivelyPollingSid(null);
        pollingAttemptsRef.current = 0;
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/call-progress-status?call_sid=${callSidToPoll}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      const data = await response.json();

      if (data.success) {
        console.log(`[Polling] Status for ${callSidToPoll}: ${data.status}`);
        if (data.status === "completed") {
          if (pollingIntervalIdRef.current) clearInterval(pollingIntervalIdRef.current);
          setPollingIntervalId(null);
          setActivelyPollingSid(null);
          pollingAttemptsRef.current = 0;
          console.log(`[Polling] Call ${callSidToPoll} completed! Automatically fetching details.`);
          setIsFetchingDetails(true);
          await fetchAndStoreCallArtifacts(callSidToPoll); 
          setIsFetchingDetails(false);
        } else if (data.status === "processing") {
          if (currentAttempts >= MAX_POLLING_ATTEMPTS) {
            if (pollingIntervalIdRef.current) clearInterval(pollingIntervalIdRef.current);
            setPollingIntervalId(null);
            setActivelyPollingSid(null);
            pollingAttemptsRef.current = 0;
            console.warn(`[Polling] Max attempts reached for ${callSidToPoll}. Stopping poll.`);
            alert(`Automatic detail fetching for call ${callSidToPoll} timed out. Please use the manual 'Fetch Call Details' button if the call has ended.`);
          }
        } else { 
          if (pollingIntervalIdRef.current) clearInterval(pollingIntervalIdRef.current);
          setPollingIntervalId(null);
          setActivelyPollingSid(null);
          pollingAttemptsRef.current = 0;
          console.error(`[Polling] Failed to get valid status for ${callSidToPoll} (status: ${data.status}). Stopping poll.`);
        }
      } else {
        if (pollingIntervalIdRef.current) clearInterval(pollingIntervalIdRef.current);
        setPollingIntervalId(null);
        setActivelyPollingSid(null);
        pollingAttemptsRef.current = 0;
        console.error(`[Polling] Error polling status for ${callSidToPoll}: ${data.error}`);
      }
    } catch (error) {
      if (pollingIntervalIdRef.current) clearInterval(pollingIntervalIdRef.current);
      setPollingIntervalId(null);
      setActivelyPollingSid(null);
      pollingAttemptsRef.current = 0;
      console.error("[Polling] Exception during poll for SID:", callSidToPoll, error);
    }
  };

  // Ref for polling attempts, to be used inside pollCallStatus
  const pollingAttemptsRef = React.useRef(0);

  // When activelyPollingSid changes, reset pollingAttemptsRef
  useEffect(() => {
    pollingAttemptsRef.current = 0;
  }, [activelyPollingSid]);

  const startPollingForCall = (callSid: string) => {
    // Clear any existing interval BEFORE setting new state, to avoid race conditions
    if (pollingIntervalIdRef.current) {
      clearInterval(pollingIntervalIdRef.current);
      console.log("[Polling] Cleared existing polling interval via ref before starting new one.");
    }
    pollingIntervalIdRef.current = null; // Explicitly nullify it

    setActivelyPollingSid(callSid);
    setPollingAttempts(0); 
    setLastCallSid(callSid); 
    console.log(`[Polling] Starting polling for SID: ${callSid}`);

    const newIntervalId = setInterval(() => {
      // pollCallStatus will now be responsible for checking if it should continue or stop
      // based on its internal logic and the callSidToPoll it operates on.
      // It will also clear the pollingIntervalId from state when it's done.
      pollCallStatus(callSid); 
    }, 5000);
    
    setPollingIntervalId(newIntervalId); // Store in state for cleanup and UI
    pollingIntervalIdRef.current = newIntervalId; // Also store in ref for immediate clearing
  };

  // --- TEMPORARY TEST FUNCTION FOR VOICE CALL ---
  const handleTestMakeCall = async () => {
    console.log("📞 [TestCall] Initiating general test call. Current selectedOutreach:", selectedOutreach);
    const currentSelectedId = selectedOutreach ? selectedOutreach.id : null;
    console.log(`📞 [TestCall] currentSelectedId for this call: ${currentSelectedId}`);

    const toPhoneNumber = "+917022209405"; // Placeholder, ideally from selectedOutreach.creatorContactInfo.phone if available and desired for this button
    let messageToSpeak;

    if (selectedOutreach) {
      messageToSpeak = `Hello ${selectedOutreach.creatorName}, this is a call from InfluencerFlowAI regarding your interest in the ${selectedOutreach.brandName} campaign (via general test call button). Please leave a short message after the beep.`;
    } else {
      messageToSpeak = "Hello from InfluencerFlowAI! This is a general test call using Eleven Labs and Twilio, triggered from the backend. Please leave a short message after the beep.";
    }
    
    const outreachIdForCall = currentSelectedId || `test_call_${Date.now()}`;
    console.log(`📞 [TestCall] outreachIdForCall to be sent to backend: ${outreachIdForCall}`);
    console.log(`📞 [TestCall] messageToSpeak: ${messageToSpeak}`);

    setLastCallSid(null);
    setLastCallDetails(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        alert("No active Supabase session. Please log in.");
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/make-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ to_phone_number: toPhoneNumber, message: messageToSpeak, outreach_id: outreachIdForCall }),
      });
      const responseData = await response.json();
      if (response.ok && responseData.success && responseData.call_sid) {
        // setLastCallSid(responseData.call_sid); // startPollingForCall will set this
        alert(`Test call initiated! SID: ${responseData.call_sid}. Status: ${responseData.status}. Outreach ID used: ${outreachIdForCall}. Polling for call completion...`);
        console.log("✅ Test Call Success:", responseData);
        startPollingForCall(responseData.call_sid);
      } else {
        alert(`Test call failed: ${responseData.error || response.statusText}`);
        console.error("❌ Test Call Failure:", responseData);
      }
    } catch (error) {
      alert(`Test call error: ${(error as Error).message}`);
      console.error("❌ Test Call Exception:", error);
    }
  };

  // --- FUNCTION TO INITIATE CALL FOR A SPECIFIC CREATOR ---
  const handleInitiateCreatorCall = async (outreach: StoredOutreach) => {
    console.log(`📞 [CreatorCall] Attempting to call creator: ${outreach.creatorName} (ID: ${outreach.id})`);
    setSelectedOutreach(outreach); // Set context to this outreach FIRST
    console.log("📞 [CreatorCall] selectedOutreach set to:", outreach);

    // TODO: Replace with actual creator phone number from outreach object if available
    // e.g., const toPhoneNumber = outreach.creatorContactInfo?.phone || "+917022209405";
    const toPhoneNumber = "+917022209405"; // Using placeholder for now
    const messageToSpeak = `Hello ${outreach.creatorName}, this is a call from InfluencerFlowAI regarding your interest in the ${outreach.brandName} campaign. Please leave a short message after the beep.`;
    const outreachIdForCall = outreach.id;
    console.log(`📞 [CreatorCall] outreachIdForCall to be sent to backend: ${outreachIdForCall}`);

    setLastCallSid(null); // Reset previous call SID
    setLastCallDetails(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        alert("No active Supabase session. Please log in.");
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/make-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ to_phone_number: toPhoneNumber, message: messageToSpeak, outreach_id: outreachIdForCall }),
      });
      const responseData = await response.json();
      if (response.ok && responseData.success && responseData.call_sid) {
        // setLastCallSid(responseData.call_sid); // startPollingForCall will set this
        alert(`Call initiated to ${outreach.creatorName}! SID: ${responseData.call_sid}. Status: ${responseData.status}. Polling for call completion...`);
        console.log("✅ Creator Call Success:", responseData);
        startPollingForCall(responseData.call_sid);
      } else {
        alert(`Call to ${outreach.creatorName} failed: ${responseData.error || response.statusText}`);
        console.error("❌ Creator Call Failure:", responseData);
      }
    } catch (error) {
      alert(`Call to ${outreach.creatorName} error: ${(error as Error).message}`);
      console.error("❌ Creator Call Exception:", error);
    }
  };
  // --- END FUNCTION TO INITIATE CALL FOR A SPECIFIC CREATOR ---

  const fetchAndStoreCallArtifacts = async (callSidToFetch?: string) => {
    const targetSid = callSidToFetch || lastCallSid;
    if (!targetSid) {
      alert("No call SID found. Please make a test call or call a creator first.");
      return;
    }

    // If polling was active for this SID, clear it as we are now fetching manually or due to poll success
    if (pollingIntervalId && activelyPollingSid === targetSid) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
      setActivelyPollingSid(null);
      setPollingAttempts(0);
      console.log(`[Polling] Stopped polling for ${targetSid} because fetchAndStoreCallArtifacts was called.`);
    }

    setIsFetchingDetails(true);
    console.log(`📞 [FetchDetails] Fetching call details for SID: ${targetSid}...`);
    console.log("📞 [FetchDetails] Current selectedOutreach.id at fetch start:", selectedOutreach?.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { 
        alert("Not authenticated. Please log in to fetch call details."); 
        setIsFetchingDetails(false); 
        return; 
      }

      const response = await fetch(`${import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001'}/api/voice/call-details?call_sid=${targetSid}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` } }
      );
      const data = await response.json();

      if (data.success && data.details) {
        console.log("✅ [FetchDetails] Call details from backend:", data.details);
        setLastCallDetails(data.details); 
        alert('Call details fetched! Consolidating and storing to conversation history...');

        const outreachIdFromBackend = data.details.outreach_id;
        const currentFrontendSelectedOutreachId = selectedOutreach ? selectedOutreach.id : null;
        const outreachIdToUpdate = outreachIdFromBackend || currentFrontendSelectedOutreachId || targetSid;
        console.log(`[FetchDetails] Determined outreachIdToUpdate for storage: ${outreachIdToUpdate}`);

        if (!outreachIdToUpdate) {
          console.error("[FetchDetails] Could not determine a valid outreachIdToUpdate. Aborting history save.");
          alert("Error: Could not link call details to an outreach. History not saved.");
          setIsFetchingDetails(false);
          return;
        }

        // Fetch the specific outreach to update its history
        let targetOutreach = allOutreaches.find(o => o.id === outreachIdToUpdate);
        if (!targetOutreach) {
            console.error(`[FetchDetails] Outreach with ID ${outreachIdToUpdate} not found in current state. Cannot update history.`);
            alert("Error: Target outreach not found. History not saved.");
            setIsFetchingDetails(false);
            return;
        }

        // Filter out any previous messages related to this specific call_sid
        const existingHistory = targetOutreach.conversationHistory || [];
        const historyWithoutThisCall = existingHistory.filter(msg => msg.metadata?.call_sid !== targetSid);
        console.log(`[FetchDetails] Filtered out ${existingHistory.length - historyWithoutThisCall.length} old messages for SID: ${targetSid}`);

        const callTurnsForSummary: Array<{ speaker: string, text: string }> = [];
        if (data.details.conversation_history && Array.isArray(data.details.conversation_history)) {
          data.details.conversation_history.forEach((turn: any) => {
            callTurnsForSummary.push({
              speaker: turn.speaker || (turn.sender === 'creator' ? 'user' : 'ai'),
              text: turn.text || "[empty message]",
            });
          });
        }

        let newHistory = [...historyWithoutThisCall];

        if (callTurnsForSummary.length > 0 || data.details.full_recording_url) {
          let summaryMessageContent = `Voice call with creator (SID: ${targetSid}).`;
          if (callTurnsForSummary.length > 0) {
            summaryMessageContent += ` ${callTurnsForSummary.length} turn(s) transcribed.`;
          }
          if (!data.details.full_recording_url && callTurnsForSummary.length === 0) {
             summaryMessageContent = `Attempted voice call (SID: ${targetSid}), but no recording or turns captured.`;
          }

          const voiceCallSummaryMessage: ConversationMessage = {
            id: `vcs-${targetSid}-${Date.now()}`,
            content: summaryMessageContent,
            sender: 'ai',
            type: 'voice_call_summary',
            timestamp: new Date(),
            metadata: {
              call_sid: targetSid,
              full_recording_url: data.details.full_recording_url,
              full_recording_duration: data.details.full_recording_duration,
              turns: callTurnsForSummary,
            }
          };
          newHistory.push(voiceCallSummaryMessage);
          console.log(`[FetchDetails] Prepared 'voice_call_summary' for Outreach ID: ${outreachIdToUpdate}`);
        } else {
          console.log("[FetchDetails] No substantive voice call turns or full recording URL found to create a summary entry.");
        }
        
        // Update the outreach object with the new consolidated history
        const updatedOutreach = {
          ...targetOutreach,
          conversationHistory: newHistory,
          lastContact: new Date() // Also update lastContact time
        };

        outreachStorage.saveOutreach(updatedOutreach);
        console.log(`[FetchDetails] Saved outreach ${outreachIdToUpdate} with updated conversation history.`);

        // Refresh UI states
        const refreshedOutreaches = negotiationAgentService.getPositiveResponseCreators();
        setAllOutreaches(refreshedOutreaches);
        console.log("[FetchDetails] All outreaches refreshed. Count:", refreshedOutreaches.length);

        const updatedHistoryOwner = refreshedOutreaches.find(o => o.id === outreachIdToUpdate);
        console.log(`[FetchDetails] Conversation history for ${outreachIdToUpdate} AFTER adding & refreshing:`, updatedHistoryOwner?.conversationHistory);

        if (selectedOutreach && selectedOutreach.id === outreachIdToUpdate) {
            const updatedSelectedOutreach = refreshedOutreaches.find(o => o.id === outreachIdToUpdate);
            if (updatedSelectedOutreach) {
                setSelectedOutreach(updatedSelectedOutreach);
                console.log("Refreshed selected outreach data with new conversation history.");
            }
        } else {
            // Optionally, trigger a broader refresh if the updated outreach isn't the selected one
            const updatedOutreaches = negotiationAgentService.getPositiveResponseCreators();
            setAllOutreaches(updatedOutreaches);
        }

      } else {
        alert(`Failed to fetch call details: ${data.error || 'Unknown error'}`);
        console.error("❌ Fetch Call Details Failure:", data);
      }
    } catch (error) {
      alert(`Error fetching call details: ${(error as Error).message}`);
      console.error("❌ Fetch Call Details Exception:", error);
    } finally {
      setIsFetchingDetails(false);
    }
  };
  // --- END TEMPORARY TEST FUNCTION ---

  return (
    <div className="space-y-6">
      {/* Header with Rate Limit Info */}
      <div className="bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <span className="text-2xl">🤝</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">🤖 AI Negotiation Agent</h1>
              <p className="text-green-100">
                Intelligent batch negotiation with stage-aware strategies
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-green-100">Active Negotiations</div>
            <div className="text-3xl font-bold">{positiveResponseCreators.length}</div>
            <div className="text-xs text-green-200 mt-1">
              Eligible: {eligibleCreators.length} | AI Calls: {globalStatus.remaining}/{globalStatus.total}
            </div>
          </div>
        </div>
      </div>

      {/* TEMPORARY TEST CALL BUTTON & ARTIFACTS AREA */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 my-4">
        <h4 className="text-yellow-800 font-semibold mb-2">🚧 Voice Call Test Area 🚧</h4>
        <p className="text-sm text-yellow-700 mb-3">
          Ensure Python backend & ngrok are running. Update placeholder phone number in code. 
          <code>BACKEND_PUBLIC_URL</code> in <code>backend/.env</code> must be your ngrok URL.
        </p>
        <div className="flex items-center gap-4">
            <button
              onClick={handleTestMakeCall}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium"
            >
              📞 Make General Test Call
            </button>
            {lastCallSid && (
                <button
                    onClick={() => fetchAndStoreCallArtifacts()}
                    disabled={isFetchingDetails || (activelyPollingSid === lastCallSid && !!pollingIntervalId)}
                    className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium disabled:opacity-50"
                >
                    {isFetchingDetails 
                        ? 'Fetching...' 
                        : (activelyPollingSid === lastCallSid && !!pollingIntervalId)
                        ? 'Polling...' 
                        : '📥 Fetch Call Details'}
                </button>
            )}
        </div>
        {lastCallSid && <p className="text-xs text-yellow-700 mt-2">Last Call SID: {lastCallSid}</p>}
        {lastCallDetails && (
            <div className="mt-3 p-3 bg-yellow-100 rounded">
                <h5 className="text-sm font-medium text-yellow-800">Fetched Artifacts:</h5>
                {lastCallDetails.full_recording_url && <p className="text-xs">Recording: <a href={lastCallDetails.full_recording_url} target="_blank" rel="noopener noreferrer" className="underline">Link</a> ({lastCallDetails.full_recording_duration || 'N/A'}s)</p>}
                {lastCallDetails.creator_transcript && <p className="text-xs">Transcript: "{lastCallDetails.creator_transcript}"</p>}
                {!lastCallDetails.full_recording_url && !lastCallDetails.creator_transcript && <p className="text-xs">No specific artifacts found for this Call SID in backend store.</p>}
            </div>
        )}
      </div>
      {/* END TEMPORARY TEST CALL BUTTON & ARTIFACTS AREA */}

      {/* Batch Negotiation Controls (Temporarily Commented Out to fix linter errors) */}
      {/* {eligibleCreators.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                🚀 Batch Negotiation Engine
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                Process all {eligibleCreators.length} eligible creators with AI-powered strategies
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleBatchNegotiation(false)}
                disabled={batchState.isProcessing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {batchState.isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    🧠 Generate Strategies
                  </>
                )}
              </button>
              <button
                onClick={() => handleBatchNegotiation(true)}
                disabled={batchState.isProcessing}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {batchState.isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Auto-Processing...
                  </>
                ) : (
                  <>
                    🤖 Auto-Negotiate All
                  </>
                )}
              </button>
            </div>
          </div>

          {batchState.results && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{batchState.results.totalProcessed}</div>
                  <div className="text-sm text-gray-600">Total Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{batchState.results.successful}</div>
                  <div className="text-sm text-gray-600">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{batchState.results.summary.aiGenerated}</div>
                  <div className="text-sm text-gray-600">AI Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{batchState.results.summary.algorithmicFallback}</div>
                  <div className="text-sm text-gray-600">Algorithmic</div>
                </div>
              </div>
              
              {batchState.autoApplied && (
                <div className="p-3 bg-green-100 border border-green-200 rounded-lg">
                  <p className="text-green-800 text-sm font-medium">
                    ✅ Batch negotiation completed and strategies auto-applied! All deals have been updated.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )} */}

      {/* Rate Limiting Info */}
      {negotiationAgentService.isAvailable() && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-blue-800">Centralized AI Service</h3>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-blue-700">
                    Global: {rateLimitStatus.remaining}/3 | 
                    Status: {rateLimitStatus.canMakeRequest ? 'Ready' : 'Rate Limited'}
                  </div>
                  <div className="flex gap-1">
                    {[1,2,3].map(i => (
                      <div 
                        key={i} 
                        className={`w-2 h-2 rounded-full ${
                          i <= rateLimitStatus.remaining ? 'bg-green-400' : 'bg-gray-300'
                        }`} 
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-blue-700 text-sm mt-1">
                Enhanced negotiation with stage-aware strategies. Batch processing available for {eligibleCreators.length} eligible creators.
                <span className="font-medium"> {rateLimitStatus.canMakeRequest ? 'AI analysis ready' : 'Using algorithmic strategies'}</span>
              </p>
              {!rateLimitStatus.canMakeRequest && (
                <div className="mt-2 p-2 bg-amber-100 border border-amber-200 rounded text-amber-800 text-sm">
                  ⏳ <strong>Rate limit reached:</strong> Service automatically using advanced algorithmic negotiation strategies. 
                  API calls reset in ~1 minute for full AI capabilities.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* API Key Warning */}
      {!negotiationAgentService.isAvailable() && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.232 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
            <div>
              <h3 className="font-medium text-amber-800">Setup Required</h3>
              <p className="text-amber-700 text-sm mt-1">
                Add <code className="bg-amber-100 px-1 rounded">VITE_GROQ_API_KEY="your-key"</code> to your .env.local file for AI-powered negotiations.
                The centralized service will use advanced algorithmic strategies until then.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">😊</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Interested</div>
              <div className="text-2xl font-bold text-green-600">
                {positiveResponseCreators.filter(o => o.status === 'interested').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🤝</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Negotiating</div>
              <div className="text-2xl font-bold text-orange-600">
                {positiveResponseCreators.filter(o => o.status === 'negotiating').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">✅</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Deals Closed</div>
              <div className="text-2xl font-bold text-purple-600">
                {positiveResponseCreators.filter(o => o.status === 'deal_closed').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-500">Eligible</div>
              <div className="text-2xl font-bold text-blue-600">
                {eligibleCreators.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Negotiations */}
      {positiveResponseCreators.length > 0 ? (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              🎯 Active Negotiations ({positiveResponseCreators.length})
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              AI-powered negotiation with stage-aware strategies. Use batch processing above for efficiency.
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {positiveResponseCreators.map((outreach) => {
              const daysSinceContact = Math.floor((Date.now() - outreach.lastContact.getTime()) / (1000 * 60 * 60 * 24));
              const isEligible = eligibleCreators.some(e => e.id === outreach.id);
              
              return (
                <div key={outreach.id} className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    {/* Creator Info */}
                    <div className="flex items-start gap-4 flex-1">
                      <img
                        src={outreach.creatorAvatar}
                        alt={outreach.creatorName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-gray-900">{outreach.creatorName}</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(outreach.status)}`}>
                            {getStatusIcon(outreach.status)} {outreach.status}
                          </span>
                          <div className="text-sm text-gray-500">
                            Confidence: {outreach.confidence}%
                          </div>
                          {!isEligible && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                              Completed
                            </span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Platform:</span>
                            <div className="font-medium capitalize">{outreach.creatorPlatform}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Brand:</span>
                            <div className="font-medium">{outreach.brandName}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Current Offer:</span>
                            <div className="font-medium">
                              {outreach.currentOffer ? `₹${outreach.currentOffer.toLocaleString()}` : 'Not set'}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-500">Last Contact:</span>
                            <div className={`font-medium ${daysSinceContact > 5 ? 'text-red-600' : daysSinceContact > 3 ? 'text-amber-600' : 'text-green-600'}`}>
                              {daysSinceContact === 0 ? 'Today' : `${daysSinceContact} days ago`}
                            </div>
                          </div>
                        </div>

                        {/* Stage-aware contextual info */}
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm">
                            <span className="font-medium text-gray-700">Stage Context:</span>
                            <p className="text-gray-600 mt-1">
                              {outreach.status === 'interested' && daysSinceContact > 3 && 'Follow-up recommended - maintain momentum'}
                              {outreach.status === 'interested' && daysSinceContact <= 3 && 'Fresh interest - perfect time to present value proposition'}
                              {outreach.status === 'negotiating' && daysSinceContact > 5 && 'Stalled negotiation - consider fresh approach or alternative terms'}
                              {outreach.status === 'negotiating' && daysSinceContact <= 5 && 'Active negotiation - address concerns and find win-win solutions'}
                              {outreach.status === 'deal_closed' && 'Partnership confirmed - focus on execution and relationship building'}
                            </p>
                          </div>
                        </div>

                        {outreach.notes && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                            <div className="text-sm">
                              <span className="font-medium text-blue-700">Notes:</span>
                              <p className="text-blue-600 mt-1">{outreach.notes}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {isEligible && (
                        <button
                          onClick={() => handleGenerateNegotiation(outreach)}
                          disabled={negotiationState.isGenerating && negotiationState.currentOutreachId === outreach.id}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {negotiationState.isGenerating && negotiationState.currentOutreachId === outreach.id ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Analyzing...
                            </>
                          ) : (
                            <>
                              🤖 Generate Strategy
                            </>
                          )}
                        </button>
                      )}
                      {/* Add Call Creator Button Here */}
                      <button
                        onClick={() => handleInitiateCreatorCall(outreach)}
                        // Add any disabled logic if needed, e.g., if a call is already in progress
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        📞 Call Creator
                      </button>
                      
                      <button
                        onClick={() => {
                            // Toggle selection for details AND for call context
                            if (selectedOutreach?.id === outreach.id && showDetails[outreach.id]) {
                                console.log(`[DetailsButton] Deselecting creator: ${outreach.creatorName}`);
                                setSelectedOutreach(null); // Deselect if already selected and details shown
                                setShowDetails(prev => ({ ...prev, [outreach.id]: false }));
                            } else {
                                console.log(`[DetailsButton] Selecting creator for details/context: ${outreach.creatorName}`, outreach);
                                setSelectedOutreach(outreach); // Select for context
                                setShowDetails(prev => ({ ...prev, [outreach.id]: !prev[outreach.id] }));
                            }
                        }}
                        className="px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors w-full sm:w-auto justify-center"
                      >
                        {showDetails[outreach.id] ? '▼' : '▶'} Details
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details (only if selected and showDetails is true) */}
                  {selectedOutreach && selectedOutreach.id === outreach.id && showDetails[outreach.id] && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      {/* Conversation History */}
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">📞 Recent Call Activity & Conversation History</h4>
                            {selectedOutreach.conversationHistory && selectedOutreach.conversationHistory.length > 0 ? (
                                <div className="space-y-3 bg-gray-50 p-3 rounded-lg">
                                {selectedOutreach.conversationHistory.slice().reverse().map((msg, index) => {
                                    console.log("[UI Render] Message being rendered:", msg);

                                    if (msg.type === 'voice_call_summary') {
                                        return (
                                            <div key={index} className="text-sm p-3 my-2 rounded-lg bg-slate-100 border border-slate-300 shadow">
                                                <div className="font-semibold text-slate-700 mb-2">
                                                    📞 {msg.content} {/* e.g., Voice call with creator (SID: CAbc...). 3 turn(s) recorded. */}
                                                </div>
                                                {msg.metadata?.full_recording_url && (
                                                    <div className="mb-2">
                                                        <p className="text-xs text-slate-600 italic mb-1">Full Call Recording (Duration: {msg.metadata.full_recording_duration || 'N/A'}s):</p>
                                                        <audio controls src={msg.metadata.full_recording_url} className="w-full h-10">
                                                            Your browser does not support the audio element.
                                                        </audio>
                                                    </div>
                                                )}
                                                {msg.metadata?.turns && Array.isArray(msg.metadata.turns) && msg.metadata.turns.length > 0 && (
                                                    <div className="space-y-1 mt-2 pt-2 border-t border-slate-200">
                                                        <p className="text-xs text-slate-600 italic mb-1">Call Transcript:</p>
                                                        {msg.metadata.turns.map((turn: any, turnIndex: number) => (
                                                            <div key={turnIndex} className={`p-1.5 rounded ${turn.speaker === 'ai' ? 'text-blue-700 bg-blue-50' : 'text-green-700 bg-green-50'}`}>
                                                                <span className="font-medium capitalize">
                                                                    {turn.speaker === 'ai' ? 'Agent' : turn.speaker === 'user' ? 'Creator' : turn.speaker}:
                                                                </span> {turn.text}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    } else {
                                        // Existing rendering for other message types (emails, simple logs, etc.)
                                        // Make sure this part is preserved and works for non-voice_call_summary messages
                                        return (
                                            <div key={index} className={`text-sm p-2 my-1 rounded-md ${msg.sender === 'ai' || msg.sender === 'brand' ? 'bg-blue-100' : 'bg-green-100'}`}>
                                                <span className="font-semibold capitalize">
                                                    {msg.sender === 'ai' ? 'Agent' : msg.sender === 'brand' ? 'You' : 'Creator'}:
                                                </span> {msg.content}
                                                {/* Fallback for any older call_log types not yet consolidated (can be removed if all calls use voice_call_summary) */}
                                                {msg.type === 'call_log' && msg.metadata?.recording_url && (
                                                    <div className="mt-1">
                                                        <audio controls src={msg.metadata.recording_url} className="w-full h-10">
                                                            Your browser does not support the audio element.
                                                        </audio>
                                                    </div>
                                                )}
                                                {msg.type === 'call_exchange' && msg.sender === 'creator' && 
                                                    <span className="text-xs text-gray-500 block">(Spoken by Creator)</span>}
                                                {msg.type === 'call_exchange' && msg.sender === 'ai' && 
                                                    <span className="text-xs text-gray-500 block">(Agent response)</span>}
                                                <span className="text-xs text-gray-500 block">{new Date(msg.timestamp).toLocaleString()}</span>
                                            </div>
                                        );
                                    }
                                })}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                                    No call activity or conversation history recorded yet for this outreach.
                                </p>
                            )}
                        </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🤝</span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Active Negotiations
          </h3>
          <p className="text-gray-600 mb-4">
            When creators respond positively to your outreach, they'll appear here for AI-powered negotiation assistance using our centralized service.
          </p>
          <div className="flex justify-center gap-3">
            <a
              href="/creators"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              🔍 Find Creators
            </a>
            <a
              href="/outreaches"
              className="px-4 py-2 text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
            >
              📧 View Outreaches
            </a>
          </div>
        </div>
      )}

      {/* AI Negotiation Assistant Modal */}
      {selectedOutreach && negotiationState.generatedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  🤖 AI Negotiation Assistant
                </h3>
                <button
                  onClick={() => {
                    setSelectedOutreach(null);
                    setNegotiationState({
                      isGenerating: false,
                      currentOutreachId: null,
                      generatedMessage: '',
                      negotiationStrategy: '',
                      suggestedOffer: null,
                      method: null
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <p className="text-gray-600 text-sm mt-1">
                Stage-aware strategy generated for {selectedOutreach.creatorName} ({selectedOutreach.status})
              </p>
              {negotiationState.method && (
                <div className="mt-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    negotiationState.method === 'ai_generated' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {negotiationState.method === 'ai_generated' ? '🤖 AI Generated' : '🧠 Algorithmic'}
                  </span>
                </div>
              )}
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Strategy & Offer */}
                <div className="space-y-6">
                  {/* Strategy Overview */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">🎯 Negotiation Strategy</h4>
                    <p className="text-blue-800 text-sm">{negotiationState.negotiationStrategy}</p>
                  </div>

                  {/* Suggested Offer */}
                  {negotiationState.suggestedOffer && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-medium text-green-900 mb-2">💰 Suggested Offer</h4>
                      <div className="text-2xl font-bold text-green-600">
                        ₹{negotiationState.suggestedOffer.toLocaleString()}
                      </div>
                      <p className="text-green-700 text-sm mt-1">
                        Strategic pricing calculated by {negotiationState.method === 'ai_generated' ? 'AI analysis' : 'algorithmic strategy'} based on current stage
                      </p>
                    </div>
                  )}

                  {/* Creator Context */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">👤 Creator Context</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Platform:</span> {selectedOutreach.creatorPlatform}</div>
                      <div><span className="font-medium">Brand:</span> {selectedOutreach.brandName}</div>
                      <div><span className="font-medium">Current Offer:</span> {selectedOutreach.currentOffer ? `₹${selectedOutreach.currentOffer.toLocaleString()}` : 'Not set'}</div>
                      <div><span className="font-medium">Confidence:</span> {selectedOutreach.confidence}%</div>
                    </div>
                  </div>
                </div>

                {/* Right Column - Message */}
                <div className="space-y-4">
                  {/* Generated Message */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">📝 Proposed Message</h4>
                      <div className="text-xs text-gray-500">
                        {negotiationState.generatedMessage.length} characters
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <textarea
                        value={negotiationState.generatedMessage}
                        onChange={(e) => setNegotiationState(prev => ({
                          ...prev,
                          generatedMessage: e.target.value
                        }))}
                        className="w-full h-80 border-0 bg-transparent resize-y focus:outline-none text-sm leading-relaxed"
                        placeholder="AI-generated message will appear here..."
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      💡 You can edit this message before sending. The textarea is resizable.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleSendNegotiation(selectedOutreach)}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-colors font-medium"
                >
                  📧 Send Complete Message & Update Deal
                </button>
                <button
                  onClick={() => {
                    setSelectedOutreach(null);
                    setNegotiationState({
                      isGenerating: false,
                      currentOutreachId: null,
                      generatedMessage: '',
                      negotiationStrategy: '',
                      suggestedOffer: null,
                      method: null
                    });
                  }}
                  className="px-4 py-3 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NegotiationAgent; 