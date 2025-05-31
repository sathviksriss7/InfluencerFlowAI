import { type Contract } from '../types';

export const mockContracts: Contract[] = [
  {
    id: "contract_001",
    dealId: "deal_003", // Emma Rodriguez - Sustainable Fashion
    status: "signed",
    signedAt: new Date('2024-04-20T15:30:00'),
    pdfUrl: "/contracts/contract_001.pdf",
    terms: {
      rate: 2800,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "Perpetual usage rights for brand social media, website, and advertising"
    },
    createdAt: new Date('2024-04-18T10:00:00')
  },
  {
    id: "contract_002", 
    dealId: "deal_002", // Marcus Johnson - Tech Review
    status: "sent",
    pdfUrl: "/contracts/contract_002.pdf",
    terms: {
      rate: 8500,
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
      revisions: 3,
      exclusivity: true,
      usageRights: "6-month usage rights for all marketing materials and platforms"
    },
    createdAt: new Date('2024-04-20T14:15:00')
  },
  {
    id: "contract_003",
    dealId: "deal_004", // Alex Kim - Global Cuisine Discovery
    status: "signed",
    signedAt: new Date('2024-04-25T11:20:00'),
    pdfUrl: "/contracts/contract_003.pdf",
    terms: {
      rate: 3200,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "1-year usage rights for brand social media and website"
    },
    createdAt: new Date('2024-04-22T09:30:00')
  },
  {
    id: "contract_004",
    dealId: "deal_009", // Benjamin Wright - Home Office Transformation
    status: "sent",
    pdfUrl: "/contracts/contract_004.pdf",
    terms: {
      rate: 5200,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "2-year usage rights for all business and marketing materials"
    },
    createdAt: new Date('2024-04-25T16:45:00')
  },
  {
    id: "contract_005",
    dealId: "deal_010", // Hassan Al-Rashid - Plant-Based Protein
    status: "signed",
    signedAt: new Date('2024-05-08T14:30:00'),
    pdfUrl: "/contracts/contract_005.pdf",
    terms: {
      rate: 3500,
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
      revisions: 3,
      exclusivity: false,
      usageRights: "Perpetual usage rights for fitness and nutrition marketing"
    },
    createdAt: new Date('2024-05-05T10:15:00')
  },
  {
    id: "contract_006",
    dealId: "deal_015", // Omar Hassan - Financial Freedom Journey
    status: "signed",
    signedAt: new Date('2024-04-25T09:45:00'),
    pdfUrl: "/contracts/contract_006.pdf",
    terms: {
      rate: 3200,
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
      revisions: 2,
      exclusivity: true,
      usageRights: "3-year usage rights for educational and marketing materials"
    },
    createdAt: new Date('2024-04-22T13:20:00')
  },
  {
    id: "contract_007",
    dealId: "deal_020", // Priya Patel - Adventure Gear Testing
    status: "signed",
    signedAt: new Date('2024-04-08T16:15:00'),
    pdfUrl: "/contracts/contract_007.pdf",
    terms: {
      rate: 2800,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "2-year usage rights for outdoor and adventure marketing"
    },
    createdAt: new Date('2024-04-05T11:30:00')
  },
  {
    id: "contract_008",
    dealId: "deal_021", // Aisha Okonkwo - Sustainable Fashion
    status: "sent",
    pdfUrl: "/contracts/contract_008.pdf",
    terms: {
      rate: 2600,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "1-year usage rights for brand social media and website"
    },
    createdAt: new Date('2024-04-20T12:00:00')
  },
  {
    id: "contract_009",
    dealId: "deal_022", // Isabella Chen - Language Learning
    status: "signed",
    signedAt: new Date('2024-05-03T15:45:00'),
    pdfUrl: "/contracts/contract_009.pdf",
    terms: {
      rate: 2200,
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
      revisions: 1,
      exclusivity: false,
      usageRights: "2-year usage rights for educational content and marketing"
    },
    createdAt: new Date('2024-05-01T10:30:00')
  },
  {
    id: "contract_010",
    dealId: "deal_025", // Valentina Rossi - Mindfulness & Meditation
    status: "signed",
    signedAt: new Date('2024-04-12T14:20:00'),
    pdfUrl: "/contracts/contract_010.pdf",
    terms: {
      rate: 2800,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "Perpetual usage rights for wellness and mental health content"
    },
    createdAt: new Date('2024-04-10T09:15:00')
  },
  {
    id: "contract_011",
    dealId: "deal_014", // Sofia Andersson - Eco-Friendly Home Solutions
    status: "sent",
    pdfUrl: "/contracts/contract_011.pdf",
    terms: {
      rate: 2900,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "3-year usage rights for sustainability and home improvement content"
    },
    createdAt: new Date('2024-05-15T11:45:00')
  },
  {
    id: "contract_012",
    dealId: "deal_016", // Hassan Al-Rashid - Summer Fitness Challenge
    status: "signed",
    signedAt: new Date('2024-04-28T13:30:00'),
    pdfUrl: "/contracts/contract_012.pdf",
    terms: {
      rate: 2800,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "2-year usage rights for fitness app marketing"
    },
    createdAt: new Date('2024-04-25T16:20:00')
  },
  {
    id: "contract_013",
    dealId: "deal_008", // Olivia Martinez - Pet Care Essentials (Completed)
    status: "completed",
    signedAt: new Date('2024-02-25T10:15:00'),
    pdfUrl: "/contracts/contract_013.pdf",
    terms: {
      rate: 2800,
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
      revisions: 2,
      exclusivity: false,
      usageRights: "Perpetual usage rights for pet care marketing"
    },
    createdAt: new Date('2024-02-20T14:30:00')
  },
  {
    id: "contract_014",
    dealId: "deal_018", // Ryan Cooper - Global Cuisine Discovery (Completed)
    status: "completed",
    signedAt: new Date('2024-02-20T09:45:00'),
    pdfUrl: "/contracts/contract_014.pdf",
    terms: {
      rate: 3800,
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
      revisions: 3,
      exclusivity: false,
      usageRights: "2-year usage rights for food delivery marketing"
    },
    createdAt: new Date('2024-02-15T13:20:00')
  }
]; 