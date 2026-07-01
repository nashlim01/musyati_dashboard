import { useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, BarChart, Bar, XAxis, YAxis, Cell, LabelList,
} from 'recharts'
import { useData } from '../lib/data.jsx'
import { num, pct, exportExecPdf } from '../lib/exec.js'
import { fmtNum, fmtMonth, fmtDate, todayISO } from '../lib/format.js'
import { Modal, Field } from '../components/ui.jsx'
import {
  TbCoin, TbCalendarMonth, TbCalendarEvent, TbRoad, TbMapPin, TbMapPins, TbRulerMeasure,
  TbMountain, TbStack2, TbBarrel, TbTruck, TbBuildingBroadcastTower, TbBolt, TbPick,
  TbUsers, TbUsersGroup, TbShieldCheck, TbBackhoe, TbBulldozer, TbCrane, TbCylinder,
  TbTractor, TbTools, TbShovel, TbTruckDelivery, TbTruckLoading, TbHistory, TbPencil,
} from 'react-icons/tb'

const fmtMil = (n) => `RM ${fmtNum(n, 2)} Mil`
const SHEET_W = 1180
// bridge summary matrix columns (image layout)
const BORE_COLS = ['Abt A', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'Abt B']
const STRUCT_COLS = ['Pile Cap', 'Column', 'Headstock', 'T20', 'T25', 'T30', 'T35']

// machine name -> icon (closest construction match from the Tabler set)
const MACHINE_ICON = {
  Excavators: TbBackhoe, 'Long Arm Excavator': TbBackhoe, 'Dump Trucks': TbTruck,
  'Mixer Trucks': TbTruckDelivery, Bulldozers: TbBulldozer, Rollers: TbCylinder,
  'Motor Graders': TbTractor, 'Mobile Cranes': TbCrane, 'Crawler Cranes': TbCrane,
  'Bored Pile Machines': TbTools, Shovels: TbShovel, Paver: TbTruckLoading,
}

// stylized highway emblem for the header (perspective road with centre dashes)
function RoadLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-11 h-11" aria-hidden>
      <rect width="48" height="48" rx="8" fill="#f59e0b" />
      <path d="M14 42 L21 8 H27 L34 42 Z" fill="#1f2937" />
      <path d="M23.2 12 h1.6 l.5 6 h-2.6 z M22.6 22 h2.8 l.5 7 h-3.8 z M21.8 33 h4.4 l.6 8 h-5.6 z" fill="#f59e0b" />
    </svg>
  )
}

// Pavement structure & thickness — stacked layers, heights ~proportional to mm.
const PAVEMENT = [
  ['Wearing Course (ACW 20)', '50 mm', 50, '#111827', 'text-white'],
  ['Binder Course (ACB 28)', '65 mm', 65, '#374151', 'text-white'],
  ['Binder Course (ACB 28)', '65 mm', 65, '#4b5563', 'text-white'],
  ['Road Base (Crusher Run)', '200 mm', 200, '#9ca3af', 'text-neutral-900'],
  ['Sub Base (Crusher Run)', '200 mm', 200, '#c79a5b', 'text-neutral-900'],
  ['Subgrade (Compacted)', '', 120, '#7c5234', 'text-white'],
]
function PavementStructure() {
  return (
    <div className="flex flex-col gap-px">
      {PAVEMENT.map(([name, mm, h, bg, tc], i) => (
        <div key={i} className={`flex items-center justify-between px-2 ${tc}`}
          style={{ background: bg, height: Math.max(15, h * 0.16) }}>
          <span className="text-[8.5px] font-semibold leading-none">{name}</span>
          <span className="text-[8.5px] font-bold">{mm}</span>
        </div>
      ))}
      <div className="text-[8px] text-neutral-400 mt-0.5">Typical flexible pavement cross-section</div>
    </div>
  )
}

// Road width typical section (plan view): 0.25 strip · 3.5 + 3.5 carriageway · 0.25 strip
function RoadWidth({ widthText }) {
  return (
    <div>
      <div className="text-[9px] text-emerald-700 font-bold text-center leading-tight mb-1">{widthText}</div>
      <div className="text-center text-[9px] font-bold text-neutral-700">↤ 7.00 m ↦</div>
      <div className="flex h-16 w-full rounded overflow-hidden border border-neutral-300">
        <div className="bg-amber-800/80 w-[6%]" />
        <div className="flex-1 bg-neutral-800 flex items-center justify-center border-r border-dashed border-white/70">
          <span className="text-white text-[9px]">Carriageway</span>
        </div>
        <div className="flex-1 bg-neutral-800 flex items-center justify-center">
          <span className="text-white text-[9px]">Carriageway</span>
        </div>
        <div className="bg-amber-800/80 w-[6%]" />
      </div>
      <div className="flex justify-between text-[8px] text-neutral-500 mt-1 px-0.5">
        <span>0.25 m<br />Marginal</span><span className="font-semibold">3.50 m</span><span className="font-semibold">3.50 m</span><span className="text-right">0.25 m<br />Marginal</span>
      </div>
    </div>
  )
}

// ---- small presentational primitives ---------------------------------------
function Box({ title, children, className = '', right, onEdit }) {
  return (
    <div className={`bg-white border border-neutral-200 rounded-lg overflow-hidden flex flex-col ${className}`}>
      <div className="bg-neutral-900 text-white px-3 py-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-wide uppercase">{title}</span>
        <div className="flex items-center gap-2">
          {right}
          {onEdit && (
            <button className="exec-noexport text-amber-300 hover:text-amber-100 cursor-pointer" title="Edit this section" onClick={onEdit}>
              <TbPencil size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="p-3 flex-1">{children}</div>
    </div>
  )
}

// shows a supplied image; falls back to the inline diagram if the file is absent
function DiagramImg({ src, alt, children }) {
  const [failed, setFailed] = useState(false)
  if (failed) return children
  return <img src={src} alt={alt} className="w-full h-auto object-contain" onError={() => setFailed(true)} />
}

function Gauge({ value, color, label, sub }) {
  const v = Math.max(0, Math.min(100, num(value)))
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 104, height: 104 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="74%" outerRadius="100%" data={[{ value: v, fill: color }]}
            startAngle={90} endAngle={-270} barSize={9}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar background={{ fill: '#eef2f5' }} dataKey="value" cornerRadius={6} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-extrabold leading-none" style={{ color }}>{fmtNum(v, 2)}%</div>
        </div>
      </div>
      {label && <div className="mt-1 text-xs font-bold text-neutral-700">{label}</div>}
      {sub && <div className="text-[10px] text-neutral-400">{sub}</div>}
    </div>
  )
}

const Row = ({ k, v, color, icon: Icon }) => (
  <div className="flex items-center justify-between py-0.5 text-xs">
    <span className="text-neutral-500 flex items-center gap-1.5">
      {Icon && <Icon className="text-neutral-400 shrink-0" size={14} />}{k}
    </span>
    <span className={`font-bold ${color ?? 'text-neutral-900'}`}>{v}</span>
  </div>
)

// ===========================================================================
// The presentation sheet — fixed width, used on screen and captured for PDF.
// ===========================================================================
function ExecSheet({ d, onEdit }) {
  const { o, ew, pav, zones, bridges, machinery, targets, culverts, poles } = d
  const ed = (key) => (onEdit ? () => onEdit(key) : undefined)
  if (!o) return <div className="p-10 text-center text-neutral-400">No dashboard data yet.</div>

  return (
    <div className="bg-neutral-100 p-3 w-full min-w-[1080px]">
      {/* Header band */}
      <div className="bg-neutral-900 text-white rounded-lg px-4 py-3 flex items-center gap-5 mb-2">
        <div className="flex items-center gap-3 pr-5 border-r border-neutral-700">
          <RoadLogo />
          <div>
            <div className="text-xl font-extrabold leading-tight">{o.title}</div>
            <div className="text-[10px] tracking-widest text-amber-400">EXECUTIVE PROJECT DASHBOARD</div>
          </div>
        </div>
        {[
          [TbCoin, 'Contract Sum', `RM ${fmtNum(o.contract_sum_mil, 0)} Million`],
          [TbCalendarMonth, 'Duration', `${fmtDate(o.start_date)} – ${fmtDate(o.end_date)}`],
          [TbRoad, 'Length', `${fmtNum(o.length_km, 2)} km`],
          [TbMapPin, 'Chainage', `${o.chainage_from} → ${o.chainage_to}`],
          [TbCalendarEvent, 'Data As At', fmtMonth(o.data_as_at)],
        ].map(([Icon, k, v]) => (
          <div key={k} className="flex-1 flex items-center gap-2">
            <Icon className="text-amber-400 shrink-0" size={22} />
            <div>
              <div className="text-[9px] tracking-widest text-neutral-400 uppercase">{k}</div>
              <div className="text-sm font-bold text-amber-300">{v}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 1: overview · progress · earthwork · work-done bars */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <Box title="Project Overview" onEdit={ed('header')}>
          <Row icon={TbCoin} k="Contract Sum" v={`RM ${fmtNum(o.contract_sum_mil, 0)} M`} />
          <Row icon={TbCalendarEvent} k="Start Date" v={fmtDate(o.start_date)} />
          <Row icon={TbCalendarEvent} k="End Date" v={fmtDate(o.end_date)} />
          <Row icon={TbRoad} k="Length" v={`${fmtNum(o.length_km, 2)} km`} />
          <Row icon={TbMapPins} k="Chainage" v={`${o.chainage_from}–${o.chainage_to}`} />
          <div className="text-[10px] text-neutral-500 mt-1 pt-1 border-t border-neutral-100 flex items-center gap-1.5"><TbRulerMeasure className="text-neutral-400 shrink-0" size={14} />{o.road_width_text}</div>
        </Box>

        <Box title="Progress Summary" onEdit={ed('progress')}>
          <div className="grid grid-cols-2 gap-1">
            {[['Physical', o.physical_pct, o.physical_plan_pct, '#16a34a'],
              ['Financial', o.financial_pct, o.financial_plan_pct, '#1e40af']].map(([lbl, p, plan, c]) => {
              const delta = num(p) - num(plan)
              return (
                <div key={lbl} className="flex flex-col items-center">
                  <Gauge value={p} color={c} label={lbl} />
                  <div className="text-[10px] text-neutral-400">Plan {fmtNum(plan, 2)}%</div>
                  <div className={`text-[11px] font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {delta >= 0 ? '▲' : '▼'} {fmtNum(Math.abs(delta), 2)}%
                  </div>
                </div>
              )
            })}
          </div>
        </Box>

        <Box title="Earthwork Summary" onEdit={ed('earthwork')}>
          <div className="text-center mb-1">
            <div className="text-2xl font-extrabold text-neutral-900">{fmtNum(o.earthwork_total_mil, 2)}</div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-wide">Total Mil m³</div>
          </div>
          <Row icon={TbMountain} k="Earth" v={`${fmtNum(o.earth_mil, 2)} M (${fmtNum(pct(o.earth_mil, o.earthwork_total_mil), 1)}%)`} color="text-amber-700" />
          <Row icon={TbPick} k="Rock" v={`${fmtNum(o.rock_mil, 2)} M (${fmtNum(pct(o.rock_mil, o.earthwork_total_mil), 1)}%)`} color="text-stone-600" />
          <Row icon={TbTruck} k="Cut to Dispose" v={`${fmtNum(o.cut_to_dispose_mil, 2)} M`} color="text-red-700" />
          <Row icon={TbStack2} k="Cut to Fill" v={`${fmtNum(o.cut_to_fill_mil, 2)} M`} color="text-emerald-700" />
        </Box>

        <Box title="Earthwork Work Done %" onEdit={ed('ew-activities')}>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={ew} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 8 }} />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]} fill="#0f766e" barSize={11}>
                <LabelList dataKey="pct" position="right" formatter={(v) => `${fmtNum(v, 1)}%`} style={{ fontSize: 8, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </div>

      {/* Row 2: pavement progress · pavement structure · premix · road width */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <Box title="Carriageway Pavement Progress by Layer" onEdit={ed('pavement')}>
          <div className="grid grid-cols-3 gap-1">
            {pav.map((l, i) => {
              const p = pct(l.completed_km, l.total_km)
              const remaining = Math.max(0, num(l.total_km) - num(l.completed_km))
              const c = ['#16a34a', '#d97706', '#1e40af'][i % 3]
              return (
                <div key={l.id} className="flex flex-col items-center">
                  <Gauge value={p} color={c} label={l.name} />
                  <div className="text-[9px] text-emerald-700 font-semibold">{fmtNum(l.completed_km, 2)} km</div>
                  <div className="text-[9px] text-neutral-400">{fmtNum(remaining, 2)} left</div>
                </div>
              )
            })}
          </div>
          <div className="text-[9px] text-neutral-400 text-center mt-1">Total length {fmtNum(o.length_km, 2)} km</div>
        </Box>

        <Box title="Pavement Structure & Thickness">
          <DiagramImg src={`${import.meta.env.BASE_URL}diagrams/pavement-structure.png`} alt="Pavement structure & thickness">
            <PavementStructure />
          </DiagramImg>
        </Box>

        <Box title="Premix & Material Requirement" onEdit={ed('materials')}>
          {[[TbTruck, 'DCR Needed', o.dcr_tonne, 'tonne'], [TbStack2, '20mm Premix', o.premix20_tonne, 'tonne'],
            [TbBarrel, 'ACW 20', o.acw20_m3, 'm³'], [TbBarrel, 'ACB 28', o.acb28_m3, 'm³']].map(([Icon, k, v, u]) => (
            <div key={k} className="flex items-center justify-between py-1 border-b border-neutral-100 last:border-0">
              <span className="text-[11px] text-neutral-500 flex items-center gap-1.5"><Icon className="text-neutral-400 shrink-0" size={15} />{k}</span>
              <span className="text-sm font-extrabold text-neutral-900">{fmtNum(v, 0)} <span className="text-[9px] text-neutral-400">{u}</span></span>
            </div>
          ))}
        </Box>

        <Box title="Road Width (Typical Section)">
          <DiagramImg src={`${import.meta.env.BASE_URL}diagrams/road-width.png`} alt="Road width typical section">
            <RoadWidth widthText={o.road_width_text} />
          </DiagramImg>
        </Box>
      </div>

      {/* Row 3: culvert · wide bridge matrix */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <Box title="Culvert Summary" onEdit={ed('culvert')}>
          <div className="flex items-center gap-2">
            <Gauge value={pct(culverts.completed, culverts.total)} color="#16a34a" />
            <div className="flex-1">
              <Row k="Total" v={`${culverts.total} nos`} />
              <Row k="Completed" v={`${culverts.completed} (${fmtNum(pct(culverts.completed, culverts.total), 1)}%)`} color="text-emerald-700" />
              <Row k="Outstanding" v={`${culverts.outstanding} (${fmtNum(pct(culverts.outstanding, culverts.total), 1)}%)`} color="text-red-700" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-neutral-100">
            {zones.map((z) => (
              <div key={z.id} className="text-center bg-neutral-50 rounded py-0.5">
                <div className="text-[9px] text-neutral-400">{z.zone}</div>
                <div className={`text-sm font-bold ${num(z.outstanding) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>{z.outstanding}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-neutral-500 mt-2">{o.box_culverts} Box · {o.pipe_culverts} HDPE & RCP</div>
        </Box>

        <Box title="Bridge Summary" className="col-span-3" onEdit={ed('bridges')}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-neutral-500">
                  <th rowSpan={2} className="text-left font-semibold px-1 border border-neutral-200">Bridge</th>
                  <th rowSpan={2} className="font-semibold border border-neutral-200">Span</th>
                  <th rowSpan={2} className="font-semibold border border-neutral-200">Length</th>
                  <th colSpan={BORE_COLS.length} className="font-bold border border-neutral-200 bg-neutral-50">Bored Pile</th>
                  <th colSpan={STRUCT_COLS.length} className="font-bold border border-neutral-200 bg-neutral-50">Structure (Girder Beam)</th>
                </tr>
                <tr className="text-neutral-400">
                  {[...BORE_COLS, ...STRUCT_COLS].map((c) => <th key={c} className="font-medium border border-neutral-200 px-0.5">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {bridges.map((br) => (
                  <tr key={br.id}>
                    <td className="font-semibold text-neutral-800 px-1 whitespace-nowrap border border-neutral-100">{br.name}</td>
                    <td className="text-center border border-neutral-100">{br.span}</td>
                    <td className="text-center border border-neutral-100">{fmtNum(br.length_m, 1)}</td>
                    {[...BORE_COLS, ...STRUCT_COLS].map((el) => {
                      const c = br.byEl[el]
                      if (!c) return <td key={el} className="text-center border border-neutral-100 text-neutral-300">—</td>
                      const full = num(c.done) >= num(c.total) && num(c.total) > 0
                      const active = !full && (num(c.done) > 0 || num(c.inprog) > 0)
                      return (
                        <td key={el} className={`text-center border border-neutral-100 px-1 ${full ? 'text-emerald-700 font-bold' : active ? 'text-amber-600 font-semibold' : 'text-neutral-500'}`}>
                          {num(c.done)}/{num(c.total)}{num(c.test) > 0 && <sup className="text-red-600 font-bold">R</sup>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      </div>

      {/* Row 4: URW · commercial · monthly target · machinery */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <Box title="Utility Relocation (URW)" onEdit={ed('urw')}>
          <div className="flex items-center gap-2">
            <Gauge value={pct(poles.done, poles.total)} color="#d97706" />
            <div className="flex-1">
              <div className="text-[10px] text-neutral-400 uppercase flex items-center gap-1"><TbBuildingBroadcastTower size={13} />Pole Erection</div>
              <div className="text-sm font-bold">{poles.done} / {poles.total} poles</div>
              <div className="text-[10px] text-neutral-500">{fmtNum(o.poles_km, 3)} km</div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-neutral-100">
            <div className="text-[10px] text-neutral-400 uppercase flex items-center gap-1"><TbBolt size={13} />Cable Laying</div>
            <div className="text-sm font-bold">{o.cable_spans} spans · {fmtNum(o.cable_km, 3)} km</div>
          </div>
        </Box>

        <Box title="Commercial Summary" onEdit={ed('commercial')}>
          <Row k="Contract (excl PC/NSC)" v={fmtMil(o.contract_excl_mil)} />
          <Row k="Total Expenses" v={fmtMil(o.total_expenses_mil)} />
          <Row k="Current Profit" v={fmtMil(o.current_profit_mil)} color="text-emerald-700" />
          <Row k="Claims To Date" v={fmtMil(o.claims_to_date_mil)} />
          <Row k="Balance To Claim" v={fmtMil(o.balance_to_claim_mil)} color="text-red-700" />
          <Row k="Cumulative IPC" v={fmtMil(o.cumulative_ipc_mil)} />
          <Row k="Avg Monthly Claim" v={fmtMil(o.avg_monthly_claim_mil)} />
          <div className="text-[10px] text-neutral-400 mt-1">{o.construction_period_text}</div>
        </Box>

        <Box title={`Target — ${fmtMonth(targets[0]?.month) || ''}`} onEdit={ed('targets')}>
          {targets.map((tg) => (
            <div key={tg.id} className="flex items-start gap-1.5 py-0.5 text-[11px]">
              <span className={num(tg.done) ? 'text-emerald-600' : 'text-neutral-300'}>{num(tg.done) ? '✓' : '○'}</span>
              <span className="text-neutral-700 leading-tight">{tg.text}</span>
            </div>
          ))}
        </Box>

        <Box title="Total Machinery" onEdit={ed('machinery')} right={<span className="text-amber-400 font-extrabold text-sm">{d.machineTotal}</span>}>
          <div className="grid grid-cols-2 gap-x-3">
            {machinery.map((m) => {
              const Icon = MACHINE_ICON[m.name] ?? TbTruck
              return (
                <div key={m.id} className="flex items-center gap-1.5 py-0.5 text-[10px] border-b border-neutral-50">
                  <Icon className="text-neutral-500 shrink-0" size={15} />
                  <span className="text-neutral-500 truncate flex-1">{m.name}</span>
                  <span className="font-bold text-neutral-900">{m.count}</span>
                </div>
              )
            })}
          </div>
        </Box>
      </div>

      {/* Footer band */}
      <div className="bg-neutral-900 text-white rounded-lg px-4 py-2 flex items-center justify-center gap-10 text-sm font-bold tracking-wide">
        <span className="flex items-center gap-2"><TbUsers size={20} /> ONE TEAM</span>
        <span className="flex items-center gap-2"><TbUsersGroup size={20} /> ONE FAMILY</span>
        <span className="flex items-center gap-2 text-amber-400"><TbShieldCheck size={20} /> ZERO HARM</span>
      </div>
    </div>
  )
}

// ===========================================================================
// Editing (the data log) — kept entirely outside the captured sheet.
// ===========================================================================

// records each value change into ProjectLog so past inputs can be referenced
function useLogger() {
  const { create } = useData()
  return async (section, field, label, oldV, newV) => {
    if (String(oldV ?? '') === String(newV ?? '')) return
    try {
      await create('project-log', {
        ts: new Date().toISOString(), section, field, label,
        old_value: String(oldV ?? ''), new_value: String(newV ?? ''),
      })
    } catch { /* logging is best-effort */ }
  }
}

// "reference from past input" — recent changes (optionally for one section)
function RecentLog({ section }) {
  const { projectLog } = useData()
  const rows = [...(projectLog ?? [])]
    .filter((l) => !section || l.section === section)
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 8)
  return (
    <div className="mt-3 pt-2 border-t border-neutral-200">
      <div className="label mb-1 flex items-center gap-1"><TbHistory size={13} /> Recent updates{section ? ` · ${section}` : ''}</div>
      {rows.length === 0 ? <div className="text-[11px] text-neutral-400">No past entries yet — changes you save here are logged for reference.</div> : (
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {rows.map((l) => (
            <div key={l.id} className="text-[11px] flex items-center gap-2">
              <span className="text-neutral-400 whitespace-nowrap mono">{String(l.ts).slice(0, 16).replace('T', ' ')}</span>
              <span className="text-neutral-700 flex-1 truncate">{l.label}</span>
              <span className="text-red-500 line-through whitespace-nowrap">{l.old_value || '—'}</span>
              <span className="text-neutral-400">→</span>
              <span className="text-emerald-700 font-semibold whitespace-nowrap">{l.new_value || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// A form over the single ExecOverview row: list of [key, label, type].
function OverviewForm({ fields, section, onClose }) {
  const { execOverview, update } = useData()
  const log = useLogger()
  const [f, setF] = useState(() => ({ ...execOverview }))
  const [error, setError] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    try {
      const body = {}; const changes = []
      for (const [k, label, type] of fields) {
        const newV = type === 'num' ? Number(f[k]) || 0 : f[k]
        body[k] = newV
        if (String(execOverview[k] ?? '') !== String(newV ?? '')) changes.push([k, label, execOverview[k], newV])
      }
      await update('exec-overview', f.id ?? 1, body)
      for (const [k, label, oldV, newV] of changes) await log(section, k, label, oldV, newV)
      onClose()
    } catch (e) { setError(e.message) }
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([k, label, type]) => (
          <Field key={k} label={label} span2={type === 'text' && label.length > 18}>
            <input className="input w-full" type={type === 'num' ? 'number' : type === 'date' ? 'date' : type === 'month' ? 'month' : 'text'}
              step={type === 'num' ? 'any' : undefined} value={f[k] ?? ''} onChange={set(k)} />
          </Field>
        ))}
      </div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4"><button className="btn" onClick={onClose}>Cancel</button><button className="btn-dark" onClick={save}>Save</button></div>
      <RecentLog section={section} />
    </div>
  )
}

// Generic editor for a child list (add / edit inline / delete).
function ListEditor({ resource, rows, columns, makeNew, section, onClose }) {
  const { create, update, remove } = useData()
  const log = useLogger()
  const [error, setError] = useState('')
  const rowName = (r) => r.name ?? r.zone ?? r.text ?? r.element ?? `#${r.id}`
  const saveCell = (row, key, raw, type, colLabel) => {
    const val = type === 'num' ? Number(raw) || 0 : type === 'check' ? (raw ? 1 : 0) : raw
    if (String(row[key] ?? '') === String(val)) return
    update(resource, row.id, { [key]: val }).catch((e) => setError(e.message))
    log(section, key, `${rowName(row)} · ${colLabel}`, row[key], val)
  }
  const sorted = [...rows].sort((a, b) => num(a.sort_order) - num(b.sort_order))
  return (
    <div>
      <table className="w-full text-sm mb-3">
        <thead><tr>{columns.map((c) => <th key={c.key} className="th text-left">{c.label}</th>)}<th className="th" /></tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              {columns.map((c) => (
                <td key={c.key} className="td">
                  {c.type === 'check'
                    ? <input type="checkbox" defaultChecked={num(r[c.key]) === 1} onChange={(e) => saveCell(r, c.key, e.target.checked, 'check', c.label)} />
                    : <input className="input w-full" type={c.type === 'num' ? 'number' : 'text'} step={c.type === 'num' ? 'any' : undefined}
                        defaultValue={r[c.key] ?? ''} onBlur={(e) => saveCell(r, c.key, e.target.value, c.type, c.label)} />}
                </td>
              ))}
              <td className="td"><button className="text-red-500 hover:text-red-700 text-xs cursor-pointer" onClick={() => remove(resource, r.id).catch((e) => setError(e.message))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={() => create(resource, makeNew(sorted)).catch((e) => setError(e.message))}>+ Add Row</button>
        <button className="btn-dark" onClick={onClose}>Done</button>
      </div>
      <RecentLog section={section} />
    </div>
  )
}

const PILE_STATUS = { not_done: ['Not Done', '#94a3b8'], in_progress: ['In Progress', '#d97706'], done: ['Done', '#16a34a'] }

// modal to set one pile's status / test flag / completion date
function PileModal({ pile, bridgeName, onClose }) {
  const { update, remove } = useData()
  const log = useLogger()
  const [f, setF] = useState({ ...pile })
  const set = (patch) => setF((p) => ({ ...p, ...patch }))
  const save = async () => {
    await update('bridge-piles', f.id, {
      status: f.status, is_test_pile: Number(f.is_test_pile) ? 1 : 0,
      done_date: f.status === 'done' ? (f.done_date || todayISO()) : '',
    })
    if (f.status !== pile.status) log('Bridges', 'pile', `${bridgeName} · ${pile.element} #${pile.label}`, PILE_STATUS[pile.status]?.[0], PILE_STATUS[f.status]?.[0])
    onClose()
  }
  return (
    <Modal title={`${pile.element} — Pile ${pile.label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <span className="label block mb-1">Status</span>
          <div className="flex gap-2">
            {Object.entries(PILE_STATUS).map(([k, [lbl, color]]) => (
              <button key={k} onClick={() => set({ status: k })}
                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium cursor-pointer border ${f.status === k ? 'text-white border-transparent' : 'bg-white text-neutral-600 border-neutral-300'}`}
                style={f.status === k ? { background: color } : undefined}>{lbl}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={Number(f.is_test_pile) === 1} onChange={(e) => set({ is_test_pile: e.target.checked ? 1 : 0 })} /> Nominated Test Pile (MLT)
        </label>
        {f.status === 'done' && <Field label="Date completed"><input type="date" className="input w-full" value={f.done_date || todayISO()} onChange={(e) => set({ done_date: e.target.value })} /></Field>}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button className="text-red-500 hover:text-red-700 text-xs cursor-pointer" onClick={() => { remove('bridge-piles', f.id); onClose() }}>Delete pile</button>
        <div className="flex-1" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>Save</button>
      </div>
    </Modal>
  )
}

// clickable foundation board for one bored-pile group
function PileGroup({ bridgeName, element, piles, onAdd, onRename }) {
  const [editPile, setEditPile] = useState(null)
  const done = piles.filter((p) => p.status === 'done').length
  return (
    <div className="border border-neutral-200 rounded-md p-2">
      <div className="flex items-center justify-between mb-1">
        <input className="input !py-0.5 w-20 text-xs font-bold" defaultValue={element} onBlur={(e) => onRename(e.target.value)} />
        <span className="text-[10px] text-neutral-400">{done}/{piles.length}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {piles.map((p) => {
          const [, color] = PILE_STATUS[p.status] ?? PILE_STATUS.not_done
          return (
            <button key={p.id} onClick={() => setEditPile(p)} title={`Pile ${p.label} — ${PILE_STATUS[p.status]?.[0] ?? p.status}`}
              className="relative w-6 h-6 rounded-full text-[9px] font-bold text-white flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-neutral-400" style={{ background: color }}>
              {Number(p.is_test_pile) === 1 && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 text-white text-[7px] flex items-center justify-center border border-white">R</span>}
              {p.label}
            </button>
          )
        })}
        <button className="w-6 h-6 rounded-full border border-dashed border-neutral-300 text-neutral-400 text-xs cursor-pointer hover:border-neutral-500" onClick={onAdd} title="Add pile">+</button>
      </div>
      {editPile && <PileModal pile={editPile} bridgeName={bridgeName} onClose={() => setEditPile(null)} />}
    </div>
  )
}

// Bridges list + per-bridge editor. Bored piles use the status foundation board.
function BridgesEditor({ onClose }) {
  const { bridges, bridgeProgress, bridgePiles, create, update, remove } = useData()
  const log = useLogger()
  const [error, setError] = useState('')
  const [sel, setSel] = useState(bridges[0]?.id ?? null)
  const sortedBridges = [...bridges].sort((a, b) => num(a.sort_order) - num(b.sort_order))
  const br = bridges.find((b) => Number(b.id) === Number(sel))
  const piles = bridgePiles.filter((p) => Number(p.bridge_id) === Number(sel))
  const struct = bridgeProgress.filter((c) => Number(c.bridge_id) === Number(sel)).sort((a, b) => num(a.sort_order) - num(b.sort_order))
  // group bored piles by element, preserving order
  const groups = []; const seen = new Map()
  for (const p of [...piles].sort((a, b) => num(a.sort_order) - num(b.sort_order))) {
    if (!seen.has(p.element)) { seen.set(p.element, { element: p.element, list: [] }); groups.push(seen.get(p.element)) }
    seen.get(p.element).list.push(p)
  }
  const setStruct = (row, key, raw) => {
    const v = Number(raw) || 0
    if (Number(row[key]) === v) return
    update('bridge-progress', row.id, { [key]: v }).catch((e) => setError(e.message))
    log('Bridges', key, `${br?.name} · ${row.element} ${key}`, row[key], v)
  }
  const addPile = (element, list) => create('bridge-piles', { bridge_id: br.id, element, label: String(list.length + 1), status: 'not_done', is_test_pile: 0, done_date: '', sort_order: list.length + 1 }).catch((e) => setError(e.message))
  const renameGroup = (list, name) => list.forEach((p) => { if (p.element !== name) update('bridge-piles', p.id, { element: name }) })
  const dot = (k) => <span className="w-3 h-3 rounded-full inline-block" style={{ background: PILE_STATUS[k][1] }} />

  return (
    <div className="grid grid-cols-4 gap-4">
      <div>
        <div className="label mb-1">Bridges</div>
        {sortedBridges.map((b) => (
          <button key={b.id} onClick={() => setSel(b.id)} className={`w-full text-left px-2 py-1 rounded text-sm cursor-pointer ${Number(sel) === Number(b.id) ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}>{b.name}</button>
        ))}
        <button className="btn w-full mt-2" onClick={() => create('bridges', { name: 'New Bridge', span: 1, length_m: 0, sort_order: bridges.length + 1 }).catch((e) => setError(e.message))}>+ Bridge</button>
        <div className="mt-3 text-[10px] text-neutral-500 space-y-1">
          <div className="flex items-center gap-1.5">{dot('not_done')} Not Done</div>
          <div className="flex items-center gap-1.5">{dot('in_progress')} In Progress</div>
          <div className="flex items-center gap-1.5">{dot('done')} Done</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-600 text-white text-[6px] flex items-center justify-center">R</span> Test Pile</div>
        </div>
      </div>
      <div className="col-span-3">
        {br && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Field label="Name"><input className="input w-full" defaultValue={br.name} onBlur={(e) => update('bridges', br.id, { name: e.target.value })} /></Field>
              <Field label="Span"><input className="input w-full" type="number" defaultValue={br.span} onBlur={(e) => update('bridges', br.id, { span: Number(e.target.value) || 0 })} /></Field>
              <Field label="Length (m)"><input className="input w-full" type="number" step="any" defaultValue={br.length_m} onBlur={(e) => update('bridges', br.id, { length_m: Number(e.target.value) || 0 })} /></Field>
            </div>

            <div className="label mb-1">Bored Pile — click a pile to set status / test pile</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {groups.map((g) => <PileGroup key={g.element} bridgeName={br.name} element={g.element} piles={g.list} onAdd={() => addPile(g.element, g.list)} onRename={(name) => renameGroup(g.list, name)} />)}
            </div>
            <button className="btn mb-3" onClick={() => create('bridge-piles', { bridge_id: br.id, element: 'New Group', label: '1', status: 'not_done', is_test_pile: 0, done_date: '', sort_order: 1 }).catch((e) => setError(e.message))}>+ Bored pile group</button>

            <div className="label mb-1">Structure (done / total)</div>
            <table className="w-full text-xs mb-2">
              <thead><tr><th className="th text-left">Element</th><th className="th">Done</th><th className="th">Total</th><th className="th" /></tr></thead>
              <tbody>
                {struct.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><input className="input w-full" defaultValue={c.element} onBlur={(e) => update('bridge-progress', c.id, { element: e.target.value })} /></td>
                    <td className="td"><input className="input w-16" type="number" defaultValue={c.done} onBlur={(e) => setStruct(c, 'done', e.target.value)} /></td>
                    <td className="td"><input className="input w-16" type="number" defaultValue={c.total} onBlur={(e) => setStruct(c, 'total', e.target.value)} /></td>
                    <td className="td"><button className="text-red-500 text-xs cursor-pointer" onClick={() => remove('bridge-progress', c.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between">
              <button className="btn" onClick={() => create('bridge-progress', { bridge_id: br.id, element: 'New', done: 0, total: 1, sort_order: struct.length + 1 })}>+ Structure element</button>
              <button className="text-red-500 hover:text-red-700 text-xs cursor-pointer self-center" onClick={() => { if (window.confirm('Delete this bridge?')) { for (const p of piles) remove('bridge-piles', p.id); for (const c of struct) remove('bridge-progress', c.id); remove('bridges', br.id); setSel(null) } }}>Delete bridge</button>
            </div>
          </>
        )}
      </div>
      {error && <div className="col-span-4 text-xs text-red-600">{error}</div>}
      <div className="col-span-4"><RecentLog section="Bridges" /></div>
      <div className="col-span-4 flex justify-end"><button className="btn-dark" onClick={onClose}>Done</button></div>
    </div>
  )
}

// full audit trail view
function FullLog() {
  const { projectLog } = useData()
  const rows = [...(projectLog ?? [])].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
  return (
    <div>
      <div className="label mb-2 flex items-center gap-1"><TbHistory size={14} /> Update Log — {rows.length} entries</div>
      {rows.length === 0 ? <div className="text-sm text-neutral-400">No updates logged yet. Every value you change in the editors is recorded here for reference.</div> : (
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead><tr>{['When', 'Section', 'Field', 'From', 'To'].map((h) => <th key={h} className="th text-left">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-neutral-50">
                  <td className="td whitespace-nowrap text-neutral-400 mono">{String(l.ts).slice(0, 16).replace('T', ' ')}</td>
                  <td className="td whitespace-nowrap">{l.section}</td>
                  <td className="td">{l.label}</td>
                  <td className="td text-red-500 whitespace-nowrap">{l.old_value || '—'}</td>
                  <td className="td text-emerald-700 font-semibold whitespace-nowrap">{l.new_value || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const OVERVIEW_GROUPS = {
  header: { title: 'Project Overview & Header', fields: [['title', 'Title', 'text'], ['contract_sum_mil', 'Contract Sum (RM Mil)', 'num'], ['start_date', 'Start Date', 'date'], ['end_date', 'End Date', 'date'], ['length_km', 'Length (km)', 'num'], ['chainage_from', 'Chainage From', 'text'], ['chainage_to', 'Chainage To', 'text'], ['road_width_text', 'Road Width', 'text'], ['data_as_at', 'Data As At', 'month']] },
  progress: { title: 'Progress Summary', fields: [['physical_pct', 'Physical %', 'num'], ['physical_plan_pct', 'Physical Plan %', 'num'], ['financial_pct', 'Financial %', 'num'], ['financial_plan_pct', 'Financial Plan %', 'num']] },
  earthwork: { title: 'Earthwork Summary', fields: [['earthwork_total_mil', 'Total (Mil m³)', 'num'], ['earth_mil', 'Earth (Mil)', 'num'], ['rock_mil', 'Rock (Mil)', 'num'], ['cut_to_dispose_mil', 'Cut to Dispose (Mil)', 'num'], ['cut_to_fill_mil', 'Cut to Fill (Mil)', 'num']] },
  materials: { title: 'Premix & Material', fields: [['dcr_tonne', 'DCR (tonne)', 'num'], ['premix20_tonne', '20mm Premix (tonne)', 'num'], ['acw20_m3', 'ACW20 (m³)', 'num'], ['acb28_m3', 'ACB28 (m³)', 'num']] },
  urw: { title: 'Utility Relocation', fields: [['poles_total', 'Poles Total', 'num'], ['poles_done', 'Poles Done', 'num'], ['poles_km', 'Pole Line (km)', 'num'], ['cable_spans', 'Cable Spans', 'num'], ['cable_km', 'Cable (km)', 'num']] },
  commercial: { title: 'Commercial Summary', fields: [['contract_excl_mil', 'Contract excl PC/NSC (Mil)', 'num'], ['total_expenses_mil', 'Total Expenses (Mil)', 'num'], ['current_profit_mil', 'Current Profit (Mil)', 'num'], ['claims_to_date_mil', 'Claims To Date (Mil)', 'num'], ['balance_to_claim_mil', 'Balance To Claim (Mil)', 'num'], ['cumulative_ipc_mil', 'Cumulative IPC (Mil)', 'num'], ['avg_monthly_claim_mil', 'Avg Monthly Claim (Mil)', 'num'], ['construction_period_text', 'Construction Period', 'text']] },
}

// culvert totals (inline onBlur) + zones list
function CulvertEditor({ onClose }) {
  const { execOverview, culvertZones, update } = useData()
  const log = useLogger()
  const setTotal = (k, label, raw) => {
    const v = Number(raw) || 0
    if (Number(execOverview[k]) === v) return
    update('exec-overview', 1, { [k]: v })
    log('Culvert Summary', k, label, execOverview[k], v)
  }
  return (
    <div>
      <div className="label mb-1">Overall culverts</div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[['culverts_total', 'Total'], ['culverts_completed', 'Completed'], ['box_culverts', 'Box'], ['pipe_culverts', 'Pipe']].map(([k, label]) => (
          <Field key={k} label={label}><input type="number" className="input w-full" defaultValue={execOverview[k] ?? ''} onBlur={(e) => setTotal(k, label, e.target.value)} /></Field>
        ))}
      </div>
      <div className="label mb-1">Outstanding by zone</div>
      <ListEditor resource="culvert-zones" section="Culvert Summary" rows={culvertZones}
        columns={[{ key: 'zone', label: 'Zone', type: 'text' }, { key: 'outstanding', label: 'Outstanding', type: 'num' }]}
        makeNew={(r) => ({ zone: '', outstanding: 0, sort_order: num(r[r.length - 1]?.sort_order) + 1 })} onClose={onClose} />
    </div>
  )
}

const EDIT_TITLES = {
  header: 'Project Overview', progress: 'Progress Summary', earthwork: 'Earthwork Summary',
  materials: 'Premix & Material', 'ew-activities': 'Earthwork Activities', pavement: 'Pavement Layers',
  culvert: 'Culvert Summary', bridges: 'Bridge Summary', urw: 'Utility Relocation',
  commercial: 'Commercial Summary', machinery: 'Machinery', targets: 'Monthly Targets', log: 'Update Log',
}

// per-box editor modal — opened from a box's ✎ button
function SectionEditModal({ editKey, onClose }) {
  const data = useData()
  const next = (rows) => num(rows[rows.length - 1]?.sort_order) + 1
  const g = OVERVIEW_GROUPS[editKey]
  return (
    <Modal title={`Edit — ${EDIT_TITLES[editKey] ?? ''}`} onClose={onClose} wide>
      {g && <OverviewForm fields={g.fields} section={EDIT_TITLES[editKey]} onClose={onClose} />}
      {editKey === 'ew-activities' && <ListEditor resource="ew-activities" section="Earthwork Activities" rows={data.ewActivities} columns={[{ key: 'name', label: 'Activity', type: 'text' }, { key: 'pct', label: '% Done', type: 'num' }]} makeNew={(r) => ({ name: '', pct: 0, sort_order: next(r) })} onClose={onClose} />}
      {editKey === 'pavement' && <ListEditor resource="pavement-layers" section="Pavement Layers" rows={data.pavementLayers} columns={[{ key: 'name', label: 'Layer', type: 'text' }, { key: 'total_km', label: 'Total km', type: 'num' }, { key: 'completed_km', label: 'Completed km', type: 'num' }]} makeNew={(r) => ({ name: '', total_km: 0, completed_km: 0, sort_order: next(r) })} onClose={onClose} />}
      {editKey === 'culvert' && <CulvertEditor onClose={onClose} />}
      {editKey === 'bridges' && <BridgesEditor onClose={onClose} />}
      {editKey === 'machinery' && <ListEditor resource="project-machinery" section="Machinery" rows={data.projectMachinery} columns={[{ key: 'name', label: 'Machine', type: 'text' }, { key: 'count', label: 'Count', type: 'num' }]} makeNew={(r) => ({ name: '', count: 0, sort_order: next(r) })} onClose={onClose} />}
      {editKey === 'targets' && <ListEditor resource="monthly-targets" section="Monthly Targets" rows={data.monthlyTargets} columns={[{ key: 'text', label: 'Target', type: 'text' }, { key: 'month', label: 'Month (YYYY-MM)', type: 'text' }, { key: 'done', label: 'Done', type: 'check' }]} makeNew={(r) => ({ text: '', month: data.monthlyTargets[0]?.month ?? '', done: 0, sort_order: next(r) })} onClose={onClose} />}
      {editKey === 'log' && <FullLog />}
    </Modal>
  )
}

// ===========================================================================
export default function ExecDashboard() {
  const data = useData()
  const sheetRef = useRef(null)
  const [preview, setPreview] = useState(false)
  const [editKey, setEditKey] = useState(null)
  const [busy, setBusy] = useState(false)

  const d = useMemo(() => {
    const o = data.execOverview
    const bridges = (data.bridges ?? []).slice().sort((a, b) => num(a.sort_order) - num(b.sort_order)).map((br) => {
      const cells = (data.bridgeProgress ?? []).filter((c) => Number(c.bridge_id) === Number(br.id)) // structure
      const piles = (data.bridgePiles ?? []).filter((p) => Number(p.bridge_id) === Number(br.id))    // bored
      const byEl = {}
      for (const p of piles) {
        const e = byEl[p.element] || (byEl[p.element] = { done: 0, total: 0, inprog: 0, test: 0 })
        e.total++
        if (p.status === 'done') e.done++
        else if (p.status === 'in_progress') e.inprog++
        if (Number(p.is_test_pile) === 1) e.test++
      }
      for (const c of cells) byEl[c.element] = { done: num(c.done), total: num(c.total) }
      return { ...br, byEl }
    })
    const total = num(o?.culverts_total)
    const completed = num(o?.culverts_completed)
    return {
      o,
      ew: (data.ewActivities ?? []).slice().sort((a, b) => num(a.sort_order) - num(b.sort_order)),
      pav: (data.pavementLayers ?? []).slice().sort((a, b) => num(a.sort_order) - num(b.sort_order)),
      zones: (data.culvertZones ?? []).slice().sort((a, b) => num(a.sort_order) - num(b.sort_order)),
      bridges,
      machinery: (data.projectMachinery ?? []).slice().sort((a, b) => num(a.sort_order) - num(b.sort_order)),
      machineTotal: (data.projectMachinery ?? []).reduce((s, m) => s + num(m.count), 0),
      targets: (data.monthlyTargets ?? []).slice().sort((a, b) => num(a.sort_order) - num(b.sort_order)),
      culverts: { total, completed, outstanding: total - completed },
      poles: { done: num(o?.poles_done), total: num(o?.poles_total) },
    }
  }, [data])

  const exportPdf = async () => {
    if (!sheetRef.current || busy) return
    setBusy(true)
    try { await exportExecPdf(sheetRef.current, `SSLR2-exec-dashboard`) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-neutral-700">Executive Project Dashboard</h2>
        <span className="text-xs text-neutral-400">— hover a box and click ✎ to edit; export the PDF to present</span>
        <div className="flex-1" />
        <button className="btn" onClick={() => setEditKey('log')}>🕑 Update Log</button>
        <button className="btn" onClick={() => setPreview(true)}>👁 Preview</button>
        <button className="btn-dark" onClick={exportPdf} disabled={busy}>{busy ? 'Generating…' : '⬇ Export PDF'}</button>
      </div>
      {editKey && <SectionEditModal editKey={editKey} onClose={() => setEditKey(null)} />}

      {/* On-screen sheet (scrolls horizontally on small screens) — each box has its own ✎ edit */}
      <div className="overflow-x-auto border border-neutral-200 rounded-lg">
        <div ref={sheetRef}><ExecSheet d={d} onEdit={setEditKey} /></div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-auto p-6" onClick={() => setPreview(false)}>
          <div className="bg-white rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200">
              <span className="font-bold text-sm">Preview — exactly what the PDF will contain</span>
              <div className="flex gap-2">
                <button className="btn-dark" onClick={exportPdf} disabled={busy}>{busy ? 'Generating…' : '⬇ Export PDF'}</button>
                <button className="btn" onClick={() => setPreview(false)}>Close</button>
              </div>
            </div>
            <div className="origin-top" style={{ transform: 'scale(0.78)', width: SHEET_W, height: 'auto' }}>
              <ExecSheet d={d} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
