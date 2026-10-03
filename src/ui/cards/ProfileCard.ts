import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';
import { logger } from '#utils/logger';

const CARD_WIDTH = 800;
const CARD_HEIGHT = 380;

let fontsRegisteredGlobally = false;

const YUNA_THEME = {
  bg: '#070811',
  panelBg: 'rgba(13, 16, 26, 0.90)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.72)',
  textMuted: 'rgba(255, 255, 255, 0.45)',
  sakuraMain: '#FF69B4',
  roseLight: '#FFB6C1',
  roseSoft: '#F4C2C2',
  platinum: '#F8FAFC'
};

export default class ProfileCard {
  constructor() {
    this.registerFonts();
  }

  registerFonts() {
    if (fontsRegisteredGlobally) return;
    try {
      const fontDir = join(process.cwd(), 'fonts');
      GlobalFonts.registerFromPath(join(fontDir, 'GreatVibes-Regular.ttf'), 'Great Vibes');
      GlobalFonts.registerFromPath(join(fontDir, 'AlexBrush-Regular.ttf'), 'Alex Brush');
      GlobalFonts.registerFromPath(join(fontDir, 'Righteous-Regular.ttf'), 'Righteous');
      fontsRegisteredGlobally = true;
    } catch (e) {
      fontsRegisteredGlobally = true;
    }
  }

  roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  drawLeaf(ctx: any, x: number, y: number, size: number, angle: number, color: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * 0.8, -size * 0.4, size, -size);
    ctx.quadraticCurveTo(size * 0.2, -size * 0.6, 0, 0);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  drawSakuraFlower(ctx: any, x: number, y: number, size: number) {
    const petals = 5;
    const colors = ['#FFC0CB', '#FFB6C1', '#FF69B4'];

    ctx.save();
    ctx.translate(x, y);

    this.drawLeaf(ctx, -size * 0.5, size * 0.5, size * 0.8, Math.PI * 0.8, '#FF69B4');
    this.drawLeaf(ctx, size * 0.5, -size * 0.5, size * 0.8, -Math.PI * 0.2, '#FFB6C1');

    for (let i = 0; i < petals; i++) {
      ctx.rotate((Math.PI * 2) / petals);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(size, -size * 0.5, size, size * 0.5, 0, 0);
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }

  truncate(ctx: any, text: string, maxWidth: number, font: string) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + '...';
  }

  formatTime(ms: number) {
    if (!ms || isNaN(ms)) return '0H 0M';
    const totalMins = Math.floor(ms / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}H ${mins}M`;
  }

  async createProfileCard(user: any, profileData: any) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = YUNA_THEME.bg;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CARD_WIDTH; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CARD_HEIGHT); ctx.stroke();
    }
    for (let i = 0; i < CARD_HEIGHT; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CARD_WIDTH, i); ctx.stroke();
    }

    const px = 40;
    const py = 40;
    const pw = CARD_WIDTH - (px * 2);

    ctx.save();
    this.roundRect(ctx, px, py, pw, CARD_HEIGHT - (py * 2), 20);
    ctx.fillStyle = YUNA_THEME.panelBg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const brandY = py + 30;
    this.drawSakuraFlower(ctx, CARD_WIDTH - px - 28, brandY, 14);

    ctx.font = '34px "Great Vibes", "Alex Brush", cursive';
    const yunaGrad = ctx.createLinearGradient(CARD_WIDTH - 150, brandY, CARD_WIDTH - 40, brandY + 24);
    yunaGrad.addColorStop(0, '#FFFFFF');
    yunaGrad.addColorStop(0.5, '#FFC0CB');
    yunaGrad.addColorStop(1, YUNA_THEME.sakuraMain);

    ctx.fillStyle = yunaGrad;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Yuna', CARD_WIDTH - px - 48, brandY);
    ctx.restore();

    let avatarImg;
    try {
      const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
      avatarImg = await loadImage(avatarUrl);
    } catch (e) {

    }

    const avatarSize = 120;
    const avatarX = px + 40;
    const avatarY = py + 40;

    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);

      let borderGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
      if (profileData.premium) {
        borderGrad.addColorStop(0, YUNA_THEME.sakuraMain);
        borderGrad.addColorStop(1, YUNA_THEME.roseLight);
      } else {
        borderGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
        borderGrad.addColorStop(1, 'rgba(255,255,255,0.05)');
      }

      ctx.strokeStyle = borderGrad;
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    const textX = avatarX + avatarSize + 32;
    const textY = avatarY + 36;

    ctx.font = '32px "Righteous"';
    ctx.fillStyle = YUNA_THEME.textPrimary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const dispName = this.truncate(ctx, user.displayName || user.username, 400, '32px "Righteous"');
    ctx.fillText(dispName.toUpperCase(), textX, textY);

    ctx.font = '16px "Righteous"';
    ctx.fillStyle = YUNA_THEME.textSecondary;
    ctx.fillText(`@${user.username}`, textX, textY + 28);

    if (profileData.premium) {
      const badgeY = textY - 24;
      const badgeX = textX + ctx.measureText(dispName.toUpperCase()).width + 16;
      ctx.save();
      this.roundRect(ctx, badgeX, badgeY - 14, 80, 22, 6);
      ctx.fillStyle = 'rgba(255, 105, 180, 0.15)';
      ctx.fill();
      ctx.strokeStyle = YUNA_THEME.sakuraMain;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '11px "Righteous"';
      ctx.fillStyle = YUNA_THEME.sakuraMain;
      ctx.fillText('PREMIUM', badgeX + 16, badgeY + 2);
      ctx.restore();
    }

    const statsY = avatarY + avatarSize + 40;

    const statItems = [
      { label: 'WALLET BALANCE', value: `${(profileData.coins || 0).toLocaleString()} COINS`, color: YUNA_THEME.sakuraMain, bg: 'rgba(255, 105, 180, 0.05)' },
      { label: 'TRACKS PLAYED', value: (profileData.stats?.total_tracks_played || 0).toLocaleString(), color: YUNA_THEME.roseLight, bg: 'rgba(255, 182, 193, 0.05)' },
      { label: 'LISTEN TIME', value: this.formatTime(profileData.stats?.total_listen_time_ms || 0), color: YUNA_THEME.roseSoft, bg: 'rgba(244, 194, 194, 0.05)' }
    ];

    const totalSpacing = 20;
    const statBoxW = (pw - 80 - totalSpacing) / 3;

    statItems.forEach((item, i) => {
      const sx = px + 40 + i * (statBoxW + 10);

      ctx.save();
      this.roundRect(ctx, sx, statsY, statBoxW, 72, 14);
      ctx.fillStyle = item.bg;
      ctx.fill();

      ctx.strokeStyle = `${item.color}35`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '11px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(item.label, sx + 16, statsY + 24);

      ctx.font = '20px "Righteous"';
      ctx.fillStyle = item.color;
      ctx.fillText(item.value, sx + 16, statsY + 52);
      ctx.restore();
    });

    return canvas.toBuffer('image/png');
  }
}

// Made by Nikhil Under CodeX Devs
