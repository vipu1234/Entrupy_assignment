import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, Tag, RefreshCw, X, ArrowUpRight, Sun, Moon, 
  Heart, LineChart as LineChartIcon, Scale, Sparkles, Download, Check, TrendingUp, Search 
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';

const API_BASE = 'http://localhost:8000';

const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem("API_KEY") || "");
  const [theme, setTheme] = useState(localStorage.getItem("theme") || 'dark');

  // SaaS Upgrades State
  const [compareList, setCompareList] = useState([]);
  const [viewedProduct, setViewedProduct] = useState(null);
  const [wishlistOnly, setWishlistOnly] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sortBy, setSortBy] = useState("recent");

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Handle data fetch triggers
  useEffect(() => {
    if (apiKey) {
      if (activeTab === 'dashboard') fetchStats();
      if (activeTab === 'products') fetchProducts();
    }
  }, [activeTab, apiKey, filterSource, filterCategory, sortBy, wishlistOnly]);

  useEffect(() => {
     if(activeTab === 'products') {
         const delay = setTimeout(() => { fetchProducts() }, 500);
         return () => clearTimeout(delay);
     }
  }, [searchQuery]);

  const authHeader = { headers: { "X-API-KEY": apiKey } };

  const handleRegister = async () => {
    try {
      const res = await axios.post(`${API_BASE}/consumers/register?name=SaaSOwner${Math.floor(Math.random()*1000)}`);
      setApiKey(res.data.api_key);
      localStorage.setItem("API_KEY", res.data.api_key);
    } catch(e) { console.error(e); }
  }

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/stats`, authHeader);
      setStats(res.data);
    } catch (e) {
      if (e.response?.status === 403) {
          localStorage.removeItem("API_KEY");
          setApiKey("");
      }
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    let url = `${API_BASE}/products?sort_by=${sortBy}&wishlist=${wishlistOnly}`;
    if(searchQuery) url += `&search=${searchQuery}`;
    if(filterSource) url += `&source=${filterSource}`;
    if(filterCategory) url += `&category=${filterCategory}`;
    try {
      const res = await axios.get(url, authHeader);
      setProducts(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await axios.post(`${API_BASE}/data/refresh`, {}, authHeader);
      setTimeout(() => {
         if (activeTab === 'dashboard') fetchStats();
         if (activeTab === 'products') fetchProducts();
         setRefreshing(false);
      }, 1500);
    } catch (e) {
      setRefreshing(false);
      alert("Error synchronizing with data mesh.");
    }
  };

  const toggleWishlist = async (e, productId) => {
    e.stopPropagation();
    try {
      await axios.post(`${API_BASE}/wishlist/${productId}`, {}, authHeader);
      fetchProducts(); // refresh to show updated heart state
    } catch (e) { console.error(e); }
  };

  const toggleCompare = (e, product) => {
    e.stopPropagation();
    if (compareList.find(c => c.id === product.id)) {
      setCompareList(compareList.filter(c => c.id !== product.id));
    } else {
      if (compareList.length < 3) setCompareList([...compareList, product]);
      else alert("You can only compare up to 3 objects at a time.");
    }
  };

  const openProductDetail = async (product) => {
      try {
          const res = await axios.get(`${API_BASE}/products/${product.id}`, authHeader);
          const chartData = res.data.price_history.map(ph => ({
            time: new Date(ph.timestamp).toLocaleDateString(),
            price: ph.price
          })).reverse();
          setViewedProduct({ ...res.data, chartData, ai_prediction: product.ai_prediction, ai_sentiment: product.ai_sentiment, is_wishlisted: product.is_wishlisted });
      } catch (e) { console.error(e); }
  };

  const downloadCSV = () => {
      let csvContent = "data:text/csv;charset=utf-8,ID,Title,Brand,Category,Source,Price\n";
      products.forEach(p => {
          csvContent += `${p.id},"${p.title}","${p.brand}","${p.category}","${p.source}",${p.current_price}\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "competitor_export.csv");
      document.body.appendChild(link);
      link.click();
  };

  if (!apiKey) {
      return (
          <div className="app-container" style={{justifyContent: 'center', alignItems: 'center'}}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card" style={{textAlign: 'center', maxWidth: '400px'}}>
              <h2 style={{marginBottom: '1rem', background: 'linear-gradient(45deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>Entrupy Enterprise</h2>
              <p style={{marginBottom: '2rem', color: 'var(--text-muted)'}}>AI-driven competitor pricing platform.</p>
              <button className="btn primary" style={{width: '100%', justifyContent: 'center', padding: '1rem'}} onClick={handleRegister}>
                Authenticate Workstation
              </button>
            </motion.div>
          </div>
      )
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <div className="sidebar" style={{justifyContent: 'space-between'}}>
        <div>
          <div className="sidebar-title">Entrupy SaaS</div>
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard size={18} /> Global Analytics
          </div>
          <div className={`nav-item ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
            <Tag size={18} /> Market Explorer
          </div>
          <div className={`nav-item ${wishlistOnly ? 'active' : ''}`} onClick={() => { setActiveTab('products'); setWishlistOnly(!wishlistOnly); }}>
            <Heart size={18} color={wishlistOnly ? "var(--danger)" : "currentColor"} /> Saved Items
          </div>
        </div>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
            <div className="glass-card" style={{padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <div style={{width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success)'}}></div>
                <div style={{fontSize: '0.75rem', fontWeight: 'bold'}}>System Operational</div>
            </div>
            <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{width: '100%', justifyContent: 'center'}}>
               {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>} Theme
            </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="main-content">
        <div className="header">
          <div>
              <h2 style={{fontSize: '1.75rem', fontWeight: '800'}}>{activeTab === 'dashboard' ? 'Intelligence Hub' : 'Explorer'}</h2>
              <p style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>
                  {activeTab === 'dashboard' ? 'AI-powered metric overview.' : 'Identify opportunities in real-time.'}
              </p>
          </div>
          <div style={{display: 'flex', gap: '1rem'}}>
              {activeTab === 'products' && (
                  <button className="btn" onClick={downloadCSV}>
                      <Download size={16} /> Export CSV
                  </button>
              )}
              <button className="btn primary" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? 'spin' : ''} style={refreshing ? {animation: 'spin 1s linear infinite'} : {}} />
                {refreshing ? 'Poling Webhooks...' : 'Trigger Global Refresh'}
              </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && stats && (
          <motion.div key="dash" initial="hidden" animate="visible" exit="exit" variants={variants} transition={{duration: 0.3}}>
            <div className="grid-stats">
              <div className="glass-card">
                <div className="stat-title">Total Tracked</div>
                <div className="stat-value">{stats.total_products.toLocaleString()}</div>
              </div>
              <div className="glass-card" style={{background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))'}}>
                <div className="stat-title">SaaS Active Monitors</div>
                <div className="stat-value">{Object.keys(stats.by_source).length}</div>
                <div style={{marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)'}}><Sparkles size={12} style={{display:'inline', marginRight: '4px'}}/> Auto-scaling enabled</div>
              </div>
            </div>
            
            <h3 style={{marginBottom: '1.5rem', marginTop: '3rem', fontWeight: '700'}}>Category Index Trajectory</h3>
            <div className="glass-card" style={{height: '400px', padding: '1rem'}}>
               <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.category_trends}>
                    <defs>
                      <linearGradient id="colorBags" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorShoes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--success)" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val)=>`$${val}`} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border)', backdropFilter: 'blur(10px)' }}/>
                    <Area type="monotone" dataKey="Bags" stroke="var(--accent)" fillOpacity={1} fill="url(#colorBags)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Shoes" stroke="var(--success)" fillOpacity={1} fill="url(#colorShoes)" strokeWidth={2} />
                  </AreaChart>
               </ResponsiveContainer>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '3rem' }}>
                <div>
                   <h3 style={{marginBottom: '1rem', fontWeight: '600'}}>Marketplace Index Volume</h3>
                    <div className="grid-stats" style={{gridTemplateColumns:'1fr'}}>
                      {Object.entries(stats.by_source).map(([source, count], i) => (
                        <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} transition={{delay: i*0.1}} className="glass-card" key={source} style={{padding: '1.25rem'}}>
                          <div className="stat-title" style={{fontSize: '0.875rem'}}>{source}</div>
                          <div style={{fontSize: '1.75rem', fontWeight:'800', letterSpacing: '-0.02em'}}>{count} Indexed Products</div>
                        </motion.div>
                      ))}
                    </div>
                </div>
                <div>
                   <h3 style={{marginBottom: '1rem', fontWeight: '600'}}>Average Asset Valuations</h3>
                   <div className="grid-stats" style={{gridTemplateColumns:'1fr'}}>
                      {Object.entries(stats.avg_price_by_category).map(([cat, avg], i) => (
                        <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay: i*0.1}} className="glass-card" key={cat} style={{padding: '1.25rem'}}>
                          <div className="stat-title" style={{fontSize: '0.875rem'}}>{cat} <TrendingUp size={14} color="var(--success)"/></div>
                          <div style={{fontSize: '1.75rem', fontWeight:'800', letterSpacing: '-0.02em'}}>${parseFloat(avg).toFixed(2)}</div>
                        </motion.div>
                      ))}
                    </div>
                </div>
            </div>
          </motion.div>
        )}

        {/* PRODUCTS TAB */}
        {activeTab === 'products' && (
          <motion.div key="prod" initial="hidden" animate="visible" exit="exit" variants={variants} transition={{duration: 0.3}}>
            <div className="filter-bar">
               <div style={{flex: 1, position: 'relative'}}>
                  <Search size={16} style={{position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)'}} />
                  <input type="text" className="input-field" placeholder="Query models, brands..." style={{width: '100%', paddingLeft: '2.5rem'}} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
               </div>
               <select className="select-field" value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                   <option value="">Global Marketplaces</option>
                   <option value="Grailed">Grailed</option>
                   <option value="Fashionphile">Fashionphile</option>
                   <option value="1stdibs">1stdibs</option>
               </select>
               <select className="select-field" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                   <option value="">All Categories</option>
                   <option value="Bags">Bags</option>
                   <option value="Shoes">Shoes</option>
                   <option value="Accessories">Accessories</option>
               </select>
               <select className="select-field" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                   <option value="recent">Sort: Just updated</option>
                   <option value="lowest_price">Price: Low to High</option>
                   <option value="highest_price">Price: High to Low</option>
               </select>
            </div>

            <div className="product-grid">
               {loading ? Array(8).fill(0).map((_, i) => (
                   <div key={i} className="glass-card skeleton" style={{height: '240px'}}></div>
               )) : products.map((p, i) => {
                   const isComparing = compareList.find(c => c.id === p.id);
                   return (
                   <motion.div onClick={() => openProductDetail(p)} initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay: i * 0.05}} className="glass-card product-card" key={p.id}>
                       <div className="product-header">
                           <span className="badge neutral" style={{fontSize: '0.65rem'}}>{p.source}</span>
                           <div style={{display: 'flex', gap: '0.5rem'}}>
                               <button className="icon-btn" style={{background: 'transparent', border: 'none', cursor: 'pointer'}} onClick={(e)=>toggleWishlist(e, p.id)}>
                                   <Heart size={18} fill={p.is_wishlisted ? "var(--danger)" : "none"} color={p.is_wishlisted ? "var(--danger)" : "var(--text-muted)"} />
                               </button>
                               <button className="icon-btn" style={{background: isComparing ? 'var(--accent)' : 'var(--bg-card)', border: `1px solid ${isComparing ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '4px', cursor: 'pointer', padding: '0.25rem'}} onClick={(e) => toggleCompare(e, p)}>
                                    <Scale size={16} color={isComparing ? '#fff' : 'var(--text-muted)'} />
                               </button>
                           </div>
                       </div>
                       <h4 style={{fontSize: '1.25rem', fontWeight: '800', marginBottom: '0.25rem'}}>{p.brand}</h4>
                       <p style={{color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{p.title}</p>
                       
                       {/* AI Pricing Badge */}
                       <div style={{marginBottom: '1rem'}}>
                           <span className={`badge ${p.ai_sentiment === 'BUY' ? 'up' : p.ai_sentiment === 'WAIT' ? 'down' : 'neutral'}`} style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}>
                               <Sparkles size={12}/> {p.ai_sentiment}
                           </span>
                       </div>

                       <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
                           <div style={{fontSize: '1.75rem', fontWeight: '800', color: 'var(--text-main)'}}>${p.current_price.toLocaleString()}</div>
                           <ArrowUpRight size={20} color="var(--text-muted)" />
                       </div>
                   </motion.div>
               )})}
               {!loading && products.length === 0 && (
                   <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '5rem', color: 'var(--text-muted)'}}>End of results. Modify your queries or trigger a global refresh.</div>
               )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Compare Dock */}
      <AnimatePresence>
          {compareList.length > 0 && (
              <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} 
                style={{
                  position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', 
                  backgroundColor: 'var(--bg-card)', backdropFilter: 'blur(20px)', border: '1px solid var(--border)', 
                  padding: '1rem', borderRadius: '1rem', display: 'flex', gap: '2rem', alignItems: 'center',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', zIndex: 100
              }}>
                 <div style={{display: 'flex', gap: '1rem'}}>
                     {compareList.map(c => (
                         <div key={c.id} style={{padding: '0.5rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem', position: 'relative'}}>
                             <div style={{fontSize: '0.75rem', color: 'var(--text-muted)'}}>{c.brand}</div>
                             <div style={{fontWeight: 'bold'}}>${c.current_price.toLocaleString()}</div>
                             <button onClick={()=>toggleCompare({stopPropagation:()=>{}}, c)} style={{position: 'absolute', top: '-8px', right: '-8px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={10} /></button>
                         </div>
                     ))}
                 </div>
                 <button className="btn primary" onClick={() => {}}>Launch Comparator vs {compareList.length}</button>
              </motion.div>
          )}
      </AnimatePresence>

      {/* Product Detail Modal */}
      <AnimatePresence>
          {viewedProduct && (
              <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} 
                  style={{position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'}}
                  onClick={(e) => { if(e.target === e.currentTarget) setViewedProduct(null); }}>
                  
                  <motion.div initial={{y: 50, scale: 0.95}} animate={{y: 0, scale: 1}} exit={{y: 20, scale: 0.95}}
                      style={{background: 'var(--bg)', border: '1px solid var(--border)', width: '100%', maxWidth: '900px', borderRadius: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh'}}>
                      
                      <div style={{padding: '2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                          <div>
                              <div style={{display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem'}}>
                                  <span className="badge neutral">{viewedProduct.source}</span>
                                  <span className="badge neutral">{viewedProduct.category}</span>
                              </div>
                              <h2 style={{fontSize: '2rem', fontWeight: '800'}}>{viewedProduct.brand}</h2>
                              <p style={{color: 'var(--text-muted)'}}>{viewedProduct.title}</p>
                          </div>
                          <button onClick={()=>setViewedProduct(null)} style={{background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)'}}>
                              <X size={20} />
                          </button>
                      </div>

                      <div style={{padding: '2rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem'}}>
                          
                          {/* AI Insight Box */}
                          <div style={{background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))', padding: '1.5rem', borderLeft: '4px solid var(--accent)', borderRadius: '0.5rem'}}>
                              <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold'}}>
                                  <Sparkles size={16} color="var(--accent)" /> Entrupy AI Insight
                              </div>
                              <p style={{fontSize: '0.875rem', color: 'var(--text-main)'}}>{viewedProduct.ai_prediction}</p>
                          </div>

                          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                              <div>
                                  <div style={{color: 'var(--text-muted)', fontSize: '0.875rem'}}>Current Valuation</div>
                                  <div style={{fontSize: '3rem', fontWeight: '800', letterSpacing: '-0.02em'}}>${viewedProduct.current_price.toLocaleString()}</div>
                              </div>
                              <div style={{display: 'flex', gap: '1rem'}}>
                                  <button className="btn" onClick={(e) => {toggleWishlist(e, viewedProduct.id); setViewedProduct({...viewedProduct, is_wishlisted: !viewedProduct.is_wishlisted})}}>
                                      <Heart size={16} fill={viewedProduct.is_wishlisted ? "var(--danger)" : "none"} color={viewedProduct.is_wishlisted ? "var(--danger)" : "currentColor"} /> 
                                      {viewedProduct.is_wishlisted ? "Saved" : "Save to Tracker"}
                                  </button>
                                  <button className="btn primary">Secure Purchase ↗</button>
                              </div>
                          </div>

                          <div>
                              <h3 style={{marginBottom: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                                  <LineChartIcon size={18} /> Asset Price Trajectory
                              </h3>
                              <div style={{height: '300px', width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem'}}>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={viewedProduct.chartData}>
                                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={val=>`$${val}`} domain={['dataMin - 100', 'dataMax + 100']} />
                                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }} />
                                      <Line type="stepAfter" dataKey="price" stroke="var(--accent)" strokeWidth={3} dot={{r: 4}} activeDot={{r: 8}} />
                                    </LineChart>
                                  </ResponsiveContainer>
                              </div>
                          </div>

                      </div>
                  </motion.div>
              </motion.div>
          )}
      </AnimatePresence>

    </div>
  );
}

export default App;
