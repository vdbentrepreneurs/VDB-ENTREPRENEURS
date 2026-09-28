import React, { useState, useEffect, useRef } from 'react';
import { BarChart3, Download, Phone, Mail, Calendar, CalendarDays, CalendarRange, Clock, ChevronDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import html2pdf from 'html2pdf.js';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { auth, db } from './firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function Reports() {
  const [bills, setBills] = useState([]);
  const [credits, setCredits] = useState([]);
  const [debts, setDebts] = useState([]);
  const [timeFilter, setTimeFilter] = useState('weekly');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [chartData, setChartData] = useState([]);
  const [rawStats, setRawStats] = useState({
    expenses: { max: 0, min: 0, avg: 0 },
    credit: { max: 0, min: 0, avg: 0 }
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filterOptions = [
    { value: 'daily', label: 'Daily (Last 7 Days)', icon: <CalendarDays size={16} /> },
    { value: 'weekly', label: 'Weekly (This Month)', icon: <Calendar size={16} /> },
    { value: 'monthly', label: 'Monthly (This Year)', icon: <CalendarRange size={16} /> },
    { value: 'yearly', label: 'Yearly (Last 5 Years)', icon: <Clock size={16} /> }
  ];

  useEffect(() => {
    const qBills = query(collection(db, 'bills'));
    const unsubBills = onSnapshot(qBills, (snapshot) => {
      const b = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.date) {
          b.push(data);
        }
      });
      setBills(b);
    });

    const qCredits = query(collection(db, 'credits'));
    const unsubCredits = onSnapshot(qCredits, (snapshot) => {
      const c = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const fullHistory = data.history || [];
        let historySum = fullHistory.reduce((sum, tx) => sum + Number(tx.amount), 0);
        let historyToUse = fullHistory;
        
        if (historySum < Number(data.amount)) {
          const initialAmount = Number(data.amount) - historySum;
          historyToUse = [
            { amount: initialAmount, date: data.date },
            ...fullHistory
          ];
        }

        historyToUse.forEach(tx => {
          if (tx.date) c.push({ amount: tx.amount, date: tx.date });
        });
      });
      setCredits(c);
    });

    const qDebts = query(collection(db, 'debts'));
    const unsubDebts = onSnapshot(qDebts, (snapshot) => {
      const d = [];
      snapshot.forEach(doc => {
        d.push({ id: doc.id, ...doc.data() });
      });
      setDebts(d);
    });

    return () => {
      unsubBills();
      unsubCredits();
      unsubDebts();
    };
  }, []);

  useEffect(() => {
    let newData = [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const parseDateStr = (dateStr) => {
      if (!dateStr) return { year: 0, month: 0, day: 0 };
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return { year: Number(parts[0]), month: Number(parts[1]) - 1, day: Number(parts[2]) };
      }
      const d = new Date(dateStr);
      return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
    };

    const rawExpenses = [];
    const rawCredits = [];

    if (timeFilter === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        newData.push({
          name: d.toLocaleDateString('en-US', { weekday: 'short' }),
          dateStr: dateStr,
          expenses: 0,
          credit: 0
        });
      }
      
      const process = (item, type, rawArr) => {
        if (!item.date) return;
        const dayObj = newData.find(d => d.dateStr === item.date);
        if (dayObj) {
          const amt = Number(item.amount) || 0;
          dayObj[type] += amt;
          rawArr.push(amt);
        }
      };
      
      bills.forEach(b => process(b, 'expenses', rawExpenses));
      credits.forEach(c => process(c, 'credit', rawCredits));
    } 
    else if (timeFilter === 'weekly') {
      newData = [
        { name: 'Week 1', expenses: 0, credit: 0 },
        { name: 'Week 2', expenses: 0, credit: 0 },
        { name: 'Week 3', expenses: 0, credit: 0 },
        { name: 'Week 4', expenses: 0, credit: 0 },
      ];
      const getWeekOfMonth = (day) => {
        if (day <= 7) return 0;
        if (day <= 14) return 1;
        if (day <= 21) return 2;
        return 3;
      };
      const process = (item, type, rawArr) => {
        const { year, month, day } = parseDateStr(item.date);
        if (month === currentMonth && year === currentYear) {
          const amt = Number(item.amount) || 0;
          newData[getWeekOfMonth(day)][type] += amt;
          rawArr.push(amt);
        }
      };
      bills.forEach(b => process(b, 'expenses', rawExpenses));
      credits.forEach(c => process(c, 'credit', rawCredits));
    }
    else if (timeFilter === 'monthly') {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      newData = monthNames.map(m => ({ name: m, expenses: 0, credit: 0 }));
      
      const process = (item, type, rawArr) => {
        const { year, month } = parseDateStr(item.date);
        if (year === currentYear) {
          const amt = Number(item.amount) || 0;
          newData[month][type] += amt;
          rawArr.push(amt);
        }
      };
      bills.forEach(b => process(b, 'expenses', rawExpenses));
      credits.forEach(c => process(c, 'credit', rawCredits));
    }
    else if (timeFilter === 'yearly') {
      for (let i = 4; i >= 0; i--) {
        newData.push({
          name: `${currentYear - i}`,
          year: currentYear - i,
          expenses: 0,
          credit: 0
        });
      }
      const process = (item, type, rawArr) => {
        const { year } = parseDateStr(item.date);
        const yearObj = newData.find(y => y.year === year);
        if (yearObj) {
          const amt = Number(item.amount) || 0;
          yearObj[type] += amt;
          rawArr.push(amt);
        }
      };
      bills.forEach(b => process(b, 'expenses', rawExpenses));
      credits.forEach(c => process(c, 'credit', rawCredits));
    }
    
    setChartData(newData);

    const calc = (arr) => {
      if (arr.length === 0) return { max: 0, min: 0, avg: 0 };
      return {
        max: Math.max(...arr),
        min: Math.min(...arr),
        avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      };
    };

    setRawStats({
      expenses: calc(rawExpenses),
      credit: calc(rawCredits)
    });
  }, [bills, credits, timeFilter]);

  const totalExpenses = chartData.reduce((sum, item) => sum + item.expenses, 0);
  const totalCredit = chartData.reduce((sum, item) => sum + item.credit, 0);

  const expStats = rawStats.expenses;
  const credStats = rawStats.credit;

  const handleDownloadPdf = () => {
    const element = document.getElementById('reports-content');
    
    // Store original styles to restore later
    const originalBodyWidth = document.body.style.width;
    const originalStyles = {
      width: element.style.width,
      margin: element.style.margin,
      padding: element.style.padding
    };
    
    // To get a perfect full-page width on mobile without clipping, we temporarily 
    // widen the entire body to a desktop width.
    document.body.style.width = '800px';
    
    // A4 width minus 10mm margins leaves exactly ~718px of printable space! 
    // We set this to exactly 718px to maximize space and keep it perfectly dead-center.
    element.style.width = '718px';
    element.style.margin = '0 auto';
    element.style.padding = '10px';

    const pdfOnlyElements = element.querySelectorAll('.pdf-only');
    pdfOnlyElements.forEach(el => el.style.display = 'block');

    const opt = {
      margin: [10, 10, 10, 10], 
      filename: `Sales_Report_${timeFilter}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { scale: 2, windowWidth: 800, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };
    
    // Wait for Recharts to update its SVG to the 750px layout before taking the picture
    setTimeout(() => {
      const pdfGenerator = html2pdf().set(opt).from(element);
      
      if (Capacitor.isNativePlatform()) {
        pdfGenerator.outputPdf('datauristring').then(async (pdfBase64Uri) => {
          // Restore everything back to normal immediately
          pdfOnlyElements.forEach(el => el.style.display = 'none');
          Object.assign(element.style, originalStyles);
          document.body.style.width = originalBodyWidth;
          
          try {
            const base64Data = pdfBase64Uri.split(',')[1];
            const fileName = `Sales_Report_${timeFilter}_${Date.now()}.pdf`;
            
            const result = await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Documents
            });
            
            // Trigger native "Open With / Share" dialog
            await Share.share({
              title: 'Sales Report',
              text: 'Here is the exported Sales Report.',
              url: result.uri,
              dialogTitle: 'Open or Share PDF'
            });
          } catch (error) {
            console.error('Filesystem error:', error);
            alert(`Could not save PDF: ${error.message}`);
          }
        });
      } else {
        pdfGenerator.save().then(() => {
          // Restore everything back to normal
          pdfOnlyElements.forEach(el => el.style.display = 'none');
          Object.assign(element.style, originalStyles);
          document.body.style.width = originalBodyWidth;
        });
      }
    }, 500);
  };

  return (
    <div className="dashboard-container">
      <h2 className="section-title">Reports & Graphs</h2>
      
      <div className="activity-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 className="sub-title" style={{ margin: 0 }}>Filter Data</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div className="custom-dropdown" ref={dropdownRef} style={{ position: 'relative', width: '195px' }}>
              <div 
                className="form-input" 
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', backgroundColor: 'var(--surface)', borderColor: isDropdownOpen ? 'var(--primary-color)' : 'var(--border-color)' }}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  {filterOptions.find(o => o.value === timeFilter)?.icon}
                  <span style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{filterOptions.find(o => o.value === timeFilter)?.label}</span>
                </div>
                <ChevronDown size={16} style={{ transition: 'transform 0.2s', transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0)', flexShrink: 0 }} />
              </div>

              {isDropdownOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', backgroundColor: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden' }}>
                  {filterOptions.map(option => (
                    <div 
                      key={option.value}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', backgroundColor: timeFilter === option.value ? 'var(--primary-light)' : 'transparent', color: timeFilter === option.value ? 'var(--primary-color)' : 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}
                      onClick={() => {
                        setTimeFilter(option.value);
                        setIsDropdownOpen(false);
                      }}
                    >
                      {option.icon}
                      <span style={{ fontSize: '0.95rem', fontWeight: timeFilter === option.value ? '600' : '400' }}>{option.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button 
              onClick={handleDownloadPdf}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500', whiteSpace: 'nowrap' }}
            >
              <Download size={16} />
              Export PDF
            </button>
          </div>
        </div>
      </div>

      <div id="reports-content">
        {/* PDF Branding (Hidden on screen, visible in PDF) */}
        <div className="pdf-only" style={{ display: 'none', marginBottom: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', borderBottom: '2px solid rgba(0,0,0,0.05)', paddingBottom: '20px' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '100px', height: '100px', objectFit: 'contain' }} />
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ margin: '0 0 8px 0', color: '#0ea5e9', fontSize: '22px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                Vana Durga Bhavani Entrepreneurs
              </h1>
              <p style={{ margin: 0, color: '#000', fontSize: '18px' }}>
                Proprietor: N. SATHISH KUMAR APPA
              </p>
              <div style={{ display: 'flex', gap: '24px', marginTop: '12px', fontSize: '13px', color: '#000', lineHeight: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} color="#0ea5e9" />
                  <div><strong style={{ color: '#0ea5e9' }}>Phone:</strong> 9676680023, 9646342565</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={14} color="#0ea5e9" />
                  <div><strong style={{ color: '#0ea5e9' }}>Email:</strong> vdbentrepreneurs@gmail.com</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses Section */}
        <div className="activity-list" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 className="sub-title" style={{ color: 'var(--danger)', margin: 0 }}>Bills</h3>
          <span className="pdf-only" style={{ display: 'none', color: '#000', fontSize: '15px', fontWeight: '600' }}>
            Sales Report ({timeFilter.charAt(0).toUpperCase() + timeFilter.slice(1)}) — {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
        
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '16px', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--danger)', fontWeight: '600' }}>Total Bills</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', marginTop: '4px' }}>₹{totalExpenses.toLocaleString('en-IN')}</div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
             <div style={{ flex: 1, minWidth: '80px', backgroundColor: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500' }}>Max</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>₹{expStats.max.toLocaleString('en-IN')}</div>
             </div>
             <div style={{ flex: 1, minWidth: '80px', backgroundColor: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500' }}>Min</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>₹{expStats.min.toLocaleString('en-IN')}</div>
             </div>
             <div style={{ flex: 1, minWidth: '80px', backgroundColor: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500' }}>Average</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>₹{expStats.avg.toLocaleString('en-IN')}</div>
             </div>
          </div>
        </div>

        <div style={{ height: '140px', width: '100%', marginTop: '24px' }}>
          <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} style={{ outline: 'none' }}>
              <defs>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
              <YAxis width={80} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`} />
              <Tooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="expenses" stroke="var(--danger)" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Credit Section */}
      <div className="activity-list">
        <h3 className="sub-title" style={{ color: 'var(--success)' }}>Credit Given</h3>
        
        <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--success)', padding: '16px', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--success)', fontWeight: '600' }}>Total Credit Given</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)', marginTop: '4px' }}>₹{totalCredit.toLocaleString('en-IN')}</div>
          
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
             <div style={{ flex: 1, minWidth: '80px', backgroundColor: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500' }}>Max</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>₹{credStats.max.toLocaleString('en-IN')}</div>
             </div>
             <div style={{ flex: 1, minWidth: '80px', backgroundColor: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500' }}>Min</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>₹{credStats.min.toLocaleString('en-IN')}</div>
             </div>
             <div style={{ flex: 1, minWidth: '80px', backgroundColor: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500' }}>Average</div>
                <div style={{ fontWeight: '700', color: 'var(--text-main)', fontSize: '0.95rem' }}>₹{credStats.avg.toLocaleString('en-IN')}</div>
             </div>
          </div>
        </div>

        <div style={{ height: '140px', width: '100%', marginTop: '24px' }}>
          <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} style={{ outline: 'none' }}>
              <defs>
                <linearGradient id="colorCredit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} dy={10} />
              <YAxis width={80} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`} />
              <Tooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }} />
              <Area type="monotone" dataKey="credit" stroke="var(--success)" strokeWidth={3} fillOpacity={1} fill="url(#colorCredit)" name="Credit Given" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      </div>
    </div>
  );
}
