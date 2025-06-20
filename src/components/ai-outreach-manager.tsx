import React, { useState, useEffect } from 'react';
import { aiOutreachService, type BrandInfo, type OutreachEmail, type AIOutreachResponse } from '../services/ai-outreach';
import { outreachStorageService, type StoredOutreach, type NewOutreachData } from '../services/outreach-storage';
import { type Creator } from '../types';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';

interface OutreachManagerProps {
  searchResults: Creator[];
  onClose: () => void;
  campaignId: string;
  existingOutreachIdToUpdate?: string;
  initialBrandName?: string;
  initialBrandIndustry?: string;
  initialCampaignBrief?: string;
}

interface GeneratedEmailEntry {
  response: AIOutreachResponse;
  outreachId?: string;
  status: 'pending_generation' | 'pending_save' | 'saved' | 'sending_gmail' | 'sent_gmail' | 'error_saving' | 'error_sending_gmail';
  errorMessage?: string;
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
  const { session } = useAuth();
  const [selectedCreators, setSelectedCreators] = useState<Creator[]>([]);
  const [brandInfo, setBrandInfo] = useState<BrandInfo>(aiOutreachService.getExampleBrandInfo());
  const [campaignContext, setCampaignContext] = useState('');
  const [outreachStatuses, setOutreachStatuses] = useState<Map<string, CreatorOutreachStatus>>(new Map());
  const [activeTab, setActiveTab] = useState<'setup' | 'outreach' | 'tracking'>('setup');
  const [isGeneratingEmails, setIsGeneratingEmails] = useState(false);
  const [generatedEmails, setGeneratedEmails] = useState<Map<string, GeneratedEmailEntry>>(new Map());

  const [setupComplete, setSetupComplete] = useState(false);
  const [emailsGenerated, setEmailsGenerated] = useState(false);

  useEffect(() => {
    setBrandInfo(prevBrandInfo => ({
      ...prevBrandInfo,
      name: initialBrandName ?? prevBrandInfo.name,
      industry: initialBrandIndustry !== undefined ? initialBrandIndustry : '',
    }));
    if (initialCampaignBrief) {
      setCampaignContext(initialCampaignBrief);
    }
  }, [initialBrandName, initialBrandIndustry, initialCampaignBrief]);

  useEffect(() => {
    if (existingOutreachIdToUpdate && searchResults.length === 1) {
      setSelectedCreators([searchResults[0]]);
    } else {
      setSelectedCreators([]);
    }
  }, [existingOutreachIdToUpdate, searchResults]);

  const checkSetupCompletion = () => {
    const isComplete = 
      brandInfo.name.length > 0 && 
      brandInfo.industry.length > 0 && 
      brandInfo.budget.min >= 0 && 
      brandInfo.budget.max >= 0 && 
      campaignContext.length > 10 && 
      selectedCreators.length > 0;
    setSetupComplete(isComplete);
    return isComplete;
  };

  React.useEffect(() => {
    checkSetupCompletion();
  }, [brandInfo, campaignContext, selectedCreators]);

  React.useEffect(() => {
    setEmailsGenerated(Array.from(generatedEmails.values()).some(entry => !!entry.response));
  }, [generatedEmails]);

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

  const toggleCreatorSelection = (creator: Creator) => {
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

  const generateOutreachEmails = async () => {
    if (selectedCreators.length === 0) {
      toast.error("No creators selected for outreach.");
      return;
    }
    
    setIsGeneratingEmails(true);
    const currentGeneratedEmails = new Map(generatedEmails);
    let allSuccessfulOrUpdated = true;
    
    try {
      for (const creator of selectedCreators) {
        console.log(`🚀 Generating outreach email for ${creator.name}...`);
        currentGeneratedEmails.set(creator.id, { status: 'pending_generation' } as GeneratedEmailEntry);
        setGeneratedEmails(new Map(currentGeneratedEmails));
        
        const response = await aiOutreachService.generateInitialOutreach(
          creator,
          brandInfo,
          campaignContext
        );
        
        currentGeneratedEmails.set(creator.id, { response, status: 'pending_save' });
        setGeneratedEmails(new Map(currentGeneratedEmails));

        if (existingOutreachIdToUpdate) {
          if (selectedCreators.length > 1) {
            toast.error("Cannot update multiple outreaches at once in this mode.");
            allSuccessfulOrUpdated = false;
            currentGeneratedEmails.set(creator.id, { response, status: 'error_saving', errorMessage: "Multi-update error" });
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
            brandName: brandInfo.name,
            campaignContext: campaignContext,
          };

          console.log(`Attempting to update outreach ID: ${existingOutreachIdToUpdate} for creator ${creator.name}`);
          const updatedOutreach = await outreachStorageService.updateOutreachDetails(existingOutreachIdToUpdate, updatePayload);

          if (updatedOutreach) {
            toast.success(`Outreach for ${creator.name} updated successfully!`);
            currentGeneratedEmails.set(creator.id, { response, outreachId: existingOutreachIdToUpdate, status: 'saved' });
          } else {
            toast.error(`Failed to update outreach for ${creator.name}.`);
            allSuccessfulOrUpdated = false;
            currentGeneratedEmails.set(creator.id, { response, outreachId: existingOutreachIdToUpdate, status: 'error_saving', errorMessage: "Failed to update in DB" });
          }
        } else {
        const outreachDataForSave: NewOutreachData = {
          creatorId: creator.id,
          creatorName: creator.name,
          creatorAvatar: creator.avatar,
          creatorPlatform: creator.platform,
            creatorPhoneNumber: creator.phone_number,
          subject: response.email.subject,
          body: response.email.body,
            status: 'pending',
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
          if (savedOutreach && savedOutreach.id) {
            toast.success(`Outreach for ${creator.name} saved successfully! ID: ${savedOutreach.id}`);
            currentGeneratedEmails.set(creator.id, { response, outreachId: savedOutreach.id, status: 'saved' });
          } else {
            toast.error(`Failed to save outreach for ${creator.name}.`);
            allSuccessfulOrUpdated = false;
            currentGeneratedEmails.set(creator.id, { response, status: 'error_saving', errorMessage: "Failed to save to DB" });
          }
        }
        setGeneratedEmails(new Map(currentGeneratedEmails));
      }
      
      if(allSuccessfulOrUpdated && existingOutreachIdToUpdate) {
        if (activeTab !== 'outreach') {
            // setActiveTab('outreach'); // Consider if this is needed or if it should stay on setup if it was a quick generation
        }
      } else if (allSuccessfulOrUpdated && !existingOutreachIdToUpdate) {
      setActiveTab('outreach');
      }
      
    } catch (error) {
      console.error('Error in generateOutreachEmails process:', error);
      toast.error("An unexpected error occurred during email generation or saving.");
      selectedCreators.forEach(creator => {
        const entry = currentGeneratedEmails.get(creator.id);
        if (entry && (entry.status === 'pending_generation' || entry.status === 'pending_save')) {
            currentGeneratedEmails.set(creator.id, { ...entry, status: 'error_saving', errorMessage: (error as Error).message });
        }
      });
    } finally {
      setIsGeneratingEmails(false);
      setGeneratedEmails(new Map(currentGeneratedEmails));
    }
  };

  const handleSendViaGmail = async (creatorId: string) => {
    const emailEntry = generatedEmails.get(creatorId);
    const creator = selectedCreators.find(c => c.id === creatorId) ?? searchResults.find(c => c.id === creatorId);

    if (!emailEntry || emailEntry.status === 'sending_gmail' || emailEntry.status === 'sent_gmail') {
      toast.warn("Email not ready, already sending, or already sent.");
      return;
    }

    // Critical: Log the outreachId that will be sent to the backend
    const outreachIdForBackend = emailEntry.outreachId;
    console.log('[AIOutreachManager] Preparing to send via Gmail. Outreach ID for backend:', outreachIdForBackend, 'Full email entry:', emailEntry);

    if (!outreachIdForBackend) {
      toast.error("Critical Error: Outreach ID is missing from email entry. Cannot send email.");
      const currentMapError = new Map(generatedEmails);
      currentMapError.set(creatorId, { ...emailEntry, status: 'error_sending_gmail', errorMessage: "Internal error: Missing Outreach ID before send" });
      setGeneratedEmails(currentMapError);
      return;
    }

    if (!session?.access_token) {
      toast.error("You must be logged in and session active to send emails.");
      return;
    }

    const currentMap = new Map(generatedEmails);
    currentMap.set(creatorId, { ...emailEntry, status: 'sending_gmail', errorMessage: undefined });
    setGeneratedEmails(currentMap);

    try {
      const apiResponse = await fetch('/api/outreach/send-via-gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ outreach_id: outreachIdForBackend }), // Use the logged and checked ID
      });

      const responseData = await apiResponse.json();

      const newMap = new Map(generatedEmails);
      if (apiResponse.ok && responseData.success) {
        const creatorName = creator?.name || creatorId;
        toast.success(responseData.message || `Email to ${creatorName} sent via Gmail!`);
        newMap.set(creatorId, { ...emailEntry, status: 'sent_gmail', outreachId: emailEntry.outreachId });
      } else {
        toast.error(responseData.error || 'Failed to send email via Gmail.');
        if (responseData.action_required === 'connect_gmail') {
          toast.info('Please connect your Gmail account from the user menu to send emails.', { autoClose: 7000 });
        }
        newMap.set(creatorId, { ...emailEntry, status: 'error_sending_gmail', errorMessage: responseData.error, outreachId: emailEntry.outreachId });
      }
      setGeneratedEmails(newMap);
    } catch (error) {
      console.error("Error sending email via Gmail:", error);
      toast.error('An error occurred while trying to send the email via Gmail.');
      const newMapCatch = new Map(generatedEmails);
      newMapCatch.set(creatorId, { ...emailEntry, status: 'error_sending_gmail', errorMessage: (error as Error).message, outreachId: emailEntry.outreachId });
      setGeneratedEmails(newMapCatch);
    }
  };

  const generateNegotiationEmail = async (creator: Creator, negotiationContext: any) => {
    // Implementation needed
  };

  const generateFollowUpEmail = async (creator: Creator) => {
    // Implementation needed
  };

  const copyToClipboard = async (text: string, type: string = 'content') => {
    // Implementation needed
  };

  const exportEmails = () => {
    // Implementation needed
  };

  const sendEmailViaDefaultClient = async (emailResponse: AIOutreachResponse, creator: Creator) => {
    if (!emailResponse || !emailResponse.email) {
      toast.error('Email content not available.');
      return;
    }
    const { subject, body } = emailResponse.email;
    const recipientEmail = creator.email;

    if (!recipientEmail) {
      toast.error(`Creator ${creator.name} does not have an email address.`);
      return;
    }
    
    const mailtoLink = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.location.href = mailtoLink;
    toast.info(`Attempting to open your default email client for ${creator.name}.`);
    
    const emailEntry = generatedEmails.get(creator.id);
    if (emailEntry && emailEntry.outreachId) {
        // You might have a status like 'contacted_via_mailto'
        // For now, this send action doesn't change the Gmail send status
    }
  };

  const sendAllEmailsViaDefaultClient = async () => {
    if (generatedEmails.size === 0) {
      toast.warn("No emails generated to send.");
      return;
    }
    let count = 0;
    for (const [creatorId, emailEntry] of generatedEmails.entries()) {
      const creator = selectedCreators.find(c => c.id === creatorId);
      if (creator && emailEntry.response) {
        await sendEmailViaDefaultClient(emailEntry.response, creator);
        count++;
        if (count < generatedEmails.size) await new Promise(resolve => setTimeout(resolve, 500)); 
      }
    }
    if (count > 0) {
      toast.info(`${count} email(s) prepared for sending via your default mail client.`);
    } else {
      toast.error("Could not prepare any emails for sending.");
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl mx-auto my-8 min-h-[70vh] flex flex-col">
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <h2 className="text-2xl font-semibold text-gray-800">AI Outreach Manager</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">&times;</button>
      </div>

      <div className="mb-6 flex border-b">
        {['setup', 'outreach', 'tracking'].map((tabName) => (
          <button
            key={tabName}
            onClick={() => handleTabSwitch(tabName as 'setup' | 'outreach' | 'tracking')}
            className={`px-4 py-2 font-medium text-sm capitalize 
              ${activeTab === tabName 
                ? 'border-blue-500 text-blue-600 border-b-2' 
                : 'text-gray-500 hover:text-gray-700'}
              ${(tabName === 'outreach' && !setupComplete) || (tabName === 'tracking' && !emailsGenerated) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            disabled={(tabName === 'outreach' && !setupComplete) || (tabName === 'tracking' && !emailsGenerated)}
          >
            {tabName}
            </button>
          ))}
        </div>

          {activeTab === 'setup' && (
            <div className="space-y-6">
          <h3 className="text-xl font-semibold text-gray-700 mb-4">1. Campaign & Brand Setup</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
              <label htmlFor="brandName" className="block text-sm font-medium text-gray-700">Brand Name *</label>
              <input type="text" id="brandName" value={brandInfo.name} onChange={e => setBrandInfo({...brandInfo, name: e.target.value})} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
            </div>
            <div>
              <label htmlFor="brandIndustry" className="block text-sm font-medium text-gray-700">Brand Industry *</label>
              <input type="text" id="brandIndustry" value={brandInfo.industry} onChange={e => setBrandInfo({...brandInfo, industry: e.target.value})} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                  </div>
                  <div>
                <label htmlFor="budgetMin" className="block text-sm font-medium text-gray-700">Budget Min (₹) *</label>
                <input type="number" id="budgetMin" value={brandInfo.budget.min} onChange={e => setBrandInfo({...brandInfo, budget: {...brandInfo.budget, min: Number(e.target.value)} })} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                  </div>
                  <div>
                <label htmlFor="budgetMax" className="block text-sm font-medium text-gray-700">Budget Max (₹) *</label>
                <input type="number" id="budgetMax" value={brandInfo.budget.max} onChange={e => setBrandInfo({...brandInfo, budget: {...brandInfo.budget, max: Number(e.target.value)} })} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                  </div>
                  <div>
            <label htmlFor="campaignContext" className="block text-sm font-medium text-gray-700">Campaign Context / Brief *</label>
            <textarea id="campaignContext" value={campaignContext} onChange={e => setCampaignContext(e.target.value)} rows={4} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2"></textarea>
            <p className="text-xs text-gray-500">Min 10 characters. Describe the campaign goals, key messages, and what you want creators to do.</p>
                </div>
                
          <h3 className="text-xl font-semibold text-gray-700 mb-2">2. Select Creators *</h3>
          {searchResults.length > 0 ? (
            <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
              {searchResults.map(creator => (
                <div key={creator.id} 
                  className={`p-3 rounded-md cursor-pointer flex items-center gap-3 
                    ${selectedCreators.some(c => c.id === creator.id) ? 'bg-blue-100 border-blue-300 border' : 'bg-gray-50 hover:bg-gray-100'}
                    ${existingOutreachIdToUpdate ? 'opacity-70 cursor-not-allowed' : ''}
                  `}
                  onClick={() => toggleCreatorSelection(creator)}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedCreators.some(c => c.id === creator.id)} 
                    readOnly 
                    className="form-checkbox h-5 w-5 text-blue-600 rounded disabled:opacity-50" 
                    disabled={!!existingOutreachIdToUpdate}
                  />
                  <img src={creator.avatar || 'https://via.placeholder.com/40'} alt={creator.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <p className="font-medium text-gray-800">{creator.name}</p>
                    <p className="text-xs text-gray-500">{creator.platform} - {creator.metrics?.followers?.toLocaleString() || 'N/A'} followers</p>
                  </div>
              </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No creators found in search results. Please refine your search on the previous page.</p>
          )}
          {selectedCreators.length > 0 && <p className="text-sm text-gray-600 mt-2">Selected {selectedCreators.length} creator(s).</p>}
          {!setupComplete && selectedCreators.length > 0 && (
            <p className="text-sm text-yellow-600">Please ensure all Brand Info and Campaign Context fields are filled.</p>
          )}
                              </div>
                            )}
                            
      {activeTab === 'outreach' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-gray-700">Generated Outreach Emails</h3>
                            <button 
              onClick={generateOutreachEmails} 
              disabled={isGeneratingEmails || selectedCreators.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
            >
              {isGeneratingEmails ? 'Generating...' : (existingOutreachIdToUpdate ? 'Update & Regenerate Email' : 'Generate Emails')}
                            </button>
                          </div>
          {generatedEmails.size === 0 && !isGeneratingEmails && (
            <p className="text-gray-500">No emails generated yet. Select creators and click "Generate Emails".</p>
          )}
          {isGeneratingEmails && generatedEmails.size === 0 && <p className="text-blue-500">AI is crafting outreach emails...</p>}
          
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {Array.from(generatedEmails.entries()).map(([creatorId, emailEntry]) => {
              const creator = selectedCreators.find(c => c.id === creatorId) ?? searchResults.find(c => c.id === creatorId);
                    if (!creator) return null;
              const { response, status, outreachId, errorMessage } = emailEntry;

                    return (
                <div key={creatorId} className="p-4 border rounded-lg shadow-sm bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                            <div>
                      <h4 className="font-semibold text-lg text-gray-800">To: {creator.name} ({creator.platform})</h4>
                      {response?.email?.subject && <p className="text-sm text-gray-600">Subject: {response.email.subject}</p>}
                      {status === 'pending_generation' && <p className="text-sm text-blue-500 italic">Generating email...</p>}
                      {status === 'pending_save' && <p className="text-sm text-yellow-600 italic">Saving outreach...</p>}
                      {status === 'error_saving' && <p className="text-sm text-red-600 italic">Error saving: {errorMessage || 'Unknown DB error'}</p>}
                      {status === 'saved' && outreachId && <p className="text-sm text-green-600 italic">Outreach saved (ID: {outreachId}). Ready to send.</p>}
                            </div>
                    {response && (
                      <div className="flex space-x-2 mt-1">
                        <button onClick={() => copyToClipboard(response.email.subject, 'Subject')} className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">Copy Subject</button>
                        <button onClick={() => copyToClipboard(response.email.body, 'Body')} className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded">Copy Body</button>
                            </div>
                          )}
                        </div>

                  {response?.email?.body && (
                    <div className="p-3 bg-white border rounded-md text-sm text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {response.email.body}
                    </div>
                  )}
                  {response && (
                    <div className="mt-3 flex space-x-2 items-center">
                            <button
                        onClick={() => sendEmailViaDefaultClient(response, creator)}
                        className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition-colors"
                            >
                        Send (Mail Client)
                            </button>
                      <button 
                        onClick={() => handleSendViaGmail(creatorId)}
                        disabled={!(status === 'saved' && outreachId)}
                        className={`px-3 py-1.5 text-xs rounded-md transition-colors 
                          ${(status === 'saved' && outreachId) ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}
                          ${status === 'sending_gmail' ? 'bg-yellow-500 text-white animate-pulse' : ''}
                          ${status === 'sent_gmail' ? 'bg-green-500 text-white cursor-not-allowed' : ''}
                        `}
                      >
                        {status === 'sending_gmail' ? 'Sending Gmail...' : (status === 'sent_gmail' ? 'Sent via Gmail' : 'Send via Gmail')}
                            </button>
                          </div>
                  )}
                  {status === 'error_sending_gmail' && <p className="mt-2 text-xs text-red-500">Gmail send error: {errorMessage || 'Unknown API error'}</p>}
                  {response?.reasoning && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-gray-600">AI Reasoning & Details</summary>
                      <div className="p-2 bg-gray-100 rounded mt-1">
                        <p><strong>Confidence:</strong> {(response.confidence * 100).toFixed(0)}%</p>
                        <p><strong>Reasoning:</strong> {response.reasoning}</p>
                        <p><strong>Key Points:</strong> {response.keyPoints?.join(', ')}</p>
                        <p><strong>Next Steps:</strong> {response.nextSteps?.join(', ')}</p>
                      </div>
                    </details>
                  )}
                      </div>
                    );
                  })}
                </div>
          {generatedEmails.size > 0 && (
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={exportEmails} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">Export All</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'tracking' && (
        <div>
          <h3 className="text-xl font-semibold text-gray-700">Outreach Tracking</h3>
          <p className="text-gray-600">Track responses, negotiations, and deal closures here. (Functionality to be implemented)</p>
      </div>
      )}
    </div>
  );
} 