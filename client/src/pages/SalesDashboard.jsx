import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, ReferenceLine,
} from 'recharts'
import { useData } from '../lib/data.jsx'
import {
  saleTotal, allocate, monthCosting, prevMonthOf, deliveryIncome,
  monthOf, num, totalProduction,
} from '../lib/calc.js'
import { fmtRM, fmtNum, fmtMonth, todayISO } from '../lib/format.js'
import { SectionCard, Empty, KpiCard } from '../components/ui.jsx'

const COLORS = ['#0f766e', '#1e40af', '#be185d', '#c2410c', '#7c3aed', '#a16207']

const addMonths = (ym, n) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function project(values, ahead) {
  const n = values.length
  if (n < 2) return Array(ahead).fill(values[n - 1] ?? 0)
  const xm = (n - 1) / 2
  const ym = values.reduce((a, b) => a + b, 0) / n
  let cov = 0, varx = 0
  values.forEach((v, i) => { cov += (i - xm) * (v - ym); varx += (i - xm) ** 2 })
  const slope = cov / varx
  return Array.from({ length: ahead }, (_, k) => Math.max(0, ym + slope * (n + k - xm)))
}

export default function SalesDashboard() {
  const {
    sales, payments, pours, deliveries, expenses, costing, materials, materialTxns,
    companiesById, gradesById, inSelection, selectedPlantIds,
  } = useData()
  const [drilled, setDrilled] = useState(false)

  const d = useMemo(() => {
    const mySales = sales.filter(inSelection)
    const myPayments = payments.filter(inSelection)
    const myPours = pours.filter(inSelection)
    const myExpenses = expenses.filter(inSelection)
    const myCosting = costing.filter(inSelection)
    // transport that actually leaves the selected group (internal transfers net out)
    const myDeliveries = deliveries.filter((dl) =>
      selectedPlantIds.includes(Number(dl.from_plant_id)) && !selectedPlantIds.includes(Number(dl.to_plant_id)))
    const today = todayISO()
    const currentMonth = monthOf(today)

    const account = allocate(mySales, myPayments)

    const monthSet = new Set([
      ...mySales.map((s) => monthOf(s.date)),
      ...myPours.map((p) => monthOf(p.date)),
      ...myExpenses.map((e) => monthOf(e.date)),
      ...myDeliveries.map((dl) => monthOf(dl.date)),
      ...myCosting.map((c) => c.month),
    ])
    monthSet.delete('')
    const months = [...monthSet].sort()

    const rows = months.map((month) => {
      const monthPours = myPours.filter((p) => monthOf(p.date) === month)
      const volume = totalProduction(monthPours)
      // COGS computed per plant (auto from priced material movement)
      let cogs = 0
      for (const plantId of selectedPlantIds) {
        const m = monthCosting({
          plantId, month, prevMonth: prevMonthOf(month),
          pours: [], expenses: [], materialTxns: materialTxns.filter((t) => Number(t.plant_id) === plantId),
          materials, deliveries,
        })
        cogs += m.cogs
      }
      const transport = myDeliveries.filter((dl) => monthOf(dl.date) === month).reduce((t, dl) => t + deliveryIncome(dl), 0)
      const monthSales = mySales.filter((s) => monthOf(s.date) === month)
      const salesRev = monthSales.reduce((t, s) => t + saleTotal(s), 0)
      const saleVolume = monthSales.reduce((t, s) => t + num(s.volume_m3), 0)
      const expense = myExpenses.filter((e) => monthOf(e.date) === month).reduce((t, e) => t + num(e.amount_rm), 0)
      const income = salesRev + transport
      const cost = cogs + expense
      const collected = myPayments.filter((p) => monthOf(p.date) === month).reduce((t, p) => t + num(p.amount_rm), 0)
      return {
        month, label: fmtMonth(month),
        salesRev, transport, income, cogs, expense, cost, saleVolume,
        profit: income - cost, volume, collected, billed: salesRev,
      }
    })

    // revenue projection
    const complete = rows.filter((r) => r.month < currentMonth)
    const partial = rows.find((r) => r.month === currentMonth)
    const series = complete.map((r) => r.income)
    let projection = []
    if (series.length >= 2) {
      const lastActual = partial ?? complete[complete.length - 1]
      const points = []
      if (partial) {
        const [y, m] = currentMonth.split('-').map(Number)
        const daysInMonth = new Date(y, m, 0).getDate()
        const dayOfMonth = Number(today.slice(8, 10))
        points.push({ month: currentMonth, value: (partial.income / dayOfMonth) * daysInMonth })
      }
      const trend = project(series, partial ? 2 : 3)
      trend.forEach((v, i) => points.push({ month: addMonths(currentMonth, (partial ? 1 : 0) + i), value: v }))
      projection = points
      projection.unshift({ month: lastActual.month, value: lastActual.income, anchor: true })
    }
    const projChart = [...rows.map((r) => ({ label: fmtMonth(r.month), month: r.month, actual: r.income }))]
    for (const p of projection) {
      const hit = projChart.find((r) => r.month === p.month)
      if (hit) hit.projected = p.value
      else projChart.push({ label: `${fmtMonth(p.month)} •`, month: p.month, projected: p.value })
    }
    projChart.sort((a, b) => a.month.localeCompare(b.month))
    const next3 = projection.filter((p) => !p.anchor).reduce((t, p) => t + p.value, 0)

    // receivables aging: each sale's unpaid remainder bucketed by its own age
    const aging = new Map()
    const now = new Date(`${today}T00:00:00`)
    for (const s of mySales) {
      const remainder = saleTotal(s) - Math.min(saleTotal(s), num(account.paidById.get(s.id)))
      if (remainder <= 0.005) continue
      const name = companiesById[s.company_id]?.name ?? '?'
      const days = Math.floor((now - new Date(`${s.date}T00:00:00`)) / 86400000)
      const bucket = days <= 30 ? 'b0' : days <= 60 ? 'b30' : 'b60'
      if (!aging.has(name)) aging.set(name, { name, b0: 0, b30: 0, b60: 0 })
      aging.get(name)[bucket] += remainder
    }
    const agingRows = [...aging.values()].sort((a, b) => (b.b0 + b.b30 + b.b60) - (a.b0 + a.b30 + a.b60))

    // unit economics: avg sale price per m³ sold vs cost per m³ produced
    const unitRows = rows.filter((r) => r.saleVolume > 0 || r.volume > 0).map((r) => ({
      label: r.label,
      price: r.saleVolume > 0 ? r.salesRev / r.saleVolume : 0,
      cost: r.volume > 0 ? r.cost / r.volume : 0,
    }))

    // customer mix (external sales) + per-company outstanding from the account
    const byCompany = new Map()
    for (const s of mySales) {
      const name = companiesById[s.company_id]?.name ?? '?'
      if (!byCompany.has(name)) byCompany.set(name, { name, value: 0, id: Number(s.company_id) })
      byCompany.get(name).value += saleTotal(s)
    }
    for (const c of byCompany.values()) {
      const a = account.account.get(c.id)
      c.outstanding = a ? Math.max(0, -a.balance) : 0
    }
    const companyRows = [...byCompany.values()].filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
    // own company "Musyati" vs everyone else (external customers)
    const musyatiRows = companyRows.filter((c) => /musyati/i.test(c.name))
    const externalRows = companyRows.filter((c) => !/musyati/i.test(c.name))
    const musyatiTotal = musyatiRows.reduce((t, c) => t + c.value, 0)
    const externalSalesTotal = externalRows.reduce((t, c) => t + c.value, 0)

    const byGrade = new Map()
    for (const s of mySales) {
      const name = gradesById[s.grade_id]?.name ?? '?'
      byGrade.set(name, (byGrade.get(name) ?? 0) + saleTotal(s))
    }
    const gradeRows = [...byGrade.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)


    const totIncome = rows.reduce((t, r) => t + r.income, 0)
    const totCost = rows.reduce((t, r) => t + r.cost, 0)
    const totVolume = rows.reduce((t, r) => t + r.volume, 0)
    const totSaleVolume = rows.reduce((t, r) => t + r.saleVolume, 0)
    const totSales = rows.reduce((t, r) => t + r.salesRev, 0)

    return {
      rows, projChart, next3, agingRows, dso: account.dso, unitRows, companyRows, gradeRows,
      musyatiTotal, externalSalesTotal, externalRows,
      totIncome, totCost,
      profit: totIncome - totCost,
      margin: totIncome > 0 ? ((totIncome - totCost) / totIncome) * 100 : 0,
      costPerM3: totVolume ? totCost / totVolume : 0,
      pricePerM3: totSaleVolume ? totSales / totSaleVolume : 0,
      outstanding: account.outstanding,
      credit: account.credit,
    }
  }, [sales, payments, pours, deliveries, expenses, costing, materials, materialTxns, companiesById, gradesById, inSelection, selectedPlantIds])

  const hasData = d.rows.length > 0
  const rmTip = (v) => fmtRM(v)
  const revenueRing = [
    { name: 'Musyati', value: d.musyatiTotal },
    { name: 'External Sales', value: d.externalSalesTotal },
  ].filter((r) => r.value > 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Total Income" value={fmtRM(d.totIncome)} sub="sales + transport" color="text-blue-800" />
        <KpiCard label="Profit" value={fmtRM(d.profit)} sub="income − COGS − expenses" color={d.profit < 0 ? 'text-red-700' : 'text-emerald-700'} />
        <KpiCard label="Profit Margin" value={`${fmtNum(d.margin, 1)}%`} sub="overall" color={d.margin < 0 ? 'text-red-700' : 'text-emerald-700'} />
        <KpiCard label="Avg Sale Price" value={fmtRM(d.pricePerM3)} sub="per m³ sold" color="text-blue-700" />
        <KpiCard label="Cost per m³" value={fmtRM(d.costPerM3)} sub="COGS + expenses ÷ volume" color="text-red-700" />
        <KpiCard label="Collection Speed" value={`${fmtNum(d.dso, 0)} days`} sub={`avg sale → payment · ${fmtRM(d.outstanding)} unpaid`} color="text-amber-600" />
      </div>

      <SectionCard title="Monthly Financial Performance — Income vs Cost vs Profit">
        {!hasData ? <Empty /> : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={d.rows} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v, name) => [fmtRM(v), { salesRev: 'Concrete Sales', transport: 'Transport', cost: 'Total Cost', profit: 'Profit' }[name] ?? name]} />
              <Legend formatter={(v) => ({ salesRev: 'Concrete Sales', transport: 'Transport', cost: 'Total Cost (COGS + Expenses)', profit: 'Profit' }[v] ?? v)} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="salesRev" stackId="income" fill="#0f766e" />
              <Bar dataKey="transport" stackId="income" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
              <ReferenceLine y={0} stroke="#999" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-5">
        <SectionCard title="Revenue Trend & Projection" right={<span className="mono text-xs text-neutral-400">next 3 months ≈ {fmtRM(d.next3)}</span>}>
          {!hasData ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={d.projChart} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v, name) => [fmtRM(v), name === 'actual' ? 'Income' : 'Projected (trend)']} />
                <Bar dataKey="actual" fill="#1e40af" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="projected" stroke="#7c3aed" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-neutral-400 mt-1">Dashed line = least-squares trend of monthly income; the current month is projected from its daily run-rate.</p>
        </SectionCard>

        <SectionCard title="Cashflow — Billed vs Collected">
          {!hasData ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.rows} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v, name) => [fmtRM(v), name === 'billed' ? 'Billed (sale month)' : 'Collected (payment month)']} />
                <Legend formatter={(v) => v === 'billed' ? 'Billed' : 'Collected'} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="billed" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-neutral-400 mt-1">Collected = payments received that month (cash + reload credit).</p>
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <SectionCard title="Receivables Aging — who owes what, and for how long">
          {d.agingRows.length === 0 ? <Empty>Nothing outstanding 🎉</Empty> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d.agingRows} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip formatter={(v, name) => [fmtRM(v), { b0: '0–30 days', b30: '31–60 days', b60: 'Over 60 days' }[name]]} />
                <Legend formatter={(v) => ({ b0: '0–30 days', b30: '31–60 days', b60: 'Over 60 days' }[v])} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="b0" stackId="a" fill="#fbbf24" />
                <Bar dataKey="b30" stackId="a" fill="#f97316" />
                <Bar dataKey="b60" stackId="a" fill="#dc2626" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Unit Economics — sale price vs cost per m³">
          {d.unitRows.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={d.unitRows} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name) => [fmtRM(v), name === 'price' ? 'Avg sale price /m³' : 'Cost /m³']} />
                <Legend formatter={(v) => v === 'price' ? 'Avg sale price /m³' : 'Cost /m³ (COGS + expenses)'} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="price" stroke="#1e40af" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cost" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-[11px] text-neutral-400 mt-1">The gap between the lines is your margin per cube.</p>
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <SectionCard
          title="Revenue Mix — Musyati vs external customers"
          right={drilled
            ? <button className="text-xs text-blue-700 hover:underline cursor-pointer" onClick={() => setDrilled(false)}>← back</button>
            : <span className="text-[11px] text-neutral-400">click “External Sales” to drill in</span>}
        >
          {revenueRing.length === 0 ? <Empty /> : (
            <div className="grid grid-cols-2 gap-3 items-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={revenueRing} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={drilled ? 70 : 90} paddingAngle={2}
                    onClick={(_, i) => revenueRing[i]?.name === 'External Sales' && setDrilled((v) => !v)}
                  >
                    {revenueRing.map((r) => <Cell key={r.name} fill={r.name === 'Musyati' ? '#1e40af' : '#0f766e'} cursor={r.name === 'External Sales' ? 'pointer' : 'default'} />)}
                  </Pie>
                  {drilled && (
                    <Pie data={d.externalRows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={76} outerRadius={104} paddingAngle={1}>
                      {d.externalRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  )}
                  <Tooltip formatter={rmTip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <table className="w-full">
                <thead><tr><th className="th">{drilled ? 'Customer' : 'Group'}</th><th className="th text-right">Revenue</th><th className="th text-right">Unpaid</th></tr></thead>
                <tbody>
                  {(drilled ? d.externalRows : revenueRing).map((c, i) => (
                    <tr key={c.name}>
                      <td className="td text-xs"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: drilled ? COLORS[i % COLORS.length] : (c.name === 'Musyati' ? '#1e40af' : '#0f766e') }} />{c.name}</td>
                      <td className="td text-right text-xs">{fmtNum(c.value)}</td>
                      <td className={`td text-right text-xs ${c.outstanding > 0 ? 'text-red-600 font-semibold' : 'text-neutral-400'}`}>{c.outstanding ? fmtNum(c.outstanding) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Revenue by Grade (RM)">
          {d.gradeRows.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={d.gradeRows} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={rmTip} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {d.gradeRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
