import { useEffect } from 'react'

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 overflow-y-auto" onMouseDown={onClose}>
      <div
        className={`card mt-8 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} p-5 shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button className="text-neutral-400 hover:text-neutral-700 text-xl leading-none cursor-pointer" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, span2 = false }) {
  return (
    <label className={`block ${span2 ? 'col-span-2' : ''}`}>
      <span className="label block mb-1">{label}</span>
      {children}
    </label>
  )
}

export function KpiCard({ label, value, sub, color = 'text-neutral-900' }) {
  // long amounts (e.g. "RM 4,336,301.00") shrink to stay on one line inside the card
  const len = String(value ?? '').length
  const size = len > 13 ? 'text-base' : len > 10 ? 'text-lg' : len > 8 ? 'text-xl' : 'text-2xl'
  return (
    <div className="card p-4 min-w-0">
      <div className="label mb-2">{label}</div>
      <div className={`${size} font-extrabold leading-tight whitespace-nowrap ${color}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </div>
  )
}

export function SectionCard({ title, right, children, className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="label">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function Empty({ children = 'No records' }) {
  return <div className="py-10 text-center text-sm text-neutral-400">{children}</div>
}

export function ConfirmDelete({ onConfirm, label = 'Delete' }) {
  return (
    <button
      className="text-red-500 hover:text-red-700 text-xs font-medium cursor-pointer"
      onClick={() => { if (window.confirm('Delete this record?')) onConfirm() }}
    >
      {label}
    </button>
  )
}
