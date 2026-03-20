import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Calendar, Download, RefreshCw, Shield, Edit, Search, UserPlus, Trash2 } from 'lucide-react';

const AdminDashboard: React.FC = () => {
  const { signOut } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [whitelist, setWhitelist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('all');
  
  const [activeTab, setActiveTab] = useState<'attendance' | 'whitelist'>('attendance');
  
  // Whitelist Form state
  const [wlEmail, setWlEmail] = useState('');
  const [wlRoll, setWlRoll] = useState('');
  const [wlTeamId, setWlTeamId] = useState('');
  const [wlLoading, setWlLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // Fetch teams
    const { data: teamsData } = await supabase.from('teams').select('*');
    if (teamsData) {
      setTeams(teamsData);
      if (teamsData.length > 0) setWlTeamId(teamsData[0].id);
    }

    // Fetch whitelist
    const { data: wlData } = await supabase.from('whitelisted_users').select('*');
    if (wlData) setWhitelist(wlData);

    // Fetch today's logs with profile info
    const today = new Date().toISOString().split('T')[0];
    const { data: logsData } = await supabase
      .from('attendance_logs')
      .select(`
        *,
        profiles ( full_name, roll_number, team_id, device_token ),
        locations ( event_name )
      `)
      .eq('date', today);
      
    if (logsData) setLogs(logsData);
    setLoading(false);
  };

  const handleResetDevice = async (userId: string) => {
    if (!window.confirm("Are you sure you want to reset this user's device token?")) return;
    await supabase.from('profiles').update({ device_token: null }).eq('id', userId);
    alert('Device token reset successfully. The student can now log in from a new device.');
    fetchData();
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    setWlLoading(true);
    const { error } = await supabase.from('whitelisted_users').insert({
      email: wlEmail,
      roll_number: wlRoll,
      team_id: wlTeamId
    });
    
    if (error) {
      alert(`Error saving to whitelist: ${error.message}`);
    } else {
      setWlEmail('');
      setWlRoll('');
      fetchData();
    }
    setWlLoading(false);
  };
  
  const handleRemoveWhitelist = async (id: string) => {
    if (!window.confirm("Remove this student from the whitelist?")) return;
    await supabase.from('whitelisted_users').delete().eq('id', id);
    fetchData();
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
    link.download = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const filteredLogs = filterTeam === 'all' 
    ? logs 
    : logs.filter(log => log.profiles?.team_id === filterTeam);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="h-6 w-6 text-indigo-400" />
            <h1 className="text-xl font-bold">Admin Portal</h1>
          </div>
          <button onClick={signOut} className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors">
            Exit Admin
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 py-8">
        
        <div className="flex space-x-2 mb-8 bg-slate-200/50 p-1 rounded-xl w-fit">
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
            Whitelist Management
          </button>
        </div>

        {activeTab === 'attendance' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Today's Total</p>
                  <p className="text-3xl font-bold text-slate-900">{logs.length}</p>
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
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
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
                    onClick={exportCSV}
                    className="flex items-center justify-center px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors shadow-sm"
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
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Time In</th>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Time Out</th>
                        <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map(log => {
                        const teamName = teams.find(t => t.id === log.profiles?.team_id)?.name;
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="font-semibold text-slate-900">{log.profiles?.full_name}</p>
                              <p className="text-xs text-slate-500">{log.profiles?.roll_number}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                {teamName}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(log.punch_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </td>
                            <td className="px-6 py-4 text-slate-600">
                              {log.punch_out_time ? new Date(log.punch_out_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              {log.profiles?.device_token && (
                                <button 
                                  onClick={() => handleResetDevice(log.user_id)}
                                  className="inline-flex items-center p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                                  title="Reset bound device"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                className="inline-flex items-center p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100"
                                title="Edit Record"
                              >
                                <Edit className="w-4 h-4" />
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
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center">
                <UserPlus className="w-5 h-5 mr-2 text-indigo-500"/> Add to Whitelist
              </h2>
              <p className="text-sm text-slate-500 mb-4">Register an allowed student email to their Roll Number and Team.</p>
              
              <form onSubmit={handleAddWhitelist} className="flex flex-col md:flex-row items-end gap-4">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Google Email</label>
                  <input type="email" required value={wlEmail} onChange={e => setWlEmail(e.target.value)} placeholder="student@university.edu" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Roll Number</label>
                  <input type="text" required value={wlRoll} onChange={e => setWlRoll(e.target.value)} placeholder="23CSEAIML057" className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"/>
                </div>
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Assigned Team</label>
                  <select required value={wlTeamId} onChange={e => setWlTeamId(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={wlLoading} className="w-full md:w-auto px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
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
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Email</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Roll Number</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs">Team</th>
                      <th className="px-6 py-4 font-medium uppercase tracking-wider text-xs text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {whitelist.map(entry => {
                      const teamName = teams.find(t => t.id === entry.team_id)?.name;
                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">{entry.email}</td>
                          <td className="px-6 py-4 text-slate-600">{entry.roll_number}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                              {teamName}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
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
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
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
      </main>
    </div>
  );
};

export default AdminDashboard;
