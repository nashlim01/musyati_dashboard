import { useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useData } from '../lib/data.jsx'
import {
  totalProduction, productionDays, salesRevenue, allocate,
  monthCosting, activeMonths, prevMonthOf, sumDeliveryIncome, num, sumTxns,
} from '../lib/calc.js'
import { fmtRM, fmtNum, fmtDate } from '../lib/format.js'
import { KpiCard, SectionCard, Empty, ExportButtons } from '../components/ui.jsx'

const GRADE_COLORS = ['#0f766e', '#155e75', '#1e40af', '#7c3aed', '#be185d', '#b91c1c', '#c2410c', '#a16207', '#4d7c0f', '#374151']

export default function Overview() {
  const { sales, payments, pours, deliveries, expenses, costing, materials, materialTxns, grades, gradesById, inSelection, selectedPlantIds } = useData()

  const d = useMemo(() => {
    const mySales = sales.filter(inSelection)
    const myPayments = payments.filter(inSelection)
    const myPours = pours.filter(inSelection)
    const myExpenses = expenses.filter(inSelection)
    const myCosting = costing.filter(inSelection)
    const myTxns = materialTxns.filter(inSelection)

    const production = totalProduction(myPours)
    const days = productionDays(myPours)
    const totalExpense = myExpenses.reduce((s, e) => s + num(e.amount_rm), 0)

    // COGS aggregated per plant per active month (priced material movement)
    const months = activeMonths({ pours: myPours, expenses: myExpenses, costing: myCosting, deliveries })
    let cogs = 0
    for (const plantId of selectedPlantIds) {
      const pTxns = materialTxns.filter((t) => Number(t.plant_id) === plantId)
      for (const month of months) {
        cogs += monthCosting({
          plantId, month, prevMonth: prevMonthOf(month),
          pours: [], expenses: [], materialTxns: pTxns, materials, deliveries,
        }).cogs
      }
    }
    // income = concrete sales (Musyati + external) + internal-delivery transport.
    // transport is netted: only deliveries leaving the current selection count.
    const revenue = salesRevenue(mySales)
    const transport = sumDeliveryIncome(deliveries.filter((dl) =>
      selectedPlantIds.includes(Number(dl.from_plant_id)) && !selectedPlantIds.includes(Number(dl.to_plant_id))))
    const netIncome = revenue + transport - cogs - totalExpense

    const account = allocate(mySales, myPayments)

    // daily production timeline
    const byDate = new Map()
    for (const p of myPours) byDate.set(p.date, (byDate.get(p.date) ?? 0) + num(p.volume_m3))
    const timeline = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, volume]) => ({ date: fmtDate(date), volume }))

    // volume by grade
    const byGrade = new Map()
    for (const p of myPours) {
      const name = gradesById[p.grade_id]?.name ?? '?'
      byGrade.set(name, (byGrade.get(name) ?? 0) + num(p.volume_m3))
    }
    const volumeByGrade = grades
      .map((g) => ({ name: g.name, volume: byGrade.get(g.name) ?? 0 }))
      .filter((g) => g.volume > 0)

    // materials usage (materials are global; only transactions are plant-scoped)
    const usage = materials
      .map((m) => ({ name: m.name, usage: sumTxns(myTxns, m.id, 'usage') }))
      .filter((m) => m.usage > 0)

    return {
      production, days,
      avgDaily: days ? production / days : 0,
      totalExpense, netIncome, transport, cogs,
      revenue,
      outstanding: account.outstanding,
      credit: account.credit,
      timeline, volumeByGrade, usage,
    }
  }, [sales, payments, pours, deliveries, expenses, costing, materials, materialTxns, grades, gradesById, inSelection, selectedPlantIds])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <ExportButtons filename="overview-volume-by-grade" label="Export summary" build={() => ({
          title: 'Production Volume by Grade',
          meta: [
            `Total production: ${fmtNum(d.production, 1)} m³ over ${d.days} days`,
            `Sales revenue ${fmtRM(d.revenue)} · Net income ${fmtRM(d.netIncome)} · Outstanding ${fmtRM(d.outstanding)}`,
          ],
          columns: [
            { header: 'Grade', value: (g) => g.name },
            { header: 'Volume (m³)', align: 'right', value: (g) => g.volume, text: (g) => fmtNum(g.volume, 1) },
          ], rows: d.volumeByGrade,
        })} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard label="Total Production" value={fmtNum(d.production, 1)} sub="m³" color="text-teal-700" />
        <KpiCard label="Production Days" value={d.days} sub="active days" />
        <KpiCard label="Avg Daily" value={fmtNum(d.avgDaily, 1)} sub="m³ / day" color="text-amber-600" />
        <KpiCard label="Transport Income" value={fmtRM(d.transport)} sub="internal delivery trips" color="text-blue-800" />
        <KpiCard label="Total Expenses" value={fmtRM(d.totalExpense + d.cogs)} sub="COGS + operating" color="text-red-700" />
        <KpiCard label="Net Income" value={fmtRM(d.netIncome)} sub="sales + transport − COGS − exp." color={d.netIncome < 0 ? 'text-red-700' : 'text-emerald-700'} />
        <KpiCard label="Sales Revenue" value={fmtRM(d.revenue)} sub="concrete sales" color="text-blue-700" />
        <KpiCard label="Outstanding" value={fmtRM(d.outstanding)} sub={d.credit > 0 ? `RM ${fmtNum(d.credit)} credit held` : 'awaiting payment'} color={d.outstanding > 0 ? 'text-red-700' : 'text-emerald-700'} />
      </div>

      <SectionCard title="Daily Production Timeline (m³)">
        {d.timeline.length === 0 ? <Empty>No pour records yet</Empty> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={d.timeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${fmtNum(v)} m³`, 'Volume']} />
              <Area type="monotone" dataKey="volume" stroke="#0f766e" fill="#0f766e22" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-5">
        <SectionCard title="Volume by Grade (m³)">
          {d.volumeByGrade.length === 0 ? <Empty>No pour records yet</Empty> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.volumeByGrade} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${fmtNum(v)} m³`, 'Volume']} />
                <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                  {d.volumeByGrade.map((_, i) => <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Materials Usage (tonnes)">
          {d.usage.length === 0 ? <Empty>No material transactions yet</Empty> : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={d.usage} dataKey="usage" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {d.usage.map((_, i) => <Cell key={i} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
