// Deliberately synthetic PDF generator; contains no provider bytes.
export function syntheticBulletin({day="25",month="octubre",year="2026",number=83}={}) {
  const lines=["SYNTHETIC TEST - NOT AN OFFICIAL BULLETIN",`Boletin Meteorologico Nro. ${number}`,
    `Fecha y hora de emision: domingo, ${day} de ${month} de ${year}, 14:00 horas`,
    `Vigencia: desde 16H00 del ${day} hasta las 23H00 del 28 de ${month} de ${year}`,
    "NIVEL AMENAZA: MEDIO - MUY ALTO FENOMENO: LLUVIAS","ZONAS AFECTADAS: Guayas"];
  const stream="BT /F1 10 Tf 40 750 Td "+lines.map((s,i)=>(i?"0 -20 Td ":"")+`(${s}) Tj`).join("\n")+" ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 900] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf="%PDF-1.4\n";const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const start=Buffer.byteLength(pdf);
  pdf+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("");
  return Buffer.from(pdf+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
}
