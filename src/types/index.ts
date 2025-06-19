// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'brand' | 'admin';
  avatar?: string;
  company?: string;
  createdAt: Date;
}

// Creator Types  
export interface Creator {
  id: string;
  name: string;
  username: string;
  platform: 'instagram' | 'youtube' | 'tiktok' | 'twitter' | 'linkedin';
  avatar: string;
  niche: string[];
  location: string;
  bio: string;
  verified: boolean;
  phone_number?: string;
  email?: string;
  metrics: {
    followers: number;
    avgViews: number;
    engagementRate: number;
    avgLikes: number;
    avgComments: number;
  };
  rates: {
    post: number;
    story?: number;
    reel?: number;
    video?: number;
  };
  demographics: {
    ageRange: string;
    topCountries: string[];
    genderSplit: {
      male: number;
      female: number;
      other: number;
    };
  };
  rating: number;
  responseTime: string;
}

// Campaign Types
export interface Campaign {
  id: string;
  title: string;
  brand: string;
  industry?: string;
  description: string;
  brief: string;
  budget: {
    min: number;
    max: number;
  };
  timeline: {
    startDate: Date;
    endDate: Date;
    applicationDeadline: Date;
  };
  requirements: {
    platforms: string[];
    minFollowers: number;
    niches: string[];
    locations?: string[];
  };
  deliverables: string[];
  status: 'draft' | 'active' | 'in_review' | 'completed' | 'cancelled';
  applicants: number;
  selected: number;
  createdAt: Date;
  tags: string[];
}

// Deal/Negotiation Types
export interface Deal {
  id: string;
  campaignId: string;
  creatorId: string;
  status: 'pending' | 'negotiating' | 'agreed' | 'contract_sent' | 'signed' | 'completed' | 'cancelled';
  proposedRate: number;
  finalRate?: number;
  deliverables: string[];
  timeline: {
    contentDue: Date;
    campaignStart: Date;
    campaignEnd: Date;
  };
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

// Message Types
export interface Message {
  id: string;
  dealId: string;
  sender: 'brand' | 'creator' | 'ai';
  content: string;
  type: 'text' | 'proposal' | 'counter_offer' | 'agreement' | 'contract';
  timestamp: Date;
  read: boolean;
  metadata?: {
    proposedRate?: number;
    deliverables?: string[];
    timeline?: Date;
  };
}

// Contract Types
export interface Contract {
  id: string;
  dealId: string;
  status: 'draft' | 'sent' | 'signed' | 'completed';
  signedAt?: Date;
  pdfUrl: string;
  terms: {
    rate: number;
    deliverables: string[];
    timeline: {
      contentDue: Date;
      campaignStart: Date;
      campaignEnd: Date;
    };
    revisions: number;
    exclusivity?: boolean;
    usageRights: string;
  };
  createdAt: Date;
}

// Payment Types
export interface PaymentMilestone {
  id: string;
  dealId: string;
  title: string;
  amount: number;
  dueDate: Date;
  status: 'pending' | 'completed' | 'overdue';
  paidAt?: Date;
  description: string;
} 