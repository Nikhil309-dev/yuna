export const branding = {
  botName: process.env.BOT_NAME || 'Yuna',
  botVersion: '2.0.0',
  description: 'A high-performance Discord Music Bot powered by Lavalink, featuring multi-source search, autoplay and rich interactive player controls.',

  developer: {
    name: process.env.DEV_NAME || 'Nikhil',
    tag: 'kai._.dev',
    watermark: 'coded by Nikhil',
    creditText: 'Coded with ❤️ by Nikhil',
  },

  links: {
    supportServer: process.env.SUPPORT_SERVER_URL || 'https://discord.gg/XYwwyDKhec',
    inviteUrl: process.env.BOT_INVITE_URL || 'https://discord.com/api/oauth2/authorize?client_id=1031120600858624000&permissions=8&scope=bot%20applications.commands',
    github: 'https://github.com/nikhil',
    website: 'https://google.com'
  },

  assets: {
    defaultTrackArtwork: 'https://raw.githubusercontent.com/bre4d777/Miku/refs/heads/main/images%20(1).jpeg',
    defaultThumbnail: 'https://raw.githubusercontent.com/bre4d777/Miku/refs/heads/main/images%20(1).jpeg',
    helpThumbnail: 'https://raw.githubusercontent.com/bre4d777/Miku/refs/heads/main/images%20(1).jpeg',
    avatarUrl: 'https://raw.githubusercontent.com/bre4d777/Miku/refs/heads/main/images%20(1).jpeg'
  },

  colors: {
    info: '#3498db',
    success: '#2ecc71',
    warning: '#f39c12',
    error: '#e74c3c',
    theme: '#5865F2'
  },

  status: {
    text: process.env.STATUS_TEXT || '.help | Discord Music Bot',
    status: process.env.STATUS_TYPE || 'dnd',
    type: 'CUSTOM'
  }
};

export default branding;

// Made by Nikhil Under CodeX Devs
