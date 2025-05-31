import { useState } from 'react';
import { Link } from 'react-router-dom';
import CampaignAIAssistant from '../components/campaign-ai-assistant';

interface CampaignForm {
  title: string;
  brand: string;
  description: string;
  brief: string;
  platforms: string[];
  minFollowers: number;
  niches: string[];
  locations: string[];
  deliverables: string[];
  budgetMin: number;
  budgetMax: number;
  startDate: string;
  endDate: string;
  applicationDeadline: string;
}

export default function CreateCampaign() {
  const [currentStep, setCurrentStep] = useState(1);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [formData, setFormData] = useState<CampaignForm>({
    title: '',
    brand: '',
    description: '',
    brief: '',
    platforms: [],
    minFollowers: 10000,
    niches: [],
    locations: [],
    deliverables: [],
    budgetMin: 1000,
    budgetMax: 5000,
    startDate: '',
    endDate: '',
    applicationDeadline: ''
  });

  const platforms = ['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin'];
  const niches = ['fashion', 'fitness', 'technology', 'food', 'travel', 'gaming', 'beauty', 'lifestyle', 'health', 'entertainment'];
  const countries = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'India', 'Japan'];

  const deliverableOptions = [
    'Instagram Posts',
    'Instagram Stories',
    'Instagram Reels',
    'YouTube Videos',
    'TikTok Videos',
    'Product Reviews',
    'Unboxing Content',
    'Behind-the-scenes Content',
    'Tutorial Content',
    'Brand Mentions'
  ];

  const updateForm = (field: keyof CampaignForm, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleArrayItem = (field: keyof CampaignForm, item: string) => {
    const currentArray = formData[field] as string[];
    const newArray = currentArray.includes(item)
      ? currentArray.filter(i => i !== item)
      : [...currentArray, item];
    updateForm(field, newArray);
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 5));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.title && formData.brand && formData.description;
      case 2:
        return formData.platforms.length > 0 && formData.niches.length > 0;
      case 3:
        return formData.deliverables.length > 0;
      case 4:
        return formData.budgetMin > 0 && formData.budgetMax > formData.budgetMin;
      case 5:
        return formData.startDate && formData.endDate && formData.applicationDeadline;
      default:
        return false;
    }
  };

  const steps = [
    { number: 1, title: 'Basic Information', description: 'Campaign details and description' },
    { number: 2, title: 'Requirements', description: 'Platform and audience requirements' },
    { number: 3, title: 'Deliverables', description: 'Content requirements and deliverables' },
    { number: 4, title: 'Budget', description: 'Budget range and compensation' },
    { number: 5, title: 'Timeline', description: 'Campaign dates and deadlines' }
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="e.g., Summer Fitness Challenge 2024"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand Name *
              </label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => updateForm('brand', e.target.value)}
                placeholder="e.g., FitTech Pro"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Campaign Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateForm('description', e.target.value)}
                placeholder="Brief description of your campaign..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Detailed Brief
              </label>
              <textarea
                value={formData.brief}
                onChange={(e) => updateForm('brief', e.target.value)}
                placeholder="Detailed campaign brief and expectations..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Platforms * (Select at least one)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {platforms.map(platform => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => toggleArrayItem('platforms', platform)}
                    className={`p-3 border rounded-lg text-sm font-medium capitalize transition-colors ${
                      formData.platforms.includes(platform)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {platform}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Followers
              </label>
              <select
                value={formData.minFollowers}
                onChange={(e) => updateForm('minFollowers', Number(e.target.value))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value={1000}>1,000+</option>
                <option value={10000}>10,000+</option>
                <option value={50000}>50,000+</option>
                <option value={100000}>100,000+</option>
                <option value={500000}>500,000+</option>
                <option value={1000000}>1,000,000+</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Niches * (Select at least one)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {niches.map(niche => (
                  <button
                    key={niche}
                    type="button"
                    onClick={() => toggleArrayItem('niches', niche)}
                    className={`p-3 border rounded-lg text-sm font-medium capitalize transition-colors ${
                      formData.niches.includes(niche)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {niche}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Locations (Optional)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {countries.map(country => (
                  <button
                    key={country}
                    type="button"
                    onClick={() => toggleArrayItem('locations', country)}
                    className={`p-3 border rounded-lg text-sm font-medium transition-colors ${
                      formData.locations.includes(country)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {country}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deliverables * (Select what creators should deliver)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {deliverableOptions.map(deliverable => (
                  <button
                    key={deliverable}
                    type="button"
                    onClick={() => toggleArrayItem('deliverables', deliverable)}
                    className={`p-3 border rounded-lg text-sm font-medium text-left transition-colors ${
                      formData.deliverables.includes(deliverable)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {deliverable}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Requirements
              </label>
              <textarea
                placeholder="Any specific requirements, guidelines, or expectations..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="budgetMin" className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Budget (₹) *
                </label>
                <input
                  type="number"
                  value={formData.budgetMin}
                  onChange={(e) => updateForm('budgetMin', Number(e.target.value))}
                  min="0"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="budgetMax" className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Budget (₹) *
                </label>
                <input
                  type="number"
                  value={formData.budgetMax}
                  onChange={(e) => updateForm('budgetMax', Number(e.target.value))}
                  min={formData.budgetMin}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Budget Range</h4>
              <span className="text-sm text-blue-700">
                ₹{formData.budgetMin.toLocaleString()} - ₹{formData.budgetMax.toLocaleString()}
              </span>
              <p className="text-sm text-blue-600 mt-1">
                This will be the range shown to creators when they apply.
              </p>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Application Deadline *
              </label>
              <input
                type="date"
                value={formData.applicationDeadline}
                onChange={(e) => updateForm('applicationDeadline', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Start Date *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => updateForm('startDate', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign End Date *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => updateForm('endDate', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900 mb-2">Campaign Summary</h4>
              <div className="text-sm text-green-700 space-y-1">
                <p><span className="font-medium">Title:</span> {formData.title}</p>
                <p><span className="font-medium">Brand:</span> {formData.brand}</p>
                <p><span className="font-medium">Platforms:</span> {formData.platforms.join(', ')}</p>
                <p><span className="font-medium">Budget:</span> ₹{formData.budgetMin.toLocaleString()} - ₹{formData.budgetMax.toLocaleString()}</p>
                <p><span className="font-medium">Deliverables:</span> {formData.deliverables.length} items</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              to="/campaigns" 
              className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Campaigns
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New Campaign</h1>
              <p className="text-gray-600">Launch your influencer marketing campaign and connect with creators</p>
            </div>
          </div>
          <button
            onClick={() => setShowAIAssistant(!showAIAssistant)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              showAIAssistant 
                ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
            }`}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {showAIAssistant ? 'Hide AI Assistant' : 'Get AI Help'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className={`${showAIAssistant ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* Progress Steps */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-8">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                    currentStep >= step.number
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    {step.number}
                  </div>
                  <div className="ml-3 hidden sm:block">
                    <p className={`text-sm font-medium ${
                      currentStep >= step.number ? 'text-blue-600' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`ml-4 w-16 h-1 ${
                      currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step Content */}
            <div className="min-h-96">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                {steps[currentStep - 1].title}
              </h2>
              {renderStep()}
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={prevStep}
                disabled={currentStep === 1}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  currentStep === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Previous
              </button>

              <div className="text-sm text-gray-500">
                Step {currentStep} of {steps.length}
              </div>

              <button
                onClick={currentStep === 5 ? () => console.log('Campaign created!', formData) : nextStep}
                disabled={!canProceed()}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  canProceed()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {currentStep === 5 ? 'Create Campaign' : 'Next'}
              </button>
            </div>
          </div>
        </div>

        {/* AI Assistant Sidebar */}
        {showAIAssistant && (
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <CampaignAIAssistant 
                onAnalysisComplete={(analysis) => {
                  // Optionally pre-fill form with AI recommendations
                  console.log('AI Analysis:', analysis);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 