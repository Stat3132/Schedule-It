import { Trash2, Calendar } from 'lucide-react';
import { Announcement } from '../../lib/supabase';

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

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start gap-4 mb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex-1">{announcement.title}</h3>
        <button
          onClick={handleDelete}
          className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
          title="Delete announcement"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <p className="text-gray-600 mb-4 whitespace-pre-wrap leading-relaxed">
        {announcement.content}
      </p>

      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Calendar size={14} />
        <span>{formatDate(announcement.created_at)}</span>
      </div>
    </div>
  );
}
