import React, { useState } from 'react';
import { aiOutreachService, type BrandInfo, type OutreachEmail, type AIOutreachResponse } from '../services/ai-outreach';
import { outreachStorage, type StoredOutreach } from '../services/outreach-storage';
import { type Creator } from '../types';

interface OutreachManagerProps {
  searchResults: Creator[];
  onClose: () => void;
}

interface CreatorOutreachStatus {
  creatorId: string;
  status: 'pending' | 'contacted' | 'interested' | 'negotiating' | 'deal_closed' | 'declined';
  emails: OutreachEmail[];
  lastContact: Date;
  nextFollowUp?: Date;
  currentOffer?: number;
  creatorCounterOffer?: number;
  notes: string;
}

export default function AIOutreachManager({ searchResults, onClose }: OutreachManagerProps) {
  const [selectedCreators, setSelectedCreators] = useState<Creator[]>([]);
  const [brandInfo, setBrandInfo] = useState<BrandInfo>(aiOutreachService.getExampleBrandInfo());
  const [campaignContext, setCampaignContext] = useState('');
  const [outreachStatuses, setOutreachStatuses] = useState<Map<string, CreatorOutreachStatus>>(new Map());
  const [activeTab, setActiveTab] = useState<'setup' | 'outreach' | 'tracking'>('setup');
  const [isGeneratingEmails, setIsGeneratingEmails] = useState(false);
  const [generatedEmails, setGeneratedEmails] = useState<Map<string, AIOutreachResponse>>(new Map());

  // Progress tracking
  const [setupComplete, setSetupComplete] = useState(false);
  const [emailsGenerated, setEmailsGenerated] = useState(false);

  // Check setup completion
  const checkSetupCompletion = () => {
    const isComplete = 
      brandInfo.name.length > 0 && 
      brandInfo.industry.length > 0 && 
      brandInfo.budget.min > 0 && 
      brandInfo.budget.max > 0 && 
      campaignContext.length > 10 && 
      selectedCreators.length > 0;
    
    setSetupComplete(isComplete);
    return isComplete;
  };

  // Auto-check setup completion when relevant fields change
  React.useEffect(() => {
    checkSetupCompletion();
  }, [brandInfo, campaignContext, selectedCreators]);

  // Auto-check email generation status
  React.useEffect(() => {
    setEmailsGenerated(generatedEmails.size > 0);
  }, [generatedEmails]);

  // Smart tab navigation
  const handleTabSwitch = (tab: 'setup' | 'outreach' | 'tracking') => {
    if (tab === 'outreach' && !setupComplete) {
      alert('Please complete the campaign setup first!');
      return;
    }
    if (tab === 'tracking' && !emailsGenerated) {
      alert('Generate some emails first to start tracking!');
      return;
    }
    setActiveTab(tab);
  };

  // Auto-advance workflow (currently unused but kept for future use)
  // const advanceWorkflow = () => {
  //   if (activeTab === 'setup' && setupComplete) {
  //     setActiveTab('outreach');
  //   } else if (activeTab === 'outreach' && emailsGenerated) {
  //     setActiveTab('tracking');
  //   }
  // };

  // Toggle creator selection
  const toggleCreatorSelection = (creator: Creator) => {
    setSelectedCreators(prev => {
      const isSelected = prev.some(c => c.id === creator.id);
      if (isSelected) {
        return prev.filter(c => c.id !== creator.id);
      } else {
        return [...prev, creator];
      }
    });
  };

  // Generate outreach emails for selected creators
  const generateOutreachEmails = async () => {
    if (selectedCreators.length === 0) return;
    
    setIsGeneratingEmails(true);
    const newEmails = new Map<string, AIOutreachResponse>();
    
    try {
      for (const creator of selectedCreators) {
        console.log(`🚀 Generating outreach email for ${creator.name}...`);
        
        const response = await aiOutreachService.generateInitialOutreach(
          creator,
          brandInfo,
          campaignContext
        );
        
        newEmails.set(creator.id, response);
        
        // Initialize outreach status for local state
        const status: CreatorOutreachStatus = {
          creatorId: creator.id,
          status: 'pending',
          emails: [response.email],
          lastContact: new Date(),
          notes: `AI-generated outreach email with ${(response.confidence * 100).toFixed(0)}% confidence`
        };
        
        setOutreachStatuses(prev => new Map(prev.set(creator.id, status)));

        // ✨ NEW: Save to persistent storage
        const storedOutreach: StoredOutreach = {
          id: response.email.id,
          creatorId: creator.id,
          creatorName: creator.name,
          creatorAvatar: creator.avatar,
          creatorPlatform: creator.platform,
          subject: response.email.subject,
          body: response.email.body,
          status: 'pending',
          confidence: response.confidence,
          reasoning: response.reasoning,
          keyPoints: response.keyPoints,
          nextSteps: response.nextSteps,
          brandName: brandInfo.name,
          campaignContext: campaignContext,
          createdAt: new Date(),
          lastContact: new Date(),
          conversationHistory: [],
          notes: `AI-generated outreach email with ${(response.confidence * 100).toFixed(0)}% confidence`
        };

        // Save to localStorage
        outreachStorage.saveOutreach(storedOutreach);
      }
      
      setGeneratedEmails(newEmails);
      setActiveTab('outreach');
      
    } catch (error) {
      console.error('Error generating outreach emails:', error);
    } finally {
      setIsGeneratingEmails(false);
    }
  };

  // Generate negotiation email (currently unused but kept for future use)
  // const generateNegotiationEmail = async (creator: Creator, negotiationContext: NegotiationContext) => {
  //   try {
  //     const response = await aiOutreachService.generateNegotiationEmail(creator, brandInfo, negotiationContext);
  //     
  //     // Update outreach status
  //     setOutreachStatuses(prev => {
  //       const current = prev.get(creator.id);
  //       if (current) {
  //         const updated = {
  //           ...current,
  //           emails: [...current.emails, response.email],
  //           status: 'negotiating' as const,
  //           lastContact: new Date(),
  //           currentOffer: negotiationContext.currentOffer,
  //           creatorCounterOffer: negotiationContext.creatorAskingPrice
  //         };
  //         return new Map(prev.set(creator.id, updated));
  //       }
  //       return prev;
  //     });
  //     
  //     return response;
  //   } catch (error) {
  //     console.error('Error generating negotiation email:', error);
  //     return null;
  //   }
  // };

  // Generate follow-up email
  const generateFollowUpEmail = async (creator: Creator) => {
    try {
      const status = outreachStatuses.get(creator.id);
      const daysSinceContact = status 
        ? Math.floor((Date.now() - status.lastContact.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      const lastEmailType = status?.emails[status.emails.length - 1]?.type || 'initial_outreach';
      
      const response = await aiOutreachService.generateFollowUpEmail(
        creator,
        brandInfo,
        daysSinceContact,
        lastEmailType
      );
      
      // Update status
      if (status) {
        const updated = {
          ...status,
          emails: [...status.emails, response.email],
          lastContact: new Date()
        };
        setOutreachStatuses(prev => new Map(prev.set(creator.id, updated)));
      }
      
      return response;
    } catch (error) {
      console.error('Error generating follow-up email:', error);
      return null;
    }
  };

  // Copy to clipboard functionality
  const copyToClipboard = async (text: string, type: string = 'content') => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${type} copied to clipboard!`);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert(`${type} copied to clipboard!`);
    }
  };

  // Export all emails as text/CSV
  const exportEmails = () => {
    const emailData = Array.from(generatedEmails.entries()).map(([creatorId, emailResponse]) => {
      const creator = selectedCreators.find(c => c.id === creatorId);
      const mockEmail = creator ? `${creator.username.replace('@', '')}@${creator.platform.toLowerCase()}.com` : 'unknown@example.com';
      
      return {
        creatorName: creator?.name || 'Unknown',
        creatorEmail: mockEmail,
        platform: creator?.platform || 'Unknown',
        followers: creator?.metrics.followers || 0,
        subject: emailResponse.email.subject,
        body: emailResponse.email.body,
        confidence: `${(emailResponse.confidence * 100).toFixed(0)}%`,
        reasoning: emailResponse.reasoning,
        keyPoints: emailResponse.keyPoints.join('; '),
        nextSteps: emailResponse.nextSteps.join('; ')
      };
    });

    // Create CSV content
    const csvHeaders = [
      'Creator Name', 'Email', 'Platform', 'Followers', 'Subject', 'Body', 
      'AI Confidence', 'Reasoning', 'Key Points', 'Next Steps'
    ];
    
    const csvContent = [
      csvHeaders.join(','),
      ...emailData.map(row => [
        `"${row.creatorName}"`,
        `"${row.creatorEmail}"`,
        `"${row.platform}"`,
        row.followers,
        `"${row.subject.replace(/"/g, '""')}"`,
        `"${row.body.replace(/"/g, '""')}"`,
        `"${row.confidence}"`,
        `"${row.reasoning.replace(/"/g, '""')}"`,
        `"${row.keyPoints.replace(/"/g, '""')}"`,
        `"${row.nextSteps.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    // Download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `outreach-emails-${brandInfo.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Simulate email sending
  const sendEmail = async (emailResponse: AIOutreachResponse, creator: Creator) => {
    const confirmSend = window.confirm(`Send email to ${creator.name}?\n\nSubject: ${emailResponse.email.subject}`);
    
    if (!confirmSend) return;

    // Simulate API call
    try {
      // Mock sending delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Update local outreach status
      setOutreachStatuses(prev => {
        const current = prev.get(creator.id);
        if (current) {
          const updated = {
            ...current,
            status: 'contacted' as const,
            lastContact: new Date(),
            notes: `${current.notes}\n\n📧 Email sent: ${new Date().toLocaleString()}`
          };
          return new Map(prev.set(creator.id, updated));
        }
        return prev;
      });

      // ✨ NEW: Update persistent storage
      outreachStorage.updateOutreachStatus(
        emailResponse.email.id,
        'contacted',
        `Email sent: ${new Date().toLocaleString()}`
      );

      alert(`✅ Email sent successfully to ${creator.name}!`);
    } catch (error) {
      alert(`❌ Failed to send email to ${creator.name}. Please try again.`);
    }
  };

  // Bulk actions
  const sendAllEmails = async () => {
    const confirmBulkSend = window.confirm(`Send ${generatedEmails.size} emails to all selected creators?`);
    if (!confirmBulkSend) return;

    let successCount = 0;
    const total = generatedEmails.size;

    for (const [creatorId, emailResponse] of generatedEmails.entries()) {
      const creator = selectedCreators.find(c => c.id === creatorId);
      if (creator) {
        try {
          await new Promise(resolve => setTimeout(resolve, 500)); // Stagger sends
          await sendEmail(emailResponse, creator);
          successCount++;
        } catch (error) {
          console.error(`Failed to send to ${creator.name}:`, error);
        }
      }
    }

    alert(`📧 Bulk send complete! ${successCount}/${total} emails sent successfully.`);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            AI Outreach Manager
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          {[
            { 
              id: 'setup', 
              label: 'Campaign Setup', 
              icon: '⚙️',
              completed: setupComplete,
              accessible: true
            },
            { 
              id: 'outreach', 
              label: 'Email Generation', 
              icon: '📧',
              completed: emailsGenerated,
              accessible: setupComplete
            },
            { 
              id: 'tracking', 
              label: 'Outreach Tracking', 
              icon: '📊',
              completed: outreachStatuses.size > 0,
              accessible: emailsGenerated
            }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id as any)}
              disabled={!tab.accessible}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'border-b-2 border-purple-600 text-purple-600 bg-purple-50'
                  : tab.accessible
                    ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    : 'text-gray-400 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2">
                {tab.icon} {tab.label}
                {/* Progress Indicators */}
                {tab.completed && (
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                )}
                {!tab.accessible && (
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                )}
              </div>
              
              {/* Step Number */}
              <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs flex items-center justify-center ${
                tab.completed 
                  ? 'bg-green-500 text-white' 
                  : tab.accessible 
                    ? 'bg-purple-100 text-purple-600' 
                    : 'bg-gray-200 text-gray-400'
              }`}>
                {tab.id === 'setup' ? '1' : tab.id === 'outreach' ? '2' : '3'}
              </div>
            </button>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="bg-gray-100 h-1">
          <div 
            className="bg-gradient-to-r from-purple-600 to-blue-600 h-1 transition-all duration-500"
            style={{
              width: activeTab === 'setup' ? '33%' : activeTab === 'outreach' ? '66%' : '100%'
            }}
          ></div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'setup' && (
            <div className="space-y-6">
              {/* Brand Information */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Brand Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                    <input
                      type="text"
                      value={brandInfo.name}
                      onChange={(e) => setBrandInfo({...brandInfo, name: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                    <input
                      type="text"
                      value={brandInfo.industry}
                      onChange={(e) => setBrandInfo({...brandInfo, industry: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Budget Range (₹)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={brandInfo.budget.min}
                        onChange={(e) => setBrandInfo({
                          ...brandInfo, 
                          budget: {...brandInfo.budget, min: Number(e.target.value)}
                        })}
                        className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={brandInfo.budget.max}
                        onChange={(e) => setBrandInfo({
                          ...brandInfo, 
                          budget: {...brandInfo.budget, max: Number(e.target.value)}
                        })}
                        className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Timeline</label>
                    <input
                      type="text"
                      value={brandInfo.timeline}
                      onChange={(e) => setBrandInfo({...brandInfo, timeline: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Context</label>
                  <textarea
                    value={campaignContext}
                    onChange={(e) => setCampaignContext(e.target.value)}
                    placeholder="Describe your campaign objectives, target audience, key messages, and any special requirements..."
                    rows={4}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Creator Selection */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Select Creators ({selectedCreators.length} selected)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                  {searchResults.map(creator => {
                    const isSelected = selectedCreators.some(c => c.id === creator.id);
                    return (
                      <div
                        key={creator.id}
                        onClick={() => toggleCreatorSelection(creator)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-50 shadow-md' 
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={creator.avatar}
                            alt={creator.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{creator.name}</h4>
                            <p className="text-sm text-gray-600">{creator.platform}</p>
                            <p className="text-sm text-purple-600">₹{creator.rates.post.toLocaleString()}</p>
                          </div>
                          {isSelected && (
                            <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedCreators.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={generateOutreachEmails}
                      disabled={isGeneratingEmails}
                      className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isGeneratingEmails ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Generating Emails...
                        </>
                      ) : (
                        <>
                          🤖 Generate AI Outreach Emails
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'outreach' && (
            <div className="space-y-6">
              {generatedEmails.size > 0 ? (
                <>
                  {/* Bulk Actions Header */}
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          📧 Generated {generatedEmails.size} AI-Powered Outreach Emails
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Review, customize, and send your personalized creator outreach emails
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={exportEmails}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                          </svg>
                          Export CSV
                        </button>
                        <button
                          onClick={sendAllEmails}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/>
                          </svg>
                          Send All ({generatedEmails.size})
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Individual Email Cards */}
                  {Array.from(generatedEmails.entries()).map(([creatorId, emailResponse]) => {
                    const creator = selectedCreators.find(c => c.id === creatorId);
                    if (!creator) return null;

                    const outreachStatus = outreachStatuses.get(creatorId);
                    const emailSent = outreachStatus?.status === 'contacted';

                    return (
                      <div key={creatorId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        {/* Creator Header */}
                        <div className={`text-white p-4 ${emailSent ? 'bg-green-600' : 'bg-gradient-to-r from-purple-600 to-blue-600'}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <img
                                src={creator.avatar}
                                alt={creator.name}
                                className="w-10 h-10 rounded-full"
                              />
                              <div>
                                <h3 className="font-semibold">{creator.name}</h3>
                                <p className={`text-sm ${emailSent ? 'text-green-100' : 'text-purple-100'}`}>
                                  {creator.platform} • {creator.metrics.followers.toLocaleString()} followers
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className={`text-sm ${emailSent ? 'text-green-100' : 'text-purple-100'}`}>
                                  {emailSent ? 'Email Sent ✅' : 'AI Confidence'}
                                </p>
                                <p className="text-white font-semibold">
                                  {emailSent ? outreachStatus?.lastContact.toLocaleDateString() : `${(emailResponse.confidence * 100).toFixed(0)}%`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Email Content */}
                        <div className="p-6">
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                              <p className="font-medium text-gray-900">{emailResponse.email.subject}</p>
                            </div>
                          </div>

                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email Body</label>
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                              <pre className="whitespace-pre-wrap font-sans text-gray-800">{emailResponse.email.body}</pre>
                            </div>
                          </div>

                          {/* AI Analysis */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">AI Reasoning</label>
                              <p className="text-sm text-gray-600 p-3 bg-blue-50 rounded-lg">{emailResponse.reasoning}</p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Key Points</label>
                              <ul className="text-sm text-gray-600 space-y-1">
                                {emailResponse.keyPoints.map((point, index) => (
                                  <li key={index} className="flex items-start gap-2">
                                    <span className="text-purple-600 mt-1">•</span>
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-3 pt-4 border-t border-gray-200">
                            {!emailSent ? (
                              <button 
                                onClick={() => sendEmail(emailResponse, creator)}
                                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/>
                                </svg>
                                Send Email
                              </button>
                            ) : (
                              <div className="flex-1 px-4 py-2 bg-green-100 text-green-800 rounded-lg flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
                                </svg>
                                Email Sent Successfully
                              </div>
                            )}
                            
                            <button 
                              onClick={() => copyToClipboard(emailResponse.email.body, 'Email body')}
                              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
                              </svg>
                              Copy
                            </button>
                            
                            <button 
                              onClick={() => copyToClipboard(`Subject: ${emailResponse.email.subject}\n\n${emailResponse.email.body}`, 'Complete email')}
                              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M3,8L7.89,5.26A2,2 0 0,1 9.11,5.26L21,8M5,19H14A2,2 0 0,0 16,17V10L9,13.5L2,10V17A2,2 0 0,0 4,19H5Z"/>
                              </svg>
                              Copy Full
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Emails Generated Yet</h3>
                  <p className="text-gray-600 mb-4">Complete the campaign setup and select creators to generate AI-powered outreach emails.</p>
                  <button
                    onClick={() => setActiveTab('setup')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Go to Setup
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="space-y-6">
              {outreachStatuses.size > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {Array.from(outreachStatuses.entries()).map(([creatorId, status]) => {
                    const creator = selectedCreators.find(c => c.id === creatorId);
                    if (!creator) return null;

                    const statusColors = {
                      pending: 'bg-yellow-100 text-yellow-800',
                      contacted: 'bg-blue-100 text-blue-800',
                      interested: 'bg-green-100 text-green-800',
                      negotiating: 'bg-orange-100 text-orange-800',
                      deal_closed: 'bg-purple-100 text-purple-800',
                      declined: 'bg-red-100 text-red-800'
                    };

                    return (
                      <div key={creatorId} className="bg-white border border-gray-200 rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={creator.avatar}
                              alt={creator.name}
                              className="w-12 h-12 rounded-full"
                            />
                            <div>
                              <h3 className="font-semibold text-gray-900">{creator.name}</h3>
                              <p className="text-sm text-gray-600">{creator.platform}</p>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[status.status]}`}>
                            {status.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Emails Sent:</span>
                            <span className="font-medium">{status.emails.length}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Last Contact:</span>
                            <span className="font-medium">{status.lastContact.toLocaleDateString()}</span>
                          </div>
                          {status.currentOffer && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Current Offer:</span>
                              <span className="font-medium">₹{status.currentOffer.toLocaleString()}</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex gap-2">
                            <button
                              onClick={() => generateFollowUpEmail(creator)}
                              className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              📧 Follow Up
                            </button>
                            <button className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors">
                              💬 Negotiate
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Outreach Activity Yet</h3>
                  <p className="text-gray-600">Generate some emails first to start tracking your outreach progress.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 