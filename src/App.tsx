import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout'
import Dashboard from './pages/dashboard'
import Creators from './pages/creators'
import CreatorProfile from './pages/creator-profile'
import Campaigns from './pages/campaigns'
import CreateCampaign from './pages/create-campaign'
import Negotiations from './pages/negotiations'
import Contracts from './pages/contracts'
import Payments from './pages/payments'
import Analytics from './pages/analytics'
import Outreaches from './pages/outreaches'
import AgenticAI from './pages/agentic-ai'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/agentic-ai" element={<AgenticAI />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/creators/:id" element={<CreatorProfile />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/create" element={<CreateCampaign />} />
        <Route path="/negotiations" element={<Negotiations />} />
        <Route path="/contracts" element={<Contracts />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/outreaches" element={<Outreaches />} />
      </Routes>
    </Layout>
  )
}

export default App
