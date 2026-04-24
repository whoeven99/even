import { createBrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AboutPage } from './pages/AboutPage'
import { ApiDemoPage } from './pages/ApiDemoPage'
import { HomePage } from './pages/HomePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'api-demo', element: <ApiDemoPage /> },
    ],
  },
])
