// Client-side Excel + PDF export. Pages describe a dataset as { title, columns, rows };
// columns are { header, value(row) -> raw cell, text?(row) -> display string, align? }.
// Excel keeps raw values (numbers stay numeric); PDF uses the display text.
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const cellText = (col, row) => {
  if (col.text) return col.text(row)
  const v = col.value(row)
  return v == null ? '' : String(v)
}

// ---- Excel ----------------------------------------------------------------
// A "sheet" = { name, columns, rows }. One workbook can hold several.
function sheetFromDataset({ columns, rows }) {
  const header = columns.map((c) => c.header)
  const body = rows.map((row) => columns.map((c) => {
    const v = c.value(row)
    return typeof v === 'number' && Number.isFinite(v) ? v : (v ?? '')
  }))
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  // rough column widths from the longest cell in each column
  ws['!cols'] = columns.map((c, i) => {
    const max = Math.max(c.header.length, ...rows.map((r) => cellText(c, r).length), 8)
    return { wch: Math.min(max + 2, 40) }
  })
  return ws
}

export function exportExcel(filename, sheets) {
  const list = Array.isArray(sheets) ? sheets : [sheets]
  const wb = XLSX.utils.book_new()
  for (const s of list) {
    const name = (s.name || s.title || 'Sheet').slice(0, 31).replace(/[\\/?*[\]:]/g, ' ')
    XLSX.utils.book_append_sheet(wb, sheetFromDataset(s), name)
  }
  XLSX.writeFile(wb, `${filename}-${stamp()}.xlsx`)
}

// ---- PDF ------------------------------------------------------------------
const BRAND = [23, 23, 23] // neutral-900

function header(doc, title, subtitle) {
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, 'F')
  doc.setTextColor(255)
  doc.setFontSize(15).setFont(undefined, 'bold')
  doc.text('Musyati Tracking Monitor', 40, 30)
  doc.setFontSize(11).setFont(undefined, 'normal')
  doc.text(title, 40, 48)
  if (subtitle) {
    doc.setFontSize(8).setTextColor(180)
    doc.text(subtitle, doc.internal.pageSize.getWidth() - 40, 30, { align: 'right' })
  }
  doc.setTextColor(0)
}

function tableBlock(doc, startY, { title, columns, rows }) {
  if (title) {
    doc.setFontSize(11).setFont(undefined, 'bold').setTextColor(...BRAND)
    doc.text(title, 40, startY)
    startY += 6
  }
  autoTable(doc, {
    startY: startY + 6,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => cellText(c, row))),
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { halign: c.align === 'right' ? 'right' : 'left' }])),
    margin: { left: 40, right: 40 },
  })
  return doc.lastAutoTable.finalY
}

// Single-table export (per-tab button). `meta` lines print under the title.
export function exportPDF(filename, { title, subtitle, columns, rows, meta = [] }) {
  const doc = new jsPDF({ orientation: columns.length > 7 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  header(doc, title, subtitle)
  let y = 84
  if (meta.length) {
    doc.setFontSize(9).setFont(undefined, 'normal').setTextColor(90)
    for (const line of meta) { doc.text(line, 40, y); y += 13 }
    y += 4
  }
  tableBlock(doc, y, { columns, rows })
  footer(doc)
  doc.save(`${filename}-${stamp()}.pdf`)
}

// Multi-section report: KPI grid + several tables across pages.
export function exportReportPDF(filename, { title, subtitle, kpis = [], sections = [] }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  header(doc, title, subtitle)
  let y = 88
  if (kpis.length) {
    autoTable(doc, {
      startY: y,
      body: [kpis.map((k) => k.label), kpis.map((k) => k.value)],
      styles: { fontSize: 9, cellPadding: 5, halign: 'center' },
      bodyStyles: { lineColor: [220, 220, 220], lineWidth: 0.5 },
      didParseCell: (data) => {
        if (data.row.index === 0) { data.cell.styles.textColor = [120, 120, 120]; data.cell.styles.fontSize = 7 }
        else { data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = BRAND }
      },
      margin: { left: 40, right: 40 },
    })
    y = doc.lastAutoTable.finalY + 24
  }
  sections.forEach((sec, i) => {
    if (i > 0) y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 28 : y
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 60 }
    y = tableBlock(doc, y, sec)
  })
  footer(doc)
  doc.save(`${filename}-${stamp()}.pdf`)
}

function footer(doc) {
  const pages = doc.internal.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7).setTextColor(150)
    doc.text(`Generated ${new Date().toLocaleString('en-MY')}`, 40, h - 20)
    doc.text(`Page ${i} / ${pages}`, w - 40, h - 20, { align: 'right' })
  }
}
