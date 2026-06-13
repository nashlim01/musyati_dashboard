import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, monthOf, deliveryIncome, materialBalance } from '../lib/calc.js'
import { fmtNum, fmtRM, fmtDate, fmtMonth, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete } from '../components/ui.jsx'

export default function PourRecords() {
  const data = useData()
  const { pours, grades, gradesById, plantsById, inSelection, selectedPlantIds, create, update, remove } = data
  const singlePlant = selectedPlantIds.length === 1 ? selectedPlantIds[0] : null
  const [month, setMonth] = useState(() => monthOf(todayISO()))
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [subTab, setSubTab] = useState('production') // production | delivery

  const myPours = useMemo(() => pours.filter(inSelection), [pours, inSelection])
  const monthPours = useMemo(
    () => myPours.filter((p) => monthOf(p.date) === month),
    [myPours, month])

  // full month grid: every day × every grade, exactly like the Excel sheet
  const matrix = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const days = new Date(y, m, 0).getDate()
    const dates = Array.from({ length: days }, (_, i) =>
      `${month}-${String(i + 1).padStart(2, '0')}`)
    const cell = new Map() // `${date}|${gradeId}` -> volume
    for (const p of monthPours) {
      const k = `${p.date}|${Number(p.grade_id)}`
      cell.set(k, (cell.get(k) ?? 0) + num(p.volume_m3))
    }
    const totals = {}
    let grand = 0
    for (const g of grades) {
      totals[g.id] = monthPours
        .filter((p) => Number(p.grade_id) === Number(g.id))
        .reduce((s, p) => s + num(p.volume_m3), 0)
      grand += totals[g.id]
    }
    return { dates, cell, totals, grand }
  }, [monthPours, grades, month])

  // type straight into a cell: empty clears the day's pours for that grade,
  // a number replaces them with a single pour row
  const setCell = async (date, gradeId, raw) => {
    try {
      setError('')
      const existing = monthPours.filter(
        (p) => p.date === date && Number(p.grade_id) === Number(gradeId))
      if (raw === '') {
        for (const p of existing) await remove('pours', p.id)
        return
      }
      const volume = Number(raw)
      if (!Number.isFinite(volume) || volume < 0) return setError('Volume must be a positive number')
      if (existing.length === 1) {
        await update('pours', existing[0].id, { volume_m3: volume })
      } else {
        for (const p of existing) await remove('pours', p.id)
        await create('pours', { plant_id: singlePlant, date, grade_id: gradeId, volume_m3: volume, remarks: '' })
      }
    } catch (e) { setError(e.message) }
  }

  const sorted = useMemo(
    () => [...monthPours].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id),
    [monthPours])

  return (
    <div className="space-y-5">
      {/* sub-tabs */}
      <div className="flex items-center gap-1 bg-neutral-200/60 rounded-lg p-1 w-fit">
        {[['production', 'Production'], ['delivery', 'Internal Delivery']].map(([key, name]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`px-4 py-1.5 text-sm rounded-md cursor-pointer ${subTab === key ? 'bg-white font-semibold shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>
            {name}
          </button>
        ))}
      </div>

      {subTab === 'delivery' && <InternalDelivery />}

      {subTab === 'production' && <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month" className="input"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
        {singlePlant === null && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
            Viewing combined volumes — select a single plant to type into the table.
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
        <div className="flex-1" />
        <button className="btn-dark" onClick={() => setEditing({
          plant_id: selectedPlantIds[0], project_id: '', date: todayISO(), grade_id: '', volume_m3: '', remarks: '',
        })}>+ Add Entry</button>
      </div>

      <SectionCard
        title={`Concrete Production — ${fmtMonth(month)} (m³)`}
        right={<span className="mono text-xs text-neutral-400">Total {fmtNum(matrix.grand, 1)} m³</span>}
      >
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="th">Date</th>
                {grades.map((g) => <th key={g.id} className="th text-right">{g.name}</th>)}
                <th className="th text-right">Day Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.dates.map((date) => {
                let dayTotal = 0
                for (const g of grades) dayTotal += matrix.cell.get(`${date}|${g.id}`) ?? 0
                return (
                  <tr key={date} className="hover:bg-neutral-50">
                    <td className="td whitespace-nowrap">{fmtDate(date)}</td>
                    {grades.map((g) => {
                      const v = matrix.cell.get(`${date}|${g.id}`)
                      return singlePlant !== null ? (
                        <td key={g.id} className="td !p-0.5 text-right">
                          <input
                            type="number" step="0.5" min="0"
                            key={`${date}-${g.id}-${v ?? ''}`}
                            defaultValue={v ?? ''}
                            className="w-full min-w-[60px] px-2 py-1 text-right text-sm rounded border border-transparent
                              hover:border-neutral-200 focus:border-neutral-400 focus:outline-none bg-transparent"
                            onBlur={(e) => {
                              const raw = e.target.value.trim()
                              if (raw === String(v ?? '')) return
                              setCell(date, g.id, raw)
                            }}
                          />
                        </td>
                      ) : (
                        <td key={g.id} className="td text-right">{v ? fmtNum(v, 1) : ''}</td>
                      )
                    })}
                    <td className="td text-right font-semibold">{dayTotal ? fmtNum(dayTotal, 1) : ''}</td>
                  </tr>
                )
              })}
              <tr className="bg-neutral-100 font-bold sticky bottom-0">
                <td className="td">TOTAL</td>
                {grades.map((g) => (
                  <td key={g.id} className="td text-right">{matrix.totals[g.id] ? fmtNum(matrix.totals[g.id], 1) : ''}</td>
                ))}
                <td className="td text-right">{fmtNum(matrix.grand, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Production Entries"
        right={<span className="mono text-xs text-neutral-400">{sorted.length} records</span>}
      >
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>
              {['Date', 'Plant', 'Grade', 'Volume (m³)', 'Remarks', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50">
                <td className="td whitespace-nowrap">{fmtDate(p.date)}</td>
                <td className="td text-xs text-neutral-500">{plantsById[p.plant_id]?.name}</td>
                <td className="td font-medium">{gradesById[p.grade_id]?.name ?? '?'}</td>
                <td className="td text-right">{fmtNum(p.volume_m3, 1)}</td>
                <td className="td text-xs text-neutral-500">{p.remarks}</td>
                <td className="td whitespace-nowrap">
                  <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditing({ ...p })}>Edit</button>
                  <ConfirmDelete onConfirm={() => data.remove('pours', p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {sorted.length === 0 && <Empty>No production this month</Empty>}
      </SectionCard>
      </>}

      {editing && <PourModal form={editing} onClose={() => setEditing(null)} onSaved={(date) => setMonth(monthOf(date))} />}
    </div>
  )
}

// modal entry kept for remarks and multi-grade input on one date
function PourModal({ form, onClose, onSaved }) {
  const { plants, projects, grades, create, update } = useData()
  const [f, setF] = useState(form)
  // add mode: one volume box per grade so a whole day goes in at once
  const [volumes, setVolumes] = useState({})
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      if (isEdit) {
        await update('pours', f.id, { ...f, volume_m3: Number(f.volume_m3) })
      } else {
        const entries = Object.entries(volumes).filter(([, v]) => v !== '' && Number(v) > 0)
        if (entries.length === 0) return setError('Enter a volume for at least one grade')
        for (const [gradeId, v] of entries) {
          await create('pours', { plant_id: f.plant_id, project_id: f.project_id ?? '', date: f.date, grade_id: Number(gradeId), volume_m3: Number(v), remarks: f.remarks })
        }
      }
      onSaved?.(f.date)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Entry' : 'Add Production Entry'} onClose={onClose} wide={!isEdit}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plant">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Project (optional)" span2>
          <select className="input w-full" value={f.project_id ?? ''} onChange={set('project_id')}>
            <option value="">— general production —</option>
            {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.code ? `${pr.code} — ` : ''}{pr.name}</option>)}
          </select>
        </Field>
        {isEdit ? (
          <>
            <Field label="Grade">
              <select className="input w-full" value={f.grade_id} onChange={set('grade_id')}>
                <option value="">— select —</option>
                {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Volume (m³)"><input type="number" step="0.5" className="input w-full" value={f.volume_m3} onChange={set('volume_m3')} /></Field>
          </>
        ) : (
          <div className="col-span-2">
            <div className="label mb-2">Volume per grade (m³) — fill any that apply</div>
            <div className="grid grid-cols-5 gap-2">
              {grades.map((g) => (
                <Field key={g.id} label={g.name}>
                  <input
                    type="number" step="0.5" min="0" className="input w-full"
                    value={volumes[g.id] ?? ''}
                    onChange={(e) => setVolumes({ ...volumes, [g.id]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
        <Field label="Remarks" span2><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Entry'}</button>
      </div>
    </Modal>
  )
}

// ===========================================================================
// Internal Delivery — transfer concrete to a sister plant (transport income),
// which also moves cement stock from source to destination.
// ===========================================================================
function InternalDelivery() {
  const data = useData()
  const { deliveries, materials, materialTxns, plants, plantsById, gradesById, selectedPlantIds } = data
  const [editing, setEditing] = useState(null)

  // a delivery is in scope if either end is in the plant selection
  const myDeliveries = useMemo(() => deliveries
    .filter((d) => selectedPlantIds.includes(Number(d.from_plant_id)) || selectedPlantIds.includes(Number(d.to_plant_id)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id),
  [deliveries, selectedPlantIds])

  const totalIncome = useMemo(() => myDeliveries.reduce((s, d) => s + deliveryIncome(d), 0), [myDeliveries])

  // cement storage mirror: materials moved by deliveries (fallback PLC), balance per plant
  const cementMaterials = useMemo(() => {
    const used = new Set(deliveries.map((d) => Number(d.cement_material_id)).filter(Boolean))
    const list = materials.filter((m) => used.has(Number(m.id)))
    return list.length ? list : materials.filter((m) => m.name === 'PLC')
  }, [deliveries, materials])

  if (plants.length < 2) {
    return <div className="card p-6 text-sm text-neutral-500">
      Internal delivery needs at least two plants. Add another plant (⚙ Plants in the header) to transfer concrete between them.
    </div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button className="btn-dark" onClick={() => setEditing({
          date: todayISO(), from_plant_id: selectedPlantIds[0] ?? plants[0].id, to_plant_id: '',
          do_no: '', grade_id: '', volume_m3: '', trips: 1, trip_rate_rm: '',
          cement_material_id: cementMaterials[0]?.id ?? '', cement_qty: '', remarks: '',
        })}>+ Add Delivery</button>
      </div>

      <SectionCard
        title="Internal Concrete Deliveries"
        right={<span className="mono text-xs text-neutral-400">Transport income {fmtRM(totalIncome)} · {myDeliveries.length} records</span>}
      >
        <div className="table-scroll">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr>{['Date', 'DO No.', 'Grade', 'Vol (m³)', 'From', 'To', 'Trips', 'Trip Rate', 'Transport (RM)', 'Cement Moved', 'Actions'].map((h, i) => (
                <th key={h} className={`th ${[3, 6, 7, 8, 9].includes(i) ? 'text-right' : ''}`}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {myDeliveries.map((d) => (
                <tr key={d.id} className="hover:bg-neutral-50">
                  <td className="td whitespace-nowrap">{fmtDate(d.date)}</td>
                  <td className="td mono text-xs">{d.do_no}</td>
                  <td className="td">{gradesById[d.grade_id]?.name ?? '?'}</td>
                  <td className="td text-right">{fmtNum(d.volume_m3, 1)}</td>
                  <td className="td text-xs">{plantsById[d.from_plant_id]?.name}</td>
                  <td className="td text-xs">{plantsById[d.to_plant_id]?.name}</td>
                  <td className="td text-right">{fmtNum(d.trips)}</td>
                  <td className="td text-right">{fmtRM(d.trip_rate_rm)}</td>
                  <td className="td text-right font-bold text-emerald-700">{fmtRM(deliveryIncome(d))}</td>
                  <td className="td text-right text-xs">{d.cement_qty ? `${fmtNum(d.cement_qty)} ${materials.find((m) => Number(m.id) === Number(d.cement_material_id))?.unit ?? ''}` : '—'}</td>
                  <td className="td whitespace-nowrap">
                    <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditing({ ...d })}>Edit</button>
                    <ConfirmDelete onConfirm={() => data.remove('deliveries', d.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {myDeliveries.length === 0 && <Empty>No internal deliveries yet</Empty>}
        </div>
      </SectionCard>

      <SectionCard title="Cement Storage by Plant (live)">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Plant</th>
              {cementMaterials.map((m) => <th key={m.id} className="th text-right">{m.name} ({m.unit})</th>)}
            </tr>
          </thead>
          <tbody>
            {plants.map((p) => (
              <tr key={p.id} className="hover:bg-neutral-50">
                <td className="td font-medium">{p.name}</td>
                {cementMaterials.map((m) => {
                  const bal = materialBalance(m, materialTxns.filter((t) => Number(t.plant_id) === Number(p.id)), deliveries, [Number(p.id)])
                  return <td key={m.id} className={`td text-right ${bal < 0 ? 'text-red-600' : ''}`}>{fmtNum(bal)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-1 py-2 text-[11px] text-neutral-400">Each delivery moves the entered cement quantity from the source plant to the destination.</div>
      </SectionCard>

      {editing && <DeliveryModal form={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function DeliveryModal({ form, onClose }) {
  const { plants, plantsById, grades, materials, create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const income = num(f.trips) * num(f.trip_rate_rm)

  const save = async () => {
    try {
      if (Number(f.from_plant_id) === Number(f.to_plant_id)) return setError('From and To plant must differ')
      const body = {
        ...f, volume_m3: Number(f.volume_m3), trips: Number(f.trips) || 0,
        trip_rate_rm: Number(f.trip_rate_rm) || 0, cement_qty: Number(f.cement_qty) || 0,
      }
      if (isEdit) await update('deliveries', f.id, body)
      else await create('deliveries', body)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Delivery' : 'Add Internal Delivery'} onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="DO No."><input className="input w-full mono" value={f.do_no} onChange={set('do_no')} /></Field>
        <Field label="Grade">
          <select className="input w-full" value={f.grade_id} onChange={set('grade_id')}>
            <option value="">— select —</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="From Plant">
          <select className="input w-full" value={f.from_plant_id} onChange={set('from_plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="To Plant">
          <select className="input w-full" value={f.to_plant_id}
            onChange={(e) => {
              const dest = plantsById[e.target.value]
              setF({ ...f, to_plant_id: e.target.value, trip_rate_rm: f.trip_rate_rm || dest?.trip_rate_rm || '' })
            }}>
            <option value="">— select —</option>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Volume (m³)"><input type="number" step="0.5" className="input w-full" value={f.volume_m3} onChange={set('volume_m3')} /></Field>
        <Field label="Trips"><input type="number" step="1" className="input w-full" value={f.trips} onChange={set('trips')} /></Field>
        <Field label="Trip Rate (RM)"><input type="number" step="0.01" className="input w-full" value={f.trip_rate_rm} onChange={set('trip_rate_rm')} /></Field>
        <Field label="Transport Income"><input className="input w-full bg-neutral-50" value={fmtRM(income)} readOnly /></Field>
        <Field label="Cement Material">
          <select className="input w-full" value={f.cement_material_id} onChange={set('cement_material_id')}>
            <option value="">— none —</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Cement Qty Moved"><input type="number" step="0.01" className="input w-full" value={f.cement_qty} onChange={set('cement_qty')} /></Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Delivery'}</button>
      </div>
    </Modal>
  )
}
