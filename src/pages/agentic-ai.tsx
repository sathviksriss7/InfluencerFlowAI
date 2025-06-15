import { useState, type ChangeEvent, type FormEvent } from 'react';
import { 
  aiAgentsService,
  createExampleRequirements,
  type BusinessRequirements,
  type AgentWorkflowResult,
  type CreatorMatch 
} from '../services/ai-agents';
import AIOutreachManager from '../components/ai-outreach-manager';
import NegotiationAgent from '../components/negotiation-agent';
import { supabase } from '../lib/supabase';

interface WorkflowStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  details?: string;
}

type TabType = 'campaign-builder' | 'negotiation-agent';

type InputMethod = 'manual' | 'upload';

// Helper function to parse budget strings
const parseBudgetFromString = (budgetStr: string): { min: number; max: number } => {
  if (!budgetStr || typeof budgetStr !== 'string') {
    return { min: 0, max: 0 };
  }

  let str = budgetStr.toLowerCase();
  // Remove currency symbols and common words to simplify parsing
  str = str.replace(/₹|\\$|€|£|inr|usd|eur|gbp|aud|cad/g, '');
  str = str.replace(/around|approx\\.?|up to|about/g, '');
  str = str.trim();

  const numbers = [];
  // Regex to find numbers, potentially with "k" for thousands
  const numRegex = /(\\d+\\.?\\d*k?)/g;
  let match;
  while ((match = numRegex.exec(str)) !== null) {
    let numStr = match[1];
    let numVal;
    if (numStr.endsWith('k')) {
      numVal = parseFloat(numStr.substring(0, numStr.length - 1)) * 1000;
    } else {
      numVal = parseFloat(numStr);
    }
    if (!isNaN(numVal)) {
      numbers.push(numVal);
    }
  }

  if (numbers.length === 0) {
    return { min: 0, max: 0 };
  } else if (numbers.length === 1) {
    return { min: numbers[0], max: numbers[0] };
  } else {
    // If multiple numbers, assume the smallest is min and largest is max
    return { min: Math.min(...numbers), max: Math.max(...numbers) };
  }
};

export default function AgenticAI() {
  const [activeTab, setActiveTab] = useState<TabType>('campaign-builder');
  const [requirements, setRequirements] = useState<BusinessRequirements>(createExampleRequirements());
  const [isProcessing, setIsProcessing] = useState(false);
  const [workflowResult, setWorkflowResult] = useState<AgentWorkflowResult | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [showOutreachManager, setShowOutreachManager] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inputMethod, setInputMethod] = useState<InputMethod>('manual');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUploadStatus, setFileUploadStatus] = useState<'idle' | 'uploading' | 'extracting' | 'success' | 'error'>('idle');
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);

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

  const updateBudget = (part: 'min' | 'max', value: string) => {
    const numValue = parseInt(value, 10);
    setRequirements(prev => ({
      ...prev,
      budgetRange: {
        ...prev.budgetRange,
        [part]: isNaN(numValue) ? 0 : numValue, // Default to 0 or some other sensible default if parsing fails
      }
    }));
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
      
      console.log("🚀 UI: Calling executeFullWorkflow with requirements:", JSON.stringify(requirements, null, 2));
      const result: AgentWorkflowResult | null = await aiAgentsService.executeFullWorkflow(requirements);
      console.log("🚀 UI: Received result from executeFullWorkflow:", JSON.stringify(result, null, 2));

      if (result && result.workflowInsights && typeof result.workflowInsights.totalProcessingTime === 'number') {
      const totalReportedTime = result.workflowInsights.totalProcessingTime || 2000;

      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 0 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.3) } : step
      ));
      setCurrentStep(2);
        await new Promise(resolve => setTimeout(resolve, 100));
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 1 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.3) } : step
      ));
      setCurrentStep(3);
        await new Promise(resolve => setTimeout(resolve, 100));
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 2 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.2) } : step
      ));
      setCurrentStep(4);
      await new Promise(resolve => setTimeout(resolve, 100)); 
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 3 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.1) } : step
      ));
      setWorkflowSteps(steps => steps.map((step, index) => 
        index === 4 ? { ...step, status: 'completed', duration: Math.floor(totalReportedTime * 0.1) } : step
      ));

      setWorkflowResult(result);
      setCurrentStep(5);
        console.log("🚀 UI: Workflow successfully completed and results set.");

      } else {
        console.error('🚀 UI: executeFullWorkflow returned null or invalid result structure. Logging result:', JSON.stringify(result, null, 2));
        setError("Workflow completed but results are improperly structured. Check console.");
        setWorkflowSteps(steps => steps.map(step => ({ ...step, status: 'error', details: 'Result structure error' })));
        setWorkflowResult(result); 
      }

    } catch (err) {
      console.error('🚀 UI: CATCH block in runAgenticWorkflow. Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during the workflow.';
        setError(errorMessage);
      setWorkflowSteps(steps => steps.map((s, i) => i === (currentStep > 0 ? currentStep -1 : 0) ? { ...s, status: 'error', details: errorMessage.substring(0,100)} : s));
      // setWorkflowResult(null); // Keep previous result if error happens later?
    } finally {
      setIsProcessing(false);
      console.log("🚀 UI: runAgenticWorkflow finally block. isProcessing: false.");
    }
  };

  const resetWorkflow = () => {
    setWorkflowResult(null);
    setCurrentStep(0);
    setError(null);
    setWorkflowSteps(steps => steps.map(step => ({ ...step, status: 'pending', duration: undefined })));
    setInputMethod('manual'); // Reset input method as well if desired
    setRequirements(createExampleRequirements()); // Reset form to default
  };

  const getTopCreators = (): CreatorMatch[] => {
    if (!workflowResult || !workflowResult.creatorMatches) return [];
    // Example: filter or sort if needed, here just returning a slice
    return workflowResult.creatorMatches.slice(0, 10); 
  };

  const platforms = ['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin'];
  const industries = ['Technology', 'Fashion', 'Food & Beverage', 'Fitness', 'Travel', 'Gaming', 'Beauty', 'Education', 'Finance', 'Healthcare'];
  const goalOptions = ['Increase brand awareness', 'Drive sales', 'Build community', 'Product launch', 'Lead generation', 'Content creation'];

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setFileUploadStatus('idle');
      setFileUploadError(null);
    } else {
      setSelectedFile(null);
    }
  };

  const handleFileUploadAndExtract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setFileUploadError('Please select a file first.');
      return;
    }
    setFileUploadStatus('uploading'); setFileUploadError(null); setError(null);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) { throw new Error('Authentication error. Please sign in again.'); }
      const token = session.access_token;
      const formData = new FormData();
      formData.append('file', selectedFile);
      const backendUrl = import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:5001';
      const response = await fetch(`${backendUrl}/api/campaign/extract_from_document`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData,
      });
      setFileUploadStatus('extracting');
      const result = await response.json();
      if (!response.ok || !result.success) { throw new Error(result.error || `HTTP error! status: ${response.status}`); }
      if (result.structured_requirements) {
        const extracted = result.structured_requirements;
        setRequirements(prevReqs => {
          const newReqs = { ...prevReqs }; // Start with a copy of previous requirements

          // String fields: if LLM returns null, set to empty string, otherwise use extracted value.
          newReqs.companyName = extracted.brand_name === null ? '' : extracted.brand_name;
          newReqs.productService = extracted.product_service_name === null ? '' : extracted.product_service_name;
          newReqs.targetAudience = extracted.target_audience_description === null ? '' : extracted.target_audience_description;
          newReqs.keyMessage = (extracted.key_message_points === null || (Array.isArray(extracted.key_message_points) && extracted.key_message_points.length === 0)) 
            ? '' 
            : Array.isArray(extracted.key_message_points) ? extracted.key_message_points.join(', ') : String(extracted.key_message_points);
          newReqs.timeline = extracted.timeline_indication === null ? '' : extracted.timeline_indication;
          newReqs.specialRequirements = extracted.other_notes_or_mandatories === null ? '' : extracted.other_notes_or_mandatories;

          // Array fields: if LLM returns null or empty array, set to empty array.
          newReqs.industry = (extracted.industry === null || !Array.isArray(extracted.industry) || extracted.industry.length === 0)
            ? []
            : extracted.industry.map((ind: unknown) => String(ind).trim()).filter((ind: string) => ind && industries.includes(ind));

          const objectivesFromBrief = (extracted.campaign_objectives && Array.isArray(extracted.campaign_objectives))
            ? extracted.campaign_objectives.map((obj: unknown) => String(obj).trim()).filter((obj: string) => obj && goalOptions.includes(obj))
            : [];
          
          newReqs.campaignObjective = objectivesFromBrief;
          newReqs.businessGoals = objectivesFromBrief.length > 0 ? [...objectivesFromBrief] : []; // Mirror objectives for now

          newReqs.preferredPlatforms = (extracted.platform_preferences === null || !Array.isArray(extracted.platform_preferences) || extracted.platform_preferences.length === 0)
            ? []
            : extracted.platform_preferences.map((p:any) => String(p).toLowerCase().trim()).filter((p:string) => platforms.includes(p));
          
          // MODIFIED: Always set locations to ['India'] regardless of brief content
          newReqs.locations = ['India'];

          // Budget Range: Use the new parsing function
          if (extracted.budget_indication === null) {
            newReqs.budgetRange = { min: 0, max: 0 };
          } else if (typeof extracted.budget_indication === 'string') {
            newReqs.budgetRange = parseBudgetFromString(extracted.budget_indication);
          } else if (typeof extracted.budget_indication === 'object' && extracted.budget_indication !== null && 'min' in extracted.budget_indication && 'max' in extracted.budget_indication) {
            // If backend directly provides min/max
            const minVal = Number(extracted.budget_indication.min);
            const maxVal = Number(extracted.budget_indication.max);
            newReqs.budgetRange = { 
              min: isNaN(minVal) ? 0 : minVal, 
              max: isNaN(maxVal) ? 0 : maxVal 
            };
          }
          else {
            // Fallback to previous requirements if budget_indication is in an unexpected format
            newReqs.budgetRange = prevReqs.budgetRange;
          }
          
          return newReqs;
        });
        setFileUploadStatus('success'); setSelectedFile(null); alert('Requirements extracted!'); setInputMethod('manual');
      } else { throw new Error('No structured requirements in response.'); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown upload error.';
      setFileUploadError(msg); setError(msg); setFileUploadStatus('error');
    }
  };

  console.log('[AgenticAI Component Render] States -- isProcessing:', isProcessing, 'currentStep:', currentStep, 'error:', error);
  console.log('[AgenticAI Component Render] workflowResult:', workflowResult ? 'Exists with ' + (workflowResult.creatorMatches?.length || 0) + ' matches' : 'NULL');

  const renderWorkflowContent = () => {
    console.log('[AgenticAI renderWorkflowContent] Called. isProcessing:', isProcessing, 'error:', error, 'workflowResult:', workflowResult ? 'Exists' : 'NULL');

    if (isProcessing && !workflowResult && currentStep > 0 && currentStep < 5) { // Show if processing and no final result yet, and not on final step
      console.log('[AgenticAI renderWorkflowContent] State: Processing intermediate steps, no final result yet.');
      return (
        <div className="mt-8 p-6 bg-white rounded-xl shadow-lg text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-3"></div>
          <p className="text-gray-600">Agents are analyzing and discovering options...</p>
          <p className="text-sm text-gray-500 mt-1">Current focus: {workflowSteps[currentStep-1]?.title || 'Please wait'}</p>
        </div>
      );
    }

    if (error && !isProcessing) { // Show error only if not actively processing (to avoid flicker)
      console.error('[AgenticAI renderWorkflowContent] State: Rendering ERROR:', error);
      return (
        <div className="mt-8 p-6 bg-red-100 text-red-700 rounded-lg shadow-md text-center">
          <h3 className="text-lg font-medium">An Error Occurred</h3>
          <p>{error}</p>
          <button onClick={resetWorkflow} className="mt-3 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">Try Again</button>
        </div>
      );
    }

    if (workflowResult) {
      console.log('[AgenticAI renderWorkflowContent] State: workflowResult EXISTS. Rendering results panel.');
      return (
        <div className="mt-8 p-4 md:p-6 bg-white rounded-xl shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">📊 AI Agent Results</h2>
            <button onClick={resetWorkflow} className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50">Start New</button>
          </div>

          {workflowResult.generatedCampaign && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <h3 className="text-xl font-medium text-primary-600 mb-2">Campaign: {workflowResult.generatedCampaign.title || "N/A"}</h3>
              <p className="text-sm text-gray-700"><span className="font-medium">Objective:</span> {workflowResult.generatedCampaign.campaign_objective || "N/A"}</p>
              <p className="text-sm text-gray-700"><span className="font-medium">Platforms:</span> {(workflowResult.generatedCampaign.platforms || []).join(', ') || "N/A"}</p>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-700 mb-3">Creators ({workflowResult.creatorMatches?.length || 0})</h3>
            {(() => {
              const matches = workflowResult.creatorMatches;
              if (Array.isArray(matches) && matches.length > 0) {
                console.log('[AgenticAI renderWorkflowContent] Rendering list of creators. Count:', matches.length);
                return (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2 border p-3 rounded-md">
                    {matches.slice(0, 10).map((match, index) => {
                      if (!match || !match.creator) {
                        console.warn(`[AgenticAI renderWorkflowContent] Invalid match/creator at index ${index}:`, match);
                        return <div key={`error-match-${index}`} className="text-red-500 p-1 bg-red-50 rounded">Error: Incomplete creator data for this item.</div>;
                      }
                      console.log(`[AgenticAI renderWorkflowContent] Rendering creator: ${match.creator.name}, Action: ${match.recommendedAction}, Reasoning Exists: ${!!match.reasoning}`);
                      let actionColorClass = 'bg-gray-100 text-gray-700';
                      if (match.recommendedAction === 'highly_recommend') actionColorClass = 'bg-green-100 text-green-800';
                      else if (match.recommendedAction === 'recommend') actionColorClass = 'bg-blue-100 text-blue-800';
                      else if (match.recommendedAction === 'consider') actionColorClass = 'bg-yellow-100 text-yellow-800';
                      else if (match.recommendedAction === 'not_recommended') actionColorClass = 'bg-red-100 text-red-800';
                      
                      return (
                        <div key={match.creator.id || `match-${index}`} className="p-3 border-b last:border-b-0 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <img src={match.creator.avatar || '/default-avatar.png'} alt={match.creator.name} className="w-10 h-10 rounded-full object-cover" onError={(e) => (e.currentTarget.src = '/default-avatar.png')} />
                               <div>
                                <p className="font-semibold text-primary-700">{match.creator.name || "Unnamed"}</p>
                                <p className="text-xs text-gray-500">
                                    {match.creator.platform || 'N/A'} 
                                    {match.creator.metrics?.followers ? `• ${match.creator.metrics.followers.toLocaleString()} followers` : ''}
                                </p>
                               </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColorClass}`}>
                                {match.recommendedAction?.replace(/_/g, ' ') || 'N/A'}
                            </span>
                          </div>
                          {/* Now safely display reasoning */}
                          {typeof match.reasoning === 'string' && match.reasoning.length > 0 && (
                            <p className="text-xs text-gray-600 mt-1 pl-12 italic">Reasoning: {match.reasoning}</p>
                          )}
                          {typeof match.reasoning !== 'string' && (
                             <p className="text-xs text-gray-400 mt-1 pl-12 italic">Reasoning not available or not a string.</p>
                          )}
                          {typeof match.score === 'number' && (
                            <p className="text-xs text-gray-500 mt-1 pl-12">Score: {match.score}%</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              } else {
                console.log('[AgenticAI renderWorkflowContent] No creator matches. Showing fallback message.');
                return (
                  <div className="p-6 text-center border-2 border-dashed border-gray-300 rounded-lg">
                    <svg className="mx-auto h-10 w-10 text-gray-400" /* ... icon ... */><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zm3-8V3m12 18v-2" /></svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No Creators Found</h3>
                    <p className="mt-1 text-sm text-gray-500">The AI agents didn't find any creators matching the current criteria.</p>
                  </div>
                );
              }
            })()}
          </div>

          {workflowResult.outreachSummary && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <h3 className="text-lg font-medium text-gray-700 mb-2">📧 Outreach Summary</h3>
              <p className="text-sm">Total Sent: {workflowResult.outreachSummary.totalSent || 0}</p>
              <p className="text-sm">AI Generated: {workflowResult.outreachSummary.aiGenerated || 0}</p>
            </div>
          )}

          {workflowResult.workflowInsights && (
            <div className="p-4 border rounded-lg bg-gray-50">
              <h3 className="text-lg font-medium text-gray-700 mb-2">⚙️ Workflow Insights</h3>
              <p className="text-sm">Processing Time: {(workflowResult.workflowInsights.totalProcessingTime / 1000).toFixed(2)}s</p>
              <p className="text-sm">Confidence: {workflowResult.workflowInsights.confidenceScore?.toFixed(2) || 'N/A'}</p>
            </div>
          )}
        </div>
      );
    }

    if (!isProcessing && !error && !workflowResult) {
        console.log('[AgenticAI renderWorkflowContent] State: Initial. Displaying prompt to start.');
        return (
          <div className="mt-8 text-center p-8 bg-white rounded-xl shadow-lg">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">Ready to Build Your Campaign?</h3>
            <p className="mt-1 text-sm text-gray-500">Fill in requirements and click "Launch AI Agents".</p>
          </div>
        );
    }
    
    console.warn('[AgenticAI renderWorkflowContent] Reached end of logic, no explicit UI to render for current state. isProcessing:', isProcessing, 'error:', error, 'workflowResult:', workflowResult ? 'populated' : 'null');
    return <div className="mt-8 p-6 text-center text-gray-500">Waiting for action or data... (Fell through render logic)</div>;
  };

  return (
    <div className="container mx-auto p-4 md:p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white rounded-lg shadow-lg mb-6 p-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold">🤖 Agentic AI System</h1>
                    <p className="text-purple-100">Autonomous campaign building & negotiation</p>
              </div>
            </div>
            {/* Optionally, add a logo or user info here */}
            </div>
        <div className="flex space-x-1 bg-white bg-opacity-10 rounded-lg p-1 mt-4">
            <button onClick={() => setActiveTab('campaign-builder')} className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${activeTab === 'campaign-builder' ? 'bg-white text-purple-600 shadow' : 'text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-10'}`}>🚀 Campaign Builder</button>
            <button onClick={() => setActiveTab('negotiation-agent')} className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${activeTab === 'negotiation-agent' ? 'bg-white text-purple-600 shadow' : 'text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-10'}`}>🤝 Negotiation Agent</button>
        </div>
      </div>

      {activeTab === 'campaign-builder' && (
        <>
          {!isAIAvailable && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700">
                <h3 className="font-medium">Setup Required for Full AI Features</h3>
                <p className="text-sm mt-1">Add <code className="bg-amber-100 px-1 rounded">VITE_GROQ_API_KEY</code> to your .env.local file. Get key from <a href="https://console.groq.com/" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a>.</p>
            </div>
          )}
          {isAIAvailable && (
            <div className="mb-6 bg-blue-50 border border-blue-200 p-4 text-blue-700 rounded-lg">
                <h3 className="font-medium">API Calls Available: {aiAgentsService.getGlobalStatus().remaining}/{aiAgentsService.getGlobalStatus().total}</h3>
                <p className="text-sm mt-1">System uses smart rate limiting. For best results, space requests apart.</p>
            </div>
          )}

          {/* Campaign Input Section */}
          <div className="my-6 p-6 bg-white rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Campaign Input Method</h3>
            <fieldset className="mt-4">
              <div className="space-y-4 sm:flex sm:items-center sm:space-y-0 sm:space-x-10">
                    <div className="flex items-center"><input id="manual-input" name="input-method" type="radio" checked={inputMethod === 'manual'} onChange={() => setInputMethod('manual')} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"/><label htmlFor="manual-input" className="ml-3 block text-sm font-medium text-gray-700">Manual Entry</label></div>
                    <div className="flex items-center"><input id="upload-brief" name="input-method" type="radio" checked={inputMethod === 'upload'} onChange={() => setInputMethod('upload')} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"/><label htmlFor="upload-brief" className="ml-3 block text-sm font-medium text-gray-700">Upload Brief</label></div>
              </div>
            </fieldset>
          {inputMethod === 'manual' && (
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
              <div>
                        <label htmlFor="companyName" className="block text-sm font-medium leading-6 text-gray-900">Company Name</label>
                        <input id="companyName" type="text" value={requirements.companyName} onChange={(e) => updateRequirements('companyName', e.target.value)} className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
              </div>
              <div>
                        <label htmlFor="productService" className="block text-sm font-medium leading-6 text-gray-900">Product/Service</label>
                        <input id="productService" type="text" value={requirements.productService} onChange={(e) => updateRequirements('productService', e.target.value)} className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
              </div>

                    <div className="md:col-span-2">
                        <label htmlFor="targetAudience" className="block text-sm font-medium leading-6 text-gray-900">Target Audience</label>
                        <textarea id="targetAudience" value={requirements.targetAudience} onChange={(e) => updateRequirements('targetAudience', e.target.value)} rows={3} className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"></textarea>
                        <p className="mt-2 text-xs text-gray-500">Describe your target audience in detail (e.g., demographics, interests, job titles).</p>
              </div>

              <div>
                        <label htmlFor="campaignObjective" className="block text-sm font-medium leading-6 text-gray-900">Campaign Objectives</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                  {goalOptions.map(goal => (
                    <button
                      key={goal}
                      type="button"
                                    onClick={() => updateArrayField('campaignObjective', goal)}
                                    className={`
                                        px-3 py-1.5 rounded-md text-sm font-medium border
                                        ${(requirements.campaignObjective || []).includes(goal)
                                            ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-500 ring-offset-1' 
                                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1'
                                        }
                                        transition-colors duration-150 ease-in-out
                                    `}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>

                    <div> {/* Placeholder for alignment, or add another field here */} </div>

                    <div>
                        <label htmlFor="budgetMin" className="block text-sm font-medium text-gray-700">
                            Budget Min (₹)
                        </label>
                        <input id="budgetMin" type="number" value={requirements.budgetRange?.min || ''} onChange={(e) => updateBudget('min', e.target.value)} className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
                    </div>
              <div>
                        <label htmlFor="budgetMax" className="block text-sm font-medium text-gray-700">
                            Budget Max (₹)
                        </label>
                        <input id="budgetMax" type="number" value={requirements.budgetRange?.max || ''} onChange={(e) => updateBudget('max', e.target.value)} className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"/>
              </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium leading-6 text-gray-900">Industry</label>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {industries.map(industry => {
                                const industryId = `industry-${industry.replace(/\s*&\s*/g, '-').replace(/\s+/g, '-').toLowerCase()}`;
                                return (
                                    <div key={industry} className="relative flex items-start">
                  <input
                                            id={industryId}
                                            aria-describedby={`${industryId}-description`}
                                            name="industries"
                                            type="checkbox" 
                                            checked={(requirements.industry || []).includes(industry)}
                                            onChange={() => updateArrayField('industry', industry)}
                                            className="peer sr-only" // Visually hide the checkbox
                                        />
                                        <label 
                                            htmlFor={industryId}
                                            className={`
                                                flex w-full cursor-pointer items-center justify-center rounded-md border py-2 px-3 text-sm font-medium 
                                                transition-colors duration-150 ease-in-out
                                                peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 
                                                peer-focus:ring-2 peer-focus:ring-indigo-500 peer-focus:ring-offset-1
                                                bg-white text-gray-700 border-gray-300 hover:bg-gray-50
                                            `}
                                        >
                                            <span id={`${industryId}-description`}>{industry}</span>
                                        </label>
                                    </div>
                                );
                            })}
                </div>
              </div>

                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium leading-6 text-gray-900">Preferred Platforms</label>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {platforms.map(platform => (
                                <div key={platform} className="relative flex items-start">
                                    <input 
                                        id={`platform-${platform}`}
                                        aria-describedby={`platform-${platform}-description`}
                                        name="platforms"
                                        type="checkbox" 
                                        checked={(requirements.preferredPlatforms || []).includes(platform)}
                                        onChange={() => updateArrayField('preferredPlatforms', platform)}
                                        className="peer sr-only" // Visually hide the checkbox but keep it accessible
                                    />
                                    <label 
                                        htmlFor={`platform-${platform}`}
                                        className={`
                                            flex w-full cursor-pointer items-center justify-center rounded-md border py-2 px-3 text-sm font-medium 
                                            transition-colors duration-150 ease-in-out
                                            peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:border-indigo-600 
                                            peer-focus:ring-2 peer-focus:ring-indigo-500 peer-focus:ring-offset-1
                                            bg-white text-gray-700 border-gray-300 hover:bg-gray-50
                                        `}
                                    >
                                        <span id={`platform-${platform}-description`} className="capitalize">{platform}</span>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Add more manual input fields here as needed */}
                </div>
            )}
            {inputMethod === 'upload' && (
              <form onSubmit={handleFileUploadAndExtract} className="mt-6 space-y-4">
                <div><label htmlFor="campaign-brief-file" className="block text-sm font-medium">Campaign Brief Document</label><input id="campaign-brief-file" type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="mt-1 block w-full text-sm"/></div>
                {selectedFile && <p className="text-sm text-gray-500">Selected: {selectedFile.name}</p>}
                <button type="submit" disabled={!selectedFile || fileUploadStatus === 'uploading' || fileUploadStatus === 'extracting'} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50">
                    {fileUploadStatus === 'uploading' ? 'Uploading...' : fileUploadStatus === 'extracting' ? 'Extracting...' : 'Upload & Extract'}
                </button>
                {fileUploadError && <p className="text-sm text-red-600">Error: {fileUploadError}</p>}
              </form>
            )}
              </div>

          <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
            <button onClick={runAgenticWorkflow} disabled={isProcessing || !isAIAvailable} className={`flex-1 px-4 py-3 rounded-lg font-medium text-white flex items-center justify-center gap-2 ${isProcessing || !isAIAvailable ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'}`}>
              {isProcessing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Running Agents...</> : '🚀 Launch AI Agents'}
            </button>
                  </div>
                  
          {/* Workflow Steps Display */}
          {isProcessing && currentStep > 0 && currentStep <= workflowSteps.length && (
            <div className="mt-8 p-6 bg-white rounded-xl shadow-lg">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">AI Agents at Work...</h2>
              <p className="text-sm text-gray-600 mb-6">Current step: <span className="font-medium">{workflowSteps[currentStep -1]?.title || 'Processing'}</span></p>
              <div className="space-y-3">
                {workflowSteps.map((step) => (
                  <div key={step.id} className="flex items-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">
                      {step.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-gray-300"></div>}
                      {step.status === 'running' && <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>}
                      {step.status === 'completed' && <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>}
                      {step.status === 'error' && <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></div>}
                    </div>
                    <div className="ml-4 flex-grow">
                      <div className={`font-medium ${step.status === 'running' ? 'text-blue-600' : step.status === 'completed' ? 'text-green-600' : step.status === 'error' ? 'text-red-600' : 'text-gray-700'}`}>{step.title}</div>
                      {step.duration && <div className="text-xs text-gray-500">Completed in {step.duration / 1000}s</div>}
                      {step.status === 'error' && step.details && <div className="text-xs text-red-500">{step.details}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Content Display Area (Results, Error, Loading for results part) */}
          {renderWorkflowContent()}
        </>
      )}

      {activeTab === 'negotiation-agent' && (
        <NegotiationAgent key="negotiation-agent-simplified" /> // Changed key to avoid conflict if old one is cached
      )}

      {showOutreachManager && workflowResult && (
        <AIOutreachManager
          searchResults={getTopCreators().map(match => match.creator) /* Ensure getTopCreators is safe */}
          onClose={() => setShowOutreachManager(false)}
        />
      )}
    </div>
  );
} 