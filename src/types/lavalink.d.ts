import "lavalink-client";

declare module "lavalink-client" {
  interface TrackRequester {
    id: string;
    username?: string;
    globalName?: string | null;
    discriminator?: string;
    avatar?: string | null;
    bot?: boolean;
  }
}

// Made by Nikhil Under CodeX Devs
