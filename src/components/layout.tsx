import { type ReactNode } from 'react';
import Navbar from './navbar';
import Sidebar from './sidebar';

interface LayoutProps {
  children: ReactNode;
  className?: string;
}

export default function Layout({ children, className = "" }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <Navbar />
      
      <div className="flex">
        {/* Sidebar */}
        <Sidebar className="w-64 min-h-screen" />
        
        {/* Main Content Area */}
        <main className={`flex-1 p-6 ${className}`}>
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
} 