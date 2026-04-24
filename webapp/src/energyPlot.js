export class EnergyPlot {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw(values) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0e1320';
    ctx.fillRect(0, 0, w, h);

    if (!values.length) return;

    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = Math.max(maxV - minV, 1e-9);

    ctx.strokeStyle = '#34405b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#56cbff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < values.length; i += 1) {
      const x = (i / Math.max(values.length - 1, 1)) * (w - 14) + 7;
      const y = h - ((values[i] - minV) / range) * (h - 14) - 7;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#c9d3df';
    ctx.font = '12px Segoe UI';
    ctx.fillText(`Umin: ${minV.toFixed(3)}`, 8, 15);
    ctx.fillText(`Umax: ${maxV.toFixed(3)}`, 8, 30);
    ctx.fillText(`Ufinal: ${values[values.length - 1].toFixed(3)}`, 8, 45);
  }
}
