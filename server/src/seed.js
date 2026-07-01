// Initial data transcribed from the Medamit CBP Excel files.
// Dates are ISO strings (YYYY-MM-DD); months are YYYY-MM.

const GRADES = [
  { name: 'G15N', default_rate: 331 },
  { name: 'G20N', default_rate: 392 },
  { name: 'G25N', default_rate: 388 },
  { name: 'G30N', default_rate: 404 },
  { name: 'G35N', default_rate: 417 },
  { name: 'G40', default_rate: '' },
  { name: 'G40N', default_rate: '' },
  { name: 'G40T', default_rate: '' },
  { name: 'G50N', default_rate: '' },
  { name: 'MORTAR', default_rate: '' },
]

const MATERIALS = [
  // priced per unit; used to value stock and auto-compute Costing COGS
  { name: 'PLC', unit: 'tonne', unit_price_rm: 320 },
  { name: 'Limestone', unit: 'tonne', unit_price_rm: 45 },
  { name: 'Granite', unit: 'tonne', unit_price_rm: 55 },
  { name: 'W.Sand', unit: 'tonne', unit_price_rm: 38 },
  { name: 'Q.Sand', unit: 'tonne', unit_price_rm: 42 },
  { name: 'RPF630', unit: 'litre', unit_price_rm: 6.5 },
  { name: 'RS231SD', unit: 'litre', unit_price_rm: 7.2 },
]

const EXPENSE_CATEGORIES = [
  'Accommodation', 'Salaries and Wages', 'Office Supplies', 'Petty Cash',
  'Hardware', 'Oxygen and acetylene', 'Plywood and timber', 'Hydraulic oil etc',
  'Maintenance and Repairs', 'Machineries rental /buy', 'Transport logistic',
  'Lab Equipment', 'Stone', 'Chemical', 'Sub con operation cost', 'Land rental',
  'etc', 'Other',
]

// Concrete sales (company KKSB, Plant A — Medamit).
// total = volume*rate + trip*rm_per_trip is always computed, never stored.
const SALES = [
  ['KKSB-1', '2025-12-13', 'ME00013282', 'G25N', 3, 388, 1, 250, 1, '2025-12-12', 1],
  ['KKSB-2', '2025-12-27', 'ME00013401', 'G20N', 2, 356, 1, 100, 1, '2025-12-26', 1],
  ['KKSB-3', '2025-12-31', 'ME00013435', 'G30N', 3, 404, 1, 100, 1, '2025-12-30', 1],
  ['KKSB-4', '2026-01-05', 'ME00013446', 'G15N', 2, 331, 1, 100, 1, '2026-01-05', 1],
  ['KKSB-5', '2026-03-03', 'ME00013890', 'G35N', 2, 417, 1, 100, 1, '2026-03-03', 1],
  ['KKSB-6', '2026-03-16', 'ME00013990', 'G35N', 3.5, 417, 1, 100, 1, '2026-03-15', 1],
  ['KKSB-7', '2026-03-20', 'ME00014047', 'G20N', 3.5, 356, 1, 100, 1, '2026-05-26', 1],
  ['KKSB-8', '2026-04-04', 'ME00014172', 'G35N', 2, 417, 1, 100, 1, '2026-05-26', 1],
  ['KKSB-9', '2026-04-23', 'ME00014341', 'G20N', 3, 356, 1, 100, 1, '2026-05-26', 1],
  ['KKSB-10', '2026-04-27', 'ME00014395', 'G20N', 3.5, 356, 1, 100, 1, '2026-05-26', 1],
  ['KKSB-11', '2026-04-29', 'ME00014119', 'G15N', 3.5, 331, 1, 100, 1, '2026-05-26', 1],
  ['KKSB-12', '2026-05-23', 'ME00014675', 'G20N', 2.5, 392, 1, 100, 0, '', 0],
  ['KKSB-13', '2026-05-26', 'L100000023', 'G20N', 3, 392, 1, 100, 0, '', 0],
  ['KKSB-14', '2026-05-28', 'L100000031', 'G20N', 2, 392, 1, 100, 0, '', 0],
]

// May 2026 pours. Daily breakdown is a best-effort transcription —
// per-grade monthly totals match the Excel TOTAL row exactly:
// G15N 44, G20N 89, G25N 616.5, G35N 1, G40N 322, G40T 34, G50N 135.5
const POURS = [
  ['2026-05-02', 'G20N', 5], ['2026-05-02', 'G25N', 22], ['2026-05-02', 'G40N', 42],
  ['2026-05-03', 'G15N', 10.5],
  ['2026-05-04', 'G20N', 10], ['2026-05-04', 'G25N', 24.5],
  ['2026-05-05', 'G20N', 11], ['2026-05-05', 'G25N', 40],
  ['2026-05-06', 'G20N', 10.5], ['2026-05-06', 'G25N', 16], ['2026-05-06', 'G50N', 23],
  ['2026-05-07', 'G20N', 8], ['2026-05-07', 'G25N', 51], ['2026-05-07', 'G40N', 28], ['2026-05-07', 'G40T', 17],
  ['2026-05-08', 'G25N', 16], ['2026-05-08', 'G40N', 42],
  ['2026-05-09', 'G20N', 1], ['2026-05-09', 'G25N', 29], ['2026-05-09', 'G35N', 1],
  ['2026-05-11', 'G25N', 15], ['2026-05-11', 'G40N', 18],
  ['2026-05-12', 'G25N', 35], ['2026-05-12', 'G40N', 48], ['2026-05-12', 'G50N', 23],
  ['2026-05-13', 'G15N', 17], ['2026-05-13', 'G25N', 21],
  ['2026-05-14', 'G25N', 34],
  ['2026-05-15', 'G25N', 19],
  ['2026-05-16', 'G25N', 19],
  ['2026-05-18', 'G20N', 5.5], ['2026-05-18', 'G25N', 50], ['2026-05-18', 'G50N', 41],
  ['2026-05-19', 'G20N', 5.5], ['2026-05-19', 'G25N', 10], ['2026-05-19', 'G40N', 52],
  ['2026-05-20', 'G20N', 5.5], ['2026-05-20', 'G25N', 56], ['2026-05-20', 'G40N', 5],
  ['2026-05-21', 'G15N', 8], ['2026-05-21', 'G25N', 18], ['2026-05-21', 'G40T', 17],
  ['2026-05-22', 'G25N', 26], ['2026-05-22', 'G40N', 54],
  ['2026-05-23', 'G20N', 2.5], ['2026-05-23', 'G25N', 70], ['2026-05-23', 'G50N', 23],
  ['2026-05-24', 'G15N', 0.5], ['2026-05-24', 'G20N', 14], ['2026-05-24', 'G25N', 11],
  ['2026-05-29', 'G15N', 8], ['2026-05-29', 'G20N', 10.5], ['2026-05-29', 'G25N', 34], ['2026-05-29', 'G40N', 33], ['2026-05-29', 'G50N', 25.5],
]

// May 2026 materials, seeded as monthly aggregates from the TOTAL row.
const MATERIAL_TXNS = [
  ['PLC', 'usage', 569.94], ['Limestone', 'usage', 1296.51], ['Granite', 'usage', 159.19],
  ['W.Sand', 'usage', 888.67], ['Q.Sand', 'usage', 240.68],
  ['RPF630', 'usage', 4618.9], ['RS231SD', 'usage', 2053.28],
  ['PLC', 'received', 587.62], ['Limestone', 'received', 1857.55],
  ['RPF630', 'received', 8000, '2026-05-15'], ['RS231SD', 'received', 8000, '2026-05-15'],
]

const EXPENSES = [
  ['2025-11-15', 'Machineries rental /buy', 'Machineries rental', 12300],
  ['2025-11-15', 'Transport logistic', 'Transport logistic', 17399.99],
  ['2025-12-15', 'Machineries rental /buy', 'Machineries rental', 12000],
  ['2025-12-15', 'Transport logistic', 'Transport logistic', 51300.01],
]

export function buildSeedData() {
  const plants = [
    { id: 1, name: 'Plant A — Medamit', location: 'Medamit Batching Plant', active: 1, trip_rate_rm: 100, type: 'batching' },
    { id: 2, name: 'Premix Plant', location: '', active: 1, trip_rate_rm: 0, type: 'premix' },
  ]
  const companies = [{ id: 1, name: 'KKSB' }]
  const grades = GRADES.map((g, i) => ({ id: i + 1, ...g }))
  const materials = MATERIALS.map((m, i) => ({ id: i + 1, ...m }))
  const expenseCategories = EXPENSE_CATEGORIES.map((name, i) => ({ id: i + 1, name }))

  const gradeId = (name) => grades.find((g) => g.name === name).id
  const materialId = (name) => materials.find((m) => m.name === name).id

  const sales = SALES.map((s, i) => ({
    id: i + 1, plant_id: 1, project_id: '', company_id: 1,
    ref: s[0], date: s[1], do_no: s[2], grade_id: gradeId(s[3]),
    volume_m3: s[4], rate_rm: s[5], trip: s[6], rm_per_trip: s[7],
    invoice_issued: s[10], invoice_date: s[10] ? s[1] : '',
    do_file: '', remarks: '',
  }))

  // each historically-paid sale becomes a cash payment in the company ledger
  let payId = 0
  const payments = SALES.filter((s) => s[8] === 1).map((s) => ({
    id: ++payId, company_id: 1, plant_id: 1,
    date: s[9] || s[1],
    amount_rm: s[4] * s[5] + s[6] * s[7],
    method: 'cash', remarks: `Payment for ${s[0]}`,
  }))

  const pours = POURS.map((p, i) => ({
    id: i + 1, plant_id: 1, date: p[0], grade_id: gradeId(p[1]), volume_m3: p[2], remarks: '',
  }))

  const materialTxns = MATERIAL_TXNS.map((t, i) => ({
    id: i + 1, plant_id: 1, material_id: materialId(t[0]), date: t[3] ?? '2026-05-31',
    type: t[1], qty_tonnes: t[2],
    remarks: t[3] ? '' : 'May 2026 aggregate (seeded from monthly summary)',
  }))

  const expenses = EXPENSES.map((e, i) => ({
    id: i + 1, plant_id: 1, date: e[0], category: e[1], description: e[2], amount_rm: e[3],
  }))

  // sample machinery & manpower rows so the new sections aren't empty on first run
  const machines = [
    { id: 1, plant_id: 1, name: 'Batching Plant Unit 1', type: 'Batching Plant', reg_no: 'BP-001', status: 'active', remarks: 'Sample record' },
    { id: 2, plant_id: 1, name: 'Mixer Truck 1', type: 'Mixer Truck', reg_no: 'QSR 8231', status: 'active', remarks: 'Sample record' },
    { id: 3, plant_id: 1, name: 'Wheel Loader', type: 'Loader', reg_no: 'WL-03', status: 'maintenance', remarks: 'Sample record' },
  ]
  const maintenanceRecords = [
    { id: 1, machine_id: 3, date: '2026-06-05', type: 'repair', description: 'Hydraulic hose replacement', cost_rm: 850, next_service_date: '', remarks: 'Sample record' },
    { id: 2, machine_id: 2, date: '2026-05-20', type: 'service', description: '10,000 km service', cost_rm: 1200, next_service_date: '2026-08-20', remarks: 'Sample record' },
  ]
  const workers = [
    { id: 1, plant_id: 1, name: 'Ahmad bin Ali', role: 'Plant Operator', contact: '012-3456789', daily_rate_rm: 120, status: 'active', join_date: '2025-11-01', remarks: 'Sample record' },
    { id: 2, plant_id: 1, name: 'Lim Wei Sheng', role: 'Mixer Driver', contact: '013-9876543', daily_rate_rm: 110, status: 'active', join_date: '2025-12-15', remarks: 'Sample record' },
    { id: 3, plant_id: 1, name: 'Rajan a/l Kumar', role: 'Lab Technician', contact: '014-5551234', daily_rate_rm: 100, status: 'active', join_date: '2026-01-10', remarks: 'Sample record' },
  ]
  const attendance = [
    { id: 1, worker_id: 1, date: '2026-06-09', status: 'present', ot_hours: 2, remarks: 'Sample record' },
    { id: 2, worker_id: 2, date: '2026-06-09', status: 'present', ot_hours: 0, remarks: 'Sample record' },
    { id: 3, worker_id: 3, date: '2026-06-09', status: 'half_day', ot_hours: 0, remarks: 'Sample record' },
    { id: 4, worker_id: 1, date: '2026-06-10', status: 'present', ot_hours: 0, remarks: 'Sample record' },
    { id: 5, worker_id: 2, date: '2026-06-10', status: 'absent', ot_hours: 0, remarks: 'Sample record' },
  ]

  const projects = [
    {
      id: 1, code: 'PRJ-001', name: 'Sg. Medamit Bridge Approach', type: 'Bridge',
      client: 'JKR Sarawak', location: 'Medamit', plant_ids: '1',
      contract_value_rm: 1850000, start_date: '2026-01-15', target_end_date: '2026-09-30',
      status: 'active', remarks: 'Sample record',
    },
    {
      id: 2, code: 'PRJ-002', name: 'Jalan Napir Road Maintenance', type: 'Road',
      client: 'PWD', location: 'Long Napir', plant_ids: '1',
      contract_value_rm: 420000, start_date: '2026-03-01', target_end_date: '2026-07-31',
      status: 'active', remarks: 'Sample record',
    },
  ]
  const projectUpdates = [
    { id: 1, project_id: 1, date: '2026-02-28', progress_pct: 10, description: 'Site clearing & piling mobilisation', plant_id: 1, remarks: 'Sample record' },
    { id: 2, project_id: 1, date: '2026-04-15', progress_pct: 30, description: 'Piling complete, pile caps cast', plant_id: 1, remarks: 'Sample record' },
    { id: 3, project_id: 1, date: '2026-06-01', progress_pct: 45, description: 'Abutment walls in progress', plant_id: 1, remarks: 'Sample record' },
    { id: 4, project_id: 2, date: '2026-04-10', progress_pct: 25, description: 'Pothole patching km 0–12', plant_id: 1, remarks: 'Sample record' },
    { id: 5, project_id: 2, date: '2026-05-30', progress_pct: 60, description: 'Resurfacing km 12–28', plant_id: 1, remarks: 'Sample record' },
  ]

  // sample bridge foundation for PRJ-001 (matches the status-board concept)
  const foundationGroups = [
    { id: 1, project_id: 1, name: 'Abutment A', diameter_mm: 600, sort_order: 1, remarks: '' },
    { id: 2, project_id: 1, name: 'Pier 1', diameter_mm: 600, sort_order: 2, remarks: '' },
    { id: 3, project_id: 1, name: 'Pier 2', diameter_mm: 750, sort_order: 3, remarks: '' },
    { id: 4, project_id: 1, name: 'Pier 3', diameter_mm: 750, sort_order: 4, remarks: '' },
  ]
  const piles = []
  let pid = 0
  const counts = { 1: 10, 2: 14, 3: 14, 4: 14 }
  for (const g of foundationGroups) {
    for (let i = 1; i <= counts[g.id]; i++) {
      // a couple done on the first group to show the states
      const status = g.id === 1 && i <= 1 ? 'done' : g.id === 1 && i === 2 ? 'in_progress' : 'not_done'
      piles.push({
        id: ++pid, group_id: g.id, label: String(i), status,
        is_test_pile: g.id === 1 && i === 1 ? 1 : 0,
        done_date: status === 'done' ? '2026-02-28' : '', remarks: '',
      })
    }
  }

  return {
    Plants: plants,
    Companies: companies,
    Grades: grades,
    Materials: materials,
    Sales: sales,
    Payments: payments,
    Pours: pours,
    Deliveries: [],
    MaterialTxns: materialTxns,
    Expenses: expenses,
    Costing: [],
    ExpenseCategories: expenseCategories,
    Machines: machines,
    MaintenanceRecords: maintenanceRecords,
    Workers: workers,
    Attendance: attendance,
    Projects: projects,
    ProjectUpdates: projectUpdates,
    FoundationGroups: foundationGroups,
    Piles: piles,
    ...buildExecSeed(),
  }
}

// Executive Project Dashboard — SSLR2 Package 2B figures (data as at Jun 2026).
export function buildExecSeed() {
  const ExecOverview = [{
    id: 1,
    title: 'SSLR2 PACKAGE 2B', subtitle: 'Executive Project Dashboard',
    contract_sum_mil: 747, start_date: '2024-07-17', end_date: '2028-06-16',
    length_km: 56.84, chainage_from: 'CH 49+100', chainage_to: 'CH 105+940',
    road_width_text: '3.5 m + 3.5 m = 7.0 m (Incl. 0.25 m both side marginal strip)',
    data_as_at: '2026-06', construction_period_text: '22 / 48 Months',
    physical_pct: 37.03, physical_plan_pct: 36.12, financial_pct: 37.99, financial_plan_pct: 37.10,
    earthwork_total_mil: 6.40, earth_mil: 4.14, rock_mil: 1.12, cut_to_dispose_mil: 5.26, cut_to_fill_mil: 1.14,
    dcr_tonne: 409000, premix20_tonne: 188000, acw20_m3: 95000, acb28_m3: 100000,
    culverts_total: 97, culverts_completed: 62, box_culverts: 11, pipe_culverts: 24,
    poles_total: 471, poles_done: 41, poles_km: 1.788, cable_spans: 30, cable_km: 1.372,
    contract_excl_mil: 624, total_expenses_mil: 123.85, current_profit_mil: 44.28,
    claims_to_date_mil: 230, balance_to_claim_mil: 421, cumulative_ipc_mil: 171.6, avg_monthly_claim_mil: 16.2,
  }]

  const EwActivities = [
    ['Site Clearing', 90.32], ['Cut & Dispose (Earth)', 36.06], ['Cut & Dispose (Rock)', 40.03],
    ['Cut to Fill', 49.20], ['Embankment Fill', 49.20], ['Hydroseeding', 6.15],
  ].map(([name, pct], i) => ({ id: i + 1, name, pct, sort_order: i + 1 }))

  const PavementLayers = [
    ['Subgrade', 15.36], ['Subbase', 14.49], ['Road Base', 13.75],
  ].map(([name, completed_km], i) => ({ id: i + 1, name, total_km: 56.84, completed_km, sort_order: i + 1 }))

  const CulvertZones = [
    ['Zone 1', 15], ['Zone 2', 7], ['Zone 3', 1], ['Zone 4', 5], ['Zone 5', 7], ['Zone 6', 0],
  ].map(([zone, outstanding], i) => ({ id: i + 1, zone, outstanding, sort_order: i + 1 }))

  // bridges + a bored-pile / structure matrix per bridge (done/total; mostly not started)
  const bridgeDefs = [
    ['Sg Senap', 3, 104.8], ['Sg Limbang 1', 7, 215.6], ['Sg Limbang 2', 7, 225.6],
    ['Sg Ensuami', 5, 256.0], ['Sg Limbang 3', 9, 140.2],
  ]
  const Bridges = bridgeDefs.map(([name, span, length_m], i) => ({ id: i + 1, name, span, length_m, sort_order: i + 1 }))
  const STRUCT = ['Pile Cap', 'Column', 'Headstock', 'T20', 'T25', 'T30', 'T35']
  const BridgeProgress = []   // structure elements (done/total)
  const BridgePiles = []      // individual bored piles (status + test flag)
  let bpId = 0, plId = 0
  for (const br of Bridges) {
    const piers = Math.max(0, Number(br.span) - 1)
    const boreEls = ['Abt A', ...Array.from({ length: piers }, (_, k) => `P${k + 1}`), 'Abt B']
    boreEls.forEach((element, gi) => {
      const total = element.startsWith('Abt') ? 14 : 16
      for (let i = 1; i <= total; i++) {
        BridgePiles.push({ id: ++plId, bridge_id: br.id, element, label: String(i), status: 'not_done', is_test_pile: gi === 0 && i === 1 ? 1 : 0, done_date: '', sort_order: i })
      }
    })
    STRUCT.forEach((element, k) => BridgeProgress.push({ id: ++bpId, bridge_id: br.id, element, done: 0, total: 14, sort_order: k + 1 }))
  }

  const ProjectMachinery = [
    ['Excavators', 56], ['Dump Trucks', 46], ['Mixer Trucks', 12], ['Bulldozers', 10],
    ['Rollers', 22], ['Motor Graders', 2], ['Long Arm Excavator', 1], ['Mobile Cranes', 5],
    ['Bored Pile Machines', 5], ['Crawler Cranes', 3], ['Shovels', 5], ['Paver', 1],
  ].map(([name, count], i) => ({ id: i + 1, name, count, sort_order: i + 1 }))

  const MonthlyTargets = [
    'Complete 4 nos Culverts', 'Laying 3km Roadbase', 'Completed Limbang 1 Pier 3 Test Pile',
    'Completed 2 Pile Caps', 'Laying Premix 5km',
  ].map((text, i) => ({ id: i + 1, month: '2026-07', text, done: 1, sort_order: i + 1 }))

  return { ExecOverview, EwActivities, PavementLayers, CulvertZones, Bridges, BridgeProgress, BridgePiles, ProjectMachinery, MonthlyTargets }
}
