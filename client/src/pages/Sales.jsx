import { useMemo, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { saleTotal, allocate, companyAccount, buildLedger, num } from '../lib/calc.js'
import { fmtRM, fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { Modal, Field, SectionCard, Empty, ConfirmDelete, ExportButtons } from '../components/ui.jsx'

const emptyForm = (plantId) => ({
  plant_id: plantId, project_id: '', company_id: '', ref: '', date: todayISO(), do_no: '',
  grade_id: '', volume_m3: '', rate_rm: '', trip: 1, rm_per_trip: 100,
  pay_method: 'cash', invoice_issued: 0, invoice_date: '', do_file: '', remarks: '',
})

const STATUS_LABEL = { paid: 'Paid', unpaid: 'Unpaid' }
const STATUS_CLS = { paid: 'text-emerald-600', unpaid: 'text-red-500' }
const STATUS_ORDER = { paid: 1, unpaid: 0 }

// How a sale is meant to be settled — informational (settlement is pooled FIFO).
const PAYVIA_LABEL = { reload: 'Reload credit', cash: 'Cash payment' }
const PAYVIA_CLS = { reload: 'bg-violet-100 text-violet-700', cash: 'bg-sky-100 text-sky-700' }
const payViaOf = (s) => (s.pay_method === 'reload' ? 'reload' : 'cash')

const makeColumns = (companiesById, gradesById, statusById) => [
  { label: '#', align: 'left' },
  { label: 'Company', sort: (s) => companiesById[s.company_id]?.name ?? '' },
  { label: 'Ref', sort: (s) => s.ref ?? '' },
  { label: 'Date', sort: (s) => s.date ?? '' },
  { label: 'DO No.', sort: (s) => s.do_no ?? '' },
  { label: 'Grade', sort: (s) => gradesById[s.grade_id]?.name ?? '' },
  { label: 'Vol (m³)', align: 'right', sort: (s) => Number(s.volume_m3) || 0 },
  { label: 'Rate (RM)', align: 'right', sort: (s) => Number(s.rate_rm) || 0 },
  { label: 'Trip', align: 'right', sort: (s) => Number(s.trip) || 0 },
  { label: 'RM/Trip', align: 'right', sort: (s) => Number(s.rm_per_trip) || 0 },
  { label: 'Total (RM)', align: 'right', sort: (s) => saleTotal(s) },
  { label: 'Pay Via', sort: (s) => payViaOf(s) },
  { label: 'Payment', sort: (s) => STATUS_ORDER[statusById.get(s.id) ?? 'unpaid'] },
  { label: 'Invoice', sort: (s) => Number(s.invoice_issued) || 0 },
  { label: 'Files' },
  { label: 'Remarks', sort: (s) => s.remarks ?? '' },
  { label: 'Actions' },
]

export default function Sales() {
  const data = useData()
  const { sales, payments, companies, grades, companiesById, gradesById, plantsById, inSelection, selectedPlantIds } = data
  const [q, setQ] = useState('')
  const [fPay, setFPay] = useState('all')
  const [fInv, setFInv] = useState('all')
  const [fGrade, setFGrade] = useState('all')
  const [fCompany, setFCompany] = useState('all')
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null) // null | payment form
  const [sort, setSort] = useState({ key: 'Date', dir: 'asc' })

  const mySales = useMemo(() => sales.filter(inSelection), [sales, inSelection])
  const myPayments = useMemo(() => payments.filter(inSelection), [payments, inSelection])

  // derive paid status + paid amount per sale from the company account ledger
  const { statusById, paidById } = useMemo(() => allocate(mySales, myPayments), [mySales, myPayments])

  const columns = useMemo(() => makeColumns(companiesById, gradesById, statusById), [companiesById, gradesById, statusById])

  const filtered = useMemo(() => mySales
    .filter((s) => fPay === 'all' || (fPay === 'paid' ? statusById.get(s.id) === 'paid' : statusById.get(s.id) !== 'paid'))
    .filter((s) => fInv === 'all' || (fInv === 'issued') === (Number(s.invoice_issued) === 1))
    .filter((s) => fGrade === 'all' || Number(s.grade_id) === Number(fGrade))
    .filter((s) => fCompany === 'all' || Number(s.company_id) === Number(fCompany))
    .filter((s) => {
      if (!q.trim()) return true
      const needle = q.toLowerCase()
      const hay = `${companiesById[s.company_id]?.name ?? ''} ${s.ref} ${s.do_no} ${s.remarks}`.toLowerCase()
      return hay.includes(needle)
    }),
  [mySales, statusById, fPay, fInv, fGrade, fCompany, q, companiesById])

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.label === sort.key)
    const accessor = col?.sort
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (accessor) {
        const va = accessor(a); const vb = accessor(b)
        cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      }
      if (cmp === 0) cmp = String(a.date).localeCompare(String(b.date)) || a.id - b.id
      return cmp * dir
    })
  }, [filtered, columns, sort])

  const toggleSort = (label) => setSort((prev) =>
    prev.key === label ? { key: label, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key: label, dir: 'asc' })

  // paid / unpaid totals for the rows currently shown, using allocated paid amounts
  const totals = useMemo(() => filtered.reduce((acc, s) => {
    const total = saleTotal(s)
    const paid = Math.min(total, num(paidById.get(s.id)))
    acc.paid += paid
    acc.unpaid += total - paid
    return acc
  }, { paid: 0, unpaid: 0 }), [filtered, paidById])

  const clearFilters = () => { setQ(''); setFPay('all'); setFInv('all'); setFGrade('all'); setFCompany('all') }

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input w-64 mono" placeholder="Search company, DO, ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={fPay} onChange={(e) => setFPay(e.target.value)}>
          <option value="all">All Payment</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid / Partial</option>
        </select>
        <select className="input" value={fInv} onChange={(e) => setFInv(e.target.value)}>
          <option value="all">All Invoice</option>
          <option value="issued">Invoice Issued</option>
          <option value="pending">Invoice Pending</option>
        </select>
        <select className="input" value={fGrade} onChange={(e) => setFGrade(e.target.value)}>
          <option value="all">All Grades</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select className="input" value={fCompany} onChange={(e) => setFCompany(e.target.value)}>
          <option value="all">All Companies</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" onClick={clearFilters}>Clear</button>
        <div className="flex-1" />
        <button className="btn" onClick={() => setPaying({
          company_id: fCompany !== 'all' ? Number(fCompany) : '', plant_id: selectedPlantIds[0],
          date: todayISO(), amount_rm: '', method: 'cash', remarks: '',
        })}>+ Record Payment</button>
        <button className="btn-dark" onClick={() => setEditing(emptyForm(selectedPlantIds[0]))}>+ Add Sale</button>
      </div>

      {/* Sales table */}
      <SectionCard
        title={<span className="text-sm font-bold normal-case tracking-normal text-neutral-900">Concrete Sales Records</span>}
        right={
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Paid {fmtRM(totals.paid)}
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Unpaid {fmtRM(totals.unpaid)}
            </span>
            <ExportButtons filename="sales" build={() => ({
              title: 'Concrete Sales Records',
              subtitle: `${filtered.length} records · Paid ${fmtRM(totals.paid)} · Unpaid ${fmtRM(totals.unpaid)}`,
              meta: [`Paid ${fmtRM(totals.paid)} · Unpaid ${fmtRM(totals.unpaid)} · ${filtered.length} records`],
              columns: [
                { header: 'Company', value: (s) => companiesById[s.company_id]?.name ?? '' },
                { header: 'Ref', value: (s) => s.ref },
                { header: 'Date', value: (s) => s.date, text: (s) => fmtDate(s.date) },
                { header: 'DO No.', value: (s) => s.do_no },
                { header: 'Grade', value: (s) => gradesById[s.grade_id]?.name ?? '' },
                { header: 'Vol (m³)', align: 'right', value: (s) => num(s.volume_m3) },
                { header: 'Rate (RM)', align: 'right', value: (s) => num(s.rate_rm) },
                { header: 'Trip', align: 'right', value: (s) => num(s.trip) },
                { header: 'RM/Trip', align: 'right', value: (s) => num(s.rm_per_trip) },
                { header: 'Total (RM)', align: 'right', value: (s) => saleTotal(s), text: (s) => fmtNum(saleTotal(s)) },
                { header: 'Pay Via', value: (s) => PAYVIA_LABEL[payViaOf(s)] },
                { header: 'Payment', value: (s) => STATUS_LABEL[statusById.get(s.id) ?? 'unpaid'] },
                { header: 'Paid (RM)', align: 'right', value: (s) => Math.min(saleTotal(s), num(paidById.get(s.id))) },
                { header: 'Invoice', value: (s) => (Number(s.invoice_issued) === 1 ? 'Issued' : 'Pending') },
                { header: 'Remarks', value: (s) => s.remarks },
              ], rows: sorted,
            })} />
            <span className="mono text-neutral-400">{filtered.length} records</span>
          </div>
        }
      >
        <div className="table-scroll">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr>
                {columns.map((col) => {
                  const active = sort.key === col.label
                  return (
                    <th
                      key={col.label}
                      onClick={() => col.sort && toggleSort(col.label)}
                      className={`th ${col.align === 'right' ? 'text-right' : ''} ${col.sort ? 'cursor-pointer select-none hover:text-neutral-800' : ''} ${active ? 'text-neutral-900' : ''}`}
                    >
                      {col.label}
                      {col.sort && <span className="ml-0.5 text-[9px]">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const status = statusById.get(s.id) ?? 'unpaid'
                return (
                  <tr key={s.id} className="hover:bg-neutral-50">
                    <td className="td text-neutral-400">{i + 1}</td>
                    <td className="td font-medium">{companiesById[s.company_id]?.name ?? '?'}
                      {data.plantSel === 'all' && data.plants.length > 1 &&
                        <div className="text-[10px] text-neutral-400">{plantsById[s.plant_id]?.name}</div>}
                    </td>
                    <td className="td mono text-xs">{s.ref}</td>
                    <td className="td whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="td mono text-xs">{s.do_no}</td>
                    <td className="td">{gradesById[s.grade_id]?.name ?? '?'}</td>
                    <td className="td text-right">{fmtNum(s.volume_m3)}</td>
                    <td className="td text-right">{fmtNum(s.rate_rm)}</td>
                    <td className="td text-right">{fmtNum(s.trip)}</td>
                    <td className="td text-right">{fmtNum(s.rm_per_trip)}</td>
                    <td className="td text-right font-bold">{fmtNum(saleTotal(s))}</td>
                    <td className="td">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PAYVIA_CLS[payViaOf(s)]}`}>{PAYVIA_LABEL[payViaOf(s)]}</span>
                    </td>
                    <td className="td">
                      <span className={`text-xs font-semibold ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
                      {status === 'unpaid' && num(paidById.get(s.id)) > 0.005 &&
                        <div className="text-[10px] text-neutral-400">{fmtNum(paidById.get(s.id))} paid</div>}
                    </td>
                    <td className="td text-center">{Number(s.invoice_issued) === 1
                      ? <span title={s.invoice_date ? fmtDate(s.invoice_date) : ''}>✓</span> : '—'}</td>
                    <td className="td">
                      {attachmentList(s).map((name) => (
                        <a key={name} href={`/api/files/sale-${s.id}/${encodeURIComponent(name)}`}
                          target="_blank" rel="noreferrer"
                          className="block text-xs text-blue-700 hover:underline max-w-[120px] truncate" title={name}>
                          📎 {name}
                        </a>
                      ))}
                    </td>
                    <td className="td text-xs text-neutral-500 max-w-[140px] truncate">{s.remarks}</td>
                    <td className="td whitespace-nowrap">
                      <button className="text-neutral-500 hover:text-neutral-900 text-xs font-medium mr-3 cursor-pointer" onClick={() => setEditing({ ...s })}>Edit</button>
                      <ConfirmDelete onConfirm={() => data.remove('sales', s.id)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty>No sales records</Empty>}
        </div>
      </SectionCard>

      <CompanyAccountPanel sales={mySales} payments={myPayments} fCompany={fCompany} />

      {editing && <SaleModal form={editing} onClose={() => setEditing(null)} />}
      {paying && <PaymentModal form={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}

const attachmentList = (sale) => String(sale.do_file ?? '').split(';').map((x) => x.trim()).filter(Boolean)

// ---- Company account panel: ledger + live credit/outstanding ----
function CompanyAccountPanel({ sales, payments, fCompany }) {
  const { companiesById } = useData()
  const ids = useMemo(() => {
    const set = new Set([...sales.map((s) => Number(s.company_id)), ...payments.map((p) => Number(p.company_id))])
    return [...set].filter(Boolean).sort((a, b) => (companiesById[a]?.name ?? '').localeCompare(companiesById[b]?.name ?? ''))
  }, [sales, payments, companiesById])

  const [picked, setPicked] = useState(null)
  const selected = picked != null && ids.includes(picked) ? picked : (fCompany !== 'all' ? Number(fCompany) : ids[0])

  const acct = selected ? companyAccount(selected, sales, payments) : null
  const rows = useMemo(() => selected
    ? buildLedger(sales.filter((s) => Number(s.company_id) === selected), payments.filter((p) => Number(p.company_id) === selected))
    : [], [sales, payments, selected])

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50">
        <div className="flex items-center gap-3">
          <span className="label">Company Account</span>
          <select className="input !py-1" value={selected ?? ''} onChange={(e) => setPicked(Number(e.target.value))}>
            {ids.map((id) => <option key={id} value={id}>{companiesById[id]?.name ?? `#${id}`}</option>)}
          </select>
        </div>
        {acct && (
          <div className="flex items-center gap-4 text-sm">
            {acct.outstanding > 0.005
              ? <span className="font-bold text-red-600">Overdue {fmtRM(acct.outstanding)}</span>
              : acct.credit > 0.005
                ? <span className="font-bold text-emerald-600">Credit Balance {fmtRM(acct.credit)}</span>
                : <span className="font-bold text-neutral-500">Settled</span>}
          </div>
        )}
      </div>
      {rows.length === 0 ? <Empty>No account activity for this company</Empty> : (
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th text-right">Cash In (RM)</th>
                <th className="th text-right">Reload In (RM)</th>
                <th className="th text-right">Order (RM)</th>
                <th className="th text-right">Balance (RM)</th>
                <th className="th">Files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td className="td">{fmtDate(r.date)}</td>
                  <td className="td text-right text-sky-700">{r.cashIn ? fmtNum(r.cashIn) : ''}</td>
                  <td className="td text-right text-violet-700">{r.reloadIn ? fmtNum(r.reloadIn) : ''}</td>
                  <td className="td text-right">{r.order ? fmtNum(r.order) : ''}</td>
                  <td className={`td text-right font-semibold ${r.balance < -0.005 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtNum(r.balance)}</td>
                  <td className="td">
                    {r.files.map((file) => (
                      <a key={`${file.id}-${file.name}`} href={`/api/files/payment-${file.id}/${encodeURIComponent(file.name)}`}
                        target="_blank" rel="noreferrer"
                        className="block text-xs text-blue-700 hover:underline max-w-[140px] truncate" title={file.name}>📎 {file.name}</a>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-2 text-[11px] text-neutral-400 border-t border-neutral-100">
        Every payment (cash-in or reload) clears the earliest unpaid orders first. Positive balance = Credit Balance available for upcoming orders; negative = Overdue.
      </div>
    </div>
  )
}

// ---- Record payment (cash or reload credit) ----
function PaymentModal({ form, onClose }) {
  const { companies, sales, payments, create, refresh, demo } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // preview the effect by recomputing the account with this hypothetical payment
  const preview = useMemo(() => {
    if (!f.company_id) return null
    const hypo = { company_id: Number(f.company_id), date: f.date || todayISO(), amount_rm: Number(f.amount_rm) || 0, method: f.method }
    return companyAccount(Number(f.company_id), sales, [...payments, hypo])
  }, [f.company_id, f.amount_rm, f.method, f.date, sales, payments])

  const save = async () => {
    if (saving) return
    if (!f.company_id) return setError('Choose a company')
    if (!(Number(f.amount_rm) > 0)) return setError('Enter an amount')
    setSaving(true)
    try {
      const saved = await create('payments', { ...f, amount_rm: Number(f.amount_rm) })
      if (!demo && pendingFiles.length > 0) {
        const fd = new FormData()
        for (const file of pendingFiles) fd.append('files', file)
        const res = await fetch(`/api/payments/${saved.id}/attachments`, { method: 'POST', body: fd })
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'File upload failed') }
        await refresh()
      }
      onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Company">
          <select className="input w-full" value={f.company_id} onChange={set('company_id')}>
            <option value="">— select —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="Method">
          <select className="input w-full" value={f.method} onChange={set('method')}>
            <option value="cash">Cash payment</option>
            <option value="reload">Reload credit (prepaid)</option>
          </select>
        </Field>
        <Field label="Amount (RM)"><input type="number" step="0.01" className="input w-full" value={f.amount_rm} onChange={set('amount_rm')} autoFocus /></Field>
        <Field label="Remarks" span2><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
        <Field label="Attachment — bank slip / receipt" span2>
          <input type="file" multiple className="block text-sm text-neutral-600 file:mr-3 file:btn file:cursor-pointer"
            onChange={(e) => setPendingFiles([...e.target.files])} />
          {pendingFiles.length > 0 && <div className="text-xs text-neutral-500 mt-1">{pendingFiles.length} file(s) will be uploaded on save</div>}
          {demo && <div className="text-[11px] text-amber-600 mt-1">Demo mode — attachments are not saved.</div>}
        </Field>
      </div>
      {preview && (
        <div className="mt-3 text-xs bg-neutral-50 border border-neutral-200 rounded-md px-3 py-2">
          After this payment — {preview.outstanding > 0.005
            ? <span className="font-semibold text-red-600">Overdue {fmtRM(preview.outstanding)}</span>
            : <span className="font-semibold text-emerald-600">Credit Balance {fmtRM(preview.credit)}</span>}
          <span className="text-neutral-400 block mt-1">
            Clears the earliest unpaid orders first; any surplus becomes Credit Balance for upcoming orders.
          </span>
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Payment'}</button>
      </div>
    </Modal>
  )
}

function SaleModal({ form, onClose }) {
  const { plants, projects, companies, grades, gradesById, create, update, refresh, demo } = useData()
  const [f, setF] = useState(form)
  const [error, setError] = useState('')
  const [pendingFiles, setPendingFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [addingCompany, setAddingCompany] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')

  const saveNewCompany = async () => {
    const name = newCompanyName.trim()
    if (!name) return
    try {
      const existing = companies.find((c) => c.name.toLowerCase() === name.toLowerCase())
      const company = existing ?? await create('companies', { name })
      setF((prev) => ({ ...prev, company_id: company.id }))
      setAddingCompany(false); setNewCompanyName(''); setError('')
    } catch (e) { setError(e.message) }
  }
  const isEdit = !!form.id
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value })
  const total = saleTotal(f)
  const existingFiles = isEdit ? attachmentList(f) : []

  const uploadFiles = async (saleId) => {
    if (demo || pendingFiles.length === 0) return
    const fd = new FormData()
    for (const file of pendingFiles) fd.append('files', file)
    const res = await fetch(`/api/sales/${saleId}/attachments`, { method: 'POST', body: fd })
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'File upload failed') }
  }

  const deleteAttachment = async (name) => {
    const res = await fetch(`/api/sales/${f.id}/attachments/${encodeURIComponent(name)}`, { method: 'DELETE' })
    const names = await res.json()
    if (!res.ok) return setError(names.error || 'Delete failed')
    setF({ ...f, do_file: names.join('; ') }); refresh()
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const body = {
        ...f,
        volume_m3: Number(f.volume_m3), rate_rm: Number(f.rate_rm),
        trip: Number(f.trip) || 0, rm_per_trip: Number(f.rm_per_trip) || 0,
        invoice_date: Number(f.invoice_issued) === 1 ? (f.invoice_date || f.date) : '',
      }
      const saved = isEdit ? await update('sales', f.id, body) : await create('sales', body)
      await uploadFiles(saved.id)
      if (pendingFiles.length > 0) await refresh()
      onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? `Edit Sale ${f.ref}` : 'Add Sale'} onClose={onClose} wide>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Plant">
          <select className="input w-full" value={f.plant_id} onChange={set('plant_id')}>
            {plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Company">
          {addingCompany ? (
            <div className="flex gap-1">
              <input className="input w-full" autoFocus placeholder="New company name"
                value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNewCompany()} />
              <button className="btn-dark !px-2" onClick={saveNewCompany}>✓</button>
              <button className="btn !px-2" onClick={() => setAddingCompany(false)}>×</button>
            </div>
          ) : (
            <select className="input w-full" value={f.company_id}
              onChange={(e) => { if (e.target.value === '__new') setAddingCompany(true); else setF({ ...f, company_id: e.target.value }) }}>
              <option value="">— select —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">＋ Add new company…</option>
            </select>
          )}
        </Field>
        <Field label="Ref"><input className="input w-full" value={f.ref} onChange={set('ref')} placeholder="KKSB-15" /></Field>
        <Field label="Date"><input type="date" className="input w-full" value={f.date} onChange={set('date')} /></Field>
        <Field label="DO No."><input className="input w-full mono" value={f.do_no} onChange={set('do_no')} /></Field>
        <Field label="Project (optional)">
          <select className="input w-full" value={f.project_id ?? ''} onChange={set('project_id')}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
          </select>
        </Field>
        <Field label="Grade">
          <select className="input w-full" value={f.grade_id} onChange={(e) => {
            const g = gradesById[e.target.value]
            setF({ ...f, grade_id: e.target.value, rate_rm: f.rate_rm || g?.default_rate || '' })
          }}>
            <option value="">— select —</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Volume (m³)"><input type="number" step="0.5" className="input w-full" value={f.volume_m3} onChange={set('volume_m3')} /></Field>
        <Field label="Rate (RM/m³)"><input type="number" step="0.01" className="input w-full" value={f.rate_rm} onChange={set('rate_rm')} /></Field>
        <Field label="Trips"><input type="number" step="1" className="input w-full" value={f.trip} onChange={set('trip')} /></Field>
        <Field label="RM / Trip"><input type="number" step="0.01" className="input w-full" value={f.rm_per_trip} onChange={set('rm_per_trip')} /></Field>
        <Field label="Pay Via">
          <select className="input w-full" value={f.pay_method ?? 'cash'} onChange={set('pay_method')}>
            <option value="cash">Cash payment</option>
            <option value="reload">Reload credit</option>
          </select>
        </Field>
        <Field label="Remarks"><input className="input w-full" value={f.remarks} onChange={set('remarks')} /></Field>
      </div>

      {/* Attachments */}
      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="label mb-2">Attachments — DO / reference documents</div>
        {existingFiles.map((name) => (
          <div key={name} className="flex items-center gap-2 text-sm mb-1">
            <a href={`/api/files/sale-${f.id}/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline truncate">📎 {name}</a>
            <button className="text-red-500 hover:text-red-700 text-xs cursor-pointer" onClick={() => deleteAttachment(name)}>remove</button>
          </div>
        ))}
        <input type="file" multiple className="block text-sm text-neutral-600 file:mr-3 file:btn file:cursor-pointer"
          onChange={(e) => setPendingFiles([...e.target.files])} />
        {pendingFiles.length > 0 && <div className="text-xs text-neutral-500 mt-1">{pendingFiles.length} file(s) will be uploaded on save</div>}
      </div>

      {/* Invoice */}
      <div className="flex items-center gap-6 mt-4 border-t border-neutral-200 pt-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={Number(f.invoice_issued) === 1} onChange={set('invoice_issued')} />
          Invoice issued
        </label>
        {Number(f.invoice_issued) === 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="label">Invoice date</span>
            <input type="date" className="input" value={f.invoice_date || f.date} onChange={set('invoice_date')} />
          </label>
        )}
        <div className="flex-1" />
        <div className="text-sm">Total: <span className="font-bold">{fmtRM(total)}</span></div>
      </div>
      <div className="text-[11px] text-neutral-400 mt-2">Payment is recorded at company level — use “+ Record Payment”. Payments clear the earliest unpaid orders first; this sale shows Paid once settled.</div>
      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-dark" onClick={save}>{isEdit ? 'Save Changes' : 'Add Sale'}</button>
      </div>
    </Modal>
  )
}
