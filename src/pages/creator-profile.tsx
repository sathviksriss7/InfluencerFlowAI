import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { type Creator } from '../types';

export default function CreatorProfile() {
  const { id } = useParams<{ id: string }>();

  const [creator, setCreator] = useState<Creator | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCreatorDetails = async () => {
      if (!id) {
        setError('No creator ID provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('creators')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError) {
          console.error("Error fetching creator details from Supabase:", fetchError);
          throw fetchError;
        }
        
        if (data) {
          setCreator(data as Creator);
        } else {
          setError('Creator not found in the database.');
          setCreator(null);
        }
      } catch (err: any) {
        console.error("Catch block error fetching creator:", err);
        setError(err.message || "Failed to fetch creator details.");
        setCreator(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCreatorDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-700">Loading Creator Profile...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-red-700 mb-2">Error Loading Profile</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Link to="/creators" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Back to Creators
        </Link>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Not Found</h2>
        <p className="text-gray-600 mb-4">The creator you're looking for doesn't exist.</p>
        <Link to="/creators" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Back to Creators
        </Link>
      </div>
    );
  }

  const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return num.toString();
  };

  const getPlatformIcon = (platform: string) => {
    const iconClass = "w-5 h-5";
    switch (platform) {
      case 'instagram':
        return <div className={`${iconClass} bg-pink-500 rounded-sm`}></div>;
      case 'youtube':
        return <div className={`${iconClass} bg-red-500 rounded-sm`}></div>;
      case 'tiktok':
        return <div className={`${iconClass} bg-black rounded-sm`}></div>;
      case 'twitter':
        return <div className={`${iconClass} bg-blue-400 rounded-sm`}></div>;
      default:
        return <div className={`${iconClass} bg-gray-400 rounded-sm`}></div>;
    }
  };

  return (
    <div className="space-y-6">
      <Link 
        to="/creators" 
        className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Creators
      </Link>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-6">
          <img
            src={creator.avatar}
            alt={creator.name}
            className="w-32 h-32 rounded-full object-cover"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">{creator.name}</h1>
              {creator.verified && (
                <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              )}
            </div>
            <p className="text-xl text-gray-600 mb-2">{creator.username}</p>
            <div className="flex items-center gap-2 mb-4">
              {getPlatformIcon(creator.platform)}
              <span className="text-gray-700 capitalize font-medium">{creator.platform}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{creator.location}</span>
            </div>
            <p className="text-gray-700 mb-4">{creator.bio}</p>

            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4 text-sm text-gray-600">
              {((creator as any).email || creator.email) && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  <span>{(creator as any).email || creator.email}</span>
                </div>
              )}
              {((creator as any).phone_number || creator.phone_number) && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                  <span>{(creator as any).phone_number || creator.phone_number}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={`w-5 h-5 ${creator.rating && i < Math.floor(creator.rating) ? 'text-yellow-400' : 'text-gray-300'}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                ))}
              </div>
              <span className="text-gray-600">{creator.rating ?? 'N/A'}/5</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{creator.responseTime ?? 'N/A'}</span>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors">
              Contact Creator
            </button>
            <button className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg transition-colors">
              Save Profile
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Performance Metrics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{formatNumber(creator.metrics?.followers)}</p>
              <p className="text-sm text-gray-600">Followers</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{(creator.metrics as any)?.engagement_rate ?? creator.metrics?.engagementRate ?? 'N/A'}%</p>
              <p className="text-sm text-gray-600">Engagement Rate</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{formatNumber(creator.metrics?.avgViews)}</p>
              <p className="text-sm text-gray-600">Avg Views</p>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">{formatNumber(creator.metrics?.avgLikes)}</p>
              <p className="text-sm text-gray-600">Avg Likes</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pricing</h2>
          <div className="space-y-3">
            {creator.rates.post !== undefined && creator.rates.post !== null && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M19 7h-3V6a1 1 0 0 0-2 0v1h-4V6a1 1 0 0 0-2 0v1H5a1 1 0 0 0 0 2h2v2H5a1 1 0 0 0 0 2h2v6a1 1 0 0 0 2 0v-6h4v6a1 1 0 0 0 2 0v-6h2a1 1 0 0 0 0-2h-2V9h2a1 1 0 0 0 0-2zM10 9h4v2h-4V9z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Post</p>
                  <span className="text-lg font-semibold text-gray-900">₹{Number(creator.rates.post).toLocaleString()}</span>
                </div>
              </div>
            )}

            {creator.rates.story !== undefined && creator.rates.story !== null && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Story</p>
                  <span className="text-lg font-semibold text-gray-900">₹{Number(creator.rates.story).toLocaleString()}</span>
                </div>
              </div>
            )}

            {creator.rates.reel !== undefined && creator.rates.reel !== null && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reel</p>
                  <span className="text-lg font-semibold text-gray-900">₹{Number(creator.rates.reel).toLocaleString()}</span>
                </div>
              </div>
            )}

            {creator.rates.video !== undefined && creator.rates.video !== null && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Video</p>
                  <span className="text-lg font-semibold text-gray-900">₹{Number(creator.rates.video).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {((creator as any).audience_demographics || creator.demographics) && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Audience Demographics</h2>
            <div className="space-y-4">
              {((creator as any).audience_demographics?.ageRange || creator.demographics?.ageRange) && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Age Range</p>
                  <p className="text-lg text-gray-900">{(creator as any).audience_demographics?.ageRange ?? creator.demographics?.ageRange}</p>
                </div>
              )}
              {((creator as any).audience_demographics?.topCountries || creator.demographics?.topCountries) && Array.isArray(((creator as any).audience_demographics?.topCountries ?? creator.demographics?.topCountries)) && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Top Countries</p>
                  <div className="flex flex-wrap gap-2">
                    {(((creator as any).audience_demographics?.topCountries ?? creator.demographics?.topCountries) || []).map((country: string, index: number) => (
                      <span key={index} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm">
                        {country}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {((creator as any).audience_demographics?.genderSplit || creator.demographics?.genderSplit) && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Gender Split</p>
                  <div className="space-y-2">
                    {(((creator as any).audience_demographics?.genderSplit?.female ?? creator.demographics?.genderSplit?.female) !== undefined) && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Female</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full">
                            <div
                              className="h-2 bg-pink-500 rounded-full"
                              style={{ width: `${(creator as any).audience_demographics?.genderSplit?.female ?? creator.demographics?.genderSplit?.female}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{(creator as any).audience_demographics?.genderSplit?.female ?? creator.demographics?.genderSplit?.female}%</span>
                        </div>
                      </div>
                    )}
                    {(((creator as any).audience_demographics?.genderSplit?.male ?? creator.demographics?.genderSplit?.male) !== undefined) && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Male</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full">
                            <div
                              className="h-2 bg-blue-500 rounded-full"
                              style={{ width: `${(creator as any).audience_demographics?.genderSplit?.male ?? creator.demographics?.genderSplit?.male}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{(creator as any).audience_demographics?.genderSplit?.male ?? creator.demographics?.genderSplit?.male}%</span>
                        </div>
                      </div>
                    )}
                    {(((creator as any).audience_demographics?.genderSplit?.other ?? creator.demographics?.genderSplit?.other) !== undefined) && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Other</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-gray-200 rounded-full">
                            <div
                              className="h-2 bg-gray-500 rounded-full"
                              style={{ width: `${(creator as any).audience_demographics?.genderSplit?.other ?? creator.demographics?.genderSplit?.other}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium">{(creator as any).audience_demographics?.genderSplit?.other ?? creator.demographics?.genderSplit?.other}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Niches</h2>
          <div className="flex flex-wrap gap-2">
            {Array.isArray(creator.niche) ? creator.niche.map((n: string, index: number) => (
              <span
                key={index}
                className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium capitalize"
              >
                {n}
              </span>
            )) : <span className="text-gray-500">N/A</span>}
          </div>
          
          {creator.metrics?.avgComments !== undefined && creator.metrics?.avgComments !== null && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Performance</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Avg Comments</p>
                  <p className="font-semibold text-gray-900">{formatNumber(creator.metrics.avgComments)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Response Rate</p>
                  <p className="font-semibold text-gray-900">{creator.responseTime || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 