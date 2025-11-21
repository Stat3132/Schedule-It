"use client";

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { supabase, Announcement } from '../../../lib/supabase';
import { AnnouncementForm } from '../../../components/ui/AnnouncementForm';
import { AnnouncementCard } from '../../../components/ui/AnnouncementCard';

function App() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnnouncement = async (title: string, content: string) => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      alert('You must be logged in to create announcements');
      return;
    }

    const { error } = await supabase
      .from('announcements')
      .insert([
        {
          title,
          content,
          created_by: user.id,
        },
      ]);

    if (error) {
      console.error('Error creating announcement:', error);
      alert('Failed to create announcement');
      return;
    }

    await fetchAnnouncements();
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting announcement:', error);
      alert('Failed to delete announcement');
      return;
    }

    await fetchAnnouncements();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Megaphone className="text-white" size={28} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Announcements</h1>
          </div>
          <p className="text-gray-600 ml-14">
            Manage and share important updates with your team
          </p>
        </div>

        <div className="mb-8">
          <AnnouncementForm onSubmit={handleCreateAnnouncement} />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 mt-4">Loading announcements...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Megaphone className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No announcements yet
            </h3>
            <p className="text-gray-600">
              Create your first announcement to get started
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onDelete={handleDeleteAnnouncement}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
