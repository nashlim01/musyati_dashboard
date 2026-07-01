import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { buildSeedData, buildExecSeed } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const FILE_PATH = path.join(DATA_DIR, 'musyati-data.xlsx')
const MAX_BACKUPS = 30

// Sheet name -> ordered columns. The workbook is the database:
// every sheet is a table, every row has an integer `id`,
// and *_id columns are foreign keys into other sheets.
export const SCHEMA = {
  // type: 'batching' | 'premix' — which workspace the plant belongs to (blank = batching)
  Plants: ['id', 'name', 'location', 'active', 'trip_rate_rm', 'type'],
  Companies: ['id', 'name'],
  Grades: ['id', 'name', 'default_rate'],
  // materials are global — every plant draws from the same catalogue. Priced (no opening balance).
  Materials: ['id', 'name', 'unit', 'unit_price_rm'],
  Sales: [
    'id', 'plant_id', 'project_id', 'company_id', 'ref', 'date', 'do_no', 'grade_id',
    'volume_m3', 'rate_rm', 'trip', 'rm_per_trip',
    // pay_method: how the order is settled — 'cash' (cash payment) or 'reload' (reload-credit deduction)
    'pay_method', 'invoice_issued', 'invoice_date', 'do_file', 'remarks',
  ],
  // contractor account: payments add funds, orders (Sales) draw them down. method: cash | reload
  // attachments: ';'-joined filenames stored on disk under data/attachments/payment-<id>/
  Payments: ['id', 'company_id', 'plant_id', 'sale_id', 'date', 'amount_rm', 'method', 'remarks', 'attachments'],
  Pours: ['id', 'plant_id', 'project_id', 'date', 'grade_id', 'volume_m3', 'remarks'],
  // internal concrete transfer between plants — transport income + cement stock movement
  Deliveries: ['id', 'date', 'from_plant_id', 'to_plant_id', 'do_no', 'grade_id', 'volume_m3', 'trips', 'trip_rate_rm', 'cement_material_id', 'cement_qty', 'remarks'],
  MaterialTxns: ['id', 'plant_id', 'material_id', 'date', 'type', 'qty_tonnes', 'remarks'],
  Expenses: ['id', 'plant_id', 'project_id', 'date', 'category', 'description', 'amount_rm'],
  Costing: ['id', 'plant_id', 'month', 'claim_price_rm_per_m3', 'inventory_bf_rm', 'purchases_rm', 'inventory_cf_rm'],
  ExpenseCategories: ['id', 'name'],
  Machines: ['id', 'plant_id', 'name', 'type', 'reg_no', 'status', 'remarks'],
  MaintenanceRecords: ['id', 'machine_id', 'date', 'type', 'description', 'cost_rm', 'next_service_date', 'remarks'],
  Workers: ['id', 'plant_id', 'name', 'role', 'contact', 'daily_rate_rm', 'status', 'join_date', 'remarks'],
  Attendance: ['id', 'worker_id', 'date', 'status', 'ot_hours', 'remarks'],
  // plant_ids is a comma-separated list ("1,2") — a project can be served by several plants
  Projects: ['id', 'code', 'name', 'type', 'client', 'location', 'plant_ids', 'contract_value_rm', 'start_date', 'target_end_date', 'status', 'remarks'],
  // progress_pct is the cumulative % complete as of that date
  ProjectUpdates: ['id', 'project_id', 'date', 'progress_pct', 'description', 'plant_id', 'remarks'],
  // bridge foundation: groups (abutment/pier) each hold a set of bore piles
  FoundationGroups: ['id', 'project_id', 'name', 'diameter_mm', 'sort_order', 'remarks'],
  Piles: ['id', 'group_id', 'label', 'status', 'is_test_pile', 'done_date', 'remarks'],

  // --- Executive Project Dashboard (single package; snapshot figures, % computed) ---
  ExecOverview: [
    'id', 'title', 'subtitle', 'contract_sum_mil', 'start_date', 'end_date',
    'length_km', 'chainage_from', 'chainage_to', 'road_width_text', 'data_as_at', 'construction_period_text',
    'physical_pct', 'physical_plan_pct', 'financial_pct', 'financial_plan_pct',
    'earthwork_total_mil', 'earth_mil', 'rock_mil', 'cut_to_dispose_mil', 'cut_to_fill_mil',
    'dcr_tonne', 'premix20_tonne', 'acw20_m3', 'acb28_m3',
    'culverts_total', 'culverts_completed', 'box_culverts', 'pipe_culverts',
    'poles_total', 'poles_done', 'poles_km', 'cable_spans', 'cable_km',
    'contract_excl_mil', 'total_expenses_mil', 'current_profit_mil', 'claims_to_date_mil',
    'balance_to_claim_mil', 'cumulative_ipc_mil', 'avg_monthly_claim_mil',
  ],
  EwActivities: ['id', 'name', 'pct', 'sort_order'],
  PavementLayers: ['id', 'name', 'total_km', 'completed_km', 'sort_order'],
  CulvertZones: ['id', 'zone', 'outstanding', 'sort_order'],
  Bridges: ['id', 'name', 'span', 'length_m', 'sort_order'],
  // structure elements (Pile Cap, Column, Headstock, girder beams) as done/total counts
  BridgeProgress: ['id', 'bridge_id', 'element', 'done', 'total', 'sort_order'],
  // individual bored piles — status: not_done | in_progress | done; is_test_pile flag
  BridgePiles: ['id', 'bridge_id', 'element', 'label', 'status', 'is_test_pile', 'done_date', 'sort_order'],
  ProjectMachinery: ['id', 'name', 'count', 'sort_order'],
  MonthlyTargets: ['id', 'month', 'text', 'done', 'sort_order'],
  // audit trail of dashboard edits — reference past inputs when keying updates
  ProjectLog: ['id', 'ts', 'section', 'field', 'label', 'old_value', 'new_value'],
}

let tables = {} // { sheetName: [row, ...] }

function emptyTables() {
  return Object.fromEntries(Object.keys(SCHEMA).map((s) => [s, []]))
}

export function load() {
  if (!fs.existsSync(FILE_PATH)) {
    tables = buildSeedData()
    persist()
    console.log(`Created new workbook with seed data at ${FILE_PATH}`)
    return
  }
  const wb = XLSX.readFile(FILE_PATH)
  tables = emptyTables()
  const rawBySheet = {}
  for (const sheet of Object.keys(SCHEMA)) {
    const ws = wb.Sheets[sheet]
    if (!ws) continue
    // raw:true keeps numbers as numbers; dates are stored as ISO text strings.
    const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
    rawBySheet[sheet] = raw
    // normalize() drops columns that are no longer part of the schema.
    tables[sheet] = raw.map((r) => normalize(sheet, r))
  }
  migrateLegacyPayments(rawBySheet)
  seedExecIfEmpty()
  seedBridgePilesIfEmpty()
  console.log(`Loaded workbook from ${FILE_PATH}`)
}

const isBoredElement = (el) => /^Abt|^P\d/i.test(String(el))

// Convert legacy bored-pile elements (stored as done/total in BridgeProgress)
// into individual pile records so each pile carries its own status + test flag.
function seedBridgePilesIfEmpty() {
  if ((tables.BridgePiles ?? []).length > 0) return
  const bored = (tables.BridgeProgress ?? []).filter((r) => isBoredElement(r.element))
  if (bored.length === 0) return
  const piles = []
  let id = 0
  for (const r of bored) {
    const total = Number(r.total) || 0
    const done = Number(r.done) || 0
    for (let i = 1; i <= total; i++) {
      piles.push(normalize('BridgePiles', {
        id: ++id, bridge_id: r.bridge_id, element: r.element, label: String(i),
        status: i <= done ? 'done' : 'not_done', is_test_pile: 0, done_date: '', sort_order: i,
      }))
    }
  }
  tables.BridgePiles = piles
  // bored elements now live in BridgePiles — keep only structure rows in BridgeProgress
  tables.BridgeProgress = (tables.BridgeProgress ?? []).filter((r) => !isBoredElement(r.element))
  persist()
  console.log(`Migrated ${bored.length} bored elements into ${piles.length} BridgePiles`)
}

// Populate the Executive Dashboard sheets with the SSLR2 Package 2B figures the
// first time they're empty (e.g. on an existing workbook created before this feature).
function seedExecIfEmpty() {
  if ((tables.ExecOverview ?? []).length > 0) return
  for (const [sheet, rows] of Object.entries(buildExecSeed())) tables[sheet] = rows
  persist()
  console.log('Seeded Executive Dashboard (SSLR2 Package 2B)')
}

// One-time migration: the old model stored payment on each sale (payment_received /
// payment_date). The new model is a company account ledger (Payments sheet). If no
// payments exist yet but sales carry the legacy flag, convert each paid sale into a
// matching `cash` payment so historical balances reconcile.
function migrateLegacyPayments(rawBySheet) {
  if ((tables.Payments ?? []).length > 0) return
  const rawSales = rawBySheet.Sales ?? []
  const legacyPaid = rawSales.filter((s) => Number(s.payment_received) === 1)
  if (legacyPaid.length === 0) return
  let id = 0
  tables.Payments = legacyPaid.map((s) => {
    const total = (Number(s.volume_m3) || 0) * (Number(s.rate_rm) || 0)
      + (Number(s.trip) || 0) * (Number(s.rm_per_trip) || 0)
    return normalize('Payments', {
      id: ++id,
      company_id: s.company_id,
      plant_id: s.plant_id,
      date: s.payment_date || s.date,
      amount_rm: total,
      method: 'cash',
      remarks: `Migrated from sale ${s.ref || s.id}`,
    })
  })
  persist()
  console.log(`Migrated ${tables.Payments.length} legacy paid sales into the Payments ledger`)
}

function backupCurrentFile() {
  if (!fs.existsSync(FILE_PATH)) return
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  fs.copyFileSync(FILE_PATH, path.join(BACKUP_DIR, `musyati-data-${stamp}.xlsx`))
  const backups = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.xlsx')).sort()
  while (backups.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(BACKUP_DIR, backups.shift()))
  }
}

function buildWorkbook() {
  const wb = XLSX.utils.book_new()
  for (const [sheet, columns] of Object.entries(SCHEMA)) {
    const ws = XLSX.utils.json_to_sheet(tables[sheet] ?? [], { header: columns })
    ws['!cols'] = columns.map((c) => ({ wch: Math.max(c.length + 2, 12) }))
    XLSX.utils.book_append_sheet(wb, ws, sheet)
  }
  return wb
}

// Atomic write: backup old file, write to temp, rename over the original.
function persist() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  backupCurrentFile()
  const tmp = FILE_PATH.replace(/\.xlsx$/, '.tmp.xlsx')
  XLSX.writeFile(buildWorkbook(), tmp)
  fs.renameSync(tmp, FILE_PATH)
}

export function workbookBuffer() {
  return XLSX.write(buildWorkbook(), { type: 'buffer', bookType: 'xlsx' })
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return []
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.xlsx')).sort().reverse()
}

export function getAll(sheet) {
  return tables[sheet] ?? []
}

export function getById(sheet, id) {
  return getAll(sheet).find((r) => Number(r.id) === Number(id))
}

function nextId(sheet) {
  return getAll(sheet).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
}

// Keep only schema columns, in schema order, so the Excel file stays clean.
// id / *_id columns are coerced to numbers so relations stay consistent.
function normalize(sheet, row) {
  const out = {}
  for (const col of SCHEMA[sheet]) {
    let v = row[col] ?? ''
    if ((col === 'id' || col.endsWith('_id')) && v !== '') v = Number(v)
    out[col] = v
  }
  return out
}

export function insert(sheet, row) {
  const record = normalize(sheet, { ...row, id: nextId(sheet) })
  tables[sheet].push(record)
  persist()
  return record
}

export function update(sheet, id, patch) {
  const idx = tables[sheet].findIndex((r) => Number(r.id) === Number(id))
  if (idx === -1) return null
  const record = normalize(sheet, { ...tables[sheet][idx], ...patch, id: Number(id) })
  tables[sheet][idx] = record
  persist()
  return record
}

export function remove(sheet, id) {
  const idx = tables[sheet].findIndex((r) => Number(r.id) === Number(id))
  if (idx === -1) return false
  tables[sheet].splice(idx, 1)
  persist()
  return true
}

export function allData() {
  return tables
}
