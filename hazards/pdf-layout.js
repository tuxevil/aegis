// PDF.js already supplies actual spaces as text items. Adding separators between
// every item splits glyph fragments inside words and timestamps.
export const joinPdfItems=items=>items.map(item=>(item.str||"")+(item.hasEOL?"\n":"")).join("");
