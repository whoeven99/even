import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AiChatPage } from './pages/AiChatPage'
import { AssetManagerPage } from './pages/AssetManagerPage'
import { BillImportPage } from './pages/BillImportPage'
import { HomePage } from './pages/HomePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'ai-chat', element: <AiChatPage /> },
      { path: 'bills', element: <BillImportPage /> },
      { path: 'asset-manager', element: <AssetManagerPage /> },
    ],
  },
])
