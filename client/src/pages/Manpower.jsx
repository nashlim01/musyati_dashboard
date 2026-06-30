import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, monthOf, activeMonths } from '../lib/calc.js'
import { fmtRM, fmtNum, fmtDate, fmtMonth, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete, KpiCard, ExportButtons } from '../components/ui.jsx'

// Manpower lives as one tab inside Batching Plant, with its own sub-tabs.
export default function Manpower() {
  const tabs = [
    ['summary', 'Summary', ManpowerSummary],
    ['attendance', 'Attendance', ManpowerAttendance],
    ['daily-ot', 'Daily OT', ManpowerDailyOT],
    ['monthly-ot', 'Monthly OT', ManpowerMonthlyOT],
  ]
  const [sub, setSub] = useState('summary')
  const Page = tabs.find(([k]) => k === sub)?.[2] ?? ManpowerSummary
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 bg-neutral-200/60 rounded-lg p-1 w-fit">
        {tabs.map(([key, name]) => (
          <button key={key} onClick={() => setSub(key)}
            className={`px-4 py-1.5 text-sm rounded-md cursor-pointer ${sub === key ? 'bg-white font-semibold shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>
            {name}
          </button>
        ))}
      </div>
      <Page />
    </div>
  )
}

// A standard working day is 8 hours — used to express attendance (days) as hours.
// Change this if the operation uses a different shift length.
const STANDARD_DAY_HOURS = 8

const ATT_STATUS = {
  present: ['Present', 'bg-emerald-100 text-emerald-700', 1],
  half_day: ['Half Day', 'bg-amber-100 text-amber-700', 0.5],
  absent: ['Absent', 'bg-red-100 text-red-700', 0],
}

// Shared plant-scoped manpower data + a month selector persisted across sub-tabs.
function useManpower() {
  const data = useData()
  const { workers, attendance, inSelection } = data
  const myWorkers = useMemo(() => workers.filter(inSelection), [workers, inSelection])
  const myAttendance = useMemo(() => {
    const ids = new Set(myWorkers.map((w) => Number(w.id)))
    return attendance.filter((a) => ids.has(Number(a.worker_id)))
  }, [attendance, myWorkers])
  const months = useMemo(() => activeMonths({ expenses: myAttendance }), [myAttendance])
  return { ...data, myWorkers, myAttendance, months }
}

function useMonthState(months) {
  const [month, setMonth] = useState(() => {
    try { const s = localStorage.getItem('mt.mpMonth'); if (s) return JSON.parse(s) } catch { /* ignore */ }
    return months[months.length - 1] ?? monthOf(todayISO())
  })
  const set = (m) => { setMonth(m); try { localStorage.setItem('mt.mpMonth', JSON.stringify(m)) } catch { /* ignore */ } }
  return [month, set]
}

function MonthPicker({ month, months, onChange }) {
  return (
    <select className="input" value={month} onChange={(e) => onChange(e.target.value)}>
      {!months.includes(month) && <option value={month}>{fmtMonth(month)}</option>}
      {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
    </select>
  )
}

// per-worker monthly rollup: days = present(1) + half(0.5); hours = days × standard day
function monthSummary(workers, monthAtt) {
  return workers.map((w) => {
    const rows = monthAtt.filter((a) => Number(a.worker_id) === Number(w.id))
    const days = rows.reduce((s, a) => s + (ATT_STATUS[a.status]?.[2] ?? 0), 0)
    const absent = rows.filter((a) => a.status === 'absent').length
    const ot = rows.reduce((s, a) => s + num(a.ot_hours), 0)
    return { worker: w, days, hours: days * STANDARD_DAY_HOURS, absent, ot, wages: days * num(w.daily_rate_rm) }
  })
}

// ===========================================================================
// Summary — KPIs + per-worker monthly rollup (Working Hrs → OT → Absent)
// ===========================================================================
export function ManpowerSummary() {
  const { myWorkers, myAttendance, months, plantsById } = useManpower()
  const [month, setMonth] = useMonthState(months)
  const [editingWorker, setEditingWorker] = useState(null)

  const monthAtt = useMemo(() => myAttendance.filter((a) => monthOf(a.date) === month), [myAttendance, month])
  const summary = useMemo(() => monthSummary(myWorkers, monthAtt), [myWorkers, monthAtt])

  const kpi = useMemo(() => ({
    total: myWorkers.length,
    active: myWorkers.filter((w) => w.status !== 'inactive').length,
    hours: summary.reduce((s, r) => s + r.hours, 0),
    ot: summary.reduce((s, r) => s + r.ot, 0),
    wages: summary.reduce((s, r) => s + r.wages, 0),
  }), [myWorkers, summary])

  const exportCols = [
    { header: 'Worker', value: (r) => r.worker.name },
    { header: 'Role', value: (r) => r.worker.role },
    { header: 'Plant', value: (r) => plantsById[r.worker.plant_id]?.name ?? '' },
    { header: 'Daily Rate (RM)', align: 'right', value: (r) => num(r.worker.daily_rate_rm), text: (r) => fmtRM(r.worker.daily_rate_rm) },
    { header: 'Total Working Hrs', align: 'right', value: (r) => r.hours, text: (r) => fmtNum(r.hours, 1) },
    { header: 'OT Hours', align: 'right', value: (r) => r.ot, text: (r) => fmtNum(r.ot, 1) },
    { header: 'Absent Days', align: 'right', value: (r) => r.absent },
    { header: 'Est. Wages (RM)', align: 'right', value: (r) => r.wages, text: (r) => fmtRM(r.wages) },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Workers" value={kpi.total} sub="registered" />
        <KpiCard label="Active" value={kpi.active} sub="on payroll" color="text-emerald-700" />
        <KpiCard label="Working Hours" value={fmtNum(kpi.hours, 0)} sub={`${fmtMonth(month)} · ${STANDARD_DAY_HOURS}h/day`} color="text-blue-800" />
        <KpiCard label="OT Hours" value={fmtNum(kpi.ot, 1)} sub={fmtMonth(month)} color="text-amber-600" />
        <KpiCard label="Est. Wages" value={fmtRM(kpi.wages)} sub={`${fmtMonth(month)} · days × rate`} color="text-blue-800" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} months={months} onChange={setMonth} />
        <div className="flex-1" />
        <ExportButtons filename="manpower-summary" build={() => ({
          title: `Manpower Summary ${fmtMonth(month)}`, subtitle: fmtMonth(month),
          meta: [`Month: ${fmtMonth(month)}`, `Total working hours: ${fmtNum(kpi.hours, 0)} · OT: ${fmtNum(kpi.ot, 1)}h · Wages: ${fmtRM(kpi.wages)}`],
          columns: exportCols, rows: summary,
        })} />
      </div>

      <SectionCard title={`Monthly Summary — ${fmtMonth(month)}`}>
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>{['Worker', 'Role', 'Plant', 'Daily Rate', 'Total Working Hrs', 'OT Hours', 'Absent Days', 'Est. Wages (RM)'].map((h, i) => (
              <th key={h} className={`th ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {summary.map(({ worker: w, hours, ot, absent, wages }) => (
              <tr key={w.id} className="hover:bg-neutral-50">
                <td className="td font-medium">{w.name}
                  {w.status === 'inactive' && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600">Inactive</span>}
                </td>
                <td className="td">{w.role}</td>
                <td className="td text-xs text-neutral-500">{plantsById[w.plant_id]?.name}</td>
                <td className="td text-right">{fmtRM(w.daily_rate_rm)}</td>
                <td className="td text-right font-semibold">{fmtNum(hours, 1)}</td>
                <td className="td text-right text-amber-600">{ot ? fmtNum(ot, 1) : ''}</td>
                <td className={`td text-right ${absent > 0 ? 'text-red-600' : ''}`}>{absent || ''}</td>
                <td className="td text-right font-bold">{fmtRM(wages)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {summary.length === 0 && <Empty>No workers registered</Empty>}
      </SectionCard>

      {editingWorker && <WorkerModal form={editingWorker} onClose={() => setEditingWorker(null)} />}
    </div>
  )
}

// ===========================================================================
// Attendance — workers register + daily attendance log
// ===========================================================================
export function ManpowerAttendance() {
  const data = useManpower()
  const { myWorkers, myAttendance, months, workersById, plantsById, selectedPlantIds } = data
  const [month, setMonth] = useMonthState(months)
  const [editingWorker, setEditingWorker] = useState(null)
  const [editingAtt, setEditingAtt] = useState(null)

  const monthAtt = useMemo(() => myAttendance.filter((a) => monthOf(a.date) === month), [myAttendance, month])
  const sortedAtt = useMemo(
    () => [...monthAtt].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id),
    [monthAtt])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} months={months} onChange={setMonth} />
        <div className="flex-1" />
        <button className="btn" onClick={() => setEditingWorker({
          plant_id: selectedPlantIds[0], name: '', role: '', contact: '', daily_rate_rm: '', status: 'active', join_date: todayISO(), remarks: '',
        })}>+ Add Worker</button>
        <button className="btn-dark" onClick={() => setEditingAtt({
          worker_id: '', date: todayISO(), status: 'present', ot_hours: 0, remarks: '',
        })}>+ Add Attendance</button>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <SectionCard title="Workers" right={
          <div className="flex items-center gap-3">
            <ExportButtons filename="workers" build={() => ({
              title: 'Workers', columns: [
                { header: 'Name', value: (w) => w.name },
                { header: 'Role', value: (w) => w.role },
                { header: 'Plant', value: (w) => plantsById[w.plant_id]?.name ?? '' },
                { header: 'Contact', value: (w) => w.contact },
                { header: 'Daily Rate (RM)', align: 'right', value: (w) => num(w.daily_rate_rm), text: (w) => fmtRM(w.daily_rate_rm) },
                { header: 'Status', value: (w) => w.status },
                { header: 'Joined', value: (w) => w.join_date, text: (w) => w.join_date ? fmtDate(w.join_date) : '' },
              ], rows: myWorkers })} />
            <span className="mono text-xs text-neutral-400">{myWorkers.length} workers</span>
          </div>
        }>
          <div className="table-scroll"><table className="w-full">
            <thead>
              <tr>{['Name', 'Role', 'Contact', 'Joined', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {myWorkers.map((w) => (
                <tr key={w.id} className="hover:bg-neutral-50">
                  <td className="td font-medium">{w.name}</td>
                  <td className="td">{w.role}</td>
                  <td className="td mono text-xs">{w.contact}</td>
                  <td className="td text-xs whitespace-nowrap">{w.join_date ? fmtDate(w.join_date) : '—'}</td>
                  <td className="td whitespace-nowrap">
                    <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditingWorker({ ...w })}>Edit</button>
                    <ConfirmDelete onConfirm={() => data.remove('workers', w.id).catch((e) => alert(e.message))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {myWorkers.length === 0 && <Empty>No workers</Empty>}
        </SectionCard>

        <SectionCard title={`Attendance Log — ${fmtMonth(month)}`} right={
          <div className="flex items-center gap-3">
            <ExportButtons filename="attendance-log" build={() => ({
              title: `Attendance ${fmtMonth(month)}`, subtitle: fmtMonth(month),
              columns: [
                { header: 'Date', value: (a) => a.date, text: (a) => fmtDate(a.date) },
                { header: 'Worker', value: (a) => workersById[a.worker_id]?.name ?? '?' },
                { header: 'Status', value: (a) => ATT_STATUS[a.status]?.[0] ?? a.status },
                { header: 'OT Hours', align: 'right', value: (a) => num(a.ot_hours) },
                { header: 'Remarks', value: (a) => a.remarks },
              ], rows: sortedAtt })} />
            <span className="mono text-xs text-neutral-400">{sortedAtt.length} records</span>
          </div>
        }>
          <div className="table-scroll"><table className="w-full">
            <thead>
              <tr>{['Date', 'Worker', 'Status', 'OT', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {sortedAtt.map((a) => {
                const [label, cls] = ATT_STATUS[a.status] ?? [a.status, 'bg-neutral-200']
                return (
                  <tr key={a.id} className="hover:bg-neutral-50">
                    <td className="td whitespace-nowrap">{fmtDate(a.date)}</td>
                    <td className="td font-medium">{workersById[a.worker_id]?.name ?? '?'}</td>
                    <td className="td"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                    <td className="td text-right">{num(a.ot_hours) ? `${fmtNum(a.ot_hours, 1)} h` : ''}</td>
                    <td className="td whitespace-nowrap">
                      <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditingAtt({ ...a })}>Edit</button>
                      <ConfirmDelete onConfirm={() => data.remove('attendance', a.id)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
          {sortedAtt.length === 0 && <Empty>No attendance this month</Empty>}
        </SectionCard>
      </div>

      {editingWorker && <WorkerModal form={editingWorker} onClose={() => setEditingWorker(null)} />}
      {editingAtt && <AttendanceModal form={editingAtt} workers={myWorkers} onClose={() => setEditingAtt(null)} onSaved={(d) => setMonth(monthOf(d))} />}
    </div>
  )
}

// ===========================================================================
// Daily OT — individual OT entries for the selected month
// ===========================================================================
export function ManpowerDailyOT() {
  const data = useManpower()
  const { myWorkers, myAttendance, months, workersById, plantsById } = data
  const [month, setMonth] = useMonthState(months)
  const [editingAtt, setEditingAtt] = useState(null)

  const rows = useMemo(() => myAttendance
    .filter((a) => monthOf(a.date) === month && num(a.ot_hours) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id),
  [myAttendance, month])

  const totalOt = useMemo(() => rows.reduce((s, a) => s + num(a.ot_hours), 0), [rows])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="OT Entries" value={rows.length} sub={fmtMonth(month)} />
        <KpiCard label="Total OT Hours" value={fmtNum(totalOt, 1)} sub={fmtMonth(month)} color="text-amber-600" />
        <KpiCard label="Avg OT / Entry" value={fmtNum(rows.length ? totalOt / rows.length : 0, 1)} sub="hours" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker month={month} months={months} onChange={setMonth} />
        <div className="flex-1" />
        <ExportButtons filename="daily-ot" build={() => ({
          title: `Daily OT ${fmtMonth(month)}`, subtitle: fmtMonth(month),
          meta: [`Month: ${fmtMonth(month)}`, `Total OT: ${fmtNum(totalOt, 1)} hours`],
          columns: [
            { header: 'Date', value: (a) => a.date, text: (a) => fmtDate(a.date) },
            { header: 'Worker', value: (a) => workersById[a.worker_id]?.name ?? '?' },
            { header: 'Plant', value: (a) => plantsById[workersById[a.worker_id]?.plant_id]?.name ?? '' },
            { header: 'OT Hours', align: 'right', value: (a) => num(a.ot_hours), text: (a) => fmtNum(a.ot_hours, 1) },
            { header: 'Remarks', value: (a) => a.remarks },
          ], rows,
        })} />
        <button className="btn-dark" onClick={() => setEditingAtt({ worker_id: '', date: todayISO(), status: 'present', ot_hours: 1, remarks: '' })}>+ Add OT</button>
      </div>

      <SectionCard title={`Daily Overtime — ${fmtMonth(month)}`} right={<span className="mono text-xs text-neutral-400">{rows.length} entries · {fmtNum(totalOt, 1)} h</span>}>
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>{['Date', 'Worker', 'Plant', 'OT Hours', 'Remarks', 'Actions'].map((h, i) => <th key={h} className={`th ${i === 3 ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-neutral-50">
                <td className="td whitespace-nowrap">{fmtDate(a.date)}</td>
                <td className="td font-medium">{workersById[a.worker_id]?.name ?? '?'}</td>
                <td className="td text-xs text-neutral-500">{plantsById[workersById[a.worker_id]?.plant_id]?.name}</td>
                <td className="td text-right font-semibold text-amber-600">{fmtNum(a.ot_hours, 1)} h</td>
                <td className="td text-xs text-neutral-500">{a.remarks}</td>
                <td className="td whitespace-nowrap">
                  <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditingAtt({ ...a })}>Edit</button>
                  <ConfirmDelete onConfirm={() => data.remove('attendance', a.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {rows.length === 0 && <Empty>No overtime recorded this month</Empty>}
      </SectionCard>

      {editingAtt && <AttendanceModal form={editingAtt} workers={myWorkers} onClose={() => setEditingAtt(null)} onSaved={(d) => setMonth(monthOf(d))} />}
    </div>
  )
}

// ===========================================================================
// Monthly OT — per-worker OT totals pivoted across every active month
// ===========================================================================
export function ManpowerMonthlyOT() {
  const { myWorkers, myAttendance, months } = useManpower()

  const { rows, monthTotals, grand } = useMemo(() => {
    const monthTotals = Object.fromEntries(months.map((m) => [m, 0]))
    const rows = myWorkers.map((w) => {
      const byMonth = Object.fromEntries(months.map((m) => [m, 0]))
      let total = 0
      for (const a of myAttendance) {
        if (Number(a.worker_id) !== Number(w.id)) continue
        const m = monthOf(a.date)
        if (!(m in byMonth)) continue
        const ot = num(a.ot_hours)
        byMonth[m] += ot; total += ot; monthTotals[m] += ot
      }
      return { worker: w, byMonth, total }
    }).filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
    const grand = Object.values(monthTotals).reduce((s, v) => s + v, 0)
    return { rows, monthTotals, grand }
  }, [myWorkers, myAttendance, months])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1" />
        <ExportButtons filename="monthly-ot" build={() => ({
          title: 'Monthly OT by Worker',
          meta: [`Total OT across all months: ${fmtNum(grand, 1)} hours`],
          columns: [
            { header: 'Worker', value: (r) => r.worker.name },
            ...months.map((m) => ({ header: fmtMonth(m), align: 'right', value: (r) => r.byMonth[m], text: (r) => r.byMonth[m] ? fmtNum(r.byMonth[m], 1) : '' })),
            { header: 'Total OT', align: 'right', value: (r) => r.total, text: (r) => fmtNum(r.total, 1) },
          ], rows,
        })} />
      </div>

      <SectionCard title="Monthly Overtime — hours per worker" right={<span className="mono text-xs text-neutral-400">{fmtNum(grand, 1)} h total</span>}>
        {rows.length === 0 ? <Empty>No overtime recorded</Empty> : (
          <div className="table-scroll"><table className="w-full">
            <thead>
              <tr>
                <th className="th">Worker</th>
                {months.map((m) => <th key={m} className="th text-right whitespace-nowrap">{fmtMonth(m)}</th>)}
                <th className="th text-right">Total OT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ worker: w, byMonth, total }) => (
                <tr key={w.id} className="hover:bg-neutral-50">
                  <td className="td font-medium whitespace-nowrap">{w.name}</td>
                  {months.map((m) => <td key={m} className="td text-right">{byMonth[m] ? fmtNum(byMonth[m], 1) : <span className="text-neutral-300">—</span>}</td>)}
                  <td className="td text-right font-bold text-amber-600">{fmtNum(total, 1)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                <td className="td font-bold">Total</td>
                {months.map((m) => <td key={m} className="td text-right font-semibold">{monthTotals[m] ? fmtNum(monthTotals[m], 1) : ''}</td>)}
                <td className="td text-right font-extrabold">{fmtNum(grand, 1)}</td>
              </tr>
            </tbody>
          </table></div>
        )}
      </SectionCard>
    </div>
  )
}

// ===========================================================================
// Shared modals
// ===========================================================================
function WorkerModal({ form, onClose }) {
  const { plants, create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      const body = { ...f, daily_rate_rm: Number(f.daily_rate_rm) || 0 }
      if (isEdit) await update('workers', f.id, body)
      else await create('workers', body)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Worker' : 'Add Worker'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input w-full" value={f.name} onChange={set('name')} /></Field>
        <Field label="Role"><input className="input w-full" value={f.role} onChange={set('role')} placeholder="Plant Operator / Mixer Driver…" /></Field>
        <Field label="Contact"><input className="input w-full" value={f.contact} onChange={set('contact')} /></Field>
        <Field label="Daily Rate (RM)"><input type="number" step="0.01" className="input w-full" value={f.daily_rate_rm} onChange={set('daily_rate_rm')} /></Field>
        <Field label="Plant">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input w-full" value={f.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Join Date"><input type="date" className="input w-full" value={f.join_date} onChange={set('join_date')} /></Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Worker'}</button>
      </div>
    </Modal>
  )
}

function AttendanceModal({ form, workers, onClose, onSaved }) {
  const { create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      const body = { ...f, ot_hours: Number(f.ot_hours) || 0 }
      if (isEdit) await update('attendance', f.id, body)
      else await create('attendance', body)
      onSaved?.(f.date)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Attendance' : 'Add Attendance'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Worker">
          <select className="input w-full" value={f.worker_id} onChange={set('worker_id')}>
            <option value="">— select —</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Status">
          <select className="input w-full" value={f.status} onChange={set('status')}>
            <option value="present">Present</option>
            <option value="half_day">Half Day</option>
            <option value="absent">Absent</option>
          </select>
        </Field>
        <Field label="OT Hours"><input type="number" step="0.5" className="input w-full" value={f.ot_hours} onChange={set('ot_hours')} /></Field>
        <Field label="Remarks" span2><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Attendance'}</button>
      </div>
    </Modal>
  )
}
