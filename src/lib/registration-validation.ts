export function normalizeCpf(value: string): string | null {
  const cpf = value.replace(/[\s.-]/g, '')
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return null
  const check = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i)
    return (sum * 10) % 11 % 10
  }
  return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]) ? cpf : null
}

export function validEmail(value: string): boolean {
  const email = value.trim()
  if (email.length > 254) return false
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  const atom = /^[\p{L}\p{N}!#$%&'*+/=?^_`{|}~-]+$/u
  const label = /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u
  return local.length <= 64 && local.split('.').every((part) => atom.test(part))
    && domain.split('.').length >= 2 && domain.split('.').every((part) => part.length <= 63 && label.test(part))
}

export function birthdateStatus(value: string, today = new Date()): 'valid' | 'invalid' | 'underage' {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'invalid'
  const birth = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== value) return 'invalid'
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(today).map(({ type, value: part }) => [type, part]))
  const currentDate = `${parts.year}-${parts.month}-${parts.day}`
  if (value > currentDate) return 'invalid'
  const age = Number(parts.year) - Number(value.slice(0, 4))
    - (currentDate.slice(5) < value.slice(5) ? 1 : 0)
  return age >= 18 ? 'valid' : 'underage'
}
