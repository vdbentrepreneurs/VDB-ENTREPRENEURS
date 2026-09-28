import { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { PlusCircle, ArrowUpRight, ArrowDownRight, IndianRupee, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [outstandingCredit, setOutstandingCredit] = useState(0);
  const [todayBills, setTodayBills] = useState([]);
  const [todayCredits, setTodayCredits] = useState([]);
  const [activityFilter, setActivityFilter] = useState('all');
  const [remainingDebt, setRemainingDebt] = useState(0);
  const [interestPaid, setInterestPaid] = useState(0);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'bills'));
    const unsubscribeBills = onSnapshot(q, (querySnapshot) => {
      let sum = 0;
      const today = new Date().toISOString().split('T')[0];
      const bList = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Sum ALL uncleared expenses for the Total Expenses metric
        if (data.status !== 'cleared') {
          sum += Number(data.amount) || 0;
        }
        // Only push today's bills to the Recent Activity feed
        if (data.date === today) {
          bList.push({ id: doc.id, type: 'bill', ...data });
        }
      });
      
      setTotalExpenses(sum);
      setTodayBills(bList);
    });

    const creditQ = query(collection(db, 'credits'));
    const unsubscribeCredits = onSnapshot(creditQ, (querySnapshot) => {
      let creditSum = 0;
      
      const getFullHistory = (credit) => {
        let fullHistory = credit.history || [];
        const historySum = fullHistory.reduce((sum, tx) => sum + Number(tx.amount), 0);
        if (historySum < Number(credit.amount)) {
          const initialAmount = Number(credit.amount) - historySum;
          fullHistory = [
            { amount: initialAmount, date: credit.date, isInitial: true, status: credit.initialStatus || 'pending' },
            ...fullHistory
          ];
        }
        if (credit.status === 'cleared') {
          return fullHistory.map(tx => ({ ...tx, status: 'cleared' }));
        }
        return fullHistory;
      };

      const cList = [];
      const today = new Date().toISOString().split('T')[0];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const fullHistory = getFullHistory(data);
        const outstandingAmount = fullHistory
          .filter(tx => tx.status !== 'cleared')
          .reduce((sum, tx) => sum + Number(tx.amount), 0);
        creditSum += outstandingAmount;

        fullHistory.forEach((tx, idx) => {
          if (tx.date === today) {
            cList.push({ id: `${doc.id}_${idx}`, type: 'credit', shopName: data.shopName, ...tx });
          }
        });
      });
      setOutstandingCredit(creditSum);
      setTodayCredits(cList);
    });
    const debtQ = query(collection(db, 'debts'));
    const unsubscribeDebts = onSnapshot(debtQ, (querySnapshot) => {
      let totalDebtSum = 0;
      let monthlyInterestSum = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Remove userId check to match Debt.jsx behavior and ensure data shows up
        const principal = Number(data.principalAmount) || 0;
        totalDebtSum += principal;
        
        if (principal > 0) {
          monthlyInterestSum += Number(data.monthlyInterest) || 0;
        }
      });
      
      setRemainingDebt(Math.round(totalDebtSum));
      setInterestPaid(Math.round(monthlyInterestSum));
    });
    
    return () => {
      unsubscribeBills();
      unsubscribeCredits();
      unsubscribeDebts();
    };
  }, [user]);

  // Combine and sort today's activity
  const allActivity = [...todayBills, ...todayCredits].sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.addedAt || a.date).getTime();
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.addedAt || b.date).getTime();
    return timeB - timeA;
  });

  const recentActivity = allActivity.filter(activity => {
    if (activityFilter === 'all') return true;
    return activity.type === activityFilter;
  });

  return (
    <div className="dashboard-container">
      <h2 className="section-title">Business Overview</h2>
      
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div className="metric-card danger" style={{ padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Total Bills
          </div>
          <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{totalExpenses.toLocaleString('en-IN')}</h3>
        </div>

        <div className="metric-card success" style={{ padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Credit
          </div>
          <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{outstandingCredit.toLocaleString('en-IN')}</h3>
        </div>

        <div className="metric-card warning" style={{ padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Total Debt
          </div>
          <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{remainingDebt.toLocaleString('en-IN')}</h3>
        </div>

        <div className="metric-card neutral" style={{ borderLeftColor: 'var(--warning)', padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Paying Monthly Interest
          </div>
          <h3 style={{ color: 'var(--warning)', fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{interestPaid.toLocaleString('en-IN')}</h3>
        </div>
      </div>

      <div className="recent-activity-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 className="sub-title" style={{ marginBottom: 0 }}>Recent Activity (Today)</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setActivityFilter('all')}
              style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '20px', border: '1px solid var(--border-color)', backgroundColor: activityFilter === 'all' ? 'var(--primary-color)' : 'var(--surface)', color: activityFilter === 'all' ? 'white' : 'var(--text-muted)' }}
            >All</button>
            <button 
              onClick={() => setActivityFilter('bill')}
              style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '20px', border: '1px solid var(--border-color)', backgroundColor: activityFilter === 'bill' ? 'var(--primary-color)' : 'var(--surface)', color: activityFilter === 'bill' ? 'white' : 'var(--text-muted)' }}
            >Bills</button>
            <button 
              onClick={() => setActivityFilter('credit')}
              style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '20px', border: '1px solid var(--border-color)', backgroundColor: activityFilter === 'credit' ? 'var(--primary-color)' : 'var(--surface)', color: activityFilter === 'credit' ? 'white' : 'var(--text-muted)' }}
            >Credit</button>
          </div>
        </div>
        <div className="activity-list">
          {recentActivity.length === 0 ? (
            <div className="activity-empty">
              <p>No recent activity today. Start adding bills or transactions.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recentActivity.map((activity, idx) => (
                <div key={activity.id || idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                      {activity.type === 'bill' ? activity.name : activity.shopName}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {activity.type === 'bill' ? 'Bill Added' : 'Credit Added'}
                    </span>
                  </div>
                  <span style={{ fontWeight: '600', color: activity.type === 'bill' ? 'var(--danger)' : 'var(--primary-color)' }}>
                    {activity.type === 'bill' ? '-' : '+'} ₹{Number(activity.amount).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
