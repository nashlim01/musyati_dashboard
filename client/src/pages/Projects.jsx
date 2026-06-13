import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, LabelList,
} from 'recharts'
import { useData } from '../lib/data.jsx'
import { num, saleTotal } from '../lib/calc.js'
import { fmtRM, fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete, KpiCard } from '../components/ui.jsx'

const TYPES = ['Bridge', 'Road', 'Drainage', 'Building', 'Maintenance', 'Earthworks', 'Other']
const STATUS = {
  planning: ['Planning', 'bg-blue-100 text-blue-700'],
  active: ['Active', 'bg-emerald-100 text-emerald-700'],
  on_hold: ['On Hold', 'bg-amber-100 text-amber-700'],
  completed: ['Completed', 'bg-neutral-200 text-neutral-600'],
}

const plantIdList = (p) => String(p.plant_ids ?? '').split(',').map((s) => Number(s.trim())).filter(Boolean)

// derive everything reportable about a project from its raw rows
function analyse(project, updates, today) {
  const mine = updates
    .filter((u) => Number(u.project_id) === Number(project.id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id)
  const progress = mine.length ? num(mine[mine.length - 1].progress_pct) : 0
  const value = num(project.contract_value_rm)
  const earned = value * progress / 100

  // schedule health: % of contract time elapsed vs % complete
  let elapsedPct = null, daysLeft = null, health = null
  if (project.start_date && project.target_end_date) {
    const start = new Date(`${project.start_date}T00:00:00`)
    const end = new Date(`${project.target_end_date}T00:00:00`)
    const now = new Date(`${today}T00:00:00`)
    const total = (end - start) / 86400000
    if (total > 0) {
      elapsedPct = Math.min(100, Math.max(0, ((now - start) / 86400000) / total * 100))
      daysLeft = Math.ceil((end - now) / 86400000)
      if (project.status === 'completed' || progress >= 100) health = 'done'
      else if (progress >= elapsedPct - 5) health = progress > elapsedPct + 5 ? 'ahead' : 'ontrack'
      else health = 'behind'
    }
  }
  return { project, updates: mine, progress, value, earned, elapsedPct, daysLeft, health }
}

const HEALTH = {
  ahead: ['Ahead', 'text-emerald-700 bg-emerald-50 border-emerald-200'],
  ontrack: ['On Track', 'text-blue-700 bg-blue-50 border-blue-200'],
  behind: ['Behind', 'text-red-700 bg-red-50 border-red-200'],
  done: ['Done', 'text-neutral-600 bg-neutral-100 border-neutral-200'],
}

export default function Projects() {
  const data = useData()
  const { projects, projectUpdates, pours, sales, expenses, plantsById, selectedPlantIds, plantSel } = data
  const [editing, setEditing] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const today = todayISO()

  // a project is in scope when any of its plants is selected (or it has no plants set)
  const inScope = useMemo(() => projects.filter((p) => {
    if (plantSel === 'all') return true
    const ids = plantIdList(p)
    return ids.length === 0 || ids.some((id) => selectedPlantIds.includes(id))
  }), [projects, plantSel, selectedPlantIds])

  const analysed = useMemo(
    () => inScope.map((p) => analyse(p, projectUpdates, today))
      .sort((a, b) => (a.project.status === 'completed') - (b.project.status === 'completed') || b.value - a.value),
    [inScope, projectUpdates, today])

  const kpi = useMemo(() => {
    const active = analysed.filter((a) => a.project.status === 'active')
    const value = analysed.reduce((s, a) => s + a.value, 0)
    const earned = analysed.reduce((s, a) => s + a.earned, 0)
    return {
      total: analysed.length,
      active: active.length,
      behind: analysed.filter((a) => a.health === 'behind').length,
      value, earned,
      weighted: value > 0 ? earned / value * 100 : 0,
    }
  }, [analysed])

  const selected = analysed.find((a) => Number(a.project.id) === Number(selectedId)) ?? analysed[0]

  // financial links: pours / sales / expenses tagged with this project
  const financials = useMemo(() => {
    if (!selected) return null
    const pid = Number(selected.project.id)
    const tagged = (rows) => rows.filter((r) => Number(r.project_id) === pid)
    const concreteM3 = tagged(pours).reduce((s, p) => s + num(p.volume_m3), 0)
    const salesRM = tagged(sales).reduce((s, x) => s + saleTotal(x), 0)
    const salesCount = tagged(sales).length
    const costsRM = tagged(expenses).reduce((s, e) => s + num(e.amount_rm), 0)
    return { concreteM3, salesRM, salesCount, costsRM, profit: selected.earned - costsRM }
  }, [selected, pours, sales, expenses])

  // S-curve: actual updates + straight planned line from start (0%) to target end (100%)
  const curve = useMemo(() => {
    if (!selected) return []
    const pts = new Map()
    const put = (date, key, val) => {
      if (!pts.has(date)) pts.set(date, { date })
      pts.get(date)[key] = val
    }
    for (const u of selected.updates) put(u.date, 'actual', num(u.progress_pct))
    const p = selected.project
    if (p.start_date && p.target_end_date) {
      put(p.start_date, 'planned', 0)
      put(p.target_end_date, 'planned', 100)
      put(p.start_date, 'actual', pts.get(p.start_date)?.actual ?? 0)
    }
    return [...pts.values()].sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, label: fmtDate(r.date) }))
  }, [selected])

  const portfolio = analysed.map((a) => ({
    name: a.project.code || a.project.name,
    progress: a.progress,
    fill: a.health === 'behind' ? '#dc2626' : a.health === 'done' ? '#9ca3af' : '#0f766e',
  }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Projects" value={kpi.total} sub={`${kpi.active} active`} />
        <KpiCard label="Portfolio Value" value={fmtRM(kpi.value)} sub="total contract sum" color="text-blue-800" />
        <KpiCard label="Earned Value" value={fmtRM(kpi.earned)} sub="value × progress" color="text-emerald-700" />
        <KpiCard label="Overall Progress" value={`${fmtNum(kpi.weighted, 1)}%`} sub="weighted by contract value" color="text-teal-700" />
        <KpiCard label="Behind Schedule" value={kpi.behind} sub="progress < time elapsed" color={kpi.behind > 0 ? 'text-red-700' : 'text-neutral-900'} />
        <div className="card p-4 flex items-center justify-center">
          <button className="btn-dark w-full" onClick={() => setEditing({
            code: '', name: '', type: 'Road', client: '', location: '',
            plant_ids: String(selectedPlantIds[0] ?? ''), contract_value_rm: '',
            start_date: today, target_end_date: '', status: 'active', remarks: '',
          })}>+ New Project</button>
        </div>
      </div>

      {/* project cards */}
      {analysed.length === 0 ? <div className="card"><Empty>No projects yet — create one to start tracking</Empty></div> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {analysed.map((a) => {
            const p = a.project
            const [statusLabel, statusCls] = STATUS[p.status] ?? [p.status, 'bg-neutral-200']
            const [healthLabel, healthCls] = HEALTH[a.health] ?? []
            const isSel = selected && Number(selected.project.id) === Number(p.id)
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`card p-4 text-left cursor-pointer transition-shadow hover:shadow-md ${isSel ? 'ring-2 ring-neutral-900' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <div className="mono text-[10px] text-neutral-400">{p.code} · {p.type}</div>
                    <div className="font-bold text-sm leading-tight">{p.name}</div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusCls}`}>{statusLabel}</span>
                </div>
                <div className="text-xs text-neutral-500 mb-3">
                  {p.client}{p.location ? ` · ${p.location}` : ''}
                  <span className="block text-[10px] mt-0.5">
                    {plantIdList(p).map((id) => plantsById[id]?.name).filter(Boolean).join(', ') || 'No plant assigned'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-base">{fmtNum(a.progress, 0)}%</span>
                  {healthLabel && <span className={`border rounded-full px-2 py-0.5 text-[10px] font-semibold ${healthCls}`}>{healthLabel}</span>}
                </div>
                <div className="h-2 rounded-full bg-neutral-100 overflow-hidden mb-3">
                  <div
                    className={`h-full rounded-full ${a.health === 'behind' ? 'bg-red-500' : 'bg-teal-600'}`}
                    style={{ width: `${Math.min(100, a.progress)}%` }}
                  />
                  {a.elapsedPct !== null}
                </div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500">
                  <span>{fmtRM(a.value)}</span>
                  <span>{a.daysLeft === null ? '' : a.daysLeft >= 0 ? `${a.daysLeft} days left` : `${-a.daysLeft} days overdue`}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && financials && (
        <div className="card p-4">
          <div className="label mb-3">Project Financials — {selected.project.code || selected.project.name} <span className="normal-case font-normal text-neutral-400">(from records tagged with this project)</span></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Earned Value</div>
              <div className="text-lg font-extrabold text-blue-800">{fmtRM(selected.earned)}</div>
              <div className="text-[10px] text-neutral-400">contract × {fmtNum(selected.progress, 0)}%</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Concrete Supplied</div>
              <div className="text-lg font-extrabold text-teal-700">{fmtNum(financials.concreteM3, 1)} m³</div>
              <div className="text-[10px] text-neutral-400">tagged pours</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Concrete Sales</div>
              <div className="text-lg font-extrabold text-emerald-700">{fmtRM(financials.salesRM)}</div>
              <div className="text-[10px] text-neutral-400">{financials.salesCount} tagged sale(s)</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Tagged Costs</div>
              <div className="text-lg font-extrabold text-red-700">{fmtRM(financials.costsRM)}</div>
              <div className="text-[10px] text-neutral-400">from Cost Log</div>
            </div>
            <div>
              <div className="text-[11px] text-neutral-400 uppercase tracking-wide">Est. Profit</div>
              <div className={`text-lg font-extrabold ${financials.profit < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtRM(financials.profit)}</div>
              <div className="text-[10px] text-neutral-400">earned − tagged costs</div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="grid xl:grid-cols-2 gap-5">
          <SectionCard
            title={`Progress Curve — ${selected.project.name}`}
            right={selected.elapsedPct !== null &&
              <span className="mono text-xs text-neutral-400">time elapsed {fmtNum(selected.elapsedPct, 0)}% · progress {fmtNum(selected.progress, 0)}%</span>}
          >
            {curve.length < 2 ? <Empty>Not enough updates to chart yet</Empty> : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={curve} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v, name) => [`${fmtNum(v, 1)}%`, name === 'actual' ? 'Actual progress' : 'Planned (linear)']} />
                  <Line type="monotone" dataKey="planned" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                  <Line type="monotone" dataKey="actual" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button className="btn" onClick={() => setEditing({ ...selected.project })}>Edit Project</button>
              <ConfirmDelete label="Delete" onConfirm={() => data.remove('projects', selected.project.id).catch((e) => alert(e.message))} />
              <div className="flex-1" />
              <button className="btn-dark" onClick={() => setUpdating({
                project_id: selected.project.id, date: today,
                progress_pct: selected.progress, description: '', plant_id: '', remarks: '',
              })}>+ Update Progress</button>
            </div>
          </SectionCard>

          <SectionCard title="Update History" right={<span className="mono text-xs text-neutral-400">{selected.updates.length} updates</span>}>
            {selected.updates.length === 0 ? <Empty>No updates yet</Empty> : (
              <div className="table-scroll" style={{ maxHeight: 300 }}>
                <table className="w-full">
                  <thead>
                    <tr>{['Date', 'Progress', 'Work Done', 'Plant', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {[...selected.updates].reverse().map((u, i, arr) => {
                      const prev = arr[i + 1]
                      const delta = num(u.progress_pct) - (prev ? num(prev.progress_pct) : 0)
                      return (
                        <tr key={u.id} className="hover:bg-neutral-50">
                          <td className="td whitespace-nowrap">{fmtDate(u.date)}</td>
                          <td className="td whitespace-nowrap">
                            <span className="font-bold">{fmtNum(u.progress_pct, 0)}%</span>
                            {delta !== 0 && <span className={`ml-1.5 text-[10px] ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{delta > 0 ? '+' : ''}{fmtNum(delta, 0)}</span>}
                          </td>
                          <td className="td text-xs text-neutral-600">{u.description}</td>
                          <td className="td text-[10px] text-neutral-400">{plantsById[u.plant_id]?.name ?? ''}</td>
                          <td className="td whitespace-nowrap">
                            <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setUpdating({ ...u })}>Edit</button>
                            <ConfirmDelete onConfirm={() => data.remove('project-updates', u.id)} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {selected && /bridge/i.test(selected.project.type) && (
        <FoundationBoard project={selected.project} />
      )}

      {portfolio.length > 1 && (
        <SectionCard title="Portfolio Progress (%)">
          <ResponsiveContainer width="100%" height={Math.max(160, portfolio.length * 44)}>
            <BarChart data={portfolio} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v) => `${fmtNum(v, 0)}%`} />
              <Bar dataKey="progress" radius={[0, 4, 4, 0]}>
                {portfolio.map((p, i) => <Cell key={i} fill={p.fill} />)}
                <LabelList dataKey="progress" position="right" formatter={(v) => `${fmtNum(v, 0)}%`} style={{ fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {editing && <ProjectModal form={editing} onClose={() => setEditing(null)} onSaved={setSelectedId} />}
      {updating && <UpdateModal form={updating} onClose={() => setUpdating(null)} />}
    </div>
  )
}

function ProjectModal({ form, onClose, onSaved }) {
  const { plants, create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const selectedPlants = plantIdList(f)

  const togglePlant = (id) => {
    const next = selectedPlants.includes(id)
      ? selectedPlants.filter((x) => x !== id)
      : [...selectedPlants, id]
    setF({ ...f, plant_ids: next.join(',') })
  }

  const save = async () => {
    try {
      const body = { ...f, contract_value_rm: Number(f.contract_value_rm) || 0 }
      const saved = isEdit ? await update('projects', f.id, body) : await create('projects', body)
      onSaved?.(saved.id)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? `Edit ${f.code || f.name}` : 'New Project'} onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Code"><input className="input w-full mono" value={f.code} onChange={set('code')} placeholder="PRJ-003" /></Field>
        <Field label="Name" span2><input className="input w-full" value={f.name} onChange={set('name')} placeholder="Kampung XYZ Drain Upgrading" /></Field>
        <Field label="Type">
          <select className="input w-full" value={f.type} onChange={set('type')}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Client"><input className="input w-full" value={f.client} onChange={set('client')} placeholder="JKR / PWD / private" /></Field>
        <Field label="Location"><input className="input w-full" value={f.location} onChange={set('location')} /></Field>
        <Field label="Contract Value (RM)"><input type="number" step="0.01" className="input w-full" value={f.contract_value_rm} onChange={set('contract_value_rm')} /></Field>
        <Field label="Start Date"><input type="date" className="input w-full" value={f.start_date} onChange={set('start_date')} /></Field>
        <Field label="Target Completion"><input type="date" className="input w-full" value={f.target_end_date} onChange={set('target_end_date')} /></Field>
        <Field label="Status">
          <select className="input w-full" value={f.status} onChange={set('status')}>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <Field label="Plants involved" span2>
          <div className="flex flex-wrap gap-3 border border-neutral-300 rounded-md px-3 py-2">
            {plants.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={selectedPlants.includes(Number(p.id))} onChange={() => togglePlant(Number(p.id))} />
                {p.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Remarks" span2><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Create Project'}</button>
      </div>
    </Modal>
  )
}

function UpdateModal({ form, onClose }) {
  const { plants, create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      const body = { ...f, progress_pct: Number(f.progress_pct) }
      if (isEdit) await update('project-updates', f.id, body)
      else await create('project-updates', body)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Progress Update' : 'Update Progress'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Total Progress (%)">
          <div className="flex items-center gap-3">
            <input
              type="range" min="0" max="100" step="1" className="flex-1 accent-teal-700"
              value={f.progress_pct} onChange={set('progress_pct')}
            />
            <input
              type="number" min="0" max="100" step="1" className="input w-20 text-right"
              value={f.progress_pct} onChange={set('progress_pct')}
            />
          </div>
        </Field>
        <Field label="Work Done" span2><input className="input w-full" value={f.description} onChange={set('description')} placeholder="e.g. deck slab cast, culvert installed…" /></Field>
        <Field label="Plant (optional)">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            <option value="">—</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Save Update'}</button>
      </div>
    </Modal>
  )
}

// ===========================================================================
// Bridge Foundation board — bore-pile status per abutment/pier (see status map)
// ===========================================================================
const PILE_STATUS = {
  not_done: ['Not Done', '#64748b', 'bg-slate-100 text-slate-700'],
  in_progress: ['In Progress', '#d97706', 'bg-amber-100 text-amber-700'],
  done: ['Done', '#16a34a', 'bg-emerald-100 text-emerald-700'],
}

function FoundationBoard({ project }) {
  const { foundationGroups, piles, create, remove } = useData()
  const [editingPile, setEditingPile] = useState(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => foundationGroups
    .filter((g) => Number(g.project_id) === Number(project.id))
    .sort((a, b) => num(a.sort_order) - num(b.sort_order) || a.id - b.id),
  [foundationGroups, project.id])

  const pilesByGroup = useMemo(() => {
    const m = new Map()
    for (const p of piles) {
      if (!m.has(Number(p.group_id))) m.set(Number(p.group_id), [])
      m.get(Number(p.group_id)).push(p)
    }
    for (const arr of m.values()) arr.sort((a, b) => (num(a.label) - num(b.label)) || a.id - b.id)
    return m
  }, [piles])

  const groupPiles = (gid) => pilesByGroup.get(Number(gid)) ?? []
  const doneCount = (arr) => arr.filter((p) => p.status === 'done').length

  // summary by diameter + overall
  const summary = useMemo(() => {
    const byDia = new Map()
    let total = 0, done = 0
    for (const g of groups) {
      const arr = groupPiles(g.id)
      const dia = g.diameter_mm || '—'
      if (!byDia.has(dia)) byDia.set(dia, { dia, total: 0, done: 0 })
      const s = byDia.get(dia)
      s.total += arr.length; s.done += doneCount(arr)
      total += arr.length; done += doneCount(arr)
    }
    return { byDia: [...byDia.values()].sort((a, b) => a.dia - b.dia), total, done, pct: total ? (done / total) * 100 : 0 }
  }, [groups, pilesByGroup])

  const addGroup = async ({ name, diameter_mm, count }) => {
    setBusy(true)
    try {
      const g = await create('foundation-groups', {
        project_id: project.id, name, diameter_mm: Number(diameter_mm) || '',
        sort_order: groups.length + 1, remarks: '',
      })
      for (let i = 1; i <= (Number(count) || 0); i++) {
        await create('piles', { group_id: g.id, label: String(i), status: 'not_done', is_test_pile: 0, done_date: '', remarks: '' })
      }
      setAddingGroup(false)
    } finally { setBusy(false) }
  }

  const deleteGroup = async (g) => {
    if (!window.confirm(`Delete ${g.name} and its piles?`)) return
    for (const p of groupPiles(g.id)) await remove('piles', p.id)
    await remove('foundation-groups', g.id)
  }

  const addPile = async (g) => {
    const next = groupPiles(g.id).length + 1
    await create('piles', { group_id: g.id, label: String(next), status: 'not_done', is_test_pile: 0, done_date: '', remarks: '' })
  }

  return (
    <SectionCard
      title={`Bridge Foundation — ${project.name}`}
      right={
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-teal-700">{summary.done}/{summary.total} piles · {fmtNum(summary.pct, 0)}%</span>
          <button className="btn !py-1" onClick={() => setAddingGroup(true)}>+ Add Group</button>
        </div>
      }
    >
      {groups.length === 0 ? <Empty>No foundation groups yet — add an abutment or pier to start tracking piles.</Empty> : (
        <div className="overflow-x-auto">
          <div className="flex gap-6 pb-2 min-w-fit">
            {groups.map((g) => {
              const arr = groupPiles(g.id)
              return (
                <div key={g.id} className="shrink-0">
                  <div className="text-center mb-2">
                    <div className="font-bold text-sm flex items-center justify-center gap-1.5">
                      {g.name}
                      <button className="text-neutral-300 hover:text-red-500 text-xs cursor-pointer" title="Delete group" onClick={() => deleteGroup(g)}>×</button>
                    </div>
                    <div className="text-[11px] text-neutral-400">Ø{g.diameter_mm}mm · {doneCount(arr)}/{arr.length}</div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    {arr.map((p) => {
                      const [, color] = PILE_STATUS[p.status] ?? PILE_STATUS.not_done
                      return (
                        <button
                          key={p.id}
                          onClick={() => setEditingPile(p)}
                          title={`Pile ${p.label} — ${PILE_STATUS[p.status]?.[0] ?? p.status}`}
                          className="w-9 h-9 rounded-full text-[10px] font-bold text-white flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-neutral-400 relative"
                          style={{ background: color }}
                        >
                          {Number(p.is_test_pile) === 1
                            ? <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 text-white text-[8px] flex items-center justify-center border border-white">R</span>
                            : null}
                          {p.label}
                        </button>
                      )
                    })}
                    <button className="text-[11px] text-neutral-400 hover:text-neutral-700 cursor-pointer mt-1" onClick={() => addPile(g)}>+ pile</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* legend + diameter summary */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-neutral-100 text-xs">
        {Object.entries(PILE_STATUS).map(([k, [label, color]]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: color }} />{label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-600 text-white text-[7px] flex items-center justify-center">R</span>Nominated Test Pile</span>
        <div className="flex-1" />
        {summary.byDia.map((s) => (
          <span key={s.dia} className="mono text-neutral-500">{s.dia}mm {s.done}/{s.total}</span>
        ))}
      </div>

      {busy && <div className="text-xs text-neutral-400 mt-2">Saving…</div>}
      {editingPile && <PileModal pile={editingPile} onClose={() => setEditingPile(null)} />}
      {addingGroup && <GroupModal onSave={addGroup} onClose={() => setAddingGroup(false)} />}
    </SectionCard>
  )
}

function PileModal({ pile, onClose }) {
  const { update, remove } = useData()
  const [f, setF] = useState({ ...pile })
  const [error, setError] = useState('')
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    try {
      await update('piles', f.id, {
        status: f.status,
        is_test_pile: Number(f.is_test_pile) ? 1 : 0,
        done_date: f.status === 'done' ? (f.done_date || todayISO()) : '',
        remarks: f.remarks,
      })
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={`Pile ${pile.label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <span className="label block mb-1">Status</span>
          <div className="flex gap-2">
            {Object.entries(PILE_STATUS).map(([k, [label, color]]) => (
              <button key={k} onClick={() => set('status', k)}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium cursor-pointer border ${f.status === k ? 'text-white border-transparent' : 'bg-white text-neutral-600 border-neutral-300'}`}
                style={f.status === k ? { background: color } : undefined}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={Number(f.is_test_pile) === 1} onChange={(e) => set('is_test_pile', e.target.checked ? 1 : 0)} />
          Nominated Test Pile (MLT)
        </label>
        {f.status === 'done' && (
          <Field label="Date completed"><input type="date" className="input w-full" value={f.done_date || todayISO()} onChange={(e) => set('done_date', e.target.value)} /></Field>
        )}
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="e.g. pending MLT, depth 24m…" /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex items-center gap-2 mt-4">
        <ConfirmDelete onConfirm={() => { remove('piles', f.id); onClose() }} />
        <div className="flex-1" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>Save</button>
      </div>
    </Modal>
  )
}

function GroupModal({ onSave, onClose }) {
  const [f, setF] = useState({ name: '', diameter_mm: 600, count: 14 })
  const [error, setError] = useState('')
  const save = () => {
    if (!f.name.trim()) return setError('Enter a name (e.g. Pier 4)')
    onSave({ ...f, name: f.name.trim() }).catch((e) => setError(e.message))
  }
  return (
    <Modal title="Add Foundation Group" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" span2><input className="input w-full" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Abutment B / Pier 4" /></Field>
        <Field label="Pile Diameter (mm)">
          <select className="input w-full" value={f.diameter_mm} onChange={(e) => setF({ ...f, diameter_mm: e.target.value })}>
            {[600, 750, 1000].map((d) => <option key={d} value={d}>{d}mm</option>)}
          </select>
        </Field>
        <Field label="Number of Piles"><input type="number" min="1" className="input w-full" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>Create Group</button>
      </div>
    </Modal>
  )
}
