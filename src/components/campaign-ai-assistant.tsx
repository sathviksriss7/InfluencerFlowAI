import { useState } from 'react';
import { campaignAIAssistant, type CampaignAnalysisResponse } from '../services/campaign-ai-assistant';
import { mockCreators } from '../mock-data/creators';

interface CampaignAIAssistantProps {
  onAnalysisComplete?: (analysis: CampaignAnalysisResponse) => void;
}

export default function CampaignAIAssistant({ onAnalysisComplete }: CampaignAIAssistantProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CampaignAnalysisResponse | null>(null);
  
  // Form state
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState(5000);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['brand_awareness']);
  const [industry, setIndustry] = useState('fashion');

  const goals = [
    { id: 'brand_awareness', label: 'Brand Awareness', description: 'Increase brand visibility and recognition' },
    { id: 'engagement', label: 'Engagement', description: 'Drive likes, comments, and shares' },
    { id: 'conversions', label: 'Conversions', description: 'Generate leads and sign-ups' },
    { id: 'reach', label: 'Reach', description: 'Maximize audience exposure' },
    { id: 'sales', label: 'Sales', description: 'Drive direct sales and revenue' }
  ];

  const industries = [
    'fashion', 'fitness', 'beauty', 'tech', 'food', 'travel', 'lifestyle', 'business'
  ];

  const handleGoalToggle = (goalId: string) => {
    setSelectedGoals(prev => 
      prev.includes(goalId) 
        ? prev.filter(id => id !== goalId)
        : [...prev, goalId]
    );
  };

  const handleAnalyze = async () => {
    if (!description.trim() || selectedGoals.length === 0) return;

    setIsAnalyzing(true);
    try {
      const result = await campaignAIAssistant.analyzeCampaignRequirements(
        description,
        budget,
        selectedGoals,
        industry,
        mockCreators
      );
      setAnalysis(result);
      onAnalysisComplete?.(result);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAnalysis = () => {
    setAnalysis(null);
    setDescription('');
    setBudget(5000);
    setSelectedGoals(['brand_awareness']);
    setIndustry('fashion');
  };

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Campaign AI Assistant</h3>
            <p className="text-sm text-purple-100">Get intelligent recommendations for your campaign strategy</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {!analysis ? (
          /* Input Form */
          <div className="space-y-6">
            {/* Campaign Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Describe your campaign goals and requirements
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 'We're launching a new sustainable fashion line targeting young professionals. Looking for authentic content creators who can showcase our products in lifestyle settings. Need urgent campaign for product launch next month.'"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Budget and Industry */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget (₹)
                </label>
                <input
                  type="number"
                  id="budget"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  min="500"
                  max="50000"
                  step="500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-2">
                  Industry
                </label>
                <select
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  {industries.map(ind => (
                    <option key={ind} value={ind}>
                      {ind.charAt(0).toUpperCase() + ind.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Goals Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Campaign Goals (select all that apply)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {goals.map(goal => (
                  <label
                    key={goal.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedGoals.includes(goal.id)
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGoals.includes(goal.id)}
                      onChange={() => handleGoalToggle(goal.id)}
                      className="mt-1 text-purple-600 rounded"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{goal.label}</div>
                      <div className="text-sm text-gray-600">{goal.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Analyze Button */}
            <button
              onClick={handleAnalyze}
              disabled={!description.trim() || selectedGoals.length === 0 || isAnalyzing}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isAnalyzing ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Analyzing Campaign...
                </div>
              ) : (
                'Analyze Campaign with AI'
              )}
            </button>
          </div>
        ) : (
          /* Analysis Results */
          <AnalysisResults analysis={analysis} onReset={resetAnalysis} />
        )}
      </div>
    </div>
  );
}

interface AnalysisResultsProps {
  analysis: CampaignAnalysisResponse;
  onReset: () => void;
}

function AnalysisResults({ analysis, onReset }: AnalysisResultsProps) {
  const [activeTab, setActiveTab] = useState<'strategy' | 'creators' | 'budget' | 'timeline'>('strategy');

  return (
    <div className="space-y-6">
      {/* Analysis Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-900">Campaign Analysis Complete</h4>
          <p className="text-sm text-gray-600">Analysis completed in {analysis.processingTime}ms</p>
        </div>
        <button
          onClick={onReset}
          className="text-purple-600 hover:text-purple-700 font-medium text-sm"
        >
          New Analysis
        </button>
      </div>

      {/* AI Insights */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-purple-600 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <div>
            <h5 className="font-medium text-purple-900 mb-1">AI Insights</h5>
            <p className="text-sm text-purple-800">{analysis.suggestion.aiInsights}</p>
          </div>
        </div>
      </div>

      {/* ROI Estimate */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h5 className="font-medium text-green-900 mb-2">Estimated ROI</h5>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 rounded-lg p-3">
            <h4 className="font-medium text-green-800 mb-2">Conservative Estimate</h4>
            <div className="text-lg font-bold text-green-900">₹{analysis.estimatedROI.conservative.toLocaleString()}</div>
            <p className="text-sm text-green-700">Expected minimum ROI</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <h4 className="font-medium text-green-800 mb-2">Optimistic Estimate</h4>
            <div className="text-lg font-bold text-green-900">₹{analysis.estimatedROI.optimistic.toLocaleString()}</div>
            <p className="text-sm text-green-700">Potential maximum ROI</p>
          </div>
        </div>
        <p className="text-xs text-green-600 mt-2">{analysis.estimatedROI.explanation}</p>
      </div>

      {/* Tabs */}
      <div>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'strategy', label: 'Strategy' },
              { id: 'creators', label: 'Creators' },
              { id: 'budget', label: 'Budget' },
              { id: 'timeline', label: 'Timeline' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-4">
          {activeTab === 'strategy' && <StrategyTab analysis={analysis} />}
          {activeTab === 'creators' && <CreatorsTab analysis={analysis} />}
          {activeTab === 'budget' && <BudgetTab analysis={analysis} />}
          {activeTab === 'timeline' && <TimelineTab analysis={analysis} />}
        </div>
      </div>
    </div>
  );
}

function StrategyTab({ analysis }: { analysis: CampaignAnalysisResponse }) {
  return (
    <div className="space-y-4">
      <div>
        <h5 className="font-medium text-gray-900 mb-2">Recommended Strategy</h5>
        <p className="text-gray-700">{analysis.suggestion.strategy}</p>
      </div>

      <div>
        <h5 className="font-medium text-gray-900 mb-3">Creator Types</h5>
        <div className="space-y-3">
          {analysis.suggestion.recommendedCreatorTypes.map((type, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3">
              <div className="flex justify-between items-start mb-2">
                <h6 className="font-medium text-gray-900">{type.type}</h6>
                <span className="text-sm text-gray-600">
                  {type.followerRange.min.toLocaleString()} - {type.followerRange.max.toLocaleString()} followers
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">{type.reason}</p>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Cost: </span>
                  <span className="font-medium">₹{type.estimatedCost.min} - ₹{type.estimatedCost.max}</span>
                </div>
                <div>
                  <span className="text-gray-500">Reach: </span>
                  <span className="font-medium">{type.expectedReach.min.toLocaleString()} - {type.expectedReach.max.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {analysis.suggestion.riskFactors.length > 0 && (
        <div>
          <h5 className="font-medium text-gray-900 mb-2">Risk Factors</h5>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            {analysis.suggestion.riskFactors.map((risk, index) => (
              <li key={index}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h5 className="font-medium text-gray-900 mb-2">Success Metrics</h5>
        <div className="flex flex-wrap gap-2">
          {analysis.suggestion.successMetrics.map((metric, index) => (
            <span key={index} className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              {metric}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreatorsTab({ analysis }: { analysis: CampaignAnalysisResponse }) {
  return (
    <div className="space-y-4">
      <h5 className="font-medium text-gray-900">Recommended Creators ({analysis.recommendedCreators.length})</h5>
      <div className="space-y-3">
        {analysis.recommendedCreators.slice(0, 10).map(creator => (
          <div key={creator.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
            <img src={creator.avatar} alt={creator.name} className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{creator.name}</span>
                {creator.verified && (
                  <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                )}
              </div>
              <div className="text-sm text-gray-600">
                {creator.platform} • {creator.metrics.followers.toLocaleString()} followers • {creator.metrics.engagementRate}% engagement
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium text-gray-900">₹{creator.rates.post}</div>
              <div className="text-xs text-gray-500">per post</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetTab({ analysis }: { analysis: CampaignAnalysisResponse }) {
  return (
    <div className="space-y-4">
      <h5 className="font-medium text-gray-900">Budget Allocation</h5>
      <div className="space-y-3">
        {analysis.suggestion.budgetAllocation.map((allocation, index) => (
          <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <div className="font-medium text-gray-900">{allocation.category}</div>
              <div className="text-sm text-gray-600">{allocation.description}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-gray-900">₹{allocation.amount.toLocaleString()}</div>
              <div className="text-sm text-gray-500">{allocation.percentage}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineTab({ analysis }: { analysis: CampaignAnalysisResponse }) {
  return (
    <div className="space-y-4">
      <h5 className="font-medium text-gray-900">Recommended Timeline</h5>
      <div className="space-y-4">
        {analysis.suggestion.timelineRecommendation.map((phase, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <h6 className="font-medium text-gray-900">{phase.phase}</h6>
              <span className="text-sm text-gray-600">{phase.duration}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              {phase.activities.map((activity, actIndex) => (
                <li key={actIndex}>{activity}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {analysis.alternatives.length > 0 && (
        <div>
          <h5 className="font-medium text-gray-900 mb-3">Alternative Strategies</h5>
          <div className="space-y-3">
            {analysis.alternatives.map((alt, index) => (
              <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h6 className="font-medium text-blue-900">{alt.title}</h6>
                <p className="text-sm text-blue-800 mb-2">{alt.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-blue-700">Budget Impact: </span>
                    <span className="font-medium">{alt.budgetImpact}</span>
                  </div>
                  <div>
                    <span className="text-blue-700">Expected Outcome: </span>
                    <span className="font-medium">{alt.expectedOutcome}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 