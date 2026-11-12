/** Click-to-chat link for a stored phone number; null when there is no usable number. Phase 2 replaces this with in-app sending. */
export const whatsAppUrl = (phone: string | null): string | null => {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
};
