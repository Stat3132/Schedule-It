import { Calendar, Clock, Bell, Settings } from 'lucide-react';

function App() {
  const scheduleData = [
    { day: 'Monday', date: '10/27', shifts: [{ start: '9:00 AM', end: '5:00 PM', role: 'Floor Staff' }] },
    { day: 'Tuesday', date: '10/28', shifts: [{ start: '10:00 AM', end: '6:00 PM', role: 'Floor Staff' }] },
    { day: 'Wednesday', date: '10/29', shifts: [] },
    { day: 'Thursday', date: '10/30', shifts: [{ start: '9:00 AM', end: '5:00 PM', role: 'Floor Staff' }] },
    { day: 'Friday', date: '10/31', shifts: [{ start: '12:00 PM', end: '8:00 PM', role: 'Floor Staff' }] },
    { day: 'Saturday', date: '11/1', shifts: [] },
    { day: 'Sunday', date: '11/2', shifts: [] },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img src="/image.png" alt="Logo" className="h-10 w-10" />
            </div>

            <div className="flex items-center space-x-1">
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Request Time Off
              </button>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Change Availability
              </button>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Announcements
              </button>
              <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Your Schedule</h1>
          <p className="text-gray-600 mt-1">Week of October 27 - November 2, 2025</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 gap-px bg-gray-200">
            {scheduleData.map((day) => (
              <div key={day.day} className="bg-white p-4 min-h-[180px]">
                <div className="text-center mb-3">
                  <div className="text-sm font-semibold text-gray-900">{day.day}</div>
                  <div className="text-xs text-gray-500 mt-1">{day.date}</div>
                </div>

                <div className="space-y-2">
                  {day.shifts.length > 0 ? (
                    day.shifts.map((shift, index) => (
                      <div key={index} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                        <div className="text-xs font-semibold text-teal-900 mb-1">{shift.role}</div>
                        <div className="text-xs text-teal-700 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {shift.start} - {shift.end}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-xs text-gray-400">Off</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
