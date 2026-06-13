// Left workspace switcher: collapses to icons, remembers state.
export default function Sidebar({ workspaces, active, onSelect, open }) {
  return (
    <aside
      className={`shrink-0 bg-neutral-900 text-neutral-300 transition-all duration-200 ${open ? 'w-52' : 'w-14'}`}
    >
      <div className="sticky top-0 py-3">
        {Object.entries(workspaces).map(([key, ws]) => {
          const isActive = key === active
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              title={ws.label}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer border-l-2 ${
                isActive
                  ? 'border-white bg-neutral-800 text-white font-semibold'
                  : 'border-transparent hover:bg-neutral-800/60 hover:text-white'
              }`}
            >
              <span className="text-lg leading-none">{ws.icon}</span>
              {open && <span className="text-sm whitespace-nowrap">{ws.label}</span>}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
