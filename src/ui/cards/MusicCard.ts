import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';
import { logger } from '#utils/logger';

let fontsRegisteredGlobally = false;

const SOURCE_COLORS = {
  SPOTIFY: { bg: 'rgba(29, 185, 84, 0.22)', border: 'rgba(29, 185, 84, 0.8)', text: '#1DB954' },
  YOUTUBE: { bg: 'rgba(255, 77, 77, 0.22)', border: 'rgba(255, 77, 77, 0.8)', text: '#FF4D4D' },
  JIOSAAVN: { bg: 'rgba(0, 210, 106, 0.22)', border: 'rgba(0, 210, 106, 0.8)', text: '#00D26A' },
  SOUNDCLOUD: { bg: 'rgba(255, 119, 51, 0.22)', border: 'rgba(255, 119, 51, 0.8)', text: '#FF7733' },
  APPLEMUSIC: { bg: 'rgba(250, 36, 60, 0.22)', border: 'rgba(250, 36, 60, 0.8)', text: '#FA243C' },
  DEFAULT: { bg: 'rgba(255, 105, 180, 0.22)', border: 'rgba(255, 105, 180, 0.8)', text: '#FF69B4' },
};

export default class MusicCard {
  constructor() {
    this.registerFonts();
  }

  registerFonts() {
    if (fontsRegisteredGlobally) return;

    try {
      const fontDir = join(process.cwd(), 'fonts');
      GlobalFonts.registerFromPath(join(fontDir, 'GreatVibes-Regular.ttf'), 'Great Vibes');
      GlobalFonts.registerFromPath(join(fontDir, 'AlexBrush-Regular.ttf'), 'Alex Brush');
      GlobalFonts.registerFromPath(join(fontDir, 'Syne-ExtraBold.ttf'), 'Syne ExtraBold');
      GlobalFonts.registerFromPath(join(fontDir, 'Syne-Bold.ttf'), 'Syne Bold');
      GlobalFonts.registerFromPath(join(fontDir, 'Righteous-Regular.ttf'), 'Righteous');
      GlobalFonts.registerFromPath(join(fontDir, 'SpaceGrotesk-Bold.ttf'), 'Space Grotesk Bold');
      GlobalFonts.registerFromPath(join(fontDir, 'SpaceGrotesk-Medium.ttf'), 'Space Grotesk');
      GlobalFonts.registerFromPath(join(fontDir, 'BebasNeue-Regular.ttf'), 'Bebas Neue');
      GlobalFonts.registerFromPath(join(fontDir, 'NotoSansJP-Bold.ttf'), 'Noto Sans JP Bold');
      GlobalFonts.registerFromPath(join(fontDir, 'NotoSansJP-Regular.ttf'), 'Noto Sans JP');
      fontsRegisteredGlobally = true;
      logger.success('MusicCard', 'Loaded signature Yuna fonts: Great Vibes, Syne ExtraBold, Righteous!');
    } catch (e) {
      logger.warn('MusicCard', 'Could not register custom fonts:', (e as any).message);
      fontsRegisteredGlobally = true;
    }
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
      petalGrad.addColorStop(0, 'rgba(255, 192, 203, 0.95)');
      petalGrad.addColorStop(1, 'rgba(255, 105, 180, 0.85)');
      this.drawFlowerPetal(ctx, cx, cy, size, angle, petalGrad);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();
    ctx.restore();
  }

  drawParticleDropTrail(ctx: any, x: number, y: number, width: number, height: number, progress: number) {
    ctx.save();
    const centerY = y + height / 2;
    const filledWidth = width * progress;
    const orbX = x + filledWidth;

    const numParticles = 8;
    const maxTrailSpan = Math.min(filledWidth, 160);

    for (let i = 0; i < numParticles; i++) {
      const offsetBack = (i / numParticles) * maxTrailSpan;
      const px = orbX - offsetBack;
      if (px < x) continue;

      const t = offsetBack / Math.max(1, maxTrailSpan);
      const opacity = Math.max(0, 1 - t * 1.15);
      if (opacity <= 0) continue;

      const dropY = centerY + 4 + (t * 22) + Math.sin(i * 1.8 + progress * 25) * 3;
      const particleSize = Math.max(1.5, (1 - t * 0.65) * 4);

      if (i % 3 === 0) {
        const petalAngle = (i * 0.7) + (progress * 6);
        this.drawFlowerPetal(ctx, px, dropY, particleSize * 1.4, petalAngle, `rgba(255, 182, 193, ${opacity * 0.85})`);
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, dropY, particleSize, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? `rgba(255, 215, 0, ${opacity * 0.9})` : `rgba(255, 105, 180, ${opacity * 0.8})`;
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  drawGrowingVineProgressBar(ctx: any, x: number, y: number, width: number, height: number, progress: number, palette: any) {
    ctx.save();

    const centerY = y + height / 2;
    const vineWidth = width;
    const segments = 50;
    const step = vineWidth / segments;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x - 3, centerY, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';
    ctx.fill();
    this.drawLeaf(ctx, x - 5, centerY - 2, 8, -Math.PI / 3, 'rgba(255, 192, 203, 0.8)');
    ctx.restore();

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const px = x + i * step;
      const py = centerY + Math.sin(i * 0.35) * 3.5;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const leafNodes = [
      { pos: 0.10, side: -1, size: 7 },
      { pos: 0.20, side: 1, size: 8 },
      { pos: 0.30, side: -1, size: 7 },
      { pos: 0.40, side: 1, size: 9 },
      { pos: 0.50, side: -1, size: 8 },
      { pos: 0.60, side: 1, size: 8 },
      { pos: 0.70, side: -1, size: 7 },
      { pos: 0.80, side: 1, size: 8 },
      { pos: 0.90, side: -1, size: 7 },
      { pos: 0.98, side: 1, size: 8 }
    ];

    leafNodes.forEach((node: any) => {
      const lx = x + node.pos * vineWidth;
      const ly = centerY + Math.sin(node.pos * segments * 0.35) * 3.5;
      const angle = node.side * (Math.PI / 3);
      this.drawLeaf(ctx, lx, ly, node.size, angle, 'rgba(255, 255, 255, 0.22)');
    });

    if (progress > 0) {
      const filledWidth = Math.max(6, vineWidth * progress);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 8, y - 16, filledWidth + 8, height + 32);
      ctx.clip();

      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const px = x + i * step;
        const py = centerY + Math.sin(i * 0.35) * 3.5;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      const vGrad = ctx.createLinearGradient(x, y, x + vineWidth, y);
      vGrad.addColorStop(0, '#FFB6C1');
      vGrad.addColorStop(0.5, '#FF69B4');
      vGrad.addColorStop(1, '#FFD700');

      ctx.strokeStyle = vGrad;
      ctx.lineWidth = 4;
      ctx.stroke();

      leafNodes.forEach((node: any) => {
        if (node.pos <= progress) {
          const lx = x + node.pos * vineWidth;
          const ly = centerY + Math.sin(node.pos * segments * 0.35) * 3.5;
          const angle = node.side * (Math.PI / 3);
          const leafColor = node.pos > 0.8 ? '#FFD700' : '#FF69B4';
          this.drawLeaf(ctx, lx, ly, node.size + 0.5, angle, leafColor);
        }
      });

      ctx.restore();

      this.drawParticleDropTrail(ctx, x, y, vineWidth, height, progress);

      const orbX = x + filledWidth;
      const orbY = centerY + Math.sin(progress * segments * 0.35) * 3.5;

      this.drawSakuraFlower(ctx, orbX, orbY, 10);
    }

    ctx.restore();
  }

  extractPalette(image: any) {
    try {
      const tempCanvas = createCanvas(32, 32);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(image, 0, 0, 32, 32);
      const pixels = tempCtx.getImageData(0, 0, 32, 32).data;

      let r = 0, g = 0, b = 0, count = 0;
      let maxSat = -1;
      let vibrantColor = { r: 255, g: 65, b: 108 };

      for (let i = 0; i < pixels.length; i += 4) {
        const pr = pixels[i];
        const pg = pixels[i + 1];
        const pb = pixels[i + 2];
        const pa = pixels[i + 3];

        if (pa < 128) continue;
        const brightness = (pr + pg + pb) / 3;
        if (brightness < 15 || brightness > 240) continue;

        r += pr; g += pg; b += pb;
        count++;

        const maxC = Math.max(pr, pg, pb);
        const minC = Math.min(pr, pg, pb);
        const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

        if (sat > maxSat) {
          maxSat = sat;
          vibrantColor = { r: pr, g: pg, b: pb };
        }
      }

      if (count > 0) {
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
      } else {
        r = vibrantColor.r; g = vibrantColor.g; b = vibrantColor.b;
      }

      return {
        primary: `rgb(${r}, ${g}, ${b})`,
        accent: `rgb(${vibrantColor.r}, ${vibrantColor.g}, ${vibrantColor.b})`,
        glow: `rgba(${vibrantColor.r}, ${vibrantColor.g}, ${vibrantColor.b}, 0.35)`,
        bgGlow: `rgba(${r}, ${g}, ${b}, 0.25)`,
        border: `rgba(${vibrantColor.r}, ${vibrantColor.g}, ${vibrantColor.b}, 0.5)`
      };
    } catch (e) {
      return {
        primary: 'rgb(255, 65, 108)',
        accent: 'rgb(255, 128, 8)',
        glow: 'rgba(255, 65, 108, 0.35)',
        bgGlow: 'rgba(255, 65, 108, 0.25)',
        border: 'rgba(255, 65, 108, 0.5)'
      };
    }
  }

  drawVinylRecord(ctx: any, x: number, y: number, size: number, artwork: any, palette: any) {
    ctx.save();
    const centerX = x + size * 0.45;
    const centerY = y + size / 2;
    const radius = size * 0.46;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#090A0D';
    ctx.fill();

    for (let r = radius * 0.92; r > radius * 0.45; r -= 6) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const labelRadius = radius * 0.38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, labelRadius, 0, Math.PI * 2);
    ctx.clip();
    if (artwork) {
      ctx.drawImage(artwork, centerX - labelRadius, centerY - labelRadius, labelRadius * 2, labelRadius * 2);
    } else {
      ctx.fillStyle = palette.accent;
      ctx.fill();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#090A0D';
    ctx.fill();
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.restore();
  }

  truncateText(ctx: any, text: string, maxWidth: any, font: string, ellipsis: any = '...') {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;

    let truncated = text;
    while (ctx.measureText(truncated + ellipsis).width > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + ellipsis;
  }

  formatDuration(ms: number) {
    if (!ms || ms < 0) return '0:00';
    const seconds = Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
    const minutes = Math.floor((ms / (1000 * 60)) % 60).toString();
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return hours > 0 ? `${hours}:${minutes.padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
  }

  async createMusicCard(track: any, position: any = 0, options: any = {}) {
    const width = 960;
    const height = 320;
    const margin = 28;
    const artworkSize = 220;
    const isPremiumTheme = options.isPremium || options.theme === 'sakura_vine';

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let artwork;
    const artworkUrl = track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;

    if (artworkUrl) {
      try {
        const res = await fetch(artworkUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res.ok) throw new Error('HTTP error');
        const ab = await res.arrayBuffer();
        artwork = await loadImage(Buffer.from(ab));
      } catch (_) {
        try {
          artwork = await loadImage(artworkUrl);
        } catch (e) {
          logger.warn('MusicCard', 'Could not load artwork image');
        }
      }
    }

    const palette = artwork ? this.extractPalette(artwork) : {
      primary: 'rgb(255, 65, 108)',
      accent: 'rgb(255, 128, 8)',
      glow: 'rgba(255, 65, 108, 0.35)',
      bgGlow: 'rgba(255, 65, 108, 0.25)',
      border: 'rgba(255, 65, 108, 0.5)'
    };

    ctx.fillStyle = '#06070E';
    ctx.fillRect(0, 0, width, height);

    const ambientLeft = ctx.createRadialGradient(200, height / 2, 20, 200, height / 2, 400);
    ambientLeft.addColorStop(0, palette.bgGlow);
    ambientLeft.addColorStop(1, 'rgba(6, 7, 14, 0.95)');
    ctx.fillStyle = ambientLeft;
    ctx.fillRect(0, 0, width, height);

    this.drawSakuraFlower(ctx, width - 60, 45, 12);
    this.drawSakuraFlower(ctx, width - 120, height - 40, 10);
    this.drawSakuraFlower(ctx, 40, 30, 8);

    const panelMargin = 16;
    const pw = width - panelMargin * 2;
    const ph = height - panelMargin * 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelMargin, panelMargin, pw, ph, 24);
    ctx.fillStyle = 'rgba(12, 14, 22, 0.88)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelMargin, panelMargin, pw, ph, 24);
    const borderGrad = ctx.createLinearGradient(panelMargin, panelMargin, panelMargin + pw, panelMargin + ph);
    borderGrad.addColorStop(0, 'rgba(255, 182, 193, 0.45)');
    borderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    borderGrad.addColorStop(1, 'rgba(255, 105, 180, 0.4)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    const artworkX = margin + 12;
    const artworkY = (height - artworkSize) / 2;
    this.drawVinylRecord(ctx, artworkX + 50, artworkY, artworkSize, artwork, palette);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(artworkX, artworkY, artworkSize, artworkSize, 18);
    ctx.clip();

    if (artwork) {
      ctx.drawImage(artwork, artworkX, artworkY, artworkSize, artworkSize);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    const infoX = artworkX + artworkSize + 55;
    const contentWidth = width - infoX - margin - 16;

    const rawSource = track?.info?.sourceName ? track.info.sourceName.toUpperCase() : 'YUNA';
    const sourceStyle = (SOURCE_COLORS as any)[rawSource] || SOURCE_COLORS.DEFAULT;

    ctx.font = '12px "Righteous"';
    const badgeText = rawSource;
    const badgeWidth = ctx.measureText(badgeText).width + 22;
    const badgeHeight = 26;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(infoX, artworkY + 4, badgeWidth, badgeHeight, 8);
    ctx.fillStyle = sourceStyle.bg;
    ctx.fill();

    ctx.strokeStyle = sourceStyle.border;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = sourceStyle.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, infoX + badgeWidth / 2, artworkY + 17);
    ctx.restore();

    if (track?.requester?.username || track?.requester?.tag) {
      const reqName = `@${track.requester.username || track.requester.tag}`;
      ctx.font = '12px "Righteous"';
      const reqText = `REQUESTED BY ${reqName.toUpperCase()}`;
      const reqWidth = ctx.measureText(reqText).width + 22;
      const reqX = infoX + badgeWidth + 12;

      if (reqX + reqWidth < width - margin - 140) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(reqX, artworkY + 4, reqWidth, badgeHeight, 8);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(reqText, reqX + reqWidth / 2, artworkY + 17);
        ctx.restore();
      }
    }

    ctx.save();
    this.drawSakuraFlower(ctx, width - panelMargin - 28, artworkY + 16, 14);

    ctx.font = '38px "Great Vibes", "Alex Brush", cursive';
    const yunaGrad = ctx.createLinearGradient(width - 150, artworkY, width - 40, artworkY + 24);
    yunaGrad.addColorStop(0, '#FFFFFF');
    yunaGrad.addColorStop(0.5, '#FFC0CB');
    yunaGrad.addColorStop(1, '#FF69B4');

    ctx.fillStyle = yunaGrad;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('Yuna', width - panelMargin - 48, artworkY + 16);
    ctx.restore();

    const titleY = artworkY + 52;
    const title = track?.info?.title || 'Unknown Title';
    const titleFont = 'bold 28px "Syne ExtraBold", "Space Grotesk Bold", "Noto Sans JP Bold"';
    const displayTitle = this.truncateText(ctx, title, contentWidth, titleFont);

    ctx.save();
    ctx.font = titleFont;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(displayTitle, infoX, titleY);
    ctx.restore();

    const artistY = titleY + 44;
    const artist = track?.info?.author || 'Unknown Artist';
    const artistFont = '19px "Righteous", "Space Grotesk", "Noto Sans JP"';
    const displayArtist = this.truncateText(ctx, artist, contentWidth, artistFont);

    ctx.save();
    ctx.font = artistFont;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(displayArtist, infoX, artistY);
    ctx.restore();

    const progressY = artworkY + artworkSize - 40;
    const progressBarHeight = 12;

    const trackDuration = track?.info?.duration || track?.info?.length || 0;
    const isLive = !trackDuration || trackDuration <= 0 || track?.info?.isStream;
    const progress = isLive ? 1 : Math.max(0, Math.min(position / trackDuration, 1));

    if (isPremiumTheme) {
      this.drawGrowingVineProgressBar(ctx, infoX, progressY - 4, contentWidth, progressBarHeight, progress, palette);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(infoX, progressY, contentWidth, progressBarHeight, progressBarHeight / 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (progress > 0) {
        const progressWidth = Math.max(progressBarHeight, Math.min(contentWidth, contentWidth * progress));

        ctx.beginPath();
        ctx.roundRect(infoX, progressY, progressWidth, progressBarHeight, progressBarHeight / 2);

        const pGrad = ctx.createLinearGradient(infoX, progressY, infoX + progressWidth, progressY);
        pGrad.addColorStop(0, palette.primary);
        pGrad.addColorStop(1, palette.accent);

        ctx.fillStyle = pGrad;
        ctx.fill();

        const orbX = infoX + progressWidth - progressBarHeight / 2;
        const orbY = progressY + progressBarHeight / 2;

        ctx.beginPath();
        ctx.arc(orbX, orbY, progressBarHeight * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
      ctx.restore();
    }

    const timeY = progressY + 24;
    const currentTime = this.formatDuration(position);
    const totalTime = isLive ? 'LIVE STREAM' : this.formatDuration(trackDuration);

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '12px "Righteous"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentTime, infoX, timeY);

    ctx.textAlign = 'right';
    ctx.fillText(totalTime, infoX + contentWidth, timeY);
    ctx.restore();

    return canvas.toBuffer('image/png');
  }
}

// Made by Nikhil Under CodeX Devs
