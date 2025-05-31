import { type Campaign } from '../types';

export const mockCampaigns: Campaign[] = [
  {
    id: "camp_001",
    title: "Summer Fitness Challenge 2024",
    brand: "FitTech Pro",
    description: "Launch campaign for our new fitness tracking app featuring real user transformations",
    brief: "We're looking for fitness enthusiasts to showcase their summer transformation journey using our app. Content should highlight the app's features including workout tracking, nutrition logging, and progress photos. We want authentic, motivational content that resonates with people starting their fitness journey.",
    budget: {
      min: 2000,
      max: 5000
    },
    timeline: {
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-08-31'),
      applicationDeadline: new Date('2024-05-15')
    },
    requirements: {
      platforms: ["instagram", "youtube", "tiktok"],
      minFollowers: 50000,
      niches: ["fitness", "health", "lifestyle"],
      locations: ["United States", "Canada", "Australia"]
    },
    deliverables: [
      "3 Instagram posts showing app usage",
      "2 Instagram stories per week for 8 weeks", 
      "1 YouTube video review (5+ minutes)",
      "Progress tracking content over 30 days"
    ],
    status: "active",
    applicants: 127,
    selected: 8,
    createdAt: new Date('2024-04-01'),
    tags: ["fitness", "app", "transformation", "summer"]
  },
  {
    id: "camp_002",
    title: "Sustainable Fashion Forward",
    brand: "EcoStyle",
    description: "Promote our new eco-friendly clothing line with fashion-forward creators",
    brief: "Partner with sustainable fashion advocates to showcase our new spring collection made from recycled materials. Focus on styling versatility, quality, and environmental impact. Content should educate audiences about sustainable fashion while showcasing outfit possibilities.",
    budget: {
      min: 1500,
      max: 3500
    },
    timeline: {
      startDate: new Date('2024-07-15'),
      endDate: new Date('2024-08-15'),
      applicationDeadline: new Date('2024-06-30')
    },
    requirements: {
      platforms: ["instagram", "tiktok"],
      minFollowers: 25000,
      niches: ["fashion", "lifestyle", "sustainability"],
      locations: ["United States", "United Kingdom", "Canada"]
    },
    deliverables: [
      "4 outfit posts featuring sustainable pieces",
      "Behind-the-scenes styling content",
      "1 styling video/reel showing versatility", 
      "Sustainability story highlights"
    ],
    status: "active",
    applicants: 89,
    selected: 12,
    createdAt: new Date('2024-03-15'),
    tags: ["fashion", "sustainability", "eco-friendly", "spring"]
  },
  {
    id: "camp_003",
    title: "Global Cuisine Discovery",
    brand: "TasteWorld",
    description: "Food delivery app expansion featuring international cuisine creators",
    brief: "Showcase diverse international cuisines available on our platform. We want food creators to explore and review authentic dishes from different cultures, highlighting the variety and quality of our restaurant partners. Focus on the cultural stories behind the food.",
    budget: {
      min: 1000,
      max: 4000
    },
    timeline: {
      startDate: new Date('2024-05-20'),
      endDate: new Date('2024-07-20'),
      applicationDeadline: new Date('2024-05-05')
    },
    requirements: {
      platforms: ["instagram", "tiktok", "youtube"],
      minFollowers: 30000,
      niches: ["food", "cooking", "lifestyle"],
      locations: ["United States", "Canada", "United Kingdom", "Australia"]
    },
    deliverables: [
      "5 food review posts from different cuisines",
      "Cooking attempt of featured dishes",
      "Cultural food story content",
      "App usage demonstration"
    ],
    status: "completed",
    applicants: 156,
    selected: 15,
    createdAt: new Date('2024-02-20'),
    tags: ["food", "international", "culture", "delivery"]
  },
  {
    id: "camp_004",
    title: "Tech Innovations Showcase",
    brand: "NextGen Electronics",
    description: "Launch campaign for our latest smart home devices targeting tech enthusiasts",
    brief: "Demonstrate the capabilities of our new smart home ecosystem including voice control, automation features, and integration possibilities. Content should be educational yet exciting, showing real-world applications and setup processes.",
    budget: {
      min: 3000,
      max: 8000
    },
    timeline: {
      startDate: new Date('2024-06-10'),
      endDate: new Date('2024-08-10'),
      applicationDeadline: new Date('2024-05-25')
    },
    requirements: {
      platforms: ["youtube", "instagram", "tiktok"],
      minFollowers: 75000,
      niches: ["technology", "gaming", "lifestyle"],
      locations: ["United States", "United Kingdom", "Germany", "Canada"]
    },
    deliverables: [
      "Detailed product unboxing and setup",
      "Feature demonstration videos",
      "Integration with existing smart home",
      "Long-term usage review"
    ],
    status: "active",
    applicants: 94,
    selected: 6,
    createdAt: new Date('2024-04-10'),
    tags: ["technology", "smart home", "innovation", "electronics"]
  },
  {
    id: "camp_005",
    title: "Beauty Routine Revolution",
    brand: "GlowUp Cosmetics",
    description: "Skincare line launch focusing on natural ingredients and inclusive beauty",
    brief: "Introduce our new clean beauty line featuring products for all skin types and tones. Content should focus on ingredients transparency, application techniques, and real results over time. Emphasize inclusivity and self-expression.",
    budget: {
      min: 2000,
      max: 6000
    },
    timeline: {
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-09-01'),
      applicationDeadline: new Date('2024-06-15')
    },
    requirements: {
      platforms: ["instagram", "tiktok", "youtube"],
      minFollowers: 40000,
      niches: ["beauty", "skincare", "lifestyle"],
      locations: ["United States", "Canada", "United Kingdom", "Australia"]
    },
    deliverables: [
      "Morning and evening routine content",
      "Before/after skin journey documentation",
      "Product ingredient breakdowns",
      "Makeup looks using the products"
    ],
    status: "active",
    applicants: 201,
    selected: 18,
    createdAt: new Date('2024-04-25'),
    tags: ["beauty", "skincare", "natural", "inclusive"]
  },
  {
    id: "camp_006",
    title: "Adventure Gear Testing",
    brand: "WildTrail Equipment",
    description: "Outdoor gear campaign featuring real adventures and product testing",
    brief: "Take our latest hiking and camping gear on real outdoor adventures. Document performance, durability, and functionality in various weather conditions and terrains. Share tips and experiences that help other outdoor enthusiasts make informed decisions.",
    budget: {
      min: 1500,
      max: 4500
    },
    timeline: {
      startDate: new Date('2024-05-01'),
      endDate: new Date('2024-08-01'),
      applicationDeadline: new Date('2024-04-15')
    },
    requirements: {
      platforms: ["youtube", "instagram"],
      minFollowers: 35000,
      niches: ["outdoor", "adventure", "travel"],
      locations: ["United States", "Canada", "Norway", "New Zealand"]
    },
    deliverables: [
      "Gear testing in real conditions",
      "Adventure documentation",
      "Product performance reviews",
      "Outdoor tips and tutorials"
    ],
    status: "in_review",
    applicants: 67,
    selected: 8,
    createdAt: new Date('2024-03-01'),
    tags: ["outdoor", "adventure", "gear", "testing"]
  },
  {
    id: "camp_007",
    title: "Language Learning Journey",
    brand: "SpeakEasy App",
    description: "Document language learning progress using our AI-powered language app",
    brief: "Chronicle your language learning journey from beginner to conversational level using our app. Show daily lessons, pronunciation practice, cultural insights, and real conversations with native speakers through our platform.",
    budget: {
      min: 800,
      max: 2500
    },
    timeline: {
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-09-01'),
      applicationDeadline: new Date('2024-05-20')
    },
    requirements: {
      platforms: ["tiktok", "youtube", "instagram"],
      minFollowers: 20000,
      niches: ["education", "lifestyle", "travel"],
      locations: ["United States", "United Kingdom", "Canada", "Australia"]
    },
    deliverables: [
      "Weekly progress check-ins",
      "Daily lesson highlights",
      "Native speaker conversations",
      "Cultural learning moments"
    ],
    status: "active",
    applicants: 112,
    selected: 20,
    createdAt: new Date('2024-04-15'),
    tags: ["education", "language", "learning", "culture"]
  },
  {
    id: "camp_008",
    title: "Pet Care Essentials",
    brand: "PawPerfect",
    description: "Premium pet product line showcasing quality care for beloved pets",
    brief: "Feature our premium pet care products including organic food, interactive toys, and wellness supplements. Content should show genuine pet-owner relationships and how our products enhance pet happiness and health.",
    budget: {
      min: 1200,
      max: 3800
    },
    timeline: {
      startDate: new Date('2024-05-15'),
      endDate: new Date('2024-07-15'),
      applicationDeadline: new Date('2024-05-01')
    },
    requirements: {
      platforms: ["instagram", "tiktok", "youtube"],
      minFollowers: 25000,
      niches: ["pets", "animals", "lifestyle"],
      locations: ["United States", "Canada", "United Kingdom"]
    },
    deliverables: [
      "Pet product unboxing and testing",
      "Daily pet care routines",
      "Training and play sessions",
      "Health and wellness tips"
    ],
    status: "completed",
    applicants: 143,
    selected: 14,
    createdAt: new Date('2024-02-28'),
    tags: ["pets", "care", "organic", "wellness"]
  },
  {
    id: "camp_009",
    title: "Home Office Transformation",
    brand: "WorkSpace Pro",
    description: "Office furniture and productivity tools for remote work optimization",
    brief: "Transform your home office space with our ergonomic furniture and productivity accessories. Document the setup process, productivity improvements, and wellness benefits of a proper workspace setup.",
    budget: {
      min: 2500,
      max: 6500
    },
    timeline: {
      startDate: new Date('2024-06-15'),
      endDate: new Date('2024-08-15'),
      applicationDeadline: new Date('2024-06-01')
    },
    requirements: {
      platforms: ["youtube", "instagram", "linkedin"],
      minFollowers: 40000,
      niches: ["business", "productivity", "lifestyle"],
      locations: ["United States", "Canada", "United Kingdom", "Germany"]
    },
    deliverables: [
      "Office transformation time-lapse",
      "Productivity routine content",
      "Ergonomic setup tutorials",
      "Work-from-home tips"
    ],
    status: "active",
    applicants: 76,
    selected: 9,
    createdAt: new Date('2024-04-20'),
    tags: ["office", "productivity", "remote work", "ergonomic"]
  },
  {
    id: "camp_010",
    title: "Plant-Based Protein Revolution",
    brand: "VegaFuel",
    description: "Plant-based protein supplements for athletes and fitness enthusiasts",
    brief: "Showcase the performance benefits of plant-based protein through workout routines, recovery sessions, and meal prep content. Challenge misconceptions about plant protein and demonstrate real athletic performance.",
    budget: {
      min: 1800,
      max: 4200
    },
    timeline: {
      startDate: new Date('2024-07-01'),
      endDate: new Date('2024-09-01'),
      applicationDeadline: new Date('2024-06-15')
    },
    requirements: {
      platforms: ["instagram", "tiktok", "youtube"],
      minFollowers: 35000,
      niches: ["fitness", "health", "lifestyle"],
      locations: ["United States", "Canada", "Australia", "United Kingdom"]
    },
    deliverables: [
      "Pre/post workout routines with product",
      "Plant-based meal prep content",
      "Athletic performance documentation",
      "Ingredient education content"
    ],
    status: "active",
    applicants: 189,
    selected: 11,
    createdAt: new Date('2024-05-01'),
    tags: ["fitness", "plant-based", "protein", "athletic"]
  },
  {
    id: "camp_011",
    title: "Digital Art Creation Suite",
    brand: "ArtistryPro",
    description: "Digital art software and hardware bundle for creative professionals",
    brief: "Create stunning digital artwork using our complete creative suite including tablets, styluses, and software. Show the creative process from concept to completion, highlighting unique features and capabilities.",
    budget: {
      min: 2200,
      max: 5800
    },
    timeline: {
      startDate: new Date('2024-06-20'),
      endDate: new Date('2024-08-20'),
      applicationDeadline: new Date('2024-06-05')
    },
    requirements: {
      platforms: ["youtube", "instagram", "tiktok"],
      minFollowers: 30000,
      niches: ["art", "creativity", "technology"],
      locations: ["United States", "Canada", "United Kingdom", "Germany", "Japan"]
    },
    deliverables: [
      "Speed art creation videos",
      "Tutorial content for beginners",
      "Professional workflow demonstrations",
      "Comparison with traditional methods"
    ],
    status: "active",
    applicants: 98,
    selected: 12,
    createdAt: new Date('2024-04-30'),
    tags: ["art", "digital", "creative", "professional"]
  },
  {
    id: "camp_012",
    title: "Mindfulness & Meditation",
    brand: "ZenMoment",
    description: "Meditation app and wellness products for stress reduction",
    brief: "Share your mindfulness journey using our meditation app and wellness accessories. Content should focus on stress reduction techniques, daily practices, and the positive impact on mental health and productivity.",
    budget: {
      min: 1000,
      max: 3000
    },
    timeline: {
      startDate: new Date('2024-05-10'),
      endDate: new Date('2024-07-10'),
      applicationDeadline: new Date('2024-04-25')
    },
    requirements: {
      platforms: ["instagram", "youtube", "tiktok"],
      minFollowers: 20000,
      niches: ["wellness", "health", "lifestyle"],
      locations: ["United States", "Canada", "United Kingdom", "Australia"]
    },
    deliverables: [
      "Daily meditation practice content",
      "Stress reduction technique tutorials",
      "Mindfulness in daily life examples",
      "Wellness routine documentation"
    ],
    status: "in_review",
    applicants: 167,
    selected: 16,
    createdAt: new Date('2024-03-20'),
    tags: ["wellness", "meditation", "mindfulness", "mental health"]
  },
  {
    id: "camp_013",
    title: "Gaming Setup Showcase",
    brand: "GameZone Elite",
    description: "High-performance gaming hardware and accessories for content creators",
    brief: "Build the ultimate gaming setup using our premium hardware and showcase its performance across different games and content creation tasks. Focus on performance metrics, streaming quality, and overall gaming experience.",
    budget: {
      min: 3500,
      max: 9000
    },
    timeline: {
      startDate: new Date('2024-06-25'),
      endDate: new Date('2024-08-25'),
      applicationDeadline: new Date('2024-06-10')
    },
    requirements: {
      platforms: ["youtube", "twitch", "tiktok"],
      minFollowers: 60000,
      niches: ["gaming", "technology", "entertainment"],
      locations: ["United States", "Canada", "United Kingdom", "Germany"]
    },
    deliverables: [
      "Gaming setup build process",
      "Performance testing across games",
      "Streaming quality demonstrations",
      "Hardware comparison content"
    ],
    status: "active",
    applicants: 134,
    selected: 7,
    createdAt: new Date('2024-05-05'),
    tags: ["gaming", "hardware", "performance", "streaming"]
  },
  {
    id: "camp_014",
    title: "Eco-Friendly Home Solutions",
    brand: "GreenLiving",
    description: "Sustainable home products and zero-waste lifestyle solutions",
    brief: "Transition to a more sustainable lifestyle using our eco-friendly home products. Show practical tips for reducing waste, sustainable alternatives to everyday items, and the environmental impact of small changes.",
    budget: {
      min: 1300,
      max: 3600
    },
    timeline: {
      startDate: new Date('2024-07-05'),
      endDate: new Date('2024-09-05'),
      applicationDeadline: new Date('2024-06-20')
    },
    requirements: {
      platforms: ["instagram", "youtube", "tiktok"],
      minFollowers: 25000,
      niches: ["sustainability", "lifestyle", "home"],
      locations: ["United States", "Canada", "United Kingdom", "Australia", "Germany"]
    },
    deliverables: [
      "Home sustainability audit",
      "Product swap challenges",
      "DIY eco-friendly solutions",
      "Environmental impact tracking"
    ],
    status: "active",
    applicants: 145,
    selected: 13,
    createdAt: new Date('2024-05-10'),
    tags: ["sustainability", "eco-friendly", "zero waste", "home"]
  },
  {
    id: "camp_015",
    title: "Financial Freedom Journey",
    brand: "WealthWise",
    description: "Personal finance app and investment education platform",
    brief: "Document your personal finance journey using our app to track expenses, savings goals, and investment progress. Create educational content about financial literacy, budgeting strategies, and building wealth.",
    budget: {
      min: 1500,
      max: 4000
    },
    timeline: {
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-08-01'),
      applicationDeadline: new Date('2024-05-15')
    },
    requirements: {
      platforms: ["youtube", "instagram", "linkedin"],
      minFollowers: 30000,
      niches: ["finance", "business", "education"],
      locations: ["United States", "Canada", "United Kingdom", "Australia"]
    },
    deliverables: [
      "Monthly budget planning content",
      "Investment education tutorials",
      "Financial goal tracking",
      "Money-saving tips and strategies"
    ],
    status: "active",
    applicants: 89,
    selected: 10,
    createdAt: new Date('2024-04-05'),
    tags: ["finance", "investment", "education", "wealth"]
  },
  {
    id: "camp_016",
    title: "Travel Photography Mastery",
    brand: "Wanderlens",
    description: "Camera gear and editing software for travel photographers",
    brief: "Capture stunning travel photography using our professional camera equipment and editing software. Share photography techniques, editing workflows, and behind-the-scenes content from various destinations.",
    budget: {
      min: 2800,
      max: 7000
    },
    timeline: {
      startDate: new Date('2024-05-25'),
      endDate: new Date('2024-08-25'),
      applicationDeadline: new Date('2024-05-10')
    },
    requirements: {
      platforms: ["instagram", "youtube"],
      minFollowers: 45000,
      niches: ["photography", "travel", "art"],
      locations: ["United States", "Canada", "United Kingdom", "Australia", "Germany", "France"]
    },
    deliverables: [
      "Photography technique tutorials",
      "Gear testing in various conditions",
      "Editing workflow demonstrations",
      "Travel photography storytelling"
    ],
    status: "in_review",
    applicants: 156,
    selected: 8,
    createdAt: new Date('2024-03-25'),
    tags: ["photography", "travel", "gear", "editing"]
  },
  {
    id: "camp_017",
    title: "Healthy Family Meals",
    brand: "NutriFamily",
    description: "Meal planning and nutrition products for busy families",
    brief: "Create healthy, family-friendly meals using our meal planning app and nutrition products. Focus on quick preparation, kid-friendly recipes, and nutritional education for parents.",
    budget: {
      min: 1600,
      max: 4200
    },
    timeline: {
      startDate: new Date('2024-06-15'),
      endDate: new Date('2024-08-15'),
      applicationDeadline: new Date('2024-05-30')
    },
    requirements: {
      platforms: ["instagram", "tiktok", "youtube"],
      minFollowers: 35000,
      niches: ["food", "parenting", "health"],
      locations: ["United States", "Canada", "United Kingdom", "Australia"]
    },
    deliverables: [
      "Family meal prep content",
      "Kid-friendly recipe videos",
      "Nutrition education posts",
      "Meal planning tutorials"
    ],
    status: "active",
    applicants: 178,
    selected: 15,
    createdAt: new Date('2024-04-28'),
    tags: ["family", "nutrition", "meal planning", "health"]
  },
  {
    id: "camp_018",
    title: "Music Production Studio",
    brand: "SoundCraft Pro",
    description: "Professional audio equipment and music production software",
    brief: "Create original music and demonstrate our professional audio equipment and production software. Show the music creation process from concept to final track, including recording, mixing, and mastering.",
    budget: {
      min: 3000,
      max: 8500
    },
    timeline: {
      startDate: new Date('2024-07-10'),
      endDate: new Date('2024-09-10'),
      applicationDeadline: new Date('2024-06-25')
    },
    requirements: {
      platforms: ["youtube", "instagram", "tiktok"],
      minFollowers: 40000,
      niches: ["music", "entertainment", "technology"],
      locations: ["United States", "Canada", "United Kingdom", "Germany", "Australia"]
    },
    deliverables: [
      "Studio setup and equipment showcase",
      "Music production tutorials",
      "Recording session documentation",
      "Behind-the-scenes content creation"
    ],
    status: "draft",
    applicants: 0,
    selected: 0,
    createdAt: new Date('2024-05-15'),
    tags: ["music", "production", "audio", "studio"]
  }
]; 