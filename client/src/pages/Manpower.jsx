import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, monthOf, activeMonths } from '../lib/calc.js'
import { fmtRM, fmtNum, fmtDate, fmtMonth, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete, KpiCard } from '../components/ui.jsx'

const ATT_STATUS = {
  present: ['Present', 'bg-emerald-100 text-emerald-700', 1],
  half_day: ['Half Day', 'bg-amber-100 text-amber-700', 0.5],
  absent: ['Absent', 'bg-red-100 text-red-700', 0],
}

export default function Manpower() {
  const data = useData()
  const { workers, attendance, workersById, plantsById, inSelection, selectedPlantIds } = data
  const [editingWorker, setEditingWorker] = useState(null)
  const [editingAtt, setEditingAtt] = useState(null)

  const myWorkers = useMemo(() => workers.filter(inSelection), [workers, inSelection])
  // attendance belongs to a plant through its worker
  const myAttendance = useMemo(() => {
    const ids = new Set(myWorkers.map((w) => Number(w.id)))
    return attendance.filter((a) => ids.has(Number(a.worker_id)))
  }, [attendance, myWorkers])

  const months = useMemo(() => activeMonths({ expenses: myAttendance }), [myAttendance])
  const [month, setMonth] = useState(() => months[months.length - 1] ?? monthOf(todayISO()))

  const monthAtt = useMemo(
    () => myAttendance.filter((a) => monthOf(a.date) === month),
    [myAttendance, month])

  // per-worker monthly summary: days = present(1) + half_day(0.5); wages = days × daily rate
  const summary = useMemo(() => myWorkers.map((w) => {
    const rows = monthAtt.filter((a) => Number(a.worker_id) === Number(w.id))
    const days = rows.reduce((s, a) => s + (ATT_STATUS[a.status]?.[2] ?? 0), 0)
    const absent = rows.filter((a) => a.status === 'absent').length
    const ot = rows.reduce((s, a) => s + num(a.ot_hours), 0)
    return { worker: w, days, absent, ot, wages: days * num(w.daily_rate_rm) }
  }), [myWorkers, monthAtt])

  const kpi = useMemo(() => ({
    total: myWorkers.length,
    active: myWorkers.filter((w) => w.status !== 'inactive').length,
    ot: summary.reduce((s, r) => s + r.ot, 0),
    wages: summary.reduce((s, r) => s + r.wages, 0),
  }), [myWorkers, summary])

  const sortedAtt = useMemo(
    () => [...monthAtt].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id),
    [monthAtt])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Workers" value={kpi.total} sub="registered" />
        <KpiCard label="Active" value={kpi.active} sub="on payroll" color="text-emerald-700" />
        <KpiCard label="OT Hours" value={fmtNum(kpi.ot, 1)} sub={fmtMonth(month)} color="text-amber-600" />
        <KpiCard label="Est. Wages" value={fmtRM(kpi.wages)} sub={`${fmtMonth(month)} · days × daily rate`} color="text-blue-800" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
          {!months.includes(month) && <option value={month}>{fmtMonth(month)}</option>}
          {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <div className="flex-1" />
        <button className="btn" onClick={() => setEditingWorker({
          plant_id: selectedPlantIds[0], name: '', role: '', contact: '', daily_rate_rm: '', status: 'active', join_date: todayISO(), remarks: '',
        })}>+ Add Worker</button>
        <button className="btn-dark" onClick={() => setEditingAtt({
          worker_id: '', date: todayISO(), status: 'present', ot_hours: 0, remarks: '',
        })}>+ Add Attendance</button>
      </div>

      <SectionCard title={`Monthly Summary — ${fmtMonth(month)}`}>
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>{['Worker', 'Role', 'Plant', 'Daily Rate', 'Days Worked', 'Absent', 'OT Hours', 'Est. Wages (RM)'].map((h, i) => (
              <th key={h} className={`th ${i >= 3 ? 'text-right' : ''}`}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {summary.map(({ worker: w, days, absent, ot, wages }) => (
              <tr key={w.id} className="hover:bg-neutral-50">
                <td className="td font-medium">{w.name}
                  {w.status === 'inactive' && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600">Inactive</span>}
                </td>
                <td className="td">{w.role}</td>
                <td className="td text-xs text-neutral-500">{plantsById[w.plant_id]?.name}</td>
                <td className="td text-right">{fmtRM(w.daily_rate_rm)}</td>
                <td className="td text-right font-semibold">{fmtNum(days, 1)}</td>
                <td className={`td text-right ${absent > 0 ? 'text-red-600' : ''}`}>{absent || ''}</td>
                <td className="td text-right">{ot ? fmtNum(ot, 1) : ''}</td>
                <td className="td text-right font-bold">{fmtRM(wages)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {summary.length === 0 && <Empty>No workers registered</Empty>}
      </SectionCard>

      <div className="grid xl:grid-cols-2 gap-5">
        <SectionCard title="Workers" right={<span className="mono text-xs text-neutral-400">{myWorkers.length} workers</span>}>
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

        <SectionCard title={`Attendance Log — ${fmtMonth(month)}`} right={<span className="mono text-xs text-neutral-400">{sortedAtt.length} records</span>}>
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
