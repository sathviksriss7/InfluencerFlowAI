import { type Creator } from '../types';

// More reliable avatar generation using a placeholder service
const generateAvatar = (id: string) => `https://api.dicebear.com/7.x/personas/svg?seed=${id}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=50`;

export const mockCreators: Creator[] = [
  // Fashion & Lifestyle Creators
  {
    id: "cr_001",
    name: "Priya Sharma",
    username: "@priya_fitness",
    platform: "instagram",
    avatar: generateAvatar("priya_sharma"),
    niche: ["fitness", "health", "lifestyle"],
    location: "Mumbai, Maharashtra",
    bio: "Fitness coach helping busy professionals stay healthy. Plant-based lifestyle advocate.",
    verified: true,
    metrics: {
      followers: 245000,
      avgViews: 45000,
      engagementRate: 4.2,
      avgLikes: 1890,
      avgComments: 156
    },
    rates: {
      post: 1500,
      story: 800,
      reel: 2200
    },
    demographics: {
      ageRange: "25-34",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 35, female: 63, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 2 hours"
  },
  {
    id: "cr_002",
    name: "Arjun Gupta",
    username: "@techreviews_arjun",
    platform: "youtube",
    avatar: generateAvatar("arjun_gupta"),
    niche: ["technology", "gaming", "entertainment"],
    location: "Bangalore, Karnataka",
    bio: "Tech reviewer with 8 years experience. Honest reviews of the latest gadgets and software.",
    verified: true,
    metrics: {
      followers: 680000,
      avgViews: 120000,
      engagementRate: 3.8,
      avgLikes: 4560,
      avgComments: 892
    },
    rates: {
      post: 3500,
      video: 8500
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "United States", "Canada"],
      genderSplit: { male: 78, female: 20, other: 2 }
    },
    rating: 4.9,
    responseTime: "within 4 hours"
  },
  {
    id: "cr_003",
    name: "Ananya Reddy",
    username: "@ananya_sustainable",
    platform: "instagram",
    avatar: generateAvatar("ananya_reddy"),
    niche: ["fashion", "lifestyle", "sustainability"],
    location: "Hyderabad, Telangana",
    bio: "Sustainable fashion advocate. Helping you build a conscious wardrobe that doesn't cost the earth.",
    verified: true,
    metrics: {
      followers: 156000,
      avgViews: 28000,
      engagementRate: 5.1,
      avgLikes: 1428,
      avgComments: 89
    },
    rates: {
      post: 1200,
      story: 600,
      reel: 1800
    },
    demographics: {
      ageRange: "25-44",
      topCountries: ["India", "United States", "Australia"],
      genderSplit: { male: 15, female: 83, other: 2 }
    },
    rating: 4.7,
    responseTime: "within 1 hour"
  },
  {
    id: "cr_004",
    name: "Vikram Singh",
    username: "@vikram_foodie",
    platform: "youtube",
    avatar: generateAvatar("vikram_singh"),
    niche: ["food", "cooking", "lifestyle"],
    location: "Delhi, Delhi",
    bio: "Food enthusiast sharing authentic Indian recipes and restaurant reviews. Making cooking fun and accessible!",
    verified: false,
    metrics: {
      followers: 89000,
      avgViews: 95000,
      engagementRate: 8.2,
      avgLikes: 7790,
      avgComments: 234
    },
    rates: {
      post: 800,
      video: 1500
    },
    demographics: {
      ageRange: "16-24",
      topCountries: ["India", "United Kingdom", "Canada"],
      genderSplit: { male: 42, female: 56, other: 2 }
    },
    rating: 4.6,
    responseTime: "within 6 hours"
  },
  {
    id: "cr_005",
    name: "Kavya Patel",
    username: "@kavya_travels",
    platform: "instagram",
    avatar: generateAvatar("kavya_patel"),
    niche: ["travel", "photography", "lifestyle"],
    location: "Ahmedabad, Gujarat",
    bio: "Travel photographer capturing the beauty of India and beyond. Solo female travel advocate.",
    verified: true,
    metrics: {
      followers: 198000,
      avgViews: 42000,
      engagementRate: 4.5,
      avgLikes: 1890,
      avgComments: 145
    },
    rates: {
      post: 1100,
      story: 550,
      reel: 1650
    },
    demographics: {
      ageRange: "25-34",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 48, female: 50, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 3 hours"
  },
  {
    id: "cr_006",
    name: "Rohit Kumar",
    username: "@rohit_builds",
    platform: "youtube",
    avatar: generateAvatar("rohit_kumar"),
    niche: ["diy", "home improvement", "lifestyle"],
    location: "Pune, Maharashtra",
    bio: "DIY enthusiast and contractor. Teaching homeowners how to tackle projects with confidence.",
    verified: false,
    metrics: {
      followers: 124000,
      avgViews: 68000,
      engagementRate: 3.2,
      avgLikes: 2176,
      avgComments: 198
    },
    rates: {
      post: 900,
      video: 2800
    },
    demographics: {
      ageRange: "35-54",
      topCountries: ["India", "United States", "Canada"],
      genderSplit: { male: 72, female: 26, other: 2 }
    },
    rating: 4.5,
    responseTime: "within 8 hours"
  },

  // Additional creators with diverse backgrounds
  {
    id: "cr_007",
    name: "Sneha Joshi",
    username: "@sneha_beauty",
    platform: "instagram",
    avatar: generateAvatar("sneha_joshi"),
    niche: ["beauty", "skincare", "lifestyle"],
    location: "Chennai, Tamil Nadu",
    bio: "Beauty content creator focusing on affordable skincare routines and makeup tutorials.",
    verified: true,
    metrics: {
      followers: 320000,
      avgViews: 58000,
      engagementRate: 4.8,
      avgLikes: 2784,
      avgComments: 212
    },
    rates: {
      post: 1800,
      story: 900,
      reel: 2700
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 8, female: 90, other: 2 }
    },
    rating: 4.9,
    responseTime: "within 1 hour"
  },
  {
    id: "cr_008",
    name: "Karan Malhotra",
    username: "@karan_gaming",
    platform: "youtube",
    avatar: generateAvatar("karan_malhotra"),
    niche: ["gaming", "entertainment", "technology"],
    location: "Gurgaon, Haryana",
    bio: "Pro gamer and streamer. Reviews, gameplay, and esports content for the gaming community.",
    verified: true,
    metrics: {
      followers: 850000,
      avgViews: 180000,
      engagementRate: 3.5,
      avgLikes: 6300,
      avgComments: 1240
    },
    rates: {
      post: 4200,
      video: 12000
    },
    demographics: {
      ageRange: "16-24",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 85, female: 13, other: 2 }
    },
    rating: 4.7,
    responseTime: "within 4 hours"
  },
  {
    id: "cr_009",
    name: "Nisha Agarwal",
    username: "@nisha_mindful",
    platform: "instagram",
    avatar: generateAvatar("nisha_agarwal"),
    niche: ["health", "wellness", "lifestyle"],
    location: "Jaipur, Rajasthan",
    bio: "Wellness coach and meditation teacher. Helping people find balance in their busy lives.",
    verified: false,
    metrics: {
      followers: 92000,
      avgViews: 18000,
      engagementRate: 6.2,
      avgLikes: 1116,
      avgComments: 87
    },
    rates: {
      post: 650,
      story: 350,
      reel: 950
    },
    demographics: {
      ageRange: "25-44",
      topCountries: ["India", "United States", "Canada"],
      genderSplit: { male: 25, female: 73, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 2 hours"
  },
  {
    id: "cr_010",
    name: "Raj Verma",
    username: "@raj_eats",
    platform: "instagram",
    avatar: generateAvatar("raj_verma"),
    niche: ["food", "entertainment", "lifestyle"],
    location: "Kolkata, West Bengal",
    bio: "Food challenges, restaurant reviews, and cooking fails. Making food content fun and relatable!",
    verified: true,
    metrics: {
      followers: 420000,
      avgViews: 380000,
      engagementRate: 7.8,
      avgLikes: 29640,
      avgComments: 842
    },
    rates: {
      post: 2100,
      reel: 4500
    },
    demographics: {
      ageRange: "16-34",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 55, female: 43, other: 2 }
    },
    rating: 4.6,
    responseTime: "within 3 hours"
  },
  {
    id: "cr_011",
    name: "Meera Iyer",
    username: "@meera_minimalist",
    platform: "instagram",
    avatar: generateAvatar("meera_iyer"),
    niche: ["lifestyle", "design", "home"],
    location: "Kochi, Kerala",
    bio: "Minimalist lifestyle and home design. Creating cozy spaces with sustainable aesthetics.",
    verified: true,
    metrics: {
      followers: 178000,
      avgViews: 34000,
      engagementRate: 4.1,
      avgLikes: 1394,
      avgComments: 96
    },
    rates: {
      post: 1300,
      story: 650,
      reel: 1950
    },
    demographics: {
      ageRange: "25-44",
      topCountries: ["India", "United States", "Australia"],
      genderSplit: { male: 22, female: 76, other: 2 }
    },
    rating: 4.7,
    responseTime: "within 4 hours"
  },
  {
    id: "cr_012",
    name: "Aditya Sharma",
    username: "@aditya_cricket",
    platform: "youtube",
    avatar: generateAvatar("aditya_sharma"),
    niche: ["sports", "fitness", "entertainment"],
    location: "Lucknow, Uttar Pradesh",
    bio: "Former professional cricketer sharing training tips, match analysis, and cricket culture.",
    verified: true,
    metrics: {
      followers: 560000,
      avgViews: 95000,
      engagementRate: 4.3,
      avgLikes: 4085,
      avgComments: 567
    },
    rates: {
      post: 2800,
      video: 7500
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "Australia", "United Kingdom"],
      genderSplit: { male: 82, female: 16, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 6 hours"
  },
  {
    id: "cr_013",
    name: "Riya Khanna",
    username: "@riya_art",
    platform: "instagram",
    avatar: generateAvatar("riya_khanna"),
    niche: ["art", "creativity", "lifestyle"],
    location: "Chandigarh, Punjab",
    bio: "Digital artist and illustrator. Sharing my creative process and art tutorials for aspiring artists.",
    verified: false,
    metrics: {
      followers: 134000,
      avgViews: 26000,
      engagementRate: 5.4,
      avgLikes: 1404,
      avgComments: 119
    },
    rates: {
      post: 980,
      story: 490,
      reel: 1470
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "United States", "Canada"],
      genderSplit: { male: 45, female: 53, other: 2 }
    },
    rating: 4.6,
    responseTime: "within 5 hours"
  },
  {
    id: "cr_014",
    name: "Sameer Khan",
    username: "@sameer_entrepreneur",
    platform: "linkedin",
    avatar: generateAvatar("sameer_khan"),
    niche: ["business", "entrepreneurship", "finance"],
    location: "Noida, Uttar Pradesh",
    bio: "Serial entrepreneur and business mentor. Helping startups scale and succeed in India.",
    verified: true,
    metrics: {
      followers: 67000,
      avgViews: 8500,
      engagementRate: 3.8,
      avgLikes: 323,
      avgComments: 45
    },
    rates: {
      post: 850,
      video: 2200
    },
    demographics: {
      ageRange: "25-54",
      topCountries: ["India", "United States", "Singapore"],
      genderSplit: { male: 68, female: 30, other: 2 }
    },
    rating: 4.9,
    responseTime: "within 12 hours"
  },
  {
    id: "cr_015",
    name: "Tanvi Desai",
    username: "@tanvi_dance",
    platform: "youtube",
    avatar: generateAvatar("tanvi_desai"),
    niche: ["dance", "entertainment", "music"],
    location: "Surat, Gujarat",
    bio: "Professional dancer and choreographer. Teaching dance styles from classical to contemporary.",
    verified: true,
    metrics: {
      followers: 680000,
      avgViews: 520000,
      engagementRate: 9.1,
      avgLikes: 47320,
      avgComments: 1240
    },
    rates: {
      post: 3400,
      video: 7200
    },
    demographics: {
      ageRange: "13-24",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 35, female: 63, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 2 hours"
  },
  {
    id: "cr_016",
    name: "Rahul Kapoor",
    username: "@rahul_cuisine",
    platform: "youtube",
    avatar: generateAvatar("rahul_kapoor"),
    niche: ["food", "cooking", "lifestyle"],
    location: "Amritsar, Punjab",
    bio: "Professional chef sharing authentic Indian cuisine secrets and cooking techniques for home cooks.",
    verified: true,
    metrics: {
      followers: 290000,
      avgViews: 65000,
      engagementRate: 4.2,
      avgLikes: 2730,
      avgComments: 312
    },
    rates: {
      post: 1450,
      video: 4200
    },
    demographics: {
      ageRange: "25-54",
      topCountries: ["India", "Canada", "United Kingdom"],
      genderSplit: { male: 42, female: 56, other: 2 }
    },
    rating: 4.9,
    responseTime: "within 6 hours"
  },
  {
    id: "cr_017",
    name: "Pooja Nair",
    username: "@pooja_style",
    platform: "instagram",
    avatar: generateAvatar("pooja_nair"),
    niche: ["fashion", "beauty", "lifestyle"],
    location: "Thiruvananthapuram, Kerala",
    bio: "Fashion stylist celebrating traditional and contemporary style. Affordable fashion for everyone.",
    verified: true,
    metrics: {
      followers: 215000,
      avgViews: 41000,
      engagementRate: 5.7,
      avgLikes: 2337,
      avgComments: 178
    },
    rates: {
      post: 1250,
      story: 625,
      reel: 1875
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "United States", "Australia"],
      genderSplit: { male: 12, female: 86, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 3 hours"
  },
  {
    id: "cr_018",
    name: "Akash Yadav",
    username: "@akash_outdoors",
    platform: "youtube",
    avatar: generateAvatar("akash_yadav"),
    niche: ["outdoor", "adventure", "travel"],
    location: "Shimla, Himachal Pradesh",
    bio: "Adventure photographer and outdoor enthusiast. Exploring Himalayas and India's wild landscapes.",
    verified: false,
    metrics: {
      followers: 145000,
      avgViews: 42000,
      engagementRate: 3.9,
      avgLikes: 1638,
      avgComments: 234
    },
    rates: {
      post: 1080,
      video: 3200
    },
    demographics: {
      ageRange: "25-44",
      topCountries: ["India", "Nepal", "United States"],
      genderSplit: { male: 65, female: 33, other: 2 }
    },
    rating: 4.6,
    responseTime: "within 8 hours"
  },
  {
    id: "cr_019",
    name: "Deepika Rao",
    username: "@deepika_tech",
    platform: "twitter",
    avatar: generateAvatar("deepika_rao"),
    niche: ["technology", "ai", "programming"],
    location: "Mysore, Karnataka",
    bio: "AI researcher and tech analyst. Breaking down complex tech trends for everyday understanding.",
    verified: true,
    metrics: {
      followers: 89000,
      avgViews: 12000,
      engagementRate: 2.8,
      avgLikes: 336,
      avgComments: 67
    },
    rates: {
      post: 720,
      video: 1800
    },
    demographics: {
      ageRange: "25-44",
      topCountries: ["India", "United States", "Singapore"],
      genderSplit: { male: 78, female: 20, other: 2 }
    },
    rating: 4.7,
    responseTime: "within 4 hours"
  },
  {
    id: "cr_020",
    name: "Ishita Gupta",
    username: "@ishita_wellness",
    platform: "instagram",
    avatar: generateAvatar("ishita_gupta"),
    niche: ["wellness", "yoga", "lifestyle"],
    location: "Rishikesh, Uttarakhand",
    bio: "Certified yoga instructor and wellness coach. Promoting mindful living and self-care practices.",
    verified: true,
    metrics: {
      followers: 167000,
      avgViews: 31000,
      engagementRate: 4.6,
      avgLikes: 1426,
      avgComments: 112
    },
    rates: {
      post: 1150,
      story: 575,
      reel: 1725
    },
    demographics: {
      ageRange: "25-44",
      topCountries: ["India", "United States", "Australia"],
      genderSplit: { male: 18, female: 80, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 2 hours"
  },

  // Micro influencers (10k-100k followers)
  {
    id: "cr_021",
    name: "Aryan Mehta",
    username: "@aryan_streetwear",
    platform: "instagram",
    avatar: generateAvatar("aryan_mehta"),
    niche: ["fashion", "streetwear", "lifestyle"],
    location: "Indore, Madhya Pradesh",
    bio: "Streetwear enthusiast and style blogger. Curating the best urban fashion on a budget.",
    verified: false,
    metrics: {
      followers: 78000,
      avgViews: 15000,
      engagementRate: 6.8,
      avgLikes: 1020,
      avgComments: 89
    },
    rates: {
      post: 580,
      story: 290,
      reel: 870
    },
    demographics: {
      ageRange: "16-24",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 67, female: 31, other: 2 }
    },
    rating: 4.5,
    responseTime: "within 4 hours"
  },
  {
    id: "cr_022",
    name: "Shreya Pillai",
    username: "@shreya_beauty",
    platform: "instagram",
    avatar: generateAvatar("shreya_pillai"),
    niche: ["beauty", "skincare", "lifestyle"],
    location: "Bhubaneswar, Odisha",
    bio: "Beauty enthusiast sharing skincare routines and product reviews for Indian skin.",
    verified: false,
    metrics: {
      followers: 156000,
      avgViews: 125000,
      engagementRate: 8.9,
      avgLikes: 11125,
      avgComments: 445
    },
    rates: {
      post: 780,
      reel: 1950
    },
    demographics: {
      ageRange: "16-24",
      topCountries: ["India", "United States", "Canada"],
      genderSplit: { male: 15, female: 83, other: 2 }
    },
    rating: 4.7,
    responseTime: "within 3 hours"
  },
  {
    id: "cr_023",
    name: "Varun Pandey",
    username: "@varun_fitness",
    platform: "youtube",
    avatar: generateAvatar("varun_pandey"),
    niche: ["fitness", "health", "lifestyle"],
    location: "Kanpur, Uttar Pradesh",
    bio: "Personal trainer and nutritionist helping people achieve their fitness goals naturally.",
    verified: false,
    metrics: {
      followers: 98000,
      avgViews: 28000,
      engagementRate: 4.1,
      avgLikes: 1148,
      avgComments: 167
    },
    rates: {
      post: 680,
      video: 2100
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "United States", "Canada"],
      genderSplit: { male: 58, female: 40, other: 2 }
    },
    rating: 4.6,
    responseTime: "within 6 hours"
  },

  // Macro influencers (100k-1M followers)
  {
    id: "cr_024",
    name: "Aditi Chopra",
    username: "@aditi_lifestyle",
    platform: "instagram",
    avatar: generateAvatar("aditi_chopra"),
    niche: ["lifestyle", "travel", "fashion"],
    location: "Goa, Goa",
    bio: "Lifestyle content creator sharing my adventures, style tips, and daily inspiration.",
    verified: true,
    metrics: {
      followers: 467000,
      avgViews: 84000,
      engagementRate: 3.8,
      avgLikes: 3192,
      avgComments: 234
    },
    rates: {
      post: 2800,
      story: 1400,
      reel: 4200
    },
    demographics: {
      ageRange: "18-34",
      topCountries: ["India", "United States", "United Kingdom"],
      genderSplit: { male: 22, female: 76, other: 2 }
    },
    rating: 4.7,
    responseTime: "within 3 hours"
  },
  {
    id: "cr_025",
    name: "Nikhil Agrawal",
    username: "@nikhil_productivity",
    platform: "linkedin",
    avatar: generateAvatar("nikhil_agrawal"),
    niche: ["business", "productivity", "technology"],
    location: "Nashik, Maharashtra",
    bio: "Productivity expert and startup advisor. Helping professionals optimize their workflows.",
    verified: true,
    metrics: {
      followers: 145000,
      avgViews: 18000,
      engagementRate: 3.2,
      avgLikes: 576,
      avgComments: 89
    },
    rates: {
      post: 1450,
      video: 3800
    },
    demographics: {
      ageRange: "25-54",
      topCountries: ["India", "United States", "Singapore"],
      genderSplit: { male: 65, female: 33, other: 2 }
    },
    rating: 4.8,
    responseTime: "within 8 hours"
  },

  // Adding approximately 900 more creators with diverse backgrounds...
  ...Array.from({ length: 1000 }, (_, index) => {
    const creatorId = `cr_gen_${String(index + 1).padStart(4, '0')}`;
    const platforms = ['instagram', 'youtube', 'twitter', 'linkedin'] as const;
    const niches = [
      ['fitness', 'health'],
      ['beauty', 'skincare'],
      ['food', 'cooking'],
      ['travel', 'photography'],
      ['fashion', 'lifestyle'],
      ['technology', 'gaming'],
      ['business', 'entrepreneurship'],
      ['art', 'creativity'],
      ['music', 'entertainment'],
      ['sports', 'outdoor'],
      ['parenting', 'family'],
      ['education', 'science'],
      ['diy', 'crafts'],
      ['pets', 'animals'],
      ['finance', 'investing']
    ];
    
    const indianCities = [
      'Mumbai, Maharashtra', 'Delhi, Delhi', 'Bangalore, Karnataka', 'Hyderabad, Telangana', 'Chennai, Tamil Nadu',
      'Kolkata, West Bengal', 'Pune, Maharashtra', 'Ahmedabad, Gujarat', 'Jaipur, Rajasthan', 'Surat, Gujarat',
      'Lucknow, Uttar Pradesh', 'Kanpur, Uttar Pradesh', 'Nagpur, Maharashtra', 'Indore, Madhya Pradesh', 'Thane, Maharashtra',
      'Bhopal, Madhya Pradesh', 'Visakhapatnam, Andhra Pradesh', 'Pimpri-Chinchwad, Maharashtra', 'Patna, Bihar', 'Vadodara, Gujarat',
      'Ghaziabad, Uttar Pradesh', 'Ludhiana, Punjab', 'Agra, Uttar Pradesh', 'Nashik, Maharashtra', 'Faridabad, Haryana',
      'Meerut, Uttar Pradesh', 'Rajkot, Gujarat', 'Kalyan-Dombivli, Maharashtra', 'Vasai-Virar, Maharashtra', 'Varanasi, Uttar Pradesh',
      'Srinagar, Jammu and Kashmir', 'Aurangabad, Maharashtra', 'Dhanbad, Jharkhand', 'Amritsar, Punjab', 'Navi Mumbai, Maharashtra',
      'Allahabad, Uttar Pradesh', 'Ranchi, Jharkhand', 'Howrah, West Bengal', 'Coimbatore, Tamil Nadu', 'Jabalpur, Madhya Pradesh',
      'Gwalior, Madhya Pradesh', 'Vijayawada, Andhra Pradesh', 'Jodhpur, Rajasthan', 'Madurai, Tamil Nadu', 'Raipur, Chhattisgarh',
      'Kota, Rajasthan', 'Chandigarh, Punjab', 'Gurgaon, Haryana', 'Siliguri, West Bengal', 'Jamshedpur, Jharkhand',
      'Kochi, Kerala', 'Thiruvananthapuram, Kerala', 'Salem, Tamil Nadu', 'Bhilai, Chhattisgarh', 'Warangal, Telangana',
      'Mira-Bhayandar, Maharashtra', 'Thiruvananthapuram, Kerala', 'Bhiwandi, Maharashtra', 'Saharanpur, Uttar Pradesh', 'Guntur, Andhra Pradesh',
      'Amravati, Maharashtra', 'Bikaner, Rajasthan', 'Noida, Uttar Pradesh', 'Jamshedpur, Jharkhand', 'Bhilai Nagar, Chhattisgarh',
      'Cuttack, Odisha', 'Firozabad, Uttar Pradesh', 'Kochi, Kerala', 'Bhavnagar, Gujarat', 'Dehradun, Uttarakhand',
      'Durgapur, West Bengal', 'Asansol, West Bengal', 'Rourkela, Odisha', 'Nanded, Maharashtra', 'Kolhapur, Maharashtra'
    ];

    const indianNames = [
      'Arjun Sharma', 'Priya Singh', 'Rohan Gupta', 'Kavya Patel', 'Aditya Kumar', 'Ananya Reddy', 'Vikram Joshi', 'Shreya Agarwal',
      'Karan Malhotra', 'Nisha Iyer', 'Rahul Verma', 'Pooja Nair', 'Sameer Khan', 'Riya Khanna', 'Aryan Mehta', 'Tanvi Desai',
      'Akash Yadav', 'Sneha Chopra', 'Varun Pandey', 'Meera Pillai', 'Nikhil Shah', 'Ishita Bansal', 'Rohit Sinha', 'Aditi Kapoor',
      'Siddharth Rao', 'Deepika Mishra', 'Ashish Tiwari', 'Kriti Saxena', 'Gaurav Jain', 'Divya Bhatt', 'Harsh Aggarwal', 'Swati Dixit',
      'Mayank Tyagi', 'Simran Kaur', 'Abhishek Dubey', 'Neha Srivastava', 'Yash Goyal', 'Pallavi Shukla', 'Aman Soni', 'Ritika Sharma',
      'Dev Patel', 'Shruti Gupta', 'Manish Kumar', 'Payal Singh', 'Kartik Joshi', 'Bhavna Agarwal', 'Shubham Verma', 'Komal Nair',
      'Ankit Malhotra', 'Tanya Khan', 'Raghav Khanna', 'Sonia Desai', 'Vivek Yadav', 'Anjali Chopra', 'Mohit Pandey', 'Sakshi Pillai',
      'Praveen Shah', 'Megha Bansal', 'Tarun Sinha', 'Nidhi Kapoor', 'Shivam Rao', 'Preeti Mishra', 'Ajay Tiwari', 'Vandana Saxena',
      'Deepak Jain', 'Sunita Bhatt', 'Sunil Aggarwal', 'Rekha Dixit', 'Vinod Tyagi', 'Geeta Kaur', 'Rakesh Dubey', 'Uma Srivastava'
    ];

    const usernames = [
      'lifestyleguru', 'techreviewer', 'foodiefinds', 'traveladdict', 'fashionista',
      'fitnessmotivation', 'beautyexpert', 'gamemaster', 'artcreator', 'musiclover',
      'businessmind', 'sciencenerd', 'petlover', 'parentingtips', 'diycrafts',
      'photojourney', 'healthcoach', 'styleblogger', 'adventureseeker', 'cookinghacks'
    ];

    const platform = platforms[index % platforms.length];
    const selectedNiches = niches[index % niches.length];
    const location = indianCities[index % indianCities.length];
    
    const nameIndex = index % indianNames.length;
    const name = indianNames[nameIndex];
    
    const usernameBase = name.toLowerCase().replace(' ', '_');
    const usernameSuffix = usernames[index % usernames.length];
    const username = `@${usernameBase}_${usernameSuffix}_${index % 10}`;
    
    const followerRanges = [
      { min: 5000, max: 25000 },    // Nano influencers
      { min: 25000, max: 100000 },  // Micro influencers  
      { min: 100000, max: 500000 }, // Mid-tier influencers
      { min: 500000, max: 1000000 } // Macro influencers
    ];
    
    const range = followerRanges[Math.floor(Math.random() * followerRanges.length)];
    const followers = Math.floor(Math.random() * (range.max - range.min) + range.min);
    
    const engagementRate = Math.max(1.5, parseFloat((12 - (followers / 100000)).toFixed(1)));
    const avgViews = Math.floor(followers * (engagementRate / 100) * (Math.random() * 3 + 1));
    const avgLikes = Math.floor(avgViews * (engagementRate / 100));
    const avgComments = Math.floor(avgLikes * 0.05);
    
    const baseRate = Math.max(50, Math.floor(followers / 1000) * (platform === 'youtube' ? 2 : 1));
    const postRate = Math.floor(baseRate * (Math.random() * 0.4 + 0.8));
    const storyRate = Math.floor(postRate * 0.5);
    const videoRate = Math.floor(postRate * (platform === 'youtube' ? 3 : 2));

    return {
      id: creatorId,
      name: name,
      username: username,
      platform: platform,
      avatar: generateAvatar(username),
      niche: selectedNiches,
      location: location,
      bio: `${selectedNiches.join(' and ')} content creator from ${location}. Passionate about sharing authentic experiences and tips.`,
      verified: followers > 100000 && Math.random() > 0.3,
      metrics: {
        followers,
        avgViews,
        engagementRate,
        avgLikes,
        avgComments
      },
      rates: {
        post: postRate,
        story: platform === 'instagram' ? storyRate : undefined,
        reel: platform === 'instagram' ? Math.floor(postRate * 1.5) : undefined,
        video: platform === 'youtube' ? videoRate : undefined
      },
      demographics: {
        ageRange: ['13-17', '18-24', '25-34', '35-44', '45-54'][Math.floor(Math.random() * 5)],
        topCountries: ['India', 'United States', 'United Kingdom'],
        genderSplit: {
          male: Math.floor(Math.random() * 60 + 20),
          female: Math.floor(Math.random() * 60 + 20),
          other: 2
        }
      },
      rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
      responseTime: ['within 1 hour', 'within 2 hours', 'within 4 hours', 'within 6 hours', 'within 8 hours', 'within 12 hours'][Math.floor(Math.random() * 6)],
    } as Creator;
  })
]; 