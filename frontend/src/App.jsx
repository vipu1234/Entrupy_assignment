import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LayoutDashboard, Tag, RefreshCw, X, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const API_BASE = 'http://localhost:8000';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem("API_KEY") || "");

  useEffect(() => {
    if (apiKey) {
      if (activeTab === 'dashboard') fetchStats();
      if (activeTab === 'products') fetchProducts();
    }
  }, [activeTab, apiKey]);

  const authHeader = { headers: { "X-API-KEY": apiKey } };

  const handleRegister = async () => {
    try {
      const res = await axios.post(`${API_BASE}/consumers/register?name=AdminUser${Math.floor(Math.random()*1000)}`);
      setApiKey(res.data.api_key);
      localStorage.setItem("API_KEY", res.data.api_key);
    } catch(e) { console.error(e); }
  }

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`, authHeader);
      setStats(res.data);
    } catch (e) {
      console.error(e);
      if (e.response?.status === 403) {
          localStorage.removeItem("API_KEY");
          setApiKey("");
      }
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/products`, authHeader);
      setProducts(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await axios.post(`${API_BASE}/data/refresh`, {}, authHeader);
      alert(res.data.message);
      if (activeTab === 'dashboard') fetchStats();
      if (activeTab === 'products') fetchProducts();
    } catch (e) {
      console.error(e);
      alert("Error refreshing data");
    }
    setRefreshing(false);
  };

  const viewProduct = async (id) => {
    try {
      const res = await axios.get(`${API_BASE}/products/${id}`, authHeader);
      const chartData = res.data.price_history.map(ph => ({
        timestamp: new Date(ph.timestamp).toLocaleTimeString(),
        price: ph.price
      }));
      setSelectedProduct({ ...res.data, chartData });
    } catch (e) { console.error(e); }
  };

  if (!apiKey) {
      return (
          <div className="app-container" style={{justifyContent: 'center', alignItems: 'center'}}>
              <div className="stat-card" style={{textAlign: 'center', maxWidth: '400px'}}>
                  <h2 style={{marginBottom: '1rem', color: 'var(--accent)'}}>Entrupy Price Monitor</h2>
                  <p style={{marginBottom: '2rem', color: 'var(--text-muted)'}}>
                    Welcome to the competitor price tracking system. Please register a consumer API key to access the dashboard.
                  </p>
                  <button className="btn" style={{width: '100%', justifyContent: 'center'}} onClick={handleRegister}>
                    Connect to API
                  </button>
              </div>
          </div>
      )
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-title">Price Monitor</div>
        <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={20} /> Dashboard
        </div>
        <div className={`nav-item ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
          <Tag size={20} /> Products Catalog
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <h2>{activeTab === 'dashboard' ? 'Overview Stats' : 'Product Directory'}</h2>
          <button className="btn" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={18} />
            {refreshing ? 'Syncing...' : 'Trigger Data Refresh'}
          </button>
        </div>

        {activeTab === 'dashboard' && stats && (
          <div>
            <div className="grid-stats">
              <div className="stat-card">
                <div className="stat-title">Total Products Tracked</div>
                <div className="stat-value">{stats.total_products}</div>
              </div>
            </div>
            
            <h3 style={{marginBottom: '1rem', marginTop: '2rem'}}>Marketplace Breakdown</h3>
            <div className="grid-stats">
              {Object.entries(stats.by_source).map(([source, count]) => (
                <div className="stat-card" key={source}>
                  <div className="stat-title">{source}</div>
                  <div className="stat-value">{count}</div>
                </div>
              ))}
            </div>

            <h3 style={{marginBottom: '1rem', marginTop: '2rem'}}>Average Prices by Category</h3>
            <div className="grid-stats">
              {Object.entries(stats.avg_price_by_category).map(([cat, avg]) => (
                <div className="stat-card" key={cat}>
                  <div className="stat-title">{cat}</div>
                  <div className="stat-value">${avg.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product Title</th>
                  <th>Source</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Current Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                    <tr><td colSpan="6" style={{textAlign: 'center', padding: '2rem'}}>Loading data...</td></tr>
                ) : products.length === 0 ? (
                    <tr><td colSpan="6" style={{textAlign: 'center', padding: '2rem'}}>No products tracked yet. Click "Trigger Data Refresh"</td></tr>
                ) : products.map(p => (
                  <tr key={p.id}>
                    <td style={{fontWeight: '500'}}>{p.title}</td>
                    <td><span className="badge">{p.source}</span></td>
                    <td>{p.category}</td>
                    <td>{p.brand}</td>
                    <td style={{color: 'var(--success)'}}>${p.current_price.toFixed(2)}</td>
                    <td>
                      <button className="btn" style={{padding: '0.25rem 0.75rem', fontSize: '0.875rem'}} onClick={() => viewProduct(p.id)}>
                         <TrendingUp size={16} /> View History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .btn:disabled svg { animation: spin 1s linear infinite; }
      `}</style>

      {selectedProduct && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target.className === 'modal-overlay') setSelectedProduct(null);
        }}>
          <div className="modal-content">
            <button className="close-btn" onClick={() => setSelectedProduct(null)}><X size={24} /></button>
            <h2 style={{marginBottom: '1.5rem', color: 'var(--accent)'}}>{selectedProduct.title}</h2>
            
            <div style={{display: 'flex', gap: '3rem', marginBottom: '2rem'}}>
                <div>
                   <p className="stat-title">Current Price</p>
                   <p className="stat-value" style={{color: 'var(--success)'}}>${selectedProduct.current_price.toFixed(2)}</p>
                </div>
                <div>
                   <p className="stat-title">Platform</p>
                   <p className="stat-value" style={{fontSize: '1.5rem'}}>{selectedProduct.source}</p>
                </div>
                <div>
                   <p className="stat-title">Brand</p>
                   <p className="stat-value" style={{fontSize: '1.5rem'}}>{selectedProduct.brand}</p>
                </div>
            </div>

            <h3 style={{marginBottom: '1rem'}}>Price History</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={selectedProduct.chartData}>
                  <XAxis dataKey="timestamp" stroke="var(--text-muted)" />
                  <YAxis domain={['auto', 'auto']} stroke="var(--text-muted)" tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem' }} 
                    itemStyle={{ color: 'var(--accent)' }}
                  />
                  <Line type="stepAfter" dataKey="price" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <div style={{marginTop: '2rem'}}>
              <h3 style={{marginBottom: '1rem'}}>System Event Log</h3>
              <table style={{fontSize: '0.875rem'}}>
                  <thead>
                      <tr><th>Time</th><th>Recorded Price</th></tr>
                  </thead>
                  <tbody>
                      {selectedProduct.price_history.map(ph => (
                          <tr key={ph.id}>
                              <td>{new Date(ph.timestamp).toLocaleString()}</td>
                              <td>${ph.price.toFixed(2)}</td>
                          </tr>
                      )).reverse()}
                  </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
