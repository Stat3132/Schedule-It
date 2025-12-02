// components/ui/AnnouncementForm.tsx
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Paperclip } from "lucide-react";
import { formatFileSize, MAX_MESSAGE_ATTACHMENT_BYTES } from "../../lib/messageAttachments";

interface AnnouncementFormProps {
  onSubmit: (
    title: string,
    content: string,
    targetRoleIds: string[],
    targetContacts: { id: string; email: string; displayName: string | null }[],
    attachmentFile: File | null,
  ) => Promise<void>;
  availableRoles: { id: string; name: string }[];
  availableContacts: { id: string; email: string; displayName: string | null }[];
}

type TargetMode = "role" | "email" | "all";

export function AnnouncementForm({ onSubmit, availableRoles, availableContacts }: AnnouncementFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("role");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  useEffect(() => {
    if (attachmentFile || content.trim()) {
      setAttachmentError(null);
    }
  }, [attachmentFile, content]);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const toggleContact = (contactId: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId],
    );
  };

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return availableContacts;
    return availableContacts.filter((contact) => {
      const haystack = `${contact.displayName ?? ""} ${contact.email ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [availableContacts, contactQuery]);

  const selectedContacts = useMemo(
    () =>
      selectedContactIds
        .map((id) => availableContacts.find((contact) => contact.id === id))
        .filter((contact): contact is { id: string; email: string; displayName: string | null } =>
          Boolean(contact && contact.email),
        ),
    [availableContacts, selectedContactIds],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!attachmentFile && !content.trim()) {
      setAttachmentError("Add announcement details or attach a file.");
      return;
    }

    setIsSubmitting(true);
    try {
      const roleTargets = targetMode === "role" ? selectedRoleIds : [];
      const contactTargets = targetMode === "email" ? selectedContacts : [];
      await onSubmit(title, content, roleTargets, contactTargets, attachmentFile);
      setTitle("");
      setContent("");
      setSelectedRoleIds([]);
      setSelectedContactIds([]);
      setContactQuery("");
      setTargetMode("role");
      setAttachmentFile(null);
      setAttachmentError(null);
      setIsOpen(false);
    } catch (error) {
      console.error("Error creating announcement:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setAttachmentFile(null);
      setAttachmentError(null);
      return;
    }
    if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) {
      setAttachmentError(
        `File is too large. Max size is ${formatFileSize(MAX_MESSAGE_ATTACHMENT_BYTES)}.`,
      );
      event.target.value = "";
      setAttachmentFile(null);
      return;
    }
    setAttachmentFile(file);
    setAttachmentError(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-sm"
      >
        <Plus size={20} />
        Create Announcement
      </button>
    );
  }

  return (
    <div className="bg-background rounded-xl shadow-sm border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">New Announcement</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-foreground/60 hover:text-foreground transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-foreground mb-1">
            Title
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter announcement title"
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all bg-transparent text-foreground"
            required
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium text-foreground mb-1">
            Content
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter announcement content"
            rows={4}
            className="w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all resize-none bg-transparent text-foreground"
          />
        </div>

        <div>
          <p className="block text-sm font-medium text-foreground mb-2">Choose targeting method</p>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setTargetMode("role")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                targetMode === "role"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              Target by Role
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("email")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                targetMode === "email"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              Target by Email
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("all")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                targetMode === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              Send to Everyone
            </button>
          </div>
          <p className="text-xs text-foreground/60 mt-2">
            Only selections from the active option will be sent; choosing &ldquo;Send to Everyone&rdquo; ignores role/email filters.
          </p>
        </div>

        {targetMode === "role" ? (
          <div>
            <p className="block text-sm font-medium text-foreground mb-1">Send to roles</p>
            <p className="text-xs text-foreground/60 mb-2">
              Leave all unchecked to send to everyone, or pick specific roles.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableRoles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="rounded border-border accent-primary focus:ring-ring"
                    checked={selectedRoleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span>{role.name}</span>
                </label>
              ))}
              {availableRoles.length === 0 && (
                <p className="text-xs text-foreground/60">No roles found for this business.</p>
              )}
            </div>
          </div>
        ) : targetMode === "email" ? (
          <div>
            <p className="block text-sm font-medium text-foreground mb-1">Send to specific email addresses</p>
            <p className="text-xs text-foreground/60 mb-2">
              Search by name or email. Selected recipients will show their display name for clarity.
            </p>
            {availableContacts.length === 0 ? (
              <p className="text-xs text-foreground/60">No teammates available for direct selection.</p>
            ) : (
              <div className="space-y-3">
                <input
                  type="search"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-transparent text-sm text-foreground"
                />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                  {filteredContacts.length === 0 ? (
                    <p className="p-3 text-xs text-foreground/60">No matches.</p>
                  ) : (
                    filteredContacts.map((contact) => (
                      <label
                        key={contact.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-foreground"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-border accent-primary"
                          checked={selectedContactIds.includes(contact.id)}
                          onChange={() => toggleContact(contact.id)}
                          disabled={!contact.email}
                        />
                        <span className="flex-1">
                          <span className="font-medium">{contact.displayName ?? contact.email ?? "Unnamed"}</span>
                          {contact.email && (
                            <span className="block text-xs text-foreground/60">{contact.email}</span>
                          )}
                          {!contact.email && (
                            <span className="block text-xs text-foreground/60">No email on file</span>
                          )}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedContacts.length > 0 && (
                  <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-xs text-foreground">
                    <p className="font-semibold mb-1">Selected recipients</p>
                    <ul className="space-y-1">
                      {selectedContacts.map((contact) => (
                        <li key={contact.id} className="flex items-center justify-between gap-2">
                          <span>
                            {contact.displayName ?? contact.email}
                            {contact.displayName && contact.email ? ` (${contact.email})` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleContact(contact.id)}
                            className="text-foreground/60 hover:text-destructive"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-foreground">
            <p className="font-medium mb-1">Broadcast to everyone</p>
            <p className="text-foreground/70 text-xs">
              This announcement will go to all employees in the business, regardless of role or email selection.
            </p>
          </div>
        )}
        
        <div>
          <p className="block text-sm font-medium text-foreground mb-1">Attach flyer (optional)</p>
          <p className="text-xs text-foreground/60 mb-2">
            Upload a flyer or document (PDF or image, up to {formatFileSize(MAX_MESSAGE_ATTACHMENT_BYTES)}).
          </p>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border/80 px-3 py-2 text-sm text-foreground hover:border-primary/60">
            <Paperclip className="h-4 w-4" />
            <span>{attachmentFile ? "Replace file" : "Choose file"}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleAttachmentChange}
            />
          </label>
          {attachmentFile && (
            <div className="mt-2 flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-foreground">{attachmentFile.name}</p>
                <p className="text-foreground/60">{formatFileSize(attachmentFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachmentFile(null);
                  setAttachmentError(null);
                }}
                className="text-foreground/60 hover:text-destructive"
              >
                Remove
              </button>
            </div>
          )}
          {attachmentError && (
            <p className="mt-2 text-xs text-destructive">{attachmentError}</p>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 border border-border text-foreground rounded-lg transition-colors font-medium hover:bg-background/95"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
