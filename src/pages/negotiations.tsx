import { useState, useMemo, useEffect } from 'react';
import { outreachStorageService, type StoredOutreach, type ConversationMessage } from '../services/outreach-storage';
import { supabase } from '../lib/supabase';
import { toast } from 'react-toastify';

export default function Negotiations() {
  const [selectedOutreach, setSelectedOutreach] = useState<StoredOutreach | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [newMessage, setNewMessage] = useState('');
  const [outreaches, setOutreaches] = useState<StoredOutreach[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposedOffer, setProposedOffer] = useState<string>('');
  const [newSubject, setNewSubject] = useState('');

  // State for the strategy preview modal/pop-up
  const [strategyEmailSubject, setStrategyEmailSubject] = useState('');

  // Load initial outreach data
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const allOutreaches = await outreachStorageService.getAllOutreaches();
        const negotiationOutreaches = allOutreaches.filter(o =>
          ['negotiating', 'interested', 'deal_closed', 'pending_response'].includes(o.status) // Consider relevant statuses
        );
        setOutreaches(negotiationOutreaches);
        if (negotiationOutreaches.length > 0) {
          // If there's no selectedOutreach or the current selectedOutreach is no longer in the list, select the first one.
          if (!selectedOutreach || !negotiationOutreaches.find(no => no.id === selectedOutreach.id)) {
            setSelectedOutreach(negotiationOutreaches[0]);
          }
        } else {
          setSelectedOutreach(null); // No relevant outreaches, so clear selection
        }
      } catch (error) {
        console.error("Failed to fetch outreaches:", error);
        setOutreaches([]);
        setSelectedOutreach(null);
      }
      setLoading(false);
    };
    fetchInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Effect to load conversation history and set proposed offer when selectedOutreach changes
  useEffect(() => {
    if (selectedOutreach && selectedOutreach.id) {
      const fetchHistoryAndOffer = async () => {
        try {
          const history = await outreachStorageService.getConversationHistory(selectedOutreach.id);
          setConversationHistory(history || []);
          setProposedOffer(selectedOutreach.currentOffer?.toString() || '');
        } catch (error) {
          console.error(`Failed to fetch conversation history for ${selectedOutreach.id}:`, error);
          setConversationHistory([]);
          setProposedOffer('');
        }
      };
      fetchHistoryAndOffer();
    } else {
      setConversationHistory([]);
      setProposedOffer('');
    }
  }, [selectedOutreach]);

  // Derived state for easier access in JSX, memoized for performance
  const selectedOutreachData = useMemo(() => selectedOutreach, [selectedOutreach]);

  // Filter outreaches based on status
  const filteredOutreaches = useMemo(() => {
    if (statusFilter === 'all') return outreaches;
    return outreaches.filter(outreach => outreach.status === statusFilter);
  }, [outreaches, statusFilter]);

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'interested':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'negotiating':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'deal_closed':
        return `${baseClasses} bg-purple-100 text-purple-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !newSubject.trim() || !selectedOutreachData) {
      toast.error("Subject and message body are required.");
      return;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user || !session.access_token) {
      toast.error("Authentication error. Please log in again.");
      console.error("Authentication error:", sessionError);
      return;
    }
    const userId = session.user.id;
    const accessToken = session.access_token;

    try {
      const loggedMessage = await outreachStorageService.addConversationMessage(
        selectedOutreachData.id,
        newMessage,
        'brand',
        'negotiation_message_gmail',
        {
          subject: newSubject,
          gmail_send_status: 'pending_gmail_send',
        }
      );

      if (!loggedMessage || !loggedMessage.id) {
        toast.error("Failed to log message before sending.");
        console.error("Failed to log message to conversation_messages");
        return;
      }
      const conversationMessageId = loggedMessage.id;

      const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
      const sendResponse = await fetch(`${backendUrl}/api/outreach/send-via-gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          outreach_id: selectedOutreachData.id,
          conversation_message_id: conversationMessageId,
          subject: newSubject,
          body: newMessage,
        }),
      });

      const sendResult = await sendResponse.json();

      if (sendResponse.ok && sendResult.success) {
        toast.success("Negotiation message sent via Gmail!");
        setNewMessage('');
        setNewSubject('');
        
        const updatedHistory = await outreachStorageService.getConversationHistory(selectedOutreachData.id);
        setConversationHistory(updatedHistory || []);
        
        const allOutreaches = await outreachStorageService.getAllOutreaches();
        const negotiationOutreaches = allOutreaches.filter(o =>
          ['negotiating', 'interested', 'deal_closed', 'pending_response'].includes(o.status)
        );
        setOutreaches(negotiationOutreaches);
        const updatedSelected = negotiationOutreaches.find(o => o.id === selectedOutreachData.id);
        setSelectedOutreach(updatedSelected || null);

      } else {
        toast.error(`Failed to send message: ${sendResult.error || 'Unknown server error'}`);
        console.error("Error sending message via Gmail API:", sendResult.error);
      }

    } catch (error: any) {
      toast.error(`Error sending message: ${error.message || 'Client-side error'}`);
      console.error("Error sending message:", error);
    }
  };

  const handleStatusChange = async (newStatus: StoredOutreach['status']) => {
    if (!selectedOutreachData) return;
    try {
      await outreachStorageService.updateOutreachStatus(selectedOutreachData.id, newStatus);
      // Re-fetch all and find the updated selected outreach
      const allOutreaches = await outreachStorageService.getAllOutreaches();
      const negotiationOutreaches = allOutreaches.filter(o =>
        ['negotiating', 'interested', 'deal_closed', 'pending_response'].includes(o.status)
      );
      setOutreaches(negotiationOutreaches);
      const updatedSelected = negotiationOutreaches.find(o => o.id === selectedOutreachData.id);
      setSelectedOutreach(updatedSelected || null);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleOfferUpdate = async () => {
    if (!selectedOutreachData || proposedOffer.trim() === '') return;
    const offerAmount = parseFloat(proposedOffer);
    if (isNaN(offerAmount)) {
      alert("Please enter a valid offer amount.");
      return;
    }
    try {
      await outreachStorageService.updateOutreachStatus(
        selectedOutreachData.id,
        selectedOutreachData.status, // Keep current status or let backend decide
        `Offer updated to ${offerAmount}`,
        offerAmount
      );
      // Re-fetch all and find the updated selected outreach
      const allOutreaches = await outreachStorageService.getAllOutreaches();
      const negotiationOutreaches = allOutreaches.filter(o =>
        ['negotiating', 'interested', 'deal_closed', 'pending_response'].includes(o.status)
      );
      setOutreaches(negotiationOutreaches);
      const updatedSelected = negotiationOutreaches.find(o => o.id === selectedOutreachData.id);
      setSelectedOutreach(updatedSelected || null);
      if (updatedSelected) {
        setProposedOffer(updatedSelected.currentOffer?.toString() || '');
      }
    } catch (error) {
      console.error("Error updating offer:", error);
    }
  };

  const getMessageSenderLabel = (sender: string) => {
    switch (sender) {
      case 'brand': return 'You';
      case 'ai': return 'AI Agent';
      case 'creator': return selectedOutreachData?.creatorName || 'Creator';
      case 'system': return 'System Log';
      default: return sender;
    }
  };

  const getMessageIcon = (type: string, sender: string) => {
    if (sender === 'ai') return '🤖';
    if (type === 'call_log') return '▶️';
    if (type === 'voice_transcript') return '🎤';
    switch (type) {
      case 'outreach': return '📧';
      case 'negotiation': return '🤝';
      case 'response': return '💬';
      case 'update': return '📝';
      default: return '💬';
    }
  };

  const getMessageBgColor = (sender: string) => {
    switch (sender) {
      case 'brand': return 'bg-blue-600 text-white';
      case 'ai': return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'system': return 'bg-gray-200 text-gray-700 border border-gray-300';
      case 'creator': return 'bg-gray-100 text-gray-900';
      default: return 'bg-gray-100 text-gray-900';
    }
  };

  // New handler for sending the strategy preview via Gmail
  const handleSendStrategyPreviewViaGmail = async () => {
    // For demonstration, using placeholders. Replace with your actual state values.
    const currentStrategyMessage = "Placeholder: Actual suggested message from preview"; // REPLACE
    const currentStrategyTactics = "Placeholder: Actual strategy tactics from preview"; // REPLACE

    if (!selectedOutreachData || !selectedOutreachData.id) {
      toast.error("No outreach selected.");
      return;
    }
    if (!currentStrategyMessage.trim()) {
      toast.error("Strategy message body is empty.");
      return;
    }
    if (!strategyEmailSubject.trim()) {
      toast.error("Email subject for strategy is required.");
      return;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session || !session.user || !session.access_token) {
      toast.error("Authentication error. Please log in again.");
      console.error("Authentication error:", sessionError);
      return;
    }
    const userId = session.user.id;
    const accessToken = session.access_token;

    try {
      const loggedMessage = await outreachStorageService.addConversationMessage(
        selectedOutreachData.id,
        currentStrategyMessage, // This is the email body
        'brand',
        'negotiation_message_gmail', // Using the same type as other negotiation Gmails
        {
          subject: strategyEmailSubject,
          gmail_send_status: 'pending_gmail_send',
          ai_reasoning: currentStrategyTactics, // Storing tactics as AI reasoning
        }
      );

      if (!loggedMessage || !loggedMessage.id) {
        toast.error("Failed to log strategy message before sending.");
        return;
      }
      const conversationMessageId = loggedMessage.id;

      const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
      const sendResponse = await fetch(`${backendUrl}/api/outreach/send-via-gmail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          outreach_id: selectedOutreachData.id,
          conversation_message_id: conversationMessageId,
          subject: strategyEmailSubject,
          body: currentStrategyMessage,
        }),
      });

      const sendResult = await sendResponse.json();

      if (sendResponse.ok && sendResult.success) {
        toast.success("Strategy sent via Gmail!");
        setStrategyEmailSubject(''); 
        
        // Refresh conversation history and outreach list
        const updatedHistory = await outreachStorageService.getConversationHistory(selectedOutreachData.id);
        setConversationHistory(updatedHistory || []);
        const allOutreaches = await outreachStorageService.getAllOutreaches();
        const negotiationOutreaches = allOutreaches.filter(o =>
          ['negotiating', 'interested', 'deal_closed', 'pending_response'].includes(o.status)
        );
        setOutreaches(negotiationOutreaches);
        const updatedSelected = negotiationOutreaches.find(o => o.id === selectedOutreachData.id);
        setSelectedOutreach(updatedSelected || null);

      } else {
        toast.error(`Failed to send strategy: ${sendResult.error || 'Unknown server error'}`);
      }
    } catch (error: any) {
      toast.error(`Error sending strategy: ${error.message || 'Client-side error'}`);
      console.error("Error sending strategy via Gmail:", error);
    }
  };

  return (
    <div className="h-full flex gap-6">
      {/* Outreaches List Sidebar */}
      <div className="w-1/3 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4">
            🤝 Active Negotiations ({filteredOutreaches.length})
          </h1>
          
          {/* Status Filter */}
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="interested">Interested</option>
            <option value="negotiating">Negotiating</option>
            <option value="deal_closed">Deal Closed</option>
          </select>
        </div>

        {/* Outreaches List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredOutreaches.map((outreach) => {
            const conversationCount = outreach.conversationHistory?.length || 0;
            return (
            <div 
                key={outreach.id}
                onClick={() => setSelectedOutreach(outreach)}
              className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all ${
                  selectedOutreach === outreach ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img
                      src={outreach.creatorAvatar}
                      alt={outreach.creatorName}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div>
                      <p className="font-medium text-gray-900 text-sm">{outreach.creatorName}</p>
                      <p className="text-xs text-gray-500">{outreach.brandName}</p>
                    </div>
                  </div>
                  <span className={getStatusBadge(outreach.status)}>
                    {outreach.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <div>
                    <p className="text-sm text-gray-600">{outreach.creatorPlatform}</p>
                  <p className="font-semibold text-gray-900">
                      {outreach.currentOffer ? `₹${outreach.currentOffer.toLocaleString()}` : 'No offer'}
                  </p>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500">
                      {formatTime(outreach.lastContact)}
                    </span>
                    {conversationCount > 1 && (
                      <div className="text-xs text-blue-600 mt-1">
                        {conversationCount} messages
                      </div>
                    )}
                  </div>
                </div>

                {/* Confidence indicator */}
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                  <div 
                    className="bg-blue-600 h-1 rounded-full" 
                    style={{ width: `${outreach.confidence}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredOutreaches.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">
              {statusFilter === 'all' ? 'No active negotiations found' : `No ${statusFilter} negotiations found`}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Generate negotiations using the AI Negotiation Agent
            </p>
          </div>
        )}
      </div>

      {/* Deal Details & Chat */}
      <div className="flex-1">
        {selectedOutreachData ? (
          <div className="bg-white rounded-lg shadow h-full flex flex-col">
            {/* Deal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <img
                    src={selectedOutreachData.creatorAvatar}
                    alt={selectedOutreachData.creatorName}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {selectedOutreachData.creatorName}
                    </h2>
                    <p className="text-gray-600">{selectedOutreachData.brandName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={getStatusBadge(selectedOutreachData.status)}>
                        {selectedOutreachData.status.replace('_', ' ')}
                      </span>
                      <p className="text-lg font-semibold text-gray-900">
                        {selectedOutreachData.currentOffer ? `₹${selectedOutreachData.currentOffer.toLocaleString()}` : 'No offer'}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Quick Actions */}
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleStatusChange('negotiating')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    🤝 Negotiate
                  </button>
                  <button 
                    onClick={() => handleStatusChange('deal_closed')}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    ✅ Close Deal
                  </button>
                </div>
              </div>
            </div>

            {/* Messages/Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="space-y-4">
                {/* Campaign Context */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">📋 Campaign Context</h3>
                  <p className="text-blue-800 text-sm">{selectedOutreachData.campaignContext}</p>
                </div>

                {/* Conversation History */}
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">💬 Conversation History</h3>
                  {conversationHistory.length > 0 ? (
                    <div className="space-y-4">
                      {conversationHistory.map((message) => (
                  <div 
                    key={message.id}
                    className={`flex ${message.sender === 'brand' ? 'justify-end' : 'justify-start'}`}
                  >
                          <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${getMessageBgColor(message.sender)}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">
                                {getMessageIcon(message.type, message.sender)}
                        </span>
                        <span className="text-xs opacity-75">
                                {getMessageSenderLabel(message.sender)}
                              </span>
                      </div>
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            
                            {message.type === 'voice_transcript' && message.metadata?.call_sid && (
                                <p className="text-xs opacity-60 mt-1">From call: {message.metadata.call_sid.substring(0,10)}...</p>
                            )}
                            
                            {message.type === 'negotiation' && (
                        <div className="mt-2 text-xs opacity-75">
                                {message.metadata.suggestedOffer && (
                                  <p>💰 Suggested: ₹{message.metadata.suggestedOffer.toLocaleString()}</p>
                                )}
                                {message.metadata.strategy && (
                                  <p>🎯 Phase: {message.metadata.strategy.replace('_', ' ')}</p>
                          )}
                        </div>
                      )}

                      {/* AI Method & Strategy (Only for AI negotiation messages) */}
                      {message.type === 'negotiation' && (
                        <>
                          {message.metadata.suggestedOffer && (
                            <p className="mt-2 text-xs opacity-75">💰 Suggested: ₹{message.metadata.suggestedOffer.toLocaleString()}</p>
                          )}
                          {message.metadata.strategy && (
                            <p className="mt-1 text-xs opacity-75">🎯 Strategy: {message.metadata.strategy.replace('_', ' ')}</p>
                          )}
                          {message.metadata.aiMethod && (
                            <div className="mt-1 text-xs text-purple-600">
                              <span>(Method: {message.metadata.aiMethod === 'ai_generated' ? 'AI Generated' : 'Algorithmic'})</span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Displaying Voice Call Summary Artifacts */}
                      {message.type === 'voice_call_summary' && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-md border border-gray-200">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Call Recording:</p>
                          <audio controls src={message.metadata.full_recording_url} className="w-full h-8">
                            Your browser does not support the audio element.
                          </audio>
                          <p className="text-xs text-gray-500 mt-1">
                            Duration: {message.metadata.full_recording_duration}
                          </p>
                          {message.metadata.human_readable_summary && (
                            <div className="mt-1">
                              <p className="text-xs font-semibold text-gray-700 mb-0.5">AI Summary:</p>
                              <p className="text-xs text-gray-600 whitespace-pre-wrap">
                                {message.metadata.human_readable_summary}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Displaying Voice Transcript Turns */}
                      {message.type === 'voice_transcript' && message.metadata?.turns && message.metadata.turns.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500">
                          <span>Turns: {message.metadata.turns.length}</span>
                        </div>
                      )}

                      <p className="text-xs opacity-50 mt-1">
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">💬</span>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No conversation history</h3>
                      <p className="text-gray-500 text-sm">Messages will appear here as the conversation develops</p>
                    </div>
                  )}
                </div>

                {/* Key Points */}
                {selectedOutreachData.keyPoints.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">🎯 Key Points</h3>
                    <ul className="space-y-2">
                      {selectedOutreachData.keyPoints.map((point, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-blue-600">•</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next Steps */}
                {selectedOutreachData.nextSteps.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">🚀 Next Steps</h3>
                    <ul className="space-y-2">
                      {selectedOutreachData.nextSteps.map((step, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="text-green-600">→</span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Message Input */}
            <div className="p-6 border-t border-gray-200">
              {/* Quick Responses */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <button 
                  onClick={() => handleSendMessage()}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  👍 Reviewing
                </button>
                <button 
                  onClick={() => handleSendMessage()}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  📞 Schedule Call
                </button>
                <button 
                  onClick={() => handleSendMessage()}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  🔍 More Info
                </button>
                <button 
                  onClick={() => handleSendMessage()}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  🎉 Move Forward
                </button>
              </div>

              {/* Message Input */}
              <div className="flex gap-2">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message or negotiation update..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                />
                <button 
                  onClick={() => handleSendMessage()}
                  disabled={!newMessage.trim() || !newSubject.trim()}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
              <div className="mt-2">
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="Email Subject"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 Press Enter in message to send, Shift+Enter for new line. Gmail will be used for sending.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Negotiation</h3>
              <p className="text-gray-500">Choose a deal from the list to view messages and details</p>
              <div className="mt-4">
                <a
                  href="/agentic-ai"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🤖 Use AI Negotiation Agent
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 