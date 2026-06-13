import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, monthOf, monthCosting, totalProduction, prevMonthOf, deliveryIncome } from '../lib/calc.js'
import { fmtRM, fmtNum } from '../lib/format.js'

// costing cells show nothing at all when the value is zero
const rm = (v) => (v === 0 ? '' : fmtRM(v))

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Costing() {
  const data = useData()
  const { pours, expenses, costing, expenseCategories, materials, materialTxns, deliveries, inSelection, selectedPlantIds, create, update } = data
  const singlePlant = selectedPlantIds.length === 1 ? selectedPlantIds[0] : null

  const years = useMemo(() => {
    const ys = new Set()
    for (const r of [...pours, ...expenses].filter(inSelection)) ys.add(String(r.date).slice(0, 4))
    for (const r of costing.filter(inSelection)) ys.add(String(r.month).slice(0, 4))
    ys.delete('')
    const list = [...ys].sort()
    return list.length ? list : [String(new Date().getFullYear())]
  }, [pours, expenses, costing, inSelection])
  const [year, setYear] = useState(() => years[years.length - 1])
  const [error, setError] = useState('')

  const model = useMemo(() => {
    const myPours = pours.filter(inSelection)
    const myExpenses = expenses.filter(inSelection)
    const myCosting = costing.filter(inSelection)
    const months = MONTH_NAMES.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

    const cols = months.map((month) => {
      // aggregate per selected plant: claim + auto-COGS from priced material movement
      let claim = 0, bf = 0, purchases = 0, cf = 0, cogs = 0
      for (const plantId of selectedPlantIds) {
        const row = myCosting.find((c) => c.month === month && Number(c.plant_id) === plantId)
        const m = monthCosting({
          plantId, month, prevMonth: prevMonthOf(month), costingRow: row,
          pours: pours.filter((p) => Number(p.plant_id) === plantId),
          expenses: [],
          materialTxns: materialTxns.filter((t) => Number(t.plant_id) === plantId),
          materials, deliveries,
        })
        claim += m.claim; bf += m.bf; purchases += m.purchases; cf += m.cf; cogs += m.cogs
      }
      const volume = totalProduction(myPours.filter((p) => monthOf(p.date) === month))
      // transport income, netted: only deliveries leaving the current selection
      const transport = deliveries
        .filter((d) => monthOf(d.date) === month
          && selectedPlantIds.includes(Number(d.from_plant_id))
          && !selectedPlantIds.includes(Number(d.to_plant_id)))
        .reduce((s, d) => s + deliveryIncome(d), 0)
      const monthExpenses = myExpenses.filter((e) => monthOf(e.date) === month)
      const byCategory = {}
      for (const e of monthExpenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + num(e.amount_rm)
      const expense = monthExpenses.reduce((s, e) => s + num(e.amount_rm), 0)
      return {
        month, volume, claim, transport, bf, purchases, cf, cogs, byCategory, expense,
        income: claim + transport,
        netIncome: claim + transport - cogs - expense,
        row: myCosting.find((r) => Number(r.plant_id) === singlePlant && r.month === month) ?? null,
      }
    })

    // every defined category gets a row (even with no data), plus any ad-hoc
    // ones found in the records
    const categories = expenseCategories.map((c) => c.name)
    const extra = [...new Set(cols.flatMap((c) => Object.keys(c.byCategory)))]
      .filter((name) => !expenseCategories.some((c) => c.name === name))

    const total = (fn) => cols.reduce((s, c) => s + fn(c), 0)
    return { cols, categories: [...categories, ...extra], total }
  }, [pours, expenses, costing, expenseCategories, materials, materialTxns, deliveries, inSelection, selectedPlantIds, year, singlePlant])

  // upsert the claim price for (single plant, month) — the only editable input now
  const setCostingField = async (col, field, value) => {
    try {
      setError('')
      if (col.row) await update('costing', col.row.id, { [field]: value })
      else await create('costing', { plant_id: singlePlant, month: col.month, [field]: value })
    } catch (e) { setError(e.message) }
  }

  const editableCell = (col, field) => (
    <td key={col.month} className="td text-right p-1">
      <input
        type="number" step="0.01"
        className="input w-full !px-2 !py-1 text-right text-xs"
        defaultValue={col.row?.[field] ?? ''}
        placeholder="-"
        onBlur={(e) => {
          const v = e.target.value === '' ? '' : Number(e.target.value)
          if (v !== (col.row?.[field] ?? '')) setCostingField(col, field, v)
        }}
      />
    </td>
  )

  const numRow = (label, fn, opts = {}) => (
    <tr className={opts.bold ? 'bg-neutral-100 font-bold' : ''}>
      <td className={`td whitespace-nowrap ${opts.indent ? 'pl-8 text-neutral-600' : opts.bold ? '' : 'font-medium'}`}>{label}</td>
      {model.cols.map((c) => {
        const v = fn(c)
        return (
          <td key={c.month} className={`td text-right ${opts.red && v < 0 ? 'text-red-600' : ''}`}>
            {opts.fmt ? opts.fmt(v) : rm(v)}
          </td>
        )
      })}
      {(() => {
        const v = model.total(fn)
        return <td className={`td text-right font-bold bg-neutral-50 ${opts.red && v < 0 ? 'text-red-600' : ''}`}>{opts.fmt ? opts.fmt(v) : rm(v)}</td>
      })()}
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {singlePlant === null && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
            Viewing aggregated figures — select a single plant to edit the claim price.
          </span>
        )}
        <span className="text-xs text-neutral-400">COGS is computed from priced material movement; transport from internal deliveries.</span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1300px]">
          <thead>
            <tr>
              <th className="th">Month</th>
              {MONTH_NAMES.map((m) => <th key={m} className="th text-right">{m}</th>)}
              <th className="th text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {numRow('Concrete Volume (m³)', (c) => c.volume, { fmt: (v) => (v ? fmtNum(v, 1) : '') })}
            {singlePlant !== null ? (
              <tr>
                <td className="td font-medium whitespace-nowrap">Claim Price (RM/m³)</td>
                {model.cols.map((c) => editableCell(c, 'claim_price_rm_per_m3'))}
                <td className="td bg-neutral-50" />
              </tr>
            ) : numRow('Claim Price (RM/m³)', () => 0, { fmt: () => '—' })}
            {numRow('Production Claim', (c) => c.claim, { bold: true })}
            {numRow('Transport Income', (c) => c.transport, { indent: true })}
            {numRow('Total Income', (c) => c.income, { bold: true })}

            <tr><td colSpan={14} className="td label bg-blue-50/50 !text-blue-900">Less: COGS (Cost of Goods Sold)</td></tr>
            {numRow('Inventory B/F', (c) => c.bf, { indent: true })}
            {numRow('Purchases', (c) => c.purchases, { indent: true })}
            {numRow('Inventory C/F', (c) => c.cf, { indent: true })}
            {numRow('COGS', (c) => c.cogs, { bold: true })}

            <tr><td colSpan={14} className="td label bg-blue-50/50 !text-blue-900">Expenses</td></tr>
            {model.categories.map((name) =>
              <CategoryRow key={name} name={name} cols={model.cols} total={model.total} />)}
            {numRow('Total Expenses', (c) => c.expense, { bold: true })}
            {numRow('NET INCOME', (c) => c.netIncome, { bold: true, red: true })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CategoryRow({ name, cols, total }) {
  return (
    <tr>
      <td className="td pl-8 text-neutral-600 whitespace-nowrap">{name}</td>
      {cols.map((c) => (
        <td key={c.month} className="td text-right">{rm(c.byCategory[name] ?? 0)}</td>
      ))}
      <td className="td text-right font-bold bg-neutral-50">{rm(total((c) => c.byCategory[name] ?? 0))}</td>
    </tr>
  )
}
