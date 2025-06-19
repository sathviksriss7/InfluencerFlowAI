import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

// Define constants for select options
const PLATFORM_OPTIONS = ['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin', 'facebook', 'blog', 'podcast'];
const NICHE_OPTIONS = ['fashion', 'fitness', 'technology', 'food', 'travel', 'gaming', 'beauty', 'lifestyle', 'health', 'entertainment', 'education', 'finance', 'diy', 'family', 'sustainability'];
const LOCATION_OPTIONS = ['United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 'France', 'India', 'Japan', 'Brazil', 'South Africa', 'Any (Remote)'];
const DELIVERABLE_OPTIONS = [
  'Instagram Post', 'Instagram Story', 'Instagram Reel', 'Instagram Live',
  'YouTube Video (dedicated)', 'YouTube Video (integrated)', 'YouTube Short',
  'TikTok Video', 'Twitter Post (Tweet)', 'Tweet Thread', 'LinkedIn Post',
  'Blog Post', 'Podcast Episode mention', 'Podcast Episode (dedicated)',
  'Product Review', 'Unboxing Content', 'Behind-the-scenes Content',
  'Tutorial Content', 'Brand Mentions', 'Contest/Giveaway Hosting'
];
const STATUS_OPTIONS: CampaignFormData['status'][] = ['draft', 'active', 'in_review', 'completed', 'cancelled'];
const FOLLOWER_OPTIONS = [
    { value: 0, label: 'Any' }, // Added "Any" as an explicit option
    { value: 1000, label: '1,000+' },
    { value: 5000, label: '5,000+' },
    { value: 10000, label: '10,000+' },
    { value: 25000, label: '25,000+' },
    { value: 50000, label: '50,000+' },
    { value: 100000, label: '100,000+' },
    { value: 500000, label: '500,000+' },
    { value: 1000000, label: '1,000,000+' },
];

// Assuming Campaign and CampaignInput types are similar or can be adapted
// You might want to define a specific type for the editable fields if it differs significantly
// from the main Campaign type, or reuse the Campaign type if suitable.
interface CampaignFormData {
  id?: string; // ID will be present when editing
  title: string;
  brand: string;
  description: string;
  brief: string;
  status: 'draft' | 'active' | 'in_review' | 'completed' | 'cancelled'; // Consistent with other types
  creation_method?: string; // Added creation_method
  budget: {
    min: number | null;
    max: number | null;
  };
  timeline: {
    applicationDeadline: string | null; // Store as string for input[type=date]
    startDate: string | null;
    endDate: string | null;
  };
  requirements: {
    platforms: string[];
    minFollowers: number | null;
    niches: string[];
    locations: string[];
    deliverables: string[];
  };
  // Fields from the initial creation form that might be editable
  companyName?: string;
  productService?: string;
  campaignObjective?: string;
  campaignAudienceDescription?: string;
  targetInfluencerDescription?: string;
  keyMessage?: string;
  // aiInsights are usually not directly editable by user in a simple form
  createdAt?: string; // Add createdAt
  updatedAt?: string; // Add updatedAt
}

// Interface for form errors
interface FormErrors {
  title?: string;
  brand?: string;
  description?: string;
  brief?: string;
  // Add other fields as needed
  'budget.min'?: string;
  'budget.max'?: string;
  'timeline.applicationDeadline'?: string;
  'timeline.startDate'?: string;
  'timeline.endDate'?: string;
}

const CampaignEditPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  
  const [campaign, setCampaign] = useState<CampaignFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({}); // State for form validation errors
  const [isAiCampaignReadOnly, setIsAiCampaignReadOnly] = useState(false); // New state for AI campaign read-only

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }
    if (!session?.access_token) {
      setError("Authentication required to edit campaigns.");
      setIsLoading(false);
      // Consider redirecting to login if no session
      // navigate('/login');
      return;
    }

    if (campaignId) {
      setIsLoading(true);
      setError(null);

      const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendBaseUrl) {
        setError("Backend API URL is not configured. Please contact support.");
        setIsLoading(false);
        return;
      }
      const apiUrl = `${backendBaseUrl}/api/campaigns/${campaignId}`;
      console.log("Attempting to fetch campaign for edit from:", apiUrl); // DEBUG

      fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
        .then(response => {
          if (!response.ok) {
            if (response.status === 404) throw new Error('Campaign not found.');
            throw new Error('Failed to fetch campaign details for editing. Status: ' + response.status);
          }
          return response.json();
        })
        .then(data => {
          if (data.success && data.campaign) {
            // Transform fetched data to match CampaignFormData structure
            // Especially for dates (YYYY-MM-DD for input[type=date])
            const fetched = data.campaign;
            const transformedData: CampaignFormData = {
              ...fetched,
              // Ensure all fields from CampaignFormData are present, defaulting if necessary
              title: fetched.title || '',
              brand: fetched.brand || '',
              description: fetched.description || '',
              brief: fetched.brief || '',
              status: fetched.status || 'draft',
              creation_method: fetched.creation_method,
              budget: {
                min: fetched.budget?.min ?? null,
                max: fetched.budget?.max ?? null,
              },
              timeline: {
                applicationDeadline: fetched.timeline?.applicationDeadline ? new Date(fetched.timeline.applicationDeadline).toISOString().split('T')[0] : null,
                startDate: fetched.timeline?.startDate ? new Date(fetched.timeline.startDate).toISOString().split('T')[0] : null,
                endDate: fetched.timeline?.endDate ? new Date(fetched.timeline.endDate).toISOString().split('T')[0] : null,
              },
              requirements: { 
                platforms: fetched.requirements?.platforms || [], 
                minFollowers: fetched.requirements?.minFollowers ?? null, 
                niches: fetched.requirements?.niches || [], 
                locations: fetched.requirements?.locations || [], 
                deliverables: fetched.requirements?.deliverables || [] 
              },
              // Optional fields from initial creation - might not always be present
              companyName: fetched.companyName,
              productService: fetched.productService,
              campaignObjective: fetched.campaignObjective,
              campaignAudienceDescription: fetched.campaignAudienceDescription || fetched.targetAudience || '',
              targetInfluencerDescription: fetched.targetInfluencerDescription || '',
              keyMessage: fetched.keyMessage,
              createdAt: fetched.createdAt, // Include createdAt
              updatedAt: fetched.updatedAt, // Include updatedAt
            };
            setCampaign(transformedData);
            if (fetched.creation_method === 'ai') {
              setIsAiCampaignReadOnly(true);
            }
          } else {
            throw new Error(data.error || 'Could not parse campaign data.');
          }
        })
        .catch(err => {
          console.error("Error fetching campaign for edit:", err);
          setError(err.message);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setError("No campaign ID provided for editing.");
      setIsLoading(false);
    }
  }, [campaignId, session, authLoading, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setCampaign(prevCampaign => {
      if (!prevCampaign) return null;

      const keys = name.split('.');
      const updatedState = JSON.parse(JSON.stringify(prevCampaign)) as CampaignFormData;
      let currentLevel: any = updatedState;

      keys.forEach((key, index) => {
        if (index === keys.length - 1) {
          if (key === 'minFollowers' || (name.startsWith('budget.') && (key === 'min' || key === 'max'))) {
            currentLevel[key] = value === '' ? null : parseInt(value, 10);
          } else {
            currentLevel[key] = value;
          }
        } else {
          if (!currentLevel[key] || typeof currentLevel[key] !== 'object') {
            currentLevel[key] = {};
          }
          currentLevel = currentLevel[key];
        }
      });

      // Perform specific field validation and update formErrors immediately
      const newFormErrors = { ...formErrors };
      let fieldError = '';

      if (name === 'title') {
        if (!updatedState.title.trim()) {
          fieldError = 'Campaign Title is required.';
        }
        newFormErrors.title = fieldError;
      }

      // Budget validation during handleChange
      if (name === 'budget.min' || name === 'budget.max') {
        const min = updatedState.budget.min;
        const max = updatedState.budget.max;
        if (min !== null && max !== null && min > max) {
          newFormErrors['budget.max'] = 'Maximum budget cannot be less than minimum budget.';
        } else {
          delete newFormErrors['budget.max']; // Clear error if condition is met
          delete newFormErrors['budget.min']; // Also clear min error if it was related
        }
      }
      
      // Timeline validation during handleChange
      if (name === 'timeline.startDate' || name === 'timeline.endDate') {
        const startDate = updatedState.timeline.startDate;
        const endDate = updatedState.timeline.endDate;
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
          newFormErrors['timeline.endDate'] = 'End date cannot be before start date.';
        } else {
          delete newFormErrors['timeline.endDate'];
        }
      }
      // Add more on-the-fly validations here if needed

      setFormErrors(newFormErrors);
      return updatedState;
    });
  };
  
  const handleRequirementChange = (field: keyof CampaignFormData['requirements'], value: string | string[] | number | null) => {
    setCampaign(prev => {
        if (!prev) return null;
        return {
            ...prev,
            requirements: {
                ...prev.requirements,
                [field]: value
            }
        };
    });
  };

  const toggleArrayRequirement = (field: keyof CampaignFormData['requirements'], item: string) => {
    setCampaign(prev => {
      if (!prev) return null;
      const currentArray = (prev.requirements[field] as string[] | undefined) || [];
      const newArray = currentArray.includes(item)
        ? currentArray.filter(i => i !== item)
        : [...currentArray, item];
      return {
        ...prev,
        requirements: {
          ...prev.requirements,
          [field]: newArray,
        },
      };
    });
  };

  const validateForm = (): boolean => {
    if (!campaign) return false;
    const currentFormErrors: FormErrors = {};
    let isValid = true;

    // Title
    if (!campaign.title.trim()) {
      currentFormErrors.title = 'Campaign Title is required.';
      isValid = false;
    }

    // Budget
    if (campaign.budget.min !== null && campaign.budget.max !== null && campaign.budget.min > campaign.budget.max) {
      currentFormErrors['budget.max'] = 'Maximum budget cannot be less than minimum budget.';
      isValid = false;
    }

    // Timeline
    if (campaign.timeline.startDate && campaign.timeline.endDate && new Date(campaign.timeline.startDate) > new Date(campaign.timeline.endDate)) {
      currentFormErrors['timeline.endDate'] = 'End date cannot be before start date.';
      isValid = false;
    }
    
    // Application deadline vs Start Date (Optional: depends on strictness)
    if (campaign.timeline.applicationDeadline && campaign.timeline.startDate && new Date(campaign.timeline.applicationDeadline) > new Date(campaign.timeline.startDate)) {
        currentFormErrors['timeline.applicationDeadline'] = 'Application deadline should ideally be before the start date.';
        // isValid = false; // Decide if this should block submission or just be a warning
    }


    setFormErrors(currentFormErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // setFormErrors({}); // Cleared by validateForm or at the start of handleChange for individual fields

    if (!campaign || !campaignId || !session?.access_token) {
      const errorMsg = "Form data, campaign ID, or authentication token is missing. Cannot submit.";
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!validateForm()) {
      toast.error('Please correct the errors in the form.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setError(null); // Clear general API errors before new submission

    // Prepare payload, ensuring numbers are numbers, nulls are nulls
    const payload = {
        ...campaign,
        budget: {
            min: campaign.budget.min === null ? null : Number(campaign.budget.min),
            max: campaign.budget.max === null ? null : Number(campaign.budget.max),
        },
        requirements: {
            ...campaign.requirements,
            minFollowers: campaign.requirements.minFollowers === null ? null : Number(campaign.requirements.minFollowers),
        }
    };
    
    // Remove id from payload if it exists, as it's in the URL
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...payloadWithoutId } = payload;


    try {
      const backendBaseUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendBaseUrl) {
        setError("Backend API URL is not configured. Please contact support.");
        setIsSubmitting(false);
        return;
      }
      const apiUrl = `${backendBaseUrl}/api/campaigns/${campaignId}`;
      console.log("Attempting to update campaign (PUT request) to:", apiUrl); // DEBUG

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payloadWithoutId),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMsg = result.error || 'Failed to update campaign.';
        throw new Error(errorMsg);
      }

      toast.success('Campaign updated successfully!');
      // Navigate to the detail page after update, passing the updated campaign data
      if (result.campaign) {
        navigate(`/campaigns/${campaignId}`, { state: { campaign: result.campaign } });
      } else {
        // Fallback if result.campaign is not available for some reason
        navigate(`/campaigns/${campaignId}`);
      }
    } catch (err) {
      console.error("Error updating campaign:", err);
      const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (campaignId) {
      navigate(`/campaigns/${campaignId}`); // Navigate to campaign detail page
    } else {
      navigate('/campaigns'); // Fallback to campaigns list if campaignId is somehow not available
    }
  };

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-screen"><p className="text-xl text-gray-700">Loading campaign editor...</p></div>;
  }

  if (error) {
    return <div className="p-6 text-center text-red-600">Error: {error}</div>;
  }

  if (!campaign) {
    return <div className="p-6 text-center text-gray-700">Campaign data not available.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 bg-white shadow-xl rounded-lg my-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Edit Campaign</h1>
      <p className="text-gray-600 mb-8">Update the details of your campaign below.</p>

      {isAiCampaignReadOnly && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
          <p className="font-bold">Read-only Mode</p>
          <p>This campaign was generated by AI and cannot be edited. You can cancel it from the campaign details page if needed.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Campaign Core Details Fieldset */}
        <fieldset className="space-y-6 p-6 border border-gray-300 rounded-lg">
          <legend className="text-xl font-semibold text-gray-700 px-2">Core Details</legend>
          
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">Campaign Title</label>
            <input 
              type="text" 
              name="title" 
              id="title" 
              value={campaign.title}
              onChange={handleChange}
              disabled={isAiCampaignReadOnly}
              className={`mt-1 block w-full px-3 py-2 border ${formErrors.title ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
            {formErrors.title && <p className="mt-1 text-xs text-red-600">{formErrors.title}</p>}
          </div>

          <div>
            <label htmlFor="brand" className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
            <input 
              type="text" 
              name="brand" 
              id="brand" 
              value={campaign.brand}
              onChange={handleChange}
              disabled={isAiCampaignReadOnly}
              className={`mt-1 block w-full px-3 py-2 border ${formErrors.brand ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            />
             {formErrors.brand && <p className="mt-1 text-xs text-red-600">{formErrors.brand}</p>}
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select 
              name="status" 
              id="status" 
              value={campaign.status}
              onChange={handleChange}
              disabled={isAiCampaignReadOnly}
              className={`mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              {STATUS_OPTIONS.map(option => (
                <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Campaign Description</label>
            <textarea 
              name="description" 
              id="description" 
              rows={4}
              value={campaign.description}
              onChange={handleChange}
              disabled={isAiCampaignReadOnly}
              className={`mt-1 block w-full px-3 py-2 border ${formErrors.description ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            ></textarea>
            {formErrors.description && <p className="mt-1 text-xs text-red-600">{formErrors.description}</p>}
          </div>

          <div>
            <label htmlFor="brief" className="block text-sm font-medium text-gray-700 mb-1">Campaign Brief</label>
            <textarea 
              name="brief" 
              id="brief" 
              rows={6} 
              value={campaign.brief}
              onChange={handleChange}
              disabled={isAiCampaignReadOnly}
              className={`mt-1 block w-full px-3 py-2 border ${formErrors.brief ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder="Detailed brief including goals, deliverables, key messages, do's and don'ts..."
            ></textarea>
            {formErrors.brief && <p className="mt-1 text-xs text-red-600">{formErrors.brief}</p>}
          </div>

          <div className="mb-6">
            <label htmlFor="campaignAudienceDescription" className="block text-sm font-medium text-gray-700 mb-1">Campaign's Target Audience Description (Viewers)</label>
            <textarea
              id="campaignAudienceDescription"
              name="campaignAudienceDescription"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
              value={campaign.campaignAudienceDescription || ''}
              onChange={handleChange}
              placeholder="Describe the primary audience who will be viewing the campaign content (e.g., age, interests, location)."
              disabled={isAiCampaignReadOnly}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="targetInfluencerDescription" className="block text-sm font-medium text-gray-700 mb-1">Target Influencer Profile Description (Creators)</label>
            <textarea
              id="targetInfluencerDescription"
              name="targetInfluencerDescription"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
              value={campaign.targetInfluencerDescription || ''}
              onChange={handleChange}
              placeholder="Describe the ideal influencers you want to collaborate with (e.g., niche, style, follower count, platform expertise)."
              disabled={isAiCampaignReadOnly}
            />
          </div>
        </fieldset>

        {/* Budget & Timeline Fieldset */}
        <fieldset className="space-y-6 p-6 border border-gray-300 rounded-lg">
          <legend className="text-xl font-semibold text-gray-700 px-2">Budget & Timeline</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="budget.min" className="block text-sm font-medium text-gray-700 mb-1">Minimum Budget ($)</label>
              <input 
                type="number" 
                name="budget.min" 
                id="budget.min" 
                value={campaign.budget.min === null ? '' : campaign.budget.min}
                onChange={handleChange}
                disabled={isAiCampaignReadOnly}
                className={`mt-1 block w-full px-3 py-2 border ${formErrors['budget.min'] ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="e.g., 500"
              />
              {formErrors['budget.min'] && <p className="mt-1 text-xs text-red-600">{formErrors['budget.min']}</p>}
            </div>
            <div>
              <label htmlFor="budget.max" className="block text-sm font-medium text-gray-700 mb-1">Maximum Budget ($)</label>
              <input 
                type="number" 
                name="budget.max" 
                id="budget.max" 
                value={campaign.budget.max === null ? '' : campaign.budget.max}
                onChange={handleChange}
                disabled={isAiCampaignReadOnly}
                className={`mt-1 block w-full px-3 py-2 border ${formErrors['budget.max'] ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="e.g., 2000"
              />
              {formErrors['budget.max'] && <p className="mt-1 text-xs text-red-600">{formErrors['budget.max']}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="timeline.applicationDeadline" className="block text-sm font-medium text-gray-700 mb-1">Application Deadline</label>
              <input 
                type="date" 
                name="timeline.applicationDeadline" 
                id="timeline.applicationDeadline"
                value={campaign.timeline.applicationDeadline || ''}
                onChange={handleChange}
                disabled={isAiCampaignReadOnly}
                className={`mt-1 block w-full px-3 py-2 border ${formErrors['timeline.applicationDeadline'] ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {formErrors['timeline.applicationDeadline'] && <p className="mt-1 text-xs text-red-600">{formErrors['timeline.applicationDeadline']}</p>}
            </div>
            <div>
              <label htmlFor="timeline.startDate" className="block text-sm font-medium text-gray-700 mb-1">Campaign Start Date</label>
              <input 
                type="date" 
                name="timeline.startDate" 
                id="timeline.startDate"
                value={campaign.timeline.startDate || ''}
                onChange={handleChange}
                disabled={isAiCampaignReadOnly}
                className={`mt-1 block w-full px-3 py-2 border ${formErrors['timeline.startDate'] ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {formErrors['timeline.startDate'] && <p className="mt-1 text-xs text-red-600">{formErrors['timeline.startDate']}</p>}
            </div>
            <div>
              <label htmlFor="timeline.endDate" className="block text-sm font-medium text-gray-700 mb-1">Campaign End Date</label>
              <input 
                type="date" 
                name="timeline.endDate" 
                id="timeline.endDate"
                value={campaign.timeline.endDate || ''}
                onChange={handleChange}
                disabled={isAiCampaignReadOnly}
                className={`mt-1 block w-full px-3 py-2 border ${formErrors['timeline.endDate'] ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {formErrors['timeline.endDate'] && <p className="mt-1 text-xs text-red-600">{formErrors['timeline.endDate']}</p>}
            </div>
          </div>
        </fieldset>

        {/* Influencer Requirements Fieldset */}
        <fieldset className="space-y-6 p-6 border border-gray-300 rounded-lg">
          <legend className="text-xl font-semibold text-gray-700 px-2">Influencer Requirements</legend>

          <div>
            <label htmlFor="requirements.platforms" className="block text-sm font-medium text-gray-700 mb-1">Platforms</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
              {PLATFORM_OPTIONS.map(platform => (
                <label key={platform} className="flex items-center space-x-2 p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                  <input 
                    type="checkbox" 
                    value={platform}
                    checked={campaign.requirements.platforms.includes(platform)}
                    onChange={() => !isAiCampaignReadOnly && toggleArrayRequirement('platforms', platform)}
                    disabled={isAiCampaignReadOnly}
                    className={`h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${isAiCampaignReadOnly ? 'cursor-not-allowed' : ''}`}
                  />
                  <span className={`text-sm ${isAiCampaignReadOnly ? 'text-gray-400' : 'text-gray-700'}`}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="requirements.minFollowers" className="block text-sm font-medium text-gray-700 mb-1">Minimum Followers</label>
            <select 
              name="requirements.minFollowers" 
              id="requirements.minFollowers"
              value={campaign.requirements.minFollowers === null ? '' : campaign.requirements.minFollowers}
              onChange={(e) => !isAiCampaignReadOnly && handleRequirementChange('minFollowers', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              disabled={isAiCampaignReadOnly}
              className={`mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${isAiCampaignReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              {FOLLOWER_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="requirements.niches" className="block text-sm font-medium text-gray-700 mb-1">Niches (select multiple)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
                {NICHE_OPTIONS.map(niche => (
                    <label key={niche} className="flex items-center space-x-2 p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                        <input 
                            type="checkbox" 
                            value={niche}
                            checked={campaign.requirements.niches.includes(niche)}
                            onChange={() => !isAiCampaignReadOnly && toggleArrayRequirement('niches', niche)}
                            disabled={isAiCampaignReadOnly}
                            className={`h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${isAiCampaignReadOnly ? 'cursor-not-allowed' : ''}`}
                        />
                        <span className={`text-sm ${isAiCampaignReadOnly ? 'text-gray-400' : 'text-gray-700'}`}>{niche.charAt(0).toUpperCase() + niche.slice(1)}</span>
                    </label>
                ))}
            </div>
          </div>
          
          <div>
            <label htmlFor="requirements.locations" className="block text-sm font-medium text-gray-700 mb-1">Locations (select multiple)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
                {LOCATION_OPTIONS.map(location => (
                    <label key={location} className="flex items-center space-x-2 p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                        <input 
                            type="checkbox" 
                            value={location}
                            checked={campaign.requirements.locations.includes(location)}
                            onChange={() => !isAiCampaignReadOnly && toggleArrayRequirement('locations', location)}
                            disabled={isAiCampaignReadOnly}
                            className={`h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${isAiCampaignReadOnly ? 'cursor-not-allowed' : ''}`}
                        />
                        <span className={`text-sm ${isAiCampaignReadOnly ? 'text-gray-400' : 'text-gray-700'}`}>{location}</span>
                    </label>
                ))}
            </div>
          </div>

          <div>
            <label htmlFor="requirements.deliverables" className="block text-sm font-medium text-gray-700 mb-1">Deliverables (select multiple)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                {DELIVERABLE_OPTIONS.map(deliverable => (
                    <label key={deliverable} className="flex items-center space-x-2 p-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                        <input 
                            type="checkbox" 
                            value={deliverable}
                            checked={campaign.requirements.deliverables.includes(deliverable)}
                            onChange={() => !isAiCampaignReadOnly && toggleArrayRequirement('deliverables', deliverable)}
                            disabled={isAiCampaignReadOnly}
                            className={`h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 ${isAiCampaignReadOnly ? 'cursor-not-allowed' : ''}`}
                        />
                        <span className={`text-sm ${isAiCampaignReadOnly ? 'text-gray-400' : 'text-gray-700'}`}>{deliverable}</span>
                    </label>
                ))}
            </div>
          </div>

        </fieldset>

        {/* Form Actions */}
        <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
          <button 
            type="button" 
            onClick={handleCancel}
            className="px-6 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting || isAiCampaignReadOnly} // Disable if submitting or AI campaign
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignEditPage; 