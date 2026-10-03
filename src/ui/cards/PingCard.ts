import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";

const fontsDir = path.join(process.cwd(), "fonts");
try {
  if (fs.existsSync(path.join(fontsDir, "GreatVibes-Regular.ttf"))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, "GreatVibes-Regular.ttf"), "Great Vibes");
  }
  if (fs.existsSync(path.join(fontsDir, "AlexBrush-Regular.ttf"))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, "AlexBrush-Regular.ttf"), "Alex Brush");
  }
  if (fs.existsSync(path.join(fontsDir, "Righteous-Regular.ttf"))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, "Righteous-Regular.ttf"), "Righteous");
  }
} catch (_) {}

export class PingCard {
  history: any;
  wsPing!: number;
  msgLatency!: number;
  totalLatency!: number;

  constructor(options: any = {}) {
    this.wsPing = options.wsPing || 0;
    this.msgLatency = options.msgLatency || 0;
    this.totalLatency = this.wsPing + this.msgLatency;
    this.history = options.history || [
      Math.max(10, this.wsPing + Math.floor(Math.random() * 12) - 6),
      Math.max(10, this.wsPing + Math.floor(Math.random() * 16) - 8),
      Math.max(10, this.wsPing + Math.floor(Math.random() * 10) - 5),
      Math.max(10, this.wsPing + Math.floor(Math.random() * 8) - 4),
      this.wsPing
    ];
  }

  _roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  drawFlowerPetal(ctx: any, x: number, y: number, size: number, angle: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.5, -size * 0.8, -size * 0.8, -size * 1.5, 0, -size * 2);
    ctx.bezierCurveTo(size * 0.8, -size * 1.5, size * 0.5, -size * 0.8, 0, 0);

    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(255, 182, 193, 0.6)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }

  drawSakuraFlower(ctx: any, cx: number, cy: number, size: number) {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const petalGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
      petalGrad.addColorStop(0, "rgba(255, 192, 203, 0.95)");
      petalGrad.addColorStop(1, "rgba(255, 105, 180, 0.7)");
      this.drawFlowerPetal(ctx, cx, cy, size, angle, petalGrad);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#FFD700";
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }

  async render() {
    const width = 920;
    const height = 300;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#06070E";
    ctx.fillRect(0, 0, width, height);

    const bgGlow1 = ctx.createRadialGradient(250, 100, 10, 250, 100, 450);
    bgGlow1.addColorStop(0, "rgba(255, 105, 180, 0.28)");
    bgGlow1.addColorStop(1, "rgba(6, 7, 14, 0)");
    ctx.fillStyle = bgGlow1;
    ctx.fillRect(0, 0, width, height);

    const bgGlow2 = ctx.createRadialGradient(750, 200, 10, 750, 200, 400);
    bgGlow2.addColorStop(0, "rgba(255, 182, 193, 0.22)");
    bgGlow2.addColorStop(1, "rgba(6, 7, 14, 0)");
    ctx.fillStyle = bgGlow2;
    ctx.fillRect(0, 0, width, height);

    this.drawSakuraFlower(ctx, 80, 70, 14);
    this.drawSakuraFlower(ctx, 840, 60, 16);
    this.drawSakuraFlower(ctx, 880, 240, 12);
    this.drawSakuraFlower(ctx, 60, 250, 10);

    const pMargin = 16;
    const pWidth = width - pMargin * 2;
    const pHeight = height - pMargin * 2;
    const pRadius = 24;

    ctx.save();
    this._roundRect(ctx, pMargin, pMargin, pWidth, pHeight, pRadius);
    ctx.fillStyle = "rgba(14, 16, 26, 0.82)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    this._roundRect(ctx, pMargin, pMargin, pWidth, pHeight, pRadius);
    const borderGrad = ctx.createLinearGradient(pMargin, pMargin, pMargin + pWidth, pMargin + pHeight);
    borderGrad.addColorStop(0, "rgba(255, 182, 193, 0.6)");
    borderGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
    borderGrad.addColorStop(1, "rgba(255, 105, 180, 0.5)");
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = "rgba(255, 105, 180, 0.4)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    this.drawSakuraFlower(ctx, 240, 85, 22);

    ctx.font = '84px "Great Vibes", "Alex Brush", cursive';
    const textGrad = ctx.createLinearGradient(50, 50, 300, 110);
    textGrad.addColorStop(0, "#FFFFFF");
    textGrad.addColorStop(0.5, "#FFC0CB");
    textGrad.addColorStop(1, "#FF69B4");

    ctx.fillStyle = textGrad;
    ctx.shadowColor = "rgba(255, 105, 180, 0.8)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Yuna", 50, 85);
    ctx.restore();

    ctx.save();
    ctx.font = '14px "Righteous"';
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.textAlign = "left";
    ctx.fillText("🌸 SAKURA MUSIC COMPANION · NETWORK DIAGNOSTICS", 50, 140);
    ctx.restore();

    const metricsY = 175;
    const cardW = 265;
    const cardH = 90;
    const gap = 20;

    const statusText = this.wsPing < 80 ? "EXCELLENT" : this.wsPing < 160 ? "OPTIMAL" : "HIGH LATENCY";
    const statusColor = this.wsPing < 80 ? "#FF69B4" : this.wsPing < 160 ? "#FFD166" : "#FF5964";

    const card1X = 50;
    this._renderMetricBox(ctx, card1X, metricsY, cardW, cardH, {
      label: "WEBSOCKET PING",
      labelFont: '12px "Righteous"',
      numVal: `${this.wsPing}`,
      numFont: '26px "Righteous"',
      unitVal: " ms",
      unitFont: '13px "Righteous"',
      sub: "Gateway Connection",
      subFont: '11px "Righteous"',
      color: "#FF69B4"
    });

    const card2X = card1X + cardW + gap;
    this._renderMetricBox(ctx, card2X, metricsY, cardW, cardH, {
      label: "MESSAGE LATENCY",
      labelFont: '12px "Righteous"',
      numVal: `${this.msgLatency}`,
      numFont: '26px "Righteous"',
      unitVal: " MS",
      unitFont: '13px "Righteous"',
      sub: "API Roundtrip Speed",
      subFont: '11px "Righteous"',
      color: "#FFB6C1"
    });

    const card3X = card2X + cardW + gap;
    this._renderMetricBox(ctx, card3X, metricsY, cardW, cardH, {
      label: "SYSTEM STATUS",
      labelFont: '12px "Righteous"',
      numVal: statusText,
      numFont: statusText.length > 8 ? '18px "Righteous"' : '20px "Righteous"',
      unitVal: "",
      unitFont: '',
      sub: `Total ${this.totalLatency}ms`,
      subFont: '11px "Righteous"',
      color: statusColor
    });

    return canvas.toBuffer("image/png");
  }

  _renderMetricBox(ctx: any, x: number, y: number, w: number, h: number, config: any) {
    ctx.save();
    this._roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.fill();

    ctx.strokeStyle = `${config.color}55`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = config.labelFont;
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText(config.label, x + 16, y + 24);

    ctx.font = config.numFont;
    ctx.fillStyle = config.color;
    ctx.shadowColor = `${config.color}88`;
    ctx.shadowBlur = 12;

    const numWidth = ctx.measureText(config.numVal).width;
    ctx.fillText(config.numVal, x + 16, y + 56);

    if (config.unitVal) {
      ctx.font = config.unitFont;
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.shadowBlur = 0;
      ctx.fillText(config.unitVal, x + 16 + numWidth, y + 56);
    }

    ctx.font = config.subFont;
    ctx.fillStyle = "rgba(255, 255, 255, 0.48)";
    ctx.shadowBlur = 0;
    ctx.fillText(config.sub, x + 16, y + 76);

    ctx.restore();
  }
}

export default PingCard;

// Made by Nikhil Under CodeX Devs
