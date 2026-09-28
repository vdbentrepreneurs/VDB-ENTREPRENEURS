import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Landmark, Trash2, Edit2, Check, X, Download, Loader2, User } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { db } from './firebase';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export default function DebtDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lender, setLender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isEditingPrincipal, setIsEditingPrincipal] = useState(false);
  const [newPrincipal, setNewPrincipal] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);
  const [isPayingPrincipal, setIsPayingPrincipal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const receiptRef = useRef(null);

  useEffect(() => {
    const fetchLender = async () => {
      try {
        const docRef = doc(db, 'debts', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setLender({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.log("No such document!");
        }
      } catch (error) {
        console.error("Error fetching lender:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLender();
  }, [id]);

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this lender?")) {
      await deleteDoc(doc(db, 'debts', id));
      navigate('/debt');
    }
  };

  const startEditPrincipal = () => {
    setNewPrincipal(lender.principalAmount.toString());
    setIsEditingPrincipal(true);
  };

  const cancelEditPrincipal = () => {
    setIsEditingPrincipal(false);
    setNewPrincipal('');
  };

  const handleUpdatePrincipal = async () => {
    const rawVal = newPrincipal.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const numVal = Number(rawVal);
    
    if (isNaN(numVal) || numVal <= 0) {
      alert("Invalid principal amount");
      return;
    }

    let monthlyInterest = 0;
    const rate = Number(lender.interestRate) || 0;
    if (lender.interestType === 'rs') {
      monthlyInterest = (numVal * rate) / 100;
    } else {
      monthlyInterest = (numVal * rate) / (100 * 12);
    }
    const yearlyInterest = monthlyInterest * 12;

    try {
      await updateDoc(doc(db, 'debts', id), {
        principalAmount: numVal,
        monthlyInterest: monthlyInterest,
        yearlyInterest: yearlyInterest
      });
      setLender({ ...lender, principalAmount: numVal, monthlyInterest, yearlyInterest });
      setIsEditingPrincipal(false);
    } catch (error) {
      console.error(error);
      alert("Failed to update principal.");
    }
  };

  const handlePayPrincipal = async () => {
    const rawVal = payAmount.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const numVal = Number(rawVal);
    
    if (isNaN(numVal) || numVal <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }

    if (numVal > Number(lender.principalAmount)) {
      alert("Payment amount cannot be greater than the current principal amount");
      return;
    }

    const newPrincipalAmount = Number(lender.principalAmount) - numVal;
    
    let monthly = 0;
    let yearly = 0;
    
    if (lender.interestType === 'percent') {
      yearly = (newPrincipalAmount * lender.interestRate) / 100;
      monthly = yearly / 12;
    } else {
      monthly = (newPrincipalAmount / 100) * lender.interestRate;
      yearly = monthly * 12;
    }
    setIsProcessingPayment(true);
    
    try {
      // Preserve currently accrued interest before changing principal
      const now = new Date();
      const isCleared = !!lender.lastClearedDate;
      const startDate = lender.lastClearedDate?.toDate ? lender.lastClearedDate.toDate() : (lender.createdAt?.toDate ? lender.createdAt.toDate() : new Date());
      const diffTime = Math.max(0, now.getTime() - startDate.getTime());
      const rawDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const daysElapsed = isCleared ? Math.max(0, rawDays) : Math.max(1, rawDays + 1);
      
      const dailyInterest = (Number(lender.yearlyInterest) || 0) / 365;
      const newlyAccrued = dailyInterest * daysElapsed;
      const currentSavedInterest = Number(lender.savedInterest) || 0;
      const totalOutstandingInterest = currentSavedInterest + newlyAccrued;

      const newTotalPaid = (lender.totalPrincipalPaid || 0) + numVal;
      const docRef = doc(db, 'debts', id);
      
      await updateDoc(docRef, {
        principalAmount: newPrincipalAmount,
        monthlyInterest: monthly,
        yearlyInterest: yearly,
        totalPrincipalPaid: newTotalPaid,
        savedInterest: totalOutstandingInterest,
        lastClearedDate: now
      });
      
      setLender({
        ...lender,
        principalAmount: newPrincipalAmount,
        monthlyInterest: monthly,
        yearlyInterest: yearly,
        totalPrincipalPaid: newTotalPaid,
        savedInterest: totalOutstandingInterest,
        lastClearedDate: { toDate: () => now }
      });
      setIsPayingPrincipal(false);
      setPayAmount('');
      setPaymentSuccess(true);
      setTimeout(() => setPaymentSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to process payment.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="typing-dots"><span></span><span></span><span></span></div>
      </div>
    );
  }

  if (!lender) {
    return (
      <div className="dashboard-container">
        <button className="action-btn" onClick={() => navigate('/debt')} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', marginBottom: '16px' }}>
          <ArrowLeft size={20} style={{ marginRight: '8px' }} /> Back
        </button>
        <p>Lender not found.</p>
      </div>
    );
  }

  const now = new Date();
  
  const isCleared = !!lender.lastClearedDate;
  const startDate = lender.lastClearedDate?.toDate ? lender.lastClearedDate.toDate() : (lender.createdAt?.toDate ? lender.createdAt.toDate() : new Date());
  const diffTime = Math.max(0, now.getTime() - startDate.getTime());
  const rawDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // New lenders start accumulating on Day 1. Cleared interest starts accumulating the next day (Day 0 today).
  const daysElapsed = isCleared ? Math.max(0, rawDays) : Math.max(1, rawDays + 1);

  const dailyInterest = (Number(lender.yearlyInterest) || 0) / 365;
  const accumulatedInterest = dailyInterest * daysElapsed;
  const savedInterest = Number(lender.savedInterest) || 0;
  const totalInterestPaid = Number(lender.totalInterestPaid) || 0;
  const outstandingInterest = accumulatedInterest + savedInterest;
  const totalAmountOwed = Number(lender.principalAmount) + outstandingInterest;

  const handleClearInterest = async () => {
    if (outstandingInterest <= 0) {
      alert("No outstanding interest to clear.");
      return;
    }
    
    setIsClearing(true);

    try {
      const currentTotalPaid = Number(lender.totalInterestPaid) || 0;
      const newTotalPaid = currentTotalPaid + outstandingInterest;
      
      const clearDate = new Date();

      await updateDoc(doc(db, 'debts', id), {
        totalInterestPaid: newTotalPaid,
        lastClearedDate: clearDate,
        savedInterest: 0
      });
      setLender({ 
        ...lender, 
        totalInterestPaid: newTotalPaid, 
        lastClearedDate: { toDate: () => clearDate },
        savedInterest: 0
      });
      
      setIsClearing(false);
      setShowClearConfirm(false);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      alert("Failed to clear interest.");
      setIsClearing(false);
    }
  };

  const downloadReceipt = () => {
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const logoUrl = '/logo.png';
      
      const drawPdf = async (logoImg) => {
        // Colors
        const primaryColor = [14, 165, 233]; // #0ea5e9
        const textColor = [51, 51, 51]; // #333
        const lightGray = [238, 238, 238]; // #eee
        
        let yPos = 15;
        
        // Logo (Left)
        if (logoImg) {
          pdf.addImage(logoImg, 'PNG', 20, yPos, 30, 30);
        }
        
        // Header (Left aligned with a clean gap from the logo)
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16); 
        pdf.setTextColor(...primaryColor);
        pdf.text("VANA DURGA BHAVANI ENTREPRENEURS", 55, yPos + 12, { align: "left" });
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(100, 100, 100);
        pdf.text("Proprietor: N. SATHISH KUMAR APPA", 55, yPos + 20, { align: "left" });
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(120, 120, 120);
        pdf.text("OFFICIAL PAYMENT RECEIPT", 105, yPos + 36, { align: "center" });
        
        yPos += 42;
        
        // Divider
        pdf.setDrawColor(...lightGray);
        pdf.line(20, yPos, 190, yPos);
        yPos += 15;
        
        // Receipt Details & Bill To
        const receiptNo = `REC-${Math.floor(Date.now() / 1000).toString().slice(-6)}`;
        
        // Bill to section
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text("BILLED TO / SETTLED WITH", 20, yPos);
        
        // Right side info box
        pdf.setFillColor(248, 250, 252); // slate-50
        pdf.setDrawColor(226, 232, 240); // slate-200 border
        pdf.roundedRect(130, yPos - 5, 60, 22, 3, 3, 'FD'); // fill and stroke
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text("Receipt No:", 135, yPos + 3);
        pdf.setTextColor(30, 41, 59); // slate-800
        pdf.setFont("helvetica", "bold");
        pdf.text(receiptNo, 185, yPos + 3, { align: "right" });
        
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(100, 100, 100);
        pdf.text("Date:", 135, yPos + 11);
        pdf.setTextColor(30, 41, 59);
        pdf.setFont("helvetica", "bold");
        pdf.text(new Date().toLocaleDateString('en-IN'), 185, yPos + 11, { align: "right" });
        
        yPos += 8;
        
        // Bill to name
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(16);
        pdf.setTextColor(30, 41, 59);
        pdf.text(lender.lenderName || lender.name || 'Unknown', 20, yPos);
        
        yPos += 10;
        
        // Status Pill
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        if (outstandingInterest <= 0) {
          pdf.setFillColor(220, 252, 231); // green-100
          pdf.roundedRect(20, yPos - 5, 38, 7, 2, 2, 'F');
          pdf.setTextColor(22, 163, 74); // green-600
          pdf.text("FULLY CLEARED", 24, yPos);
        } else {
          pdf.setFillColor(254, 226, 226); // red-100
          pdf.roundedRect(20, yPos - 5, 38, 7, 2, 2, 'F');
          pdf.setTextColor(220, 38, 38); // red-600
          pdf.text("ACTIVE ACCOUNT", 24, yPos);
        }
        
        yPos += 24;
        
        // Table Header
        pdf.setFillColor(241, 245, 249); // slate-100
        pdf.roundedRect(20, yPos, 170, 12, 3, 3, 'F');
        
        yPos += 8;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(100, 113, 129); // slate-500
        pdf.text("DESCRIPTION", 25, yPos);
        pdf.text("AMOUNT", 185, yPos, { align: "right" });
        
        yPos += 14;
        
        // Rows
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(51, 65, 85); // slate-700
        
        const currentPrincipal = Number(lender.principalAmount) || 0;
        const paidPrincipal = Number(lender.totalPrincipalPaid) || 0;
        const originalPrincipal = currentPrincipal + paidPrincipal;
        const isFullySettled = currentPrincipal === 0;
        
        pdf.text(isFullySettled ? "Principal Amount (Fully Settled)" : "Original Principal Amount", 25, yPos);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Rs ${originalPrincipal.toLocaleString('en-IN')}`, 185, yPos, { align: "right" });
        
        yPos += 12;
        pdf.setDrawColor(226, 232, 240); // slate-200
        pdf.line(20, yPos - 6, 190, yPos - 6); // row separator
        
        if (paidPrincipal > 0) {
          pdf.setFont("helvetica", "normal");
          pdf.text("Principal Paid", 25, yPos);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(22, 163, 74); // green
          const percentPaid = Math.round((paidPrincipal / originalPrincipal) * 100);
          pdf.text(`Rs ${paidPrincipal.toLocaleString('en-IN')} (${percentPaid}%)`, 185, yPos, { align: "right" });
          
          yPos += 12;
          pdf.setDrawColor(226, 232, 240);
          pdf.line(20, yPos - 6, 190, yPos - 6);
          
          pdf.setTextColor(51, 65, 85);
          pdf.setFont("helvetica", "normal");
          pdf.text("Principal Remaining", 25, yPos);
          pdf.setFont("helvetica", "bold");
          pdf.text(`Rs ${currentPrincipal.toLocaleString('en-IN')}`, 185, yPos, { align: "right" });
          
          yPos += 12;
          pdf.setDrawColor(226, 232, 240);
          pdf.line(20, yPos - 6, 190, yPos - 6);
        }
        
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(51, 65, 85);
        pdf.text("Interest Settled", 25, yPos);
        pdf.setFont("helvetica", "bold");
        pdf.text(`Rs ${totalInterestPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 185, yPos, { align: "right" });
        
        yPos += 12;
        
        // Total Box
        pdf.setFillColor(...primaryColor);
        pdf.roundedRect(20, yPos, 170, 14, 4, 4, 'F');
        
        const finalTotal = paidPrincipal + totalInterestPaid;
        
        yPos += 9;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(255, 255, 255); // white text
        pdf.text(isFullySettled ? "Total Fully Settled" : "Total Settled", 25, yPos);
        pdf.text(`Rs ${finalTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 185, yPos, { align: "right" });
        
        yPos += 30;
        
        // Footer
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(150, 150, 150);
        pdf.text("Generated securely by VANA DURGA BHAVANI ENTREPRENEURS", 105, yPos, { align: "center" });
        yPos += 6;
        pdf.text("Thank you for your business.", 105, yPos, { align: "center" });
        
        const fileName = `Receipt_${lender.lenderName || lender.name || 'Lender'}_${new Date().toISOString().split('T')[0]}.pdf`;
        
        if (Capacitor.isNativePlatform()) {
          try {
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            await Filesystem.writeFile({
              path: `Download/${fileName}`,
              data: pdfBase64,
              directory: Directory.ExternalStorage
            });
            setIsDownloadingPdf(false);
            alert("PDF successfully saved to your Downloads folder!");
          } catch (e) {
            console.error("Native save error:", e);
            alert("Error saving PDF: " + e.message);
            setIsDownloadingPdf(false);
          }
        } else {
          pdf.save(fileName);
          setIsDownloadingPdf(false);
        }
      };
      
      const img = new Image();
      img.src = logoUrl;
      img.onload = () => drawPdf(img);
      img.onerror = () => drawPdf(null);
      
    } catch (error) {
      console.error("Error generating receipt", error);
      alert("Failed to download receipt.");
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="dashboard-container">


      <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <User size={32} color="var(--primary-color)" />
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)', fontWeight: '600' }}>Lender Name</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '1.4rem', fontWeight: 'bold' }}>{lender.lenderName || lender.name || 'Unknown Lender'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
          <Landmark size={32} color="var(--primary-color)" />
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)', fontWeight: '600' }}>Principal Amount</h3>
            {isEditingPrincipal ? (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  value={newPrincipal ? Number(newPrincipal.replace(/,/g, '')).toLocaleString('en-IN') : ''} 
                  onChange={(e) => setNewPrincipal(e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, ''))} 
                  className="form-input" 
                  style={{ flex: 1, padding: '6px 8px', fontSize: '1rem' }} 
                />
                <button onClick={handleUpdatePrincipal} style={{ background: 'var(--success)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}><Check size={18} /></button>
                <button onClick={cancelEditPrincipal} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}><X size={18} /></button>
              </div>
            ) : isPayingPrincipal ? (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  placeholder="Amount Paid"
                  value={payAmount ? Number(payAmount.replace(/,/g, '')).toLocaleString('en-IN') : ''} 
                  onChange={(e) => setPayAmount(e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, ''))} 
                  className="form-input" 
                  style={{ flex: 1, padding: '6px 8px', fontSize: '1rem' }} 
                />
                <button onClick={handlePayPrincipal} disabled={isProcessingPayment} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: isProcessingPayment ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', opacity: isProcessingPayment ? 0.7 : 1 }}>
                  {isProcessingPayment ? <Loader2 size={16} className="spinner" /> : 'Pay'}
                </button>
                <button onClick={() => { setIsPayingPrincipal(false); setPayAmount(''); }} style={{ background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer' }}><X size={16} /></button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {Number(lender.principalAmount) === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0 0 0' }}>
                    <Check size={24} color="var(--success)" />
                    <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--success)' }}>Fully Paid</p>
                  </div>
                ) : (
                  <p style={{ margin: '4px 0 0 0', fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--danger)' }}>₹{Number(lender.principalAmount).toLocaleString('en-IN')}</p>
                )}
                
                <button 
                  onClick={startEditPrincipal} 
                  disabled={Number(lender.principalAmount) === 0} 
                  style={{ background: 'transparent', border: 'none', color: Number(lender.principalAmount) === 0 ? 'var(--text-muted)' : 'var(--primary-color)', cursor: Number(lender.principalAmount) === 0 ? 'not-allowed' : 'pointer', padding: '4px' }} 
                  title="Edit Principal">
                  <Edit2 size={16} />
                </button>
                
                <button 
                  onClick={() => setIsPayingPrincipal(true)} 
                  disabled={Number(lender.principalAmount) === 0}
                  style={{ marginLeft: 'auto', background: Number(lender.principalAmount) === 0 ? 'var(--text-muted)' : 'var(--success)', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', fontSize: '0.85rem', fontWeight: '600', cursor: Number(lender.principalAmount) === 0 ? 'not-allowed' : 'pointer', opacity: Number(lender.principalAmount) === 0 ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {Number(lender.principalAmount) === 0 ? 'Paid' : 'Pay Principal'}
                </button>
              </div>
            )}
            {paymentSuccess && (
              <div style={{ marginTop: '12px', padding: '10px 16px', backgroundColor: '#ecfdf5', border: '1px solid #10b981', color: '#047857', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s ease-out' }}>
                <Check size={20} />
                <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>Payment successful! Remaining principal updated.</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Interest Rate</p>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '500', color: 'var(--text-main)' }}>{lender.interestRate} {lender.interestType === 'percent' ? '%' : '₹'}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Interest Type</p>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '500', color: 'var(--text-main)' }}>{lender.interestType === 'percent' ? 'Per Annum' : 'Rs per ₹100 / month'}</p>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--background)', padding: '16px', borderRadius: '8px', marginTop: '8px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text-main)' }}>Standard Interest Estimates</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Daily:</span>
            <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>₹{dailyInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Monthly:</span>
            <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>₹{Number(lender.monthlyInterest).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Yearly:</span>
            <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>₹{Number(lender.yearlyInterest).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--primary-light)', padding: '16px', borderRadius: '8px', border: '1px solid var(--primary-color)', marginTop: '8px' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: 'var(--primary-color)' }}>Current Status ({daysElapsed} {daysElapsed === 1 ? 'day' : 'days'})</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-main)' }}>Total Interest:</span>
            <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>₹{accumulatedInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
          {totalInterestPaid > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--success)' }}>Paid Interest:</span>
              <span style={{ fontWeight: '500', color: 'var(--success)' }}>- ₹{totalInterestPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Outstanding Interest:</span>
            <span style={{ fontWeight: 'bold', color: 'var(--danger)' }}>{outstandingInterest >= 0 ? '+' : '-'} ₹{Math.abs(outstandingInterest).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--primary-color)' }}>
            <span style={{ color: 'var(--text-main)', fontWeight: 'bold', fontSize: '1.1rem' }}>Total Amount:</span>
            <span style={{ fontWeight: 'bold', color: 'var(--primary-color)', fontSize: '1.2rem' }}>₹{totalAmountOwed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {clearSuccess ? (
          <div style={{ padding: '12px', backgroundColor: 'var(--success)', color: 'white', borderRadius: '8px', textAlign: 'center', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={20} style={{ marginRight: '8px' }} />
            Cleared Successfully!
          </div>
        ) : showClearConfirm ? (
          <div style={{ backgroundColor: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--danger)', marginTop: '8px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontWeight: '500' }}>Confirm clear ₹{outstandingInterest.toLocaleString('en-IN', { maximumFractionDigits: 2 })}?</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleClearInterest} 
                disabled={isClearing}
                style={{ flex: 1, padding: '10px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: isClearing ? 'not-allowed' : 'pointer', opacity: isClearing ? 0.7 : 1 }}
              >
                {isClearing ? 'Clearing...' : 'Yes, Clear'}
              </button>
              <button 
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                style={{ flex: 1, padding: '10px', background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button 
              className="action-btn"
              disabled={outstandingInterest <= 0}
              style={{ 
                flex: outstandingInterest <= 0 ? 1 : 'none',
                width: outstandingInterest <= 0 ? 'auto' : '100%',
                padding: '12px', 
                fontSize: '1rem', 
                display: 'flex', 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'center', 
                backgroundColor: outstandingInterest <= 0 ? 'var(--text-muted)' : 'var(--success)', 
                color: 'white', 
                border: 'none', 
                cursor: outstandingInterest <= 0 ? 'not-allowed' : 'pointer',
                opacity: outstandingInterest <= 0 ? 0.7 : 1
              }}
              onClick={() => setShowClearConfirm(true)}
            >
              <Check size={20} style={{ marginRight: '8px' }} />
              {outstandingInterest <= 0 ? 'Cleared' : 'Clear Interest'}
            </button>

            {outstandingInterest <= 0 && (
              <button 
                className="action-btn"
                disabled={isDownloadingPdf}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1rem', 
                  display: 'flex', 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  backgroundColor: 'var(--primary-color)', 
                  color: 'white', 
                  border: 'none', 
                  cursor: isDownloadingPdf ? 'not-allowed' : 'pointer',
                  opacity: isDownloadingPdf ? 0.7 : 1
                }}
                onClick={downloadReceipt}
              >
                {isDownloadingPdf ? <Loader2 size={20} className="spinner" style={{ marginRight: '8px' }} /> : <Download size={20} style={{ marginRight: '8px' }} />}
                {isDownloadingPdf ? 'Generating...' : 'Receipt'}
              </button>
            )}
          </div>
        )}

        <button 
          className="action-btn"
          style={{ width: '100%', padding: '12px', fontSize: '1rem', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', marginTop: '16px' }}
          onClick={handleDelete}
        >
          <Trash2 size={20} style={{ marginRight: '8px' }} />
          Delete Lender
        </button>
      </div>
    </div>
  );
}
