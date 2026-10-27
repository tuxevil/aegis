// Canonical UTC only. Never normalize impossible calendar dates or infer offsets.
export function utcMillis(value) {
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))return NaN;
  const time=Date.parse(value),canonical=value.includes(".")?value:value.slice(0,-1)+".000Z";
  return Number.isFinite(time)&&new Date(time).toISOString()===canonical?time:NaN;
}
