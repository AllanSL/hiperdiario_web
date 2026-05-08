/**
 * Formata uma string para o padrão de CPF (000.000.000-00)
 */
export function formatCpf(cpf?: string | number | null): string {
  if (cpf === undefined || cpf === null) return '';
  const s = String(cpf).replace(/\D/g, '');
  if (!s) return '';
  if (s.length <= 3) return s;
  if (s.length <= 6) return s.replace(/(\d{3})(\d+)/, '$1.$2');
  if (s.length <= 9) return s.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d+)/, '$1.$2.$3-$4');
}

/**
 * Valida se uma string é um CPF válido
 */
export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const nums = digits.split('').map(n => parseInt(n, 10));

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += nums[i] * (10 - i);
  let rev = sum % 11;
  const dig1 = rev < 2 ? 0 : 11 - rev;
  if (dig1 !== nums[9]) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += nums[i] * (11 - i);
  rev = sum % 11;
  const dig2 = rev < 2 ? 0 : 11 - rev;
  if (dig2 !== nums[10]) return false;

  return true;
}
