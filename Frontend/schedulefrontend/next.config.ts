import type { NextConfig } from "next";

type RemotePatternList = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>;

const remotePatterns: RemotePatternList = [
  {
    protocol: "https",
    hostname: "**.supabase.co",
  },
  {
    protocol: "https",
    hostname: "**.googleusercontent.com",
  },
  {
    protocol: "https",
    hostname: "avatars.githubusercontent.com",
  },
  {
    protocol: "https",
    hostname: "gravatar.com",
  },
  {
    protocol: "https",
    hostname: "**.gravatar.com",
  },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (SUPABASE_URL) {
  try {
    const { hostname } = new URL(SUPABASE_URL);
    remotePatterns.push({
      protocol: "https",
      hostname,
    });
  } catch {
    /* noop: invalid URL */
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
  },
};

export default nextConfig;
