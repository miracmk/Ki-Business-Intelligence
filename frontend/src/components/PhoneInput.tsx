import { useMemo, useState, useEffect } from 'react'
import { COUNTRIES } from '../lib/geoData'
import { SearchableSelect } from './SearchableSelect'

interface PhoneInputProps {
  value:       string   // combined formatted string, e.g. "+90 555 123 45 67"
  onChange:    (value: string) => void
  disabled?:   boolean
  className?:  string
}

function groupDigits(digits: string): string {
  const pattern = [3, 3, 2, 2]
  const groups: string[] = []
  let rest = digits
  let i = 0
  while (rest.length > 0) {
    const size = pattern[i] ?? 2
    groups.push(rest.slice(0, size))
    rest = rest.slice(size)
    i++
  }
  return groups.join(' ')
}

function parseValue(value: string): { countryCode: string; digits: string } {
  const trimmed = value.trim()
  const byDialCode = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
    .find(c => trimmed.startsWith(c.dialCode))
  const countryCode = byDialCode?.code ?? 'TR'
  const rest = byDialCode ? trimmed.slice(byDialCode.dialCode.length) : trimmed
  return { countryCode, digits: rest.replace(/\D/g, '') }
}

export function PhoneInput({ value, onChange, disabled, className }: PhoneInputProps) {
  const initial = useMemo(() => parseValue(value || ''), [])
  const [countryCode, setCountryCode] = useState(initial.countryCode)
  const [digits, setDigits]           = useState(initial.digits)

  useEffect(() => {
    const parsed = parseValue(value || '')
    setCountryCode(parsed.countryCode)
    setDigits(parsed.digits)
  }, [value])

  const options = COUNTRIES.map(c => ({ value: c.code, label: `${c.dialCode} ${c.name}` }))

  function emit(nextDigits: string, nextCountryCode: string) {
    const nextDialCode = COUNTRIES.find(c => c.code === nextCountryCode)?.dialCode ?? '+90'
    onChange(nextDigits ? `${nextDialCode} ${groupDigits(nextDigits)}` : '')
  }

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      <SearchableSelect
        options={options}
        value={countryCode}
        onChange={code => { setCountryCode(code); emit(digits, code) }}
        disabled={disabled}
        className="w-40 flex-shrink-0"
      />
      <input
        disabled={disabled}
        value={groupDigits(digits)}
        placeholder="555 123 45 67"
        onChange={e => {
          const nextDigits = e.target.value.replace(/\D/g, '').slice(0, 14)
          setDigits(nextDigits)
          emit(nextDigits, countryCode)
        }}
        className="flex-1 px-3 py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm disabled:opacity-50"
      />
    </div>
  )
}
