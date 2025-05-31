import { useState } from 'react';
import { mockContracts } from '../mock-data/contracts';
import { mockCreators } from '../mock-data/creators';
import { mockCampaigns } from '../mock-data/campaigns';
import { mockDeals } from '../mock-data/deals';

export default function Contracts() {
  const [selectedContract, setSelectedContract] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  // Enrich contracts with related data
  const enrichedContracts = mockContracts.map(contract => {
    const deal = mockDeals.find(d => d.id === contract.dealId);
    const creator = mockCreators.find(c => c.id === deal?.creatorId);
    const campaign = mockCampaigns.find(c => c.id === deal?.campaignId);
    return { ...contract, deal, creator, campaign };
  });

  // Filter contracts by status
  const filteredContracts = statusFilter === 'all' 
    ? enrichedContracts 
    : enrichedContracts.filter(contract => contract.status === statusFilter);

  const selectedContractData = selectedContract 
    ? enrichedContracts.find(c => c.id === selectedContract) 
    : null;

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-3 py-1 text-sm font-medium rounded-full";
    switch (status) {
      case 'draft':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case 'sent':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'signed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'completed':
        return `${baseClasses} bg-purple-100 text-purple-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
            <p className="text-gray-600">Manage your influencer contracts and agreements</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
            Create Contract
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">{enrichedContracts.length}</p>
            <p className="text-sm text-gray-600">Total Contracts</p>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {enrichedContracts.filter(c => c.status === 'sent').length}
            </p>
            <p className="text-sm text-gray-600">Pending Signature</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {enrichedContracts.filter(c => c.status === 'signed').length}
            </p>
            <p className="text-sm text-gray-600">Signed</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">
              {enrichedContracts.filter(c => c.status === 'completed').length}
            </p>
            <p className="text-sm text-gray-600">Completed</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contracts List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter */}
          <div className="bg-white rounded-lg shadow p-4">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Contracts</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Contracts Grid */}
          <div className="space-y-4">
            {filteredContracts.map((contract) => (
              <div 
                key={contract.id}
                className={`bg-white rounded-lg shadow p-6 cursor-pointer transition-all ${
                  selectedContract === contract.id ? 'ring-2 ring-blue-500' : 'hover:shadow-lg'
                }`}
                onClick={() => setSelectedContract(contract.id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={contract.creator?.avatar}
                      alt={contract.creator?.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="font-semibold text-gray-900">{contract.creator?.name}</h3>
                      <p className="text-sm text-gray-600">{contract.campaign?.title}</p>
                    </div>
                  </div>
                  <span className={getStatusBadge(contract.status)}>
                    {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-500">Contract Value</p>
                    <p className="font-semibold text-gray-900">₹{contract.terms.rate.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Created</p>
                    <p className="font-semibold text-gray-900">{formatDate(contract.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Campaign End</p>
                    <p className="font-semibold text-gray-900">{formatDate(contract.terms.timeline.campaignEnd)}</p>
                  </div>
                </div>

                {contract.signedAt && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Signed on {formatDateTime(contract.signedAt)}
                  </div>
                )}

                {/* Quick Actions */}
                <div className="flex gap-2 mt-4">
                  <button className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    View Contract
                  </button>
                  {contract.status === 'draft' && (
                    <button className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                      Send
                    </button>
                  )}
                  {contract.status === 'sent' && (
                    <button className="px-3 py-2 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-colors text-sm">
                      Reminder
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredContracts.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No contracts found</h3>
              <p className="text-gray-500">Contracts will appear here once deals are finalized.</p>
            </div>
          )}
        </div>

        {/* Contract Details */}
        <div className="space-y-4">
          {selectedContractData ? (
            <>
              {/* Contract Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Contract Details</h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Status</span>
                    <span className={getStatusBadge(selectedContractData.status)}>
                      {selectedContractData.status.charAt(0).toUpperCase() + selectedContractData.status.slice(1)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Value</span>
                    <span className="font-semibold text-gray-900">
                      ₹{selectedContractData.terms.rate.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Revisions Allowed</span>
                    <span className="font-semibold text-gray-900">
                      {selectedContractData.terms.revisions}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Exclusivity</span>
                    <span className="font-semibold text-gray-900">
                      {selectedContractData.terms.exclusivity ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Campaign Start</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedContractData.terms.timeline.campaignStart)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Content Due</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedContractData.terms.timeline.contentDue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Campaign End</p>
                    <p className="font-medium text-gray-900">
                      {formatDate(selectedContractData.terms.timeline.campaignEnd)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deliverables */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Deliverables</h3>
                <div className="space-y-2">
                  {selectedContractData.terms.deliverables.map((deliverable, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span className="text-sm text-gray-700">{deliverable}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Usage Rights */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Rights</h3>
                <p className="text-sm text-gray-700">{selectedContractData.terms.usageRights}</p>
              </div>

              {/* Actions */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                <div className="space-y-2">
                  <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    Download PDF
                  </button>
                  {selectedContractData.status === 'draft' && (
                    <button className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                      Send for Signature
                    </button>
                  )}
                  {selectedContractData.status === 'sent' && (
                    <button className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors">
                      Send Reminder
                    </button>
                  )}
                  <button className="w-full border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    Edit Contract
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Contract</h3>
              <p className="text-gray-500">Choose a contract from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 