import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';

const CARD_WIDTH = 900;
const CARD_HEIGHT = 440;

let fontsRegisteredGlobally = false;

const T = {
  bgTop: '#0A0B16',
  bgBottom: '#12132A',
  glassFill: 'rgba(255,255,255,0.05)',
  glassStroke: 'rgba(255,255,255,0.13)',
  hairline: 'rgba(255,255,255,0.08)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.72)',
  textMuted: 'rgba(255,255,255,0.42)',
  sakura: '#FF8FC5',
  roseLight: '#FFB6C1',
  roseSoft: '#F4C2C2',
};

export default class ProfileCard {
  constructor() {
    this.registerFonts();
  }

  registerFonts() {
    if (fontsRegisteredGlobally) return;
    try {
      const dir = join(process.cwd(), 'fonts');
      GlobalFonts.registerFromPath(join(dir, 'GreatVibes-Regular.ttf'), 'Great Vibes');
      GlobalFonts.registerFromPath(join(dir, 'AlexBrush-Regular.ttf'), 'Alex Brush');
      GlobalFonts.registerFromPath(join(dir, 'Righteous-Regular.ttf'), 'Righteous');
    } catch {
    }
    fontsRegisteredGlobally = true;
  }

  roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  drawBlossom(ctx: any, x: number, y: number, size: number, alpha = 1) {
    const petals = ['#FFD1E3', '#FFB6C1', '#FF8FC5'];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    ctx.save();
    ctx.rotate(-0.6);
    ctx.fillStyle = 'rgba(255,182,193,0.55)';
    ctx.beginPath();
    ctx.ellipse(-size * 0.75, size * 0.75, size * 0.85, size * 0.34, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(0.4);
    ctx.fillStyle = 'rgba(255,143,197,0.5)';
    ctx.beginPath();
    ctx.ellipse(size * 0.8, -size * 0.7, size * 0.8, size * 0.32, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(size * 0.95, -size * 0.55, size * 0.95, size * 0.55, 0, 0);
      ctx.fillStyle = petals[i % petals.length];
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, size * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,246,0.95)';
    ctx.fill();
    ctx.restore();
  }

  drawPetal(ctx: any, x: number, y: number, size: number, angle: number, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFC3DA';
    ctx.fill();
    ctx.restore();
  }

  drawFlora(ctx: any) {
    this.drawBlossom(ctx, CARD_WIDTH - 66, 54, 30, 0.9);
    this.drawBlossom(ctx, CARD_WIDTH - 124, 108, 17, 0.7);
    this.drawBlossom(ctx, CARD_WIDTH - 34, 122, 12, 0.55);
    this.drawBlossom(ctx, 58, CARD_HEIGHT - 56, 24, 0.85);
    this.drawBlossom(ctx, 116, CARD_HEIGHT - 104, 14, 0.6);

    const petals: Array<[number, number, number, number, number]> = [
      [CARD_WIDTH - 150, 40, 9, 0.5, 0.5],
      [CARD_WIDTH - 96, 168, 7, -0.9, 0.4],
      [CARD_WIDTH - 30, 200, 8, 1.2, 0.35],
      [40, 110, 7, 0.8, 0.4],
      [96, 74, 9, -0.4, 0.45],
      [150, CARD_HEIGHT - 40, 8, 1.4, 0.4],
      [CARD_WIDTH - 190, CARD_HEIGHT - 30, 7, -0.6, 0.35],
    ];
    for (const [x, y, s, a, al] of petals) this.drawPetal(ctx, x, y, s, a, al);
  }

  truncate(ctx: any, text: string, maxWidth: number, font: string) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (ctx.measureText(out + '…').width > maxWidth && out.length > 0) out = out.slice(0, -1);
    return out + '…';
  }

  formatTime(ms: number) {
    if (!ms || isNaN(ms)) return '0H 0M';
    const mins = Math.floor(ms / 60000);
    return `${Math.floor(mins / 60)}H ${mins % 60}M`;
  }

  async createProfileCard(user: any, profileData: any) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const premium = !!profileData.premium;

    const base = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
    base.addColorStop(0, T.bgTop);
    base.addColorStop(1, T.bgBottom);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const pinkWash = ctx.createRadialGradient(CARD_WIDTH - 150, 70, 20, CARD_WIDTH - 150, 70, 420);
    pinkWash.addColorStop(0, 'rgba(255,143,197,0.13)');
    pinkWash.addColorStop(1, 'rgba(255,143,197,0)');
    ctx.fillStyle = pinkWash;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const indigoWash = ctx.createRadialGradient(120, CARD_HEIGHT - 30, 20, 120, CARD_HEIGHT - 30, 440);
    indigoWash.addColorStop(0, 'rgba(99,102,241,0.14)');
    indigoWash.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = indigoWash;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    this.drawFlora(ctx);

    const px = 44;
    const py = 44;
    const pw = CARD_WIDTH - px * 2;
    const ph = CARD_HEIGHT - py * 2;

    ctx.save();
    this.roundRect(ctx, px, py, pw, ph, 30);
    ctx.fillStyle = T.glassFill;
    ctx.fill();
    ctx.strokeStyle = T.glassStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    this.drawBlossom(ctx, px + pw - 56, py + 40, 15, 0.28);
    this.drawPetal(ctx, px + pw - 92, py + 74, 6, 0.6, 0.22);

    ctx.save();
    ctx.font = '40px "Great Vibes", "Alex Brush", cursive';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const word = ctx.createLinearGradient(px + pw - 200, py + 34, px + pw - 36, py + 58);
    word.addColorStop(0, '#FFFFFF');
    word.addColorStop(0.55, '#FFC0CB');
    word.addColorStop(1, T.sakura);
    ctx.fillStyle = word;
    ctx.fillText('Yuna', px + pw - 36, py + 46);
    ctx.restore();

    let avatarImg;
    try {
      const url = user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
      avatarImg = await loadImage(url);
    } catch {
    }

    const av = 118;
    const ax = px + 40;
    const ay = py + 36;

    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, ax, ay, av, av);
      ctx.restore();

      const ring = ctx.createLinearGradient(ax, ay, ax + av, ay + av);
      if (premium) {
        ring.addColorStop(0, T.sakura);
        ring.addColorStop(1, T.roseLight);
      } else {
        ring.addColorStop(0, 'rgba(255,255,255,0.42)');
        ring.addColorStop(1, 'rgba(255,255,255,0.14)');
      }
      ctx.beginPath();
      ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
      ctx.strokeStyle = ring;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    const tx = ax + av + 30;
    const nameY = ay + 44;

    ctx.font = '34px "Righteous"';
    ctx.fillStyle = T.textPrimary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const dispName = this.truncate(ctx, (user.displayName || user.username || 'Unknown').toUpperCase(), 380, '34px "Righteous"');
    ctx.fillText(dispName, tx, nameY);

    if (premium) {
      const badgeX = tx + ctx.measureText(dispName).width + 16;
      const badgeY = nameY - 26;
      ctx.save();
      this.roundRect(ctx, badgeX, badgeY, 84, 24, 8);
      ctx.fillStyle = 'rgba(255,143,197,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,143,197,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '12px "Righteous"';
      ctx.fillStyle = T.sakura;
      ctx.textBaseline = 'middle';
      ctx.fillText('PREMIUM', badgeX + 14, badgeY + 13);
      ctx.restore();
    }

    ctx.font = '15px "Righteous"';
    ctx.fillStyle = T.textSecondary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`@${user.username || 'unknown'}`, tx, nameY + 30);

    ctx.beginPath();
    ctx.moveTo(px + 40, ay + av + 26);
    ctx.lineTo(px + pw - 40, ay + av + 26);
    ctx.strokeStyle = T.hairline;
    ctx.lineWidth = 1;
    ctx.stroke();

    const statsY = ay + av + 46;
    const tileH = 92;
    const gap = 18;
    const tileW = (pw - 80 - gap * 2) / 3;

    const items = [
      { label: 'WALLET BALANCE', value: `${(profileData.coins || 0).toLocaleString()}`, hint: 'COINS', color: T.sakura },
      { label: 'TRACKS PLAYED', value: `${(profileData.stats?.total_tracks_played || 0).toLocaleString()}`, hint: 'TRACKS', color: T.roseLight },
      { label: 'LISTEN TIME', value: this.formatTime(profileData.stats?.total_listen_time_ms || 0), hint: 'TOTAL', color: T.roseSoft },
    ];

    items.forEach((item, i) => {
      const sx = px + 40 + i * (tileW + gap);
      ctx.save();
      this.roundRect(ctx, sx, statsY, tileW, tileH, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fill();
      ctx.strokeStyle = T.hairline;
      ctx.lineWidth = 1;
      ctx.stroke();

      this.drawPetal(ctx, sx + tileW - 20, statsY + 20, 6, -0.6, 0.18);

      ctx.font = '11px "Righteous"';
      ctx.fillStyle = T.textMuted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(item.label, sx + 18, statsY + 26);

      ctx.font = '24px "Righteous"';
      ctx.fillStyle = item.color;
      ctx.fillText(item.value, sx + 18, statsY + 58);

      ctx.font = '10px "Righteous"';
      ctx.fillStyle = T.textMuted;
      ctx.fillText(item.hint, sx + 18, statsY + 76);
      ctx.restore();
    });

    ctx.save();
    ctx.font = '12px "Righteous"';
    ctx.fillStyle = T.textMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌸  SAKURA MUSIC ENGINE', px + 44, py + ph - 32);
    ctx.restore();

    return canvas.toBuffer('image/png');
  }
}

// Made by Nikhil Under CodeX Devs
