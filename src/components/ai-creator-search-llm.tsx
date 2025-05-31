import React, { useState, useRef, useEffect } from 'react';
import { groqLLMService, type LLMCreatorAnalysis } from '../services/groq-llm';
import { mockCreators } from '../mock-data/creators';
import { type Creator } from '../types';
import { Link } from 'react-router-dom';
import AIOutreachManager from './ai-outreach-manager';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  llmAnalysis?: LLMCreatorAnalysis;
  isLoading?: boolean;
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
    const loadedMessages = parsed.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));
    
    console.log('📥 Loaded', loadedMessages.length, 'messages from localStorage');
    return loadedMessages;
  } catch (error) {
    console.warn('❌ Failed to load chat history from localStorage:', error);
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

export default function AICreatorSearchLLM() {
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

  const isLLMAvailable = groqLLMService.isAvailable();
  const suggestions = groqLLMService.getExampleQueries();

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
    if (!latestAnalysis) return [];
    
    return latestAnalysis.matchedCreators.map(mc => mc.creator);
  };

  const handleSendMessage = async () => {
    if (!currentQuery.trim() || isAnalyzing) return;

    if (!isLLMAvailable) {
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        type: 'ai',
        content: "🔑 Please set up your Groq API key to use the LLM-powered search. Add VITE_GROQ_API_KEY to your .env.local file. You can get your API key from https://console.groq.com/",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: currentQuery,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const query = currentQuery;
    setCurrentQuery('');
    setIsAnalyzing(true);
    setShowSuggestions(false);

    // Add loading message
    const loadingMessage: ChatMessage = {
      id: `loading_${Date.now()}`,
      type: 'ai',
      content: "🧠 Analyzing your request with advanced AI...",
      timestamp: new Date(),
      isLoading: true
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      console.log('🤖 Calling AI with conversation context:', messages.length, 'messages');
      console.log('📋 Messages being passed:', messages.map(m => `${m.type}: ${m.content.substring(0, 50)}...`));
      
      const llmAnalysis = await groqLLMService.analyzeCreatorQuery(query, mockCreators, messages);
      
      // Remove loading message and add result
      setMessages(prev => prev.filter(m => !m.isLoading));
      
      const aiMessage: ChatMessage = {
        id: `ai_${Date.now()}`,
        type: 'ai',
        content: llmAnalysis.analysisInsights,
        timestamp: new Date(),
        llmAnalysis
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      setMessages(prev => prev.filter(m => !m.isLoading));
      
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        type: 'ai',
        content: "I encountered an error while analyzing your request. This might be due to API limits or connectivity issues. Please try again with a simpler query.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
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
                {isLLMAvailable ? 'LLM-powered natural language search' : 'Setup required - Add Groq API key'}
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
        {messages.map((message) => (
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
                    <LLMAnalysisDisplay analysis={message.llmAnalysis} />
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
      {!isLLMAvailable && (
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
      )}

      {/* Suggestions */}
      {showSuggestions && isLLMAvailable && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 mb-2">✨ Try these AI-powered queries:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {suggestions.slice(0, 4).map((suggestion, index) => (
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
        {/* Add Outreach Manager Button when there are search results */}
        {getCurrentSearchResults().length > 0 && (
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
                    Use AI to generate personalized outreach emails and negotiate deals
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
            placeholder={isLLMAvailable ? "Ask me to find creators in natural language..." : "Please set up Groq API key first"}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            disabled={isAnalyzing || !isLLMAvailable}
          />
          <button
            onClick={handleSendMessage}
            disabled={!currentQuery.trim() || isAnalyzing || !isLLMAvailable}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isAnalyzing ? 'Analyzing...' : 'Send'}
          </button>
        </div>
      </div>

      {/* AI Outreach Manager Modal */}
      {showOutreachManager && (
        <AIOutreachManager
          searchResults={getCurrentSearchResults()}
          onClose={() => setShowOutreachManager(false)}
        />
      )}
    </div>
  );
}

interface LLMAnalysisDisplayProps {
  analysis: LLMCreatorAnalysis;
}

function LLMAnalysisDisplay({ analysis }: LLMAnalysisDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getQueryTypeDisplay = (queryType: string) => {
    switch (queryType) {
      case 'budget_optimization': return '💰 Budget Optimization';
      case 'reach_maximization': return '📈 Reach Maximization';
      case 'engagement_focused': return '❤️ Engagement Focused';
      case 'niche_targeting': return '🎯 Niche Targeting';
      default: return '🔍 General Search';
    }
  };

  const getSecondaryAspectDisplay = (aspect: string) => {
    switch (aspect) {
      case 'budget_optimization': return '💰 Budget';
      case 'reach_maximization': return '📈 Reach';
      case 'engagement_focused': return '❤️ Engagement';
      case 'niche_targeting': return '🎯 Niche';
      case 'quality_focused': return '⭐ Quality';
      default: return aspect;
    }
  };

  const getQueryTypeColor = (queryType: string) => {
    switch (queryType) {
      case 'budget_optimization': return 'text-green-600 bg-green-50';
      case 'reach_maximization': return 'text-blue-600 bg-blue-50';
      case 'engagement_focused': return 'text-pink-600 bg-pink-50';
      case 'niche_targeting': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="mt-3 space-y-3">
      {/* Enhanced Query Understanding */}
      <div className="bg-white bg-opacity-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-800 flex items-center gap-1">
            <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            AI Query Analysis
            {/* Show if this was a contextual follow-up */}
            {(() => {
              const queryLower = analysis.query.toLowerCase();
              const hasFollowUpIndicators = ['them', 'these', 'those', 'among them', 'from above', 'from the above', 'who among'].some(indicator => 
                queryLower.includes(indicator)
              );
              return hasFollowUpIndicators ? (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                  🔗 Context-Aware
                </span>
              ) : null;
            })()}
          </h4>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>Confidence: {Math.round(analysis.queryUnderstanding.confidence * 100)}%</span>
            <span>•</span>
            <span>{analysis.totalProcessingTime}ms</span>
          </div>
        </div>
        
        {/* Primary Query Type Badge */}
        <div className="mb-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getQueryTypeColor(analysis.queryUnderstanding.queryType)}`}>
            {getQueryTypeDisplay(analysis.queryUnderstanding.queryType)}
          </span>
        </div>

        {/* Secondary Aspects */}
        {analysis.queryUnderstanding.secondaryAspects && analysis.queryUnderstanding.secondaryAspects.length > 0 && (
          <div className="mb-2">
            <span className="text-xs text-gray-600 mr-2">Also includes:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {analysis.queryUnderstanding.secondaryAspects.map((aspect: string, index: number) => (
                <span key={index} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                  {getSecondaryAspectDisplay(aspect)}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-600 mb-2">
          <strong>Intent:</strong> {analysis.queryUnderstanding.intent}
        </p>
        
        {/* Key Requirements */}
        {analysis.queryUnderstanding.keyRequirements && analysis.queryUnderstanding.keyRequirements.length > 0 && (
          <div className="text-xs text-gray-600 mb-2">
            <strong>Key Requirements:</strong>
            <div className="flex flex-wrap gap-1 mt-1">
              {analysis.queryUnderstanding.keyRequirements.map((req, index) => (
                <span key={index} className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                  {req}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Extracted Criteria Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
          {analysis.queryUnderstanding.extractedCriteria.platforms && (
            <div>
              <strong>Platforms:</strong> {analysis.queryUnderstanding.extractedCriteria.platforms.join(', ')}
            </div>
          )}
          
          {analysis.queryUnderstanding.extractedCriteria.niches && (
            <div>
              <strong>Niches:</strong> {analysis.queryUnderstanding.extractedCriteria.niches.join(', ')}
            </div>
          )}
          
          {analysis.queryUnderstanding.extractedCriteria.followerRange && (
            <div>
              <strong>Audience Size:</strong> {analysis.queryUnderstanding.extractedCriteria.followerRange}
            </div>
          )}

          {analysis.queryUnderstanding.extractedCriteria.budget && (
            <div>
              <strong>Budget Focus:</strong> {analysis.queryUnderstanding.extractedCriteria.budget}
            </div>
          )}

          {analysis.queryUnderstanding.extractedCriteria.location && (
            <div>
              <strong>Location:</strong> {analysis.queryUnderstanding.extractedCriteria.location}
            </div>
          )}

          {analysis.queryUnderstanding.extractedCriteria.qualityRequirements && (
            <div>
              <strong>Quality:</strong> {analysis.queryUnderstanding.extractedCriteria.qualityRequirements.join(', ')}
            </div>
          )}

          {analysis.queryUnderstanding.extractedCriteria.contentTypes && (
            <div>
              <strong>Content:</strong> {analysis.queryUnderstanding.extractedCriteria.contentTypes.join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Top Recommendations */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-800">
            🎯 Intelligent Recommendations ({analysis.matchedCreators.length} found)
          </h4>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-purple-600 hover:underline"
          >
            {showDetails ? 'Show Less' : 'Show Details'}
          </button>
        </div>
        
        {analysis.matchedCreators.slice(0, showDetails ? 10 : 3).map((match) => (
          <LLMCreatorCard key={match.creator.id} match={match} showDetails={showDetails} queryType={analysis.queryUnderstanding.queryType} />
        ))}
      </div>

      {/* AI Suggestions */}
      {analysis.suggestions.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-purple-800 mb-2 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            Smart Suggestions
          </h4>
          <ul className="text-xs text-purple-700 space-y-1">
            {analysis.suggestions.map((suggestion, index) => (
              <li key={index}>• {suggestion}</li>
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
}

function LLMCreatorCard({ match, showDetails, queryType }: LLMCreatorCardProps) {
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
    return (creator.rates.post / creator.metrics.followers * 1000).toFixed(2);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
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
                className="font-medium text-gray-900 hover:text-purple-600 transition-colors"
              >
                {creator.name}
              </Link>
              {creator.verified && (
                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              )}
            </div>
            <div className="text-right">
              <div className={`text-sm font-bold ${getRecommendationColor(recommendationLevel)}`}>
                {relevanceScore}% match
              </div>
              <div className="text-xs text-gray-500">
                {getRecommendationBadge(recommendationLevel)}
              </div>
            </div>
          </div>
          
          <div className="text-xs text-gray-600 mb-2">
            {creator.username} • {creator.platform} • {creator.metrics.followers.toLocaleString()} followers
          </div>
          
          {/* LLM Reasoning */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded p-2 mb-2">
            <div className="flex items-center gap-1 mb-1">
              <svg className="w-3 h-3 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="text-xs font-medium text-purple-700">AI Analysis</span>
            </div>
            <p className="text-xs text-purple-600">{reasoning}</p>
          </div>
          
          {/* Enhanced Metrics for Budget Optimization */}
          {queryType === 'budget_optimization' && (
            <div className="bg-green-50 rounded p-2 mb-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium text-green-700">💰 Value Analysis</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-green-600">Cost per 1K followers:</span>
                  <div className="font-medium text-green-800">₹{calculateCostPerFollower()}</div>
                </div>
                {costEffectivenessScore && (
                  <div>
                    <span className="text-green-600">Value Score:</span>
                    <div className="font-medium text-green-800">{costEffectivenessScore}/100</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reach Potential for Reach Maximization */}
          {queryType === 'reach_maximization' && reachPotential && (
            <div className="bg-blue-50 rounded p-2 mb-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium text-blue-700">📈 Reach Analysis</span>
              </div>
              <p className="text-xs text-blue-600">{reachPotential}</p>
            </div>
          )}
          
          {showDetails && (
            <div className="space-y-2">
              {/* Strengths */}
              <div>
                <h5 className="text-xs font-medium text-gray-700 mb-1">Strengths:</h5>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {strengths.map((strength, index) => (
                    <li key={index}>• {strength}</li>
                  ))}
                </ul>
              </div>
              
              {/* Concerns */}
              {concerns && concerns.length > 0 && (
                <div className="bg-orange-50 rounded p-2">
                  <h5 className="text-xs font-medium text-orange-700 mb-1">Considerations:</h5>
                  <ul className="text-xs text-orange-600 space-y-0.5">
                    {concerns.map((concern, index) => (
                      <li key={index}>• {concern}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center bg-gray-50 rounded p-1">
                  <div className="font-medium text-gray-900">{creator.metrics.engagementRate}%</div>
                  <div className="text-gray-600">Engagement</div>
                </div>
                <div className="text-center bg-gray-50 rounded p-1">
                  <div className="font-medium text-gray-900">{creator.rating}/5</div>
                  <div className="text-gray-600">Rating</div>
                </div>
                <div className="text-center bg-gray-50 rounded p-1">
                  <div className="font-medium text-gray-900">₹{creator.rates.post}</div>
                  <div className="text-gray-600">Per Post</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 