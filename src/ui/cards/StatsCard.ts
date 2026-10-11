import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';

const CARD_WIDTH = 860;
const CARD_HEIGHT = 560;

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
  platinum: '#F8FAFC',
  rank1: '#FF69B4',
  rank2: '#FFB6C1',
  rank3: '#F4C2C2'
};

export default class StatsCard {
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

  drawFlowerPetal(ctx: any, x: number, y: number, size: number, angle: number, color: string) {
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

  drawSakuraFlower(ctx: any, cx: number, cy: number, size: number) {
    ctx.save();
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const petalGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
      petalGrad.addColorStop(0, "rgba(255, 192, 203, 0.95)");
      petalGrad.addColorStop(1, "rgba(255, 105, 180, 0.75)");
      this.drawFlowerPetal(ctx, cx, cy, size, angle, petalGrad);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();
  }

  drawBackgroundPattern(ctx: any, width: number, height: number) {
    ctx.save();
    const spacing = 28;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    for (let x = 14; x < width; x += spacing) {
      for (let y = 14; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawBackgroundStardust(ctx: any, width: number, height: number) {
    ctx.save();
    const dots = [
      { x: 110, y: 75, r: 1.4, o: 0.25 },
      { x: 270, y: 135, r: 1.8, o: 0.20 },
      { x: 440, y: 55, r: 1.2, o: 0.28 },
      { x: 610, y: 105, r: 1.6, o: 0.22 },
      { x: 750, y: 210, r: 1.4, o: 0.26 },
      { x: 170, y: 315, r: 2.0, o: 0.18 },
      { x: 390, y: 465, r: 1.2, o: 0.24 },
      { x: 540, y: 385, r: 1.5, o: 0.20 },
      { x: 710, y: 475, r: 1.8, o: 0.22 },
      { x: 85, y: 485, r: 1.3, o: 0.28 },
    ];

    dots.forEach((d: any) => {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 192, 203, ${d.o})`;
      ctx.fill();
    });
    ctx.restore();
  }

  drawFloatingPetalDrift(ctx: any, width: number, height: number) {
    ctx.save();
    const petals = [
      { x: 140, y: 100, s: 7, a: 0.4, o: 0.38 },
      { x: 310, y: 50, s: 9, a: 1.2, o: 0.30 },
      { x: 680, y: 90, s: 8, a: -0.6, o: 0.42 },
      { x: 780, y: 240, s: 10, a: 2.1, o: 0.35 },
      { x: 100, y: 380, s: 8, a: -1.4, o: 0.28 },
      { x: 490, y: 490, s: 9, a: 0.8, o: 0.38 },
      { x: 730, y: 440, s: 7, a: 1.7, o: 0.32 },
      { x: 50, y: 220, s: 6, a: -0.8, o: 0.30 }
    ];

    petals.forEach((p: any) => {
      this.drawFlowerPetal(ctx, p.x, p.y, p.s, p.a, `rgba(255, 192, 203, ${p.o})`);
    });
    ctx.restore();
  }

  drawBotanicalCornerVines(ctx: any, width: number, height: number) {
    ctx.save();

    ctx.beginPath();
    ctx.moveTo(0, 150);
    ctx.bezierCurveTo(75, 115, 115, 55, 150, 0);
    ctx.strokeStyle = 'rgba(255, 182, 193, 0.14)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    this.drawLeaf(ctx, 55, 105, 7, -Math.PI / 4, 'rgba(255, 192, 203, 0.22)');
    this.drawLeaf(ctx, 105, 55, 8, Math.PI / 3, 'rgba(255, 192, 203, 0.22)');

    ctx.beginPath();
    ctx.moveTo(width, height - 140);
    ctx.bezierCurveTo(width - 85, height - 105, width - 125, height - 55, width - 160, height);
    ctx.strokeStyle = 'rgba(255, 182, 193, 0.14)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    this.drawLeaf(ctx, width - 80, height - 100, 7, Math.PI / 4, 'rgba(255, 192, 203, 0.22)');
    this.drawLeaf(ctx, width - 130, height - 50, 8, -Math.PI / 3, 'rgba(255, 192, 203, 0.22)');
    ctx.restore();
  }

  formatTime(ms: number) {
    if (!ms || ms <= 0) return '0m';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainHours = hours % 24;
      return `${days}d ${remainHours}h`;
    }
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  truncate(ctx: any, text: string, maxWidth: any, font: string) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (ctx.measureText(t + '...').width > maxWidth && t.length > 0) {
      t = t.slice(0, -1);
    }
    return t + '...';
  }

  async createStatsCard(user: any, report: any) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    let avatarImg;
    try {
      const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 128 });
      avatarImg = await loadImage(avatarUrl);
    } catch (e) {}

    ctx.fillStyle = YUNA_THEME.bg;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    this.drawBackgroundPattern(ctx, CARD_WIDTH, CARD_HEIGHT);
    this.drawBackgroundStardust(ctx, CARD_WIDTH, CARD_HEIGHT);
    this.drawFloatingPetalDrift(ctx, CARD_WIDTH, CARD_HEIGHT);
    this.drawBotanicalCornerVines(ctx, CARD_WIDTH, CARD_HEIGHT);

    this.drawSakuraFlower(ctx, CARD_WIDTH - 60, 45, 14);
    this.drawSakuraFlower(ctx, CARD_WIDTH - 120, CARD_HEIGHT - 45, 10);
    this.drawSakuraFlower(ctx, 40, CARD_HEIGHT - 35, 12);

    const px = 20, py = 20;
    const pw = CARD_WIDTH - 40, ph = CARD_HEIGHT - 40;

    ctx.save();
    this.roundRect(ctx, px, py, pw, ph, 24);
    ctx.fillStyle = YUNA_THEME.panelBg;
    ctx.fill();

    const shine = ctx.createLinearGradient(px, py, px + pw, py + ph);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    shine.addColorStop(0.35, 'rgba(255, 255, 255, 0.01)');
    shine.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = shine;
    ctx.fill();
    ctx.restore();

    ctx.save();
    this.roundRect(ctx, px, py, pw, ph, 24);
    const borderGrad = ctx.createLinearGradient(px, py, px + pw, py + ph);
    borderGrad.addColorStop(0, 'rgba(255, 182, 193, 0.50)');
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
    borderGrad.addColorStop(1, 'rgba(255, 105, 180, 0.40)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    const headerY = 46;

    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(78, headerY + 30, 30, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImg, 48, headerY, 60, 60);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(78, headerY + 30, 31, 0, Math.PI * 2);
      ctx.strokeStyle = YUNA_THEME.sakuraMain;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = '22px "Righteous"';
    ctx.fillStyle = YUNA_THEME.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText(user.displayName || user.username, 122, headerY + 24);

    const periodLabels = { all: 'ALL TIME', week: 'THIS WEEK', month: 'THIS MONTH', year: 'THIS YEAR', today: 'TODAY' };
    ctx.font = '12px "Righteous"';
    ctx.fillStyle = YUNA_THEME.textSecondary;
    ctx.fillText(`LISTENING PROFILE · ${(periodLabels as any)[report.periodLabel] || 'ALL TIME'}`, 122, headerY + 50);

    ctx.save();
    this.drawSakuraFlower(ctx, CARD_WIDTH - px - 28, headerY + 20, 14);

    ctx.font = '38px "Great Vibes", "Alex Brush", cursive';
    const yunaGrad = ctx.createLinearGradient(CARD_WIDTH - 150, headerY, CARD_WIDTH - 40, headerY + 24);
    yunaGrad.addColorStop(0, '#FFFFFF');
    yunaGrad.addColorStop(0.5, '#FFC0CB');
    yunaGrad.addColorStop(1, YUNA_THEME.sakuraMain);

    ctx.fillStyle = yunaGrad;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Yuna', CARD_WIDTH - px - 48, headerY + 20);
    ctx.restore();

    const statsY = headerY + 84;
    const stats = report.aggregate || {};
    const period = report.period || {};

    const statItems = [
      { label: 'TRACKS PLAYED', value: (period.tracks_played || stats.total_tracks_played || 0).toLocaleString(), color: YUNA_THEME.sakuraMain, bg: 'rgba(255, 105, 180, 0.05)' },
      { label: 'LISTEN TIME', value: this.formatTime(period.total_duration_ms || stats.total_listen_time_ms || 0), color: YUNA_THEME.roseLight, bg: 'rgba(255, 182, 193, 0.05)' },
      { label: 'ARTISTS', value: (period.unique_artists || 0).toLocaleString(), color: YUNA_THEME.roseSoft, bg: 'rgba(244, 194, 194, 0.05)' },
      { label: 'STREAK', value: `${stats.current_streak || 0} DAYS`, color: YUNA_THEME.platinum, bg: 'rgba(255, 255, 255, 0.05)' },
    ];

    const statBoxW = (pw - 50) / 4;

    statItems.forEach((item, i) => {
      const sx = px + 16 + i * (statBoxW + 6);

      ctx.save();
      this.roundRect(ctx, sx, statsY, statBoxW - 2, 72, 14);
      ctx.fillStyle = item.bg;
      ctx.fill();

      ctx.strokeStyle = `${item.color}35`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '11px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(item.label, sx + 14, statsY + 24);

      ctx.font = '22px "Righteous"';
      ctx.fillStyle = item.color;
      ctx.fillText(item.value, sx + 14, statsY + 54);
      ctx.restore();
    });

    const listY = statsY + 96;

    ctx.font = '14px "Righteous"';
    ctx.fillStyle = YUNA_THEME.sakuraMain;
    ctx.textAlign = 'left';
    ctx.fillText('🌸 TOP ARTISTS', px + 24, listY);

    const topArtists = report.topArtists || [];
    const maxArtistPlays = topArtists[0]?.play_count || 1;

    topArtists.slice(0, 5).forEach((artist: any, i: any) => {
      const ay = listY + 18 + i * 40;
      const barMaxW = 320;
      const barW = Math.max(16, (artist.play_count / maxArtistPlays) * barMaxW);

      let rankColor = YUNA_THEME.textSecondary;
      let rankBg = 'rgba(255, 255, 255, 0.05)';
      let rankBorder = 'rgba(255, 255, 255, 0.12)';

      if (i === 0) {
        rankColor = YUNA_THEME.rank1;
        rankBg = 'rgba(255, 105, 180, 0.16)';
        rankBorder = YUNA_THEME.rank1;
      } else if (i === 1) {
        rankColor = YUNA_THEME.rank2;
        rankBg = 'rgba(255, 182, 193, 0.12)';
        rankBorder = YUNA_THEME.rank2;
      } else if (i === 2) {
        rankColor = YUNA_THEME.rank3;
        rankBg = 'rgba(244, 194, 194, 0.12)';
        rankBorder = YUNA_THEME.rank3;
      }

      ctx.save();
      this.roundRect(ctx, px + 24, ay, 24, 22, 6);
      ctx.fillStyle = rankBg;
      ctx.fill();
      ctx.strokeStyle = rankBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '12px "Righteous"';
      ctx.fillStyle = rankColor;
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, px + 36, ay + 15);
      ctx.restore();

      ctx.font = '13px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textPrimary;
      ctx.textAlign = 'left';
      const artistName = this.truncate(ctx, artist.artist, 180, '13px "Righteous"');
      ctx.fillText(artistName, px + 56, ay + 15);

      ctx.font = '11px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textSecondary;
      ctx.textAlign = 'right';
      ctx.fillText(`${artist.play_count} PLAYS`, px + 56 + barMaxW, ay + 15);

      ctx.save();
      this.roundRect(ctx, px + 56, ay + 23, barMaxW, 5, 2.5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();

      this.roundRect(ctx, px + 56, ay + 23, barW, 5, 2.5);
      const barGrad = ctx.createLinearGradient(px + 56, ay, px + 56 + barW, ay);
      barGrad.addColorStop(0, YUNA_THEME.sakuraMain);
      barGrad.addColorStop(1, YUNA_THEME.roseLight);
      ctx.fillStyle = barGrad;
      ctx.fill();
      ctx.restore();
    });

    if (topArtists.length === 0) {
      ctx.font = '12px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textMuted;
      ctx.fillText('NO DATA YET — START LISTENING!', px + 56, listY + 40);
    }

    const rightColX = px + 410;
    ctx.font = '14px "Righteous"';
    ctx.fillStyle = YUNA_THEME.roseLight;
    ctx.textAlign = 'left';
    ctx.fillText('🌸 TOP TRACKS', rightColX, listY);

    const topTracks = report.topTracks || [];
    const maxTrackPlays = topTracks[0]?.play_count || 1;

    topTracks.slice(0, 5).forEach((track: any, i: any) => {
      const ty = listY + 18 + i * 40;
      const barMaxW = 310;
      const barW = Math.max(16, (track.play_count / maxTrackPlays) * barMaxW);

      let rankColor = YUNA_THEME.textSecondary;
      let rankBg = 'rgba(255, 255, 255, 0.05)';
      let rankBorder = 'rgba(255, 255, 255, 0.12)';

      if (i === 0) {
        rankColor = YUNA_THEME.rank1;
        rankBg = 'rgba(255, 105, 180, 0.16)';
        rankBorder = YUNA_THEME.rank1;
      } else if (i === 1) {
        rankColor = YUNA_THEME.rank2;
        rankBg = 'rgba(255, 182, 193, 0.12)';
        rankBorder = YUNA_THEME.rank2;
      } else if (i === 2) {
        rankColor = YUNA_THEME.rank3;
        rankBg = 'rgba(244, 194, 194, 0.12)';
        rankBorder = YUNA_THEME.rank3;
      }

      ctx.save();
      this.roundRect(ctx, rightColX, ty, 24, 22, 6);
      ctx.fillStyle = rankBg;
      ctx.fill();
      ctx.strokeStyle = rankBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '12px "Righteous"';
      ctx.fillStyle = rankColor;
      ctx.textAlign = 'center';
      ctx.fillText(`${i + 1}`, rightColX + 12, ty + 15);
      ctx.restore();

      ctx.font = '13px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textPrimary;
      ctx.textAlign = 'left';
      const trackTitle = this.truncate(ctx, track.title, 170, '13px "Righteous"');
      ctx.fillText(trackTitle, rightColX + 32, ty + 15);

      ctx.font = '11px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textSecondary;
      ctx.textAlign = 'right';
      ctx.fillText(`${track.play_count}×`, rightColX + 32 + barMaxW, ty + 15);

      ctx.save();
      this.roundRect(ctx, rightColX + 32, ty + 23, barMaxW, 5, 2.5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();

      this.roundRect(ctx, rightColX + 32, ty + 23, barW, 5, 2.5);
      const barGrad = ctx.createLinearGradient(rightColX + 32, ty, rightColX + 32 + barW, ty);
      barGrad.addColorStop(0, YUNA_THEME.roseLight);
      barGrad.addColorStop(1, YUNA_THEME.roseSoft);
      ctx.fillStyle = barGrad;
      ctx.fill();
      ctx.restore();
    });

    if (topTracks.length === 0) {
      ctx.font = '12px "Righteous"';
      ctx.fillStyle = YUNA_THEME.textMuted;
      ctx.fillText('NO DATA YET — START LISTENING!', rightColX + 32, listY + 40);
    }

    ctx.font = '12px "Righteous"';
    ctx.fillStyle = YUNA_THEME.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText('🌸 YUNA', CARD_WIDTH / 2, CARD_HEIGHT - 24);

    return canvas.toBuffer('image/png');
  }
}

// Made by Nikhil Under CodeX Devs
