import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import axios from 'axios';

function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [devices, setDevices] = useState([]);
  const [schedules, setSchedules] = useState([]);

  // Sidebar & Navigation Active Tab State
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, addDevice, schedule, settings
  
  // Theme & Language State
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState('bn');

  // Room State & Active Filter
  const [selectedRoom, setSelectedRoom] = useState('All');

  // Auth form states
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState({ type: '', text: '' });

  // New device form states
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('switch');
  const [newPin, setNewPin] = useState('');
  const [newRoom, setNewRoom] = useState('Living Room');

  // Schedule Form States
  const [schedDeviceId, setSchedDeviceId] = useState('');
  const [schedStatus, setSchedStatus] = useState(true);
  const [schedTime, setSchedTime] = useState('22:00');

  const API_URL = import.meta.env.VITE_API_URL;
  const roomOptions = ['Living Room', 'Bedroom', 'Dining Room', 'Kitchen', 'Washroom', 'Balcony'];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchDevices();
      fetchSchedules();
    }
  }, [session]);

  // Realtime Listener
  useEffect(() => {
    if (!session) return;

    const subscription = supabase
      .channel('devices-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDevices((prev) => [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setDevices((prev) =>
              prev.map((dev) => (dev.id === payload.new.id ? payload.new : dev))
            );
          } else if (payload.eventType === 'DELETE') {
            setDevices((prev) => prev.filter((dev) => dev.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [session]);

  // অটো-পোলিং: প্রতি ৫ সেকেন্ড পর পর ব্যাকএন্ড থেকে ডিভাইসের লেটেস্ট স্ট্যাটাস ফেচ করবে
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      fetchDevices();
    }, 5000); // প্রতি ৫ সেকেন্ড

    return () => clearInterval(interval);
  }, [session]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthMessage({ type: '', text: '' });
    if (password.length < 6) {
      setAuthMessage({ type: 'error', text: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' });
      return;
    }
    setAuthLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setAuthMessage({
            type: 'success',
            text: 'ইমেইলে ভেরিফিকেশন লিংক পাঠানো হয়েছে। চেক করুন।',
          });
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setAuthMessage({ type: 'error', text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut();
    setDevices([]);
    setSchedules([]);
  };

  const fetchDevices = async () => {
    try {
      const res = await axios.get(`${API_URL}/devices`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = Array.isArray(res.data) ? res.data : (res.data.devices || []);
      setDevices(data);
      
      if (data.length > 0 && !schedDeviceId) {
        setSchedDeviceId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setDevices([]);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await axios.get(`${API_URL}/schedules`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleDevice = async (id, currentStatus) => {
    try {
      const res = await axios.patch(
        `${API_URL}/devices/${id}/toggle?status=${!currentStatus}`,
        {},
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      setDevices(devices.map((dev) => (dev.id === id ? res.data : dev)));
    } catch (err) {
      console.error(err);
    }
  };

  const deleteDevice = async (id) => {
    if (!window.confirm('এই ডিভাইসটি মুছে ফেলবেন?')) return;
    try {
      await axios.delete(`${API_URL}/devices/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setDevices(devices.filter((d) => d.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const addDevice = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(
        `${API_URL}/devices`,
        {
          name: newName,
          device_type: newType,
          status: false,
          pin_number: newPin ? Number(newPin) : null,
          room_name: newRoom,
        },
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      setDevices([...devices, res.data]);
      setNewName('');
      setNewPin('');
      alert('সফলভাবে ডিভাইস যোগ করা হয়েছে!');
    } catch (err) {
      console.error(err);
      alert('Device add failed');
    }
  };

  const addSchedule = async (e) => {
    e.preventDefault();
    if (!schedDeviceId) {
      alert('একটি ডিভাইস নির্বাচন করুন');
      return;
    }
    try {
      const res = await axios.post(
        `${API_URL}/schedules`,
        {
          device_id: Number(schedDeviceId),
          target_status: schedStatus,
          schedule_time: schedTime,
        },
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      setSchedules([...schedules, res.data]);
      alert('শিডিউল সফলভাবে সেট করা হয়েছে!');
    } catch (err) {
      console.error(err);
      alert('Schedule add failed');
    }
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('এই শিডিউলটি ডিলিট করতে চান?')) return;
    try {
      await axios.delete(`${API_URL}/schedules/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setSchedules(schedules.filter((s) => s.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const isDeviceOnline = (lastSeenTime) => {
    if (!lastSeenTime) return false;
    return (new Date().getTime() - new Date(lastSeenTime).getTime()) / 1000 < 90;
  };

  const filteredDevices = selectedRoom === 'All' 
    ? devices 
    : devices.filter(d => d.room_name === selectedRoom);

  const totalActive = devices.filter(d => d.status).length;

  if (!session) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <h2 style={styles.authTitle}>{isSignUp ? 'Create Account' : 'Smart Home Control'}</h2>
          {authMessage.text && (
            <p style={{ ...styles.message, color: authMessage.type === 'error' ? '#ff6b6b' : '#51cf66' }}>
              {authMessage.text}
            </p>
          )}
          <form onSubmit={handleAuth}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={authLoading} style={styles.primaryBtn}>
              {authLoading ? 'প্রসেসিং...' : isSignUp ? 'Sign Up' : 'Login'}
            </button>
          </form>
          <p style={{ marginTop: '1.5rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.9rem' }}>
            {isSignUp ? 'অ্যাকাউন্ট তৈরি আছে?' : 'অ্যাকাউন্ট নেই?'}{' '}
            <span
              onClick={() => setIsSignUp(!isSignUp)}
              style={{ color: '#4facfe', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {isSignUp ? 'Login করুন' : 'Sign Up করুন'}
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appLayout}>
      {/* Sidebar Menu */}
      <aside style={styles.sidebar}>
        <div>
          <h2 style={styles.sidebarLogo}>HUMAN TECH</h2>
          <p style={{ color: '#00f2fe', fontSize: '0.75rem', marginBottom: '2rem', letterSpacing: '1px' }}>SMART HUB</p>
          
          <nav style={styles.navMenu}>
            <button 
              onClick={() => setActiveTab('dashboard')} 
              style={{ ...styles.navItem, background: activeTab === 'dashboard' ? 'rgba(0, 242, 254, 0.15)' : 'transparent', color: activeTab === 'dashboard' ? '#00f2fe' : '#a0aec0' }}
            >
              🏠 ড্যাশবোর্ড
            </button>
            <button 
              onClick={() => setActiveTab('addDevice')} 
              style={{ ...styles.navItem, background: activeTab === 'addDevice' ? 'rgba(0, 242, 254, 0.15)' : 'transparent', color: activeTab === 'addDevice' ? '#00f2fe' : '#a0aec0' }}
            >
              ➕ ডিভাইস যোগ করুন
            </button>
            <button 
              onClick={() => setActiveTab('schedule')} 
              style={{ ...styles.navItem, background: activeTab === 'schedule' ? 'rgba(0, 242, 254, 0.15)' : 'transparent', color: activeTab === 'schedule' ? '#00f2fe' : '#a0aec0' }}
            >
              ⏰ শিডিউলিং ও টাইমার
            </button>
            <button 
              onClick={() => setActiveTab('settings')} 
              style={{ ...styles.navItem, background: activeTab === 'settings' ? 'rgba(0, 242, 254, 0.15)' : 'transparent', color: activeTab === 'settings' ? '#00f2fe' : '#a0aec0' }}
            >
              ⚙️ সেটিংস (থিম/ভাষা)
            </button>
          </nav>
        </div>

        <div>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={styles.mainContent}>
        {/* Top Header */}
        <header style={styles.header}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>
              {activeTab === 'dashboard' && 'সেন্ট্রাল কন্ট্রোল ড্যাশবোর্ড'}
              {activeTab === 'addDevice' && 'নতুন ডিভাইস কনফিগারেশন'}
              {activeTab === 'schedule' && 'অটোমেশন ও টাইম-বেসড শিডিউলিং'}
              {activeTab === 'settings' && 'সিস্টেম সেটিংস'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#51cf66', fontWeight: 'bold' }}>● Hub Online</span>
          </div>
        </header>

        {/* Tab 1: Dashboard View */}
        {activeTab === 'dashboard' && (
          <>
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>মোট ডিভাইস</span>
                <h2 style={{ margin: '5px 0 0', fontSize: '1.6rem' }}>{devices.length}</h2>
              </div>
              <div style={styles.statCard}>
                <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>সক্রিয় (Active)</span>
                <h2 style={{ margin: '5px 0 0', fontSize: '1.6rem', color: '#00f2fe' }}>{totalActive}</h2>
              </div>
            </div>

            {/* Room Filter Tabs */}
            <div style={styles.roomTabs}>
              {['All', ...roomOptions].map((room) => (
                <button
                  key={room}
                  onClick={() => setSelectedRoom(room)}
                  style={{
                    ...styles.tabBtn,
                    background: selectedRoom === room ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' : 'rgba(255, 255, 255, 0.05)',
                    color: selectedRoom === room ? '#000' : '#fff',
                    fontWeight: selectedRoom === room ? 'bold' : 'normal',
                  }}
                >
                  {room}
                </button>
              ))}
            </div>

            {/* Device Cards Grid */}
            <div style={styles.deviceGrid}>
              {filteredDevices.length > 0 ? (
                filteredDevices.map((device) => (
                  <div
                    key={device.id}
                    style={{
                      ...styles.deviceCard,
                      borderColor: device.status ? '#00f2fe' : 'rgba(255, 255, 255, 0.1)',
                      boxShadow: device.status ? '0 0 15px rgba(0, 242, 254, 0.25)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '1.05rem' }}>{device.name}</h4>
                        <span style={styles.badge}>{device.room_name}</span>
                      </div>
                      <button onClick={() => deleteDevice(device.id)} style={styles.deleteIconBtn}>✕</button>
                    </div>

                    <div style={{ margin: '1rem 0', color: '#a0aec0', fontSize: '0.8rem' }}>
                      <p style={{ margin: '2px 0' }}>Type: <b style={{ color: '#fff' }}>{device.device_type}</b></p>
                      <p style={{ margin: '2px 0' }}>Pin: <b style={{ color: '#fff' }}>GPIO {device.pin_number || 'N/A'}</b></p>
                      <p style={{ margin: '2px 0' }}>HW Status: <span style={{ color: isDeviceOnline(device.last_seen) ? '#51cf66' : '#ff6b6b' }}>
                        {isDeviceOnline(device.last_seen) ? 'Online' : 'Offline'}
                      </span></p>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: device.status ? '#00f2fe' : '#718096', fontWeight: 'bold' }}>
                        {device.status ? '● ON' : '○ OFF'}
                      </span>
                      <button
                        onClick={() => toggleDevice(device.id, device.status)}
                        style={{
                          ...styles.toggleBtn,
                          background: device.status ? '#00f2fe' : '#4a5568',
                          color: device.status ? '#000' : '#fff',
                        }}
                      >
                        {device.status ? 'TURN OFF' : 'TURN ON'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ color: '#a0aec0', gridColumn: '1/-1', textAlign: 'center', padding: '2rem' }}>
                  কোনো ডিভাইস পাওয়া যায়নি।
                </p>
              )}
            </div>
          </>
        )}

        {/* Tab 2: Add Device View */}
        {activeTab === 'addDevice' && (
          <div style={styles.glassCard}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>নতুন ESP32 ডিভাইস যুক্ত করুন</h3>
            <form onSubmit={addDevice} style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px' }}>
              <input
                placeholder="ডিভাইসের নাম (যেমন: Dining Light)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                style={styles.input}
              />
              <select value={newType} onChange={(e) => setNewType(e.target.value)} style={styles.input}>
                <option value="switch" style={{ background: '#1a202c', color: '#fff' }}>Switch</option>
                <option value="sensor" style={{ background: '#1a202c', color: '#fff' }}>Sensor</option>
                <option value="pump" style={{ background: '#1a202c', color: '#fff' }}>Pump</option>
              </select>
              <select value={newRoom} onChange={(e) => setNewRoom(e.target.value)} style={styles.input}>
                {roomOptions.map((r) => <option key={r} value={r} style={{ background: '#1a202c', color: '#fff' }}>{r}</option>)}
              </select>
              <input
                placeholder="GPIO Pin Number"
                type="number"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                style={styles.input}
              />
              <button type="submit" style={styles.primaryBtn}>ডিভাইস সেভ করুন</button>
            </form>
          </div>
        )}

        {/* Tab 3: Schedule View */}
        {activeTab === 'schedule' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {/* Form */}
            <div style={styles.glassCard}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem 0' }}>নতুন টাইমার শিডিউল যোগ করুন</h3>
              <form onSubmit={addSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ color: '#a0aec0', fontSize: '0.85rem', display: 'block', marginBottom: '5px' }}>
                    ডিভাইস নির্বাচন করুন
                  </label>
                  <select
                    value={schedDeviceId}
                    onChange={(e) => setSchedDeviceId(e.target.value)}
                    style={{ ...styles.input, color: '#fff' }}
                  >
                    <option value="" style={{ background: '#1a202c', color: '#fff' }}>-- ডিভাইস বেছে নিন --</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id} style={{ background: '#1a202c', color: '#fff' }}>
                        {d.name} (ID: {d.id}) - {d.room_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ color: '#a0aec0', fontSize: '0.85rem', display: 'block', marginBottom: '5px' }}>অ্যাকশন টাইপ (Action)</label>
                  <select
                    value={schedStatus}
                    onChange={(e) => setSchedStatus(e.target.value === 'true')}
                    style={{ ...styles.input, color: '#fff' }}
                  >
                    <option value="true" style={{ background: '#1a202c', color: '#fff' }}>TURN ON (চালু হবে)</option>
                    <option value="false" style={{ background: '#1a202c', color: '#fff' }}>TURN OFF (বন্ধ হবে)</option>
                  </select>
                </div>

                <div>
                  <label style={{ color: '#a0aec0', fontSize: '0.85rem', display: 'block', marginBottom: '5px' }}>সময় (Time - 24 Hours)</label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    required
                    style={{ ...styles.input, color: '#fff' }}
                  />
                </div>

                <button type="submit" style={styles.primaryBtn}>শিডিউল সেভ করুন</button>
              </form>
            </div>

            {/* Existing Schedules List */}
            <div style={styles.glassCard}>
              <h3 style={{ color: '#fff', margin: '0 0 1rem 0' }}>সক্রিয় শিডিউল তালিকা</h3>
              {schedules.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {schedules.map((s) => {
                    const dev = devices.find((d) => d.id === s.device_id);
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          border: '1px solid rgba(255,255,255,0.08)'
                        }}
                      >
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{dev ? dev.name : `Device #${s.device_id}`}</h4>
                          <span style={{ fontSize: '0.8rem', color: '#00f2fe' }}>
                            {s.schedule_time} — {s.target_status ? 'TURN ON' : 'TURN OFF'}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteSchedule(s.id)}
                          style={{ ...styles.deleteIconBtn, fontSize: '1rem', color: '#ff6b6b' }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#a0aec0', fontSize: '0.9rem' }}>কোনো সক্রিয় শিডিউল পাওয়া যায়নি।</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Settings View (Theme & Language) */}
        {activeTab === 'settings' && (
          <div style={styles.glassCard}>
            <h3 style={{ color: '#fff', marginBottom: '1.5rem' }}>সিস্টেম সেটিংস</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', color: '#a0aec0', marginBottom: '8px' }}>থিম মোড (Theme Mode)</label>
              <select 
                value={theme} 
                onChange={(e) => setTheme(e.target.value)} 
                style={{ ...styles.input, maxWidth: '300px', color: '#fff' }}
              >
                <option value="dark" style={{ background: '#1a202c', color: '#fff' }}>Dark Theme (Neon Glass)</option>
                <option value="light" style={{ background: '#1a202c', color: '#fff' }}>Light Theme (Classic)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: '#a0aec0', marginBottom: '8px' }}>ভাষা নির্বাচন (Language)</label>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)} 
                style={{ ...styles.input, maxWidth: '300px', color: '#fff' }}
              >
                <option value="bn" style={{ background: '#1a202c', color: '#fff' }}>বাংলা (Bengali)</option>
                <option value="en" style={{ background: '#1a202c', color: '#fff' }}>English</option>
              </select>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// CSS Styles with Sidebar Layout
const styles = {
  appLayout: {
    display: 'flex',
    minHeight: '100vh',
    background: '#0b0f19',
    color: '#fff',
    fontFamily: "'Segoe UI', Roboto, sans-serif",
  },
  sidebar: {
    width: '240px',
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(16px)',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '2rem 1.2rem',
  },
  sidebarLogo: {
    margin: 0,
    fontSize: '1.1rem',
    letterSpacing: '1px',
    color: '#fff',
  },
  navMenu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  navItem: {
    background: 'transparent',
    border: 'none',
    color: '#a0aec0',
    padding: '10px 14px',
    borderRadius: '8px',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    transition: '0.2s',
  },
  mainContent: {
    flex: 1,
    padding: '2rem 2.5rem',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '1.2rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    marginBottom: '2rem',
  },
  logoutBtn: {
    background: 'rgba(255, 71, 87, 0.15)',
    color: '#ff4757',
    border: '1px solid rgba(255, 71, 87, 0.3)',
    padding: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    width: '100%',
    textAlign: 'center',
  },
  authContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0b0f19',
  },
  authCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '16px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '380px',
  },
  authTitle: { color: '#fff', textAlign: 'center', margin: '0 0 1.5rem 0' },
  input: {
    width: '100%',
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    width: '100%',
    padding: '12px',
    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#000',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  statCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '1.2rem',
  },
  glassCard: {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  roomTabs: {
    display: 'flex',
    gap: '10px',
    overflowX: 'auto',
    paddingBottom: '1rem',
    marginBottom: '1.5rem',
  },
  tabBtn: {
    border: 'none',
    padding: '8px 16px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
  },
  deviceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
    gap: '1.5rem',
  },
  deviceCard: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid',
    borderRadius: '14px',
    padding: '1.2rem',
  },
  badge: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#00f2fe',
    fontSize: '0.65rem',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  deleteIconBtn: { background: 'transparent', border: 'none', color: '#718096', cursor: 'pointer' },
  toggleBtn: {
    border: 'none',
    padding: '6px 12px',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
};

export default App;