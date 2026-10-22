// Illustrative mathematical surface. Never a DEM, bathymetry or reservoir-volume model.
export function drawScene(canvas, degrees = 0) {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const angle = ((degrees + 35) * Math.PI) / 180,
    point = (x, z) => {
      const height = 35 + 22 * Math.sin(x * 0.7) * Math.cos(z * 0.6);
      return [
        320 + (x * Math.cos(angle) - z * Math.sin(angle)) * 24,
        130 + (x * Math.sin(angle) + z * Math.cos(angle)) * 10 - height,
      ];
    };
  context.clearRect(0, 0, 640, 360);
  context.fillStyle = "#eaf1ed";
  context.fillRect(0, 0, 640, 360);
  context.strokeStyle = "#52776b";
  context.lineWidth = 1;
  for (let z = -6; z <= 6; z++) {
    context.beginPath();
    for (let x = -6; x <= 6; x++) {
      const p = point(x, z);
      if (x === -6) context.moveTo(...p);
      else context.lineTo(...p);
    }
    context.stroke();
  }
  for (let x = -6; x <= 6; x++) {
    context.beginPath();
    for (let z = -6; z <= 6; z++) {
      const p = point(x, z);
      if (z === -6) context.moveTo(...p);
      else context.lineTo(...p);
    }
    context.stroke();
  }
  context.fillStyle = "#173239";
  context.font = "14px sans-serif";
  context.fillText("ESQUEMA ILUSTRATIVO · SIN BATIMETRÍA", 24, 300);
  context.fillText(
    "Sin DEM real. La malla no representa el fondo de Mazar.",
    24,
    325,
  );
  return true;
}
