import { useState, useMemo, useEffect } from 'react';
import { outreachStorage, type StoredOutreach } from '../services/outreach-storage';

export default function Negotiations() {
  const [selectedOutreach, setSelectedOutreach] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [newMessage, setNewMessage] = useState('');
  const [outreaches, setOutreaches] = useState<StoredOutreach[]>([]);

  // Load outreach data
  useEffect(() => {
    const loadOutreaches = () => {
      const allOutreaches = outreachStorage.getAllOutreaches();
      // Filter to show only outreaches with positive responses
      const negotiationOutreaches = allOutreaches.filter(outreach => 
        ['interested', 'negotiating', 'deal_closed'].includes(outreach.status)
      );
      setOutreaches(negotiationOutreaches);
    };
    
    loadOutreaches();
    // Refresh every 10 seconds to pick up changes from negotiation agent
    const interval = setInterval(loadOutreaches, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter outreaches based on status
  const filteredOutreaches = useMemo(() => {
    if (statusFilter === 'all') return outreaches;
    return outreaches.filter(outreach => outreach.status === statusFilter);
  }, [outreaches, statusFilter]);

  const selectedOutreachData = selectedOutreach 
    ? filteredOutreaches.find(o => o.id === selectedOutreach) 
    : null;

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

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedOutreachData) return;
    
    // Add the message to conversation history
    outreachStorage.addConversationMessage(
      selectedOutreachData.id,
      newMessage,
      'brand',
      'update'
    );
    
    // Refresh the data
    const updatedOutreaches = outreachStorage.getAllOutreaches().filter(outreach => 
      ['interested', 'negotiating', 'deal_closed'].includes(outreach.status)
    );
    setOutreaches(updatedOutreaches);
    
    setNewMessage('');
  };

  const sendQuickResponse = (response: string) => {
    if (!selectedOutreachData) return;
    
    // Add the quick response to conversation history
    outreachStorage.addConversationMessage(
      selectedOutreachData.id,
      response,
      'brand',
      'response'
    );
    
    // Refresh the data
    const updatedOutreaches = outreachStorage.getAllOutreaches().filter(outreach => 
      ['interested', 'negotiating', 'deal_closed'].includes(outreach.status)
    );
    setOutreaches(updatedOutreaches);
  };

  const updateDealStatus = (newStatus: 'interested' | 'negotiating' | 'deal_closed') => {
    if (!selectedOutreachData) return;
    
    outreachStorage.updateOutreachStatus(
      selectedOutreachData.id,
      newStatus,
      `Status updated to ${newStatus}`,
      selectedOutreachData.currentOffer
    );
    
    // Refresh the data
    const updatedOutreaches = outreachStorage.getAllOutreaches().filter(outreach => 
      ['interested', 'negotiating', 'deal_closed'].includes(outreach.status)
    );
    setOutreaches(updatedOutreaches);
  };

  const getMessageSenderLabel = (sender: string) => {
    switch (sender) {
      case 'brand': return 'You';
      case 'ai': return 'AI Assistant';
      case 'creator': return selectedOutreachData?.creatorName || 'Creator';
      default: return sender;
    }
  };

  const getMessageIcon = (type: string, sender: string) => {
    if (sender === 'ai') return '🤖';
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
      case 'creator': return 'bg-gray-100 text-gray-900';
      default: return 'bg-gray-100 text-gray-900';
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
                onClick={() => setSelectedOutreach(outreach.id)}
                className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all ${
                  selectedOutreach === outreach.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
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
                    onClick={() => updateDealStatus('negotiating')}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    🤝 Negotiate
                  </button>
                  <button 
                    onClick={() => updateDealStatus('deal_closed')}
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
                  {selectedOutreachData.conversationHistory && selectedOutreachData.conversationHistory.length > 0 ? (
                    <div className="space-y-4">
                      {selectedOutreachData.conversationHistory.map((message) => (
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
                              {message.metadata?.aiMethod && (
                                <span className="text-xs bg-black bg-opacity-10 px-1 rounded">
                                  {message.metadata.aiMethod === 'ai_generated' ? 'AI' : 'Algo'}
                                </span>
                              )}
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            {message.metadata && (
                              <div className="mt-2 text-xs opacity-75">
                                {message.metadata.suggestedOffer && (
                                  <p>💰 Suggested: ₹{message.metadata.suggestedOffer.toLocaleString()}</p>
                                )}
                                {message.metadata.strategy && (
                                  <p>🎯 Phase: {message.metadata.strategy.replace('_', ' ')}</p>
                                )}
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
                  onClick={() => sendQuickResponse('Thanks for your interest! Let me review the proposal and get back to you.')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  👍 Reviewing
                </button>
                <button 
                  onClick={() => sendQuickResponse('Can we schedule a quick 15-minute call to discuss details?')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  📞 Schedule Call
                </button>
                <button 
                  onClick={() => sendQuickResponse('Could you provide more details about your previous brand collaborations?')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  🔍 More Info
                </button>
                <button 
                  onClick={() => sendQuickResponse('We\'re excited to move forward! Let\'s finalize the terms.')}
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
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                💡 Press Enter to send, Shift+Enter for new line. Use AI Negotiation Agent for strategic assistance.
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