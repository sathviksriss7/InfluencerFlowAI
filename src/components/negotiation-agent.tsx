import React, { useState, useEffect, useMemo } from 'react';
import { 
  negotiationAgentService, 
  type NegotiationResult,
  type PollingState
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

interface CallArtifacts {
  full_recording_url?: string;
  full_recording_duration?: string;
  creator_transcript?: string;
  outreach_id?: string;
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
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});
  const [servicePollingState, setServicePollingState] = useState<PollingState>(negotiationAgentService.getPollingStateSnapshot());
  const [initiatingCallForOutreachId, setInitiatingCallForOutreachId] = useState<string | null>(null);

  console.log('[NegotiationAgent] Component rendering. Service Polling State:', servicePollingState, 'Initiating state:', initiatingCallForOutreachId);

  useEffect(() => {
    const handlePollingStateChange = (newState: PollingState) => {
      setServicePollingState(newState);
      if (newState.outreachDataUpdated) {
        console.log("[NegotiationAgent] Service indicated outreach data updated. Reloading outreaches.");
        const reloadedOutreaches = negotiationAgentService.getPositiveResponseCreators();
        setAllOutreaches(reloadedOutreaches);
      }
    };
    negotiationAgentService.subscribeToPollingState(handlePollingStateChange);
    console.log('[NegotiationAgent] Subscribed to service polling state.');

    return () => {
      negotiationAgentService.unsubscribeFromPollingState(handlePollingStateChange);
      console.log('[NegotiationAgent] Unsubscribed from service polling state.');
    };
  }, []);

  useEffect(() => {
    const loadOutreaches = () => {
      const outreaches = negotiationAgentService.getPositiveResponseCreators();
      setAllOutreaches(outreaches);
    };
    
    loadOutreaches();
  }, []);

  const positiveResponseCreators = useMemo(() => allOutreaches, [allOutreaches]);

  const eligibleCreators = useMemo(() => {
    return negotiationAgentService.getEligibleForNegotiation();
  }, [allOutreaches]);

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

  const handleSendNegotiation = async (outreach: StoredOutreach) => {
    if (negotiationState.suggestedOffer && negotiationState.generatedMessage) {
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
        const updatedOutreaches = negotiationAgentService.getPositiveResponseCreators();
        setAllOutreaches(updatedOutreaches);
        
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

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      interested: 'text-green-600 bg-green-100 border-green-200',
      negotiating: 'text-orange-600 bg-orange-100 border-orange-200',
      deal_closed: 'text-purple-600 bg-purple-100 border-purple-200'
    };
    return colorMap[status] || 'text-gray-600 bg-gray-100 border-gray-200';
  };

  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, string> = {
      interested: '😊',
      negotiating: '🤝',
      deal_closed: '✅'
    };
    return iconMap[status] || '📋';
  };

  return (
    <div className="space-y-6">
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
              Eligible: {eligibleCreators.length}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 my-4">
        <h4 className="text-yellow-800 font-semibold mb-2">🚧 Voice Call Test Area 🚧</h4>
        <p className="text-sm text-yellow-700 mb-3">
          Ensure Python backend & ngrok are running. Update placeholder phone number in code. 
          <code>BACKEND_PUBLIC_URL</code> in <code>backend/.env</code> must be your ngrok URL.
        </p>
        <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                setInitiatingCallForOutreachId('test-call');
                console.log("📞 [TestCallButton] Initiating general test call via service.");
                const toPhoneNumber = "+917022209405"; // Placeholder
                let messageToSpeak = "Hello from InfluencerFlowAI! This is a general test call using the new service polling. Please leave a short message.";
                
                let creatorNameForCall = "Valued Creator";
                let brandNameForCall = "Our Brand";
                let campaignObjectiveForCall = "General Discussion";
                let historyForSummary: ConversationMessage[] = []; // Default to empty array

                if (selectedOutreach) {
                   messageToSpeak = `Hello ${selectedOutreach.creatorName}, this is a test call for the ${selectedOutreach.brandName} campaign using service polling.`;
                   creatorNameForCall = selectedOutreach.creatorName;
                   brandNameForCall = selectedOutreach.brandName;
                   campaignObjectiveForCall = selectedOutreach.campaignContext || "Discuss campaign details";
                   historyForSummary = selectedOutreach.conversationHistory || []; // Pass raw history
                }
                const outreachIdForCall = selectedOutreach ? selectedOutreach.id : `test_call_service_${Date.now()}`;
                alert(`Initiating test call to ${toPhoneNumber} for outreach context ${outreachIdForCall}. Monitor 'Ongoing Call Status' section.`);
                try {
                  await negotiationAgentService.initiateCallAndPoll(
                    outreachIdForCall, 
                    toPhoneNumber, 
                    messageToSpeak,
                    creatorNameForCall,
                    brandNameForCall,
                    campaignObjectiveForCall,
                    historyForSummary // Pass raw history array
                  );
                } catch (error) {
                  console.error("[TestCallButton] Error initiating test call:", error);
                  alert(`Error initiating test call: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                  setInitiatingCallForOutreachId(null);
                }
              }}
              disabled={initiatingCallForOutreachId === 'test-call'}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium disabled:opacity-60"
            >
              {initiatingCallForOutreachId === 'test-call' 
                ? 'Initiating Test Call...'
                : '📞 Make General Test Call (via Service)'
              }
            </button>
            
            {(servicePollingState.lastInitiatedCallSid || servicePollingState.activePollingCallSid) && (
              <button
                onClick={async () => {
                  alert("Requesting manual fetch for latest call artifacts. See details below or in outreach history.");
                  await negotiationAgentService.manuallyFetchCallArtifacts(servicePollingState.activePollingCallSid || servicePollingState.lastInitiatedCallSid || undefined);
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
            Service tracked SID: {servicePollingState.activePollingCallSid || servicePollingState.lastInitiatedCallSid}
          </p>
        }
        {servicePollingState.statusMessage && (
          <p className={`text-sm mt-2 ${servicePollingState.errorMessage ? 'text-red-600' : 'text-green-600'}`}>
            {servicePollingState.statusMessage}
          </p>
        )}
        {servicePollingState.errorMessage && (
          <p className="text-sm text-red-600 mt-1">Error: {servicePollingState.errorMessage}</p>
        )}
        {servicePollingState.fetchedArtifactsForLastCall && (
            <div className="mt-3 p-3 bg-yellow-100 rounded">
                <h5 className="text-sm font-medium text-yellow-800">
                  Fetched Artifacts (for SID: {servicePollingState.fetchedArtifactsForLastCall.outreach_id || servicePollingState.lastInitiatedCallSid || 'N/A'}):
                </h5>
                {servicePollingState.fetchedArtifactsForLastCall.full_recording_url && (
                  <p className="text-xs">
                    Recording: <a href={servicePollingState.fetchedArtifactsForLastCall.full_recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Listen</a> 
                    ({servicePollingState.fetchedArtifactsForLastCall.full_recording_duration}s)
                  </p>
                )}
                {servicePollingState.fetchedArtifactsForLastCall.conversation_history && (
                  <div className="mt-1 text-xs">
                    <p>Conversation:</p>
                    <ul className="list-disc list-inside pl-2">
                      {servicePollingState.fetchedArtifactsForLastCall.conversation_history.map((turn: any, index: number) => (
                        <li key={index}><strong>{turn.speaker}:</strong> {turn.text}</li>
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
                <label className="block text-sm font-medium text-gray-700">Suggested Message:</label>
                <textarea 
                  value={negotiationState.generatedMessage} 
                  onChange={(e) => setNegotiationState(prev => ({...prev, generatedMessage: e.target.value}))} 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 h-32"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Strategy & Tactics:</label>
                <input 
                  type="text" 
                  value={negotiationState.negotiationStrategy} 
                  onChange={(e) => setNegotiationState(prev => ({...prev, negotiationStrategy: e.target.value}))} 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Offer Amount (₹):</label>
                <input 
                  type="number" 
                  value={negotiationState.suggestedOffer || ''} 
                  onChange={(e) => setNegotiationState(prev => ({...prev, suggestedOffer: parseFloat(e.target.value) || null}))} 
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2"
                />
              </div>
              <p className="text-xs text-gray-500">Method: {negotiationState.method || 'N/A'}</p>
            </div>
            <div className="mt-4 flex gap-3">
              <button 
                onClick={() => handleSendNegotiation(selectedOutreach)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
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

      {eligibleCreators.length > 0 ? (
        <ul className="space-y-4">
          {eligibleCreators.map((outreach) => {
            const negotiationResultForOutreach =
              negotiationState.currentOutreachId === outreach.id
                ? negotiationState
                : null;
            const latestCallSidForOutreach = getLatestCallSidForOutreach(outreach);

            return (
              <li key={outreach.id} className="bg-white p-5 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-300 ease-in-out">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800">
                      {outreach.creatorName}
                      <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(outreach.status)}`}>
                        {getStatusIcon(outreach.status)} {outreach.status.replace('_', ' ')}
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
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
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
                          alert("Creator phone number is not available.");
                          return;
                        }
                        setInitiatingCallForOutreachId(outreach.id);
                        const message = `Hello ${outreach.creatorName}, this is ${outreach.brandName} calling regarding our campaign. We're excited to discuss a potential collaboration.`;
                        const historyForSummary: ConversationMessage[] = outreach.conversationHistory || []; // Pass raw history
                        
                        alert(`Initiating call to ${outreach.creatorName} at ${outreach.creatorPhoneNumber}. Monitor 'Ongoing Call Status' section.`);
                        try {
                          await negotiationAgentService.initiateCallAndPoll(
                            outreach.id, 
                            outreach.creatorPhoneNumber, 
                            message,
                            outreach.creatorName,
                            outreach.brandName,
                            outreach.campaignContext || "Discuss campaign collaboration",
                            historyForSummary // Pass raw history array
                          );
                        } catch (error) {
                          console.error(`[CallButton ${outreach.id}] Error initiating call:`, error);
                          alert(`Error initiating call to ${outreach.creatorName}: ${error instanceof Error ? error.message : String(error)}`);
                        } finally {
                          setInitiatingCallForOutreachId(null);
                        }
                      }}
                      disabled={
                        initiatingCallForOutreachId === outreach.id ||
                        (servicePollingState.isPolling && servicePollingState.activePollingCallSid !== null && servicePollingState.currentPollOriginalOutreachId === outreach.id)
                      }
                      className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-60"
                    >
                      {initiatingCallForOutreachId === outreach.id ? 'Initiating...' : 
                       (servicePollingState.isPolling && servicePollingState.activePollingCallSid !== null && servicePollingState.currentPollOriginalOutreachId === outreach.id) ? 'Polling...' : 
                       `📞 Call ${outreach.creatorName}`}
                    </button>
                    <button
                      onClick={async () => {
                        const latestCallSid = getLatestCallSidForOutreach(outreach);
                        if (latestCallSid) {
                          alert(`Requesting manual fetch for ${outreach.creatorName}'s call (SID: ${latestCallSid}). See details or history.`);
                          await negotiationAgentService.manuallyFetchCallArtifacts(latestCallSid);
                        } else {
                          alert(`${outreach.creatorName} has no call SID recorded yet. Initiate a call first.`);
                        }
                      }}
                      disabled={!latestCallSidForOutreach || (servicePollingState.isFetchingDetails && servicePollingState.activePollingCallSid === latestCallSidForOutreach)}
                      className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50 text-sm"
                    >
                      {
                        (servicePollingState.isFetchingDetails && servicePollingState.activePollingCallSid === latestCallSidForOutreach) ? 'Fetching...' :
                        (servicePollingState.isPolling && servicePollingState.activePollingCallSid === latestCallSidForOutreach) ? 'Polling (Fetch Now?)' :
                        'Details'
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
                {showDetails[outreach.id] && (
                  <div className="mt-3 space-y-2 text-sm text-gray-700 border-t pt-3">
                    <p><strong>Brand:</strong> {outreach.brandName}</p>
                    <p><strong>Campaign Context:</strong> {outreach.campaignContext}</p>
                    <p><strong>Current Offer:</strong> {outreach.currentOffer ? `₹${outreach.currentOffer}` : 'Not set'}</p>
                    <p><strong>Notes:</strong> {outreach.notes || 'None'}</p>
                    <h5 className="font-semibold mt-2">Conversation History ({outreach.conversationHistory?.length || 0}):</h5>
                    {outreach.conversationHistory && outreach.conversationHistory.length > 0 ? (
                      <div className="max-h-60 overflow-y-auto bg-gray-50 p-2 rounded">
                        {outreach.conversationHistory.slice().reverse().map(msg => (
                          <div key={msg.id} className="mb-2 p-2 border-b last:border-b-0">
                            <p className={`font-semibold ${msg.sender === 'brand' ? 'text-blue-600' : msg.sender === 'creator' ? 'text-green-600' : 'text-purple-600'}`}>
                              {msg.sender.toUpperCase()} ({new Date(msg.timestamp).toLocaleString()}):
                            </p>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            {msg.type === 'voice_call_summary' && msg.metadata && (
                              <div className="text-xs mt-1 pl-2 border-l-2 border-gray-300">
                                {msg.metadata.call_sid && <p>Call SID: {msg.metadata.call_sid}</p>}
                                {msg.metadata.full_recording_url && (
                                  <p>
                                    Full Recording: <a href={msg.metadata.full_recording_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Listen</a> 
                                    ({msg.metadata.full_recording_duration}s)
                                  </p>
                                )}
                                {msg.metadata.turns && msg.metadata.turns.length > 0 && (
                                  <div className="mt-1">
                                    <p className="font-medium">Transcript Snippets:</p>
                                    <ul className="list-disc list-inside pl-2">
                                      {msg.metadata.turns.map((turn, idx) => (
                                        <li key={idx}><strong>{turn.speaker}:</strong> {turn.text}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No conversation history recorded.</p>
                    )}
                  </div>
                )}
                {negotiationResultForOutreach && (
                    <div className="mt-4 p-4 border-t border-indigo-200 bg-indigo-50 rounded-md">
                        <h4 className="text-md font-semibold text-indigo-700">Generated Suggestion for {outreach.creatorName}:</h4>
                        <p className="text-sm text-indigo-600 mt-1"><strong>Strategy:</strong> {negotiationResultForOutreach.negotiationStrategy}</p>
                        <p className="text-sm text-indigo-600"><strong>Recommended Offer:</strong> ₹{negotiationResultForOutreach.suggestedOffer}</p>
                        <p className="text-sm text-indigo-600"><strong>Message:</strong></p>
                        <textarea 
                            value={negotiationResultForOutreach.generatedMessage} 
                            readOnly 
                            className="mt-1 w-full text-xs p-2 border border-indigo-200 rounded h-24 bg-white"
                        />
                        <p className="text-xs text-indigo-500 mt-1">Method: {negotiationResultForOutreach.method}</p>
                        <div className="mt-3 flex gap-2">
                            <button 
                                onClick={() => handleSendNegotiation(outreach)} 
                                className="px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                            >
                                Send Negotiation
                            </button>
                            <button 
                                onClick={() => {
                                    setSelectedOutreach(null); 
                                    setNegotiationState(prev => ({...prev, currentOutreachId: null}));
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
        <p className="text-center text-gray-500 py-8">No creators currently eligible for negotiation based on their status.</p>
      )}
    </div>
  );
};

export default NegotiationAgent; 