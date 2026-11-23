export const ago = (iso?: string | null) => {
  if (!iso) {
    return '';
  }
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1
    ? 'just now'
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.round(m / 60)}h ago`
        : `${Math.round(m / 1440)}d ago`;
};
