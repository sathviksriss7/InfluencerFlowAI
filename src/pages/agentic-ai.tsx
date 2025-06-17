import React, { useState, type ChangeEvent, type FormEvent, useEffect, useMemo } from 'react';
import {
  aiAgentsService,
  createExampleRequirements,
  type BusinessRequirements,
  type AgentWorkflowResult,
  type CreatorMatch,
  type ProgressUpdateCallback,
  type OutreachResult,
  type GeneratedCampaign
} from '../services/ai-agents';
import AIOutreachManager from '../components/ai-outreach-manager';
import { NegotiationAgentComponent } from '../components/negotiation-agent';
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
  str = str.replace(/₹|\$|€|£|inr|usd|eur|gbp|aud|cad/g, '');
  str = str.replace(/around|approx\.?|up to|about/g, '');
  str = str.trim();

  const numbers = [];
  const numRegex = /(\d+\.?\d*k?)/g;
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

  const [maxOutreachCount, setMaxOutreachCount] = useState(5);

  const [numDisplayedCreators, setNumDisplayedCreators] = useState(10);
  const [numDisplayedOutreaches, setNumDisplayedOutreaches] = useState(5);

  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([
    { id: 'campaign', title: 'Building Campaign Strategy', status: 'pending' },
    { id: 'discovery', title: 'Discovering Creators', status: 'pending' },
    { id: 'scoring', title: 'Scoring & Matching', status: 'pending' },
    { id: 'outreach', title: 'Sending Outreach Messages', status: 'pending' },
    { id: 'complete', title: 'Finalizing Results', status: 'pending' }
  ]);

  const isAIAvailable = aiAgentsService.isAvailable();

  // Define the progress update handler
  const handleProgressUpdate: ProgressUpdateCallback = (progress) => {
    console.log('🚀 UI: Progress Update Received:', progress);
    setWorkflowSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === progress.stageId 
          ? { ...step, status: progress.status, duration: progress.duration, details: progress.error }
          : step
      )
    );
    // Update currentStep based on the new progress
    const currentStageIndex = workflowSteps.findIndex(step => step.id === progress.stageId);
    if (progress.status === 'running') {
      setCurrentStep(currentStageIndex + 1);
    } else if (progress.status === 'completed' && currentStageIndex < workflowSteps.length -1) {
      // If a step completes, and it's not the last one, 
      // set the next step to running if it's not already completed or errored by a skip
      const nextStep = workflowSteps[currentStageIndex + 1];
      if(nextStep && nextStep.status === 'pending') {
         // This logic might be too aggressive if backend sends all 'completed' events at the end
         // We will primarily rely on explicit 'running' status from backend for active step
      }
    }
    if (progress.stageId === 'complete' && progress.status === 'completed') {
        setCurrentStep(workflowSteps.length); // Or specific logic for overall completion
    }
  };

  const updateRequirements = (field: keyof BusinessRequirements, value: any) => {
    setRequirements(prev => ({ ...prev, [field]: value }));
  };

  const updateBudget = (part: 'min' | 'max', value: string) => {
    const numValue = parseInt(value, 10);
    setRequirements(prev => ({
      ...prev,
      budgetRange: {
        ...prev.budgetRange,
        [part]: isNaN(numValue) ? 0 : numValue,
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
    setNumDisplayedCreators(10); 
    setWorkflowSteps(steps => steps.map(step => ({ ...step, status: 'pending', duration: undefined })));

    try {
      // No need to set initial steps to running here anymore, 
      // as the onProgress callback will handle it from the backend signals.
      
      // Create a requirements object for this specific run, including the current maxOutreachCount
      const currentRequirements: BusinessRequirements = {
        ...requirements,
        outreachCount: maxOutreachCount, // Explicitly use the state here
      };

      console.log("🚀 UI: Calling executeFullWorkflow with requirements:", JSON.stringify(currentRequirements, null, 2));
      // Pass the handleProgressUpdate callback and the updated currentRequirements to the service
      const result: AgentWorkflowResult | null = await aiAgentsService.executeFullWorkflow(currentRequirements, handleProgressUpdate);
      console.log("🚀 UI: Received result from executeFullWorkflow:", JSON.stringify(result, null, 2));

      // The backend now sends progress for completion, so this specific block might be redundant or simplified.
      // We will rely on the 'complete' stageId from onProgress for the final step.
      if (result && result.workflowInsights && typeof result.workflowInsights.totalProcessingTime === 'number') {
        // const totalReportedTime = result.workflowInsights.totalProcessingTime || 2000;

        // The following step updates are now handled by onProgress, so they can be removed or commented out.
        /*
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
        */

        setWorkflowResult(result);
        // setCurrentStep(5); // This will be set by onProgress({ stageId: 'complete', status: 'completed' })
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
    setInputMethod('manual');
    setRequirements(createExampleRequirements());
    setNumDisplayedCreators(10);
  };

  const getTopCreators = (): CreatorMatch[] => {
    if (!workflowResult || !workflowResult.creatorMatches) return [];
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
          const newReqs = { ...prevReqs };
          newReqs.companyName = extracted.brand_name === null ? '' : extracted.brand_name;
          newReqs.productService = extracted.product_service_name === null ? '' : extracted.product_service_name;
          newReqs.targetAudience = extracted.target_audience_description === null ? '' : extracted.target_audience_description;
          newReqs.keyMessage = (extracted.key_message_points === null || (Array.isArray(extracted.key_message_points) && extracted.key_message_points.length === 0)) 
            ? '' 
            : Array.isArray(extracted.key_message_points) ? extracted.key_message_points.join(', ') : String(extracted.key_message_points);
          newReqs.timeline = extracted.timeline_indication === null ? '' : extracted.timeline_indication;
          newReqs.specialRequirements = extracted.other_notes_or_mandatories === null ? '' : extracted.other_notes_or_mandatories;
          newReqs.industry = (extracted.industry === null || !Array.isArray(extracted.industry) || extracted.industry.length === 0)
            ? []
            : extracted.industry.map((ind: unknown) => String(ind).trim()).filter((ind: string) => ind && industries.includes(ind));
          const objectivesFromBrief = (extracted.campaign_objectives && Array.isArray(extracted.campaign_objectives))
            ? extracted.campaign_objectives.map((obj: unknown) => String(obj).trim()).filter((obj: string) => obj && goalOptions.includes(obj))
            : [];
          newReqs.campaignObjective = objectivesFromBrief;
          newReqs.businessGoals = objectivesFromBrief.length > 0 ? [...objectivesFromBrief] : [];
          newReqs.preferredPlatforms = (extracted.platform_preferences === null || !Array.isArray(extracted.platform_preferences) || extracted.platform_preferences.length === 0)
            ? []
            : extracted.platform_preferences.map((p:any) => String(p).toLowerCase().trim()).filter((p:string) => platforms.includes(p));
          newReqs.locations = ['India'];
          if (extracted.budget_indication === null) {
            newReqs.budgetRange = { min: 0, max: 0 };
          } else if (typeof extracted.budget_indication === 'string') {
            newReqs.budgetRange = parseBudgetFromString(extracted.budget_indication);
          } else if (typeof extracted.budget_indication === 'object' && extracted.budget_indication !== null && 'min' in extracted.budget_indication && 'max' in extracted.budget_indication) {
            const minVal = Number(extracted.budget_indication.min);
            const maxVal = Number(extracted.budget_indication.max);
            newReqs.budgetRange = { min: isNaN(minVal) ? 0 : minVal, max: isNaN(maxVal) ? 0 : maxVal };
          } else {
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

  const renderWorkflowContent = () => {
    if (error && !isProcessing) {
      return (
        <div className="mt-8 p-6 bg-red-100 text-red-700 rounded-lg shadow-md text-center">
          <h3 className="text-lg font-medium">An Error Occurred</h3>
          <p>{error}</p>
          <button onClick={resetWorkflow} className="mt-3 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">Try Again</button>
        </div>
      );
    }

    if (workflowResult) {
      return (
        <div className="mt-8 p-4 md:p-6 bg-white rounded-xl shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-gray-800">📊 AI Agent Results</h2>
            <button onClick={resetWorkflow} className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50">Start New</button>
          </div>

          {workflowResult.generatedCampaign && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h3 className="text-xl font-medium text-primary-600 mb-2">Campaign: {workflowResult.generatedCampaign.title || "N/A"}</h3>
              {workflowResult.generatedCampaign.brand && (
                <p className="text-sm text-gray-700 mt-1"><span className="font-medium">Brand:</span> {workflowResult.generatedCampaign.brand}</p>
              )}
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-medium">Objective(s):</span>
                {(Array.isArray(workflowResult.generatedCampaign.campaign_objective)
                  ? workflowResult.generatedCampaign.campaign_objective.join(', ')
                  : workflowResult.generatedCampaign.campaign_objective) || "N/A"}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-medium">Platforms:</span>
                {(workflowResult.generatedCampaign.platforms && workflowResult.generatedCampaign.platforms.length > 0
                  ? workflowResult.generatedCampaign.platforms.join(', ')
                  : "N/A")}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-medium">Budget:</span>
                ₹{workflowResult.generatedCampaign.budgetMin?.toLocaleString() || '0'} - ₹{workflowResult.generatedCampaign.budgetMax?.toLocaleString() || 'N/A'}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                <span className="font-medium">Min Followers:</span>
                {workflowResult.generatedCampaign.minFollowers?.toLocaleString() || 'N/A'}
              </p>
              {(workflowResult.generatedCampaign.niches && workflowResult.generatedCampaign.niches.length > 0) && (
                <p className="text-sm text-gray-700 mt-1">
                  <span className="font-medium">Target Niches:</span>
                  {workflowResult.generatedCampaign.niches.join(', ')}
                </p>
              )}
              {(workflowResult.generatedCampaign.locations && workflowResult.generatedCampaign.locations.length > 0) && (
                <p className="text-sm text-gray-700 mt-1">
                  <span className="font-medium">Target Locations:</span>
                  {workflowResult.generatedCampaign.locations.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-xl font-medium text-gray-700 mb-3">Creators ({workflowResult.creatorMatches?.length || 0})</h3>
            {(() => {
              const matches = workflowResult.creatorMatches;
              if (Array.isArray(matches) && matches.length > 0) {
                return (
                  <>
                    <div className="space-y-4 max-h-[30rem] overflow-y-auto p-1">
                      {matches.slice(0, numDisplayedCreators).map((match, index) => {
                        if (!match || !match.creator) {
                          return <div key={`error-match-${index}`} className="text-red-500 p-1 bg-red-50 rounded">Error: Incomplete creator data.</div>;
                        }
                        let actionColorClass = 'bg-gray-100 text-gray-700';
                        if (match.recommendedAction === 'highly_recommend') actionColorClass = 'bg-green-100 text-green-800';
                        else if (match.recommendedAction === 'recommend') actionColorClass = 'bg-blue-100 text-blue-800';
                        else if (match.recommendedAction === 'consider') actionColorClass = 'bg-yellow-100 text-yellow-800';
                        else if (match.recommendedAction === 'not_recommended') actionColorClass = 'bg-red-100 text-red-800';
                        
                        return (
                          <div key={match.creator.id || `match-${index}`} className="p-4 bg-white rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-150">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                 <img src={match.creator.avatar || '/default-avatar.png'} alt={match.creator.name} className="w-10 h-10 rounded-full object-cover mt-1" onError={(e) => (e.currentTarget.src = '/default-avatar.png')} />
                                 <div className="flex-grow">
                                  <p className="font-semibold text-primary-700 text-base">{match.creator.name || "Unnamed"}</p>
                                  <p className="text-xs text-gray-500">
                                      {match.creator.platform || 'N/A'} 
                                      {match.creator.metrics?.followers ? `• ${match.creator.metrics.followers.toLocaleString()} followers` : ''}
                                  </p>
                                 </div>
                              </div>
                              <span className={`text-sm px-2.5 py-1 rounded-full font-semibold ${actionColorClass} whitespace-nowrap ml-2 flex-shrink-0`}>
                                  {match.recommendedAction?.replace(/_/g, ' ') || 'N/A'}
                              </span>
                            </div>
                            {(typeof match.reasoning === 'string' && match.reasoning.length > 0) && (
                              <p className="text-xs text-gray-600 mt-2 pl-[calc(2.5rem+0.75rem)] italic">Reasoning: {match.reasoning}</p>
                            )}
                            {typeof match.score === 'number' && (
                              <p className="text-xs text-gray-500 mt-1 pl-[calc(2.5rem+0.75rem)]">Score: {match.score}%</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {workflowResult && workflowResult.creatorMatches && numDisplayedCreators < workflowResult.creatorMatches.length && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => setNumDisplayedCreators(prev => Math.min(prev + 10, workflowResult.creatorMatches.length))}
                          className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                        >
                          Load 10 More (Showing {numDisplayedCreators} of {workflowResult.creatorMatches.length})
                        </button>
                      </div>
                    )}
                  </>
                );
              } else {
                return (
                  <div className="p-6 text-center border-2 border-dashed border-gray-300 rounded-lg">
                    <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zm3-8V3m12 18v-2" /></svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No Creators Found</h3>
                    <p className="mt-1 text-sm text-gray-500">The AI agents didn't find any creators matching the current criteria.</p>
                  </div>
                );
              }
            })()}
          </div>

          {workflowResult.outreachSummary && (() => {
            const totalSent = workflowResult.outreachSummary.totalSent;
            const aiGenerated = workflowResult.outreachSummary.aiGenerated;
            return (
              <div className="py-6 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-700 mb-2">📧 Outreach Summary</h3>
                <p className="text-sm">Total Sent: {totalSent || 0}</p>
                <p className="text-sm mb-3">AI Generated: {aiGenerated || 0}</p>
                
                {workflowResult.outreachSummary.outreaches && workflowResult.outreachSummary.outreaches.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-600 mb-2">Outreach Details:</h4>
                    <div className="space-y-4 max-h-[30rem] overflow-y-auto p-1"> {/* Increased max-h and space */}
                      {workflowResult.outreachSummary.outreaches.map((outreach, index) => {
                        const creatorMatch = workflowResult.creatorMatches?.find(cm => cm.creator.id === outreach.creator.id);
                        
                        let recommendationTag = 'N/A';
                        let recommendationColorClass = 'bg-gray-100 text-gray-700';
                        if (creatorMatch) {
                          recommendationTag = creatorMatch.recommendedAction?.replace(/_/g, ' ') || 'N/A';
                          if (creatorMatch.recommendedAction === 'highly_recommend') recommendationColorClass = 'bg-green-100 text-green-800';
                          else if (creatorMatch.recommendedAction === 'recommend') recommendationColorClass = 'bg-blue-100 text-blue-800';
                          else if (creatorMatch.recommendedAction === 'consider') recommendationColorClass = 'bg-yellow-100 text-yellow-800';
                          else if (creatorMatch.recommendedAction === 'not_recommended') recommendationColorClass = 'bg-red-100 text-red-800';
                        }

                        return (
                        <div 
                          key={index} 
                          className={`p-4 rounded-lg shadow-sm border ${outreach.status === 'sent' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                          
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-start gap-3">
                                <img src={outreach.creator.avatar || '/default-avatar.png'} alt={outreach.creator.name} className="w-10 h-10 rounded-full object-cover mt-1" onError={(e) => (e.currentTarget.src = '/default-avatar.png')} />
                                <div className="flex-grow">
                                  <p className={`font-semibold text-base ${outreach.status === 'sent' ? 'text-green-800' : 'text-red-800'}`}>
                                    {outreach.creator.name || "Unnamed"}
                                    <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold ${outreach.status === 'sent' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                                      {outreach.status}
                                    </span>
                                  </p>
                                  <p className={`text-xs ${outreach.status === 'sent' ? 'text-green-700' : 'text-red-700'}`}>
                                      {outreach.creator.platform || 'N/A'} 
                                      {outreach.creator.metrics?.followers ? `• ${outreach.creator.metrics.followers.toLocaleString()} followers` : ''}
                                  </p>
                                </div>
                            </div>
                            {creatorMatch && (
                              <span className={`text-sm px-2.5 py-1 rounded-full font-semibold ${recommendationColorClass} whitespace-nowrap ml-2 flex-shrink-0`}>
                                  {recommendationTag}
                              </span>
                            )}
                          </div>

                          {creatorMatch?.reasoning && (
                            <p className={`text-xs italic mt-1 pl-[calc(2.5rem+0.75rem)] ${outreach.status === 'sent' ? 'text-green-700' : 'text-red-600'}`}>Reasoning: {creatorMatch.reasoning}</p>
                          )}
                          {typeof creatorMatch?.score === 'number' && (
                            <p className={`text-xs mt-0.5 pl-[calc(2.5rem+0.75rem)] ${outreach.status === 'sent' ? 'text-green-700' : 'text-red-600'}`}>Score: {creatorMatch.score}%</p>
                          )}

                          <div className={`mt-3 pt-3 border-t ${outreach.status === 'sent' ? 'border-green-300' : 'border-red-300'}`}>
                            <p className={`text-xs font-medium ${outreach.status === 'sent' ? 'text-green-700' : 'text-red-700'}`}>Method: <span className="font-normal">{outreach.method}</span></p>
                            <h5 className={`text-xs font-medium mt-1.5 mb-0.5 ${outreach.status === 'sent' ? 'text-green-700' : 'text-red-700'}`}>Message Sent:</h5>
                            <pre className={`whitespace-pre-wrap text-xs p-2 rounded bg-opacity-50 ${outreach.status === 'sent' ? 'text-green-900 bg-green-100' : 'text-red-900 bg-red-100'}`}>{outreach.message}</pre>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {workflowResult.workflowInsights && (
            <div className="pt-6">
              <h3 className="text-lg font-medium text-gray-700 mb-2">⚙️ Workflow Insights</h3>
              <p className="text-sm">Processing Time: {(workflowResult.workflowInsights.totalProcessingTime / 1000).toFixed(2)}s</p>
              <p className="text-sm">Confidence: {workflowResult.workflowInsights.confidenceScore?.toFixed(2) || 'N/A'}</p>
            </div>
          )}
        </div>
      );
    }

    if (!isProcessing && !error && !workflowResult) {
        return (
          <div className="mt-8 text-center p-8 bg-white rounded-xl shadow-lg">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">Ready to Build Your Campaign?</h3>
            <p className="mt-1 text-sm text-gray-500">Fill in requirements and click "Launch AI Agents".</p>
          </div>
        );
    }
    
    return <div className="mt-8 p-6 text-center text-gray-500">Waiting for action or data... (Fell through render logic)</div>;
  };

  // Main Render
  return (
    <div className="min-h-screen bg-grey p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header Section (Agentic AI System title and Tabs) */}
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
          </div>
          <div className="flex space-x-1 bg-white bg-opacity-10 rounded-lg p-1 mt-4">
            <button 
              onClick={() => setActiveTab('campaign-builder')}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${activeTab === 'campaign-builder' ? 'bg-white text-purple-600 shadow' : 'text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-10'}`}
            >
              🚀 Campaign Builder
            </button>
            <button 
              onClick={() => setActiveTab('negotiation-agent')}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-all ${activeTab === 'negotiation-agent' ? 'bg-white text-purple-600 shadow' : 'text-purple-100 hover:text-white hover:bg-white hover:bg-opacity-10'}`}
            >
              🤝 Negotiation Agent
            </button>
          </div>
        </div>

        {/* Main Content Area with White Background */}
        <div className="bg-white rounded-xl shadow-2xl p-6 md:p-8">
          {showOutreachManager && workflowResult?.outreachSummary?.outreaches && workflowResult.generatedCampaign?.id ? (
            <AIOutreachManager
              searchResults={workflowResult.outreachSummary.outreaches.map((o: OutreachResult) => o.creator)}
              onClose={() => setShowOutreachManager(false)}
              campaignId={workflowResult.generatedCampaign.id} 
            />
          ) : (
            <>
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
                      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-12">
                        <div>
                          <label htmlFor="companyName" className="block text-sm font-medium leading-6 text-gray-900">Company Name</label>
                          <input
                            id="companyName"
                            value={requirements.companyName}
                            onChange={(e) => updateRequirements('companyName', e.target.value)}
                            placeholder="e.g., YourBrand Inc."
                            className={"w-full px-2 py-2 rounded-md text-sm font-medium border"}
                          />
                        </div>
                        <div>
                          <label htmlFor="productService" className="block text-sm font-medium leading-6 text-gray-900">Product/Service</label>
                          <input
                            id="productService"
                            value={requirements.productService}
                            onChange={(e) => updateRequirements('productService', e.target.value)}
                            placeholder="e.g., Eco-friendly water bottles"
                            className={"w-full px-2 py-2 rounded-md text-sm font-medium border"}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label htmlFor="targetAudience" className="block text-sm font-medium leading-6 text-gray-900">Target Audience</label>
                          <textarea
                            id="targetAudience"
                            value={requirements.targetAudience}
                            onChange={(e) => updateRequirements('targetAudience', e.target.value)}
                            rows={4}
                            placeholder="e.g., Young professionals aged 25-35 interested in sustainable fashion and technology, primarily based in urban areas."
                            className={"w-full px-2 py-2 rounded-md text-sm font-medium border"}
                          ></textarea>
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
                        <div> {/* Placeholder for alignment */} </div>
                        <div>
                          <label htmlFor="budgetMin" className="block text-sm font-medium text-gray-700">Budget Min (₹)</label>
                          <input
                            id="budgetMin"
                            type="number"
                            value={requirements.budgetRange?.min || ''}
                            onChange={(e) => updateBudget('min', e.target.value)}
                            placeholder="e.g., 50000"
                          />
                        </div>
                        <div>
                          <label htmlFor="budgetMax" className="block text-sm font-medium text-gray-700">Budget Max (₹)</label>
                          <input
                            id="budgetMax"
                            type="number"
                            value={requirements.budgetRange?.max || ''}
                            onChange={(e) => updateBudget('max', e.target.value)}
                            placeholder="e.g., 200000"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label htmlFor="maxOutreachCount" className="block text-sm font-medium text-black-200 mb-1">Number of Creators to Outreach</label>
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            <input
                              type="number"
                              name="maxOutreachCount"
                              id="maxOutreachCount"
                              className="focus:ring-indigo-600 focus:border-indigo-600 block w-full sm:text-sm border-gray-600 bg-indigo-600 rounded-md text-white placeholder-gray-400"
                              value={maxOutreachCount}
                              onChange={(e) => setMaxOutreachCount(parseInt(e.target.value, 10) || 0)}
                              min="1"
                              placeholder="e.g., 5" 
                            />
                          </div>
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
                                    className="peer sr-only"
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
                                  className="peer sr-only"
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
                        <div className="mb-4">
                          
                        </div>
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
                              {step.status === 'completed' && <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div>}
                              {step.status === 'error' && <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></div>}
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
                  {renderWorkflowContent()} 
                </>
              )}
              {activeTab === 'negotiation-agent' && (
                <NegotiationAgentComponent />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}