import { type Creator, type Campaign } from '../types';

export interface CreatorMatch {
  creator: Creator;
  campaign: Campaign;
  score: number;
  matchReasons: string[];
  concerns: string[];
}

export interface MatchingCriteria {
  platformWeight: number;
  nicheWeight: number;
  followersWeight: number;
  engagementWeight: number;
  locationWeight: number;
  budgetWeight: number;
}

const DEFAULT_WEIGHTS: MatchingCriteria = {
  platformWeight: 0.25,
  nicheWeight: 0.30,
  followersWeight: 0.20,
  engagementWeight: 0.15,
  locationWeight: 0.05,
  budgetWeight: 0.05
};

export function calculateCreatorCampaignMatch(
  creator: Creator,
  campaign: Campaign,
  weights: MatchingCriteria = DEFAULT_WEIGHTS
): CreatorMatch {
  const matchReasons: string[] = [];
  const concerns: string[] = [];
  let totalScore = 0;

  // Platform Match (25% weight)
  const platformScore = campaign.requirements.platforms.includes(creator.platform) ? 1 : 0;
  totalScore += platformScore * weights.platformWeight * 100;
  
  if (platformScore === 1) {
    matchReasons.push(`Active on ${creator.platform.charAt(0).toUpperCase() + creator.platform.slice(1)}`);
  } else {
    concerns.push(`Not on required platforms: ${campaign.requirements.platforms.join(', ')}`);
  }

  // Niche Match (30% weight)
  const creatorNiches = creator.niche.map(n => n.toLowerCase());
  const campaignNiches = campaign.requirements.niches.map(n => n.toLowerCase());
  const nicheMatches = creatorNiches.filter(niche => campaignNiches.includes(niche));
  const nicheScore = nicheMatches.length / campaignNiches.length;
  totalScore += nicheScore * weights.nicheWeight * 100;

  if (nicheMatches.length > 0) {
    matchReasons.push(`Matches ${nicheMatches.length} niche(s): ${nicheMatches.join(', ')}`);
  }
  if (nicheScore < 0.5) {
    const missingNiches = campaignNiches.filter(niche => !creatorNiches.includes(niche));
    concerns.push(`Limited experience in: ${missingNiches.join(', ')}`);
  }

  // Follower Count Match (20% weight)
  const followersScore = creator.metrics.followers >= campaign.requirements.minFollowers ? 1 : 
                        creator.metrics.followers / campaign.requirements.minFollowers;
  totalScore += Math.min(followersScore, 1) * weights.followersWeight * 100;

  if (creator.metrics.followers >= campaign.requirements.minFollowers) {
    matchReasons.push(`Has ${formatNumber(creator.metrics.followers)} followers (exceeds ${formatNumber(campaign.requirements.minFollowers)} requirement)`);
  } else {
    concerns.push(`Below minimum followers requirement (${formatNumber(creator.metrics.followers)} vs ${formatNumber(campaign.requirements.minFollowers)})`);
  }

  // Engagement Rate (15% weight)
  const avgEngagement = 4.5; // Industry average
  const engagementScore = Math.min(creator.metrics.engagementRate / avgEngagement, 1);
  totalScore += engagementScore * weights.engagementWeight * 100;

  if (creator.metrics.engagementRate > avgEngagement) {
    matchReasons.push(`High engagement rate (${creator.metrics.engagementRate}% vs ${avgEngagement}% average)`);
  } else if (creator.metrics.engagementRate < 2) {
    concerns.push(`Low engagement rate (${creator.metrics.engagementRate}%)`);
  }

  // Location Match (5% weight)
  let locationScore = 1; // Default to 1 if no specific locations required
  if (campaign.requirements.locations && campaign.requirements.locations.length > 0) {
    locationScore = campaign.requirements.locations.some(location => 
      creator.location.toLowerCase().includes(location.toLowerCase())
    ) ? 1 : 0.3; // Partial score for different locations

    if (locationScore === 1) {
      const matchingLocation = campaign.requirements.locations.find(location => 
        creator.location.toLowerCase().includes(location.toLowerCase())
      );
      matchReasons.push(`Located in target region: ${matchingLocation}`);
    } else {
      concerns.push(`Not in preferred locations: ${campaign.requirements.locations.join(', ')}`);
    }
  }
  totalScore += locationScore * weights.locationWeight * 100;

  // Budget Compatibility (5% weight)
  const estimatedRate = creator.rates.post; // Use post rate as baseline
  const budgetMidpoint = (campaign.budget.min + campaign.budget.max) / 2;
  const budgetScore = estimatedRate <= campaign.budget.max ? 
    (estimatedRate <= budgetMidpoint ? 1 : 0.7) : 0.3;
  totalScore += budgetScore * weights.budgetWeight * 100;

  if (estimatedRate <= budgetMidpoint) {
    matchReasons.push(`Rate fits comfortably within budget ($${estimatedRate.toLocaleString()} vs $${budgetMidpoint.toLocaleString()} midpoint)`);
  } else if (estimatedRate <= campaign.budget.max) {
    matchReasons.push(`Rate within maximum budget ($${estimatedRate.toLocaleString()} vs $${campaign.budget.max.toLocaleString()} max)`);
  } else {
    concerns.push(`Rate may exceed budget ($${estimatedRate.toLocaleString()} vs $${campaign.budget.max.toLocaleString()} max)`);
  }

  // Quality bonuses
  if (creator.verified) {
    totalScore += 2;
    matchReasons.push('Verified creator');
  }

  if (creator.rating >= 4.5) {
    totalScore += 3;
    matchReasons.push(`High rating (${creator.rating}/5)`);
  }

  if (creator.responseTime.includes('within 1 hour') || creator.responseTime.includes('within 2 hours')) {
    totalScore += 2;
    matchReasons.push('Fast response time');
  }

  return {
    creator,
    campaign,
    score: Math.min(Math.round(totalScore), 100),
    matchReasons,
    concerns
  };
}

export function findBestMatches(
  creators: Creator[],
  campaign: Campaign,
  limit: number = 10,
  minScore: number = 50
): CreatorMatch[] {
  return creators
    .map(creator => calculateCreatorCampaignMatch(creator, campaign))
    .filter(match => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function findCampaignsForCreator(
  creator: Creator,
  campaigns: Campaign[],
  limit: number = 5,
  minScore: number = 60
): CreatorMatch[] {
  return campaigns
    .filter(campaign => campaign.status === 'active') // Only active campaigns
    .map(campaign => calculateCreatorCampaignMatch(creator, campaign))
    .filter(match => match.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
  return num.toString();
}

export function getMatchQuality(score: number): {
  label: string;
  color: string;
  description: string;
} {
  if (score >= 85) {
    return {
      label: 'Excellent Match',
      color: 'green',
      description: 'Perfect fit for this campaign'
    };
  } else if (score >= 70) {
    return {
      label: 'Good Match',
      color: 'blue',
      description: 'Strong potential for success'
    };
  } else if (score >= 55) {
    return {
      label: 'Fair Match',
      color: 'yellow',
      description: 'Could work with some adjustments'
    };
  } else {
    return {
      label: 'Poor Match',
      color: 'red',
      description: 'Significant misalignment with requirements'
    };
  }
} 