import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { num, monthOf, monthCosting, totalProduction, prevMonthOf, deliveryIncome, saleTotal } from '../lib/calc.js'
import { fmtRM, fmtNum, fmtMonth } from '../lib/format.js'
import { ExportButtons } from '../components/ui.jsx'

// costing cells show nothing at all when the value is zero
const rm = (v) => (v === 0 ? '' : fmtRM(v))

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Costing() {
  const data = useData()
  const { sales, pours, expenses, expenseCategories, materials, materialTxns, deliveries, inSelection, selectedPlantIds } = data

  const years = useMemo(() => {
    const ys = new Set()
    for (const r of [...pours, ...expenses, ...sales].filter(inSelection)) ys.add(String(r.date).slice(0, 4))
    ys.delete('')
    const list = [...ys].sort()
    return list.length ? list : [String(new Date().getFullYear())]
  }, [pours, expenses, sales, inSelection])
  const [year, setYear] = useState(() => years[years.length - 1])

  const model = useMemo(() => {
    const myPours = pours.filter(inSelection)
    const myExpenses = expenses.filter(inSelection)
    const months = MONTH_NAMES.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)

    const cols = months.map((month) => {
      // aggregate per selected plant: concrete sales + auto-COGS from priced material movement
      let salesRev = 0, bf = 0, purchases = 0, cf = 0, cogs = 0
      for (const plantId of selectedPlantIds) {
        const m = monthCosting({
          plantId, month, prevMonth: prevMonthOf(month),
          pours: [], sales: sales.filter((s) => Number(s.plant_id) === plantId),
          expenses: [], materialTxns: materialTxns.filter((t) => Number(t.plant_id) === plantId),
          materials, deliveries,
        })
        salesRev += m.salesRev; bf += m.bf; purchases += m.purchases; cf += m.cf; cogs += m.cogs
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
      const income = salesRev + transport
      return {
        month, volume, salesRev, transport, bf, purchases, cf, cogs, byCategory, expense,
        income, netIncome: income - cogs - expense,
      }
    })

    const categories = expenseCategories.map((c) => c.name)
    const extra = [...new Set(cols.flatMap((c) => Object.keys(c.byCategory)))]
      .filter((name) => !expenseCategories.some((c) => c.name === name))

    const total = (fn) => cols.reduce((s, c) => s + fn(c), 0)
    return { cols, categories: [...categories, ...extra], total }
  }, [sales, pours, expenses, expenseCategories, materials, materialTxns, deliveries, inSelection, selectedPlantIds, year])

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
        <span className="text-xs text-neutral-400">Income = concrete sales + internal-delivery transport. COGS is computed from priced material movement; everything here is calculated.</span>
        <div className="flex-1" />
        <ExportButtons filename={`costing-${year}`} build={() => ({
          title: `Costing Statement ${year}`, subtitle: `Year ${year}`,
          columns: [
            { header: 'Month', value: (c) => fmtMonth(c.month) },
            { header: 'Volume (m³)', align: 'right', value: (c) => c.volume, text: (c) => fmtNum(c.volume, 1) },
            { header: 'Concrete Sales (RM)', align: 'right', value: (c) => c.salesRev, text: (c) => fmtNum(c.salesRev) },
            { header: 'Transport (RM)', align: 'right', value: (c) => c.transport, text: (c) => fmtNum(c.transport) },
            { header: 'Total Income (RM)', align: 'right', value: (c) => c.income, text: (c) => fmtNum(c.income) },
            { header: 'Inventory B/F (RM)', align: 'right', value: (c) => c.bf, text: (c) => fmtNum(c.bf) },
            { header: 'Purchases (RM)', align: 'right', value: (c) => c.purchases, text: (c) => fmtNum(c.purchases) },
            { header: 'Inventory C/F (RM)', align: 'right', value: (c) => c.cf, text: (c) => fmtNum(c.cf) },
            { header: 'COGS (RM)', align: 'right', value: (c) => c.cogs, text: (c) => fmtNum(c.cogs) },
            { header: 'Total Expenses (RM)', align: 'right', value: (c) => c.expense, text: (c) => fmtNum(c.expense) },
            { header: 'Net Income (RM)', align: 'right', value: (c) => c.netIncome, text: (c) => fmtNum(c.netIncome) },
          ], rows: model.cols,
        })} />
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
            <tr><td colSpan={14} className="td label bg-emerald-50/50 !text-emerald-900">Income</td></tr>
            {numRow('Concrete Sales', (c) => c.salesRev, { indent: true })}
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
