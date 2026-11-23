export const clockTime = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(+d) ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
};
