import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout'
import Login from './pages/login'
import Dashboard from './pages/dashboard'
import Creators from './pages/creators'
import CreatorProfile from './pages/creator-profile'
import Campaigns from './pages/campaigns'
import CreateCampaign from './pages/create-campaign'
import CampaignDetailPage from './pages/campaign-detail'
import CampaignEditPage from './pages/CampaignEditPage'
import Negotiations from './pages/negotiations'
import Contracts from './pages/contracts'
import Payments from './pages/payments'
import Analytics from './pages/analytics'
import Outreaches from './pages/outreaches'
import AgenticAI from './pages/agentic-ai'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

function App() {
  return (
    <AuthProvider>
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        
        {/* Protected Routes */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agentic-ai"
          element={
            <ProtectedRoute>
              <Layout>
                <AgenticAI />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/creators"
          element={
            <ProtectedRoute>
              <Layout>
                <Creators />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/creators/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <CreatorProfile />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <Layout>
                <Campaigns />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/create"
          element={
            <ProtectedRoute>
              <Layout>
                <CreateCampaign />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId"
          element={
            <ProtectedRoute>
              <Layout>
                <CampaignDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns/:campaignId/edit"
          element={
            <ProtectedRoute>
              <Layout>
                <CampaignEditPage />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/negotiations"
          element={
            <ProtectedRoute>
              <Layout>
                <Negotiations />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/contracts"
          element={
            <ProtectedRoute>
              <Layout>
                <Contracts />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute>
              <Layout>
                <Payments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Layout>
                <Analytics />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/outreaches"
          element={
            <ProtectedRoute>
              <Layout>
                <Outreaches />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}

export default App
