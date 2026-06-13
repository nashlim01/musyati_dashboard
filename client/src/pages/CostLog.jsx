import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, monthOf, activeMonths } from '../lib/calc.js'
import { fmtRM, fmtDate, fmtMonth, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete } from '../components/ui.jsx'

export default function CostLog() {
  const data = useData()
  const { expenses, expenseCategories, plantsById, projectsById, inSelection, selectedPlantIds } = data
  const [fMonth, setFMonth] = useState('all')
  const [fCategory, setFCategory] = useState('all')
  const [editing, setEditing] = useState(null)
  const [managing, setManaging] = useState(false)

  const myExpenses = useMemo(() => expenses.filter(inSelection), [expenses, inSelection])
  const months = useMemo(() => activeMonths({ expenses: myExpenses }), [myExpenses])

  const filtered = useMemo(() => myExpenses
    .filter((e) => fMonth === 'all' || monthOf(e.date) === fMonth)
    .filter((e) => fCategory === 'all' || e.category === fCategory)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id),
  [myExpenses, fMonth, fCategory])

  const totalShown = filtered.reduce((s, e) => s + num(e.amount_rm), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input" value={fMonth} onChange={(e) => setFMonth(e.target.value)}>
          <option value="all">All Months</option>
          {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <select className="input" value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {expenseCategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <div className="flex-1" />
        <button className="btn" onClick={() => setManaging(true)}>⚙ Categories</button>
        <button className="btn-dark" onClick={() => setEditing({
          plant_id: selectedPlantIds[0], project_id: '', date: todayISO(), category: '', description: '', amount_rm: '',
        })}>+ Add Expense</button>
      </div>

      <SectionCard
        title="Expense Records"
        right={<span className="mono text-xs text-neutral-400">{filtered.length} records · {fmtRM(totalShown)}</span>}
      >
        <div className="table-scroll"><table className="w-full">
          <thead>
            <tr>
              {['Date', 'Plant', 'Project', 'Category', 'Description', 'Amount (RM)', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="hover:bg-neutral-50">
                <td className="td whitespace-nowrap">{fmtDate(e.date)}</td>
                <td className="td text-xs text-neutral-500">{plantsById[e.plant_id]?.name}</td>
                <td className="td text-xs">{e.project_id ? <span className="mono text-[10px] bg-neutral-100 rounded px-1.5 py-0.5">{projectsById[e.project_id]?.code || projectsById[e.project_id]?.name || '?'}</span> : <span className="text-neutral-300">—</span>}</td>
                <td className="td font-medium">{e.category}</td>
                <td className="td text-neutral-600">{e.description}</td>
                <td className="td text-right font-semibold">{fmtRM(e.amount_rm)}</td>
                <td className="td whitespace-nowrap">
                  <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditing({ ...e })}>Edit</button>
                  <ConfirmDelete onConfirm={() => data.remove('expenses', e.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {filtered.length === 0 && <Empty>No expenses recorded</Empty>}
      </SectionCard>

      {editing && <ExpenseModal form={editing} onClose={() => setEditing(null)} />}
      {managing && <CategoriesManager onClose={() => setManaging(false)} />}
    </div>
  )
}

const NEW_CATEGORY = '__new__'

function ExpenseModal({ form, onClose }) {
  const { plants, projects, expenseCategories, create, update } = useData()
  const [f, setF] = useState(form)
  const [newCat, setNewCat] = useState('')
  const [error, setError] = useState('')
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    try {
      let category = f.category
      if (category === NEW_CATEGORY) {
        const name = newCat.trim()
        if (!name) return setError('Enter a name for the new category')
        if (!expenseCategories.some((c) => c.name === name)) {
          await create('expense-categories', { name })
        }
        category = name
      }
      const body = { ...f, category, amount_rm: Number(f.amount_rm) }
      if (isEdit) await update('expenses', f.id, body)
      else await create('expenses', body)
      onClose()
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title={isEdit ? 'Edit Expense' : 'Add Expense'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plant">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Project (optional)" span2>
          <select className="input w-full" value={f.project_id ?? ''} onChange={set('project_id')}>
            <option value="">— overhead / not project-specific —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className="input w-full" value={f.category} onChange={set('category')}>
            <option value="">— select —</option>
            {expenseCategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value={NEW_CATEGORY}>+ New category…</option>
          </select>
        </Field>
        {f.category === NEW_CATEGORY ? (
          <Field label="New category name">
            <input className="input w-full" value={newCat} onChange={(e) => setNewCat(e.target.value)} autoFocus />
          </Field>
        ) : (
          <Field label="Amount (RM)">
            <input type="number" step="0.01" className="input w-full" value={f.amount_rm} onChange={set('amount_rm')} />
          </Field>
        )}
        {f.category === NEW_CATEGORY && (
          <Field label="Amount (RM)">
            <input type="number" step="0.01" className="input w-full" value={f.amount_rm} onChange={set('amount_rm')} />
          </Field>
        )}
        <Field label="Description" span2><input className="input w-full" value={f.description} onChange={set('description')} /></Field>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Expense'}</button>
      </div>
    </Modal>
  )
}

function CategoriesManager({ onClose }) {
  const { expenseCategories, expenses, create, update, remove } = useData()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const usageCount = (cat) => expenses.filter((e) => e.category === cat).length

  const add = async () => {
    const n = name.trim()
    if (!n) return
    if (expenseCategories.some((c) => c.name === n)) return setError('Category already exists')
    try {
      await create('expense-categories', { name: n })
      setName(''); setError('')
    } catch (e) { setError(e.message) }
  }

  // renaming a category also re-points every expense that uses the old name
  const rename = async (cat, newName) => {
    const n = newName.trim()
    if (!n || n === cat.name) return
    try {
      await update('expense-categories', cat.id, { name: n })
      for (const e of expenses.filter((x) => x.category === cat.name)) {
        await update('expenses', e.id, { category: n })
      }
      setError('')
    } catch (e) { setError(e.message) }
  }

  return (
    <Modal title="Expense Categories" onClose={onClose}>
      <div className="space-y-1.5 mb-4 max-h-80 overflow-y-auto pr-1">
        {expenseCategories.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input
              className="input flex-1 !border-transparent hover:!border-neutral-300"
              defaultValue={c.name}
              onBlur={(e) => rename(c, e.target.value)}
            />
            <span className="text-[10px] text-neutral-400 w-16 text-right">{usageCount(c.name)} used</span>
            <ConfirmDelete onConfirm={() => {
              if (usageCount(c.name) > 0) return setError(`"${c.name}" is used by ${usageCount(c.name)} expense(s) — reassign them first`)
              remove('expense-categories', c.id).catch((err) => setError(err.message))
            }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-dark" onClick={add}>+ Add</button>
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </Modal>
  )
}
