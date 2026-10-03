import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

const fontsDir = path.join(process.cwd(), 'fonts');
try {
  if (fs.existsSync(path.join(fontsDir, 'GreatVibes-Regular.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'GreatVibes-Regular.ttf'), 'Great Vibes');
  }
  if (fs.existsSync(path.join(fontsDir, 'Righteous-Regular.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Righteous-Regular.ttf'), 'Righteous');
  }
  if (fs.existsSync(path.join(fontsDir, 'Syne-ExtraBold.ttf'))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Syne-ExtraBold.ttf'), 'Syne ExtraBold');
  }
} catch (_) {}

export class BlendCard {
  static async generate(userA: any, userB: any, matchPercentage: any, topTracks: any = []) {
    const width = 900;
    const height = 480;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0d0d14');
    bgGradient.addColorStop(0.3, '#1c1335');
    bgGradient.addColorStop(0.7, '#112233');
    bgGradient.addColorStop(1, '#0b0c10');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.filter = 'blur(60px)';
    ctx.fillStyle = 'rgba(235, 77, 140, 0.25)';
    ctx.beginPath();
    ctx.arc(200, 150, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(30, 215, 96, 0.25)';
    ctx.beginPath();
    ctx.arc(700, 150, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.font = '32px "Righteous", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('SPOTIFY TASTE BLEND', width / 2, 55);

    ctx.font = '15px "Righteous", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('MUSIC COMPATIBILITY ANALYSIS', width / 2, 82);

    const avatarAUrl = userA.displayAvatarURL?.({ extension: 'png', size: 256 }) || userA.avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const avatarBUrl = userB.displayAvatarURL?.({ extension: 'png', size: 256 }) || userB.avatarURL || 'https://cdn.discordapp.com/embed/avatars/1.png';

    try {
      const [imgA, imgB] = await Promise.all([
        loadImage(avatarAUrl).catch(() => null),
        loadImage(avatarBUrl).catch(() => null)
      ]);

      const drawAvatar = (img: any, x: any, y: any, radius: any, borderColor: any) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = borderColor;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        if (img) {
          ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        } else {
          ctx.fillStyle = '#333';
          ctx.fill();
        }
        ctx.restore();
      };

      drawAvatar(imgA, 250, 200, 65, '#eb4d8c');
      drawAvatar(imgB, 650, 200, 65, '#1ed760');
    } catch (_) {}

    ctx.font = '20px "Righteous", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const nameA = userA.displayName || userA.username;
    const nameB = userB.displayName || userB.username;
    ctx.fillText(nameA.length > 14 ? nameA.slice(0, 12) + '..' : nameA, 250, 295);
    ctx.fillText(nameB.length > 14 ? nameB.slice(0, 12) + '..' : nameB, 650, 295);

    ctx.save();
    ctx.beginPath();
    ctx.arc(width / 2, 200, 60, 0, Math.PI * 2);
    ctx.fillStyle = '#181824';
    ctx.fill();
    ctx.lineWidth = 4;
    const scoreGradient = ctx.createLinearGradient(390, 140, 510, 260);
    scoreGradient.addColorStop(0, '#eb4d8c');
    scoreGradient.addColorStop(1, '#1ed760');
    ctx.strokeStyle = scoreGradient;
    ctx.stroke();

    ctx.font = '36px "Righteous", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${matchPercentage}%`, width / 2, 192);

    ctx.font = '12px "Righteous", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('MATCH', width / 2, 225);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.roundRect(80, 335, 740, 110, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '14px "Righteous", sans-serif';
    ctx.fillStyle = '#1ed760';
    ctx.textAlign = 'left';
    ctx.fillText('✨ SHARED VIBES & TOP RECOMMENDATIONS', 105, 365);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    if (topTracks && topTracks.length > 0) {
      topTracks.slice(0, 2).forEach((track: any, idx: any) => {
        const title = track.title || track.name || 'Top Track';
        const artist = track.author || track.artist || 'Artist';
        ctx.fillText(`• ${title} - ${artist}`, 105, 395 + (idx * 24));
      });
    } else {
      ctx.fillText(`• Play more music together to unlock shared playlist sync!`, 105, 395);
      ctx.fillText(`• High acoustic harmony detected across both libraries.`, 105, 419);
    }
    ctx.restore();

    return canvas.toBuffer('image/png');
  }
}

export default BlendCard;

// Made by Nikhil Under CodeX Devs
