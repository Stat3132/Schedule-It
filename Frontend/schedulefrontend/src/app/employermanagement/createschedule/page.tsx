"use client";

import { useState, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

interface Employee {
  id: string;
  name: string;
  role: string;
  recommended_hours_start: string | null;
  recommended_hours_end: string | null;
}

interface AvailabilityRequest {
  employee_id: string;
  day_of_week: number;
  available_start: string;
  available_end: string;
}

interface ScheduleShift {
  employeeId: string;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
}

export default function CreateSchedule() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [location, setLocation] = useState<{ opens_at: string; closes_at: string } | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [availability, setAvailability] = useState<AvailabilityRequest[]>([]);
  const [scheduleShifts, setScheduleShifts] = useState<ScheduleShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<{ employeeId: string; dayOfWeek: number } | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(true);

  const days = [
    { day: 'Monday', dayOfWeek: 1, date: '10/27' },
    { day: 'Tuesday', dayOfWeek: 2, date: '10/28' },
    { day: 'Wednesday', dayOfWeek: 3, date: '10/29' },
    { day: 'Thursday', dayOfWeek: 4, date: '10/30' },
    { day: 'Friday', dayOfWeek: 5, date: '10/31' },
    { day: 'Saturday', dayOfWeek: 6, date: '11/1' },
    { day: 'Sunday', dayOfWeek: 0, date: '11/2' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [empRes, locRes, availRes] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('locations').select('opens_at, closes_at').single(),
        supabase.from('availability_requests').select('*'),
      ]);

      if (empRes.data) setEmployees(empRes.data);
      if (locRes.data) setLocation(locRes.data);
      if (availRes.data) setAvailability(availRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAvailabilityForShift = (employeeId: string, dayOfWeek: number) => {
    return availability.find(a => a.employee_id === employeeId && a.day_of_week === dayOfWeek);
  };

  const getShiftForEmployee = (employeeId: string, dayOfWeek: number) => {
    return scheduleShifts.find(s => s.employeeId === employeeId && s.dayOfWeek === dayOfWeek);
  };

  const handleShiftClick = (employeeId: string, dayOfWeek: number) => {
    const existing = getShiftForEmployee(employeeId, dayOfWeek);
    const avail = getAvailabilityForShift(employeeId, dayOfWeek);
    const employee = employees.find(e => e.id === employeeId);

    if (existing) {
      setStartTime(existing.startTime || '');
      setEndTime(existing.endTime || '');
    } else if (employee?.recommended_hours_start) {
      setStartTime(employee.recommended_hours_start);
      setEndTime(employee.recommended_hours_end || '');
    } else {
      setStartTime(location?.opens_at || '09:00');
      setEndTime(location?.closes_at || '17:00');
    }

    setSelectedShift({ employeeId, dayOfWeek });
  };

  const saveShift = () => {
    if (!selectedShift || !startTime || !endTime) return;

    const existing = scheduleShifts.findIndex(
      s => s.employeeId === selectedShift.employeeId && s.dayOfWeek === selectedShift.dayOfWeek
    );

    if (existing >= 0) {
      scheduleShifts[existing] = { ...selectedShift, startTime, endTime };
      setScheduleShifts([...scheduleShifts]);
    } else {
      setScheduleShifts([...scheduleShifts, { ...selectedShift, startTime, endTime }]);
    }

    setSelectedShift(null);
    setStartTime('');
    setEndTime('');
  };

  const removeShift = (employeeId: string, dayOfWeek: number) => {
    setScheduleShifts(scheduleShifts.filter(s => !(s.employeeId === employeeId && s.dayOfWeek === dayOfWeek)));
  };

  const handleConfirm = async () => {
    try {
      const weekStart = new Date('2025-10-27');
      const { data: schedData } = await supabase
        .from('schedules')
        .insert({ location_id: null, week_start_date: weekStart.toISOString().split('T')[0] })
        .select()
        .single();

      if (schedData) {
        const shiftsToInsert = scheduleShifts.map(shift => ({
          schedule_id: schedData.id,
          employee_id: shift.employeeId,
          day_of_week: shift.dayOfWeek,
          start_time: shift.startTime,
          end_time: shift.endTime,
        }));

        await supabase.from('schedule_shifts').insert(shiftsToInsert);
        alert('Schedule created successfully!');
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Error creating schedule');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const getShiftDisplay = (shift: ScheduleShift | undefined) => {
    if (!shift || !shift.startTime) return null;
    return `${shift.startTime} - ${shift.endTime}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create Weekly Schedule</h1>
          <p className="text-gray-600 mt-1">Week of October 27 - November 2, 2025</p>
        </div>

        <div className="space-y-4">
          {days.map((dayObj) => (
            <div key={dayObj.dayOfWeek} className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <button
                onClick={() => setExpandedDay(expandedDay === dayObj.dayOfWeek ? null : dayObj.dayOfWeek)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-gray-900">{dayObj.day}</h2>
                  <p className="text-sm text-gray-500">{dayObj.date}</p>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedDay === dayObj.dayOfWeek ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {expandedDay === dayObj.dayOfWeek && (
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                      <span className="font-semibold">Store Hours:</span> {location?.opens_at} - {location?.closes_at}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {employees.map((employee) => {
                      const shift = getShiftForEmployee(employee.id, dayObj.dayOfWeek);
                      const availability_req = getAvailabilityForShift(employee.id, dayObj.dayOfWeek);

                      return (
                        <div
                          key={employee.id}
                          className="bg-white p-4 rounded-lg border border-gray-200 flex items-center justify-between"
                        >
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{employee.name}</p>
                            <p className="text-sm text-gray-500">{employee.role}</p>
                            {availability_req && (
                              <p className="text-xs text-amber-600 mt-1">
                                Available: {availability_req.available_start} - {availability_req.available_end}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            {shift?.startTime ? (
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900">{getShiftDisplay(shift)}</p>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">No shift</p>
                            )}
                            <button
                              onClick={() => handleShiftClick(employee.id, dayObj.dayOfWeek)}
                              className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              {shift?.startTime ? 'Edit' : 'Add'}
                            </button>
                            {shift?.startTime && (
                              <button
                                onClick={() => removeShift(employee.id, dayObj.dayOfWeek)}
                                className="px-2 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Confirm Schedule
          </button>
        </div>
      </div>

      {selectedShift && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Set Shift Time</h3>
              <button
                onClick={() => setSelectedShift(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setSelectedShift(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveShift}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
