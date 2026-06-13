import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num } from '../lib/calc.js'
import { fmtRM, fmtDate, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete, KpiCard } from '../components/ui.jsx'

const STATUS = {
  active: ['Active', 'bg-emerald-100 text-emerald-700'],
  maintenance: ['Maintenance', 'bg-amber-100 text-amber-700'],
  breakdown: ['Breakdown', 'bg-red-100 text-red-700'],
  idle: ['Idle', 'bg-neutral-200 text-neutral-600'],
}
const MTYPE = { service: 'Service', repair: 'Repair', inspection: 'Inspection' }

export default function Machinery() {
  const data = useData()
  const { machines, maintenance, machinesById, plantsById, inSelection, selectedPlantIds } = data
  const [editingMachine, setEditingMachine] = useState(null)
  const [editingRecord, setEditingRecord] = useState(null)

  const myMachines = useMemo(() => machines.filter(inSelection), [machines, inSelection])
  // maintenance records belong to a plant through their machine
  const myRecords = useMemo(() => {
    const ids = new Set(myMachines.map((m) => Number(m.id)))
    return maintenance
      .filter((r) => ids.has(Number(r.machine_id)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id)
  }, [maintenance, myMachines])

  const kpi = useMemo(() => ({
    total: myMachines.length,
    active: myMachines.filter((m) => m.status === 'active').length,
    down: myMachines.filter((m) => m.status === 'maintenance' || m.status === 'breakdown').length,
    cost: myRecords.reduce((s, r) => s + num(r.cost_rm), 0),
  }), [myMachines, myRecords])

  const upcoming = useMemo(() => myRecords
    .filter((r) => r.next_service_date && r.next_service_date >= todayISO())
    .sort((a, b) => String(a.next_service_date).localeCompare(String(b.next_service_date)))
    .slice(0, 5),
  [myRecords])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Machines" value={kpi.total} sub="registered" />
        <KpiCard label="Active" value={kpi.active} sub="in operation" color="text-emerald-700" />
        <KpiCard label="Maintenance / Breakdown" value={kpi.down} sub="out of service" color={kpi.down > 0 ? 'text-amber-600' : 'text-neutral-900'} />
        <KpiCard label="Maintenance Cost" value={fmtRM(kpi.cost)} sub="all recorded" color="text-red-700" />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button className="btn" onClick={() => setEditingMachine({
          plant_id: selectedPlantIds[0], name: '', type: '', reg_no: '', status: 'active', remarks: '',
        })}>+ Add Machine</button>
        <button className="btn-dark" onClick={() => setEditingRecord({
          machine_id: '', date: todayISO(), type: 'service', description: '', cost_rm: '', next_service_date: '', remarks: '',
        })}>+ Add Maintenance Record</button>
      </div>

      <SectionCard title="Machines" right={<span className="mono text-xs text-neutral-400">{myMachines.length} machines</span>}>
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>{['Machine', 'Type', 'Reg No.', 'Plant', 'Status', 'Remarks', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {myMachines.map((m) => {
              const [label, cls] = STATUS[m.status] ?? [m.status, 'bg-neutral-200']
              return (
                <tr key={m.id} className="hover:bg-neutral-50">
                  <td className="td font-medium">{m.name}</td>
                  <td className="td">{m.type}</td>
                  <td className="td mono text-xs">{m.reg_no}</td>
                  <td className="td text-xs text-neutral-500">{plantsById[m.plant_id]?.name}</td>
                  <td className="td"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                  <td className="td text-xs text-neutral-500">{m.remarks}</td>
                  <td className="td whitespace-nowrap">
                    <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditingMachine({ ...m })}>Edit</button>
                    <ConfirmDelete onConfirm={() => data.remove('machines', m.id).catch((e) => alert(e.message))} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        {myMachines.length === 0 && <Empty>No machines registered</Empty>}
      </SectionCard>

      <div className="grid xl:grid-cols-3 gap-5">
        <SectionCard title="Maintenance Log" className="xl:col-span-2" right={<span className="mono text-xs text-neutral-400">{myRecords.length} records</span>}>
          <div className="table-scroll"><table className="w-full">
            <thead>
              <tr>{['Date', 'Machine', 'Type', 'Description', 'Cost (RM)', 'Next Service', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
            </thead>
            <tbody>
              {myRecords.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="td whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="td font-medium">{machinesById[r.machine_id]?.name ?? '?'}</td>
                  <td className="td text-xs font-semibold">{MTYPE[r.type] ?? r.type}</td>
                  <td className="td text-xs text-neutral-600">{r.description}</td>
                  <td className="td text-right">{fmtRM(r.cost_rm)}</td>
                  <td className="td whitespace-nowrap text-xs">{r.next_service_date ? fmtDate(r.next_service_date) : '—'}</td>
                  <td className="td whitespace-nowrap">
                    <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditingRecord({ ...r })}>Edit</button>
                    <ConfirmDelete onConfirm={() => data.remove('maintenance', r.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {myRecords.length === 0 && <Empty>No maintenance records</Empty>}
        </SectionCard>

        <SectionCard title="Upcoming Services">
          {upcoming.length === 0 ? <Empty>Nothing scheduled</Empty> : (
            <div className="space-y-2">
              {upcoming.map((r) => (
                <div key={r.id} className="border border-neutral-200 rounded-md px-3 py-2">
                  <div className="text-sm font-medium">{machinesById[r.machine_id]?.name}</div>
                  <div className="text-xs text-neutral-500">{fmtDate(r.next_service_date)} · {MTYPE[r.type] ?? r.type}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {editingMachine && <MachineModal form={editingMachine} onClose={() => setEditingMachine(null)} />}
      {editingRecord && <RecordModal form={editingRecord} machines={myMachines} onClose={() => setEditingRecord(null)} />}
    </div>
  )
}

function MachineModal({ form, onClose }) {
  const { plants, create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      if (isEdit) await update('machines', f.id, f)
      else await create('machines', f)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Machine' : 'Add Machine'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><input className="input w-full" value={f.name} onChange={set('name')} placeholder="Mixer Truck 2" /></Field>
        <Field label="Type"><input className="input w-full" value={f.type} onChange={set('type')} placeholder="Mixer Truck / Loader / Genset…" /></Field>
        <Field label="Reg No."><input className="input w-full mono" value={f.reg_no} onChange={set('reg_no')} /></Field>
        <Field label="Plant">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input w-full" value={f.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="breakdown">Breakdown</option>
            <option value="idle">Idle</option>
          </select>
        </Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Machine'}</button>
      </div>
    </Modal>
  )
}

function RecordModal({ form, machines, onClose }) {
  const { create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      const body = { ...f, cost_rm: Number(f.cost_rm) || 0 }
      if (isEdit) await update('maintenance', f.id, body)
      else await create('maintenance', body)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Maintenance Record' : 'Add Maintenance Record'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Machine">
          <select className="input w-full" value={f.machine_id} onChange={set('machine_id')}>
            <option value="">— select —</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Type">
          <select className="input w-full" value={f.type} onChange={set('type')}>
            <option value="service">Service</option>
            <option value="repair">Repair</option>
            <option value="inspection">Inspection</option>
          </select>
        </Field>
        <Field label="Cost (RM)"><input type="number" step="0.01" className="input w-full" value={f.cost_rm} onChange={set('cost_rm')} /></Field>
        <Field label="Next Service Date"><input type="date" className="input w-full" value={f.next_service_date} onChange={set('next_service_date')} /></Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
        <Field label="Description" span2><input className="input w-full" value={f.description} onChange={set('description')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Record'}</button>
      </div>
    </Modal>
  )
}
