export const fmtRM = (n, dashZero = false) => {
  const v = Number(n) || 0
  if (dashZero && v === 0) return '-'
  const s = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${v < 0 ? '-' : ''}RM ${s}`
}

export const fmtNum = (n, digits = 2) => {
  const v = Number(n) || 0
  return v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

// 2026-05-28 -> 28.05.2026 (matches the Excel sheets)
export const fmtDate = (iso) => {
  if (!iso) return '-'
  const [y, m, d] = String(iso).split('-')
  return d && m && y ? `${d}.${m}.${y}` : String(iso)
}

// 2026-05 -> May 2026
export const fmtMonth = (ym) => {
  if (!ym) return '-'
  const [y, m] = String(ym).split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short', year: 'numeric' })
}

export const todayISO = () => new Date().toISOString().slice(0, 10)
