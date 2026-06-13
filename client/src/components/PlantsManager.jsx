import { useState } from 'react'
import { useData } from '../lib/data.jsx'
import { Modal, Field, ConfirmDelete } from './ui.jsx'

export default function PlantsManager({ onClose }) {
  const { plants, create, update, remove } = useData()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState('')

  const addPlant = async () => {
    if (!name.trim()) return
    try {
      await create('plants', { name: name.trim(), location: location.trim(), active: 1 })
      setName(''); setLocation(''); setError('')
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title="Manage Plants" onClose={onClose}>
      <div className="space-y-2 mb-4">
        {plants.map((p) => (
          <div key={p.id} className="flex items-center gap-2 border border-neutral-200 rounded-md px-3 py-2">
            <input
              className="input flex-1 !border-transparent hover:!border-neutral-300"
              defaultValue={p.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== p.name) update('plants', p.id, { name: v }).catch((err) => setError(err.message))
              }}
            />
            <input
              className="input flex-1 !border-transparent hover:!border-neutral-300 text-neutral-500"
              defaultValue={p.location}
              placeholder="Location"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== p.location) update('plants', p.id, { location: v }).catch((err) => setError(err.message))
              }}
            />
            <ConfirmDelete onConfirm={() => remove('plants', p.id).catch((err) => setError(err.message))} />
          </div>
        ))}
      </div>
      <div className="label mb-2">Add plant</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Name"><input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Plant B — Lawas" /></Field>
        <Field label="Location"><input className="input w-full" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lawas Batching Plant" /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <button className="btn-dark" onClick={addPlant}>+ Add Plant</button>
    </Modal>
  )
}
