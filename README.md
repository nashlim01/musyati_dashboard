# Musyati Tracking Monitor

Batching plant operations dashboard for SSLR Phase 2. React + Vite + Tailwind frontend, small Node/Express API, **with an Excel workbook as the database**.

## Run it

```bash
cd musyati-dashboard
npm install      # first time only
npm run dev      # starts API (port 4000) + web app (port 3000)
```

Open http://localhost:3000.

## How data is stored

`server/data/musyati-data.xlsx` is the single source of truth — one sheet per table:

- **Plants, Companies, Grades, Materials, ExpenseCategories** — reference tables
  (materials are global: every plant draws from the same catalogue)
- **Sales, Pours, MaterialTxns, Expenses, Costing** — records, linked by `*_id` columns
- **Machines, MaintenanceRecords** — machinery register + maintenance/service log
- **Workers, Attendance** — manpower register + daily attendance (wages = days × daily rate)

Sale attachments (DO scans etc.) can't live inside Excel, so the files are stored in
`server/data/attachments/sale-<id>/` and their filenames are recorded in the Sales
sheet's `do_file` column. Upload/remove them from the sale's Edit dialog.

You can open the file in Excel any time. Every edit made in the app is written back
atomically, and a timestamped copy is kept in `server/data/backups/` (last 30).
The **Backup Excel** button in the header downloads the live workbook.

Totals are never stored: sale totals, running balances, material balances, COGS and
net income are always computed from raw rows (see `client/src/lib/calc.js`).

### Key formulas

- Sale total = volume × rate + trips × RM/trip
- Running balance = cumulative cash in − cumulative orders (per company)
- Production claim = month's pour volume × claim price (entered on the Costing page)
- COGS = inventory B/F + purchases − inventory C/F
- Net income = claim − COGS − expenses
- Material balance = opening + received − usage − transfers out

### Seed data note

May 2026 daily pour rows were transcribed best-effort from the monthly summary
screenshot — the per-grade monthly totals match the Excel TOTAL row exactly, but
individual days may differ. Edit them in Pour Records if needed.
RS231SD's opening balance was not readable and is set to 0.

To start over from seed data, stop the server and delete `server/data/musyati-data.xlsx`.
