import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getLocalDateString } from '../utils/dateUtils';
import { Users, Calendar, Download, RefreshCw, Shield, Edit, Search, UserPlus, Trash2, MapPin, Loader2, ShieldAlert, Archive, Undo2 } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { signOut, profile } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('all');
  
  const [activeTab, setActiveTab] = useState<'attendance' | 'whitelist' | 'events' | 'admins' | 'deleted'>('attendance');
  const [deletedLogs, setDeletedLogs] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [eventTeams, setEventTeams] = useState<any[]>([]);
  
  // Whitelist Form state
  const [wlEmail, setWlEmail] = useState('');
  const [wlName, setWlName] = useState('');
  const [wlRoll, setWlRoll] = useState('');
  const [wlTeamId, setWlTeamId] = useState('');
  const [wlPassword, setWlPassword] = useState('');
  const [wlMobile, setWlMobile] = useState('');
  const [wlLoading, setWlLoading] = useState(false);
  
  // Edit State
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [editingEvent, setEditingEvent] = useState<any>(null);

  // New Event Form state
  const [evName, setEvName] = useState('');
  const [evLat, setEvLat] = useState('');
  const [evLng, setEvLng] = useState('');
  const [evRadius, setEvRadius] = useState('50');
  const [evStartDate, setEvStartDate] = useState(getLocalDateString());
  const [evEndDate, setEvEndDate] = useState(getLocalDateString());
  const [attendanceDate, setAttendanceDate] = useState(getLocalDateString());
  const [evTeams, setEvTeams] = useState<string[]>([]);
  const [whitelistedAdmins, setWhitelistedAdmins] = useState<any[]>([]);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminName, setAdminName] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  // Manual Attendance State
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualStudentId, setManualStudentId] = useState('');
  const [manualEventId, setManualEventId] = useState('');
  const [manualAction, setManualAction] = useState<'in' | 'out'>('in');
  const [manualLoading, setManualLoading] = useState(false);

  useEffect(() => {
    fetchData();
    checkSuperAdmin();
  }, [attendanceDate]);

  const checkSuperAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email === 'bibhukalyannayak6@gmail.com') {
      setIsSuperAdmin(true);
      fetchAdmins();
    }
  };

  const fetchAdmins = async () => {
    const { data } = await supabase.from('whitelisted_users').select('*').eq('role', 'admin');
    if (data) setWhitelistedAdmins(data);
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !adminPass) return;

    // We need a team_id for whitelisted_users. For admins, we use a placeholder or the first team.
    const { data: teams } = await supabase.from('teams').select('id').limit(1);
    if (!teams || teams.length === 0) return;

    const { error } = await supabase.from('whitelisted_users').insert([{
      email: adminEmail,
      initial_password: adminPass,
      roll_number: 'ADMIN',
      team_id: teams[0].id,
      role: 'admin',
      full_name: adminName || 'Administrator'
    }]);

    if(error) {
      alert(error.message);
    } else {
      setAdminEmail('');
      setAdminPass('');
      setAdminName('');
      fetchAdmins();
    }
  };

  const handleDetectLocation = (target: 'create' | 'edit') => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (target === 'create') {
          setEvLat(latitude.toString());
          setEvLng(longitude.toString());
        } else if (editingEvent) {
          setEditingEvent({
            ...editingEvent,
            target_lat: latitude.toString(),
            target_lng: longitude.toString()
          });
        }
        setIsDetecting(false);
      },
      (error) => {
        alert(`Location error: ${error.message}`);
        setIsDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  const fetchData = async () => {
    setLoading(true);
    // Fetch teams
    const { data: teamsData, error: teamsError } = await supabase.from('teams').select('*');
    if (teamsError) console.error("Error fetching teams:", teamsError.message);
    if (teamsData) {
      setTeams(teamsData);
      if (teamsData.length > 0 && !wlTeamId) setWlTeamId(teamsData[0].id);
    }

    // Fetch whitelist and profiles separately to avoid join relationship error
    const { data: wlData, error: wlError } = await supabase.from('whitelisted_users').select('*');
    if (wlError) console.error("Error fetching whitelist:", wlError.message);

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, mobile_number, device_token, team_id');
    if (profilesError) console.error("Error fetching profiles (for enrollment status):", profilesError.message);

    if (wlData) {
      // Join in memory
      const joinedData = wlData.map(entry => ({
        ...entry,
        profiles: profilesData?.find(p => p.email.toLowerCase() === entry.email.toLowerCase()) || null
      }));
      console.log("Whitelisted users (joined in UI) found:", joinedData.length);
      setWhitelist(joinedData);
    }

    // Fetch today's logs with profile info
    const { data: logsData, error: logsError } = await supabase
      .from('attendance_logs')
      .select(`
        *,
        profiles ( full_name, roll_number, team_id, device_token, mobile_number ),
        locations ( event_name )
      `)
      .eq('date', attendanceDate);
      
    if (logsError) console.error("Error fetching logs:", logsError.message);
    if (logsData) {
      setLogs(logsData.filter(l => !l.is_deleted));
      setDeletedLogs(logsData.filter(l => l.is_deleted));
    }

    // Fetch locations and event_teams
    const { data: locData } = await supabase.from('locations').select('*');
    if (locData) setLocations(locData);

    const { data: etData } = await supabase.from('event_teams').select('*');
    if (etData) setEventTeams(etData);

    setLoading(false);
  };

  const handleResetDevice = async (profileId: string) => {
    if (!confirm('Are you sure you want to reset the device binding for this user?')) return;
    const { error } = await supabase.from('profiles').update({ device_token: null }).eq('id', profileId);
    if (error) alert(`Error: ${error.message}`);
    else {
      alert('Device reset successful.');
      fetchData();
    }
  };

  const handleUpdateWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    
    setWlLoading(true);
    const { error: wlError } = await supabase
      .from('whitelisted_users')
      .update({
        email: editingStudent.email,
        full_name: editingStudent.full_name,
        roll_number: editingStudent.roll_number,
        team_id: editingStudent.team_id,
        initial_password: editingStudent.initial_password,
        mobile_number: editingStudent.mobile_number
      })
      .eq('id', editingStudent.id);

    if (wlError) {
      alert(`Error updating whitelist: ${wlError.message}`);
    } else {
      const profile = Array.isArray(editingStudent.profiles) ? editingStudent.profiles[0] : editingStudent.profiles;
      if (profile) {
        await supabase
          .from('profiles')
          .update({
            email: editingStudent.email,
            full_name: editingStudent.full_name,
            roll_number: editingStudent.roll_number,
            team_id: editingStudent.team_id,
            mobile_number: editingStudent.mobile_number
          })
          .eq('id', profile.id);
      }
      setEditingStudent(null);
      fetchData();
    }
    setWlLoading(false);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // 1. Create location
    const { data: location, error: locError } = await supabase
      .from('locations')
      .insert({
        event_name: evName,
        target_lat: parseFloat(evLat),
        target_lng: parseFloat(evLng),
        radius_meters: parseInt(evRadius),
        start_date: evStartDate,
        end_date: evEndDate,
        is_active: true
      })
      .select()
      .single();

    if (locError) {
      alert(`Error creating event: ${locError.message}`);
    } else if (location && evTeams.length > 0) {
      // 2. Assign teams
      const assignments = evTeams.map(teamId => ({
        location_id: location.id,
        team_id: teamId
      }));
      const { error: etError } = await supabase.from('event_teams').insert(assignments);
      if (etError) alert(`Error assigning teams: ${etError.message}`);
    }

    if (!locError) {
      setEvName('');
      setEvLat('');
      setEvLng('');
      setEvRadius('50');
      setEvStartDate(getLocalDateString());
      setEvEndDate(getLocalDateString());
      setEvTeams([]);
      fetchData();
    }
    setLoading(false);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event? All attendance logs for this event will remain, but the location will be removed.')) return;
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) alert(`Error: ${error.message}`);
    else fetchData();
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    setLoading(true);

    const { error: locError } = await supabase
      .from('locations')
      .update({
        event_name: editingEvent.event_name,
        target_lat: parseFloat(editingEvent.target_lat),
        target_lng: parseFloat(editingEvent.target_lng),
        radius_meters: parseInt(editingEvent.radius_meters),
        start_date: editingEvent.start_date,
        end_date: editingEvent.end_date,
        is_active: editingEvent.is_active
      })
      .eq('id', editingEvent.id);

    if (locError) {
      alert(`Error updating event: ${locError.message}`);
    } else {
      // Sync teams: delete and re-insert
      await supabase.from('event_teams').delete().eq('location_id', editingEvent.id);
      
      if (editingEvent.team_ids && editingEvent.team_ids.length > 0) {
        const assignments = editingEvent.team_ids.map((tid: string) => ({
          location_id: editingEvent.id,
          team_id: tid
        }));
        await supabase.from('event_teams').insert(assignments);
      }
      
      setEditingEvent(null);
      fetchData();
    }
    setLoading(false);
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    setWlLoading(true);
    const { error } = await supabase.from('whitelisted_users').upsert({
      email: wlEmail,
      full_name: wlName,
      roll_number: wlRoll,
      team_id: wlTeamId,
      initial_password: wlPassword,
      mobile_number: wlMobile
    }, { onConflict: 'email' });
    
    if (error) {
      alert(`Error saving to whitelist: ${error.message}`);
    } else {
      setWlEmail('');
      setWlName('');
      setWlRoll('');
      setWlPassword('');
      setWlMobile('');
      fetchData();
    }
    setWlLoading(false);
  };
  
  const handleRemoveWhitelist = async (id: string) => {
    if (!window.confirm("Remove this student from the whitelist?")) return;
    await supabase.from('whitelisted_users').delete().eq('id', id);
    fetchData();
  };

  const handleManualAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualStudentId || !manualEventId) return;
    setManualLoading(true);

    try {
      const today = getLocalDateString();
      if (manualAction === 'in') {
        const { error } = await supabase.from('attendance_logs').insert({
          user_id: manualStudentId,
          location_id: manualEventId,
          date: today,
          status: 'Present',
          is_manual_entry: true
        });
        if (error) alert(`Error logging manual punch in: ${error.message}`);
        else {
          alert('Manual Punch In successful.');
          setShowManualModal(false);
          fetchData();
        }
      } else {
        const { data: qlogs, error: fetchErr } = await supabase
          .from('attendance_logs')
          .select('*')
          .eq('user_id', manualStudentId)
          .eq('location_id', manualEventId)
          .eq('date', today)
          .order('punch_in_time', { ascending: false });

        const openSession = qlogs?.find(l => !l.punch_out_time);
        
        if (fetchErr) {
          alert(`Error checking sessions: ${fetchErr.message}`);
        } else if (!openSession) {
          alert('There is no currently open active session for this student at this event to Punch Out.');
        } else {
          const { error: outErr } = await supabase
            .from('attendance_logs')
            .update({ punch_out_time: new Date().toISOString() })
            .eq('id', openSession.id);
            
          if (outErr) alert(`Error logging manual punch out: ${outErr.message}`);
          else {
            alert('Manual Punch Out successful.');
            setShowManualModal(false);
            fetchData();
          }
        }
      }
    } catch (err: any) {
      alert(`Runtime error: ${err.message}`);
    }
    setManualLoading(false);
  };

  const handleDeleteAttendance = async (sessionIds: string[]) => {
    if (!window.confirm("Are you sure you want to move this student's attendance records to the Deleted Archive?")) return;
    
    const { error } = await supabase.from('attendance_logs').update({ is_deleted: true }).in('id', sessionIds);
    if (error) alert(`Error archiving records: ${error.message}`);
    else {
      alert('Records successfully archived.');
      fetchData();
    }
  };

  const handleRestoreAttendance = async (sessionIds: string[]) => {
    if (!window.confirm("Restore these records back to the active attendance roster?")) return;
    
    const { error } = await supabase.from('attendance_logs').update({ is_deleted: false }).in('id', sessionIds);
    if (error) alert(`Error restoring records: ${error.message}`);
    else {
      alert('Records successfully restored.');
      fetchData();
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Roll Number', 'Team', 'Time In', 'Time Out', 'Status', 'Manual Entry'];
    const csvRows = logs.map(log => {
      const team = teams.find(t => t.id === log.profiles?.team_id)?.name || 'Unknown';
      return [
        log.profiles?.full_name,
        log.profiles?.roll_number,
        team,
        new Date(log.punch_in_time).toLocaleTimeString(),
        log.punch_out_time ? new Date(log.punch_out_time).toLocaleTimeString() : 'N/A',
        log.status,
        log.is_manual_entry ? 'Yes' : 'No'
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_report_${getLocalDateString()}.csv`;
    link.click();
  };

  const filteredLogs = filterTeam === 'all' 
    ? logs 
    : logs.filter(log => log.profiles?.team_id === filterTeam);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <img src="https://gietuerp.in/Login/images/logo.png" alt="GIET Logo" className="h-16 sm:h-20 md:h-24 w-auto object-contain drop-shadow-sm" />
            <div>
              <h1 className="text-xl font-bold leading-tight">Admin Portal</h1>
              {profile?.full_name && (
                <p className="text-xs text-indigo-300 font-medium tracking-wide">Welcome, {profile.full_name}</p>
              )}
            </div>
          </div>
          <button onClick={signOut} className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
            Exit Admin
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-2 sm:p-4 py-4 sm:py-8 overflow-hidden">
        
        <div className="flex flex-nowrap space-x-2 mb-6 sm:mb-8 bg-slate-200/50 p-1 rounded-xl w-full md:w-fit overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('attendance')} 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'attendance' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Daily Attendance
          </button>
          <button 
            onClick={() => setActiveTab('whitelist')} 
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'whitelist' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Whitelist
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex items-center px-6 py-3 text-sm font-bold transition-all ${
              activeTab === 'events' 
                ? 'border-b-2 border-orange-500 text-orange-600' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Events
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('admins')}
              className={`flex items-center px-6 py-3 text-sm font-bold transition-all ${
                activeTab === 'admins' 
                  ? 'border-b-2 border-red-500 text-red-600' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              Admin Mgmt
            </button>
          )}
          <button
            onClick={() => setActiveTab('deleted')}
            className={`flex items-center px-6 py-3 text-sm font-bold transition-all ${
              activeTab === 'deleted' 
                ? 'border-b-2 border-slate-800 text-slate-900' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Archive className="mr-2 h-4 w-4" />
            Deleted Archive
          </button>
        </div>

        {activeTab === 'attendance' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Unique Students</p>
                  <p className="text-3xl font-bold text-slate-900">{new Set(logs.map(log => log.user_id)).size}</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Active Event</p>
                  <p className="text-xl font-bold text-slate-900 truncate max-w-[120px]">
                    {logs[0]?.locations?.event_name || 'None'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-slate-900">Attendance Register</h2>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                  <div className="relative flex-1 md:w-auto">
                    <input 
                      type="date"
                      value={attendanceDate}
                      onChange={e => setAttendanceDate(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700 hover:bg-white transition-colors"
                    />
                  </div>
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select 
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                      value={filterTeam}
                      onChange={e => setFilterTeam(e.target.value)}
                    >
                      <option value="all">All Teams filter</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setManualStudentId('');
                      setManualEventId(locations[0]?.id || '');
                      setManualAction('in');
                      setShowManualModal(true);
                    }}
                    className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-sm w-full sm:w-auto"
                  >
                    <UserPlus className="w-4 h-4 mr-2" /> Manual Add
                  </button>
                  <button 
                    onClick={exportCSV}
                    className="flex items-center justify-center px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors shadow-sm w-full sm:w-auto"
                  >
                    <Download className="w-4 h-4 mr-2" /> Export
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-12 pl-12 text-center animate-pulse">
                    <div className="h-8 w-8 bg-blue-500 rounded-full mx-auto"></div>
                  </div>
                ) : (
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Student</th>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Team</th>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Total Duration</th>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Activity</th>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.values(filteredLogs.reduce((acc: any, log: any) => {
                        const key = `${log.user_id}_${log.location_id}`;
                        if (!acc[key]) {
                          acc[key] = {
                            profile: log.profiles,
                            location: log.locations,
                            sessions: [],
                            totalMs: 0
                          };
                        }
                        acc[key].sessions.push(log);
                        if (log.punch_in_time && log.punch_out_time) {
                          acc[key].totalMs += new Date(log.punch_out_time).getTime() - new Date(log.punch_in_time).getTime();
                        } else if (log.punch_in_time && !log.punch_out_time) {
                          acc[key].totalMs += new Date().getTime() - new Date(log.punch_in_time).getTime();
                        }
                        return acc;
                      }, {})).map((group: any) => {
                        const teamName = teams.find(t => t.id === group.profile?.team_id)?.name;
                        const hours = Math.floor(group.totalMs / 3600000);
                        const minutes = Math.floor((group.totalMs % 3600000) / 60000);
                        const latestSession = group.sessions.sort((a: any, b: any) => new Date(b.punch_in_time).getTime() - new Date(a.punch_in_time).getTime())[0];
                        
                        return (
                          <tr key={`${group.profile.id}_${group.location.id}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-semibold text-slate-900">{group.profile?.full_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-slate-500">{group.profile?.roll_number}</p>
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] uppercase font-bold tracking-tighter">
                                  {group.sessions.length} sessions
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                {teamName}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-blue-600 font-bold">{hours}h {minutes}m</p>
                              <p className="text-[10px] text-slate-400">Total Duration</p>
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              <p className="font-medium text-slate-700">
                                {new Date(latestSession.punch_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </p>
                              <p className="text-[10px] text-slate-400">Latest Pulse In</p>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              {group.profile?.device_token && (
                                <button 
                                  onClick={() => handleResetDevice(group.profile.id)}
                                  className="inline-flex items-center p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                                  title="Reset bound device"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeleteAttendance(group.sessions.map((s: any) => s.id))}
                                className="inline-flex items-center p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                                title="Delete Attendance For Today"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                      {filteredLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                            No attendance records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'deleted' && (
          <div className="bg-slate-100/50 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-700 flex items-center">
                <Archive className="w-5 h-5 mr-2" /> Deleted Records Archive
              </h2>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center animate-pulse"><div className="h-8 w-8 bg-slate-400 rounded-full mx-auto"></div></div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-200 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Student</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Team</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Deleted Session Date</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Object.values(deletedLogs.reduce((acc: any, log: any) => {
                      const key = `${log.user_id}_${log.location_id}`;
                      if (!acc[key]) acc[key] = { profile: log.profiles, location: log.locations, date: log.date, sessions: [] };
                      acc[key].sessions.push(log);
                      return acc;
                    }, {})).map((group: any) => {
                      const teamName = teams.find(t => t.id === group.profile?.team_id)?.name;
                      return (
                        <tr key={`${group.profile.id}_${group.location.id}`} className="hover:bg-slate-200/50 transition-colors opacity-75">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-700">{group.profile?.full_name}</p>
                            <p className="text-xs text-slate-500">{group.profile?.roll_number} • {group.sessions.length} sessions</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700">{teamName}</span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-medium">
                            {new Date(group.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button 
                              onClick={() => handleRestoreAttendance(group.sessions.map((s: any) => s.id))}
                              className="inline-flex items-center px-3 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-100 font-bold text-xs"
                              title="Restore these records"
                            >
                              <Undo2 className="w-4 h-4 mr-2" /> RESTORE
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {deletedLogs.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 font-medium">No deleted records in the archive.</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'whitelist' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center">
                <UserPlus className="w-5 h-5 mr-2 text-indigo-500"/> Add to Whitelist
              </h2>
              <p className="text-sm text-slate-500 mb-4">Register an allowed student email to their Roll Number and Team.</p>
              
              <form onSubmit={handleAddWhitelist} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end">
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input type="text" required value={wlName} onChange={e => setWlName(e.target.value)} placeholder="John Doe" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Google Email</label>
                  <input type="email" required value={wlEmail} onChange={e => setWlEmail(e.target.value)} placeholder="student@university.edu" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Roll Number</label>
                  <input type="text" required value={wlRoll} onChange={e => setWlRoll(e.target.value)} placeholder="23CSEAIML057" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assigned Team</label>
                  <select required value={wlTeamId} onChange={e => setWlTeamId(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
                  <input type="tel" value={wlMobile} onChange={e => setWlMobile(e.target.value)} placeholder="9876543210" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Initial Password</label>
                  <input type="text" required value={wlPassword} onChange={e => setWlPassword(e.target.value)} placeholder="Initial Password" title="Password for Roll No login" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <button type="submit" disabled={wlLoading} className="w-full px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors h-[42px]">
                  {wlLoading ? 'Saving...' : 'Add Student'}
                </button>
              </form>
            </div>
            
            <div className="overflow-x-auto">
              {loading ? (
                  <div className="p-12 text-center animate-pulse"><div className="h-8 w-8 bg-blue-500 rounded-full mx-auto"></div></div>
                ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Student Details</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Roll Number</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Team</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">App Status</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {whitelist.filter(entry => entry.role === 'volunteer').map(entry => {
                      const teamId = entry.team_id;
                      const teamName = teams.find(t => t.id === teamId)?.name || 'Unknown';
                      const profile = Array.isArray(entry.profiles) ? entry.profiles[0] : entry.profiles;
                      const isJoined = !!profile;
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">{entry.full_name || 'No Name'}</p>
                            <p className="text-sm text-slate-500">{entry.email}</p>
                            <div className="flex gap-2 mt-1">
                              <p className="text-xs text-slate-400">{entry.mobile_number || 'No mobile'}</p>
                              <span className="text-slate-300">|</span>
                              <p className="text-[10px] text-slate-400 font-mono">Pass: {entry.initial_password}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{entry.roll_number}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                              {teamName}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {isJoined ? (
                              <span className="inline-flex items-center text-emerald-600 font-medium">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></div> Joined
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Pending</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            {isJoined && (
                              <button 
                                onClick={() => handleResetDevice(profile.id)}
                                className="inline-flex items-center p-2 text-amber-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100"
                                title="Reset Device Binding"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => setEditingStudent({...entry, profiles: profile})}
                              className="inline-flex items-center p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                              title="Edit Entry"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRemoveWhitelist(entry.id)}
                              className="inline-flex items-center p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                              title="Delete Whitelist Entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {whitelist.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          Whitelist is currently empty.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {isSuperAdmin && activeTab === 'admins' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center">
                    <ShieldAlert className="w-5 h-5 mr-2 text-red-500"/> Admin Management
                  </h2>
                  <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-bold border border-red-100 uppercase">Super Admin Only</span>
                </div>
                <p className="text-sm text-slate-500 mb-6 font-medium">Add secondary administrators who can manage attendance and live events.</p>
                
                <form onSubmit={handleAddAdmin} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                    <input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Admin Name" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm"/>
                  </div>
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Admin Email</label>
                    <input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@example.com" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm"/>
                  </div>
                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Initial Password</label>
                    <input type="password" required value={adminPass} onChange={e => setAdminPass(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm"/>
                  </div>
                  <button type="submit" className="w-full bg-red-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-red-700 transition-all flex items-center justify-center shadow-lg shadow-red-100">
                    <UserPlus className="w-4 h-4 mr-2"/> ADD ADMIN
                  </button>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Temporary Password</th>
                      <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {whitelistedAdmins.map((adm: any) => (
                      <tr key={adm.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center mr-3">
                              <Shield className="w-4 h-4 text-red-500"/>
                            </div>
                            <span className="text-sm font-bold text-slate-800">{adm.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-mono italic">{adm.initial_password}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleRemoveWhitelist(adm.id)}
                            className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                            title="Remove Admin"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {whitelistedAdmins.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">No secondary administrators added yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom duration-500">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-blue-500"/> Create New Event
                </h2>
                <p className="text-sm text-slate-500 mb-6">Define a geofenced area and assign teams that can mark attendance there.</p>
                
                <form onSubmit={handleAddEvent} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Event Name</label>
                      <input type="text" required value={evName} onChange={e => setEvName(e.target.value)} placeholder="Annual Sports Meet" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Coordinates</label>
                        <button 
                          type="button"
                          onClick={() => handleDetectLocation('create')}
                          disabled={isDetecting}
                          className="flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 disabled:opacity-50 transition-all border border-blue-100 shadow-sm"
                        >
                          {isDetecting ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <MapPin className="w-3 h-3 mr-1"/>}
                          AUTO-DETECT GPS
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="number" step="any" required value={evLat} onChange={e => setEvLat(e.target.value)} placeholder="Latitude" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"/>
                        <input type="number" step="any" required value={evLng} onChange={e => setEvLng(e.target.value)} placeholder="Longitude" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"/>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Radius (meters)</label>
                      <input type="number" required value={evRadius} onChange={e => setEvRadius(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Start Date</label>
                      <input type="date" required value={evStartDate} onChange={e => setEvStartDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"/>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">End Date</label>
                      <input type="date" required value={evEndDate} onChange={e => setEvEndDate(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"/>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Assign Access to Groups (Teams)</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                      {teams.map(team => (
                        <label key={team.id} className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${evTeams.includes(team.id) ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'}`}>
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={evTeams.includes(team.id)} 
                            onChange={(e) => {
                              if (e.target.checked) setEvTeams([...evTeams, team.id]);
                              else setEvTeams(evTeams.filter(id => id !== team.id));
                            }}
                          />
                          <span className="text-xs font-medium truncate">{team.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button type="submit" disabled={loading} className="px-8 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-200">
                      {loading ? 'Creating...' : 'Create Event'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Event Name</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Geofence (Lat, Lng, Rad)</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Assigned Groups</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {locations.map(loc => {
                      const assignedTeamIds = eventTeams.filter(et => et.location_id === loc.id).map(et => et.team_id);
                      const assignedTeamNames = teams.filter(t => assignedTeamIds.includes(t.id)).map(t => t.name);
                      
                      return (
                        <tr key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">{loc.event_name}</p>
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {loc.target_lat.toFixed(4)}, {loc.target_lng.toFixed(4)} ({loc.radius_meters}m)
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {assignedTeamNames.length > 0 ? assignedTeamNames.map(name => (
                                <span key={name} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium border border-slate-200">
                                  {name}
                                </span>
                              )) : (
                                <span className="text-rose-400 italic text-xs">No groups assigned</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                const assignedTeamIds = eventTeams.filter(et => et.location_id === loc.id).map(et => et.team_id);
                                setEditingEvent({ ...loc, team_ids: assignedTeamIds });
                              }}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit Event"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteEvent(loc.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Delete Event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Edit Student Modal */}
        {editingStudent && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Edit Student Detail</h3>
                <button onClick={() => setEditingStudent(null)} className="text-slate-400 font-bold hover:text-slate-600 h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">×</button>
              </div>
              <form onSubmit={handleUpdateWhitelist} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                  <input type="text" required value={editingStudent.full_name || ''} onChange={e => setEditingStudent({...editingStudent, full_name: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Roll Number</label>
                    <input type="text" required value={editingStudent.roll_number} onChange={e => setEditingStudent({...editingStudent, roll_number: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mobile Number</label>
                    <input type="tel" value={editingStudent.mobile_number || ''} onChange={e => setEditingStudent({...editingStudent, mobile_number: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Google Email</label>
                  <input type="email" required value={editingStudent.email} onChange={e => setEditingStudent({...editingStudent, email: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assigned Team</label>
                  <select required value={editingStudent.team_id} onChange={e => setEditingStudent({...editingStudent, team_id: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Initial Password</label>
                  <input type="text" required value={editingStudent.initial_password || ''} onChange={e => setEditingStudent({...editingStudent, initial_password: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setEditingStudent(null)} className="flex-1 px-6 py-2 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={wlLoading} className="flex-1 px-6 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
                    {wlLoading ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Event Modal */}
        {editingEvent && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Edit Event</h3>
                <button onClick={() => setEditingEvent(null)} className="text-slate-400 font-bold hover:text-slate-600 h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">×</button>
              </div>
              <form onSubmit={handleUpdateEvent} className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Event Name</label>
                    <input type="text" required value={editingEvent.event_name} onChange={e => setEditingEvent({...editingEvent, event_name: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Radius (m)</label>
                    <input type="number" required value={editingEvent.radius_meters} onChange={e => setEditingEvent({...editingEvent, radius_meters: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Start Date</label>
                    <input type="date" required value={editingEvent.start_date || ''} onChange={e => setEditingEvent({...editingEvent, start_date: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">End Date</label>
                    <input type="date" required value={editingEvent.end_date || ''} onChange={e => setEditingEvent({...editingEvent, end_date: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Event Location (Coordinates)</label>
                      <button 
                        type="button"
                        onClick={() => handleDetectLocation('edit')}
                        disabled={isDetecting}
                        className="flex items-center px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 disabled:opacity-50 transition-all border border-blue-100 shadow-sm"
                      >
                        {isDetecting ? <Loader2 className="w-3 h-3 mr-1 animate-spin"/> : <MapPin className="w-3 h-3 mr-1"/>}
                        UPDATE FROM GPS
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="number" step="any" required value={editingEvent.target_lat} onChange={e => setEditingEvent({...editingEvent, target_lat: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
                      <input type="number" step="any" required value={editingEvent.target_lng} onChange={e => setEditingEvent({...editingEvent, target_lng: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Assign Access to Groups (Teams)</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {teams.map(team => (
                      <label key={team.id} className={`flex items-center p-2 rounded-lg border cursor-pointer text-xs transition-all ${editingEvent.team_ids?.includes(team.id) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={editingEvent.team_ids?.includes(team.id)} 
                          onChange={(e) => {
                            const currentTeams = editingEvent.team_ids || [];
                            if (e.target.checked) setEditingEvent({...editingEvent, team_ids: [...currentTeams, team.id]});
                            else setEditingEvent({...editingEvent, team_ids: currentTeams.filter((id: string) => id !== team.id)});
                          }}
                        />
                        <span className="truncate">{team.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setEditingEvent(null)} className="flex-1 px-6 py-2 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={loading} className="flex-1 px-6 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50">
                    {loading ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showManualModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 border border-slate-100">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-900 flex items-center">
                  <UserPlus className="w-5 h-5 mr-2 text-indigo-600" />
                  Manual Override
                </h3>
                <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">×</button>
              </div>
              <form onSubmit={handleManualAttendance} className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Student</label>
                  <select required value={manualStudentId} onChange={e => setManualStudentId(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm appearance-none cursor-pointer">
                    <option value="" disabled>Select Student</option>
                    {whitelist.filter(w => w.profiles).map(w => (
                      <option key={w.profiles.id} value={w.profiles.id}>{w.full_name} ({w.roll_number})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Event Location</label>
                  <select required value={manualEventId} onChange={e => setManualEventId(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm appearance-none cursor-pointer">
                    <option value="" disabled>Select Event</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.event_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Attendance Action</label>
                  <div className="flex gap-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="manualAction" checked={manualAction === 'in'} onChange={() => setManualAction('in')} className="text-indigo-600" />
                      <span className="text-sm font-medium text-slate-700">Punch In (New Session)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input type="radio" name="manualAction" checked={manualAction === 'out'} onChange={() => setManualAction('out')} className="text-indigo-600" />
                      <span className="text-sm font-medium text-slate-700">Punch Out (Close Active)</span>
                    </label>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setShowManualModal(false)} className="flex-1 px-4 py-2 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                  <button type="submit" disabled={manualLoading} className="flex-1 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                    {manualLoading ? 'Saving...' : 'Confirm Override'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
