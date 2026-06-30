import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const DataContext = createContext(null)

// resource path -> workbook sheet (used by demo mode to mutate in memory)
const RESOURCE_SHEET = {
  plants: 'Plants', companies: 'Companies', grades: 'Grades', materials: 'Materials',
  sales: 'Sales', payments: 'Payments', pours: 'Pours', deliveries: 'Deliveries',
  'material-txns': 'MaterialTxns', expenses: 'Expenses', costing: 'Costing',
  'expense-categories': 'ExpenseCategories', machines: 'Machines', maintenance: 'MaintenanceRecords',
  workers: 'Workers', attendance: 'Attendance', projects: 'Projects', 'project-updates': 'ProjectUpdates',
  'foundation-groups': 'FoundationGroups', piles: 'Piles',
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `${method} ${url} failed (${res.status})`)
  return json
}

export function DataProvider({ children }) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('connecting') // connecting | connected | demo | error
  // plant selection: 'all' or array of plant ids
  const [plantSel, setPlantSel] = useState('all')
  // active workspace's plant type ('batching' | 'premix' | null = all plants)
  const [plantType, setPlantTypeState] = useState('batching')
  // demo mode keeps the dataset in a ref so rapid in-memory writes don't race
  const demoRef = useRef(false)
  const dataRef = useRef(null)
  const apply = (next) => { dataRef.current = next; setData(next) }

  const refresh = useCallback(async () => {
    // in demo mode there's no server to re-read from
    if (demoRef.current) return
    try {
      const d = await request('GET', '/api/data')
      apply(d)
      setStatus('connected')
    } catch {
      // no backend (e.g. GitHub Pages) — fall back to the baked-in snapshot
      try {
        const snap = await fetch(`${import.meta.env.BASE_URL}demo-data.json`).then((r) => r.json())
        demoRef.current = true
        apply(snap)
        setStatus('demo')
      } catch {
        setStatus('error')
      }
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // in-memory mutations for demo mode (no persistence)
  const demoCreate = (resource, body) => {
    const sheet = RESOURCE_SHEET[resource]
    const rows = dataRef.current[sheet] ?? []
    const id = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
    const rec = { ...body, id }
    apply({ ...dataRef.current, [sheet]: [...rows, rec] })
    return rec
  }
  const demoUpdate = (resource, id, body) => {
    const sheet = RESOURCE_SHEET[resource]
    const rows = dataRef.current[sheet] ?? []
    const rec = { ...rows.find((r) => Number(r.id) === Number(id)), ...body, id: Number(id) }
    apply({ ...dataRef.current, [sheet]: rows.map((r) => (Number(r.id) === Number(id) ? rec : r)) })
    return rec
  }
  const demoRemove = (resource, id) => {
    const sheet = RESOURCE_SHEET[resource]
    apply({ ...dataRef.current, [sheet]: (dataRef.current[sheet] ?? []).filter((r) => Number(r.id) !== Number(id)) })
    return { ok: true }
  }

  const create = useCallback(async (resource, body) => {
    if (demoRef.current) return demoCreate(resource, body)
    const r = await request('POST', `/api/${resource}`, body)
    await refresh()
    return r
  }, [refresh])

  const update = useCallback(async (resource, id, body) => {
    if (demoRef.current) return demoUpdate(resource, id, body)
    const r = await request('PUT', `/api/${resource}/${id}`, body)
    await refresh()
    return r
  }, [refresh])

  const remove = useCallback(async (resource, id) => {
    if (demoRef.current) return demoRemove(resource, id)
    const r = await request('DELETE', `/api/${resource}/${id}`)
    await refresh()
    return r
  }, [refresh])

  // switching workspace type clears the plant selection so stale ids don't leak across types
  const setPlantType = useCallback((t) => {
    setPlantTypeState(t)
    setPlantSel('all')
  }, [])

  const value = useMemo(() => {
    const d = data ?? {}
    const allPlants = d.Plants ?? []
    // scope the plant list to the active workspace's type (blank type = batching)
    const plants = plantType ? allPlants.filter((p) => (p.type || 'batching') === plantType) : allPlants
    const selectedPlantIds = plantSel === 'all'
      ? plants.map((p) => Number(p.id))
      : plantSel
    const inSelection = (row) => selectedPlantIds.includes(Number(row.plant_id))
    const byId = (rows) => Object.fromEntries((rows ?? []).map((r) => [Number(r.id), r]))
    return {
      loaded: !!data,
      status,
      demo: status === 'demo',
      refresh, create, update, remove,
      plants,
      allPlants,
      plantType, setPlantType,
      companies: d.Companies ?? [],
      grades: d.Grades ?? [],
      materials: d.Materials ?? [],
      sales: d.Sales ?? [],
      payments: d.Payments ?? [],
      pours: d.Pours ?? [],
      deliveries: d.Deliveries ?? [],
      materialTxns: d.MaterialTxns ?? [],
      expenses: d.Expenses ?? [],
      costing: d.Costing ?? [],
      expenseCategories: d.ExpenseCategories ?? [],
      machines: d.Machines ?? [],
      maintenance: d.MaintenanceRecords ?? [],
      workers: d.Workers ?? [],
      attendance: d.Attendance ?? [],
      projects: d.Projects ?? [],
      projectUpdates: d.ProjectUpdates ?? [],
      foundationGroups: d.FoundationGroups ?? [],
      piles: d.Piles ?? [],
      plantsById: byId(d.Plants),
      companiesById: byId(d.Companies),
      gradesById: byId(d.Grades),
      materialsById: byId(d.Materials),
      machinesById: byId(d.Machines),
      workersById: byId(d.Workers),
      projectsById: byId(d.Projects),
      plantSel, setPlantSel, selectedPlantIds, inSelection,
    }
  }, [data, status, plantSel, plantType, setPlantType, refresh, create, update, remove])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  return useContext(DataContext)
}
