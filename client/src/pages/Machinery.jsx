import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num } from '../lib/calc.js'
import { fmtRM, fmtDate, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete, KpiCard, ExportButtons } from '../components/ui.jsx'

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

  // maintenance cost grouped by machine — keeps the page focused on spend
  const costByMachine = useMemo(() => {
    const map = new Map()
    for (const r of myRecords) {
      const id = Number(r.machine_id)
      if (!map.has(id)) map.set(id, { name: machinesById[id]?.name ?? '?', cost: 0, count: 0 })
      const e = map.get(id); e.cost += num(r.cost_rm); e.count += 1
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost)
  }, [myRecords, machinesById])

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
          machine_id: '', date: todayISO(), type: 'service', description: '', cost_rm: '', remarks: '',
        })}>+ Add Maintenance Record</button>
      </div>

      <SectionCard title="Machines" right={
        <div className="flex items-center gap-3">
          <ExportButtons filename="machines" build={() => ({
            title: 'Machines', columns: [
              { header: 'Machine', value: (m) => m.name },
              { header: 'Type', value: (m) => m.type },
              { header: 'Reg No.', value: (m) => m.reg_no },
              { header: 'Plant', value: (m) => plantsById[m.plant_id]?.name ?? '' },
              { header: 'Status', value: (m) => STATUS[m.status]?.[0] ?? m.status },
              { header: 'Remarks', value: (m) => m.remarks },
            ], rows: myMachines })} />
          <span className="mono text-xs text-neutral-400">{myMachines.length} machines</span>
        </div>
      }>
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
        <SectionCard title="Maintenance Log" className="xl:col-span-2" right={
          <div className="flex items-center gap-3">
            <ExportButtons filename="maintenance-log" build={() => ({
              title: 'Maintenance Log',
              subtitle: `${myRecords.length} records · total ${fmtRM(kpi.cost)}`,
              meta: [`Total maintenance cost: ${fmtRM(kpi.cost)}`],
              columns: [
                { header: 'Date', value: (r) => r.date, text: (r) => fmtDate(r.date) },
                { header: 'Machine', value: (r) => machinesById[r.machine_id]?.name ?? '?' },
                { header: 'Type', value: (r) => MTYPE[r.type] ?? r.type },
                { header: 'Description', value: (r) => r.description },
                { header: 'Cost (RM)', align: 'right', value: (r) => num(r.cost_rm), text: (r) => fmtRM(r.cost_rm) },
                { header: 'Remarks', value: (r) => r.remarks },
              ], rows: myRecords })} />
            <span className="mono text-xs text-neutral-400">{myRecords.length} records</span>
          </div>
        }>
          <div className="table-scroll"><table className="w-full">
            <thead>
              <tr>{['Date', 'Machine', 'Type', 'Description', 'Cost (RM)', 'Actions'].map((h, i) => <th key={h} className={`th ${i === 4 ? 'text-right' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {myRecords.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="td whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="td font-medium">{machinesById[r.machine_id]?.name ?? '?'}</td>
                  <td className="td text-xs font-semibold">{MTYPE[r.type] ?? r.type}</td>
                  <td className="td text-xs text-neutral-600">{r.description}</td>
                  <td className="td text-right">{fmtRM(r.cost_rm)}</td>
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

        <SectionCard title="Maintenance Cost by Machine">
          {costByMachine.length === 0 ? <Empty>No maintenance cost yet</Empty> : (
            <div className="space-y-2">
              {costByMachine.map((m) => (
                <div key={m.name} className="flex items-center justify-between border border-neutral-200 rounded-md px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-neutral-400">{m.count} record{m.count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-sm font-bold text-red-700">{fmtRM(m.cost)}</div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-neutral-200">
                <span className="label">Total</span>
                <span className="text-sm font-extrabold">{fmtRM(kpi.cost)}</span>
              </div>
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
