import React, { useState, useEffect } from 'react';
import { aiOutreachService, type BrandInfo, type OutreachEmail, type AIOutreachResponse } from '../services/ai-outreach';
import { outreachStorageService, type StoredOutreach, type NewOutreachData } from '../services/outreach-storage';
import { type Creator } from '../types';
import { toast } from 'react-toastify';

interface OutreachManagerProps {
  searchResults: Creator[];
  onClose: () => void;
  campaignId: string;
  existingOutreachIdToUpdate?: string;
  initialBrandName?: string;
  initialBrandIndustry?: string;
  initialCampaignBrief?: string;
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

export default function AIOutreachManager({ searchResults, onClose, campaignId, existingOutreachIdToUpdate, initialBrandName, initialBrandIndustry, initialCampaignBrief }: OutreachManagerProps) {
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

  // Pre-fill brand info and campaign context from props
  useEffect(() => {
    setBrandInfo(prevBrandInfo => ({
      ...prevBrandInfo,
      name: initialBrandName ?? prevBrandInfo.name,
      industry: initialBrandIndustry !== undefined ? initialBrandIndustry : '',
    }));
    if (initialCampaignBrief) {
      setCampaignContext(initialCampaignBrief);
    }
    // If not provided, they will keep their initial/example values or be empty
  }, [initialBrandName, initialBrandIndustry, initialCampaignBrief]);

  // If existingOutreachIdToUpdate is provided, pre-select the single creator from searchResults
  useEffect(() => {
    if (existingOutreachIdToUpdate && searchResults.length === 1) {
      setSelectedCreators([searchResults[0]]);
      // Optionally, if brand/campaign context should also come from the existing outreach record, fetch it here.
      // For now, assuming user will fill/confirm BrandInfo and CampaignContext in the UI.
      // We can also skip to the 'outreach' tab if setup is minimal for single update.
      // setActiveTab('outreach'); // Potentially skip setup if context is pre-filled
    } else {
      // Reset if props change and it's no longer an update flow for a single creator
      setSelectedCreators([]);
    }
  }, [existingOutreachIdToUpdate, searchResults]);

  // Check setup completion
  const checkSetupCompletion = () => {
    const isComplete = 
      brandInfo.name.length > 0 && 
      brandInfo.industry.length > 0 && 
      brandInfo.budget.min >= 0 && // Allow 0 for budget min/max
      brandInfo.budget.max >= 0 && 
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
      toast.warn('Please complete the campaign setup first!');
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
    // Disable selection changes if we are in an update flow for a specific outreach
    if (existingOutreachIdToUpdate) {
      toast.info("Outreach is for a specific pre-selected creator.");
      return;
    }
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
    if (selectedCreators.length === 0) {
      toast.error("No creators selected for outreach.");
      return;
    }
    
    setIsGeneratingEmails(true);
    const newEmailsMap = new Map<string, AIOutreachResponse>(); // Keep generated emails for display before save/update
    let allSuccessful = true;

    try {
      for (const creator of selectedCreators) {
        console.log(`🚀 Generating outreach email for ${creator.name}...`);
        
        const response = await aiOutreachService.generateInitialOutreach(
          creator,
          brandInfo,
          campaignContext
        );
        
        newEmailsMap.set(creator.id, response);

        if (existingOutreachIdToUpdate) {
          // UPDATE existing outreach flow
          if (selectedCreators.length > 1) {
            // This case should ideally not happen if UI restricts selection for single update
            toast.error("Cannot update multiple outreaches at once in this mode.");
            allSuccessful = false;
            continue;
          }
          const updatePayload = {
            subject: response.email.subject,
            body: response.email.body,
            status: 'contacted' as const,
            confidence: response.confidence,
            reasoning: response.reasoning,
            keyPoints: response.keyPoints,
            nextSteps: response.nextSteps,
            brandName: brandInfo.name, // Assuming brandInfo is up-to-date
            campaignContext: campaignContext, // Assuming campaignContext is up-to-date
            // last_contact will be set by the service method
          };

          console.log(`Attempting to update outreach ID: ${existingOutreachIdToUpdate} for creator ${creator.name}`);
          const updatedOutreach = await outreachStorageService.updateOutreachDetails(existingOutreachIdToUpdate, updatePayload);

          if (updatedOutreach) {
            toast.success(`Outreach for ${creator.name} updated successfully!`);
            // outreachStatuses map might not be relevant if we close immediately
            // setOutreachStatuses(prev => new Map(prev.set(creator.id, { ...updatedOutreach, status: 'contacted' /* ensure local status matches */ })));
          } else {
            toast.error(`Failed to update outreach for ${creator.name}.`);
            allSuccessful = false;
          }

        } else {
          // CREATE new outreach flow (existing logic)
          const outreachDataForSave: NewOutreachData = {
            creatorId: creator.id,
            creatorName: creator.name,
            creatorAvatar: creator.avatar,
            creatorPlatform: creator.platform,
            creatorPhoneNumber: creator.phone_number, // Ensure this is passed if available
            subject: response.email.subject,
            body: response.email.body,
            status: 'pending', // Initial status for new bulk outreach
            confidence: response.confidence,
            reasoning: response.reasoning,
            keyPoints: response.keyPoints,
            nextSteps: response.nextSteps,
            brandName: brandInfo.name,
            campaignContext: campaignContext,
            notes: `AI-generated outreach email with ${(response.confidence * 100).toFixed(0)}% confidence`,
            campaign_id: campaignId
          };
          const savedOutreach = await outreachStorageService.saveOutreach(outreachDataForSave);
          if (savedOutreach) {
            toast.success(`Outreach for ${creator.name} saved successfully! ID: ${savedOutreach.id}`);
          } else {
            toast.error(`Failed to save outreach for ${creator.name}.`);
            allSuccessful = false;
          }
        }
      }
      
      setGeneratedEmails(prev => new Map([...Array.from(prev.entries()), ...Array.from(newEmailsMap.entries())]));
      if(allSuccessful && existingOutreachIdToUpdate) {
        // If it was a single update and successful, close the modal
        onClose(); 
      } else if (allSuccessful && !existingOutreachIdToUpdate) {
        setActiveTab('outreach'); // Or 'tracking' if preferred after bulk generation
      }
      // If not all successful, keep modal open for user to see errors / retry?
      
    } catch (error) {
      console.error('Error in generateOutreachEmails process:', error);
      toast.error("An unexpected error occurred during email generation or saving.");
      allSuccessful = false; // Ensure we don't accidentally close on general error
    } finally {
      setIsGeneratingEmails(false);
      if(allSuccessful && existingOutreachIdToUpdate) {
        // Additional check, sometimes finally runs before state updates fully propagate to UI for onClose
        // onClose(); // Already called above if successful
      } else if (allSuccessful && generatedEmails.size > 0 && !existingOutreachIdToUpdate) {
         // Potentially advance tab or give other feedback for bulk mode
      }
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
      await outreachStorageService.updateOutreachStatus(
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

  // Example of how UI might adapt:
  const isUpdateMode = !!existingOutreachIdToUpdate;

  return (
    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-auto flex flex-col" style={{maxHeight: '90vh'}}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 md:w-6 md:h-6 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          {isUpdateMode ? `Prepare Outreach: ${searchResults[0]?.name || 'Creator'}` : 'AI Outreach Campaign Manager'}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
        >
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 sticky top-[70px] md:top-[85px] bg-white z-10">
        {[
          { id: 'setup', label: 'Campaign Setup', icon: '⚙️', completed: setupComplete, accessible: true },
          { id: 'outreach', label: 'Email Generation', icon: '📧', completed: emailsGenerated, accessible: setupComplete },
          { id: 'tracking', label: 'Outreach Tracking', icon: '📊', completed: outreachStatuses.size > 0, accessible: emailsGenerated }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabSwitch(tab.id as any)}
            disabled={!tab.accessible}
            className={`px-3 md:px-6 py-3 font-medium transition-colors relative text-sm md:text-base ${
              activeTab === tab.id
                ? 'border-b-2 border-purple-600 text-purple-600 bg-purple-50'
                : tab.accessible
                  ? 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  : 'text-gray-400 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-1 md:gap-2">
              {tab.icon} {tab.label}
              {tab.completed && <div className="w-2 h-2 bg-green-500 rounded-full"></div>}
              {!tab.accessible && (
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              )}
            </div>
            <div className={`absolute -top-2 -right-1 md:-right-2 w-5 h-5 md:w-6 md:h-6 rounded-full text-xs flex items-center justify-center ${
              tab.completed ? 'bg-green-500 text-white' : tab.accessible ? 'bg-purple-100 text-purple-600' : 'bg-gray-200 text-gray-400'
            }`}>
              {tab.id === 'setup' ? '1' : tab.id === 'outreach' ? '2' : '3'}
            </div>
          </button>
        ))}
      </div>

      {/* Tab Content - this div should scroll */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
        {activeTab === 'setup' && !isUpdateMode && (
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto custom-scrollbar">
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
                    disabled={isGeneratingEmails || !setupComplete} // Ensure setup is complete
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

        {activeTab === 'outreach' || (isUpdateMode && activeTab === 'setup') && ( // Combine for update mode review
          <div className="space-y-6">
            {isUpdateMode && activeTab === 'setup' && (
              <div className="p-4 bg-yellow-50 border border-yellow-300 rounded-md">
                  <p className="text-sm text-yellow-700">Review brand and campaign context for <strong>{searchResults[0]?.name}</strong>. Adjust if necessary, then proceed to generate & update.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Brand Name:</label> <input type="text" value={brandInfo.name} onChange={e => setBrandInfo(bi => ({...bi, name: e.target.value}))} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Industry:</label> <input type="text" value={brandInfo.industry} onChange={e => setBrandInfo(bi => ({...bi, industry: e.target.value}))} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500" /></div>
                  </div>
                  <div className="mt-3"><label className="block text-sm font-medium text-gray-700 mb-1">Campaign Context (Brief):</label> <textarea value={campaignContext} onChange={e => setCampaignContext(e.target.value)} rows={3} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-purple-500"></textarea></div>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <h3 className="text-lg font-medium text-gray-700">{isUpdateMode ? `Generated Email Preview for ${selectedCreators[0]?.name || 'Selected Creator'}` : 'Generated & Review Emails'}</h3>
              <button 
                  onClick={generateOutreachEmails} 
                  disabled={isGeneratingEmails || (isUpdateMode && selectedCreators.length !==1) || (!isUpdateMode && selectedCreators.length === 0) || !setupComplete}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md disabled:bg-gray-400 transition-colors"
              >
                  {isGeneratingEmails ? 'Generating...' : (isUpdateMode ? 'Confirm & Update Outreach' : 'Re-generate Emails for Selected')}
              </button>
            </div>
            
            {generatedEmails.size === 0 && isGeneratingEmails && <p className="text-center text-gray-600 py-4">Generating email, please wait...</p>}
            {generatedEmails.size === 0 && !isGeneratingEmails && isUpdateMode && <p className="text-center text-gray-600 py-4">Click 'Confirm & Update Outreach' to generate and save.</p>}
            
            {Array.from(generatedEmails.entries()).map(([creatorId, emailResponse]) => {
              const creator = selectedCreators.find(c => c.id === creatorId) || searchResults.find(c => c.id === creatorId);
              if (!creator) return null;
              return (
                <div key={creatorId} className="p-4 border rounded-md shadow-sm bg-white">
                  <h4 className="font-semibold text-lg mb-1">{creator.name} ({creator.platform})</h4>
                  <p className="text-sm text-gray-500 mb-1">Confidence: {(emailResponse.confidence * 100).toFixed(0)}%</p>
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-gray-500">Subject</label>
                    <input type="text" readOnly value={emailResponse.email.subject} className="p-2 border rounded w-full bg-gray-50 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500">Body</label>
                    <textarea readOnly rows={6} value={emailResponse.email.body} className="p-2 border rounded w-full bg-gray-50 text-sm custom-scrollbar"></textarea>
                  </div>
                  {/* Add copy buttons or edit functionality here if needed */}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'tracking' && !isUpdateMode && (
          <div><p>Tracking features will be available here once emails are sent/managed.</p></div>
        )}
      </div>
    </div>
  );
} 