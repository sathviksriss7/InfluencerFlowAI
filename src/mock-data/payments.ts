import { type PaymentMilestone } from '../types';

export const mockPaymentMilestones: PaymentMilestone[] = [
  // Emma Rodriguez - Sustainable Fashion (deal_003)
  {
    id: "payment_001",
    dealId: "deal_003",
    title: "Contract Signing",
    amount: 1400, // 50% upfront
    dueDate: new Date('2024-04-21'),
    status: "completed",
    paidAt: new Date('2024-04-21T16:45:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_002", 
    dealId: "deal_003",
    title: "Content Delivery",
    amount: 1400, // Remaining 50%
    dueDate: new Date('2024-08-15'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Marcus Johnson - Tech Review (deal_002)
  {
    id: "payment_003",
    dealId: "deal_002", 
    title: "Contract Signing",
    amount: 4250, // 50% upfront
    dueDate: new Date('2024-04-22'),
    status: "pending",
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_004",
    dealId: "deal_002",
    title: "Content Delivery", 
    amount: 4250, // Remaining 50%
    dueDate: new Date('2024-08-25'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Alex Kim - Global Cuisine Discovery (deal_004)
  {
    id: "payment_005",
    dealId: "deal_004",
    title: "Contract Signing",
    amount: 1600, // 50% upfront  
    dueDate: new Date('2024-04-25'),
    status: "completed",
    paidAt: new Date('2024-04-25T14:20:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_006",
    dealId: "deal_004", 
    title: "Content Delivery",
    amount: 1600, // Remaining 50%
    dueDate: new Date('2024-07-20'),
    status: "completed", 
    paidAt: new Date('2024-07-20T18:30:00'),
    description: "Final 50% payment upon content delivery and approval"
  },

  // Benjamin Wright - Home Office Transformation (deal_009)
  {
    id: "payment_007",
    dealId: "deal_009",
    title: "Contract Signing",
    amount: 2600,
    dueDate: new Date('2024-04-25'),
    status: "pending",
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_008", 
    dealId: "deal_009",
    title: "Content Delivery",
    amount: 2600,
    dueDate: new Date('2024-08-15'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Hassan Al-Rashid - Plant-Based Protein (deal_010)
  {
    id: "payment_009",
    dealId: "deal_010", 
    title: "Contract Signing",
    amount: 1750,
    dueDate: new Date('2024-05-08'),
    status: "completed",
    paidAt: new Date('2024-05-08T15:45:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_010",
    dealId: "deal_010",
    title: "Content Delivery",
    amount: 1750,
    dueDate: new Date('2024-09-01'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Omar Hassan - Financial Freedom Journey (deal_015)
  {
    id: "payment_011",
    dealId: "deal_015",
    title: "Contract Signing",
    amount: 1600,
    dueDate: new Date('2024-04-25'),
    status: "completed",
    paidAt: new Date('2024-04-25T10:15:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_012",
    dealId: "deal_015",
    title: "Content Delivery",
    amount: 1600,
    dueDate: new Date('2024-08-01'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Priya Patel - Adventure Gear Testing (deal_020)
  {
    id: "payment_013",
    dealId: "deal_020",
    title: "Contract Signing",
    amount: 1400,
    dueDate: new Date('2024-04-08'),
    status: "completed",
    paidAt: new Date('2024-04-08T16:30:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_014",
    dealId: "deal_020",
    title: "Content Delivery",
    amount: 1400,
    dueDate: new Date('2024-08-01'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Isabella Chen - Language Learning (deal_022)
  {
    id: "payment_015",
    dealId: "deal_022",
    title: "Contract Signing",
    amount: 1100,
    dueDate: new Date('2024-05-03'),
    status: "completed",
    paidAt: new Date('2024-05-03T16:00:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_016",
    dealId: "deal_022",
    title: "Content Delivery",
    amount: 1100,
    dueDate: new Date('2024-09-01'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Valentina Rossi - Mindfulness & Meditation (deal_025)
  {
    id: "payment_017",
    dealId: "deal_025",
    title: "Contract Signing",
    amount: 1400,
    dueDate: new Date('2024-04-12'),
    status: "completed",
    paidAt: new Date('2024-04-12T14:45:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_018",
    dealId: "deal_025",
    title: "Content Delivery",
    amount: 1400,
    dueDate: new Date('2024-07-10'),
    status: "completed",
    paidAt: new Date('2024-07-10T12:30:00'),
    description: "Final 50% payment upon content delivery and approval"
  },

  // Hassan Al-Rashid - Summer Fitness Challenge (deal_016)
  {
    id: "payment_019",
    dealId: "deal_016",
    title: "Contract Signing",
    amount: 1400,
    dueDate: new Date('2024-04-28'),
    status: "completed",
    paidAt: new Date('2024-04-28T14:00:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_020",
    dealId: "deal_016",
    title: "Content Delivery",
    amount: 1400,
    dueDate: new Date('2024-08-31'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Olivia Martinez - Pet Care Essentials (deal_008) - COMPLETED
  {
    id: "payment_021",
    dealId: "deal_008",
    title: "Contract Signing",
    amount: 1400,
    dueDate: new Date('2024-02-25'),
    status: "completed",
    paidAt: new Date('2024-02-25T11:30:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_022",
    dealId: "deal_008",
    title: "Content Delivery",
    amount: 1400,
    dueDate: new Date('2024-07-15'),
    status: "completed",
    paidAt: new Date('2024-07-15T16:45:00'),
    description: "Final 50% payment upon content delivery and approval"
  },

  // Ryan Cooper - Global Cuisine Discovery (deal_018) - COMPLETED
  {
    id: "payment_023",
    dealId: "deal_018",
    title: "Contract Signing",
    amount: 1900,
    dueDate: new Date('2024-02-20'),
    status: "completed",
    paidAt: new Date('2024-02-20T10:15:00'),
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_024",
    dealId: "deal_018",
    title: "Content Delivery",
    amount: 1900,
    dueDate: new Date('2024-07-20'),
    status: "completed",
    paidAt: new Date('2024-07-20T14:20:00'),
    description: "Final 50% payment upon content delivery and approval"
  },

  // Aisha Okonkwo - Sustainable Fashion (deal_021)
  {
    id: "payment_025",
    dealId: "deal_021",
    title: "Contract Signing",
    amount: 1300,
    dueDate: new Date('2024-04-20'),
    status: "pending",
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_026",
    dealId: "deal_021",
    title: "Content Delivery",
    amount: 1300,
    dueDate: new Date('2024-08-15'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Sofia Andersson - Eco-Friendly Home Solutions (deal_014)
  {
    id: "payment_027",
    dealId: "deal_014",
    title: "Contract Signing",
    amount: 1450,
    dueDate: new Date('2024-05-15'),
    status: "pending",
    description: "50% payment upon contract signing"
  },
  {
    id: "payment_028",
    dealId: "deal_014",
    title: "Content Delivery",
    amount: 1450,
    dueDate: new Date('2024-09-05'),
    status: "pending",
    description: "Final 50% payment upon content delivery and approval"
  },

  // Additional historical payments for demo
  {
    id: "payment_029",
    dealId: "deal_historical_001",
    title: "Q1 Brand Campaign",
    amount: 3500,
    dueDate: new Date('2024-03-15'),
    status: "completed",
    paidAt: new Date('2024-03-15T10:30:00'),
    description: "Full payment for Q1 brand awareness campaign"
  },
  {
    id: "payment_030", 
    dealId: "deal_historical_002",
    title: "Product Launch Campaign",
    amount: 5200,
    dueDate: new Date('2024-02-28'),
    status: "completed",
    paidAt: new Date('2024-02-28T14:20:00'),
    description: "Payment for product launch campaign deliverables"
  },
  {
    id: "payment_031",
    dealId: "deal_historical_003", 
    title: "Holiday Campaign",
    amount: 2800,
    dueDate: new Date('2024-01-15'),
    status: "completed",
    paidAt: new Date('2024-01-15T09:45:00'),
    description: "Holiday season promotional campaign payment"
  },
  {
    id: "payment_032",
    dealId: "deal_overdue_001", 
    title: "Overdue Payment",
    amount: 1800,
    dueDate: new Date('2024-04-10'),
    status: "overdue",
    description: "Overdue payment for completed campaign content"
  },
  {
    id: "payment_033",
    dealId: "deal_historical_004", 
    title: "Winter Collection Launch",
    amount: 4200,
    dueDate: new Date('2024-01-30'),
    status: "completed",
    paidAt: new Date('2024-01-30T11:15:00'),
    description: "Winter fashion collection launch campaign"
  },
  {
    id: "payment_034",
    dealId: "deal_historical_005", 
    title: "Tech Product Review",
    amount: 6500,
    dueDate: new Date('2024-03-01'),
    status: "completed",
    paidAt: new Date('2024-03-01T15:20:00'),
    description: "Comprehensive tech product review and testing"
  },
  {
    id: "payment_035",
    dealId: "deal_overdue_002", 
    title: "Late Beauty Campaign",
    amount: 2200,
    dueDate: new Date('2024-04-05'),
    status: "overdue",
    description: "Overdue payment for beauty product campaign"
  }
]; 