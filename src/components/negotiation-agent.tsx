import React, { useState, useEffect, useMemo } from 'react';
import { 
  negotiationAgentService, 
  aiAgentsService,
  type NegotiationResult,
  type BatchNegotiationResult
} from '../services/ai-agents';
import { type StoredOutreach } from '../services/outreach-storage';

interface NegotiationState {
  isGenerating: boolean;
  currentOutreachId: string | null;
  generatedMessage: string;
  negotiationStrategy: string;
  suggestedOffer: number | null;
  method: 'ai_generated' | 'algorithmic_fallback' | null;
}

interface BatchNegotiationState {
  isProcessing: boolean;
  results: BatchNegotiationResult | null;
  showResults: boolean;
  autoApplied: boolean;
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
  const [batchState, setBatchState] = useState<BatchNegotiationState>({
    isProcessing: false,
    results: null,
    showResults: false,
    autoApplied: false
  });
  const [showDetails, setShowDetails] = useState<{ [key: string]: boolean }>({});

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
  const handleBatchNegotiation = async (autoApply: boolean = false) => {
    setBatchState(prev => ({
      ...prev,
      isProcessing: true,
      results: null,
      showResults: false,
      autoApplied: false
    }));

    try {
      console.log('🚀 Starting batch negotiation process');
      const results = await negotiationAgentService.executeBatchNegotiation();
      
      setBatchState(prev => ({
        ...prev,
        isProcessing: false,
        results,
        showResults: true
      }));

      if (autoApply && results.successful > 0) {
        // Auto-apply the strategies
        console.log('🤖 Auto-applying negotiation strategies');
        const applyResults = await negotiationAgentService.autoApplyNegotiationStrategies(results);
        
        setBatchState(prev => ({
          ...prev,
          autoApplied: true
        }));

        // Refresh outreach data after auto-application
        const updatedOutreaches = negotiationAgentService.getPositiveResponseCreators();
        setAllOutreaches(updatedOutreaches);
        
        console.log(`✅ Auto-application completed: ${applyResults.applied} applied, ${applyResults.failed} failed`);
      }
    } catch (error) {
      console.error('❌ Batch negotiation failed:', error);
      setBatchState(prev => ({
        ...prev,
        isProcessing: false,
        results: null,
        showResults: false
      }));
    }
  };

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

      {/* Batch Negotiation Controls */}
      {eligibleCreators.length > 0 && (
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

          {/* Batch Results */}
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
      )}

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
                      
                      <button
                        onClick={() => setShowDetails(prev => ({
                          ...prev,
                          [outreach.id]: !prev[outreach.id]
                        }))}
                        className="px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        {showDetails[outreach.id] ? '▼' : '▶'} Details
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {showDetails[outreach.id] && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Campaign Context</h4>
                          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                            {outreach.campaignContext}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 mb-2">Key Points</h4>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {outreach.keyPoints.map((point, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <span className="text-blue-600">•</span>
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>
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