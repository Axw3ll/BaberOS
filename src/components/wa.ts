/** Enlace wa.me para usar en el navegador (lib/crm.ts es solo de servidor). 10 dígitos = México (+52). */
export function whatsappUrlClient(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
