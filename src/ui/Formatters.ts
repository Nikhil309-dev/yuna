export function formatDuration(ms: number) {
  if (!ms || isNaN(ms) || ms < 0) return '00:00';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function truncate(str: string, maxLen: number = 100) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

export function progressBar(current: number, total: number, length: number = 15) {
  if (!current || !total || isNaN(current) || isNaN(total)) {
    return '▬'.repeat(length);
  }

  const percentage = Math.min(Math.max(current / total, 0), 1);
  const progress = Math.round(length * percentage);
  const emptyProgress = length - progress;

  const progressText = '▬'.repeat(progress);
  const emptyProgressText = '▬'.repeat(emptyProgress);

  return `${progressText}🔘${emptyProgressText}`;
}

export function formatNumber(num: number) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function timeAgo(date: any) {
  const seconds = Math.floor(((new Date() as any) - (new Date(date) as any)) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval > 1) return interval + " years ago";
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) return interval + " months ago";
  interval = Math.floor(seconds / 86400);
  if (interval > 1) return interval + " days ago";
  interval = Math.floor(seconds / 3600);
  if (interval > 1) return interval + " hours ago";
  interval = Math.floor(seconds / 60);
  if (interval > 1) return interval + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

export function discordTimestamp(date: any, style: string = 'R') {
  const timestamp = Math.floor(new Date(date).getTime() / 1000);
  return `<t:${timestamp}:${style}>`;
}

export function sanitizeMarkdown(str: string, maxLen: number = 100) {
  if (!str) return '';
  let sanitized = str.replace(/([_*~`|\\<>:[\]()])/g, '\\$1');
  return truncate(sanitized, maxLen);
}

export function splitFooter(text: string): { content: string; footer?: string } {
  const idx = (text || '').indexOf('\n\n');
  if (idx === -1) return { content: text };
  return { content: text.slice(0, idx), footer: text.slice(idx + 2) };
}

const Formatters = {
  formatDuration,
  truncate,
  progressBar,
  formatNumber,
  formatBytes,
  timeAgo,
  discordTimestamp,
  sanitizeMarkdown,
  splitFooter
};

export default Formatters;

// Made by Nikhil Under CodeX Devs
