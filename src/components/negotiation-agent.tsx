import React, { useState, useEffect, useMemo } from 'react';
import {
  negotiationAgentService,
  type NegotiationResult,
  type PollingState,
  type NegotiationInsight
} from '../services/ai-agents';
import { 
  type StoredOutreach, 
  type ConversationMessage, 
  type VoiceCallSummaryMetadata,
  type CallRecordingMetadata
} from '../services/outreach-storage';
// Supabase import removed as it was not used in the backup component's logic

interface NegotiationState {
  isGenerating: boolean;
  currentOutreachId: string | null;
  generatedMessage: string;
  negotiationStrategy: string;
  suggestedOffer: number | null;
  method: 'ai_generated' | 'algorithmic_fallback' | null;
}

// CallArtifacts interface seems unused in the component's direct logic,
// but PollingState might reference it internally via fetchedArtifactsForLastCall.
// For now, keeping it commented out unless a direct need arises in component.
// interface CallArtifacts {
//   full_recording_url?: string;
//   full_recording_duration?: string;
//   creator_transcript?: string;
//   outreach_id?: string;
// }

// Helper function to process conversation history for display
interface CallGroup {
  callSid: string;
  summaryMessage: ConversationMessage & { metadata: VoiceCallSummaryMetadata }; // Ensure metadata is VoiceCallSummaryMetadata
  turns: ConversationMessage[];
  timestamp: Date;
}

interface ProcessedHistory {
  generalMessages: ConversationMessage[];
  callGroups: CallGroup[];
}

function processConversationHistoryForDisplay(history: ConversationMessage[] | undefined): ProcessedHistory {
  const processed: ProcessedHistory = {
    generalMessages: [],
    callGroups: [],
  };

  if (!history || history.length === 0) {
    return processed;
  }

  const callSummaryMessages = history.filter(
    (msg): msg is ConversationMessage & { metadata: VoiceCallSummaryMetadata } => 
      msg.type === 'voice_call_summary' && msg.metadata?.call_sid !== undefined
  );
  
  const messagesByCallSid: Record<string, ConversationMessage[]> = {};
  const otherMessages: ConversationMessage[] = [];

  history.forEach(msg => {
    if (msg.metadata?.call_sid && msg.type !== 'voice_call_summary') {
      if (!messagesByCallSid[msg.metadata.call_sid]) {
        messagesByCallSid[msg.metadata.call_sid] = [];
      }
      messagesByCallSid[msg.metadata.call_sid].push(msg);
    } else if (msg.type !== 'voice_call_summary') {
      otherMessages.push(msg);
    }
  });

  processed.generalMessages = otherMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  callSummaryMessages.forEach(summaryMsg => {
    const callSid = summaryMsg.metadata.call_sid;
    processed.callGroups.push({
      callSid: callSid,
      summaryMessage: summaryMsg,
      turns: (messagesByCallSid[callSid] || []).sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()), // Sort turns chronologically
      timestamp: new Date(summaryMsg.timestamp),
    });
  });

  processed.callGroups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Newest calls first

  return processed;
}

export const NegotiationAgentComponent: React.FC = () => {
  const [allOutreaches, setAllOutreaches] = useState<StoredOutreach[]>([]);
  const [eligibleNegotiationOutreaches, setEligibleNegotiationOutreaches] = useState<StoredOutreach[]>([]);
  const [selectedOutreach, setSelectedOutreach] = useState<StoredOutreach | null>(null);
  const [negotiationState, setNegotiationState] = useState<NegotiationState>({
    isGenerating: false,
    currentOutreachId: null,
    generatedMessage: '',
    negotiationStrategy: '',
    suggestedOffer: null,
    method: null
  });
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});
  const [servicePollingState, setServicePollingState] = useState<PollingState>(negotiationAgentService.getPollingStateSnapshot());
  const [initiatingCallForOutreachId, setInitiatingCallForOutreachId] = useState<string | null>(null);

  console.log('[NegotiationAgentComponent] Rendering. Service Polling State:', servicePollingState, 'Initiating state:', initiatingCallForOutreachId);

  useEffect(() => {
    const handlePollingStateChange = async (newState: PollingState) => {
      setServicePollingState(newState);
      if (newState.outreachDataUpdated) {
        console.log("[NegotiationAgentComponent] Service indicated outreach data updated. Reloading outreaches.");
        try {
          const reloadedPositiveOutreaches = await negotiationAgentService.getPositiveResponseCreators();
          setAllOutreaches(reloadedPositiveOutreaches);
          const reloadedEligibleOutreaches = await negotiationAgentService.getEligibleForNegotiation();
          setEligibleNegotiationOutreaches(reloadedEligibleOutreaches);
        } catch (error) {
          console.error("[NegotiationAgentComponent] Error reloading outreaches on polling update:", error);
        }
      }
    };
    negotiationAgentService.subscribeToPollingState(handlePollingStateChange);
    console.log('[NegotiationAgentComponent] Subscribed to service polling state.');

    return () => {
      negotiationAgentService.unsubscribeFromPollingState(handlePollingStateChange);
      console.log('[NegotiationAgentComponent] Unsubscribed from service polling state.');
    };
  }, []); // Empty dependency array: subscribe/unsubscribe only on mount/unmount

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        console.log("[NegotiationAgentComponent] Loading initial outreach data...");
        const positiveResponses = await negotiationAgentService.getPositiveResponseCreators();
        setAllOutreaches(positiveResponses);
        const eligible = await negotiationAgentService.getEligibleForNegotiation();
        setEligibleNegotiationOutreaches(eligible);
        console.log(`[NegotiationAgentComponent] Initial data loaded: ${positiveResponses.length} positive, ${eligible.length} eligible.`);
      } catch (error) {
        console.error("[NegotiationAgentComponent] Error loading initial outreach data:", error);
      }
    };
    
    loadInitialData();
  }, []); // Empty dependency array: load data only on mount

  const positiveResponseCreators = useMemo(() => allOutreaches, [allOutreaches]);
  // Use the state variable directly for eligible creators
  // const eligibleCreators = useMemo(() => eligibleNegotiationOutreaches, [eligibleNegotiationOutreaches]);

  const getLatestCallSidForOutreach = (outreach: StoredOutreach): string | undefined => {
    if (!outreach.conversationHistory || outreach.conversationHistory.length === 0) {
      return undefined;
    }
    const callMessages = outreach.conversationHistory
      .filter(msg => msg.metadata?.call_sid)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return callMessages.length > 0 ? callMessages[0].metadata!.call_sid : undefined;
  };

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
          negotiationStrategy: `${insight.currentPhase.replace(/_/g, ' ')} - ${insight.negotiationTactics.join(', ')}`,
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
        currentOutreachId: null, // Clear currentOutreachId on error
        generatedMessage: 'Error: Could not generate strategy.', // Provide feedback
        negotiationStrategy: '',
        suggestedOffer: null,
        method: null
      }));
      // setSelectedOutreach(null); // Optional: clear selection on error too
    }
  };

  const handleSendNegotiation = async (outreach: StoredOutreach) => {
    if (negotiationState.currentOutreachId !== outreach.id) {
        console.warn("Attempted to send negotiation for a non-selected outreach. This shouldn't happen.");
        return;
    }
    if (negotiationState.suggestedOffer !== null && negotiationState.generatedMessage) {
      const insightForUpdate = negotiationState.method && negotiationState.negotiationStrategy && negotiationState.suggestedOffer ? {
        currentPhase: negotiationState.negotiationStrategy.split(' - ')[0].replace(/ /g, '_') as NegotiationInsight['currentPhase'],
        suggestedResponse: negotiationState.generatedMessage,
        negotiationTactics: negotiationState.negotiationStrategy.split(' - ')[1]?.split(', ') || [],
        recommendedOffer: {
          amount: negotiationState.suggestedOffer,
          reasoning: 'User-approved AI generated offer'
        },
        nextSteps: ['Wait for creator response', 'Follow up if needed']
      } : undefined;

      try {
        const success = await negotiationAgentService.updateOutreachWithNegotiation(
          outreach.id,
          negotiationState.generatedMessage,
          negotiationState.suggestedOffer,
          insightForUpdate, // Pass the fully typed insight or undefined
          negotiationState.method || undefined
        );
        
        if (success) {
          // Data will be reloaded by polling state update if successful
          // For immediate feedback, you could reload here too:
          // const updatedPositiveOutreaches = await negotiationAgentService.getPositiveResponseCreators();
          // setAllOutreaches(updatedPositiveOutreaches);
          // const updatedEligibleOutreaches = await negotiationAgentService.getEligibleForNegotiation();
          // setEligibleNegotiationOutreaches(updatedEligibleOutreaches);
          
          setNegotiationState({ // Reset negotiation state form
            isGenerating: false,
            currentOutreachId: null,
            generatedMessage: '',
            negotiationStrategy: '',
            suggestedOffer: null,
            method: null
          });
          setSelectedOutreach(null); // Clear selected outreach from the form view
          console.log(`[NegotiationAgentComponent] Negotiation sent for ${outreach.creatorName}. Waiting for polling to update list.`);
        } else {
          console.error("Failed to send negotiation (updateOutreachWithNegotiation returned false)");
          // Add user feedback for failure
        }
      } catch (error) {
          console.error("Error in handleSendNegotiation:", error);
          // Add user feedback for error
      }
    } else {
        console.warn("Cannot send negotiation: message or offer is missing.");
        // Add user feedback: "Please ensure message and offer are filled."
    }
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      interested: 'text-green-600 bg-green-100 border-green-200',
      negotiating: 'text-orange-600 bg-orange-100 border-orange-200',
      deal_closed: 'text-purple-600 bg-purple-100 border-purple-200',
      declined: 'text-red-600 bg-red-100 border-red-200',
      contacted: 'text-blue-600 bg-blue-100 border-blue-200',
      pending: 'text-gray-600 bg-gray-100 border-gray-200',
    };
    return colorMap[status] || 'text-gray-600 bg-gray-100 border-gray-200';
  };

  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, string> = {
      interested: '😊',
      negotiating: '🤝',
      deal_closed: '✅',
      declined: '❌',
      contacted: '📬',
      pending: '⏳',
    };
    return iconMap[status] || '📋';
  };
  
  const toPhoneNumber = "+917022209405"; // Hardcoded as per user request

  return (
    <div className="space-y-6 p-4">
      <div className="bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 text-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <span className="text-2xl">🤝</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold">🤖 AI Negotiation Agent</h1>
              <p className="text-green-100">
                Manage negotiations and initiate AI-assisted calls.
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-green-100">Positive Responses</div>
            <div className="text-3xl font-bold">{positiveResponseCreators.length}</div>
            <div className="text-xs text-green-200 mt-1">
              Eligible for Negotiation: {eligibleNegotiationOutreaches.length}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 my-4 shadow">
        <h4 className="text-yellow-800 font-semibold mb-2">🚧 Voice Call Test Area 🚧</h4>
        <p className="text-sm text-yellow-700 mb-3">
          Ensure Python backend & ngrok are running. Backend <code>BACKEND_PUBLIC_URL</code> in <code>.env</code> must be your ngrok URL for callbacks.
          Phone number for testing is hardcoded to: <strong>{toPhoneNumber}</strong>.
        </p>
        <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                setInitiatingCallForOutreachId('test-call');
                console.log("📞 [TestCallButton] Initiating general test call via service.");
                
                let messageToSpeak = "Hello from InfluencerFlowAI! This is a general test call using the new service polling. Please leave a short message after the beep.";
                let creatorNameForCall = "Valued Creator";
                let brandNameForCall = "Our Brand";
                let campaignObjectiveForCall = "General Discussion";
                let historyForSummary: ConversationMessage[] = []; 
                let outreachIdForCallContext = `test_call_service_${Date.now()}`;

                if (selectedOutreach) { // Use selected outreach for context if available
                   messageToSpeak = `Hello ${selectedOutreach.creatorName}, this is a test call for the ${selectedOutreach.brandName} campaign regarding ${selectedOutreach.campaignContext || 'our potential collaboration'}. Using service polling. Please leave a message.`;
                   creatorNameForCall = selectedOutreach.creatorName;
                   brandNameForCall = selectedOutreach.brandName;
                   campaignObjectiveForCall = selectedOutreach.campaignContext || "Discuss campaign details";
                   historyForSummary = selectedOutreach.conversationHistory || [];
                   outreachIdForCallContext = selectedOutreach.id;
                }
                
                alert(`Initiating test call to ${toPhoneNumber} for outreach context ${outreachIdForCallContext}. Monitor 'Ongoing Call Status' section below.`);
                try {
                  await negotiationAgentService.initiateCallAndPoll(
                    outreachIdForCallContext, 
                    toPhoneNumber, 
                    messageToSpeak,
                    creatorNameForCall,
                    brandNameForCall,
                    campaignObjectiveForCall,
                    historyForSummary
                  );
                } catch (error) {
                  console.error("[TestCallButton] Error initiating test call:", error);
                  alert(`Error initiating test call: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                  setInitiatingCallForOutreachId(null);
                }
              }}
              disabled={initiatingCallForOutreachId === 'test-call' || servicePollingState.isPolling}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium disabled:opacity-60"
            >
              {initiatingCallForOutreachId === 'test-call' 
                ? 'Initiating Test Call...'
                : servicePollingState.isPolling ? 'Call In Progress...'
                : '📞 Make Test Call (Service)'
              }
            </button>
            
            {(servicePollingState.lastInitiatedCallSid || servicePollingState.activePollingCallSid) && (
              <button
                onClick={async () => {
                  const sidToFetch = servicePollingState.activePollingCallSid || servicePollingState.lastInitiatedCallSid;
                  alert(`Requesting manual fetch for call artifacts (SID: ${sidToFetch}). See details below or in outreach history.`);
                  if (sidToFetch) {
                    await negotiationAgentService.manuallyFetchCallArtifacts(sidToFetch);
                  } else {
                    alert("No active or last initiated Call SID found to fetch details for.");
                  }
                }}
                disabled={servicePollingState.isFetchingDetails} 
                className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium disabled:opacity-60"
              >
                {servicePollingState.isFetchingDetails ? 'Fetching Details...' : '📥 Fetch Last Call Details (Service)'}
              </button>
            )}
        </div>
        {(servicePollingState.lastInitiatedCallSid || servicePollingState.activePollingCallSid) && 
          <p className="text-xs text-yellow-700 mt-2">
            Service tracked SID: {servicePollingState.activePollingCallSid || servicePollingState.lastInitiatedCallSid || 'N/A'}
            {servicePollingState.isPolling && servicePollingState.activePollingCallSid && " (Currently Polling)"}
          </p>
        }
        {/* Display Status Message if available */}
        {servicePollingState.statusMessage && (
          <p className='text-sm mt-2 text-green-600'>
            <strong>Service Status:</strong> {servicePollingState.statusMessage}
          </p>
        )}
        {/* Display Error/Info Message from servicePollingState.errorMessage */}
        {servicePollingState.errorMessage && (() => {
          let messagePrefix = "Service Error:";
          let messageColor = "text-red-600";

          if (servicePollingState.errorMessage.includes("Unexpected token") || 
              servicePollingState.errorMessage.includes("JSON") || 
              servicePollingState.errorMessage.includes("is not valid JSON")) {
            messagePrefix = "Fetch Error:";
            servicePollingState.errorMessage = "Error parsing call details. Backend might have returned non-JSON. Check logs.";
          } else if (servicePollingState.errorMessage.startsWith("Call details fetched, but its effective outreach ID")) {
            messagePrefix = "Data Note:";
            messageColor = "text-orange-600";
            // Keep original message: servicePollingState.errorMessage = "Call details were fetched, but the associated outreach record was not found locally. History might not be saved correctly.";
          } else if (servicePollingState.errorMessage.includes("Call artifacts not found")) {
            messagePrefix = "Fetch Info:";
            messageColor = "text-orange-600";
            // Keep original message: servicePollingState.errorMessage = "Could not find call artifacts on the backend for the given Call SID.";
          } else if (servicePollingState.errorMessage.startsWith("Call ") && servicePollingState.errorMessage.includes(" status: ")) {
            messagePrefix = "Call Status:";
            messageColor = "text-blue-600"; // Or a neutral/info color
          } else if (servicePollingState.errorMessage.startsWith("Polling for ") && servicePollingState.errorMessage.includes(" timed out")) {
            messagePrefix = "Polling Info:";
            messageColor = "text-orange-600";
          }

          return (
            <p className={`text-sm mt-1 ${messageColor}`}>
              <strong>{messagePrefix}</strong> {servicePollingState.errorMessage}
            </p>
          );
        })()}
        {servicePollingState.fetchedArtifactsForLastCall && (
            <div className="mt-3 p-3 bg-yellow-100 rounded border border-yellow-200">
                <h5 className="text-sm font-medium text-yellow-800">
                  Fetched Artifacts (Context Outreach ID: {servicePollingState.fetchedArtifactsForLastCall.outreach_id || 'N/A'}, SID: {servicePollingState.lastInitiatedCallSid || 'N/A'}):
                </h5>
                {servicePollingState.fetchedArtifactsForLastCall.full_recording_url && (
                  <p className="text-xs">
                    Recording: <a href={servicePollingState.fetchedArtifactsForLastCall.full_recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Listen</a> 
                    ({servicePollingState.fetchedArtifactsForLastCall.full_recording_duration ? `${servicePollingState.fetchedArtifactsForLastCall.full_recording_duration}s` : 'N/A duration'})
                  </p>
                )}
                {servicePollingState.fetchedArtifactsForLastCall.conversation_history && Array.isArray(servicePollingState.fetchedArtifactsForLastCall.conversation_history) && (
                  <div className="mt-1 text-xs">
                    <p>Conversation Turns:</p>
                    <ul className="list-disc list-inside pl-2 max-h-32 overflow-y-auto">
                      {servicePollingState.fetchedArtifactsForLastCall.conversation_history.map((turn: any, index: number) => (
                        <li key={index}><strong>{turn.speaker || 'Unknown'}:</strong> {turn.text || '[empty]'}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {negotiationState.currentOutreachId && selectedOutreach && (
          <div className="md:col-span-2 lg:col-span-3 p-6 bg-blue-50 border border-blue-200 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold text-blue-800 mb-3">Negotiation Preview for: {selectedOutreach.creatorName}</h2>
            <div className="space-y-3">
              <div>
                <label htmlFor={`msg-${selectedOutreach.id}`} className="block text-sm font-medium text-gray-700">Suggested Message:</label>
                <textarea 
                  id={`msg-${selectedOutreach.id}`}
                  value={negotiationState.generatedMessage} 
                  onChange={(e) => setNegotiationState(prev => ({...prev, generatedMessage: e.target.value}))} 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 h-32"
                />
              </div>
              <div>
                <label htmlFor={`strat-${selectedOutreach.id}`} className="block text-sm font-medium text-gray-700">Strategy & Tactics:</label>
                <input 
                  id={`strat-${selectedOutreach.id}`}
                  type="text" 
                  value={negotiationState.negotiationStrategy} 
                  onChange={(e) => setNegotiationState(prev => ({...prev, negotiationStrategy: e.target.value}))} 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
                />
              </div>
              <div>
                <label htmlFor={`offer-${selectedOutreach.id}`} className="block text-sm font-medium text-gray-700">Offer Amount (₹):</label>
                <input 
                  id={`offer-${selectedOutreach.id}`}
                  type="number" 
                  value={negotiationState.suggestedOffer === null ? '' : negotiationState.suggestedOffer} 
                  onChange={(e) => setNegotiationState(prev => ({...prev, suggestedOffer: e.target.value === '' ? null : parseFloat(e.target.value) || null}))} 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
                />
              </div>
              <p className="text-xs text-gray-500">Method: {negotiationState.method || 'N/A'}</p>
            </div>
            <div className="mt-4 flex gap-3">
              <button 
                onClick={() => handleSendNegotiation(selectedOutreach)}
                disabled={!negotiationState.generatedMessage || negotiationState.suggestedOffer === null}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                ✅ Send to {selectedOutreach.creatorName}
              </button>
              <button 
                onClick={() => {
                  setSelectedOutreach(null);
                  setNegotiationState(prev => ({...prev, currentOutreachId: null, generatedMessage: '', negotiationStrategy: '', suggestedOffer: null, method: null}));
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {eligibleNegotiationOutreaches.length > 0 ? (
        <ul className="space-y-4">
          {eligibleNegotiationOutreaches.map((outreach) => {
            const isCurrentlySelectedForNegoForm = negotiationState.currentOutreachId === outreach.id && selectedOutreach?.id === outreach.id;
            const latestCallSidForOutreach = getLatestCallSidForOutreach(outreach);
            const isThisOutreachBeingCalledOrPolled = 
              initiatingCallForOutreachId === outreach.id ||
              (servicePollingState.isPolling && servicePollingState.currentPollOriginalOutreachId === outreach.id);

            return (
              <li key={outreach.id} className="bg-white p-5 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-300 ease-in-out">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800">
                      {outreach.creatorName}
                      <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(outreach.status)}`}>
                        {getStatusIcon(outreach.status)} {outreach.status.replace(/_/g, ' ')}
                      </span>
                    </h3>
                    <p className="text-sm text-gray-500">
                      Platform: {outreach.creatorPlatform} | Last Contact: {new Date(outreach.lastContact).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="mt-3 sm:mt-0 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                    <button
                      onClick={() => handleGenerateNegotiation(outreach)}
                      disabled={negotiationState.isGenerating && negotiationState.currentOutreachId === outreach.id}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm flex items-center gap-2 w-full sm:w-auto justify-center"
                    >
                      {negotiationState.isGenerating && negotiationState.currentOutreachId === outreach.id ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating...
                        </>
                      ) : (
                        '💡 Generate Strategy'
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        if (!outreach.creatorPhoneNumber) {
                          alert("Creator phone number is not available for this outreach.");
                          return;
                        }
                        if (servicePollingState.isPolling && servicePollingState.activePollingCallSid !== null) {
                            alert(`A call (SID: ${servicePollingState.activePollingCallSid}) is already in progress or being polled. Please wait for it to complete or manually fetch details if you suspect it's finished.`);
                            return;
                        }
                        setInitiatingCallForOutreachId(outreach.id);
                        const message = `Hello ${outreach.creatorName}, this is ${outreach.brandName} calling regarding our campaign: ${outreach.campaignContext || 'potential collaboration'}. We're excited to discuss this with you. Please leave a message after the beep.`;
                        const historyForSummary: ConversationMessage[] = outreach.conversationHistory || [];
                        
                        alert(`Initiating call to ${outreach.creatorName} at ${outreach.creatorPhoneNumber}. Monitor 'Voice Call Test Area' section for status.`);
                        try {
                          await negotiationAgentService.initiateCallAndPoll(
                            outreach.id, 
                            outreach.creatorPhoneNumber, 
                            message,
                            outreach.creatorName,
                            outreach.brandName,
                            outreach.campaignContext || "Discuss campaign collaboration",
                            historyForSummary
                          );
                        } catch (error) {
                          console.error(`[CallButton ${outreach.id}] Error initiating call:`, error);
                          alert(`Error initiating call to ${outreach.creatorName}: ${error instanceof Error ? error.message : String(error)}`);
                        } finally {
                          setInitiatingCallForOutreachId(null);
                        }
                      }}
                      disabled={isThisOutreachBeingCalledOrPolled || (servicePollingState.isPolling && servicePollingState.activePollingCallSid !== null)}
                      className="w-full sm:w-auto px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-60"
                    >
                      {initiatingCallForOutreachId === outreach.id ? 'Calling...' : 
                       (servicePollingState.isPolling && servicePollingState.currentPollOriginalOutreachId === outreach.id) ? 'Polling Call...' : 
                       (servicePollingState.isPolling && servicePollingState.activePollingCallSid !== null) ? 'Call Active...' :
                       `📞 Call ${outreach.creatorName}`}
                    </button>
                    <button
                      onClick={async () => {
                        const callSidToFetch = getLatestCallSidForOutreach(outreach);
                        if (callSidToFetch) {
                          alert(`Requesting manual fetch for ${outreach.creatorName}'s call (SID: ${callSidToFetch}). See details in 'Voice Call Test Area' or history.`);
                          
                          const MAX_FETCH_ATTEMPTS = 3;
                          const FETCH_RETRY_DELAY_MS = 3000;
                          let attempt = 0;
                          let success = false;

                          while (attempt < MAX_FETCH_ATTEMPTS && !success) {
                            attempt++;
                            await negotiationAgentService.manuallyFetchCallArtifacts(callSidToFetch);
                            
                            // Check the state from the service after the attempt
                            const currentServiceState = negotiationAgentService.getPollingStateSnapshot();

                            if (currentServiceState.fetchedArtifactsForLastCall && currentServiceState.activePollingCallSid === callSidToFetch && !currentServiceState.errorMessage) {
                              // Check if we actually got the recording URL as a stronger success condition
                              if (currentServiceState.fetchedArtifactsForLastCall.full_recording_url) {
                                console.log(`[Call Details] Fetch attempt ${attempt} successful for SID ${callSidToFetch}. Recording URL found.`);
                                success = true;
                                alert(`Successfully fetched call details for ${outreach.creatorName} (SID: ${callSidToFetch}) on attempt ${attempt}.`);
                              } else {
                                console.log(`[Call Details] Fetch attempt ${attempt} for SID ${callSidToFetch} seemed successful, but recording URL is still missing. Will retry if attempts remain.`);
                                // If no error, but critical data (like recording_url) is missing, we might still want to retry.
                                // For now, we only explicitly retry on "not found" type errors.
                                // If errorMessage is null but no recording_url, it implies the backend sent data but it was incomplete.
                                if (attempt < MAX_FETCH_ATTEMPTS && !currentServiceState.errorMessage) {
                                   alert(`Call details for ${outreach.creatorName} (SID: ${callSidToFetch}) fetched on attempt ${attempt}, but some data (e.g. recording) might still be processing. Will check again if attempts remain.`);
                                   await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
                                } else if (!currentServiceState.errorMessage) {
                                   success = true; // No error, but no URL after max attempts, count as "fetched what's available"
                                   alert(`Fetched available call details for ${outreach.creatorName} (SID: ${callSidToFetch}). Some data (e.g. recording) might still be processing or unavailable.`);
                                }
                              }
                            } else if (currentServiceState.errorMessage && currentServiceState.errorMessage.includes("Call artifacts not found")) {
                              console.warn(`[Call Details] Fetch attempt ${attempt} for SID ${callSidToFetch} failed: ${currentServiceState.errorMessage}. Retrying if attempts remain...`);
                              if (attempt < MAX_FETCH_ATTEMPTS) {
                                alert(`Could not find call details for ${outreach.creatorName} (SID: ${callSidToFetch}) on attempt ${attempt}. Retrying in ${FETCH_RETRY_DELAY_MS / 1000}s...`);
                                await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
                              } else {
                                alert(`Failed to fetch call details for ${outreach.creatorName} (SID: ${callSidToFetch}) after ${MAX_FETCH_ATTEMPTS} attempts. Error: ${currentServiceState.errorMessage}`);
                              }
                            } else if (currentServiceState.errorMessage) {
                              // A different error occurred, don't retry for this type of error
                              console.error(`[Call Details] Fetch attempt ${attempt} for SID ${callSidToFetch} failed with a non-retryable error: ${currentServiceState.errorMessage}`);
                              alert(`Error fetching call details for ${outreach.creatorName} (SID: ${callSidToFetch}): ${currentServiceState.errorMessage}`);
                              success = true; // Break loop on other errors
                            } else {
                              // No error, and fetchedArtifacts might be there but not for activePollingCallSid, or some other state.
                              // This case should ideally mean success if no error is present.
                              console.log(`[Call Details] Fetch attempt ${attempt} for SID ${callSidToFetch} completed without specific error, assuming success or data already present.`);
                              success = true; 
                            }
                          }
                          if (!success && attempt === MAX_FETCH_ATTEMPTS) {
                             // This message is now covered by the more specific alerts inside the loop.
                             // alert(`Failed to fetch complete call details for ${outreach.creatorName} (SID: ${callSidToFetch}) after ${MAX_FETCH_ATTEMPTS} attempts. Please check backend logs or try again later.`);
                          }

                        } else {
                          alert(`${outreach.creatorName} has no call SID recorded in their history yet. Initiate a call first or check if a general test call was made for their context.`);
                        }
                      }}
                      disabled={!latestCallSidForOutreach || (servicePollingState.isFetchingDetails && servicePollingState.activePollingCallSid === latestCallSidForOutreach)}
                      className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50 text-sm w-full sm:w-auto justify-center"
                    >
                      {
                        (servicePollingState.isFetchingDetails && servicePollingState.activePollingCallSid === latestCallSidForOutreach) ? 'Fetching...' :
                        (servicePollingState.isPolling && servicePollingState.activePollingCallSid === latestCallSidForOutreach) ? 'Polling (Fetch Now?)' :
                        'Call Details'
                      }
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => setShowDetails(prev => ({ ...prev, [outreach.id]: !prev[outreach.id] }))}
                  className="text-xs text-blue-500 hover:underline mt-2"
                >
                  {showDetails[outreach.id] ? 'Hide Details' : 'Show Details'}
                </button>
                {showDetails[outreach.id] && (() => {
                  // Process history for this outreach
                  const displayHistory = processConversationHistoryForDisplay(outreach.conversationHistory);
                  
                  return (
                    <div className="mt-3 space-y-2 text-sm text-gray-700 border-t pt-3">
                      <p><strong>Creator ID:</strong> {outreach.creatorId}</p>
                      <p><strong>Outreach ID:</strong> {outreach.id}</p>
                      <p><strong>Brand:</strong> {outreach.brandName}</p>
                      <p><strong>Campaign Context:</strong> {outreach.campaignContext}</p>
                      <p><strong>Current Offer:</strong> {outreach.currentOffer ? `₹${outreach.currentOffer}` : 'Not set'}</p>
                      <p><strong>Phone Number:</strong> {outreach.creatorPhoneNumber || 'N/A'}</p>
                      <p><strong>Notes:</strong> {outreach.notes || 'None'}</p>
                      
                      <h5 className="font-semibold mt-3 pt-2 border-t">Conversation Log:</h5>

                      {displayHistory.callGroups.length === 0 && displayHistory.generalMessages.length === 0 && (
                        <p className="text-xs">No conversation history recorded.</p>
                      )}

                      {/* Render Call Groups */}
                      {displayHistory.callGroups.map(callGroup => (
                        <div key={callGroup.callSid} className="my-4 p-3 border rounded-md bg-sky-50 border-sky-200">
                          <h6 className="font-semibold text-sky-700">
                            Call on {new Date(callGroup.timestamp).toLocaleString()} (SID: {callGroup.callSid})
                          </h6>
                          {callGroup.summaryMessage.metadata.full_recording_url && (
                            <div className="mt-2">
                              <p className="font-medium text-xs mb-1">Recording:</p>
                              <audio controls src={callGroup.summaryMessage.metadata.full_recording_url} className="w-full max-w-sm">
                                Your browser does not support the audio element.
                                <a 
                                  href={callGroup.summaryMessage.metadata.full_recording_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-500 hover:text-blue-700 underline"
                                >
                                  Listen to recording
                                </a>
                              </audio>
                              {callGroup.summaryMessage.metadata.full_recording_duration && 
                                <p className="text-xs text-gray-600 mt-1">Duration: {callGroup.summaryMessage.metadata.full_recording_duration}s</p>}
                            </div>
                          )}
                          {callGroup.summaryMessage.metadata.error_message && 
                            <p className="text-xs text-red-500 mt-1">Call Error: {callGroup.summaryMessage.metadata.error_message}</p>}
                          
                          {callGroup.turns.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-sky-100">
                              <p className="font-medium text-xs mb-1">Transcript:</p>
                              <div className="max-h-48 overflow-y-auto space-y-1 bg-white p-2 rounded border border-sky-100">
                                {callGroup.turns.map(turn => (
                                  <div key={turn.id} className="text-xs">
                                    <span className={`font-semibold ${turn.sender === 'creator' ? 'text-green-700' : 'text-blue-700'}`}>
                                      {turn.sender.toUpperCase()}:
                                    </span>
                                    <span className="ml-1 whitespace-pre-wrap">{turn.content}</span>
                                    <span className="text-gray-400 text-xxs ml-2">({new Date(turn.timestamp).toLocaleTimeString()})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                           {callGroup.summaryMessage.metadata.human_readable_summary && 
                            <p className="text-xs mt-2 italic text-gray-600">AI Summary: {callGroup.summaryMessage.metadata.human_readable_summary}</p>}
                        </div>
                      ))}

                      {/* Render General Messages (if any, and if there are calls, perhaps with a separator) */}
                      {displayHistory.generalMessages.length > 0 && (
                        <div className="mt-4 pt-3 border-t">
                          <h6 className="font-semibold text-gray-700 mb-2">Other Messages:</h6>
                          <div className="max-h-60 overflow-y-auto bg-gray-50 p-2 rounded border space-y-2">
                            {displayHistory.generalMessages.map(msg => {
                              // Type check for 'call_recording' should now work directly
                              if (msg.type === 'call_recording') {
                                // const callRecMsg = msg as any; // No longer needed
                                return (
                                  <div key={msg.id} className="p-2 border-b last:border-b-0 text-xs bg-purple-50 border-purple-200 rounded">
                                    <p className="font-semibold text-purple-700">
                                      SYSTEM ({new Date(msg.timestamp).toLocaleString()}):
                                    </p>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    {/* Cast metadata to CallRecordingMetadata if needed, or check its existence based on updated type */}
                                    {(msg.metadata as CallRecordingMetadata)?.recording_url && (
                                      <a 
                                        href={(msg.metadata as CallRecordingMetadata).recording_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-500 hover:text-blue-700 underline"
                                      >
                                        Listen to associated recording
                                      </a>
                                    )}
                                  </div>
                                );
                              }
                              // Original rendering for other general messages
                              return (
                                <div key={msg.id} className="p-2 border-b last:border-b-0 text-xs">
                                  <p className={`font-semibold ${msg.sender === 'creator' ? 'text-green-600' : msg.sender === 'ai' ? 'text-blue-600' : 'text-purple-600'}`}>
                                    {msg.sender.toUpperCase()} ({new Date(msg.timestamp).toLocaleString()}):
                                  </p>
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  {/* You could render other metadata for general messages if needed */}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {isCurrentlySelectedForNegoForm && ( // Show form only if this outreach is selected
                    <div className="mt-4 p-4 border-t border-indigo-200 bg-indigo-50 rounded-md">
                        <h4 className="text-md font-semibold text-indigo-700">Generated Suggestion for {outreach.creatorName}:</h4>
                        <p className="text-sm text-indigo-600 mt-1"><strong>Strategy:</strong> {negotiationState.negotiationStrategy}</p>
                        <p className="text-sm text-indigo-600"><strong>Recommended Offer:</strong> ₹{negotiationState.suggestedOffer}</p>
                        <p className="text-sm text-indigo-600"><strong>Message:</strong></p>
                        <textarea 
                            value={negotiationState.generatedMessage} 
                            readOnly // This is the AI suggested message, should be copied/edited in the main form above
                            className="mt-1 w-full text-xs p-2 border border-indigo-200 rounded h-24 bg-white"
                        />
                        <p className="text-xs text-indigo-500 mt-1">Method: {negotiationState.method}</p>
                        {/* Buttons to act on this specific suggestion were part of the main form, 
                            so this section is mostly for display if an individual item is selected.
                            The main form handles sending. Maybe add a "Use this suggestion" button
                            that populates the main form if it's different.
                            For now, this is just a display of the generated text IF it's the current one.
                        */}
                         <div className="mt-3 flex gap-2">
                            <button 
                                onClick={() => handleSendNegotiation(outreach)}
                                disabled={!negotiationState.generatedMessage || negotiationState.suggestedOffer === null}
                                className="px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50"
                            >
                                Send This Suggestion
                            </button>
                            <button 
                                onClick={() => {
                                    setSelectedOutreach(null); 
                                    setNegotiationState(prev => ({...prev, currentOutreachId: null, generatedMessage: '', negotiationStrategy: '', suggestedOffer: null, method: null}));
                                }}
                                className="px-3 py-1.5 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-center text-gray-500 py-8">No creators currently eligible for negotiation based on their status or none found with positive responses.</p>
      )}
    </div>
  );
};

// If you prefer a default export:
// export default NegotiationAgentComponent;
