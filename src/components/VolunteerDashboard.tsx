import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { isUserWithinGeofence } from '../utils/geolocation';
import { MapPin, LogOut, ShieldAlert } from 'lucide-react';

const VolunteerDashboard: React.FC = () => {
  const { profile, signOut } = useAuth();
  const [locations, setLocations] = useState<any[]>([]);
  const [activeLocation, setActiveLocation] = useState<any>(null);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [activeLog, setActiveLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    // 1. Get all active locations assigned to my team (filtered by RLS)
    const { data: locs } = await supabase.from('locations')
      .select('*')
      .eq('is_active', true);
    
    if (locs && locs.length > 0) {
      setLocations(locs);
      
      const current = activeLocation ? locs.find(l => l.id === activeLocation.id) : locs[0];
      const selected = current || locs[0];
      setActiveLocation(selected);
      
      // 2. Fetch all logs for today for this specific location
      const { data: logsData } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', profile?.id)
        .eq('location_id', selected.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .order('punch_in_time', { ascending: false });
      
      setTodayLogs(logsData || []);
      // Active log is the latest one IF it hasn't been punched out yet
      const latest = logsData?.[0];
      setActiveLog(latest && !latest.punch_out_time ? latest : null);
    } else {
      setLocations([]);
      setActiveLocation(null);
      setTodayLogs([]);
      setActiveLog(null);
    }
    setLoading(false);
  };

  const executeLocationAction = async (action: 'in' | 'out') => {
    setActionLoading(true);
    setGeoError('');

    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      setActionLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { isValid, distance } = isUserWithinGeofence(
            position.coords, 
            activeLocation.target_lat, 
            activeLocation.target_lng, 
            activeLocation.radius_meters
          );

          if (!isValid) {
            setGeoError(`You are ${Math.round(distance)}m away. You must be within ${activeLocation.radius_meters}m to punch ${action}.`);
            setActionLoading(false);
            return;
          }

          if (action === 'in') {
            await supabase.from('attendance_logs').insert({
              user_id: profile?.id,
              location_id: activeLocation.id,
              date: new Date().toISOString().split('T')[0],
              status: 'Present'
            });
          } else {
            await supabase.from('attendance_logs')
              .update({ punch_out_time: new Date().toISOString() })
              .eq('id', activeLog.id);
          }
          await fetchStatus();
        } catch (err: any) {
          setGeoError(err.message || 'Geofence validation failed');
        } finally {
          setActionLoading(false);
        }
      },
      (error) => {
        setGeoError(`Location access denied or failed: ${error.message}`);
        setActionLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const calculateTotalDuration = () => {
    let totalMs = 0;
    todayLogs.forEach(log => {
      if (log.punch_in_time && log.punch_out_time) {
        totalMs += new Date(log.punch_out_time).getTime() - new Date(log.punch_in_time).getTime();
      } else if (log.punch_in_time && !log.punch_out_time) {
        // Current open session contribution up to now
        totalMs += new Date().getTime() - new Date(log.punch_in_time).getTime();
      }
    });

    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  if (loading) return <div className="p-8 text-center animate-pulse"><div className="h-8 w-8 bg-blue-500 rounded-full mx-auto"></div></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {profile?.full_name?.charAt(0) || 'V'}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{profile?.full_name}</p>
              <p className="text-xs text-slate-500">{profile?.roll_number}</p>
            </div>
          </div>
          <button onClick={signOut} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 py-8">
        {!activeLocation ? (
          <div className="text-center p-12 bg-white rounded-3xl shadow-sm border border-slate-100">
            <MapPin className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-slate-700">No Active Events</h2>
            <p className="text-slate-500 mt-2">There are currently no events configured for attendance tracking.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold mb-3 border border-blue-100">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
                    Active Event
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">{activeLocation.event_name}</h1>
                </div>

                {locations.length > 1 && (
                  <div className="min-w-[200px]">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Switch Event</label>
                    <select 
                      value={activeLocation.id}
                      onChange={(e) => {
                        const loc = locations.find(l => l.id === e.target.value);
                        setActiveLocation(loc);
                        // Trigger log fetch for this new selection
                        const fetchLog = async () => {
                          const { data: log } = await supabase
                            .from('attendance_logs')
                            .select('*')
                            .eq('user_id', profile?.id)
                            .eq('location_id', loc.id)
                            .eq('date', new Date().toISOString().split('T')[0])
                            .maybeSingle();
                          setActiveLog(log);
                        };
                        fetchLog();
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {locations.map(l => <option key={l.id} value={l.id}>{l.event_name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {geoError && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start text-red-800">
                  <ShieldAlert className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5 text-red-500" />
                  <p className="text-sm font-medium">{geoError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100/50">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Total Stayed Today</p>
                  <p className="text-2xl font-black text-blue-600">{calculateTotalDuration()}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Sessions</p>
                  <p className="text-2xl font-black text-slate-600">{todayLogs.length}</p>
                </div>
              </div>

              {!activeLog && (
                <button
                  disabled={actionLoading}
                  onClick={() => executeLocationAction('in')}
                  className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-4 rounded-2xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:pointer-events-none"
                >
                  <div className="absolute inset-0 w-full h-full bg-white opacity-0 group-hover:opacity-10 transition-opacity"></div>
                  <span className="flex items-center justify-center">
                    {actionLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <><MapPin className="w-5 h-5 mr-2" /> Punch In</>}
                  </span>
                </button>
              )}

              {activeLog && !activeLog.punch_out_time && (
                <button
                  disabled={actionLoading}
                  onClick={() => executeLocationAction('out')}
                  className="w-full relative group overflow-hidden bg-white border border-rose-200 text-rose-600 font-semibold py-4 rounded-2xl shadow-sm hover:bg-rose-50 transition-all disabled:opacity-70 disabled:pointer-events-none"
                >
                  <span className="flex items-center justify-center">
                    {actionLoading ? <div className="w-5 h-5 border-2 border-rose-600 border-t-transparent animate-spin rounded-full" /> : <><LogOut className="w-5 h-5 mr-2" /> Punch Out</>}
                  </span>
                </button>
              )}

              {todayLogs.length > 0 && (
                <div className="mt-8 border-t border-slate-100 pt-8">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Today's Session History</h3>
                  <div className="space-y-3">
                    {todayLogs.map(log => (
                      <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100 text-sm">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${log.punch_out_time ? 'bg-slate-300' : 'bg-emerald-500 animate-pulse'}`}></div>
                          <span className="font-medium text-slate-700">
                            {new Date(log.punch_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {" → "}
                            {log.punch_out_time ? new Date(log.punch_out_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Active'}
                          </span>
                        </div>
                        {log.punch_out_time && (
                          <span className="text-xs font-bold text-slate-400">
                            {Math.round((new Date(log.punch_out_time).getTime() - new Date(log.punch_in_time).getTime()) / 60000)} mins
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-center text-sm text-slate-400 space-x-2">
               <ShieldAlert className="w-4 h-4" />
               <p>Location is restricted to a {activeLocation.radius_meters}m radius of the event location.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default VolunteerDashboard;
