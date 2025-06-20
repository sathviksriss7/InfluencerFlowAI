import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Placeholder Mail Icon SVG - Replace with your icon library if available
const MailIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const UserMenu: React.FC = () => {
  const { user, signOut, session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [gmailStatus, setGmailStatus] = useState<'idle' | 'loading' | 'connected' | 'not_connected' | 'error'>('idle');
  const [gmailErrorMessage, setGmailErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
    // Example: In some frontend component
    useEffect(() => {
      const testBackendConnection = async () => {
        const backendUrl = import.meta.env.VITE_BACKEND_API_URL; // This should be your Render URL
        if (!backendUrl) {
          console.error("VITE_BACKEND_API_URL is not set!");
          return;
        }
        try {
          console.log(`Attempting to fetch from: ${backendUrl}/api/hello`);
          const response = await fetch(`${backendUrl}/api/hello`);
          const data = await response.json();
          console.log("Response from /api/hello:", data);
          // You could also try to get text if .json() fails:
          // const textData = await response.text();
          // console.log("Raw text response from /api/hello:", textData);
        } catch (error) {
          console.error("Error fetching from /api/hello:", error);
        }
      };

      testBackendConnection();
    }, []);
  // Fetch Gmail connection status when the menu is opened or user/session changes
  useEffect(() => {
    // Fetch whenever the menu is opened and there's a valid user session.
    if (isOpen && user && session?.access_token) { 
      setGmailStatus('loading'); // Always set to loading before a fetch
      setGmailErrorMessage(null);
      const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendUrl) {
        console.error("VITE_BACKEND_API_URL is not defined! Cannot fetch Gmail status.");
        setGmailStatus('error');
        setGmailErrorMessage('Backend API URL not configured.');
        return;
      }
      fetch(`${backendUrl}/api/auth/google/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })
        .then(async res => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Failed to fetch Gmail status' }));
            throw new Error(errorData.message || `HTTP error ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (data.success && data.is_connected) {
            setGmailStatus('connected');
          } else if (data.success && !data.is_connected) {
            setGmailStatus('not_connected');
          } else {
            setGmailStatus('error');
            setGmailErrorMessage(data.message || 'Unknown error checking Gmail status');
          }
        })
        .catch(error => {
          console.error("Error fetching Gmail status:", error);
          setGmailStatus('error');
          setGmailErrorMessage(error.message || 'Could not connect to server.');
        });
    } 
    // For now, it fetches when gmailStatus is 'idle' and menu opens with a valid session.
    // No longer relying on gmailStatus === 'idle' to trigger fetch.
  }, [isOpen, user, session]); // Removed gmailStatus from dependencies

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsOpen(false);
      setGmailStatus('idle'); 
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleConnectGmail = async () => {
    if (!session?.access_token) {
      setGmailStatus('error');
      setGmailErrorMessage("User session not found or token missing. Please log in again.");
      setIsOpen(false); // Close menu if session is invalid
      return;
    }

    setIsOpen(false); // Close menu as the connection process starts

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
      if (!backendUrl) {
        console.error("VITE_BACKEND_API_URL is not defined! Cannot initiate Gmail connection.");
        setGmailStatus('error');
        setGmailErrorMessage('Backend API URL not configured.');
        setIsOpen(false);
        return;
      }
      const response = await fetch(`${backendUrl}/api/auth/google/login`, { 
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = `Failed to initiate Gmail connection. Status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage; // Prefer backend's error message
        } catch (parseError) {
            // If parsing errorData fails, stick with the status-based message
            console.warn("Could not parse error response from /api/auth/google/login:", parseError);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success && data.authorization_url) {
        window.location.href = data.authorization_url;
        // Redirect will happen, no further state changes needed here for success
      } else {
        throw new Error(data.message || 'Failed to retrieve authorization URL from the server.');
      }
    } catch (error: any) {
      console.error('Error initiating Gmail connection:', error);
      setGmailStatus('error');
      setGmailErrorMessage(error.message || 'Could not connect to Google OAuth. Please check console and try again.');
      // Menu is already closed as setIsOpen(false) was called before the try block
    }
  };

  if (!user) return null;

  const displayName = user.user_metadata?.full_name || user.email || 'User';
  const displayEmail = user.email || '';
  const avatarUrl = user.user_metadata?.avatar_url;

  const getGmailStatusTextAndAction = () => {
    switch (gmailStatus) {
      case 'loading':
        return { text: 'Checking Gmail Status...', action: null, disabled: true, iconColor: 'text-gray-500' };
      case 'connected':
        return { text: 'Gmail Connected', action: null, disabled: true, iconColor: 'text-green-500' };
      case 'not_connected':
        return { text: 'Connect Gmail Account', action: handleConnectGmail, disabled: false, iconColor: 'text-blue-500' };
      case 'error':
        return { text: `Gmail: Error (Retry)`, action: () => setGmailStatus('idle'), disabled: false, iconColor: 'text-red-500' };
      case 'idle': 
      default:
        return { text: 'Check Gmail Connection', action: () => setGmailStatus('idle'), disabled: false, iconColor: 'text-gray-700' };
    }
  };

  const gmailInfo = getGmailStatusTextAndAction();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
            setIsOpen(!isOpen);
            // The useEffect above will handle fetching/re-fetching gmailStatus when isOpen becomes true.
        }}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-sm font-medium">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-gray-900">{displayName}</p>
          <p className="text-xs text-gray-500 truncate max-w-[150px]">{displayEmail}</p>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-medium">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{displayName}</p>
                <p className="text-xs text-gray-500 truncate">{displayEmail}</p>
              </div>
            </div>
          </div>

          <div className="py-2">
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile Settings
            </button>
            
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Preferences
            </button>

            <button
              onClick={gmailInfo.action || (() => {})}
              disabled={gmailInfo.disabled}
              className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${gmailInfo.disabled ? 'text-gray-400 cursor-not-allowed' : 'hover:bg-gray-50'} ${gmailInfo.iconColor}`}
            >
              <MailIcon />
              {gmailInfo.text}
            </button>
            {gmailStatus === 'error' && gmailErrorMessage && (
              <p className="px-4 pt-1 pb-2 text-xs text-red-500">{gmailErrorMessage}</p>
            )}
          </div>

          <div className="border-t border-gray-100 my-2"></div>

          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu; 