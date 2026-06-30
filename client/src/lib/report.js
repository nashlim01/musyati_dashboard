// Combined "whole dashboard" export — a multi-sheet Excel workbook of every
// table, and an executive-summary PDF. Both respect the current plant selection.
import { exportExcel, exportReportPDF } from './export.js'
import {
  saleTotal, allocate, num, monthOf, deliveryIncome,
  materialBalance, sumTxns, salesRevenue, sumDeliveryIncome,
} from './calc.js'
import { fmtRM, fmtNum, fmtDate, fmtMonth } from './format.js'

const PAYVIA = { reload: 'Reload deduction', cash: 'Cash payment' }
const STATUS = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid' }
const ATT = { present: 'Present', half_day: 'Half Day', absent: 'Absent' }
const MTYPE = { service: 'Service', repair: 'Repair', inspection: 'Inspection' }

// Pull the plant-scoped slices we need out of the data context.
function slices(d) {
  const inSel = d.inSelection
  const wIds = new Set(d.workers.filter(inSel).map((w) => Number(w.id)))
  const mIds = new Set(d.machines.filter(inSel).map((m) => Number(m.id)))
  return {
    sales: d.sales.filter(inSel),
    payments: d.payments.filter(inSel),
    pours: d.pours.filter(inSel),
    deliveries: d.deliveries.filter((x) =>
      d.selectedPlantIds.includes(Number(x.from_plant_id)) || d.selectedPlantIds.includes(Number(x.to_plant_id))),
    materialTxns: d.materialTxns.filter(inSel),
    expenses: d.expenses.filter(inSel),
    machines: d.machines.filter(inSel),
    maintenance: d.maintenance.filter((r) => mIds.has(Number(r.machine_id))),
    workers: d.workers.filter(inSel),
    attendance: d.attendance.filter((a) => wIds.has(Number(a.worker_id))),
    projects: d.projects,
  }
}

function buildSheets(d) {
  const s = slices(d)
  const { statusById, paidById } = allocate(s.sales, s.payments)
  const co = (id) => d.companiesById[id]?.name ?? ''
  const gr = (id) => d.gradesById[id]?.name ?? ''
  const pl = (id) => d.plantsById[id]?.name ?? ''
  const wk = (id) => d.workersById?.[id]?.name ?? ''
  const mc = (id) => d.machinesById[id]?.name ?? ''
  const ds = (rows, columns, name) => ({ name, columns, rows })

  return [
    ds(s.sales, [
      { header: 'Company', value: (x) => co(x.company_id) },
      { header: 'Ref', value: (x) => x.ref },
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'DO No.', value: (x) => x.do_no },
      { header: 'Plant', value: (x) => pl(x.plant_id) },
      { header: 'Grade', value: (x) => gr(x.grade_id) },
      { header: 'Vol (m³)', value: (x) => num(x.volume_m3) },
      { header: 'Rate (RM)', value: (x) => num(x.rate_rm) },
      { header: 'Trip', value: (x) => num(x.trip) },
      { header: 'RM/Trip', value: (x) => num(x.rm_per_trip) },
      { header: 'Total (RM)', value: (x) => saleTotal(x) },
      { header: 'Pay Via', value: (x) => PAYVIA[x.pay_method === 'reload' ? 'reload' : 'cash'] },
      { header: 'Payment', value: (x) => STATUS[statusById.get(x.id) ?? 'unpaid'] },
      { header: 'Paid (RM)', value: (x) => Math.min(saleTotal(x), num(paidById.get(x.id))) },
      { header: 'Invoice', value: (x) => (Number(x.invoice_issued) === 1 ? 'Issued' : 'Pending') },
      { header: 'Remarks', value: (x) => x.remarks },
    ], 'Sales'),
    ds(s.payments, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'Company', value: (x) => co(x.company_id) },
      { header: 'Method', value: (x) => (x.method === 'reload' ? 'Reload credit' : 'Cash') },
      { header: 'Amount (RM)', value: (x) => num(x.amount_rm) },
      { header: 'Remarks', value: (x) => x.remarks },
    ], 'Payments'),
    ds(s.pours, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'Plant', value: (x) => pl(x.plant_id) },
      { header: 'Grade', value: (x) => gr(x.grade_id) },
      { header: 'Volume (m³)', value: (x) => num(x.volume_m3) },
      { header: 'Remarks', value: (x) => x.remarks },
    ], 'Production'),
    ds(s.deliveries, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'DO No.', value: (x) => x.do_no },
      { header: 'Grade', value: (x) => gr(x.grade_id) },
      { header: 'Vol (m³)', value: (x) => num(x.volume_m3) },
      { header: 'From', value: (x) => pl(x.from_plant_id) },
      { header: 'To', value: (x) => pl(x.to_plant_id) },
      { header: 'Trips', value: (x) => num(x.trips) },
      { header: 'Trip Rate (RM)', value: (x) => num(x.trip_rate_rm) },
      { header: 'Transport (RM)', value: (x) => deliveryIncome(x) },
    ], 'Internal Deliveries'),
    ds(d.materials, [
      { header: 'Material', value: (m) => m.name },
      { header: 'Unit', value: (m) => m.unit },
      { header: 'Unit Price (RM)', value: (m) => num(m.unit_price_rm) },
      { header: 'Received', value: (m) => sumTxns(s.materialTxns, m.id, 'received') },
      { header: 'Usage', value: (m) => sumTxns(s.materialTxns, m.id, 'usage') },
      { header: 'Balance', value: (m) => materialBalance(m, s.materialTxns, s.deliveries, d.selectedPlantIds) },
      { header: 'Stock Value (RM)', value: (m) => materialBalance(m, s.materialTxns, s.deliveries, d.selectedPlantIds) * num(m.unit_price_rm) },
    ], 'Materials Balance'),
    ds(s.materialTxns, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'Material', value: (x) => d.materialsById[x.material_id]?.name ?? '' },
      { header: 'Plant', value: (x) => pl(x.plant_id) },
      { header: 'Type', value: (x) => x.type },
      { header: 'Qty', value: (x) => num(x.qty_tonnes) },
      { header: 'Remarks', value: (x) => x.remarks },
    ], 'Material Txns'),
    ds(s.machines, [
      { header: 'Machine', value: (m) => m.name },
      { header: 'Type', value: (m) => m.type },
      { header: 'Reg No.', value: (m) => m.reg_no },
      { header: 'Plant', value: (m) => pl(m.plant_id) },
      { header: 'Status', value: (m) => m.status },
    ], 'Machines'),
    ds(s.maintenance, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'Machine', value: (x) => mc(x.machine_id) },
      { header: 'Type', value: (x) => MTYPE[x.type] ?? x.type },
      { header: 'Description', value: (x) => x.description },
      { header: 'Cost (RM)', value: (x) => num(x.cost_rm) },
    ], 'Maintenance'),
    ds(s.workers, [
      { header: 'Name', value: (w) => w.name },
      { header: 'Role', value: (w) => w.role },
      { header: 'Plant', value: (w) => pl(w.plant_id) },
      { header: 'Daily Rate (RM)', value: (w) => num(w.daily_rate_rm) },
      { header: 'Status', value: (w) => w.status },
    ], 'Workers'),
    ds(s.attendance, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'Worker', value: (x) => wk(x.worker_id) },
      { header: 'Status', value: (x) => ATT[x.status] ?? x.status },
      { header: 'OT Hours', value: (x) => num(x.ot_hours) },
      { header: 'Remarks', value: (x) => x.remarks },
    ], 'Attendance'),
    ds(s.expenses, [
      { header: 'Date', value: (x) => x.date, text: (x) => fmtDate(x.date) },
      { header: 'Plant', value: (x) => pl(x.plant_id) },
      { header: 'Category', value: (x) => x.category },
      { header: 'Description', value: (x) => x.description },
      { header: 'Amount (RM)', value: (x) => num(x.amount_rm) },
    ], 'Expenses'),
  ].filter((sheet) => sheet.rows.length > 0)
}

export function exportFullReportExcel(d) {
  const sheets = buildSheets(d)
  if (!sheets.length) { alert('Nothing to export for the current selection.'); return }
  exportExcel('musyati-report', sheets)
}

export function exportFullReportPDF(d) {
  const s = slices(d)
  const { account, outstanding, credit } = allocate(s.sales, s.payments)

  const production = s.pours.reduce((t, p) => t + num(p.volume_m3), 0)
  const revenue = salesRevenue(s.sales)
  const transport = sumDeliveryIncome(d.deliveries.filter((x) =>
    d.selectedPlantIds.includes(Number(x.from_plant_id)) && !d.selectedPlantIds.includes(Number(x.to_plant_id))))
  const expenses = s.expenses.reduce((t, e) => t + num(e.amount_rm), 0)
  const maintCost = s.maintenance.reduce((t, r) => t + num(r.cost_rm), 0)

  // Sales by company (+ outstanding from the allocation account)
  const byCo = new Map()
  for (const x of s.sales) {
    const id = Number(x.company_id)
    if (!byCo.has(id)) byCo.set(id, { id, name: d.companiesById[id]?.name ?? '?', value: 0 })
    byCo.get(id).value += saleTotal(x)
  }
  const companyRows = [...byCo.values()]
    .map((c) => ({ ...c, outstanding: account.get(c.id)?.outstanding ?? 0 }))
    .sort((a, b) => b.value - a.value)

  // Revenue by grade
  const byGrade = new Map()
  for (const x of s.sales) {
    const name = d.gradesById[x.grade_id]?.name ?? '?'
    byGrade.set(name, (byGrade.get(name) ?? 0) + saleTotal(x))
  }
  const gradeRows = [...byGrade.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  // Maintenance by machine
  const byMachine = new Map()
  for (const r of s.maintenance) {
    const name = d.machinesById[r.machine_id]?.name ?? '?'
    byMachine.set(name, (byMachine.get(name) ?? 0) + num(r.cost_rm))
  }
  const machineRows = [...byMachine.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  // Expenses by category
  const byCat = new Map()
  for (const e of s.expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + num(e.amount_rm))
  const catRows = [...byCat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  const netIncome = revenue + transport - expenses

  exportReportPDF('musyati-report', {
    title: 'Operations Report',
    subtitle: new Date().toLocaleDateString('en-MY'),
    kpis: [
      { label: 'Production (m³)', value: fmtNum(production, 1) },
      { label: 'Sales Revenue', value: fmtRM(revenue) },
      { label: 'Transport Income', value: fmtRM(transport) },
      { label: 'Operating Expenses', value: fmtRM(expenses) },
      { label: 'Maintenance Cost', value: fmtRM(maintCost) },
      { label: 'Net (sales+transport−exp)', value: fmtRM(netIncome) },
      { label: 'Outstanding', value: fmtRM(outstanding) },
      { label: 'Credit Held', value: fmtRM(credit) },
    ],
    sections: [
      companyRows.length && {
        title: 'Sales by Company', columns: [
          { header: 'Company', value: (r) => r.name },
          { header: 'Sales (RM)', align: 'right', value: (r) => r.value, text: (r) => fmtNum(r.value) },
          { header: 'Outstanding (RM)', align: 'right', value: (r) => r.outstanding, text: (r) => fmtNum(r.outstanding) },
        ], rows: companyRows,
      },
      gradeRows.length && {
        title: 'Revenue by Grade', columns: [
          { header: 'Grade', value: (r) => r.name },
          { header: 'Revenue (RM)', align: 'right', value: (r) => r.value, text: (r) => fmtNum(r.value) },
        ], rows: gradeRows,
      },
      machineRows.length && {
        title: 'Maintenance Cost by Machine', columns: [
          { header: 'Machine', value: (r) => r.name },
          { header: 'Cost (RM)', align: 'right', value: (r) => r.value, text: (r) => fmtNum(r.value) },
        ], rows: machineRows,
      },
      catRows.length && {
        title: 'Expenses by Category', columns: [
          { header: 'Category', value: (r) => r.name },
          { header: 'Amount (RM)', align: 'right', value: (r) => r.value, text: (r) => fmtNum(r.value) },
        ], rows: catRows,
      },
    ].filter(Boolean),
  })
}
