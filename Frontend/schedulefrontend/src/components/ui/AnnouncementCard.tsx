"use client";

import { Trash2, Calendar, Users2, Mail } from "lucide-react";
import { Announcement } from "../../lib/supabase";
import { AttachmentPreview } from "../messages/AttachmentPreview";

interface AnnouncementCardProps {
  announcement: Announcement;
  onDelete: (id: string) => Promise<void>;
}

export function AnnouncementCard({ announcement, onDelete }: AnnouncementCardProps) {
  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this announcement?')) {
      await onDelete(announcement.id);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const roleSummary =
    announcement.target_role_ids.length > 0
      ? announcement.target_role_ids.join(", ")
      : null;
  const recipientSummary =
    announcement.target_recipients.length > 0
      ? announcement.target_recipients
          .map((recipient) =>
            recipient.display_name
              ? `${recipient.display_name} (${recipient.email})`
              : recipient.email,
          )
          .join(", ")
      : null;

  return (
    <div className="bg-background rounded-xl shadow-sm border border-border p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start gap-4 mb-3">
        <h3 className="text-lg font-semibold text-foreground flex-1">{announcement.title}</h3>
        <button
          onClick={handleDelete}
          className="text-foreground/60 hover:text-destructive transition-colors flex-shrink-0"
          title="Delete announcement"
        >
          <Trash2 size={18} />
        </button>
      </div>
      <p className="text-foreground/70 mb-4 whitespace-pre-wrap leading-relaxed">
        {announcement.content}
      </p>

      {announcement.attachment && (
        <AttachmentPreview
          url={announcement.attachment.url}
          name={announcement.attachment.name}
          mime={announcement.attachment.mime}
          size={announcement.attachment.size}
          downloadLabel="View attachment"
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/60">
        <span className="inline-flex items-center gap-2">
          <Calendar size={14} />
          <span>{formatDate(announcement.created_at)}</span>
        </span>
        {roleSummary && (
          <span className="inline-flex items-center gap-1 text-xs">
            <Users2 size={12} />
            <span>Roles: {roleSummary}</span>
          </span>
        )}
        {recipientSummary && (
          <span className="inline-flex items-center gap-1 text-xs">
            <Mail size={12} />
            <span>Individuals: {recipientSummary}</span>
          </span>
        )}
      </div>
    </div>
  );
}
