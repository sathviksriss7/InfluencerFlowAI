import { useState, useEffect, useMemo } from 'react';
import { outreachStorageService, type StoredOutreach } from '../services/outreach-storage';
import { aiOutreachService, type AIOutreachResponse, type BrandInfo } from '../services/ai-outreach';

// Modal component for displaying follow-up emails
interface FollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  followUpResponse: AIOutreachResponse | null;
  creatorName: string;
  onSend: () => void;
  isGenerating: boolean;
}

function FollowUpModal({ isOpen, onClose, followUpResponse, creatorName, onSend, isGenerating }: FollowUpModalProps) {
  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
            Follow-up Email for {creatorName}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {isGenerating ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">🤖 AI is generating your personalized follow-up email...</p>
                <p className="text-sm text-gray-500 mt-2">This may take a few seconds</p>
              </div>
            </div>
          ) : followUpResponse ? (
            <div className="space-y-6">
              {/* AI Confidence and Strategy */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-blue-900">AI Follow-up Strategy</h3>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    {(followUpResponse.confidence * 100).toFixed(0)}% Confidence
                  </span>
                </div>
                <p className="text-blue-800 text-sm">{followUpResponse.reasoning}</p>
              </div>

              {/* Subject Line */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subject Line</label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="font-medium text-gray-900">{followUpResponse.email.subject}</p>
                </div>
              </div>

              {/* Email Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Follow-up Email</label>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap font-sans text-gray-800">{followUpResponse.email.body}</pre>
                </div>
              </div>

              {/* Key Points and Next Steps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Key Points</label>
                  <ul className="space-y-1">
                    {followUpResponse.keyPoints.map((point, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-blue-600 mt-1">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Next Steps</label>
                  <ul className="space-y-1">
                    {followUpResponse.nextSteps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-green-600 mt-1">→</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Generate Follow-up</h3>
              <p className="text-gray-600">Please try again or check your connection.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {followUpResponse && !isGenerating && (
          <div className="flex justify-between items-center p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex gap-2">
              <button
                onClick={() => copyToClipboard(followUpResponse.email.body, 'Email body')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
                </svg>
                Copy Email
              </button>
              <button
                onClick={() => copyToClipboard(`Subject: ${followUpResponse.email.subject}\n\n${followUpResponse.email.body}`, 'Complete follow-up')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3,8L7.89,5.26A2,2 0 0,1 9.11,5.26L21,8M5,19H14A2,2 0 0,0 16,17V10L9,13.5L2,10V17A2,2 0 0,0 4,19H5Z"/>
                </svg>
                Copy Full
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={onSend}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/>
                </svg>
                Mark as Sent
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface EditModalState {
  isOpen: boolean;
  outreach: StoredOutreach | null;
}

export default function Outreaches() {
  const [outreaches, setOutreaches] = useState<StoredOutreach[]>([]);
  const [filteredOutreaches, setFilteredOutreaches] = useState<StoredOutreach[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);

  // Follow-up modal state
  const [followUpModal, setFollowUpModal] = useState<{
    isOpen: boolean;
    outreachId: string | null;
    creatorName: string;
    followUpResponse: AIOutreachResponse | null;
    isGenerating: boolean;
  }>({
    isOpen: false,
    outreachId: null,
    creatorName: '',
    followUpResponse: null,
    isGenerating: false
  });

  // Add missing state declarations for editModal and tempDetails
  const [editModal, setEditModal] = useState<EditModalState>({ 
    isOpen: false, 
    outreach: null 
  });
  const [tempDetails, setTempDetails] = useState<Partial<StoredOutreach> | null>(null);
  // Load outreaches when component mounts
  useEffect(() => {
    const fetchOutreaches = async () => {
      setIsLoading(true);
      try {
        const allOutreaches = await outreachStorageService.getAllOutreaches();
        setOutreaches(allOutreaches || []);
      } catch (error) {
        console.error("Error fetching outreaches:", error);
        setOutreaches([]); // Set to empty array on error
      }
      setIsLoading(false);
    };
    fetchOutreaches();
  }, []);

  // Filter outreaches when search term or status filter changes
  useEffect(() => {
    filterOutreaches();
  }, [outreaches, searchTerm, statusFilter]);

  const filterOutreaches = () => {
    let filtered = outreaches;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(outreach =>
        outreach.creatorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        outreach.creatorPlatform.toLowerCase().includes(searchTerm.toLowerCase()) ||
        outreach.brandName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        outreach.subject.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(outreach => outreach.status === statusFilter);
    }

    setFilteredOutreaches(filtered);
  };

  // Update outreach status
  const handleUpdateStatus = async (outreachId: string, newStatus: StoredOutreach['status'], notes?: string, currentOffer?: number) => {
    try {
      await outreachStorageService.updateOutreachStatus(outreachId, newStatus, notes, currentOffer);
      // Refresh data
      const updatedOutreaches = await outreachStorageService.getAllOutreaches();
      setOutreaches(updatedOutreaches || []);
    } catch (error) {
      console.error("Error updating outreach status:", error);
    }
  };

  // Delete outreach
  const handleDeleteOutreach = async (outreachId: string) => {
    if (window.confirm('Are you sure you want to delete this outreach?')) {
      try {
        await outreachStorageService.deleteOutreach(outreachId);
        // Refresh data
        const updatedOutreaches = await outreachStorageService.getAllOutreaches();
        setOutreaches(updatedOutreaches || []);
        if (followUpModal.outreachId === outreachId) {
          setFollowUpModal({
            isOpen: false,
            outreachId: null,
            creatorName: '',
            followUpResponse: null,
            isGenerating: false
          });
        }
      } catch (error) {
        console.error("Error deleting outreach:", error);
      }
    }
  };

  // Generate follow-up email
  const generateFollowUp = async (outreach: StoredOutreach) => {
    // Open modal with loading state
    setFollowUpModal({
      isOpen: true,
      outreachId: outreach.id,
      creatorName: outreach.creatorName,
      followUpResponse: null,
      isGenerating: true
    });

    try {
      // Create a Creator object from stored outreach data
      const mockCreator = {
        id: outreach.creatorId,
        name: outreach.creatorName,
        username: `@${outreach.creatorName.toLowerCase().replace(/\s+/g, '')}`,
        avatar: outreach.creatorAvatar,
        platform: outreach.creatorPlatform as any,
        niche: ['General'], // We don't store this, so use default
        metrics: {
          followers: 100000, // Mock data since we don't store this
          avgViews: 10000, // Fixed: use avgViews instead of avgShares
          engagementRate: 3.5,
          avgLikes: 3000,
          avgComments: 150
        },
        rates: {
          post: 25000,
          story: 15000,
          reel: 35000
        },
        demographics: {
          ageRange: '18-34',
          topCountries: ['India'],
          genderSplit: {
            male: 45,
            female: 50,
            other: 5
          }
        },
        rating: 4.5,
        responseTime: '24 hours',
        location: 'India',
        bio: 'Content Creator',
        verified: false
      };

      // Create brand info from stored outreach data
      const brandInfo: BrandInfo = {
        name: outreach.brandName,
        industry: 'Marketing', // Default since we don't store this
        campaignGoals: ['Brand Awareness'], // Default goals
        budget: { 
          min: 20000, 
          max: 100000,
          currency: 'INR'
        }, // Default range with currency
        timeline: '2-4 weeks',
        contentRequirements: ['Social Media Posts'] // Default requirements
      };

      // Calculate days since last contact
      const daysSinceContact = Math.floor(
        (Date.now() - outreach.lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Generate follow-up email
      const response = await aiOutreachService.generateFollowUpEmail(
        mockCreator,
        brandInfo,
        daysSinceContact,
        'initial_outreach' // Default to initial outreach
      );

      // Update modal with generated response
      setFollowUpModal(prev => ({
        ...prev,
        followUpResponse: response,
        isGenerating: false
      }));

    } catch (error) {
      console.error('Error generating follow-up email:', error);
      setFollowUpModal(prev => ({
        ...prev,
        followUpResponse: null,
        isGenerating: false
      }));
      alert('Failed to generate follow-up email. Please try again.');
    }
  };

  // Handle follow-up email send
  const handleSendFollowUp = async () => {
    if (!followUpModal.outreachId || !followUpModal.creatorName || !followUpModal.followUpResponse) return;
    setIsGeneratingFollowUp(true);
    try {
      console.log('Simulating sending follow-up:', followUpModal.followUpResponse.email);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await handleUpdateStatus(
        followUpModal.outreachId,
        'contacted',
        `Follow-up email sent: ${new Date().toLocaleString()}`
      );
      setFollowUpModal({ isOpen: false, outreachId: null, creatorName: '', followUpResponse: null, isGenerating: false });
      alert('Follow-up email sent successfully (simulated)!');
    } catch (error) {
      console.error('Error sending follow-up:', error);
      alert('Failed to send follow-up.');
    } finally {
      setIsGeneratingFollowUp(false);
    }
  };

  // Close follow-up modal
  const closeFollowUpModal = () => {
    setFollowUpModal({
      isOpen: false,
      outreachId: null,
      creatorName: '',
      followUpResponse: null,
      isGenerating: false
    });
  };

  // Helper functions for display
  const getStatusDisplayName = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'Pending',
      contacted: 'Contacted',
      interested: 'Interested',
      negotiating: 'Negotiating',
      deal_closed: 'Deal Closed',
      declined: 'Declined'
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'text-yellow-800 bg-yellow-100 border-yellow-200',
      contacted: 'text-blue-800 bg-blue-100 border-blue-200',
      interested: 'text-green-800 bg-green-100 border-green-200',
      negotiating: 'text-orange-800 bg-orange-100 border-orange-200',
      deal_closed: 'text-purple-800 bg-purple-100 border-purple-200',
      declined: 'text-red-800 bg-red-100 border-red-200'
    };
    return colorMap[status] || 'text-gray-800 bg-gray-100 border-gray-200';
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const daysSince = (date: Date) => {
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Check if follow-up is recommended (more than 3 days since last contact for pending/contacted status)
  const shouldRecommendFollowUp = (outreach: StoredOutreach) => {
    const daysSinceContact = daysSince(outreach.lastContact);
    const eligibleStatuses = ['pending', 'contacted'];
    return eligibleStatuses.includes(outreach.status) && daysSinceContact >= 3;
  };

  const handleSaveDetails = async () => {
    if (!editModal.outreach || !tempDetails) {
      console.warn("handleSaveDetails called without outreach or tempDetails selected.");
      return;
    }
    
    console.log("Saving details for:", editModal.outreach.id, tempDetails);

    setIsLoading(true);
    try {
      // TODO: Implement actual save logic using outreachStorageService for persistence.
      // e.g., await outreachStorageService.updateOutreachDetails(editModal.outreach.id, tempDetails);
      // For now, we simulate success and just refresh the list.
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call

      const updatedOutreaches = await outreachStorageService.getAllOutreaches();
      setOutreaches(updatedOutreaches || []);
      
      alert('Details updated (simulated). List refreshed.');
    } catch (error) {
      console.error("Error saving details and refreshing list:", error);
      alert('Error saving details.');
    } finally {
      setIsLoading(false);
    }
    
    setEditModal({ isOpen: false, outreach: null }); 
    setTempDetails(null);
  };

  const sortedOutreaches = useMemo(() => {
    // ... existing code ...
  }, [outreaches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Follow-up Modal */}
      <FollowUpModal
        isOpen={followUpModal.isOpen}
        onClose={closeFollowUpModal}
        followUpResponse={followUpModal.followUpResponse}
        creatorName={followUpModal.creatorName}
        onSend={handleSendFollowUp}
        isGenerating={followUpModal.isGenerating}
      />

      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              📧 Outreach Management
            </h1>
            <p className="text-gray-600">
              Track and manage all your influencer outreach campaigns in one place.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-purple-600">{outreaches.length}</p>
            <p className="text-sm text-gray-600">Total Outreaches</p>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Outreaches
            </label>
            <div className="relative">
              <svg className="absolute left-3 top-3 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by creator name, platform, brand, or subject..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="contacted">Contacted</option>
              <option value="interested">Interested</option>
              <option value="negotiating">Negotiating</option>
              <option value="deal_closed">Deal Closed</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {filteredOutreaches.length} of {outreaches.length} outreaches
          </p>
          <button
            onClick={filterOutreaches}
            className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Outreaches List */}
      {filteredOutreaches.length > 0 ? (
        <div className="space-y-4">
          {filteredOutreaches.map((outreach) => (
            <div key={outreach.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <img
                    src={outreach.creatorAvatar}
                    alt={outreach.creatorName}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{outreach.creatorName}</h3>
                    <p className="text-gray-600">{outreach.creatorPlatform}</p>
                    <p className="text-sm text-gray-500">
                      Campaign: {outreach.brandName} • Created {formatDate(outreach.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {shouldRecommendFollowUp(outreach) && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded-full">
                      Follow-up Recommended
                    </span>
                  )}
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(outreach.status)}`}>
                    {getStatusDisplayName(outreach.status)}
                  </span>
                  <button
                    onClick={() => handleDeleteOutreach(outreach.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Email Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-2">📧 {outreach.subject}</h4>
                <div className="text-sm text-gray-700 max-h-20 overflow-y-auto">
                  {outreach.body.substring(0, 200)}
                  {outreach.body.length > 200 && '...'}
                </div>
              </div>

              {/* Outreach Insights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">AI Confidence</p>
                  <p className="text-lg font-semibold text-blue-600">{(outreach.confidence * 100).toFixed(0)}%</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <p className="text-sm font-medium text-green-900">Last Contact</p>
                  <p className="text-lg font-semibold text-green-600">
                    {daysSince(outreach.lastContact)} days ago
                  </p>
                </div>
                {outreach.currentOffer && (
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <p className="text-sm font-medium text-purple-900">Current Offer</p>
                    <p className="text-lg font-semibold text-purple-600">₹{outreach.currentOffer.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                <select
                  value={outreach.status}
                  onChange={(e) => handleUpdateStatus(outreach.id, e.target.value as StoredOutreach['status'])}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="pending">Pending</option>
                  <option value="contacted">Contacted</option>
                  <option value="interested">Interested</option>
                  <option value="negotiating">Negotiating</option>
                  <option value="deal_closed">Deal Closed</option>
                  <option value="declined">Declined</option>
                </select>

                <button
                  onClick={() => generateFollowUp(outreach)}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors flex items-center gap-2 ${
                    shouldRecommendFollowUp(outreach)
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  Follow Up
                </button>

                <button
                  onClick={() => navigator.clipboard.writeText(outreach.body)}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  📋 Copy Email
                </button>

                <button
                  onClick={() => navigator.clipboard.writeText(`Subject: ${outreach.subject}\n\n${outreach.body}`)}
                  className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  📧 Copy Full
                </button>
              </div>

              {/* Notes */}
              {outreach.notes && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm font-medium text-yellow-900">Notes:</p>
                  <p className="text-sm text-yellow-800 mt-1">{outreach.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          {outreaches.length === 0 ? (
            <>
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Outreaches Yet</h3>
              <p className="text-gray-600 mb-6">
                Start by finding creators and generating your first AI-powered outreach emails.
              </p>
              <a
                href="/creators"
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                🔍 Find Creators
              </a>
            </>
          ) : (
            <>
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Outreaches Match Your Filters</h3>
              <p className="text-gray-600 mb-4">
                Try adjusting your search terms or filters to find what you're looking for.
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Clear Filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
} 