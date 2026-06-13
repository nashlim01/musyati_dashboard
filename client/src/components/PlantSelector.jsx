import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/data.jsx'

// Header dropdown: "All Plants" or any combination of individual plants.
export default function PlantSelector() {
  const { plants, plantSel, setPlantSel } = useData()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  const isAll = plantSel === 'all'
  const selectedIds = isAll ? plants.map((p) => Number(p.id)) : plantSel
  const labelText = isAll
    ? 'All Plants'
    : selectedIds.length === 1
      ? plants.find((p) => Number(p.id) === selectedIds[0])?.name ?? 'Plant'
      : `${selectedIds.length} plants selected`

  const togglePlant = (id) => {
    const cur = isAll ? plants.map((p) => Number(p.id)) : [...plantSel]
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    if (next.length === 0) return // never allow empty selection
    if (next.length === plants.length) setPlantSel('all')
    else setPlantSel(next)
  }

  return (
    <div className="relative" ref={ref}>
      <span className="label mr-2 text-neutral-500">Plant</span>
      <button
        className="bg-neutral-800 border border-neutral-700 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-neutral-700 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        {labelText} <span className="text-neutral-400 ml-1">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white text-neutral-900 rounded-lg border border-neutral-200 shadow-xl z-50 p-2">
          <button
            className={`w-full text-left px-3 py-2 rounded-md text-sm cursor-pointer ${isAll ? 'bg-neutral-900 text-white font-semibold' : 'hover:bg-neutral-100'}`}
            onClick={() => { setPlantSel('all'); setOpen(false) }}
          >
            All Plants — Aggregated
          </button>
          <div className="label px-3 pt-3 pb-1">Select plants</div>
          {plants.map((p) => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(Number(p.id))}
                onChange={() => togglePlant(Number(p.id))}
              />
              {p.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
