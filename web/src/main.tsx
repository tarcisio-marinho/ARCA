import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import './styles.css'

const Home = lazy(() => import('./pages/Home'))
const Guides = lazy(() => import('./pages/Guides'))
const Library = lazy(() => import('./pages/Library'))
const Docs = lazy(() => import('./pages/Docs'))
const Chat = lazy(() => import('./pages/Chat'))
const Maps = lazy(() => import('./pages/Maps'))
const Tools = lazy(() => import('./pages/Tools'))
const Bitcoin = lazy(() => import('./pages/Bitcoin'))
const Supplies = lazy(() => import('./pages/Supplies'))
const Notes = lazy(() => import('./pages/Notes'))
const System = lazy(() => import('./pages/System'))
const Search = lazy(() => import('./pages/Search'))
const Translate = lazy(() => import('./pages/Translate'))
const Videos = lazy(() => import('./pages/Videos'))
const VideoPlayer = lazy(() => import('./pages/VideoPlayer'))

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } })
const S = (el: React.ReactNode) => (
  <Suspense
    fallback={
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    }
  >
    {el}
  </Suspense>
)

function RouteError() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="font-display text-2xl font-bold">Esta tela teve um problema</div>
      <p className="max-w-md text-sm text-fg-2">O resto da Arca continua funcionando. Use o menu ou recarregue a página.</p>
      <button onClick={() => location.reload()} className="bg-gold-grad rounded-xl px-4 py-2 text-sm font-bold text-gold-ink">
        Recarregar
      </button>
    </div>
  )
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', errorElement: <RouteError />, element: S(<Home />) },
      { path: '/guias', errorElement: <RouteError />, element: S(<Guides />) },
      { path: '/guias/:id', errorElement: <RouteError />, element: S(<Guides />) },
      { path: '/biblioteca', errorElement: <RouteError />, element: S(<Library />) },
      { path: '/documentos', errorElement: <RouteError />, element: S(<Docs />) },
      { path: '/docs/:id', errorElement: <RouteError />, element: S(<Docs />) },
      // rota única com parâmetro opcional: criar a conversa não remonta o chat no meio do streaming
      { path: '/ia/:id?', errorElement: <RouteError />, element: S(<Chat />) },
      { path: '/mapas', errorElement: <RouteError />, element: S(<Maps />) },
      { path: '/ferramentas', errorElement: <RouteError />, element: S(<Tools />) },
      { path: '/bitcoin', errorElement: <RouteError />, element: S(<Bitcoin />) },
      { path: '/suprimentos', errorElement: <RouteError />, element: S(<Supplies />) },
      { path: '/notas', errorElement: <RouteError />, element: S(<Notes />) },
      { path: '/tradutor', errorElement: <RouteError />, element: S(<Translate />) },
      { path: '/videos', errorElement: <RouteError />, element: S(<Videos />) },
      { path: '/videos/:id', errorElement: <RouteError />, element: S(<VideoPlayer />) },
      { path: '/busca', errorElement: <RouteError />, element: S(<Search />) },
      { path: '/sistema', errorElement: <RouteError />, element: S(<System />) },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: '#181818', border: '1px solid #2a2a2a', color: '#fff', fontFamily: 'Outfit Variable' } }} />
    </QueryClientProvider>
  </StrictMode>
)
