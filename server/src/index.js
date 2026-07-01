import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as db from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Excel can't hold binaries — attachments live on disk next to the workbook,
// one folder per sale, with filenames recorded in the Sales.do_file column.
const ATTACH_DIR = path.join(__dirname, '..', 'data', 'attachments')

// the client dev server owns PORT; the API always uses API_PORT (default 4000)
const PORT = process.env.API_PORT || 4000
const app = express()
app.use(cors())
app.use(express.json())

// resource key -> sheet config.
// fks: column -> referenced sheet (insert/update must point at an existing row)
// dependents: [sheet, column] pairs that block deletion while rows still reference this one
const RESOURCES = {
  plants: {
    sheet: 'Plants', required: ['name'],
    dependents: [['Sales', 'plant_id'], ['Pours', 'plant_id'], ['MaterialTxns', 'plant_id'], ['Expenses', 'plant_id'], ['Costing', 'plant_id'], ['Machines', 'plant_id'], ['Workers', 'plant_id'], ['Deliveries', 'from_plant_id'], ['Deliveries', 'to_plant_id']],
  },
  companies: {
    sheet: 'Companies', required: ['name'],
    dependents: [['Sales', 'company_id'], ['Payments', 'company_id']],
  },
  grades: {
    sheet: 'Grades', required: ['name'],
    dependents: [['Sales', 'grade_id'], ['Pours', 'grade_id']],
  },
  materials: {
    sheet: 'Materials', required: ['name'],
    dependents: [['MaterialTxns', 'material_id'], ['Deliveries', 'cement_material_id']],
  },
  sales: {
    sheet: 'Sales', required: ['plant_id', 'company_id', 'grade_id', 'date', 'volume_m3', 'rate_rm'],
    fks: { plant_id: 'Plants', company_id: 'Companies', grade_id: 'Grades', project_id: 'Projects' },
  },
  payments: {
    sheet: 'Payments', required: ['company_id', 'date', 'amount_rm'],
    fks: { company_id: 'Companies', plant_id: 'Plants' },
    validate: (row) => {
      if (row.method && !['cash', 'reload'].includes(row.method)) {
        return 'method must be cash or reload'
      }
      if (!(Number(row.amount_rm) > 0)) return 'amount_rm must be greater than 0'
    },
  },
  deliveries: {
    sheet: 'Deliveries', required: ['date', 'from_plant_id', 'to_plant_id', 'grade_id', 'volume_m3', 'trips', 'trip_rate_rm'],
    fks: { from_plant_id: 'Plants', to_plant_id: 'Plants', grade_id: 'Grades', cement_material_id: 'Materials' },
    validate: (row) => {
      if (Number(row.from_plant_id) === Number(row.to_plant_id)) return 'from and to plant must differ'
      if (Number(row.volume_m3) < 0 || Number(row.trips) < 0 || Number(row.trip_rate_rm) < 0) return 'values must be positive'
      if (row.cement_qty !== '' && row.cement_qty !== undefined && Number(row.cement_qty) < 0) return 'cement_qty must be positive'
    },
  },
  pours: {
    sheet: 'Pours', required: ['plant_id', 'grade_id', 'date', 'volume_m3'],
    fks: { plant_id: 'Plants', grade_id: 'Grades', project_id: 'Projects' },
  },
  'material-txns': {
    sheet: 'MaterialTxns', required: ['plant_id', 'material_id', 'date', 'type', 'qty_tonnes'],
    fks: { plant_id: 'Plants', material_id: 'Materials' },
    validate: (row) => {
      if (!['usage', 'received', 'transfer_out'].includes(row.type)) {
        return 'type must be usage, received or transfer_out'
      }
    },
  },
  expenses: {
    sheet: 'Expenses', required: ['plant_id', 'date', 'category', 'amount_rm'],
    fks: { plant_id: 'Plants', project_id: 'Projects' },
  },
  costing: {
    sheet: 'Costing', required: ['plant_id', 'month'],
    fks: { plant_id: 'Plants' },
    validate: (row, sheet, id) => {
      if (!/^\d{4}-\d{2}$/.test(String(row.month))) return 'month must be YYYY-MM'
      const dup = db.getAll(sheet).find((r) =>
        r.month === row.month && Number(r.plant_id) === Number(row.plant_id) && Number(r.id) !== Number(id))
      if (dup) return `Costing row for ${row.month} already exists for this plant`
    },
  },
  'expense-categories': { sheet: 'ExpenseCategories', required: ['name'] },
  machines: {
    sheet: 'Machines', required: ['plant_id', 'name', 'status'],
    fks: { plant_id: 'Plants' },
    dependents: [['MaintenanceRecords', 'machine_id']],
    validate: (row) => {
      if (!['active', 'maintenance', 'breakdown', 'idle'].includes(row.status)) {
        return 'status must be active, maintenance, breakdown or idle'
      }
    },
  },
  maintenance: {
    sheet: 'MaintenanceRecords', required: ['machine_id', 'date', 'type'],
    fks: { machine_id: 'Machines' },
    validate: (row) => {
      if (!['service', 'repair', 'inspection'].includes(row.type)) {
        return 'type must be service, repair or inspection'
      }
    },
  },
  workers: {
    sheet: 'Workers', required: ['plant_id', 'name', 'role'],
    fks: { plant_id: 'Plants' },
    dependents: [['Attendance', 'worker_id']],
  },
  projects: {
    sheet: 'Projects', required: ['name', 'type', 'status'],
    dependents: [['ProjectUpdates', 'project_id'], ['Sales', 'project_id'], ['Pours', 'project_id'], ['Expenses', 'project_id'], ['FoundationGroups', 'project_id']],
    validate: (row) => {
      if (!['planning', 'active', 'on_hold', 'completed'].includes(row.status)) {
        return 'status must be planning, active, on_hold or completed'
      }
      // plant_ids is a comma-separated list — every id must exist
      const ids = String(row.plant_ids ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      for (const id of ids) {
        if (!db.getById('Plants', id)) return `Invalid plant_ids: no Plants row with id ${id}`
      }
      if (row.start_date && row.target_end_date && String(row.target_end_date) < String(row.start_date)) {
        return 'target_end_date must be after start_date'
      }
    },
  },
  'project-updates': {
    sheet: 'ProjectUpdates', required: ['project_id', 'date', 'progress_pct'],
    fks: { project_id: 'Projects' },
    validate: (row) => {
      const pct = Number(row.progress_pct)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return 'progress_pct must be between 0 and 100'
      if (row.plant_id !== '' && row.plant_id !== undefined && !db.getById('Plants', row.plant_id)) {
        return `Invalid plant_id: no Plants row with id ${row.plant_id}`
      }
    },
  },
  'foundation-groups': {
    sheet: 'FoundationGroups', required: ['project_id', 'name'],
    fks: { project_id: 'Projects' },
    dependents: [['Piles', 'group_id']],
  },
  piles: {
    sheet: 'Piles', required: ['group_id'],
    fks: { group_id: 'FoundationGroups' },
    validate: (row) => {
      if (row.status && !['not_done', 'in_progress', 'done'].includes(row.status)) {
        return 'status must be not_done, in_progress or done'
      }
    },
  },
  // --- Executive Project Dashboard ---
  'exec-overview': { sheet: 'ExecOverview', required: [] },
  'ew-activities': { sheet: 'EwActivities', required: ['name'] },
  'pavement-layers': { sheet: 'PavementLayers', required: ['name'] },
  'culvert-zones': { sheet: 'CulvertZones', required: ['zone'] },
  bridges: { sheet: 'Bridges', required: ['name'], dependents: [['BridgeProgress', 'bridge_id']] },
  'bridge-progress': { sheet: 'BridgeProgress', required: ['bridge_id', 'element'], fks: { bridge_id: 'Bridges' } },
  'bridge-piles': { sheet: 'BridgePiles', required: ['bridge_id', 'element'], fks: { bridge_id: 'Bridges' } },
  'project-machinery': { sheet: 'ProjectMachinery', required: ['name'] },
  'monthly-targets': { sheet: 'MonthlyTargets', required: [] },
  'project-log': { sheet: 'ProjectLog', required: [] },
  attendance: {
    sheet: 'Attendance', required: ['worker_id', 'date', 'status'],
    fks: { worker_id: 'Workers' },
    validate: (row, sheet, id) => {
      if (!['present', 'half_day', 'absent'].includes(row.status)) {
        return 'status must be present, half_day or absent'
      }
      const dup = db.getAll(sheet).find((r) =>
        r.date === row.date && Number(r.worker_id) === Number(row.worker_id) && Number(r.id) !== Number(id))
      if (dup) return 'Attendance for this worker and date already exists'
    },
  },
}

function checkRow(cfg, row, id = null) {
  for (const field of cfg.required ?? []) {
    if (row[field] === undefined || row[field] === null || row[field] === '') {
      return `Missing required field: ${field}`
    }
  }
  for (const [field, refSheet] of Object.entries(cfg.fks ?? {})) {
    if (row[field] !== undefined && row[field] !== '' && !db.getById(refSheet, row[field])) {
      return `Invalid ${field}: no ${refSheet} row with id ${row[field]}`
    }
  }
  return cfg.validate?.(row, cfg.sheet, id)
}

// One-shot read of the whole workbook — the client computes everything from this.
app.get('/api/data', (_req, res) => res.json(db.allData()))
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/backup', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Disposition', `attachment; filename="musyati-data-${stamp}.xlsx"`)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.send(db.workbookBuffer())
})
app.get('/api/backups', (_req, res) => res.json(db.listBackups()))

// Executive Dashboard — copy the latest snapshot forward into a new month.
app.post('/api/exec/new-month', (req, res) => {
  const result = db.startNewMonth(req.body?.month)
  if (result.error) return res.status(400).json({ error: result.error })
  res.status(201).json(result)
})

// --- Sale attachments ---
const saleDir = (id) => path.join(ATTACH_DIR, `sale-${Number(id)}`)
const listAttachments = (id) =>
  fs.existsSync(saleDir(id)) ? fs.readdirSync(saleDir(id)).filter((f) => !f.startsWith('.')) : []
const syncDoFile = (id) => db.update('Sales', id, { do_file: listAttachments(id).join('; ') })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = saleDir(req.params.id)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => cb(null, file.originalname.replace(/[^\w.\- ()]/g, '_')),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
})

app.get('/api/sales/:id/attachments', (req, res) => res.json(listAttachments(req.params.id)))

app.post('/api/sales/:id/attachments', (req, res) => {
  if (!db.getById('Sales', req.params.id)) return res.status(404).json({ error: 'Sale not found' })
  upload.array('files')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    syncDoFile(req.params.id)
    res.json(listAttachments(req.params.id))
  })
})

app.delete('/api/sales/:id/attachments/:filename', (req, res) => {
  const file = path.join(saleDir(req.params.id), path.basename(req.params.filename))
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' })
  fs.unlinkSync(file)
  syncDoFile(req.params.id)
  res.json(listAttachments(req.params.id))
})

// --- Payment attachments (bank slips, transfer proof) — stored under payment-<id> ---
const paymentDir = (id) => path.join(ATTACH_DIR, `payment-${Number(id)}`)
const listPaymentFiles = (id) =>
  fs.existsSync(paymentDir(id)) ? fs.readdirSync(paymentDir(id)).filter((f) => !f.startsWith('.')) : []
const syncPaymentFiles = (id) => db.update('Payments', id, { attachments: listPaymentFiles(id).join('; ') })

const uploadPayment = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = paymentDir(req.params.id)
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => cb(null, file.originalname.replace(/[^\w.\- ()]/g, '_')),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
})

app.get('/api/payments/:id/attachments', (req, res) => res.json(listPaymentFiles(req.params.id)))

app.post('/api/payments/:id/attachments', (req, res) => {
  if (!db.getById('Payments', req.params.id)) return res.status(404).json({ error: 'Payment not found' })
  uploadPayment.array('files')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    syncPaymentFiles(req.params.id)
    res.json(listPaymentFiles(req.params.id))
  })
})

app.delete('/api/payments/:id/attachments/:filename', (req, res) => {
  const file = path.join(paymentDir(req.params.id), path.basename(req.params.filename))
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' })
  fs.unlinkSync(file)
  syncPaymentFiles(req.params.id)
  res.json(listPaymentFiles(req.params.id))
})

// serves the actual files, e.g. /api/files/sale-3/DO-12345.pdf or /api/files/payment-5/slip.pdf
app.use('/api/files', express.static(ATTACH_DIR))

for (const [key, cfg] of Object.entries(RESOURCES)) {
  app.get(`/api/${key}`, (_req, res) => res.json(db.getAll(cfg.sheet)))

  app.post(`/api/${key}`, (req, res) => {
    const error = checkRow(cfg, req.body)
    if (error) return res.status(400).json({ error })
    res.status(201).json(db.insert(cfg.sheet, req.body))
  })

  app.put(`/api/${key}/:id`, (req, res) => {
    const existing = db.getById(cfg.sheet, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const merged = { ...existing, ...req.body }
    const error = checkRow(cfg, merged, req.params.id)
    if (error) return res.status(400).json({ error })
    res.json(db.update(cfg.sheet, req.params.id, req.body))
  })

  app.delete(`/api/${key}/:id`, (req, res) => {
    if (!db.getById(cfg.sheet, req.params.id)) return res.status(404).json({ error: 'Not found' })
    for (const [depSheet, depField] of cfg.dependents ?? []) {
      const count = db.getAll(depSheet).filter((r) => Number(r[depField]) === Number(req.params.id)).length
      if (count > 0) {
        return res.status(409).json({ error: `Cannot delete: ${count} ${depSheet} record(s) still reference it` })
      }
    }
    db.remove(cfg.sheet, req.params.id)
    res.json({ ok: true })
  })
}

// --- Serve the built dashboard (production / app mode) ---
// When client/dist exists, this one server hosts both the API and the UI on a
// single port, so the whole app runs as one process (see launch-musyati.command).
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist')
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST))
  // SPA fallback: any non-API route returns index.html
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')))
}

db.load()
app.listen(PORT, () => {
  console.log(`Musyati Tracking Monitor running on http://localhost:${PORT}`)
  if (!fs.existsSync(CLIENT_DIST)) {
    console.log('(UI not built yet — run "npm run build" or use the launcher script)')
  }
})
