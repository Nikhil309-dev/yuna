import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";

const fontsDir = path.join(process.cwd(), "fonts");
let righteousLoaded = false;
let greatVibesLoaded = false;
let alexBrushLoaded = false;

try {
  if (fs.existsSync(path.join(fontsDir, "GreatVibes-Regular.ttf"))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, "GreatVibes-Regular.ttf"), "Great Vibes");
    greatVibesLoaded = true;
  }
  if (fs.existsSync(path.join(fontsDir, "AlexBrush-Regular.ttf"))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, "AlexBrush-Regular.ttf"), "Alex Brush");
    alexBrushLoaded = true;
  }
  if (fs.existsSync(path.join(fontsDir, "Righteous-Regular.ttf"))) {
    GlobalFonts.registerFromPath(path.join(fontsDir, "Righteous-Regular.ttf"), "Righteous");
    righteousLoaded = true;
  }
} catch (e) {
  console.error("Failed to load signature fonts in CommandCard:", e);
}

export class CommandCard {
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
    ctx.fill();
    ctx.restore();
  }

  static async generate(command: any) {
    const cardInstance = new CommandCard();
    return await cardInstance.render(command);
  }

  async render(command: any = {}) {
    const width = 1000;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#06070E";
    ctx.fillRect(0, 0, width, height);

    const bgGlow1 = ctx.createRadialGradient(250, 100, 10, 250, 100, 450);
    bgGlow1.addColorStop(0, "rgba(255, 105, 180, 0.20)");
    bgGlow1.addColorStop(1, "rgba(6, 7, 14, 0)");
    ctx.fillStyle = bgGlow1;
    ctx.fillRect(0, 0, width, height);

    const bgGlow2 = ctx.createRadialGradient(850, 250, 10, 850, 250, 420);
    bgGlow2.addColorStop(0, "rgba(255, 182, 193, 0.16)");
    bgGlow2.addColorStop(1, "rgba(6, 7, 14, 0)");
    ctx.fillStyle = bgGlow2;
    ctx.fillRect(0, 0, width, height);

    this.drawSakuraFlower(ctx, 80, 70, 14);
    this.drawSakuraFlower(ctx, 920, 60, 16);
    this.drawSakuraFlower(ctx, 940, 460, 15);
    this.drawSakuraFlower(ctx, 60, 470, 12);

    const pMargin = 16;
    const pWidth = width - pMargin * 2;
    const pHeight = height - pMargin * 2;
    const pRadius = 18;

    ctx.save();
    this._roundRect(ctx, pMargin, pMargin, pWidth, pHeight, pRadius);
    ctx.fillStyle = "rgba(14, 16, 26, 0.88)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    this._roundRect(ctx, pMargin, pMargin, pWidth, pHeight, pRadius);
    ctx.strokeStyle = "rgba(255, 182, 193, 0.35)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    this.drawSakuraFlower(ctx, 240, 75, 22);

    ctx.font = '84px "Great Vibes", "Alex Brush", cursive';
    const textGrad = ctx.createLinearGradient(50, 40, 300, 100);
    textGrad.addColorStop(0, "#FFFFFF");
    textGrad.addColorStop(0.5, "#FFC0CB");
    textGrad.addColorStop(1, "#FF69B4");

    ctx.fillStyle = textGrad;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("Yuna", 50, 75);
    ctx.restore();

    const rawCmdName = (command.name || "COMMAND").toUpperCase();
    ctx.save();
    ctx.font = '15px "Righteous", sans-serif';
    ctx.fillStyle = "#FFB6C1";
    ctx.textAlign = "left";
    ctx.fillText(`⚡ COMMAND SPECIFICATION · .${rawCmdName.toLowerCase()}`, 50, 132);
    ctx.restore();

    const categoryText = (command.category || "General").toUpperCase();
    ctx.save();
    ctx.font = '13px "Righteous", sans-serif';
    const catWidth = ctx.measureText(categoryText).width + 28;
    const catX = width - 50 - catWidth;

    this._roundRect(ctx, catX, 55, catWidth, 34, 8);
    ctx.fillStyle = "rgba(255, 105, 180, 0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 182, 193, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(categoryText, catX + catWidth / 2, 76);
    ctx.restore();

    const descY = 158;
    const descW = pWidth - 68;
    const descH = 95;
    const descX = 50;

    this._renderMetricBox(ctx, descX, descY, descW, descH, {
      label: "📌 DESCRIPTION & PURPOSE",
      labelFont: '12px "Righteous"',
      numVal: command.description || "No description provided.",
      numFont: '15px "Righteous"',
      unitVal: "",
      unitFont: '',
      sub: "Execute command with prefix or slash trigger",
      subFont: '11px "Righteous"',
      color: "#FF69B4",
      isLongText: true,
      maxTextWidth: descW - 32
    });

    const specsY = 270;
    const numCols = 4;
    const gap = 14;
    const cardW = (descW - gap * (numCols - 1)) / numCols;
    const cardH = 98;

    const usageStr = command.usage ? `.${command.usage}` : `.${command.name}`;
    this._renderMetricBox(ctx, descX, specsY, cardW, cardH, {
      label: "⚡ USAGE SYNTAX",
      labelFont: '12px "Righteous"',
      numVal: usageStr,
      numFont: '16px "Righteous"',
      unitVal: "",
      unitFont: '',
      sub: "Primary Syntax",
      subFont: '11px "Righteous"',
      color: "#FF69B4"
    });

    const cdStr = `${command.cooldown || 3}`;
    this._renderMetricBox(ctx, descX + (cardW + gap), specsY, cardW, cardH, {
      label: "⏱️ COOLDOWN",
      labelFont: '12px "Righteous"',
      numVal: cdStr,
      numFont: '24px "Righteous"',
      unitVal: " SECONDS",
      unitFont: '12px "Righteous"',
      sub: "Rate-limit Throttle",
      subFont: '11px "Righteous"',
      color: "#FFB6C1"
    });

    const aliasesList = command.aliases?.length ? command.aliases : ["None"];
    const aliasStr = aliasesList.join(", ");

    this._renderMetricBox(ctx, descX + (cardW + gap) * 2, specsY, cardW, cardH, {
      label: "🔑 ALIASES",
      labelFont: '12px "Righteous"',
      numVal: aliasStr,
      numFont: '15px "Righteous"',
      unitVal: "",
      unitFont: '',
      sub: aliasesList.length > 1 ? `${aliasesList.length} Alternative Triggers` : "Alternative Trigger",
      subFont: '11px "Righteous"',
      color: "#FFD166"
    });

    const isSlash = command.enabledSlash !== false && command.slash?.enabled !== false;
    const slashVal = isSlash ? "YES" : "NO";
    const slashColor = isSlash ? "#00B894" : "#FF5964";
    this._renderMetricBox(ctx, descX + (cardW + gap) * 3, specsY, cardW, cardH, {
      label: "🚀 SLASH SUPPORTED",
      labelFont: '12px "Righteous"',
      numVal: slashVal,
      numFont: '24px "Righteous"',
      unitVal: "",
      unitFont: '',
      sub: isSlash ? "Available via /" : "Prefix Only",
      subFont: '11px "Righteous"',
      color: slashColor
    });

    const reqY = 385;
    const reqH = 88;

    ctx.save();
    this._roundRect(ctx, descX, reqY, descW, reqH, 12);
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 182, 193, 0.2)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = '12px "Righteous"';
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText("🛡️ EXECUTION REQUIREMENTS & PERMISSIONS", descX + 16, reqY + 24);

    const requirements = [];
    const isOwnerOnly = command.ownerOnly || command.access?.ownerOnly;
    const isUserPrem = command.userPrem || command.access?.userPremium;
    const isGuildPrem = command.guildPrem || command.access?.guildPremium;
    const isVoice = command.voiceRequired || command.access?.voice;
    const isSameVoice = command.sameVoiceRequired || command.access?.sameVoice;
    const isPlayer = command.playerRequired || command.access?.player;
    const isPlaying = command.playingRequired || command.access?.playing;

    if (isOwnerOnly) requirements.push({ text: "👑 Bot Owner Only", color: "#FF5964" });
    if (isUserPrem) requirements.push({ text: "💎 User Premium", color: "#FF69B4" });
    if (isGuildPrem) requirements.push({ text: "⭐ Server Premium", color: "#FFD166" });
    if (isVoice) requirements.push({ text: "🔊 Voice Channel", color: "#74B9FF" });
    if (isSameVoice) requirements.push({ text: "👥 Same Channel", color: "#A29BFE" });
    if (isPlayer) requirements.push({ text: "🎵 Music Player Active", color: "#00B894" });
    if (isPlaying) requirements.push({ text: "▶️ Track Playing", color: "#55EFC4" });
    if (requirements.length === 0) requirements.push({ text: "🔓 Public (No Restrictions)", color: "#00CEC9" });

    let reqX = descX + 16;
    let reqYPos = reqY + 36;

    for (const reqObj of requirements) {
      ctx.font = '13px "Righteous"';
      const badgeText = reqObj.text;
      const bWidth = ctx.measureText(badgeText).width + 22;

      if (reqX + bWidth > descX + descW - 16) {
        reqX = descX + 16;
        reqYPos += 30;
      }
      if (reqYPos > reqY + reqH - 24) break;

      this._roundRect(ctx, reqX, reqYPos, bWidth, 26, 6);
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fill();
      ctx.strokeStyle = `${reqObj.color}88`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = reqObj.color;
      ctx.fillText(badgeText, reqX + 11, reqYPos + 18);

      reqX += bWidth + 10;
    }
    ctx.restore();

    return canvas.toBuffer("image/png");
  }

  _renderMetricBox(ctx: any, x: number, y: number, w: number, h: number, config: any) {
    ctx.save();
    this._roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fill();

    ctx.strokeStyle = `${config.color}44`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = config.labelFont;
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText(config.label, x + 16, y + 24);

    ctx.font = config.numFont;
    ctx.fillStyle = config.color;

    const maxW = w - 32;

    if (config.isLongText) {
      const words = config.numVal.split(" ");
      let line = "";
      let lineY = y + 48;
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > config.maxTextWidth && n > 0) {
          ctx.fillText(line.trim(), x + 16, lineY);
          line = words[n] + " ";
          lineY += 20;
          if (lineY > y + 68) {

            let truncatedLine = line.trim();
            while (truncatedLine.length > 0 && ctx.measureText(truncatedLine + "...").width > config.maxTextWidth) {
              truncatedLine = truncatedLine.slice(0, -1);
            }
            ctx.fillText(truncatedLine + "...", x + 16, lineY - 20);
            line = "";
            break;
          }
        } else {
          line = testLine;
        }
      }
      if (line) {
        ctx.fillText(line.trim(), x + 16, lineY);
      }
    } else {
      let valStr = config.numVal;

      if (ctx.measureText(valStr).width > maxW) {
        while (valStr.length > 0 && ctx.measureText(valStr + "...").width > maxW) {
          valStr = valStr.slice(0, -1);
        }
        valStr += "...";
      }

      const numWidth = ctx.measureText(valStr).width;
      ctx.fillText(valStr, x + 16, y + 56);

      if (config.unitVal) {
        ctx.font = config.unitFont;
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillText(config.unitVal, x + 16 + numWidth, y + 56);
      }
    }

    ctx.font = config.subFont;
    ctx.fillStyle = "rgba(255, 255, 255, 0.48)";
    ctx.fillText(config.sub, x + 16, y + 78);

    ctx.restore();
  }
}

export default CommandCard;

// Made by Nikhil Under CodeX Devs
