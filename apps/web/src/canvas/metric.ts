/** Keep the quoted value intact; suppress a redundant display unit only. */
export function metricDisplay(value: string, unit: string | null) {
  const cleanValue=value.trim(); const cleanUnit=unit?.trim() ?? '';
  const normalized=cleanValue.toLowerCase().replace(/\s+/g,'');
  const normalizedUnit=cleanUnit.toLowerCase().replace(/\s+/g,'');
  const percent = /^(%|percent|percentage|per cent)$/i.test(cleanUnit);
  const duplicate = !!normalizedUnit && (normalized.endsWith(normalizedUnit)
    || (/^[$£€¥]$/.test(cleanUnit) && cleanValue.startsWith(cleanUnit))
    || (percent && /(?:%|percent|percentage)$/.test(normalized)));
  return {value:cleanValue,unit:duplicate || !cleanUnit ? null : cleanUnit};
}
