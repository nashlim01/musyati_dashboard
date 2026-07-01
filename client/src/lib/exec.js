// Executive dashboard helpers — derived values + one-page landscape PDF export.
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
export const pct = (done, total) => (num(total) > 0 ? (num(done) / num(total)) * 100 : 0)

// element belongs to the bored-pile group (abutments + piers) vs the structure group
export const isPileElement = (el) => /^Abt|^P\d/i.test(String(el))

// aggregate a bridge's progress cells into bored-pile and structure done/total
export function bridgeRollup(cells) {
  const acc = { pileDone: 0, pileTotal: 0, structDone: 0, structTotal: 0 }
  for (const c of cells) {
    if (isPileElement(c.element)) { acc.pileDone += num(c.done); acc.pileTotal += num(c.total) }
    else { acc.structDone += num(c.done); acc.structTotal += num(c.total) }
  }
  return acc
}

// Render a DOM node (the presentation layout) to a single landscape PDF page.
export async function exportExecPdf(node, filename = 'executive-dashboard') {
  const canvas = await html2canvas(node, {
    scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
    ignoreElements: (el) => el.classList?.contains('exec-noexport'), // hide edit buttons
  })
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight()
  const ratio = canvas.height / canvas.width
  let w = pw, h = pw * ratio
  if (h > ph) { h = ph; w = ph / ratio }
  pdf.addImage(img, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h)
  pdf.save(`${filename}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
