import { useState, useMemo } from 'react';
import { mockPaymentMilestones } from '../mock-data/payments';
import { mockDeals } from '../mock-data/deals';
import { mockCreators } from '../mock-data/creators';
import { mockCampaigns } from '../mock-data/campaigns';

export default function Payments() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);

  // Enrich payment data with related information
  const enrichedPayments = mockPaymentMilestones.map(payment => {
    const deal = mockDeals.find(d => d.id === payment.dealId);
    const creator = mockCreators.find(c => c.id === deal?.creatorId);
    const campaign = mockCampaigns.find(c => c.id === deal?.campaignId);
    return { ...payment, deal, creator, campaign };
  });

  // Filter payments based on status
  const filteredPayments = useMemo(() => {
    if (statusFilter === 'all') return enrichedPayments;
    return enrichedPayments.filter(payment => payment.status === statusFilter);
  }, [statusFilter]);

  const selectedPaymentData = selectedPayment 
    ? enrichedPayments.find(p => p.id === selectedPayment) 
    : null;

  // Calculate summary statistics
  const totalPaid = enrichedPayments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPending = enrichedPayments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalOverdue = enrichedPayments
    .filter(p => p.status === 'overdue')
    .reduce((sum, p) => sum + p.amount, 0);

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'completed':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`;
      case 'overdue':
        return `${baseClasses} bg-red-100 text-red-800`;
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

  const getDaysUntilDue = (dueDate: Date) => {
    const today = new Date();
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
            <p className="text-gray-600">Track payments and manage invoices for your campaigns</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
            Process Payment
          </button>
        </div>

        {/* Financial Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Total Paid</h3>
            <p className="text-2xl font-bold text-green-600">₹{totalPaid.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Pending Payments</h3>
            <p className="text-2xl font-bold text-yellow-600">₹{totalPending.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Overdue</h3>
            <p className="text-2xl font-bold text-red-600">₹{totalOverdue.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payments List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter */}
          <div className="bg-white rounded-lg shadow p-4">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Payments</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {/* Payments Grid */}
          <div className="space-y-4">
            {filteredPayments.map((payment) => {
              const daysUntilDue = getDaysUntilDue(payment.dueDate);
              
              return (
                <div 
                  key={payment.id}
                  className={`bg-white rounded-lg shadow p-6 cursor-pointer transition-all ${
                    selectedPayment === payment.id ? 'ring-2 ring-blue-500' : 'hover:shadow-lg'
                  }`}
                  onClick={() => setSelectedPayment(payment.id)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={payment.creator?.avatar}
                        alt={payment.creator?.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div>
                        <h3 className="font-semibold text-gray-900">{payment.creator?.name}</h3>
                        <p className="text-sm text-gray-600">{payment.title}</p>
                        <p className="text-xs text-gray-500">{payment.campaign?.title}</p>
                      </div>
                    </div>
                    <span className={getStatusBadge(payment.status)}>
                      {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500">Amount</p>
                      <p className="font-semibold text-gray-900 text-lg">₹{payment.amount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Due Date</p>
                      <p className="font-semibold text-gray-900">{formatDate(payment.dueDate)}</p>
                      {payment.status === 'pending' && daysUntilDue <= 7 && daysUntilDue > 0 && (
                        <p className="text-xs text-orange-600">Due in {daysUntilDue} days</p>
                      )}
                      {payment.status === 'overdue' && (
                        <p className="text-xs text-red-600">{Math.abs(daysUntilDue)} days overdue</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">
                        {payment.status === 'completed' ? 'Paid Date' : 'Status'}
                      </p>
                      {payment.status === 'completed' && payment.paidAt ? (
                        <p className="font-semibold text-gray-900">{formatDate(payment.paidAt)}</p>
                      ) : (
                        <p className="font-semibold text-gray-900">
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">{payment.description}</p>

                  {/* Quick Actions */}
                  <div className="flex gap-2">
                    {payment.status === 'pending' && (
                      <button className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm">
                        Pay Now
                      </button>
                    )}
                    {payment.status === 'overdue' && (
                      <button className="flex-1 bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm">
                        Pay Overdue
                      </button>
                    )}
                    {payment.status === 'completed' && (
                      <button className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                        View Receipt
                      </button>
                    )}
                    <button className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredPayments.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No payments found</h3>
              <p className="text-gray-500">Payments will appear here once contracts are signed.</p>
            </div>
          )}
        </div>

        {/* Payment Details */}
        <div className="space-y-4">
          {selectedPaymentData ? (
            <>
              {/* Payment Overview */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Status</span>
                    <span className={getStatusBadge(selectedPaymentData.status)}>
                      {selectedPaymentData.status.charAt(0).toUpperCase() + selectedPaymentData.status.slice(1)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Amount</span>
                    <span className="font-semibold text-gray-900 text-lg">
                      ₹{selectedPaymentData.amount.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Due Date</span>
                    <span className="font-semibold text-gray-900">
                      {formatDate(selectedPaymentData.dueDate)}
                    </span>
                  </div>

                  {selectedPaymentData.paidAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Paid Date</span>
                      <span className="font-semibold text-gray-900">
                        {formatDateTime(selectedPaymentData.paidAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Creator Info */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Creator</h3>
                <div className="flex items-center gap-3">
                  <img
                    src={selectedPaymentData.creator?.avatar}
                    alt={selectedPaymentData.creator?.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">{selectedPaymentData.creator?.name}</p>
                    <p className="text-sm text-gray-600">{selectedPaymentData.creator?.username}</p>
                    <p className="text-xs text-gray-500">{selectedPaymentData.creator?.location}</p>
                  </div>
                </div>
              </div>

              {/* Campaign Info */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign</h3>
                <div>
                  <p className="font-semibold text-gray-900">{selectedPaymentData.campaign?.title}</p>
                  <p className="text-sm text-gray-600">{selectedPaymentData.campaign?.brand}</p>
                  <p className="text-xs text-gray-500 mt-2">{selectedPaymentData.description}</p>
                </div>
              </div>

              {/* Payment Actions */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                <div className="space-y-2">
                  {selectedPaymentData.status === 'pending' && (
                    <>
                      <button className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                        Process Payment
                      </button>
                      <button className="w-full border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        Schedule Payment
                      </button>
                    </>
                  )}
                  {selectedPaymentData.status === 'overdue' && (
                    <>
                      <button className="w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
                        Pay Overdue Amount
                      </button>
                      <button className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors">
                        Send Reminder
                      </button>
                    </>
                  )}
                  {selectedPaymentData.status === 'completed' && (
                    <>
                      <button className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        Download Receipt
                      </button>
                      <button className="w-full border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        View Invoice
                      </button>
                    </>
                  )}
                  <button className="w-full border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    Contact Creator
                  </button>
                </div>
              </div>

              {/* Payment History */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
                <div className="space-y-3">
                  {selectedPaymentData.status === 'completed' && selectedPaymentData.paidAt && (
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-800">Payment Completed</p>
                        <p className="text-xs text-green-600">{formatDateTime(selectedPaymentData.paidAt)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-800">Milestone Created</p>
                      <p className="text-xs text-gray-600">{formatDate(selectedPaymentData.dueDate)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Payment</h3>
              <p className="text-gray-500">Choose a payment from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 