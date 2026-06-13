import { useState } from 'react'
import { useData } from './lib/data.jsx'
import PlantSelector from './components/PlantSelector.jsx'
import PlantsManager from './components/PlantsManager.jsx'
import Sidebar from './components/Sidebar.jsx'
import Overview from './pages/Overview.jsx'
import Projects from './pages/Projects.jsx'
import Sales from './pages/Sales.jsx'
import SalesDashboard from './pages/SalesDashboard.jsx'
import PourRecords from './pages/PourRecords.jsx'
import Materials from './pages/Materials.jsx'
import Machinery from './pages/Machinery.jsx'
import Manpower from './pages/Manpower.jsx'
import Costing from './pages/Costing.jsx'
import CostLog from './pages/CostLog.jsx'

// Two workspaces: the batching-plant operation, and the project portfolio.
const WORKSPACES = {
  plant: {
    label: 'Batching Plant', icon: '🏭',
    tabs: [
      ['overview', 'Overview', Overview],
      ['sales', 'Sales', Sales],
      ['sales-dashboard', 'Sales Dashboard', SalesDashboard],
      ['pours', 'Concrete Production', PourRecords],
      ['materials', 'Materials', Materials],
      ['machinery', 'Machinery', Machinery],
      ['manpower', 'Manpower', Manpower],
      ['costing', 'Costing', Costing],
      ['cost-log', 'Cost Log', CostLog],
    ],
  },
  projects: {
    label: 'Projects', icon: '🏗️',
    tabs: [['projects', 'Projects', Projects]],
  },
}

const persisted = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

export default function App() {
  const { loaded, status, plantSel, plants, selectedPlantIds } = useData()
  const [workspace, setWorkspaceState] = useState(() => persisted('mt.workspace', 'plant'))
  const [tab, setTab] = useState(() => WORKSPACES[persisted('mt.workspace', 'plant')]?.tabs[0][0] ?? 'overview')
  const [sidebarOpen, setSidebarOpen] = useState(() => persisted('mt.sidebar', true))
  const [managing, setManaging] = useState(false)

  const ws = WORKSPACES[workspace] ?? WORKSPACES.plant
  const setWorkspace = (key) => {
    setWorkspaceState(key)
    setTab(WORKSPACES[key].tabs[0][0])
    try { localStorage.setItem('mt.workspace', JSON.stringify(key)) } catch { /* ignore */ }
  }
  const toggleSidebar = () => setSidebarOpen((o) => {
    try { localStorage.setItem('mt.sidebar', JSON.stringify(!o)) } catch { /* ignore */ }
    return !o
  })

  const Page = ws.tabs.find(([key]) => key === tab)?.[2] ?? ws.tabs[0][2]

  const scopeLabel = plantSel === 'all'
    ? 'All Plants — Aggregated Overview'
    : selectedPlantIds.length === 1
      ? plants.find((p) => Number(p.id) === selectedPlantIds[0])?.name
      : `${selectedPlantIds.length} plants — Combined`

  return (
    <div className="min-h-screen">
      {/* Dark header */}
      <header className="bg-neutral-900 text-white">
        <div className="px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              title="Toggle menu"
              className="w-9 h-9 rounded-md border border-neutral-700 hover:bg-neutral-800 flex items-center justify-center cursor-pointer text-neutral-300"
            >
              ☰
            </button>
            <div className="w-9 h-9 rounded-md border border-neutral-600 flex items-center justify-center font-bold text-sm">MT</div>
            <div>
              <div className="font-bold leading-tight">Musyati Tracking Monitor</div>
              <div className="mono text-[11px] tracking-widest text-neutral-400">{ws.label.toUpperCase()}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <PlantSelector />
            <button
              className="bg-neutral-800 border border-neutral-700 text-sm px-3 py-1.5 rounded-md hover:bg-neutral-700 cursor-pointer"
              onClick={() => setManaging(true)}
            >
              ⚙ Plants
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-400 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400' : status === 'demo' ? 'bg-blue-400' : status === 'error' ? 'bg-red-400' : 'bg-yellow-400'}`} />
              {status === 'connected' ? 'Connected' : status === 'demo' ? 'Demo — changes not saved' : status === 'error' ? 'Offline' : 'Connecting…'}
            </span>
            {status !== 'demo' && (
              <a
                href="/api/backup"
                className="border border-neutral-600 text-sm px-3 py-1.5 rounded-md hover:bg-neutral-800 text-neutral-200"
              >
                ↓ Backup Excel
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <Sidebar workspaces={WORKSPACES} active={workspace} onSelect={setWorkspace} open={sidebarOpen} />

        <div className="flex-1 min-w-0">
          {/* Tabs for the active workspace (hidden when only one) */}
          {ws.tabs.length > 1 && (
            <nav className="bg-white border-b border-neutral-200">
              <div className="px-6 flex gap-1 overflow-x-auto">
                {ws.tabs.map(([key, name]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`px-4 py-3 text-sm whitespace-nowrap cursor-pointer border-b-2 -mb-px ${
                      tab === key
                        ? 'border-neutral-900 font-bold text-neutral-900'
                        : 'border-transparent text-neutral-500 hover:text-neutral-800'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </nav>
          )}

          <main className="px-6 py-5">
            <div className="mb-4">
              <span className="inline-flex items-center gap-2 text-xs font-medium border border-neutral-300 bg-white rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {scopeLabel}
              </span>
            </div>
            {loaded ? <Page /> : <div className="py-20 text-center text-neutral-400">Loading…</div>}
          </main>
        </div>
      </div>

      {managing && <PlantsManager onClose={() => setManaging(false)} />}
    </div>
  )
}
