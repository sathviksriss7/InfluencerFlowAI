import { useState, useMemo } from 'react';
import { mockDeals } from '../mock-data/deals';
import { mockCreators } from '../mock-data/creators';
import { mockCampaigns } from '../mock-data/campaigns';

export default function Negotiations() {
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [newMessage, setNewMessage] = useState('');

  // Filter deals based on status
  const filteredDeals = useMemo(() => {
    if (statusFilter === 'all') return mockDeals;
    return mockDeals.filter(deal => deal.status === statusFilter);
  }, [statusFilter]);

  // Get deal details with creator and campaign info
  const enrichedDeals = filteredDeals.map(deal => {
    const creator = mockCreators.find(c => c.id === deal.creatorId);
    const campaign = mockCampaigns.find(c => c.id === deal.campaignId);
    return { ...deal, creator, campaign };
  });

  const selectedDealData = selectedDeal 
    ? enrichedDeals.find(d => d.id === selectedDeal) 
    : null;

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'negotiating':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'agreed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'contract_sent':
        return `${baseClasses} bg-purple-100 text-purple-800`;
      case 'signed':
        return `${baseClasses} bg-indigo-100 text-indigo-800`;
      case 'completed':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case 'cancelled':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'proposal':
        return '💼';
      case 'counter_offer':
        return '🔄';
      case 'agreement':
        return '✅';
      case 'contract':
        return '📄';
      default:
        return '💬';
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
    if (!newMessage.trim()) return;
    // In a real app, this would send the message to the API
    console.log('Sending message:', newMessage);
    setNewMessage('');
  };

  const sendQuickResponse = (response: string) => {
    console.log('Sending quick response:', response);
  };

  return (
    <div className="h-full flex gap-6">
      {/* Deals List Sidebar */}
      <div className="w-1/3 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Negotiations</h1>
          
          {/* Status Filter */}
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="negotiating">Negotiating</option>
            <option value="agreed">Agreed</option>
            <option value="contract_sent">Contract Sent</option>
          </select>
        </div>

        {/* Deals List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {enrichedDeals.map((deal) => (
            <div 
              key={deal.id}
              onClick={() => setSelectedDeal(deal.id)}
              className={`bg-white rounded-lg shadow p-4 cursor-pointer transition-all ${
                selectedDeal === deal.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <img
                    src={deal.creator?.avatar}
                    alt={deal.creator?.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{deal.creator?.name}</p>
                    <p className="text-xs text-gray-500">{deal.campaign?.title}</p>
                  </div>
                </div>
                <span className={getStatusBadge(deal.status)}>
                  {deal.status.replace('_', ' ')}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-sm">
                <div>
                  <p className="text-sm text-gray-600">{deal.creator?.name}</p>
                  <p className="font-semibold text-gray-900">
                    ₹{deal.proposedRate.toLocaleString()}
                  </p>
                </div>
                <span className="text-gray-500">
                  {formatTime(deal.updatedAt)}
                </span>
              </div>

              {/* Unread indicator */}
              {deal.messages.some(m => !m.read && m.sender !== 'brand') && (
                <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
              )}
            </div>
          ))}
        </div>

        {enrichedDeals.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No negotiations found</p>
          </div>
        )}
      </div>

      {/* Deal Details & Chat */}
      <div className="flex-1">
        {selectedDealData ? (
          <div className="bg-white rounded-lg shadow h-full flex flex-col">
            {/* Deal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <img
                    src={selectedDealData.creator?.avatar}
                    alt={selectedDealData.creator?.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {selectedDealData.creator?.name}
                    </h2>
                    <p className="text-gray-600">{selectedDealData.campaign?.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={getStatusBadge(selectedDealData.status)}>
                        {selectedDealData.status.replace('_', ' ')}
                      </span>
                      <p className="text-lg font-semibold text-gray-900">
                        Proposed: ₹{selectedDealData.proposedRate.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Quick Actions */}
                <div className="flex gap-2">
                  <button className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm">
                    Accept Deal
                  </button>
                  <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                    Send Contract
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="space-y-4">
                {selectedDealData.messages.map((message) => (
                  <div 
                    key={message.id}
                    className={`flex ${message.sender === 'brand' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                      message.sender === 'brand'
                        ? 'bg-blue-600 text-white'
                        : message.sender === 'ai'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-gray-100 text-gray-900'
                    }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">
                          {getMessageIcon(message.type)}
                        </span>
                        <span className="text-xs opacity-75">
                          {message.sender === 'ai' ? 'AI Assistant' : 
                           message.sender === 'brand' ? 'You' : selectedDealData.creator?.name}
                        </span>
                      </div>
                      <p className="text-sm">{message.content}</p>
                      {message.metadata && (
                        <div className="mt-2 text-xs opacity-75">
                          {message.metadata.proposedRate && (
                            <p>Proposed Rate: ₹{message.metadata.proposedRate.toLocaleString()}</p>
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
            </div>

            {/* Message Input */}
            <div className="p-6 border-t border-gray-200">
              {/* Quick Responses */}
              <div className="flex gap-2 mb-4">
                <button 
                  onClick={() => sendQuickResponse('Thanks for your interest! Let me review the proposal.')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  👍 Reviewing
                </button>
                <button 
                  onClick={() => sendQuickResponse('Can we schedule a call to discuss details?')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  📞 Schedule Call
                </button>
                <button 
                  onClick={() => sendQuickResponse('Could you provide more details about your previous work?')}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                >
                  🔍 More Info
                </button>
              </div>

              {/* Message Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button 
                  onClick={handleSendMessage}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Send
                </button>
              </div>
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 