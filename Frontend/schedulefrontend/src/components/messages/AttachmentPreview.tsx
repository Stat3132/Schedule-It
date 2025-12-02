"use client";

import { Paperclip } from "lucide-react";
import { formatFileSize } from "@/lib/messageAttachments";

interface AttachmentPreviewProps {
  url: string;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
  downloadLabel: string;
}

export function AttachmentPreview({
  url,
  name,
  mime,
  size,
  downloadLabel,
}: AttachmentPreviewProps) {
  const isImage = (mime ?? "").startsWith("image/");
  const label = name && name.trim().length ? name : downloadLabel;

  if (isImage) {
    return (
      <div className="mt-2 overflow-hidden rounded-lg border border-border/60 bg-background">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <img
            src={url}
            alt={label}
            loading="lazy"
            className="max-h-60 w-full object-cover"
          />
        </a>
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
          <span className="truncate pr-2">{label}</span>
          <span>{formatFileSize(size)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs hover:border-primary/60"
      >
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-1 flex-col truncate">
          <span className="truncate font-semibold text-foreground">{label}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatFileSize(size)}
          </span>
        </div>
      </a>
    </div>
  );
}
