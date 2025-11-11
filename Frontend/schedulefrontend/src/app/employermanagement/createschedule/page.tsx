"use client";

import React, { JSX, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, X, ArrowLeft } from "lucide-react";
import { supabase } from "../../../lib/supabase";

// Simplified, robust schedule creation UI.
// Key fixes:
// - Read activeBusinessId/activeLocationId from localStorage into React state so updates trigger loads
// - Validate business/location before attempting inserts
// - Use location id (not business id) for shift.location_id
// - Provide clear RLS/permission error messages

type UUID = string;

type Employee = { id: UUID; name: string; roleId?: UUID | null; roleName?: string; };
type ShiftDraft = { employeeId: UUID; day: number; start: string; end: string };

const DAYS = [
  { label: "Sun", day: 0, date: "11/2" },
  { label: "Mon", day: 1, date: "10/27" },
  { label: "Tue", day: 2, date: "10/28" },
  { label: "Wed", day: 3, date: "10/29" },
  { label: "Thu", day: 4, date: "10/30" },
  { label: "Fri", day: 5, date: "10/31" },
  { label: "Sat", day: 6, date: "11/1" },
];

function clampTimeToStore(start: string, end: string, open = "09:00", close = "17:00") {
  const toM = (t: string) => { const [hh, mm] = t.split(":"); return Number(hh) * 60 + Number(mm); };
  const toHH = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const s = Math.max(toM(open), toM(start));
  const e = Math.min(toM(close), toM(end));
  if (s >= e) return { start: open, end: close };
  return { start: toHH(s), end: toHH(e) };
}

export default function CreateSchedulePage(): JSX.Element {
  const router = useRouter();

  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [openHH, setOpenHH] = useState<string>("09:00");
  const [closeHH, setCloseHH] = useState<string>("17:00");

  const [drafts, setDrafts] = useState<ShiftDraft[]>([]);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ employeeId: string; day: number } | null>(null);
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Read active context from localStorage once on mount and subscribe to storage events
  useEffect(() => {
    const read = () => {
      const biz = typeof window !== 'undefined' ? (localStorage.getItem('activeBusinessId') || null) : null;
      const locs = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('activeLocationIds') || '[]') as string[]) : [];
      setActiveBusinessId(biz);
      setActiveLocationId(locs[0] ?? null);
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === 'activeBusinessId' || e.key === 'activeLocationIds') read(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Load session and data when context changes
  useEffect(() => {
    if (!activeBusinessId) { setEmployees([]); setBusinessName(null); setLocationName(null); setLoading(false); return; }
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) { setUserId(null); return; }
        setUserId(authData.user.id);

        // business name
        const { data: biz } = await supabase.from('business').select('id,name').eq('id', activeBusinessId).maybeSingle();
        if (mounted) setBusinessName(biz?.name ?? null);

        // location (if provided)
        if (activeLocationId) {
          const { data: loc } = await supabase.from('location').select('id,name,opens_at,closes_at').eq('id', activeLocationId).maybeSingle();
          if (mounted) {
            setLocationName(loc?.name ?? null);
            setOpenHH(loc?.opens_at ?? '09:00');
            setCloseHH(loc?.closes_at ?? '17:00');
          }
        } else {
          setLocationName(null);
          setOpenHH('09:00');
          setCloseHH('17:00');
        }

        // load employees
        const empQ = supabase.from('employment').select('user_id,role_id,status').eq('business_id', activeBusinessId).eq('status','active');
        const { data: empRows, error: empErr } = await empQ;
        if (empErr) { console.error('employment load', empErr); setEmployees([]); }
        const ids = Array.from(new Set((empRows ?? []).map((r: any) => r.user_id)));
        const { data: profs } = ids.length ? await supabase.from('profiles').select('id,full_name,display_name,email').in('id', ids) : { data: [] };
        const nameBy = new Map<string,string>((profs ?? []).map((p: any) => [p.id, p.full_name || p.display_name || p.email || 'Unnamed']));
        const emps: Employee[] = (empRows ?? []).map((r: any) => ({ id: r.user_id, name: nameBy.get(r.user_id) ?? 'Unnamed', roleId: r.role_id ?? null, roleName: '—' }));
        if (mounted) setEmployees(emps.sort((a,b)=>a.name.localeCompare(b.name)));
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [activeBusinessId, activeLocationId]);

  const getDraft = (empId: string, day: number) => drafts.find(d => d.employeeId === empId && d.day === day);

  function openEditor(empId: string, day: number) {
    const d = getDraft(empId, day);
    if (d) { setStartTime(d.start); setEndTime(d.end); } else { setStartTime(openHH); setEndTime(closeHH); }
    setEditing({ employeeId: empId, day });
  }

  function saveDraft() {
    if (!editing) return;
    const clamped = clampTimeToStore(startTime, endTime, openHH, closeHH);
    setDrafts(prev => {
      const idx = prev.findIndex(p => p.employeeId === editing.employeeId && p.day === editing.day);
      const next = { employeeId: editing.employeeId, day: editing.day, start: clamped.start, end: clamped.end };
      if (idx >= 0) { const copy = prev.slice(); copy[idx] = next; return copy; }
      return [...prev, next];
    });
    setEditing(null);
  }

  function removeDraft(empId: string, day: number) { setDrafts(prev => prev.filter(d => !(d.employeeId === empId && d.day === day))); }

  // Persist: create shifts then assignments. We rely on supabase client auth; if RLS denies, return helpful message.
  async function handleConfirm() {
    if (!activeBusinessId) { alert('No business selected'); return; }
    if (!userId) { alert('Not signed in'); return; }
    if (drafts.length === 0) { alert('No shifts to create'); return; }
    // client-side validation: location required and every draft must have a role
    if (!activeLocationId) { alert('Please select a location before creating a schedule.'); return; }

    // ensure each draft's employee has a role_id (shift.role_id is NOT NULL in the DB)
    const missingRole = drafts.map(d => ({ d, roleId: employees.find(e => e.id === d.employeeId)?.roleId })).find(x => !x.roleId);
    if (missingRole) {
      const emp = employees.find(e => e.id === missingRole!.d.employeeId);
      alert(`Employee "${emp?.name ?? missingRole!.d.employeeId}" has no role assigned. Assign a role before creating shifts.`);
      return;
    }

    setLoading(true);
    try {
      // build shift rows with required fields
      const shifts = drafts.map(d => {
        const dayObj = DAYS.find(x => x.day === d.day)!;
        const [m, dayNum] = dayObj.date.split('/').map(Number);
        const dateStr = `${new Date().getFullYear()}-${String(m).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
        const startISO = new Date(`${dateStr}T${d.start}:00`).toISOString();
        const endISO = new Date(`${dateStr}T${d.end}:00`).toISOString();
        return {
          business_id: activeBusinessId,
          location_id: activeLocationId,
          role_id: employees.find(e => e.id === d.employeeId)!.roleId!,
          start_ts: startISO,
          end_ts: endISO,
          status: 'draft',
          created_by: userId,
          _employeeId: d.employeeId,
        };
      });

      // debug: print payload so developer can confirm values before insert
      console.debug('Attempting to insert shifts', { userId, activeBusinessId, activeLocationId, payloadCount: shifts.length, sample: shifts[0] });

      const { data: inserted, error: insertErr } = await supabase.from('shift').insert(shifts.map(s => ({
        business_id: s.business_id,
        location_id: s.location_id,
        role_id: s.role_id,
        start_ts: s.start_ts,
        end_ts: s.end_ts,
        status: s.status,
        created_by: s.created_by,
      }))).select('id,start_ts,end_ts');

      if (insertErr) {
        console.error('shift insert error', insertErr);
        // RLS-specific guidance
        if ((insertErr as any)?.code === '42501') {
          alert('Could not create shifts: new row violates row-level security policy for table "shift".\n\nCommon causes: the signed-in user is not a manager for this business, or the business is not verified.\nCheck that you are signed in as a manager and that the business verification_status is "verified".');
        } else {
          alert(`Could not create shifts: ${insertErr.message || insertErr.code || 'permission denied'}`);
        }
        return;
      }

      // map inserted back to drafts by index order and create assignments
      const assignments = (inserted ?? []).map((row: any, idx: number) => ({
        shift_id: row.id,
        user_id: shifts[idx]._employeeId,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
        source: 'manager',
      }));

      if (assignments.length) {
        const { error: asErr } = await supabase.from('shift_assignment').insert(assignments);
        if (asErr) { console.error('assignment error', asErr); alert('Shifts created but assignments failed. See console.'); }
      }

      alert('Schedule created');
      setDrafts([]);
      router.replace('/employermanagement/employerhomepage');
    } catch (err) {
      console.error('save schedule', err);
      alert('Unexpected error creating schedule. See console.');
    } finally { setLoading(false); }
  }

  const activeMeta = useMemo(() => activeDay == null ? null : DAYS.find(d => d.day === activeDay) ?? null, [activeDay]);

  const shiftsPreview = useMemo(() => {
    if (!activeBusinessId || !activeLocationId || !userId) return [];
    return drafts.map(d => {
      const dayObj = DAYS.find(x => x.day === d.day)!;
      const [m, dayNum] = dayObj.date.split('/').map(Number);
      const dateStr = `${new Date().getFullYear()}-${String(m).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      const startISO = new Date(`${dateStr}T${d.start}:00`).toISOString();
      const endISO = new Date(`${dateStr}T${d.end}:00`).toISOString();
      return {
        business_id: activeBusinessId,
        location_id: activeLocationId,
        role_id: employees.find(e => e.id === d.employeeId)?.roleId ?? null,
        start_ts: startISO,
        end_ts: endISO,
        status: 'draft',
        created_by: userId,
        _employeeId: d.employeeId,
      };
    });
  }, [drafts, activeBusinessId, activeLocationId, employees, userId]);

  if (loading) return <div className="py-8 text-center">Loading…</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => router.replace('/homepage')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </button>
          <div className="text-sm text-gray-600">{businessName ? `Business: ${businessName}` : '—'}</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6">
        <h1 className="text-3xl font-bold text-gray-900">Create Weekly Schedule</h1>
        <p className="text-gray-600 mt-1">Week selector — pick a day and add shifts</p>
      </div>

      <div className="sticky top-14 z-30 bg-gray-50/90 backdrop-blur border-b border-gray-200 mt-4">
        <div className="max-w-6xl mx-auto px-2">
          <div className="flex overflow-x-auto no-scrollbar gap-2 py-2">
            {DAYS.map(d => {
              const isActive = activeDay === d.day;
              return (
                <button key={d.day} onClick={() => setActiveDay(isActive ? null : d.day)} className={`${isActive ? 'bg-white border-blue-500 text-blue-700 shadow-sm' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'} relative shrink-0 px-4 py-2 rounded-xl border text-sm transition-all`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{d.label}</span>
                    <span className="text-gray-500">{d.date}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isActive ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4">
        <div role="region" aria-hidden={activeDay == null} className={`${activeDay == null ? 'max-h-0 opacity-0 -translate-y-2' : 'max-h-[65vh] opacity-100 translate-y-0'} overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-[max-height,opacity,transform] duration-300 ease-out mt-4`}>
          <div className="px-5 pt-4 pb-3 flex items-start justify-between sticky top-0 bg-white">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{activeMeta ? `${activeMeta.label} — ${activeMeta.date}` : ''}</h2>
              <p className="text-sm text-gray-600">Business: <span className="font-medium">{businessName ?? '—'}</span></p>
              <p className="text-sm text-gray-600">Location: <span className="font-medium">{locationName ?? '—'}</span></p>
              <p className="text-sm text-gray-600">Store Hours: <span className="font-medium">{openHH} – {closeHH}</span></p>
            </div>
            <button onClick={() => setActiveDay(null)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Close panel"><X className="w-5 h-5" /></button>
          </div>

          {activeDay != null && (
            <div className="px-5 pb-5 max-h-[55vh] overflow-y-auto">
              <div className="space-y-3">
                {employees.map(e => {
                  const d = getDraft(e.id, activeDay!);
                  return (
                    <div key={e.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{e.name}</p>
                        <p className="text-sm text-gray-500 truncate">{e.roleName}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        {d ? (
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">{d.start} – {d.end}</p>
                          </div>
                        ) : <p className="text-sm text-gray-400">No shift</p>}
                        <button onClick={() => openEditor(e.id, activeDay!)} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">{d ? 'Edit' : 'Add'}</button>
                        {d && <button onClick={() => removeDraft(e.id, activeDay!)} className="px-2 py-2 text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Remove"><X className="w-4 h-4" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Debug panel: toggle to show the exact JSON payload that will be inserted */}
        <div className="mt-6 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-600">Debug: payload preview</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDebug(s => !s)} className="px-3 py-1 text-sm border rounded-lg bg-white">{showDebug ? 'Hide' : 'Show'}</button>
              <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(shiftsPreview, null, 2)); }} className="px-3 py-1 text-sm bg-gray-100 rounded-lg">Copy</button>
            </div>
          </div>
          {showDebug && (
            <pre className="max-h-60 overflow-auto p-3 bg-slate-900 text-slate-50 rounded-lg text-xs">{shiftsPreview.length ? JSON.stringify(shiftsPreview, null, 2) : 'No payload: ensure a business, location, and drafts exist.'}</pre>
          )}
        </div>

        <div className="mt-6 mb-10 flex justify-end gap-3">
          <button onClick={() => router.replace('/employermanagement/employerhomepage')} className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Back to Home</button>
          <button onClick={handleConfirm} className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700">Confirm Schedule</button>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Set Shift Time</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <input type="time" value={startTime} min={openHH} max={closeHH} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
                <input type="time" value={endTime} min={openHH} max={closeHH} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={saveDraft} className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700">Save</button>
              </div>

              <p className="text-xs text-gray-500 pt-2">Shifts are constrained to store hours ({openHH}–{closeHH}).</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
