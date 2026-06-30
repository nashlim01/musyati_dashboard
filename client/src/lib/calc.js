// Every formula in the app lives here, computed from raw rows — totals are never stored.

export const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const saleTotal = (s) =>
  num(s.volume_m3) * num(s.rate_rm) + num(s.trip) * num(s.rm_per_trip)

export const monthOf = (dateStr) => String(dateStr ?? '').slice(0, 7)

// ---------------------------------------------------------------------------
// Company account model (single pooled ledger)
// Every payment — cash-in or reload-credit alike — goes into one pool that clears
// the company's earliest unpaid orders first (FIFO). Only once everything is
// settled does the surplus become Credit Balance (prepaid for upcoming orders);
// a shortfall is Outstanding/overdue. Per-sale status is simply Paid or Unpaid.
// `method` (cash | reload) is recorded on the payment for reference only.
// ---------------------------------------------------------------------------
export const payIsReload = (p) => p.method === 'reload'

const byDateThenId = (a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id

// FIFO-match one company's payments to its orders, oldest-first.
function matchCompany(sales, payments) {
  const orders = sales.slice().sort(byDateThenId).map((s) => ({ sale: s, total: saleTotal(s), remaining: saleTotal(s) }))
  const pays = payments.slice().sort(byDateThenId).map((p) => ({ pay: p, remaining: num(p.amount_rm) }))

  let weightedDays = 0, settled = 0, oi = 0
  for (const p of pays) {
    while (p.remaining > 0.0001 && oi < orders.length) {
      const o = orders[oi]
      const take = Math.min(o.remaining, p.remaining)
      o.remaining -= take
      p.remaining -= take
      settled += take
      const days = Math.max(0, (new Date(`${p.pay.date}T00:00:00`) - new Date(`${o.sale.date}T00:00:00`)) / 86400000)
      if (Number.isFinite(days)) weightedDays += take * days
      if (o.remaining <= 0.0001) oi++
    }
  }

  const statusById = new Map()
  const paidById = new Map()
  for (const o of orders) {
    paidById.set(o.sale.id, o.total - o.remaining)
    statusById.set(o.sale.id, o.remaining <= 0.005 ? 'paid' : 'unpaid')
  }

  const funds = pays.reduce((s, p) => s + num(p.pay.amount_rm), 0)
  const ordersTotal = orders.reduce((s, o) => s + o.total, 0)
  const balance = funds - ordersTotal // positive = credit, negative = outstanding
  return {
    funds, ordersTotal, balance,
    outstanding: Math.max(0, -balance), credit: Math.max(0, balance),
    statusById, paidById, settled, weightedDays,
  }
}

// Allocate across all companies in the given (already plant-scoped) rows.
export function allocate(sales, payments) {
  const byCo = new Map()
  const ensure = (c) => { if (!byCo.has(c)) byCo.set(c, { sales: [], payments: [] }); return byCo.get(c) }
  for (const s of sales) ensure(Number(s.company_id)).sales.push(s)
  for (const p of payments) ensure(Number(p.company_id)).payments.push(p)

  const account = new Map()
  const statusById = new Map()
  const paidById = new Map()
  let collected = 0, outstanding = 0, credit = 0, weightedDays = 0, settled = 0
  for (const [c, grp] of byCo) {
    const m = matchCompany(grp.sales, grp.payments)
    account.set(c, { funds: m.funds, ordersTotal: m.ordersTotal, balance: m.balance, outstanding: m.outstanding, credit: m.credit })
    for (const [id, st] of m.statusById) statusById.set(id, st)
    for (const [id, amt] of m.paidById) paidById.set(id, amt)
    collected += m.settled
    outstanding += m.outstanding
    credit += m.credit
    weightedDays += m.weightedDays
    settled += m.settled
  }
  return {
    account, statusById, paidById,
    collected, outstanding, credit,
    dso: settled > 0 ? weightedDays / settled : 0,
  }
}

// Account for a single company.
export function companyAccount(companyId, sales, payments) {
  const cs = sales.filter((s) => Number(s.company_id) === Number(companyId))
  const cp = payments.filter((p) => Number(p.company_id) === Number(companyId))
  const m = matchCompany(cs, cp)
  return { funds: m.funds, orders: m.ordersTotal, balance: m.balance, outstanding: m.outstanding, credit: m.credit }
}

// Dated ledger for one company: cash-in and reload-in shown separately, with a
// single running balance (negative = outstanding/overdue, positive = credit).
export function buildLedger(sales, payments) {
  const byDate = new Map()
  const ensure = (date) => {
    if (!byDate.has(date)) byDate.set(date, { date, cashIn: 0, reloadIn: 0, order: 0, files: [] })
    return byDate.get(date)
  }
  for (const s of sales) { if (s.date) ensure(s.date).order += saleTotal(s) }
  for (const p of payments) {
    if (!p.date) continue
    const r = ensure(p.date)
    if (payIsReload(p)) r.reloadIn += num(p.amount_rm); else r.cashIn += num(p.amount_rm)
    // attachment links (bank slips) recorded against the payment
    String(p.attachments ?? '').split(';').map((t) => t.trim()).filter(Boolean)
      .forEach((name) => r.files.push({ id: p.id, name }))
  }
  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  let balance = 0
  for (const r of rows) {
    balance += r.cashIn + r.reloadIn - r.order
    r.balance = balance
  }
  return rows
}

export const salesRevenue = (sales) => sales.reduce((sum, s) => sum + saleTotal(s), 0)

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------
export const totalProduction = (pours) => pours.reduce((sum, p) => sum + num(p.volume_m3), 0)
export const productionDays = (pours) => new Set(pours.map((p) => p.date)).size

// ---------------------------------------------------------------------------
// Internal deliveries (transport income + cement movement)
// ---------------------------------------------------------------------------
export const deliveryIncome = (d) => num(d.trips) * num(d.trip_rate_rm)
export const sumDeliveryIncome = (deliveries) => deliveries.reduce((s, d) => s + deliveryIncome(d), 0)

// transport income earned by a plant (as the sender) in a month
export const transportIncome = (deliveries, { plantId, month }) =>
  deliveries
    .filter((d) => Number(d.from_plant_id) === Number(plantId) && (!month || monthOf(d.date) === month))
    .reduce((s, d) => s + deliveryIncome(d), 0)

// ---------------------------------------------------------------------------
// Materials (priced; no opening balance). Deliveries move cement between plants.
// plantIds null = global (intra-group transfers net to zero).
// ---------------------------------------------------------------------------
export function materialBalance(material, txns, deliveries = [], plantIds = null) {
  let bal = 0
  for (const t of txns) {
    if (Number(t.material_id) !== Number(material.id)) continue
    const q = num(t.qty_tonnes)
    bal += t.type === 'received' ? q : -q
  }
  for (const d of deliveries) {
    if (Number(d.cement_material_id) !== Number(material.id)) continue
    const q = num(d.cement_qty)
    if (!q) continue
    if (!plantIds || plantIds.includes(Number(d.from_plant_id))) bal -= q
    if (!plantIds || plantIds.includes(Number(d.to_plant_id))) bal += q
  }
  return bal
}

export const materialValue = (material, txns, deliveries, plantIds) =>
  materialBalance(material, txns, deliveries, plantIds) * num(material.unit_price_rm)

export const sumTxns = (txns, materialId, type) =>
  txns
    .filter((t) => Number(t.material_id) === Number(materialId) && t.type === type)
    .reduce((s, t) => s + num(t.qty_tonnes), 0)

// value of external purchases (received) for a plant in a month
export function purchasesValue(materialTxns, materials, { plantId, month }) {
  const priceOf = (id) => num(materials.find((m) => Number(m.id) === Number(id))?.unit_price_rm)
  return materialTxns
    .filter((t) => t.type === 'received' && Number(t.plant_id) === Number(plantId) && monthOf(t.date) === month)
    .reduce((s, t) => s + num(t.qty_tonnes) * priceOf(t.material_id), 0)
}

// total stock value held by a plant as of the end of a month (inventory C/F)
export function inventoryValue(materialTxns, deliveries, materials, { plantId, uptoMonth }) {
  const upto = (date) => !uptoMonth || monthOf(date) <= uptoMonth
  return materials.reduce((sum, m) => {
    const txns = materialTxns.filter((t) => Number(t.plant_id) === Number(plantId) && upto(t.date))
    const dels = deliveries.filter((d) => upto(d.date))
    return sum + materialBalance(m, txns, dels, [Number(plantId)]) * num(m.unit_price_rm)
  }, 0)
}

// ---------------------------------------------------------------------------
// Costing (per plant + month). COGS now derives from priced material movement.
// claim = month volume × claim price;  COGS = B/F + Purchases − C/F
// transport = delivery income;  net = claim + transport − COGS − expenses
// ---------------------------------------------------------------------------
export function monthCosting({ plantId, month, prevMonth, costingRow, pours, sales = [], expenses, materialTxns, materials, deliveries }) {
  // production is an output metric; income comes from sales + transport, not claim
  const volume = totalProduction(pours.filter((p) => monthOf(p.date) === month))
  const price = num(costingRow?.claim_price_rm_per_m3)
  const productionValue = volume * price // info only
  const transport = transportIncome(deliveries, { plantId, month })
  const salesRev = sales
    .filter((s) => Number(s.plant_id) === Number(plantId) && monthOf(s.date) === month)
    .reduce((sum, s) => sum + saleTotal(s), 0)

  const purchases = purchasesValue(materialTxns, materials, { plantId, month })
  const cf = inventoryValue(materialTxns, deliveries, materials, { plantId, uptoMonth: month })
  const bf = prevMonth ? inventoryValue(materialTxns, deliveries, materials, { plantId, uptoMonth: prevMonth }) : 0
  const cogs = bf + purchases - cf

  const expense = expenses
    .filter((e) => monthOf(e.date) === month)
    .reduce((s, e) => s + num(e.amount_rm), 0)

  const income = salesRev + transport
  return {
    month, volume, price, productionValue, salesRev, transport,
    bf, purchases, cf, cogs, expense,
    income,
    netIncome: income - cogs - expense,
  }
}

// previous YYYY-MM
export const prevMonthOf = (month) => {
  const [y, m] = String(month).split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// All months that have any activity, sorted ascending
export function activeMonths({ sales = [], pours = [], expenses = [], costing = [], payments = [], deliveries = [] }) {
  const months = new Set()
  for (const r of sales) months.add(monthOf(r.date))
  for (const r of pours) months.add(monthOf(r.date))
  for (const r of expenses) months.add(monthOf(r.date))
  for (const r of payments) months.add(monthOf(r.date))
  for (const r of deliveries) months.add(monthOf(r.date))
  for (const r of costing) months.add(r.month)
  months.delete('')
  return [...months].sort()
}
