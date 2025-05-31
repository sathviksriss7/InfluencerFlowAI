interface NavbarProps {
  className?: string;
}

export default function Navbar({ className = "" }: NavbarProps) {
  return (
    <nav className={`bg-white border-b border-gray-200 px-6 py-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Logo/Brand */}
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">I</span>
          </div>
          <span className="text-xl font-bold text-gray-900">InfluencerFlowAI</span>
        </div>

        {/* Navigation Links - Desktop */}
        <div className="hidden md:flex items-center space-x-8">
          <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">
            Dashboard
          </a>
          <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">
            Discover Creators
          </a>
          <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">
            Campaigns
          </a>
          <a href="#" className="text-gray-600 hover:text-blue-600 transition-colors">
            Analytics
          </a>
        </div>

        {/* User Profile Section */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.97 4.97a.75.75 0 0 0-1.08 1.05l-3.99 4.99a.75.75 0 0 0 0 1.08l4.25 4.25a.75.75 0 0 0 1.06 0l4.25-4.25a.75.75 0 0 0 0-1.08l-3.99-4.99a.75.75 0 0 0-1.08-1.05z" />
            </svg>
          </button>

          {/* User Avatar */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-gray-600">U</span>
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700">Brand User</span>
          </div>
        </div>
      </div>
    </nav>
  );
} 