import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

const fontsDir = path.join(process.cwd(), 'fonts');
try {
  if (fs.existsSync(path.join(fontsDir, 'GreatVibes-Regular.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'GreatVibes-Regular.ttf'), 'Great Vibes');
  }
  if (fs.existsSync(path.join(fontsDir, 'AlexBrush-Regular.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'AlexBrush-Regular.ttf'), 'Alex Brush');
  }
  if (fs.existsSync(path.join(fontsDir, 'Righteous-Regular.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Righteous-Regular.ttf'), 'Righteous');
  }
} catch (_) {}

class YunaBanner {
  static _roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  static drawFlowerPetal(ctx: any, x: number, y: number, size: number, angle: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-size * 0.5, -size * 0.8, -size * 0.8, -size * 1.5, 0, -size * 2);
    ctx.bezierCurveTo(size * 0.8, -size * 1.5, size * 0.5, -size * 0.8, 0, 0);

    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  static drawSakuraFlower(ctx: any, cx: number, cy: number, size: number) {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const petalGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
      petalGrad.addColorStop(0, 'rgba(255, 192, 203, 0.95)');
      petalGrad.addColorStop(1, 'rgba(255, 105, 180, 0.75)');
      this.drawFlowerPetal(ctx, cx, cy, size, angle, petalGrad);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.restore();
  }

  static async generate() {
    return this.renderBanner();
  }

  static async renderBanner() {
    const width = 800;
    const height = 180;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const centerX = width / 2;

    ctx.fillStyle = '#06070E';
    ctx.fillRect(0, 0, width, height);

    const bgGlow1 = ctx.createRadialGradient(centerX, 90, 10, centerX, 90, 380);
    bgGlow1.addColorStop(0, 'rgba(255, 105, 180, 0.28)');
    bgGlow1.addColorStop(1, 'rgba(6, 7, 14, 0)');
    ctx.fillStyle = bgGlow1;
    ctx.fillRect(0, 0, width, height);

    this.drawSakuraFlower(ctx, 70, 45, 14);
    this.drawSakuraFlower(ctx, 730, 45, 16);
    this.drawSakuraFlower(ctx, 750, 135, 11);
    this.drawSakuraFlower(ctx, 50, 135, 10);

    const pMargin = 12;
    const pWidth = width - pMargin * 2;
    const pHeight = height - pMargin * 2;
    const pRadius = 20;

    ctx.save();
    this._roundRect(ctx, pMargin, pMargin, pWidth, pHeight, pRadius);
    ctx.fillStyle = 'rgba(14, 16, 26, 0.84)';
    ctx.fill();

    const shine = ctx.createLinearGradient(pMargin, pMargin, pMargin + pWidth, pMargin + pHeight);
    shine.addColorStop(0, 'rgba(255, 192, 203, 0.12)');
    shine.addColorStop(0.35, 'rgba(255, 255, 255, 0.02)');
    shine.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.restore();

    ctx.save();
    this._roundRect(ctx, pMargin, pMargin, pWidth, pHeight, pRadius);
    const borderGrad = ctx.createLinearGradient(pMargin, pMargin, pMargin + pWidth, pMargin + pHeight);
    borderGrad.addColorStop(0, 'rgba(255, 182, 193, 0.55)');
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    borderGrad.addColorStop(1, 'rgba(255, 105, 180, 0.45)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    this.drawSakuraFlower(ctx, centerX - 140, 70, 18);
    this.drawSakuraFlower(ctx, centerX + 140, 70, 18);

    ctx.font = '78px "Great Vibes", "Alex Brush", cursive';
    const textGrad = ctx.createLinearGradient(centerX - 100, 40, centerX + 100, 100);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(0.5, '#FFC0CB');
    textGrad.addColorStop(1, '#FF69B4');

    ctx.fillStyle = textGrad;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Yuna', centerX, 68);
    ctx.restore();

    ctx.save();
    ctx.font = '14px "Righteous"';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌸 SAKURA MUSIC COMPANION · ADVANCED UTILITY', centerX, 126);
    ctx.restore();

    return canvas.toBuffer('image/png');
  }
}

export { YunaBanner as BannerCard, YunaBanner };
export default YunaBanner;

// Made by Nikhil Under CodeX Devs
