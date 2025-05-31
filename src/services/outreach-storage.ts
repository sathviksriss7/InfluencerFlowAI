import { type Creator } from '../types';

// Define interfaces for our outreach data structure
export interface StoredOutreach {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  creatorPlatform: string;
  subject: string;
  body: string;
  status: 'pending' | 'contacted' | 'interested' | 'negotiating' | 'deal_closed' | 'declined';
  confidence: number;
  reasoning: string;
  keyPoints: string[];
  nextSteps: string[];
  brandName: string;
  campaignContext: string;
  createdAt: Date;
  lastContact: Date;
  currentOffer?: number;
  notes: string;
}

export interface OutreachSummary {
  totalOutreaches: number;
  statusCounts: Record<string, number>;
  recentOutreaches: StoredOutreach[];
  successRate: number;
}

class OutreachStorageService {
  private storageKey = 'influencer_outreaches';

  /**
   * Save a new outreach to localStorage
   */
  saveOutreach(outreach: StoredOutreach): void {
    try {
      const existingOutreaches = this.getAllOutreaches();
      
      // Check if outreach already exists and update, otherwise add new
      const existingIndex = existingOutreaches.findIndex(o => o.id === outreach.id);
      
      if (existingIndex >= 0) {
        existingOutreaches[existingIndex] = {
          ...outreach,
          lastContact: new Date() // Update last contact time
        };
      } else {
        existingOutreaches.push(outreach);
      }
      
      // Sort by creation date (newest first)
      existingOutreaches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      localStorage.setItem(this.storageKey, JSON.stringify(existingOutreaches));
      console.log('✅ Outreach saved successfully:', outreach.creatorName);
    } catch (error) {
      console.error('❌ Error saving outreach:', error);
    }
  }

  /**
   * Get all outreaches from localStorage
   */
  getAllOutreaches(): StoredOutreach[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      
      const outreaches = JSON.parse(stored);
      
      // Convert date strings back to Date objects
      return outreaches.map((outreach: any) => ({
        ...outreach,
        createdAt: new Date(outreach.createdAt),
        lastContact: new Date(outreach.lastContact)
      }));
    } catch (error) {
      console.error('❌ Error loading outreaches:', error);
      return [];
    }
  }

  /**
   * Get outreaches for a specific creator
   */
  getOutreachesForCreator(creatorId: string): StoredOutreach[] {
    return this.getAllOutreaches().filter(outreach => outreach.creatorId === creatorId);
  }

  /**
   * Update outreach status
   */
  updateOutreachStatus(outreachId: string, status: StoredOutreach['status'], notes?: string, currentOffer?: number): void {
    try {
      const outreaches = this.getAllOutreaches();
      const outreachIndex = outreaches.findIndex(o => o.id === outreachId);
      
      if (outreachIndex >= 0) {
        outreaches[outreachIndex] = {
          ...outreaches[outreachIndex],
          status,
          lastContact: new Date(),
          ...(notes && { notes: notes }),
          ...(currentOffer && { currentOffer })
        };
        
        localStorage.setItem(this.storageKey, JSON.stringify(outreaches));
        console.log('✅ Outreach status updated:', status);
      }
    } catch (error) {
      console.error('❌ Error updating outreach status:', error);
    }
  }

  /**
   * Get outreach summary for dashboard
   */
  getOutreachSummary(): OutreachSummary {
    const outreaches = this.getAllOutreaches();
    
    // Calculate status counts
    const statusCounts = outreaches.reduce((counts, outreach) => {
      counts[outreach.status] = (counts[outreach.status] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // Calculate success rate (interested + negotiating + deal_closed / total)
    const successfulStatuses = ['interested', 'negotiating', 'deal_closed'];
    const successfulCount = successfulStatuses.reduce((count, status) => 
      count + (statusCounts[status] || 0), 0
    );
    const successRate = outreaches.length > 0 ? (successfulCount / outreaches.length) * 100 : 0;

    // Get recent outreaches (last 5)
    const recentOutreaches = outreaches.slice(0, 5);

    return {
      totalOutreaches: outreaches.length,
      statusCounts,
      recentOutreaches,
      successRate: Math.round(successRate)
    };
  }

  /**
   * Delete an outreach
   */
  deleteOutreach(outreachId: string): void {
    try {
      const outreaches = this.getAllOutreaches();
      const filteredOutreaches = outreaches.filter(o => o.id !== outreachId);
      localStorage.setItem(this.storageKey, JSON.stringify(filteredOutreaches));
      console.log('✅ Outreach deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting outreach:', error);
    }
  }

  /**
   * Clear all outreaches (for testing/reset purposes)
   */
  clearAllOutreaches(): void {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('✅ All outreaches cleared');
    } catch (error) {
      console.error('❌ Error clearing outreaches:', error);
    }
  }
}

// Export a singleton instance
export const outreachStorage = new OutreachStorageService(); 