import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'

import { Home } from './app/Home'
import { Layout } from './app/Layout'
import { Problem } from './components/Problem'
import { DriverPage } from './features/drivers/DriverPage'
import { DriversPage } from './features/drivers/DriversPage'
import { RacesPage } from './features/picker/RacesPage'
import { ReplayPage } from './features/replay/ReplayPage'
import { StandingsPage } from './features/standings/StandingsPage'
import { TeamPage } from './features/teams/TeamPage'
import { TeamsPage } from './features/teams/TeamsPage'
import { TrackPage } from './features/tracks/TrackPage'
import { TracksPage } from './features/tracks/TracksPage'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/races', element: <RacesPage /> },
      { path: '/replay/:raceId', element: <ReplayPage /> },
      { path: '/standings', element: <StandingsPage /> },
      { path: '/drivers', element: <DriversPage /> },
      { path: '/drivers/:driverId', element: <DriverPage /> },
      { path: '/teams', element: <TeamsPage /> },
      { path: '/teams/:slug', element: <TeamPage /> },
      { path: '/tracks', element: <TracksPage /> },
      { path: '/tracks/:trackId', element: <TrackPage /> },
      { path: '*', element: <Problem title="Page not found" /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
