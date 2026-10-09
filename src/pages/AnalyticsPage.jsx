import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, 
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart as RechartsBarChart
} from 'recharts';
import api from '../utils/api';
import CustomModal from '../components/CustomModal';
import './AnalyticsPage.css';

// SVG for ArrowUpRight
const ArrowUpRight = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17l9.2-9.2M17 17V7H7"/>
  </svg>
);

const FilterIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
  </svg>
);

// Mock Data for the charts
const weeklyData = [
  { name: 'Sun', uploaded: 750, generated: 850, trend: 700 },
  { name: 'Mon', uploaded: 600, generated: 650, trend: 500 },
  { name: 'Tue', uploaded: 1200, generated: 850, trend: 750 },
  { name: 'Wed', uploaded: 750, generated: 550, trend: 400 },
  { name: 'Thu', uploaded: 1400, generated: 1100, trend: 900 },
  { name: 'Fri', uploaded: 1250, generated: 950, trend: 900 },
  { name: 'Sat', uploaded: 1300, generated: 900, trend: 750 },
  { name: 'Sun', uploaded: 1150, generated: 950, trend: 900 },
];

const pieData = [
  { name: 'COM4', value: 45 },
  { name: 'COM7', value: 30 },
  { name: 'COM9', value: 25 },
];
const COLORS = ['#3b82f6', '#2dd4bf', '#e2e8f0']; // Blue, Teal, Light Gray

const barData = [
  { name: '.csv', value: 85, fill: '#3b82f6' },
  { name: '.xlsx', value: 52, fill: '#2dd4bf' },
  { name: '.nav', value: 35, fill: '#2dd4bf' },
  { name: '.mts', value: 22, fill: '#2dd4bf' },
  { name: '.csv', value: 12, fill: '#2dd4bf' },
  { name: '.xlsx', value: 8, fill: '#2dd4bf' }
];

// Sparklines and badges will be dynamically calculated below

export default function AnalyticsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [intervalFilter, setIntervalFilter] = useState('weekly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        let url = `/reports/stats?interval=${intervalFilter}`;
        if (intervalFilter === 'custom' && customStart && customEnd) {
           url += `&startDate=${customStart}&endDate=${customEnd}`;
        }
        const res = await api.get(url);
        setStats(res.data);
      } catch (err) {
        console.error('Failed to fetch analytics', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [intervalFilter, customStart, customEnd]);

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="spinner-border"></div>
        <p>Loading Analytics...</p>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <div className="analytics-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Analytics Dashboard</h2>
        <div style={{ position: 'relative', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              style={{ 
                display: 'flex', gap: '8px', alignItems: 'center',
                background: '#3b82f6', color: '#ffffff', border: 'none', 
                padding: '8px 16px', borderRadius: '8px', fontWeight: '600', 
                cursor: 'pointer', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
              }}
            >
              <FilterIcon size={16} /> Filter
            </button>

            {showFilterMenu && (
                <div style={{ 
                    position: 'absolute', 
                    top: 'calc(100% + 8px)', 
                    right: 0, 
                    background: 'var(--bg-secondary)', 
                    border: '1px solid var(--border-color)', 
                    padding: '16px', 
                    borderRadius: '12px', 
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)', 
                    zIndex: 100, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px',
                    minWidth: '220px'
                }}>
                    <h4 style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>Time Range</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {['daily', 'weekly', 'monthly', 'custom'].map(opt => (
                            <div 
                              key={opt}
                              onClick={() => {
                                  if (opt === 'custom') {
                                      setShowFilterMenu(false);
                                      setShowCustomModal(true);
                                  } else {
                                      setIntervalFilter(opt);
                                      setShowFilterMenu(false);
                                  }
                              }}
                              style={{
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  background: intervalFilter === opt ? 'rgba(59,130,246,0.1)' : 'transparent',
                                  color: intervalFilter === opt ? '#3b82f6' : 'var(--text-primary)',
                                  fontWeight: intervalFilter === opt ? '600' : '500',
                                  textTransform: 'capitalize'
                              }}
                            >
                                {opt}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Top KPI Cards */}
      <div className="analytics-kpi-row">
        {/* Total Uploaded Files Card */}
        <div className="kpi-chart-card">
          <div className="kpi-chart-header">
            <span className="kpi-title">Total Uploaded Files</span>
            <span className="kpi-badge">
              <ArrowUpRight size={14} /> {(stats?.uploadGrowthPercentage ?? 0) > 0 ? '+' : ''}{stats?.uploadGrowthPercentage ?? 0}%
            </span>
          </div>
          <div className="kpi-chart-content">
            <div className="kpi-number">
              {(stats?.totalFilesUploaded ?? 0).toLocaleString()} 
              <span className="kpi-unit">files</span>
            </div>
            <div className="kpi-sparkline">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.weeklyTrend?.map(t => ({ value: t.uploaded })) || []}>
                  <defs>
                    <linearGradient id="colorValue1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorValue1)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Reports Generated Card */}
        <div className="kpi-chart-card">
          <div className="kpi-chart-header">
            <span className="kpi-title">Reports Generated</span>
            <span className="kpi-badge badge-teal">
              <span style={{ fontSize: '10px', marginRight: '4px' }}>●</span> {stats?.yieldPercentage ?? 0}%
            </span>
          </div>
          <div className="kpi-chart-content">
            <div className="kpi-number">
              {(stats?.totalReports ?? 0).toLocaleString()} 
              <span className="kpi-unit">reports</span>
            </div>
            <div className="kpi-sparkline">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.weeklyTrend?.map(t => ({ value: t.generated })) || []}>
                  <defs>
                    <linearGradient id="colorValue2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2} fillOpacity={1} fill="url(#colorValue2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="analytics-main-row">
        {/* Trend Analysis */}
        <div className="chart-panel">
          <div className="chart-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Trend Analysis</h3>
          </div>
          <div className="chart-wrapper">
            
            <CustomModal
              isOpen={showCustomModal}
              title="Select Custom Range"
              message="Choose the exact start and end dates to filter your trend analysis."
              confirmText="Apply Range"
              maxWidth="320px"
              onConfirm={() => {
                  setShowCustomModal(false);
                  setIntervalFilter('custom');
              }}
              onCancel={() => setShowCustomModal(false)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', marginTop: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Start Date</label>
                      <input 
                        type="date" 
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        style={{ 
                          width: '100%', padding: '10px 14px', borderRadius: '8px', 
                          background: 'var(--bg-primary)', border: '1px solid var(--border-color)', 
                          color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' 
                        }}
                      />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>End Date</label>
                      <input 
                        type="date" 
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        style={{ 
                          width: '100%', padding: '10px 14px', borderRadius: '8px', 
                          background: 'var(--bg-primary)', border: '1px solid var(--border-color)', 
                          color: 'var(--text-primary)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' 
                        }}
                      />
                  </div>
              </div>
            </CustomModal>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats?.weeklyTrend || []} margin={{ top: 20, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip cursor={{ fill: 'var(--table-hover)' }} contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                <Bar yAxisId="left" dataKey="uploaded" fill="#3b82f6" barSize={16} radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="generated" fill="#2dd4bf" barSize={16} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="trend" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 4, fill: '#2dd4bf', strokeWidth: 0 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend" style={{ justifyContent: 'center', marginTop: '8px' }}>
            <span className="legend-item"><span className="legend-dot bg-blue"></span> Uploaded Files</span>
            <span className="legend-item"><span className="legend-dot bg-teal"></span> Generated Reports</span>
          </div>
        </div>

        {/* Model Distribution */}
        <div className="chart-panel">
          <div className="chart-panel-header">
            <h3>Model Distribution</h3>
          </div>
          <div className="chart-container split-chart">
            <div className="pie-section">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.modelDistribution || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {(stats?.modelDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="pie-labels" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                 <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Models</span>
              </div>
            </div>

            <div className="bar-section">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  layout="vertical"
                  data={stats?.modelDistribution || []}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} width={80} />
                  <Tooltip cursor={{ fill: 'var(--table-hover)' }} contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }} />
                  <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]}>
                    {(stats?.modelDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

