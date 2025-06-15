import { useState } from 'react';
import { 
  aiAgentsService,
  createExampleRequirements,
  type BusinessRequirements,
  type AgentWorkflowResult,
  type CreatorMatch 
} from '../services/ai-agents';
import AIOutreachManager from '../components/ai-outreach-manager';
import NegotiationAgent from '../components/negotiation-agent';

interface WorkflowStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  details?: string;
}

type TabType = 'campaign-builder' | 'negotiation-agent';

export default function AgenticAI() {
  const [activeTab, setActiveTab] = useState<TabType>('campaign-builder');
  const [requirements, setRequirements] = useState<BusinessRequirements>(createExampleRequirements());
  const [isProcessing, setIsProcessing] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<AgentWorkflowResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [showOutreachManager, setShowOutreachManager] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([
    { id: 'campaign', title: 'Building Campaign Strategy', status: 'pending' },
    { id: 'discovery', title: 'Discovering Creators', status: 'pending' },
    { id: 'scoring', title: 'Scoring & Matching', status: 'pending' },
    { id: 'outreach', title: 'Sending Outreach Messages', status: 'pending' },
    { id: 'complete', title: 'Finalizing Results', status: 'pending' }
  ]);

  const isAIAvailable = aiAgentsService.isAvailable();

  const updateRequirements = (field: keyof BusinessRequirements, value: any) => {
    setRequirements(prev => ({ ...prev, [field]: value }));
  };

  const updateArrayField = (field: keyof BusinessRequirements, item: string) => {
    const currentArray = requirements[field] as string[];
    const newArray = currentArray.includes(item)
      ? currentArray.filter(i => i !== item)
      : [...currentArray, item];
    setRequirements(prev => ({ ...prev, [field]: newArray }));
  };

  const runAgenticWorkflow = async () => {
    if (!isAIAvailable) {
      setError('Please set up your Groq API key to use the Agentic AI system.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setWorkflowResult(null);
    setCurrentStep(0);

    setWorkflowSteps(steps => steps.map(step => ({ ...step, status: 'pending', duration: undefined })));

    try {
      setWorkflowSteps(steps => steps.map((s, i) => i === 0 ? { ...s, status: 'running' } : s));
      setCurrentStep(1);
      
      const result = await aiAgentsService.executeFullWorkflow(requirements);

      const totalReportedTime = result.workflowInsights.totalProcessingTime || 2000;

      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 0 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.3) } : step
      ));

      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 1 ? { ...step, status: 'running' } : step
      ));
      setCurrentStep(2);
      await new Promise(resolve => setTimeout(resolve, 300)); 
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 1 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.3) } : step
      ));

      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 2 ? { ...step, status: 'running' } : step
      ));
      setCurrentStep(3);
      await new Promise(resolve => setTimeout(resolve, 200));
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 2 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.2) } : step
      ));

      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 3 ? { ...step, status: 'running' } : step
      ));
      setCurrentStep(4);
      await new Promise(resolve => setTimeout(resolve, 100)); 
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 3 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.1) } : step
      ));

      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 4 ? { ...step, status: 'running' } : step
      ));
      setCurrentStep(5);
      await new Promise(resolve => setTimeout(resolve, 100)); 
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 4 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.1) } : step
      ));

      setWorkflowResult(result);
      setCurrentStep(5);

    } catch (error) {
      console.error('Agentic AI Workflow Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      
      if (errorMessage.includes('Rate limit exceeded')) {
        setError('⏳ API rate limit reached. The system automatically uses offline algorithms when this happens. You can try again in a few minutes for full AI analysis, or proceed with the current results.');
      } else if (errorMessage.includes('API authentication failed')) {
        setError('🔑 API key issue detected. Please check your Groq API key in the .env.local file.');
      } else {
        setError(errorMessage);
      }
      
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === Math.max(0, currentStep - 1) ? { 
          ...step, 
          status: 'error',
          details: errorMessage.includes('Rate limit') ? 'Rate limit - using fallback algorithms' : 'Error occurred'
        } : step
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const resetWorkflow = () => {
    setWorkflowResult(null);
    setCurrentStep(0);
    setError(null);
    setWorkflowSteps(steps => steps.map(step => ({ ...step, status: 'pending', duration: undefined })));
  };

  const getTopCreators = (): CreatorMatch[] => {
    if (!workflowResult) return [];
    return workflowResult.creatorMatches
      .filter(match => match.recommendedAction === 'highly_recommend' || match.recommendedAction === 'recommend')
      .slice(0, 10);
  };

  const platforms = ['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin'];
  const industries = ['Technology', 'Fashion', 'Food & Beverage', 'Fitness', 'Travel', 'Gaming', 'Beauty', 'Education', 'Finance', 'Healthcare'];
  const goalOptions = ['Increase brand awareness', 'Drive sales', 'Build community', 'Product launch', 'Lead generation', 'Content creation'];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white rounded-lg shadow-lg">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold">🤖 Agentic AI System</h1>
                <p className="text-purple-100">
                  Autonomous AI agents for campaign building and deal negotiation
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-100">Powered by</div>
              <div className="text-lg font-semibold">Multi-Agent AI System</div>
            </div>
          </div>

          <div className="flex space-x-1 bg-white bg-opacity-10 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('campaign-builder')}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${
                activeTab === 'campaign-builder'
                  ? 'bg-white text-purple-600 shadow'
                  : 'text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-10'
              }`}
            >
              🚀 Campaign Builder
            </button>
            <button
              onClick={() => setActiveTab('negotiation-agent')}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${
                activeTab === 'negotiation-agent'
                  ? 'bg-white text-purple-600 shadow'
                  : 'text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-10'
              }`}
            >
              🤝 Negotiation Agent
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'campaign-builder' && (
        <>
          {!isAIAvailable && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.232 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                </svg>
                <div>
                  <h3 className="font-medium text-amber-800">Setup Required for Full AI Features</h3>
                  <p className="text-amber-700 text-sm mt-1">
                    Add <code className="bg-amber-100 px-1 rounded">VITE_GROQ_API_KEY="your-key"</code> to your .env.local file.
                    Get your free API key from <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a>.
                    Negotiation Agent voice calls will still work if backend is configured.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAIAvailable && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-blue-800">Smart Rate Limiting</h3>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-blue-700">
                        API Calls: {aiAgentsService.getGlobalStatus().remaining}/{aiAgentsService.getGlobalStatus().total} available
                      </div>
                      <div className="flex gap-1">
                        {[...Array(aiAgentsService.getGlobalStatus().total)].map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-2 h-2 rounded-full ${
                              i < aiAgentsService.getGlobalStatus().remaining 
                                ? 'bg-green-400' 
                                : 'bg-gray-300'
                            }`} 
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-blue-700 text-sm mt-1">
                    Our AI agents automatically manage API rate limits. If limits are reached, the system seamlessly switches to advanced algorithmic analysis to ensure you always get results. 
                    <span className="font-medium"> For best AI analysis, try spacing requests a few minutes apart.</span>
                  </p>
                  {aiAgentsService.getGlobalStatus().remaining === 0 && (
                    <div className="mt-2 p-2 bg-amber-100 border border-amber-200 rounded text-amber-800 text-sm">
                      ⏳ <strong>Rate limit reached:</strong> Next requests will use advanced algorithmic analysis. 
                      API calls reset in ~{Math.ceil((aiAgentsService.getGlobalStatus().resetTime - Date.now()) / 60000)} minute(s) for full AI capabilities.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`${workflowResult ? 'lg:col-span-1' : 'lg:col-span-2'} space-y-6`}>
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  📋 Business Requirements
                </h2>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={requirements.companyName}
                        onChange={(e) => updateRequirements('companyName', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                      <select
                        value={requirements.industry}
                        onChange={(e) => updateRequirements('industry', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      >
                        {industries.map(industry => (
                          <option key={industry} value={industry}>{industry}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product/Service</label>
                    <input
                      type="text"
                      value={requirements.productService}
                      onChange={(e) => updateRequirements('productService', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Goals</label>
                    <div className="grid grid-cols-2 gap-2">
                      {goalOptions.map(goal => (
                        <button
                          key={goal}
                          type="button"
                          onClick={() => updateArrayField('businessGoals', goal)}
                          className={`p-2 border rounded-lg text-sm transition-colors ${
                            requirements.businessGoals.includes(goal)
                              ? 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {goal}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience</label>
                    <input
                      type="text"
                      value={requirements.targetAudience}
                      onChange={(e) => updateRequirements('targetAudience', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Objective</label>
                    <input
                      type="text"
                      value={requirements.campaignObjective}
                      onChange={(e) => updateRequirements('campaignObjective', e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Budget Range (₹)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Min"
                        value={requirements.budgetRange.min}
                        onChange={(e) => updateRequirements('budgetRange', { 
                          ...requirements.budgetRange, 
                          min: Number(e.target.value) 
                        })}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                      <input
                        type="number"
                        placeholder="Max"
                        value={requirements.budgetRange.max}
                        onChange={(e) => updateRequirements('budgetRange', { 
                          ...requirements.budgetRange, 
                          max: Number(e.target.value) 
                        })}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Platforms</label>
                    <div className="grid grid-cols-3 gap-2">
                      {platforms.map(platform => (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => updateArrayField('preferredPlatforms', platform)}
                          className={`p-2 border rounded-lg text-sm capitalize transition-colors ${
                            requirements.preferredPlatforms?.includes(platform)
                              ? 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {platform}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">🤖 Autonomous Outreach</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Creators to Contact</label>
                        <select
                          value={requirements.outreachCount}
                          onChange={(e) => updateRequirements('outreachCount', Number(e.target.value))}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        >
                          <option value={3}>Top 3 creators</option>
                          <option value={5}>Top 5 creators</option>
                          <option value={7}>Top 7 creators</option>
                          <option value={10}>Top 10 creators</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Personalization</label>
                        <button
                          type="button"
                          onClick={() => updateRequirements('personalizedOutreach', !requirements.personalizedOutreach)}
                          className={`w-full p-2 border rounded-lg text-sm transition-colors ${
                            requirements.personalizedOutreach
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          {requirements.personalizedOutreach ? '✨ AI Personalized' : '📝 Template Based'}
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-2">
                      AI agents will automatically send personalized outreach messages to your top-ranked creators and save them to your outreach manager.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={runAgenticWorkflow}
                    disabled={isProcessing || !isAIAvailable}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                      isProcessing || !isAIAvailable
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                    } flex items-center justify-center gap-2`}
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Running AI Agents...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                        🚀 Launch AI Agents
                      </>
                    )}
                  </button>
                  
                  {workflowResult && (
                    <button
                      onClick={resetWorkflow}
                      className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      🔄 Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={`${workflowResult ? 'lg:col-span-2' : 'lg:col-span-1'} space-y-6`}>
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  🤖 AI Agent Progress
                </h2>
                
                <div className="space-y-4">
                  {workflowSteps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.status === 'completed' ? 'bg-green-100 text-green-600' :
                        step.status === 'running' ? 'bg-blue-100 text-blue-600' :
                        step.status === 'error' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-400'
                      }`}>
                        {step.status === 'completed' ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        ) : step.status === 'running' ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                        ) : step.status === 'error' ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                          </svg>
                        ) : (
                          <span className="text-xs font-medium">{index + 1}</span>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <p className={`font-medium ${
                          step.status === 'completed' ? 'text-green-600' :
                          step.status === 'running' ? 'text-blue-600' :
                          step.status === 'error' ? 'text-red-600' :
                          'text-gray-500'
                        }`}>
                          {step.title}
                        </p>
                        {step.duration && (
                          <p className="text-xs text-gray-500">
                            Completed in {step.duration}ms
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 text-sm">❌ {error}</p>
                  </div>
                )}
              </div>

              {workflowResult && (
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                      🎯 AI Generated Results
                    </h2>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(workflowResult.workflowInsights.confidenceScore * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">Confidence</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-sm font-medium text-blue-900">Campaign Created</div>
                      <div className="text-xl font-bold text-blue-600">{workflowResult.generatedCampaign.title}</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-sm font-medium text-green-900">Creators Found</div>
                      <div className="text-xl font-bold text-green-600">{workflowResult.creatorMatches.length}</div>
                    </div>
                  </div>

                  {workflowResult.outreachSummary && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <div className="text-sm font-medium text-purple-900">Outreach Sent</div>
                        <div className="text-xl font-bold text-purple-600">{workflowResult.outreachSummary.totalSent}</div>
                        <div className="text-xs text-purple-700">
                          {workflowResult.outreachSummary.aiGenerated} AI + {workflowResult.outreachSummary.templateBased} Template
                        </div>
                      </div>
                      <div className="bg-orange-50 p-3 rounded-lg">
                        <div className="text-sm font-medium text-orange-900">Success Rate</div>
                        <div className="text-xl font-bold text-orange-600">
                          {workflowResult.outreachSummary.failed === 0 ? '100%' : 
                            `${Math.round((workflowResult.outreachSummary.totalSent / (workflowResult.outreachSummary.totalSent + workflowResult.outreachSummary.failed)) * 100)}%`}
                        </div>
                        <div className="text-xs text-orange-700">
                          {workflowResult.outreachSummary.failed} failed
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Campaign Strategy</h4>
                      <p className="text-sm text-gray-600">{workflowResult.generatedCampaign.aiInsights.strategy}</p>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-gray-900">Top Creator Matches</h4>
                      <div className="space-y-2">
                        {getTopCreators().slice(0, 3).map((match, _index) => (
                          <div key={match.creator.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-2">
                              <img
                                src={match.creator.avatar}
                                alt={match.creator.name}
                                className="w-6 h-6 rounded-full"
                              />
                              <span className="text-sm font-medium">{match.creator.name}</span>
                            </div>
                            <div className="text-sm font-medium text-green-600">{match.score}% match</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => setShowOutreachManager(true)}
                      disabled={getTopCreators().length === 0}
                      className="w-full mt-4 px-4 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                      </svg>
                      {workflowResult.outreachSummary ? '📧 View Outreach Manager' : '🚀 Launch Manual Outreach'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'negotiation-agent' && (
        <NegotiationAgent key="negotiation-agent-instance" />
      )}

      {activeTab === 'campaign-builder' && workflowResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            📊 Complete AI Agent Results
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                📋 Generated Campaign
              </h3>
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">{workflowResult.generatedCampaign.title}</h4>
                  <p className="text-gray-600 mt-1">{workflowResult.generatedCampaign.description}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-gray-700">Platforms</div>
                    <div className="text-sm text-gray-600">{workflowResult.generatedCampaign.platforms.join(', ')}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700">Budget</div>
                    <div className="text-sm text-gray-600">₹{workflowResult.generatedCampaign.budgetMin.toLocaleString()} - ₹{workflowResult.generatedCampaign.budgetMax.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700">Target Niches</div>
                    <div className="text-sm text-gray-600">{workflowResult.generatedCampaign.niches.join(', ')}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-700">Min Followers</div>
                    <div className="text-sm text-gray-600">{workflowResult.generatedCampaign.minFollowers.toLocaleString()}+</div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">AI Strategy Insights</div>
                  <div className="text-sm text-gray-600">{workflowResult.generatedCampaign.aiInsights.reasoning}</div>
                </div>

                <div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Success Factors</div>
                  <ul className="text-sm text-gray-600">
                    {workflowResult.generatedCampaign.aiInsights.successFactors.map((factor, index) => (
                      <li key={index}>• {factor}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  👥 Creator Matches ({workflowResult.creatorMatches.length})
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {workflowResult.creatorMatches.slice(0, 5).map((match) => (
                    <div key={match.creator.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={match.creator.avatar}
                            alt={match.creator.name}
                            className="w-6 h-6 rounded-full"
                          />
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{match.creator.name}</div>
                            <div className="text-xs text-gray-500">{match.creator.platform} • {match.creator.metrics.followers.toLocaleString()} followers</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">{match.score}%</div>
                          <div className={`text-xs px-2 py-1 rounded-full ${
                            match.recommendedAction === 'highly_recommend' ? 'bg-green-100 text-green-800' :
                            match.recommendedAction === 'recommend' ? 'bg-blue-100 text-blue-800' :
                            match.recommendedAction === 'consider' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {match.recommendedAction.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">{match.reasoning}</div>
                    </div>
                  ))}
                  {workflowResult.creatorMatches.length > 5 && (
                    <div className="text-center text-sm text-gray-500">
                      +{workflowResult.creatorMatches.length - 5} more creators...
                    </div>
                  )}
                </div>
              </div>

              {workflowResult.outreachSummary && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    📧 Outreach Results
                  </h3>
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{workflowResult.outreachSummary.totalSent}</div>
                        <div className="text-sm text-gray-600">Messages Sent</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {workflowResult.outreachSummary.failed === 0 ? '100%' : 
                            `${Math.round((workflowResult.outreachSummary.totalSent / (workflowResult.outreachSummary.totalSent + workflowResult.outreachSummary.failed)) * 100)}%`}
                        </div>
                        <div className="text-sm text-gray-600">Success Rate</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">AI Personalized:</span>
                        <span className="font-medium text-blue-600">{workflowResult.outreachSummary.aiGenerated}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Template Based:</span>
                        <span className="font-medium text-purple-600">{workflowResult.outreachSummary.templateBased}</span>
                      </div>
                      {workflowResult.outreachSummary.failed > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Failed:</span>
                          <span className="font-medium text-red-600">{workflowResult.outreachSummary.failed}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        All outreach messages have been automatically saved to your outreach manager. 
                        You can track responses and manage follow-ups from there.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showOutreachManager && workflowResult && (
        <AIOutreachManager
          searchResults={getTopCreators().map(match => match.creator)}
          onClose={() => setShowOutreachManager(false)}
        />
      )}
    </div>
  );
} 