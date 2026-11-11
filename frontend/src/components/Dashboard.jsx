import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import axios from 'axios';

export default function Dashboard({ session }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const API_URL = 'http://localhost:8000/api';

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await axios.get(`${API_URL}/devices`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setDevices(res.data);
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
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
      console.error('Error toggling device:', err);
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut();
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Smart Home Dashboard</h2>
        <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px' }}>
          Logout
        </button>
      </div>
      <hr />
      <h3>Connected Devices</h3>
      {loading ? (
        <p>Loading devices...</p>
      ) : devices.length === 0 ? (
        <p>No devices found. Add some devices in the backend database!</p>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '20px' }}>
          {devices.map((device) => (
            <div
              key={device.id}
              style={{
                border: '1px solid #ccc',
                padding: '1rem',
                borderRadius: '8px',
                minWidth: '180px',
                background: '#f9f9f9'
              }}
            >
              <h4>{device.name}</h4>
              <p>Type: {device.device_type}</p>
              <p>Status: <strong style={{ color: device.status ? 'green' : 'red' }}>{device.status ? 'ON' : 'OFF'}</strong></p>
              <button 
                onClick={() => toggleDevice(device.id, device.status)}
                style={{ padding: '6px 12px', background: device.status ? '#ffc107' : '#28a745', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {device.status ? 'Turn OFF' : 'Turn ON'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}