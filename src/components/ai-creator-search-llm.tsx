import React, { useState, useRef, useEffect } from 'react';
import { groqLLMService, type LLMCreatorAnalysis } from '../services/groq-llm';
import { mockCreators } from '../mock-data/creators';
import { type Creator, type Campaign as FullCampaignType } from '../types';
import { Link } from 'react-router-dom';
import AIOutreachManager from './ai-outreach-manager';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// Simplified Campaign type for selection
interface CampaignSelectItem {
  id: string;
  title: string;
  status: string; // Keep status if needed for any display logic, though we primarily filter by it
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  llmAnalysis?: LLMCreatorAnalysis;
  isLoading?: boolean;
}

// Backend response types (simplified for clarity here, ensure they match actual backend)
interface BackendQueryAnalysisResponse {
  success: boolean;
  analysis?: { // This is the structure returned by /api/creator/analyze-query
    intent: string;
    queryType: string;
    extractedCriteria: {
      platforms?: string[];
      niches?: string[];
      followerRange?: string;
      budget?: string;
      location?: string;
    };
    keyRequirements?: string[];
    confidence?: number;
    // It might also return analysisInsights and suggestions directly
    analysisInsights?: string; 
    suggestions?: string[];
  };
  method?: string;
  error?: string;
}

interface BackendCreatorDiscoveryResponse {
  success: boolean;
  creators?: Creator[]; // Creator type from ../types
  error?: string;
}

const CHAT_STORAGE_KEY = 'ai-creator-chat-history';

// Helper function to save messages to localStorage
const saveMessagesToStorage = (messages: ChatMessage[]) => {
  try {
    const serializedMessages = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
      // Don't save loading messages to storage
      isLoading: undefined
    })).filter(msg => !msg.isLoading);
    
    console.log('💾 Saving messages to localStorage:', serializedMessages.length, 'messages');
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(serializedMessages));
    console.log('✅ Successfully saved to localStorage');
  } catch (error) {
    console.warn('❌ Failed to save chat history to localStorage:', error);
  }
};

// Helper function to load messages from localStorage
const loadMessagesFromStorage = (): ChatMessage[] => {
  try {
    console.log('📥 Loading messages from localStorage...');
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!stored) {
      console.log('📭 No stored messages found, using default');
      return getDefaultMessages();
    }
    
    const parsed = JSON.parse(stored);
    // Add a check to ensure 'parsed' is an array
    if (!Array.isArray(parsed)) {
      console.warn('❌ Stored chat history is not an array, using default messages.');
      localStorage.removeItem(CHAT_STORAGE_KEY); // Clear corrupted data
      return getDefaultMessages();
    }

    const loadedMessages = parsed.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));
    
    console.log('📥 Loaded', loadedMessages.length, 'messages from localStorage');
    return loadedMessages;
  } catch (error) {
    console.warn('❌ Failed to load chat history from localStorage:', error);
    // Clear potentially corrupted data if parsing failed or structure is wrong
    localStorage.removeItem(CHAT_STORAGE_KEY);
    return getDefaultMessages();
  }
};

// Helper function to get default welcome message
const getDefaultMessages = (): ChatMessage[] => [
  {
    id: 'welcome',
    type: 'ai',
    content: "👋 Hi! I'm your AI-powered creator search assistant, now enhanced with Groq's lightning-fast LLM. I can understand natural language and provide intelligent, personalized creator recommendations. Try asking me something like 'Find fitness influencers on Instagram with 100k+ followers and high engagement' or 'Show me tech reviewers perfect for a gadget launch campaign'.",
    timestamp: new Date()
  }
];

// Helper function to test localStorage functionality
const testLocalStorage = () => {
  try {
    console.log('🧪 Testing localStorage functionality...');
    const testKey = 'test-storage-key';
    const testData = { test: 'data', timestamp: new Date().toISOString() };
    
    // Test write
    localStorage.setItem(testKey, JSON.stringify(testData));
    console.log('✅ Write test passed');
    
    // Test read
    const retrieved = localStorage.getItem(testKey);
    if (retrieved) {
      const parsed = JSON.parse(retrieved);
      console.log('✅ Read test passed:', parsed);
    } else {
      console.error('❌ Read test failed: no data retrieved');
    }
    
    // Test delete
    localStorage.removeItem(testKey);
    const deleted = localStorage.getItem(testKey);
    if (!deleted) {
      console.log('✅ Delete test passed');
    } else {
      console.error('❌ Delete test failed: data still exists');
    }
    
    console.log('🧪 localStorage test complete');
  } catch (error) {
    console.error('❌ localStorage test failed:', error);
  }
};

// Helper function to clear chat history
const clearChatHistory = () => {
  try {
    console.log('🗑️ Clearing chat history from localStorage');
    localStorage.removeItem(CHAT_STORAGE_KEY);
    console.log('✅ Chat history cleared');
  } catch (error) {
    console.warn('❌ Failed to clear chat history:', error);
  }
};

interface AICreatorSearchLLMProps {
  campaignId?: string;
}

export default function AICreatorSearchLLM({ campaignId: propCampaignId }: AICreatorSearchLLMProps) {
  // Load messages from localStorage on component mount
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    console.log('🚀 AICreatorSearchLLM component initializing...');
    const loadedMessages = loadMessagesFromStorage();
    console.log('🚀 Component initialized with', loadedMessages.length, 'messages');
    return loadedMessages;
  });
  const [currentQuery, setCurrentQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(() => {
    // Only show suggestions if we have just the welcome message
    const storedMessages = loadMessagesFromStorage();
    return storedMessages.length <= 1;
  });
  const [showOutreachManager, setShowOutreachManager] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();

  const suggestions = groqLLMService.getExampleQueries();

  // State for campaign assignment
  const [availableCampaigns, setAvailableCampaigns] = useState<CampaignSelectItem[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState<boolean>(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [selectedCreatorForAssignment, setSelectedCreatorForAssignment] = useState<Creator | null>(null);
  const [selectedCampaignIdForAssignment, setSelectedCampaignIdForAssignment] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState<boolean>(false);

  // Fetch active campaigns for assignment dropdown
  useEffect(() => {
    const fetchCampaigns = async () => {
      setIsLoadingCampaigns(true);
      setCampaignsError(null);
      console.log('Fetching active campaigns for assignment...');
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, title, status') // Fetch only necessary fields
          .eq('status', 'active'); // Fetch only active campaigns

        if (error) {
          console.error("Error fetching campaigns:", error);
          throw error;
        }
        const activeCampaigns = (data || []) as CampaignSelectItem[];
        setAvailableCampaigns(activeCampaigns);
        console.log('Fetched active campaigns:', activeCampaigns.length);
        if (activeCampaigns.length > 0) {
          setSelectedCampaignIdForAssignment(activeCampaigns[0].id); // Default to first campaign
        }
      } catch (err: any) {
        console.error("Error in fetchCampaigns catch block:", err);
        setCampaignsError(err.message || "Failed to fetch campaigns.");
        setAvailableCampaigns([]);
      } finally {
        setIsLoadingCampaigns(false);
      }
    };

    fetchCampaigns();
  }, []);

  const handleOpenAssignModal = (creator: Creator) => {
    setSelectedCreatorForAssignment(creator);
    setIsAssignModalOpen(true);
    if (availableCampaigns.length > 0 && !selectedCampaignIdForAssignment) {
      setSelectedCampaignIdForAssignment(availableCampaigns[0].id);
    }
  };

  const handleCloseAssignModal = () => {
    setIsAssignModalOpen(false);
    setSelectedCreatorForAssignment(null);
    setIsAssigning(false);
  };

  const handleConfirmAssignment = async () => {
    if (!selectedCreatorForAssignment || !selectedCampaignIdForAssignment) {
      console.error('No creator or campaign selected for assignment.');
      alert('Please select a creator and a campaign.');
      return;
    }

    if (!session?.access_token) {
      alert('Authentication error. Please log in again.');
      return;
    }

    setIsAssigning(true);

    const payload = {
      campaign_id: selectedCampaignIdForAssignment,
      creator_id: selectedCreatorForAssignment.id,
      creator_name: selectedCreatorForAssignment.name,
      creator_avatar: selectedCreatorForAssignment.avatar,
      creator_platform: selectedCreatorForAssignment.platform,
      creator_phone_number: (selectedCreatorForAssignment as any).phone_number || selectedCreatorForAssignment.phone_number || null 
    };

    const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';

    try {
      const response = await fetch(`${backendApiUrl}/api/outreaches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (response.ok && responseData.success) {
        alert(`Creator '${selectedCreatorForAssignment.name}' has been successfully assigned to the campaign!`);
      } else {
        console.error('Failed to assign creator:', responseData.error || response.statusText);
        alert(`Failed to assign creator: ${responseData.error || response.statusText}`);
      }
    } catch (error) {
      console.error('Error during assignment API call:', error);
      alert('An unexpected error occurred while trying to assign the creator. Please check the console.');
    }

    setIsAssigning(false);
    handleCloseAssignModal();
  };

  // Save messages to localStorage whenever messages change
  useEffect(() => {
    console.log('🔄 Messages changed, saving to localStorage. Total messages:', messages.length);
    saveMessagesToStorage(messages);
  }, [messages]);

  useEffect(() => {
    console.log('🔗 Component mounted/updated, scrolling to bottom');
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track component lifecycle
  useEffect(() => {
    console.log('🔵 AICreatorSearchLLM component mounted');
    
    return () => {
      console.log('🔴 AICreatorSearchLLM component unmounting');
    };
  }, []);

  // Get current search results from the latest AI message with analysis
  const getCurrentSearchResults = (): Creator[] => {
    const aiMessages = messages.filter(m => m.type === 'ai' && m.llmAnalysis);
    if (aiMessages.length === 0) return [];
    
    const latestAnalysis = aiMessages[aiMessages.length - 1].llmAnalysis;
    // Ensure latestAnalysis and its matchedCreators property exist
    if (!latestAnalysis || !latestAnalysis.matchedCreators) return []; 
    
    // Safely map over matchedCreators, defaulting to an empty array if it's somehow still not an array
    return (latestAnalysis.matchedCreators || []).map(mc => mc.creator);
  };

  const handleSendMessage = async () => {
    if (!currentQuery.trim() || isAnalyzing) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: currentQuery,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const originalUserQuery = currentQuery; // Store the original query
    setCurrentQuery('');
    setIsAnalyzing(true);
    setShowSuggestions(false);

    const loadingMessage: ChatMessage = {
      id: `loading_${Date.now()}`,
      type: 'ai',
      content: "🧠 Analyzing your request and searching for creators...",
      timestamp: new Date(),
      isLoading: true
    };
    setMessages(prev => [...prev, loadingMessage]);

    const backendApiUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
    const token = session?.access_token;
    let finalLlmAnalysis: LLMCreatorAnalysis | null = null;
    const startTime = Date.now();

    try {
      // Step 1: Call /api/creator/analyze-query
      console.log('🤖 Step 1: Calling /api/creator/analyze-query with query:', originalUserQuery);
      const analyzeResponse = await fetch(`${backendApiUrl}/api/creator/analyze-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({
          query: originalUserQuery,
          // conversation_history: messages.slice(0, -1)... (consider if needed)
        }),
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json().catch(() => ({}));
        throw new Error(`Query analysis failed: ${analyzeResponse.status} ${errorData?.error || analyzeResponse.statusText}`);
      }
      
      const queryAnalysisData: BackendQueryAnalysisResponse = await analyzeResponse.json();

      if (!queryAnalysisData.success || !queryAnalysisData.analysis) {
        throw new Error(`Query analysis was not successful: ${queryAnalysisData.error || 'Unknown error from analysis API'}`);
      }
      // Assign to a new const after the check to satisfy TypeScript's control flow analysis
      const currentQueryAnalysis = queryAnalysisData.analysis;
      
      console.log('✅ Step 1: Query analysis successful:', currentQueryAnalysis);

      // Step 2: Call /api/creators/discover using criteria from Step 1
      const discoveryCriteria: any = {};
      if (currentQueryAnalysis.extractedCriteria.platforms?.length) {
        discoveryCriteria.platforms = currentQueryAnalysis.extractedCriteria.platforms;
      }
      if (currentQueryAnalysis.extractedCriteria.niches?.length) {
        discoveryCriteria.niches = currentQueryAnalysis.extractedCriteria.niches;
      }
      if (currentQueryAnalysis.extractedCriteria.followerRange) { // Assuming backend /discover can take this string
        discoveryCriteria.min_followers = currentQueryAnalysis.extractedCriteria.followerRange; // Or parse if needed
      }
      if (currentQueryAnalysis.extractedCriteria.location) {
        discoveryCriteria.location = currentQueryAnalysis.extractedCriteria.location;
      }
      // Add a default for location if not present, as discover might need it
      if (!discoveryCriteria.location) {
        // discoveryCriteria.location = "India"; // Or some other default, or make backend handle missing
      }


      console.log('🤖 Step 2: Calling /api/creators/discover with criteria:', discoveryCriteria);
      const discoverResponse = await fetch(`${backendApiUrl}/api/creators/discover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify(discoveryCriteria),
      });

      if (!discoverResponse.ok) {
        const errorData = await discoverResponse.json().catch(() => ({}));
        throw new Error(`Creator discovery failed: ${discoverResponse.status} ${errorData?.error || discoverResponse.statusText}`);
      }

      const creatorDiscoveryData: BackendCreatorDiscoveryResponse = await discoverResponse.json();

      if (!creatorDiscoveryData.success) {
        // Even if not successful, we might have queryAnalysisData to show
        console.warn('Creator discovery was not successful:', creatorDiscoveryData.error);
      }
      
      const discoveredCreators = creatorDiscoveryData.creators || [];
      console.log('✅ Step 2: Creator discovery successful. Found creators:', discoveredCreators.length);

      // Step 3: Assemble the LLMCreatorAnalysis object for the UI
      finalLlmAnalysis = {
        query: originalUserQuery,
        queryUnderstanding: { // Populate from currentQueryAnalysis
          intent: currentQueryAnalysis.intent || "N/A",
          queryType: currentQueryAnalysis.queryType as LLMCreatorAnalysis['queryUnderstanding']['queryType'] || "general_search",
          secondaryAspects: currentQueryAnalysis.extractedCriteria.platforms, // Example, adjust as needed
          extractedCriteria: {
            platforms: currentQueryAnalysis.extractedCriteria.platforms,
            niches: currentQueryAnalysis.extractedCriteria.niches,
            followerRange: currentQueryAnalysis.extractedCriteria.followerRange,
            budget: currentQueryAnalysis.extractedCriteria.budget,
            location: currentQueryAnalysis.extractedCriteria.location,
          },
          confidence: currentQueryAnalysis.confidence || 0,
          keyRequirements: currentQueryAnalysis.keyRequirements || [],
        },
        matchedCreators: discoveredCreators.map(creator => ({ // Transform Creator to MatchedCreator
          creator: creator,
          relevanceScore: 70, // Placeholder
          reasoning: "Matched based on initial criteria.", // Placeholder
          strengths: ["Relevant platform/niche (placeholder)"], // Placeholder
          concerns: [], // Placeholder
          recommendationLevel: 'potential_match', // Placeholder
          // costEffectivenessScore and reachPotential are optional
        })),
        // Use insights and suggestions from currentQueryAnalysis if backend provides them, else placeholders
        analysisInsights: currentQueryAnalysis.analysisInsights || (discoveredCreators.length > 0 ? `Found ${discoveredCreators.length} potential creators based on your query.` : "Could not find specific creators, but understood your query."),
        suggestions: currentQueryAnalysis.suggestions || ["Try refining your niche or platform.", "Specify a follower range."],
        totalProcessingTime: Date.now() - startTime,
      };

    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      finalLlmAnalysis = { // Fallback structure on error
        query: originalUserQuery,
        analysisInsights: error instanceof Error ? error.message : "An unexpected error occurred.",
        queryUnderstanding: { intent: "Error processing request", queryType: 'general_search', extractedCriteria: {}, confidence: 0, keyRequirements: [] },
        matchedCreators: [],
        suggestions: ["Please try a different query or check console for errors."],
        totalProcessingTime: Date.now() - startTime,
      };
    } finally {
      setMessages(prev => prev.filter(m => !m.isLoading)); // Remove loading message
      if (finalLlmAnalysis) {
        const aiMessage: ChatMessage = {
          id: `ai_${Date.now()}`,
          type: 'ai',
          content: finalLlmAnalysis.analysisInsights, // Main textual response
          timestamp: new Date(),
          llmAnalysis: finalLlmAnalysis // The full structured data
        };
        setMessages(prev => [...prev, aiMessage]);
      }
      setIsAnalyzing(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setCurrentQuery(suggestion);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const resetChat = () => {
    console.log('🔄 Resetting chat to default state...');
    const defaultMessages = getDefaultMessages();
    setMessages(defaultMessages);
    setShowSuggestions(true);
    setCurrentQuery('');
    clearChatHistory();
    console.log('✅ Chat reset complete');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                AI Creator Assistant
                <span className="px-2 py-0.5 bg-white bg-opacity-20 text-xs rounded-full">
                  ⚡ Groq Powered
                </span>
              </h2>
              <p className="text-sm text-purple-100">
                {/* isLLMAvailable ? 'LLM-powered natural language search' : 'Setup required - Add Groq API key' */}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 1 && (
              <div className="text-xs text-purple-100 bg-white bg-opacity-10 px-2 py-1 rounded" title="Messages saved to browser storage">
                💾 {(() => {
                  try {
                    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
                    const savedCount = stored ? JSON.parse(stored).length : 0;
                    return `${savedCount} messages saved`;
                  } catch {
                    return 'Storage error';
                  }
                })()} 
              </div>
            )}
            {/* Development test button */}
            {import.meta.env.DEV && (
              <button 
                onClick={testLocalStorage}
                className="text-white hover:bg-white hover:bg-opacity-20 px-2 py-1 rounded text-xs"
                title="Test localStorage functionality (dev only)"
              >
                🧪 Test Storage
              </button>
            )}
            <button 
              onClick={resetChat}
              className="text-white hover:bg-white hover:bg-opacity-20 px-3 py-1 rounded-lg transition-colors text-sm"
              title="Clear chat history and start fresh"
            >
              🗑️ Clear Chat
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-96">
        {(messages || []).map((message) => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg p-3 ${
              message.type === 'user' 
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <div className="flex items-start gap-2">
                {message.type === 'ai' && (
                  <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5">
                    {message.isLoading ? (
                      <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    )}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm">{message.content}</p>
                  {message.llmAnalysis && (
                    <LLMAnalysisDisplay analysis={message.llmAnalysis} onAssignCreator={handleOpenAssignModal} />
                  )}
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        <div ref={messagesEndRef} />
      </div>

      {/* API Key Warning */}
      {/* {!isLLMAvailable && (
        <div className="mx-4 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.232 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
            <div className="text-sm">
              <p className="font-medium text-amber-800">Groq API Setup Required</p>
              <p className="text-amber-700 mt-1">
                Add <code className="bg-amber-100 px-1 rounded">VITE_GROQ_API_KEY="your-key-here"</code> to your .env.local file.
                <br />
                Get your free API key from <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a>
              </p>
            </div>
          </div>
        </div>
      )} */}

      {/* Suggestions */}
      {showSuggestions && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">✨ Try these AI-powered queries:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(suggestions || []).slice(0, 4).map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="text-left text-xs bg-white border border-gray-200 rounded-lg p-2 hover:bg-gradient-to-r hover:from-purple-50 hover:to-blue-50 hover:border-purple-300 transition-all"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-200">
        {/* Add Outreach Manager Button when there are search results AND a campaignId is present */}
        {getCurrentSearchResults().length > 0 && propCampaignId && (
          <div className="mb-3 p-3 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    📧 Ready to reach out to {getCurrentSearchResults().length} creators?
                  </p>
                  <p className="text-xs text-gray-600">
                    Use AI to generate personalized outreach emails and negotiate deals for campaign: {propCampaignId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOutreachManager(true)}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                Launch Outreach Manager
              </button>
            </div>
          </div>
        )}
        
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={currentQuery}
            onChange={(e) => setCurrentQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me to find creators in natural language..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            disabled={isAnalyzing}
          />
          <button
            onClick={handleSendMessage}
            disabled={!currentQuery.trim() || isAnalyzing}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isAnalyzing ? 'Analyzing...' : 'Send'}
          </button>
        </div>
      </div>

      {/* AI Outreach Manager Modal */}
      {showOutreachManager && propCampaignId && (
        <AIOutreachManager
          searchResults={getCurrentSearchResults()}
          onClose={() => setShowOutreachManager(false)}
          campaignId={propCampaignId}
        />
      )}

      {/* Assign Creator to Campaign Modal */}
      {isAssignModalOpen && selectedCreatorForAssignment && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center transition-opacity duration-300 ease-in-out" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="relative mx-auto p-6 border w-full max-w-lg shadow-xl rounded-2xl bg-white transform transition-all duration-300 ease-in-out scale-100">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-800" id="modal-title">
                    Assign Creator
                </h3>
                <button onClick={handleCloseAssignModal} className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-gray-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-700 mb-1">You are assigning:</p>
              <p className="text-lg font-semibold text-green-700 mb-4">{selectedCreatorForAssignment.name}</p>
              
              {isLoadingCampaigns ? (
                <div className="flex justify-center items-center h-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
                    <p className="ml-3 text-sm text-gray-500">Loading campaigns...</p>
                </div>
              ) : campaignsError ? (
                <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
                    <span className="font-medium">Error:</span> {campaignsError}
                </div>
              ) : availableCampaigns.length === 0 ? (
                <div className="p-3 mb-4 text-sm text-yellow-700 bg-yellow-100 rounded-lg" role="alert">
                    <span className="font-medium">No Active Campaigns:</span> No active campaigns available to assign this creator to.
                </div>
              ) : (
                <div className="mb-6">
                  <label htmlFor="campaign-select" className="block text-sm font-medium text-gray-700 mb-1">
                    Select campaign to assign to:
                  </label>
                  <select
                    id="campaign-select"
                    name="campaign-select"
                    value={selectedCampaignIdForAssignment}
                    onChange={(e) => setSelectedCampaignIdForAssignment(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm rounded-md shadow-sm transition-colors duration-150 ease-in-out hover:border-gray-400"
                  >
                    {availableCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.title} (Status: {campaign.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleCloseAssignModal}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-all duration-150 ease-in-out"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignment}
                disabled={isLoadingCampaigns || !!campaignsError || availableCampaigns.length === 0 || !selectedCampaignIdForAssignment || isAssigning}
                className="px-6 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 ease-in-out shadow-sm hover:shadow-md"
              >
                {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface LLMAnalysisDisplayProps {
  analysis: LLMCreatorAnalysis;
  onAssignCreator: (creator: Creator) => void;
}

function LLMAnalysisDisplay({ analysis, onAssignCreator }: LLMAnalysisDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { matchedCreators, analysisInsights, suggestions, queryUnderstanding } = analysis;

  // Log the entire analysis object when the component renders
  useEffect(() => {
    // console.log('[LLMAnalysisDisplay] Analysis object received:', JSON.stringify(analysis, null, 2));
  }, [analysis]);

  const getQueryTypeDisplay = (queryType: string | undefined) => {
    if (!queryType) return 'General Analysis';
    return queryType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getSecondaryAspectDisplay = (aspect: string | undefined) => {
    if (!aspect) return '';
    return aspect.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getQueryTypeColor = (queryType: string | undefined) => {
    if (!queryType) return 'bg-gray-100 text-gray-800';
    switch (queryType) {
      case 'budget_optimization': return 'bg-green-100 text-green-800';
      case 'reach_maximization': return 'bg-blue-100 text-blue-800';
      case 'engagement_focused': return 'bg-yellow-100 text-yellow-800';
      case 'niche_targeting': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!matchedCreators && !analysisInsights && !suggestions) {
    return <p className="text-sm text-gray-500 p-4">No detailed analysis to display.</p>;
  }

  return (
    <div className="mt-3 space-y-4">
      {queryUnderstanding && (
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className={`text-sm font-semibold px-2 py-0.5 rounded-full ${getQueryTypeColor(queryUnderstanding.queryType)}`}>
              {getQueryTypeDisplay(queryUnderstanding.queryType)}
            </h4>
            {queryUnderstanding.confidence && (
              <span className="text-xs text-gray-500">Confidence: {(queryUnderstanding.confidence * 100).toFixed(0)}%</span>
            )}
          </div>
          <ul className="text-xs text-gray-700 space-y-1">
            {queryUnderstanding.intent && <li><strong>Intent:</strong> {queryUnderstanding.intent}</li>}
            {queryUnderstanding.extractedCriteria && Object.keys(queryUnderstanding.extractedCriteria).length > 0 && (
              <li>
                <strong>Key Criteria:</strong>
                <ul className="list-disc list-inside ml-2 space-y-0.5">
                  {Object.entries(queryUnderstanding.extractedCriteria).map(([key, value]) => {
                    if (!value || (Array.isArray(value) && value.length === 0)) return null;
                    const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
                    return <li key={key}><span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span> {displayValue}</li>;
                  })}
                </ul>
              </li>
            )}
            {queryUnderstanding.keyRequirements && queryUnderstanding.keyRequirements.length > 0 && (
                <li><strong>User's Key Requirements:</strong> {queryUnderstanding.keyRequirements.join(', ')}</li>
            )}
            {queryUnderstanding.secondaryAspects && queryUnderstanding.secondaryAspects.length > 0 && (
                <li><strong>Considered Aspects:</strong> {queryUnderstanding.secondaryAspects.map(getSecondaryAspectDisplay).join(', ')}</li>
            )}
          </ul>
        </div>
      )}

      {analysisInsights && (
        <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
          <h5 className="text-xs font-semibold text-indigo-700 mb-1">AI Insights:</h5>
          <p className="text-xs text-indigo-600 whitespace-pre-wrap">{analysisInsights}</p>
        </div>
      )}

      {(matchedCreators || []).length > 0 && (
        <div className="space-y-3">
          <h5 className="text-sm font-semibold text-gray-800">
            Found {(matchedCreators || []).length} potential creators based on your query.
            {((matchedCreators || []).length > 3 && !showDetails) && 
              <span className="text-xs ml-2 text-gray-500">(Showing top 3)</span>
            }
          </h5>
          
          {(matchedCreators || []).filter(Boolean).slice(0, showDetails ? 10 : 3).map((match) => (
            <LLMCreatorCard 
              key={match.creator.id} 
              match={match} 
              showDetails={showDetails} 
              queryType={queryUnderstanding?.queryType || 'general_search'} 
              onAssignCreator={onAssignCreator}
            />
          ))}
        </div>
      )}

      {((matchedCreators || []).length > 3) && (
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-purple-600 hover:text-purple-800 hover:underline focus:outline-none mt-2"
        >
          {showDetails ? 'Show Less' : 'Show More Creators'}
        </button>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <h5 className="text-xs font-semibold text-gray-700 mb-1">AI Suggestions:</h5>
          <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
            {(suggestions || []).map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface LLMCreatorCardProps {
  match: LLMCreatorAnalysis['matchedCreators'][0];
  showDetails: boolean;
  queryType: string;
  onAssignCreator: (creator: Creator) => void;
}

function LLMCreatorCard({ match, showDetails, queryType, onAssignCreator }: LLMCreatorCardProps) {
  // Log the received match prop for debugging
  console.log('[LLMCreatorCard] Received match prop:', JSON.stringify(match, null, 2));

  const { creator, relevanceScore, reasoning, strengths, concerns, recommendationLevel, costEffectivenessScore, reachPotential } = match;

  const getRecommendationColor = (level: string) => {
    switch (level) {
      case 'highly_recommended': return 'text-green-600';
      case 'good_match': return 'text-blue-600';
      case 'potential_match': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const getRecommendationBadge = (level: string) => {
    switch (level) {
      case 'highly_recommended': return '🎯 Highly Recommended';
      case 'good_match': return '✅ Good Match';
      case 'potential_match': return '⚡ Potential Match';
      default: return '📋 Analyzed';
    }
  };

  const calculateCostPerFollower = () => {
    if (creator.metrics.followers === 0) return 'N/A'; // Avoid division by zero
    return (creator.rates.post / creator.metrics.followers * 1000).toFixed(2);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <img
          src={creator.avatar}
          alt={creator.name}
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Link 
                to={`/creators/${creator.id}`}
                className="text-sm font-medium text-gray-900 hover:underline"
              >
                {creator.name}
              </Link>
            </div>
          </div>
          <p className="text-xs text-gray-600 mb-2">
            {creator.bio}
          </p>
          <p className="text-xs text-gray-600 mb-2">
            <strong>Relevance Score:</strong> {relevanceScore}%
          </p>
          <p className="text-xs text-gray-600 mb-2">
            <strong>Reasoning:</strong> {reasoning}
          </p>
          <p className="text-xs text-gray-600 mb-2">
            <strong>Strengths:</strong> {strengths.join(', ')}
          </p>
          <p className="text-xs text-gray-600 mb-2">
            <strong>Concerns:</strong> {concerns.join(', ')}
          </p>
          <p className="text-xs text-gray-600 mb-2">
            <strong>Recommendation Level:</strong> {getRecommendationBadge(recommendationLevel)}
          </p>
          <p className="text-xs text-gray-600 mb-2">
            <strong>Cost Per Follower:</strong> ${calculateCostPerFollower()}
          </p>
        </div>
      </div>

      {/* Assign to Campaign Button */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <button
          onClick={() => onAssignCreator(creator)}
          className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
        >
          <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Assign to Campaign
        </button>
      </div>
    </div>
  );
}