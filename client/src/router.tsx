import { createBrowserRouter, Navigate } from 'react-router-dom'
import { App } from './App'
import { OverviewPage } from './pages/OverviewPage'
import { FinancePage } from './pages/FinancePage'
import { WorkspacePage } from './pages/WorkspacePage'
import { HealthPage } from './pages/HealthPage'
import { AssistantPage } from './pages/AssistantPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'finance', element: <FinancePage /> },
      { path: 'workspace', element: <WorkspacePage /> },
      { path: 'health', element: <HealthPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      // 兼容旧路由
      { path: 'ai-chat', element: <Navigate to="/assistant" replace /> },
      { path: 'bills', element: <Navigate to="/finance" replace /> },
      { path: 'asset-manager', element: <Navigate to="/finance" replace /> },
      { path: 'notes', element: <Navigate to="/workspace" replace /> },
    ],
  },
])
