import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, materialBalance, sumTxns } from '../lib/calc.js'
import { fmtNum, fmtRM, fmtDate, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete } from '../components/ui.jsx'

const TYPE_LABEL = { usage: 'Usage', received: 'Received', transfer_out: 'Transfer Out' }
const TYPE_COLOR = { usage: 'text-red-600', received: 'text-emerald-700', transfer_out: 'text-amber-600' }

export default function Materials() {
  const data = useData()
  const { materials, materialTxns, deliveries, plantsById, materialsById, inSelection, selectedPlantIds } = data
  const [editing, setEditing] = useState(null)
  const [managing, setManaging] = useState(false)

  // materials are global — only the transactions are scoped to the plant selection
  const myTxns = useMemo(() => materialTxns.filter(inSelection), [materialTxns, inSelection])

  const summary = useMemo(() => materials.map((m) => {
    const balance = materialBalance(m, myTxns, deliveries, selectedPlantIds)
    return {
      material: m,
      received: sumTxns(myTxns, m.id, 'received'),
      usage: sumTxns(myTxns, m.id, 'usage'),
      balance,
      value: balance * num(m.unit_price_rm),
    }
  }), [materials, myTxns, deliveries, selectedPlantIds])

  const totalValue = useMemo(() => summary.reduce((s, r) => s + r.value, 0), [summary])

  const sortedTxns = useMemo(
    () => [...myTxns].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id),
    [myTxns])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button className="btn" onClick={() => setManaging(true)}>⚙ Manage Materials</button>
        <button className="btn-dark" onClick={() => setEditing({
          plant_id: selectedPlantIds[0], material_id: '', date: todayISO(), type: 'usage', qty_tonnes: '', remarks: '',
        })}>+ Add Transaction</button>
      </div>

      <SectionCard
        title="Materials Balance"
        right={<span className="mono text-xs text-neutral-400">Stock value {fmtRM(totalValue)}</span>}
      >
        {summary.length === 0 ? <Empty>No materials defined</Empty> : (
          <table className="w-full">
            <thead>
              <tr>
                {['Material', 'Unit', 'Unit Price', 'Received', 'Usage', 'Current Balance', 'Stock Value'].map((h, i) => (
                  <th key={h} className={`th ${i >= 2 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map(({ material: m, received, usage, balance, value }) => (
                <tr key={m.id} className="hover:bg-neutral-50">
                  <td className="td font-medium">{m.name}</td>
                  <td className="td text-xs text-neutral-500">{m.unit}</td>
                  <td className="td text-right">{fmtRM(m.unit_price_rm)}</td>
                  <td className="td text-right text-emerald-700">{fmtNum(received)}</td>
                  <td className="td text-right text-red-600">{fmtNum(usage)}</td>
                  <td className={`td text-right font-bold ${balance < 0 ? 'text-red-600' : ''}`}>{fmtNum(balance)}</td>
                  <td className="td text-right">{fmtRM(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard
        title="Material Transactions"
        right={<span className="mono text-xs text-neutral-400">{sortedTxns.length} records</span>}
      >
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>
              {['Date', 'Material', 'Type', 'Qty', 'Remarks', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {sortedTxns.map((t) => (
              <tr key={t.id} className="hover:bg-neutral-50">
                <td className="td whitespace-nowrap">{fmtDate(t.date)}</td>
                <td className="td font-medium">{materialsById[t.material_id]?.name ?? '?'}</td>
                <td className={`td text-xs font-semibold ${TYPE_COLOR[t.type] ?? ''}`}>{TYPE_LABEL[t.type] ?? t.type}</td>
                <td className="td text-right">{fmtNum(t.qty_tonnes)}</td>
                <td className="td text-xs text-neutral-500">{t.remarks}</td>
                <td className="td whitespace-nowrap">
                  <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditing({ ...t })}>Edit</button>
                  <ConfirmDelete onConfirm={() => data.remove('material-txns', t.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {sortedTxns.length === 0 && <Empty>No transactions</Empty>}
      </SectionCard>

      {editing && <TxnModal form={editing} onClose={() => setEditing(null)} />}
      {managing && <MaterialsManager onClose={() => setManaging(false)} />}
    </div>
  )
}

function TxnModal({ form, onClose }) {
  const { plants, materials, create, update } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      const body = { ...f, qty_tonnes: Number(f.qty_tonnes) }
      if (isEdit) await update('material-txns', f.id, body)
      else await create('material-txns', body)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Transaction' : 'Add Material Transaction'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plant">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Material">
          <select className="input w-full" value={f.material_id} onChange={set('material_id')}>
            <option value="">— select —</option>
            {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Type">
          <select className="input w-full" value={f.type} onChange={set('type')}>
            <option value="usage">Usage</option>
            <option value="received">Received</option>
            <option value="transfer_out">Transfer Out</option>
          </select>
        </Field>
        <Field label="Quantity"><input type="number" step="0.01" className="input w-full" value={f.qty_tonnes} onChange={set('qty_tonnes')} /></Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Transaction'}</button>
      </div>
    </Modal>
  )
}

function MaterialsManager({ onClose }) {
  const { materials, create, update, remove } = useData()
  const [f, setF] = useState({ name: '', unit: 'tonne', unit_price_rm: 0 })
  const [error, setError] = useState('')

  const add = async () => {
    if (!f.name.trim()) return
    try {
      await create('materials', { ...f, name: f.name.trim(), unit_price_rm: Number(f.unit_price_rm) || 0 })
      setF({ ...f, name: '', unit_price_rm: 0 }); setError('')
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title="Manage Materials" onClose={onClose} wide>
      <table className="w-full mb-4">
        <thead>
          <tr>{['Material', 'Unit', 'Unit Price (RM)', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}>
              <td className="td font-medium">{m.name}</td>
              <td className="td text-xs">{m.unit}</td>
              <td className="td">
                <input
                  type="number" step="0.01" className="input w-32" defaultValue={m.unit_price_rm}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0
                    if (v !== Number(m.unit_price_rm)) update('materials', m.id, { unit_price_rm: v }).catch((err) => setError(err.message))
                  }}
                />
              </td>
              <td className="td"><ConfirmDelete onConfirm={() => remove('materials', m.id).catch((err) => setError(err.message))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="label mb-2">Add material</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Field label="Name"><input className="input w-full" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Unit">
          <select className="input w-full" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
            <option value="tonne">tonne</option>
            <option value="litre">litre</option>
            <option value="unit">unit</option>
          </select>
        </Field>
        <Field label="Unit Price (RM)"><input type="number" step="0.01" className="input w-full" value={f.unit_price_rm} onChange={(e) => setF({ ...f, unit_price_rm: e.target.value })} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <button className="btn-dark" onClick={add}>+ Add Material</button>
    </Modal>
  )
}
