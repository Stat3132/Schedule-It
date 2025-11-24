// components/ui/AnnouncementForm.tsx
import { useState } from "react";
import { Plus, X } from "lucide-react";

interface AnnouncementFormProps {
  onSubmit: (title: string, content: string, targetRoleIds: string[]) => Promise<void>;
  availableRoles: { id: string; name: string }[];
}

export function AnnouncementForm({ onSubmit, availableRoles }: AnnouncementFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(title, content, selectedRoleIds);
      setTitle("");
      setContent("");
      setSelectedRoleIds([]);
      setIsOpen(false);
    } catch (error) {
      console.error("Error creating announcement:", error);
    } finally {
      setIsSubmitting(false);
    }
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
            required
          />
        </div>

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
