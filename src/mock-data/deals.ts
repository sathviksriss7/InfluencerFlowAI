import { type Deal, type Message } from '../types';

export const mockMessages: Message[] = [
  {
    id: "msg_001",
    dealId: "deal_001",
    sender: "brand",
    content: "Hi Sarah! We're excited about your fitness content and would love to collaborate on our Summer Fitness Challenge campaign. Are you interested?",
    type: "text",
    timestamp: new Date('2024-04-15T10:00:00'),
    read: true
  },
  {
    id: "msg_002", 
    dealId: "deal_001",
    sender: "creator",
    content: "Hi! Thank you for reaching out. I'd love to learn more about the campaign. Could you share more details about the deliverables and timeline?",
    type: "text",
    timestamp: new Date('2024-04-15T14:30:00'),
    read: true
  },
  {
    id: "msg_003",
    dealId: "deal_001", 
    sender: "brand",
    content: "Absolutely! We're looking for 3 Instagram posts, 2 stories per week, and 1 YouTube video. Campaign runs June-August. Our budget is ₹2,000-₹5,000.",
    type: "proposal",
    timestamp: new Date('2024-04-16T09:15:00'),
    read: true,
    metadata: {
      proposedRate: 3500,
      deliverables: ["3 Instagram posts", "2 stories per week", "1 YouTube video"],
      timeline: new Date('2024-08-31')
    }
  },
  {
    id: "msg_004",
    dealId: "deal_001",
    sender: "creator", 
    content: "This looks great! Given the scope and my rates, I'd propose ₹4,200 for the full package. This includes all deliverables plus progress tracking content.",
    type: "counter_offer",
    timestamp: new Date('2024-04-16T16:45:00'),
    read: true,
    metadata: {
      proposedRate: 4200
    }
  },
  {
    id: "msg_005",
    dealId: "deal_002",
    sender: "ai",
    content: "Based on Marcus's profile and similar tech review campaigns, the proposed rate of ₹8,500 aligns well with industry standards for his follower count and engagement.",
    type: "text", 
    timestamp: new Date('2024-04-18T11:20:00'),
    read: true
  },
  {
    id: "msg_006",
    dealId: "deal_003",
    sender: "brand",
    content: "Emma, we love your sustainable fashion content! Would you be interested in our EcoStyle campaign?",
    type: "text",
    timestamp: new Date('2024-04-12T09:00:00'),
    read: true
  },
  {
    id: "msg_007",
    dealId: "deal_004",
    sender: "creator",
    content: "I'm definitely interested in the food delivery campaign! The global cuisine focus aligns perfectly with my content style.",
    type: "text",
    timestamp: new Date('2024-04-20T15:30:00'),
    read: true
  },
  {
    id: "msg_008",
    dealId: "deal_005",
    sender: "brand",
    content: "Your beauty content is exactly what we're looking for! Our clean beauty line would be perfect for your audience.",
    type: "proposal",
    timestamp: new Date('2024-04-25T11:15:00'),
    read: true,
    metadata: {
      proposedRate: 4500
    }
  }
];

export const mockDeals: Deal[] = [
  {
    id: "deal_001",
    campaignId: "camp_001", // Summer Fitness Challenge 2024
    creatorId: "cr_001", // Sarah Chen
    status: "negotiating",
    proposedRate: 4200,
    deliverables: [
      "3 Instagram posts showing app usage",
      "2 Instagram stories per week for 8 weeks", 
      "1 YouTube video review (5+ minutes)",
      "Progress tracking content over 30 days"
    ],
    timeline: {
      contentDue: new Date('2024-08-15'),
      campaignStart: new Date('2024-06-01'),
      campaignEnd: new Date('2024-08-31')
    },
    messages: mockMessages.filter(msg => msg.dealId === "deal_001"),
    createdAt: new Date('2024-04-15'),
    updatedAt: new Date('2024-04-16')
  },
  {
    id: "deal_002", 
    campaignId: "camp_004", // Tech Innovations Showcase
    creatorId: "cr_002", // Marcus Johnson
    status: "contract_sent",
    proposedRate: 8500,
    finalRate: 8500,
    deliverables: [
      "Detailed product unboxing and setup",
      "Feature demonstration videos",
      "Integration with existing smart home",
      "Long-term usage review"
    ],
    timeline: {
      contentDue: new Date('2024-08-20'),
      campaignStart: new Date('2024-06-01'), 
      campaignEnd: new Date('2024-08-31')
    },
    messages: mockMessages.filter(msg => msg.dealId === "deal_002"),
    createdAt: new Date('2024-04-12'),
    updatedAt: new Date('2024-04-20')
  },
  {
    id: "deal_003",
    campaignId: "camp_002", // Sustainable Fashion Forward
    creatorId: "cr_003", // Emma Rodriguez
    status: "agreed",
    proposedRate: 2800,
    finalRate: 2800,
    deliverables: [
      "4 outfit posts featuring sustainable pieces",
      "Behind-the-scenes styling content",
      "1 styling video/reel showing versatility", 
      "Sustainability story highlights"
    ],
    timeline: {
      contentDue: new Date('2024-08-10'),
      campaignStart: new Date('2024-07-15'),
      campaignEnd: new Date('2024-08-15')
    },
    messages: mockMessages.filter(msg => msg.dealId === "deal_003"),
    createdAt: new Date('2024-04-10'),
    updatedAt: new Date('2024-04-18')
  },
  {
    id: "deal_004",
    campaignId: "camp_003", // Global Cuisine Discovery
    creatorId: "cr_004", // Alex Kim
    status: "signed",
    proposedRate: 3200,
    finalRate: 3200,
    deliverables: [
      "5 food review posts from different cuisines",
      "Cooking attempt of featured dishes",
      "Cultural food story content",
      "App usage demonstration"
    ],
    timeline: {
      contentDue: new Date('2024-07-15'),
      campaignStart: new Date('2024-05-20'),
      campaignEnd: new Date('2024-07-20')
    },
    messages: mockMessages.filter(msg => msg.dealId === "deal_004"),
    createdAt: new Date('2024-04-20'),
    updatedAt: new Date('2024-04-22')
  },
  {
    id: "deal_005",
    campaignId: "camp_005", // Beauty Routine Revolution
    creatorId: "cr_007", // Luna Martinez
    status: "negotiating",
    proposedRate: 4500,
    deliverables: [
      "Morning and evening routine content",
      "Before/after skin journey documentation", 
      "Product ingredient breakdowns",
      "Makeup looks using the products"
    ],
    timeline: {
      contentDue: new Date('2024-08-25'),
      campaignStart: new Date('2024-07-01'),
      campaignEnd: new Date('2024-09-01')
    },
    messages: mockMessages.filter(msg => msg.dealId === "deal_005"),
    createdAt: new Date('2024-04-25'),
    updatedAt: new Date('2024-04-26')
  },
  {
    id: "deal_006",
    campaignId: "camp_006", // Adventure Gear Testing
    creatorId: "cr_018", // Liam O'Connor
    status: "agreed",
    proposedRate: 3200,
    finalRate: 3200,
    deliverables: [
      "Gear testing in real conditions",
      "Adventure documentation",
      "Product performance reviews",
      "Outdoor tips and tutorials"
    ],
    timeline: {
      contentDue: new Date('2024-07-25'),
      campaignStart: new Date('2024-05-01'),
      campaignEnd: new Date('2024-08-01')
    },
    messages: [],
    createdAt: new Date('2024-03-15'),
    updatedAt: new Date('2024-04-10')
  },
  {
    id: "deal_007",
    campaignId: "camp_007", // Language Learning Journey
    creatorId: "cr_013", // Maya Tanaka
    status: "pending",
    proposedRate: 1800,
    deliverables: [
      "Weekly progress check-ins",
      "Daily lesson highlights",
      "Native speaker conversations",
      "Cultural learning moments"
    ],
    timeline: {
      contentDue: new Date('2024-08-15'),
      campaignStart: new Date('2024-06-01'),
      campaignEnd: new Date('2024-09-01')
    },
    messages: [],
    createdAt: new Date('2024-04-28'),
    updatedAt: new Date('2024-04-28')
  },
  {
    id: "deal_008",
    campaignId: "camp_008", // Pet Care Essentials
    creatorId: "cr_024", // Olivia Martinez
    status: "completed",
    proposedRate: 2800,
    finalRate: 2800,
    deliverables: [
      "Pet product unboxing and testing",
      "Daily pet care routines",
      "Training and play sessions",
      "Health and wellness tips"
    ],
    timeline: {
      contentDue: new Date('2024-07-10'),
      campaignStart: new Date('2024-05-15'),
      campaignEnd: new Date('2024-07-15')
    },
    messages: [],
    createdAt: new Date('2024-02-20'),
    updatedAt: new Date('2024-07-15')
  },
  {
    id: "deal_009",
    campaignId: "camp_009", // Home Office Transformation
    creatorId: "cr_025", // Benjamin Wright
    status: "contract_sent",
    proposedRate: 5200,
    finalRate: 5200,
    deliverables: [
      "Office transformation time-lapse",
      "Productivity routine content",
      "Ergonomic setup tutorials",
      "Work-from-home tips"
    ],
    timeline: {
      contentDue: new Date('2024-08-10'),
      campaignStart: new Date('2024-06-15'),
      campaignEnd: new Date('2024-08-15')
    },
    messages: [],
    createdAt: new Date('2024-04-22'),
    updatedAt: new Date('2024-04-25')
  },
  {
    id: "deal_010",
    campaignId: "camp_010", // Plant-Based Protein Revolution
    creatorId: "cr_023", // Hassan Al-Rashid
    status: "signed",
    proposedRate: 3500,
    finalRate: 3500,
    deliverables: [
      "Pre/post workout routines with product",
      "Plant-based meal prep content",
      "Athletic performance documentation",
      "Ingredient education content"
    ],
    timeline: {
      contentDue: new Date('2024-08-25'),
      campaignStart: new Date('2024-07-01'),
      campaignEnd: new Date('2024-09-01')
    },
    messages: [],
    createdAt: new Date('2024-05-02'),
    updatedAt: new Date('2024-05-05')
  },
  {
    id: "deal_011",
    campaignId: "camp_011", // Digital Art Creation Suite
    creatorId: "cr_013", // Maya Tanaka
    status: "negotiating",
    proposedRate: 4800,
    deliverables: [
      "Speed art creation videos",
      "Tutorial content for beginners",
      "Professional workflow demonstrations",
      "Comparison with traditional methods"
    ],
    timeline: {
      contentDue: new Date('2024-08-15'),
      campaignStart: new Date('2024-06-20'),
      campaignEnd: new Date('2024-08-20')
    },
    messages: [],
    createdAt: new Date('2024-05-01'),
    updatedAt: new Date('2024-05-03')
  },
  {
    id: "deal_012",
    campaignId: "camp_012", // Mindfulness & Meditation
    creatorId: "cr_009", // Zara Ahmed
    status: "agreed",
    proposedRate: 2200,
    finalRate: 2200,
    deliverables: [
      "Daily meditation practice content",
      "Stress reduction technique tutorials",
      "Mindfulness in daily life examples",
      "Wellness routine documentation"
    ],
    timeline: {
      contentDue: new Date('2024-07-05'),
      campaignStart: new Date('2024-05-10'),
      campaignEnd: new Date('2024-07-10')
    },
    messages: [],
    createdAt: new Date('2024-03-25'),
    updatedAt: new Date('2024-04-15')
  },
  {
    id: "deal_013",
    campaignId: "camp_013", // Gaming Setup Showcase
    creatorId: "cr_008", // Jake Williams
    status: "pending",
    proposedRate: 8500,
    deliverables: [
      "Gaming setup build process",
      "Performance testing across games",
      "Streaming quality demonstrations",
      "Hardware comparison content"
    ],
    timeline: {
      contentDue: new Date('2024-08-20'),
      campaignStart: new Date('2024-06-25'),
      campaignEnd: new Date('2024-08-25')
    },
    messages: [],
    createdAt: new Date('2024-05-08'),
    updatedAt: new Date('2024-05-08')
  },
  {
    id: "deal_014",
    campaignId: "camp_014", // Eco-Friendly Home Solutions
    creatorId: "cr_011", // Sofia Andersson
    status: "contract_sent",
    proposedRate: 2900,
    finalRate: 2900,
    deliverables: [
      "Home sustainability audit",
      "Product swap challenges",
      "DIY eco-friendly solutions",
      "Environmental impact tracking"
    ],
    timeline: {
      contentDue: new Date('2024-08-30'),
      campaignStart: new Date('2024-07-05'),
      campaignEnd: new Date('2024-09-05')
    },
    messages: [],
    createdAt: new Date('2024-05-12'),
    updatedAt: new Date('2024-05-15')
  },
  {
    id: "deal_015",
    campaignId: "camp_015", // Financial Freedom Journey
    creatorId: "cr_014", // Omar Hassan
    status: "signed",
    proposedRate: 3200,
    finalRate: 3200,
    deliverables: [
      "Monthly budget planning content",
      "Investment education tutorials",
      "Financial goal tracking",
      "Money-saving tips and strategies"
    ],
    timeline: {
      contentDue: new Date('2024-07-25'),
      campaignStart: new Date('2024-06-01'),
      campaignEnd: new Date('2024-08-01')
    },
    messages: [],
    createdAt: new Date('2024-04-08'),
    updatedAt: new Date('2024-04-22')
  },
  {
    id: "deal_016",
    campaignId: "camp_001", // Summer Fitness Challenge 2024
    creatorId: "cr_023", // Hassan Al-Rashid
    status: "agreed",
    proposedRate: 2800,
    finalRate: 2800,
    deliverables: [
      "3 Instagram posts showing app usage",
      "2 Instagram stories per week for 8 weeks",
      "1 YouTube video review (5+ minutes)",
      "Progress tracking content over 30 days"
    ],
    timeline: {
      contentDue: new Date('2024-08-15'),
      campaignStart: new Date('2024-06-01'),
      campaignEnd: new Date('2024-08-31')
    },
    messages: [],
    createdAt: new Date('2024-04-18'),
    updatedAt: new Date('2024-04-25')
  },
  {
    id: "deal_017",
    campaignId: "camp_005", // Beauty Routine Revolution
    creatorId: "cr_022", // Chloe Park
    status: "pending",
    proposedRate: 2200,
    deliverables: [
      "Morning and evening routine content",
      "Before/after skin journey documentation",
      "Product ingredient breakdowns",
      "Makeup looks using the products"
    ],
    timeline: {
      contentDue: new Date('2024-08-25'),
      campaignStart: new Date('2024-07-01'),
      campaignEnd: new Date('2024-09-01')
    },
    messages: [],
    createdAt: new Date('2024-05-01'),
    updatedAt: new Date('2024-05-01')
  },
  {
    id: "deal_018",
    campaignId: "camp_003", // Global Cuisine Discovery
    creatorId: "cr_010", // Ryan Cooper
    status: "completed",
    proposedRate: 3800,
    finalRate: 3800,
    deliverables: [
      "5 food review posts from different cuisines",
      "Cooking attempt of featured dishes",
      "Cultural food story content",
      "App usage demonstration"
    ],
    timeline: {
      contentDue: new Date('2024-07-15'),
      campaignStart: new Date('2024-05-20'),
      campaignEnd: new Date('2024-07-20')
    },
    messages: [],
    createdAt: new Date('2024-02-15'),
    updatedAt: new Date('2024-07-20')
  },
  {
    id: "deal_019",
    campaignId: "camp_017", // Healthy Family Meals
    creatorId: "cr_016", // Antoine Dubois
    status: "negotiating",
    proposedRate: 3800,
    deliverables: [
      "Family meal prep content",
      "Kid-friendly recipe videos",
      "Nutrition education posts",
      "Meal planning tutorials"
    ],
    timeline: {
      contentDue: new Date('2024-08-10'),
      campaignStart: new Date('2024-06-15'),
      campaignEnd: new Date('2024-08-15')
    },
    messages: [],
    createdAt: new Date('2024-05-02'),
    updatedAt: new Date('2024-05-05')
  },
  {
    id: "deal_020",
    campaignId: "camp_006", // Adventure Gear Testing
    creatorId: "cr_005", // Priya Patel
    status: "signed",
    proposedRate: 2800,
    finalRate: 2800,
    deliverables: [
      "Gear testing in real conditions",
      "Adventure documentation",
      "Product performance reviews",
      "Outdoor tips and tutorials"
    ],
    timeline: {
      contentDue: new Date('2024-07-25'),
      campaignStart: new Date('2024-05-01'),
      campaignEnd: new Date('2024-08-01')
    },
    messages: [],
    createdAt: new Date('2024-03-20'),
    updatedAt: new Date('2024-04-05')
  },
  {
    id: "deal_021",
    campaignId: "camp_002", // Sustainable Fashion Forward
    creatorId: "cr_017", // Aisha Okonkwo
    status: "contract_sent",
    proposedRate: 2600,
    finalRate: 2600,
    deliverables: [
      "4 outfit posts featuring sustainable pieces",
      "Behind-the-scenes styling content",
      "1 styling video/reel showing versatility",
      "Sustainability story highlights"
    ],
    timeline: {
      contentDue: new Date('2024-08-10'),
      campaignStart: new Date('2024-07-15'),
      campaignEnd: new Date('2024-08-15')
    },
    messages: [],
    createdAt: new Date('2024-04-12'),
    updatedAt: new Date('2024-04-20')
  },
  {
    id: "deal_022",
    campaignId: "camp_007", // Language Learning Journey
    creatorId: "cr_015", // Isabella Chen
    status: "agreed",
    proposedRate: 2200,
    finalRate: 2200,
    deliverables: [
      "Weekly progress check-ins",
      "Daily lesson highlights",
      "Native speaker conversations",
      "Cultural learning moments"
    ],
    timeline: {
      contentDue: new Date('2024-08-15'),
      campaignStart: new Date('2024-06-01'),
      campaignEnd: new Date('2024-09-01')
    },
    messages: [],
    createdAt: new Date('2024-04-20'),
    updatedAt: new Date('2024-05-01')
  },
  {
    id: "deal_023",
    campaignId: "camp_016", // Travel Photography Mastery
    creatorId: "cr_005", // Priya Patel
    status: "pending",
    proposedRate: 5200,
    deliverables: [
      "Photography technique tutorials",
      "Gear testing in various conditions",
      "Editing workflow demonstrations",
      "Travel photography storytelling"
    ],
    timeline: {
      contentDue: new Date('2024-08-20'),
      campaignStart: new Date('2024-05-25'),
      campaignEnd: new Date('2024-08-25')
    },
    messages: [],
    createdAt: new Date('2024-05-10'),
    updatedAt: new Date('2024-05-10')
  },
  {
    id: "deal_024",
    campaignId: "camp_004", // Tech Innovations Showcase
    creatorId: "cr_019", // Kenji Yamamoto
    status: "cancelled",
    proposedRate: 4200,
    deliverables: [
      "Detailed product unboxing and setup",
      "Feature demonstration videos",
      "Integration with existing smart home",
      "Long-term usage review"
    ],
    timeline: {
      contentDue: new Date('2024-08-20'),
      campaignStart: new Date('2024-06-10'),
      campaignEnd: new Date('2024-08-10')
    },
    messages: [],
    createdAt: new Date('2024-04-15'),
    updatedAt: new Date('2024-05-01')
  },
  {
    id: "deal_025",
    campaignId: "camp_012", // Mindfulness & Meditation
    creatorId: "cr_020", // Valentina Rossi
    status: "signed",
    proposedRate: 2800,
    finalRate: 2800,
    deliverables: [
      "Daily meditation practice content",
      "Stress reduction technique tutorials",
      "Mindfulness in daily life examples",
      "Wellness routine documentation"
    ],
    timeline: {
      contentDue: new Date('2024-07-05'),
      campaignStart: new Date('2024-05-10'),
      campaignEnd: new Date('2024-07-10')
    },
    messages: [],
    createdAt: new Date('2024-03-28'),
    updatedAt: new Date('2024-04-10')
  }
]; 