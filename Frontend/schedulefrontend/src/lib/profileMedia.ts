import type { Area } from "react-easy-crop";

export const PROFILE_PHOTO_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_PROFILE_BUCKET ?? "profile-photos";
export const MAX_PROFILE_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
export const CROPPED_OUTPUT_SIZE = 640;
export const CROPPED_MIME_TYPE = "image/jpeg";
export const CROPPED_FILE_EXT = "jpg";

export const PRESET_AVATARS = [
  { id: "aurora", label: "Aurora", url: "/avatars/aurora.svg" },
  { id: "canyon", label: "Canyon", url: "/avatars/canyon.svg" },
  { id: "harbor", label: "Harbor", url: "/avatars/harbor.svg" },
  { id: "meadow", label: "Meadow", url: "/avatars/meadow.svg" },
  { id: "orbit", label: "Orbit", url: "/avatars/orbit.svg" },
  { id: "solstice", label: "Solstice", url: "/avatars/solstice.svg" },
] as const;

export async function getCroppedBlob(
  imageSrc: string,
  croppedPixels: Area,
  outputSize: number,
  mimeType: string,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Unable to create canvas context");
  }

  const { x, y, width, height } = croppedPixels;

  ctx.drawImage(image, x, y, width, height, 0, 0, outputSize, outputSize);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to export cropped image"));
      },
      mimeType,
      0.92,
    );
  });
}

export function createImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = src;
  });
}

export function isGifFile(file: File) {
  const type = file.type.toLowerCase();
  return type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

export function getFileExtension(fileName: string, fallback: string) {
  const rawExt = fileName.split(".").pop();
  const normalized = rawExt?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized && normalized.length > 0 ? normalized : fallback;
}

export function isGifUrl(url: string | null) {
  if (!url) return false;
  return url.toLowerCase().includes(".gif");
}
