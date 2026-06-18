import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export interface SearchableOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options:     SearchableOption[]
  value:       string
  onChange:    (value: string) => void
  placeholder?: string
  disabled?:   boolean
  className?:  string
}

export function SearchableSelect({ options, value, onChange, placeholder, disabled, className }: SearchableSelectProps) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  const normalize = (s: string) =>
    s.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = query.trim()
    ? options.filter(o =>
        normalize(o.label).includes(normalize(query)) ||
        (o.sublabel && normalize(o.sublabel).includes(normalize(query))),
      )
    : options

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? 'text-white' : 'text-gray-500'}>
          {selected ? selected.label : (placeholder || 'Seçiniz...')}
        </span>
        <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full bg-[#181818] border border-[#2a2a2a] rounded-lg shadow-xl max-h-64 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#2a2a2a]">
            <Search size={13} className="text-gray-500" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Ara..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">Sonuç bulunamadı</div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#222] ${opt.value === value ? 'text-[#6366f1] bg-[#1a1a2e]' : 'text-gray-200'}`}
              >
                {opt.label}{opt.sublabel ? <span className="text-gray-500 ml-1">{opt.sublabel}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
