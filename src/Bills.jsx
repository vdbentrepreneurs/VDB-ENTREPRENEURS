import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PlusCircle, Search, Upload, FileText, Loader2, ExternalLink, Trash2, Eye, X, ArrowLeft, Camera as CameraIcon, CheckCircle, Calendar, Tag, CreditCard } from 'lucide-react';
import { db, storage, auth } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMwlYzbRuVXqB_-wiZ1lyKX-NbknbERTlleDCqI54cjUt_tgp0EbQZyoJTMjgORSyZGQ/exec";
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { playSuccessFeedback } from './utils';



export default function Bills() {
  const [showAdd, setShowAdd] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [expandedBillId, setExpandedBillId] = useState(null); 
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [appendingToBillId, setAppendingToBillId] = useState(null);
  const [appendFilesQueue, setAppendFilesQueue] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    shopName: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    paymentType: 'Paid',
    categoryId: 'cat1',
    notes: '',
  });

  const [searchQuery, setSearchQuery] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [bills, setBills] = useState([]);
  const [isLoadingBills, setIsLoadingBills] = useState(true);

  // Assuming categories are static or we just let them type/select hardcoded for now
  // If we want dynamic categories in Firebase we need a categories collection.
  // For now, let's hardcode standard expense categories to avoid complexity
  const categories = [
    { id: 'cat1', name: 'Stock / Purchases' }
  ];

  useEffect(() => {
    const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const billsArray = [];
      querySnapshot.forEach((doc) => {
        billsArray.push({ id: doc.id, ...doc.data() });
      });
      
      billsArray.sort((a, b) => {
        const aCleared = a.status === 'cleared';
        const bCleared = b.status === 'cleared';
        if (aCleared && !bCleared) return 1;
        if (!aCleared && bCleared) return -1;
        
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.date).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.date).getTime();
        return timeB - timeA;
      });
      
      setBills(billsArray);
      setIsLoadingBills(false);
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'amount') {
      const rawValue = value.replace(/,/g, '').replace(/[^0-9]/g, '');
      setFormData(prev => ({ ...prev, [name]: rawValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const newPhotosWithDataUrl = await Promise.all(newFiles.map(async file => {
        const dataUrl = await convertToBase64(file);
        return { name: file.name, type: file.type, dataUrl };
      }));

      if (appendingToBillId) {
        setAppendFilesQueue(prev => [...prev, ...newPhotosWithDataUrl]);
      } else {
        setSelectedFiles(prev => [...prev, ...newPhotosWithDataUrl]);
      }
    }
  };

  const takePhoto = async (sourceType) => {
    try {
      if (!appendingToBillId) setShowCameraMenu(false);
      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: sourceType
      });

      const newPhoto = {
        name: `bill_${new Date().getTime()}.${image.format || 'jpg'}`,
        type: `image/${image.format || 'jpeg'}`,
        dataUrl: image.dataUrl
      };
      
      if (appendingToBillId) {
        setAppendFilesQueue(prev => [...prev, newPhoto]);
      } else {
        setSelectedFiles(prev => [...prev, newPhoto]);
      }
    } catch (error) {
      console.log('User cancelled camera prompt', error);
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAppendFiles = async (files, billId) => {
    try {
      setIsUploading(true);
      const billRef = doc(db, 'bills', billId);
      const billSnap = bills.find(b => b.id === billId);
      if (!billSnap) return;
      
      let currentPhotos = billSnap.photos || (billSnap.photoData ? [billSnap.photoData] : []);
      let newPhotos = [];
      
      for (const file of files) {
        const base64Str = file.dataUrl || await convertToBase64(file);
        const base64Data = base64Str.split(',')[1];
        
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'upload',
            filename: file.name,
            mimeType: file.type || 'image/jpeg',
            base64: base64Data
          })
        });
        const result = await response.json();
        
        if (result.status === 'success') {
          newPhotos.push({
            fileId: result.fileId,
            fileUrl: result.fileUrl
          });
        } else {
          console.error("Script error:", result);
          alert("Upload failed: " + (result.message || "Unknown error"));
        }
      }
      
      if (newPhotos.length > 0) {
        await updateDoc(billRef, {
          photos: [...currentPhotos, ...newPhotos]
        });
        playSuccessFeedback();
        alert("Photos added successfully!");
      } else {
        alert("No photos were successfully uploaded.");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to upload photos.");
    } finally {
      setIsUploading(false);
      setAppendingToBillId(null);
      setAppendFilesQueue([]);
      setShowCameraMenu(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveBill = async () => {
    if (!formData.amount) {
      alert("Please enter an amount.");
      return;
    }

    try {
      setIsUploading(true);
      let photos = [];

      if (selectedFiles.length > 0) {
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const base64Str = file.dataUrl || await convertToBase64(file);
          const base64Data = base64Str.split(',')[1];
          
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
              action: 'upload',
              filename: file.name,
              mimeType: file.type || 'image/jpeg',
              base64: base64Data
            })
          });
          const result = await response.json();
          
          if (result.status === 'success') {
            photos.push({
              fileId: result.fileId,
              fileUrl: result.fileUrl
            });
          } else {
            console.error("Script error on save:", result);
            alert("Upload failed for one of the photos: " + (result.message || "Unknown error"));
          }
        }
      }

      const cat = categories.find(c => c.id === formData.categoryId);

      await addDoc(collection(db, "bills"), {
        shopName: formData.shopName.trim(),
        date: formData.date,
        amount: Number(formData.amount),
        paymentType: formData.paymentType,
        categoryId: formData.categoryId,
        categoryName: cat ? cat.name : 'Uncategorized',
        notes: formData.notes,
        createdAt: serverTimestamp(),
        photos: photos,
        status: 'pending',
        userId: auth.currentUser?.uid || ''
      });

      if (auth.currentUser) {
        const newShopName = formData.shopName.trim();
        const shopsRef = collection(db, 'shops');
        const q = query(shopsRef, where('userId', '==', auth.currentUser.uid), where('name', '==', newShopName));
        const shopSnap = await getDocs(q);
        if (shopSnap.empty) {
          await addDoc(shopsRef, {
            name: newShopName,
            userId: auth.currentUser.uid,
            createdAt: serverTimestamp()
          });
        }
      }

      // Reset form
      setFormData({
        shopName: '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        paymentType: 'Paid',
        categoryId: 'cat1',
        notes: '',
      });
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowAdd(false);
      setIsUploading(false);
      playSuccessFeedback();

    } catch (error) {
      console.error(error);
      alert("An error occurred while saving the bill.");
      setIsUploading(false);
    }
  };

  const executeClear = async (id) => {
    setIsClearing(true);
    setConfirmAction(null);
    try {
      await updateDoc(doc(db, "bills", id), { status: 'cleared' });
      setTimeout(() => {
        setIsClearing(false);
      }, 800);
    } catch (e) {
      console.error(e);
      alert("Error updating bill.");
      setIsClearing(false);
    }
  };

  const markAsCleared = (id) => {
    setConfirmAction({
      title: "Mark as Cleared?",
      message: "This bill will be removed from today's dashboard expenses.",
      confirmText: "Yes, Clear It",
      confirmStyle: "var(--success)",
      action: () => executeClear(id)
    });
  };

  const executeDelete = async (id, bill) => {
    setConfirmAction(null);
    try {
      const photosToDelete = bill.photos || (bill.photoData ? [bill.photoData] : []);
      if (photosToDelete.length > 0) {
        for (const photo of photosToDelete) {
          try {
            fetch(SCRIPT_URL, {
              method: 'POST',
              body: JSON.stringify({ action: 'delete', fileId: photo.fileId })
            }).catch(console.error);
          } catch (e) {
            console.error("Error deleting file from drive:", e);
          }
        }
      }
      await deleteDoc(doc(db, "bills", id));
      if (expandedBillId === id) setExpandedBillId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteBill = (id, bill) => {
    setConfirmAction({
      title: "Delete Bill?",
      message: "Are you sure you want to permanently delete this bill?",
      confirmText: "Delete",
      confirmStyle: "var(--danger)",
      action: () => executeDelete(id, bill)
    });
  };

  const filteredBills = bills.filter(bill => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      (bill.shopName && bill.shopName.toLowerCase().includes(lowerQuery)) ||
      (bill.categoryName && bill.categoryName.toLowerCase().includes(lowerQuery)) ||
      (bill.notes && bill.notes.toLowerCase().includes(lowerQuery)) ||
      (bill.amount && bill.amount.toString().includes(lowerQuery)) ||
      (bill.paymentType && bill.paymentType.toLowerCase().includes(lowerQuery))
    );
  });

  const totalCleared = bills.filter(b => b.status === 'cleared').reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const totalUncleared = bills.filter(b => b.status !== 'cleared').reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  return (
    <div className="dashboard-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title">Bills</h2>
        <button className="action-btn" style={{ padding: '8px 16px', flexDirection: 'row' }} onClick={() => setShowAdd(!showAdd)}>
          <PlusCircle size={20} />
          {showAdd ? 'Close' : 'Add Bill'}
        </button>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '16px', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        <div className="metric-card success" style={{ padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total Bills Payed</div>
          <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{totalCleared.toLocaleString('en-IN')}</h3>
        </div>
        <div className="metric-card danger" style={{ padding: '12px', minWidth: 0 }}>
          <div className="metric-header" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total Bills Unpayed</div>
          <h3 style={{ fontSize: '1.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>₹{totalUncleared.toLocaleString('en-IN')}</h3>
        </div>
        <div className="metric-card neutral" style={{ padding: '12px', gridColumn: 'span 2' }}>
          <div className="metric-header" style={{ fontSize: '0.85rem' }}>Total Bills</div>
          <h3 style={{ fontSize: '1.3rem' }}>₹{(totalCleared + totalUncleared).toLocaleString('en-IN')}</h3>
        </div>
      </div>

      {showAdd && (
        <div className="activity-list" style={{ marginBottom: '24px' }}>
          <h3 className="sub-title">Enter New Bill</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <input type="text" name="shopName" value={formData.shopName} onChange={handleInputChange} placeholder="Shop Name" className="form-input" style={{ flex: 1 }} disabled={isUploading} />
              <input type="date" name="date" value={formData.date} onChange={handleInputChange} className="form-input" style={{ width: '150px' }} disabled={isUploading} />
            </div>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <input type="text" inputMode="numeric" name="amount" value={formData.amount ? Number(formData.amount).toLocaleString('en-IN') : ''} onChange={handleInputChange} placeholder="Amount (₹)" className="form-input" style={{ flex: 1 }} disabled={isUploading} />
            </div>
            
            <select name="categoryId" value={formData.categoryId} onChange={handleInputChange} className="form-input" disabled={true}>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            
            <div 
              style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', 
                padding: '24px', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius)',
                cursor: isUploading ? 'not-allowed' : 'pointer', backgroundColor: 'var(--background)' 
              }} 
              onClick={() => !isUploading && setShowCameraMenu(true)}
            >
              <CameraIcon size={32} style={{ color: 'var(--primary-color)' }} />
              <span style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: '500', textAlign: 'center' }}>
                {selectedFiles.length > 0 ? `${selectedFiles.length} photo(s) attached` : 'Tap to Take Photo or Upload'}
              </span>
              
              {selectedFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', justifyContent: 'center' }}>
                  {selectedFiles.map((photo, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                      <img src={photo.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Selected" />
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedFiles(prev => prev.filter((_, i) => i !== idx)); }}
                        style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <textarea name="notes" value={formData.notes} onChange={handleInputChange} placeholder="Additional Notes" className="form-input" style={{ minHeight: '100px', resize: 'vertical' }} disabled={isUploading}></textarea>
            
            <button 
              className="action-btn" 
              onClick={saveBill}
              disabled={isUploading}
              style={{ backgroundColor: 'var(--primary-color)', color: 'white', opacity: isUploading ? 0.7 : 1, flexDirection: 'row', padding: '16px', fontSize: '1.1rem', marginTop: '8px' }}
            >
              {isUploading ? <><Loader2 className="animate-spin" size={24} style={{ marginRight: '8px' }} /> Uploading & Saving...</> : 'Save Bill'}
            </button>
          </div>
        </div>
      )}

      <div className="activity-list">
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', backgroundColor: 'var(--background)', padding: '8px 12px', borderRadius: '8px' }}>
            <Search size={20} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search bills..." 
              style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-main)' }} 
            />
          </div>
        </div>

        {isLoadingBills ? (
          <div className="activity-empty" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="animated-loading-text">VANA DURGA BHAVANI ENTREPRENEURS</div>
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="activity-empty">
            <FileText size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p>{searchQuery ? 'No bills match your search.' : 'No bills recorded yet.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredBills.map(bill => (
              <div key={bill.id} style={{ display: 'flex', flexDirection: 'column', padding: '16px', backgroundColor: 'var(--background)', borderRadius: 'var(--radius)', borderLeft: `4px solid ${bill.status === 'cleared' ? 'var(--success)' : 'var(--warning)'}`, boxShadow: 'var(--shadow-sm)', userSelect: 'none', WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent' }}>
                {expandedBillId === bill.id ? (
                  <div style={{ cursor: 'pointer', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }} onClick={() => setExpandedBillId(null)}>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {bill.shopName}
                      {bill.status === 'cleared' && <span style={{ fontSize: '0.75rem', backgroundColor: 'var(--success)', color: 'white', padding: '2px 8px', borderRadius: '4px' }}>Cleared</span>}
                    </h2>
                    <div style={{ display: 'flex', gap: '16px', color: 'var(--text-main)', fontSize: '0.85rem', flexWrap: 'wrap', fontWeight: '500' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}><Calendar size={14} color="#8b5cf6" /> {bill.date}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}><Tag size={14} color="#f59e0b" /> {bill.categoryName || 'Stock / Purchases'}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedBillId(bill.id)}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                      <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{bill.shopName}</span>
                        {bill.status === 'cleared' && <span style={{ fontSize: '0.65rem', backgroundColor: 'var(--success)', color: 'white', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>Cleared</span>}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{bill.date}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem' }}>₹{bill.amount.toLocaleString('en-IN')}</h3>
                    </div>
                  </div>
                )}

                <div className={`accordion-wrapper ${expandedBillId === bill.id ? 'open' : ''}`}>
                  <div className="accordion-inner">
                    <div onClick={(e) => e.stopPropagation()} style={{ paddingTop: '8px' }}>
                      <h1 style={{ fontSize: '1.8rem', color: 'var(--text-main)', margin: '0 0 16px 0', fontWeight: '500' }}>₹{bill.amount.toLocaleString('en-IN')}</h1>

                      {bill.notes && (
                        <div style={{ backgroundColor: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                          <h4 style={{ margin: '0 0 6px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Notes</h4>
                          <p style={{ margin: 0, fontSize: '0.95rem' }}>{bill.notes}</p>
                        </div>
                      )}

                      {(() => {
                        const photosToRender = bill.photos || (bill.photoData ? [bill.photoData] : []);
                        return (
                          <div style={{ padding: '16px', backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: '8px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {photosToRender.length > 0 ? (
                              photosToRender.map((photo, idx) => (
                                <button 
                                  key={idx}
                                  className="action-btn"
                                  style={{ padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white', flexDirection: 'row', width: '100%', fontSize: '0.95rem' }}
                                  onClick={async () => {
                                    try {
                                      const { Browser } = await import('@capacitor/browser');
                                      await Browser.open({ url: photo.fileUrl });
                                    } catch (e) {
                                      console.error(e);
                                      window.open(photo.fileUrl, '_blank');
                                    }
                                  }}
                                >
                                  <FileText size={18} style={{ marginRight: '8px' }} />
                                  View Attached Bill {photosToRender.length > 1 ? idx + 1 : ''}
                                </button>
                              ))
                            ) : (
                              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                                No bill image attached.
                              </div>
                            )}
                            <button
                              className="action-btn"
                              style={{ padding: '12px', border: '1px dashed var(--primary-color)', backgroundColor: 'transparent', color: 'var(--primary-color)', flexDirection: 'row', width: '100%', fontSize: '0.95rem', marginTop: '8px' }}
                              onClick={() => { setAppendingToBillId(bill.id); setShowCameraMenu(true); }}
                            >
                              <PlusCircle size={18} style={{ marginRight: '8px' }} />
                              Attach Bill Image
                            </button>
                          </div>
                        );
                      })()}

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="action-btn" style={{ flex: 1, padding: '12px', flexDirection: 'row', color: 'var(--danger)', border: '1px solid var(--danger)', backgroundColor: 'transparent', boxShadow: 'none' }} onClick={() => deleteBill(bill.id, bill)}>
                          <Trash2 size={16} style={{ marginRight: '6px' }} /> Delete
                        </button>
                        
                        {bill.status !== 'cleared' && (
                          <button 
                            className="action-btn" 
                            disabled={isClearing}
                            style={{ flex: 2, padding: '12px', flexDirection: 'row', backgroundColor: 'var(--success)', color: 'white', opacity: isClearing ? 0.7 : 1, boxShadow: 'none' }} 
                            onClick={() => markAsCleared(bill.id)}
                          >
                            {isClearing ? (
                              <><Loader2 className="animate-spin" size={16} style={{ marginRight: '6px' }} /> Clearing...</>
                            ) : (
                              <><CheckCircle size={16} style={{ marginRight: '6px' }} /> Mark as Cleared</>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCameraMenu && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(2px)' }} onClick={() => { setShowCameraMenu(false); setAppendingToBillId(null); setAppendFilesQueue([]); }}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--primary-color)', margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>VDB ENTREPRENEURS</h2>
              <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0', fontSize: '0.9rem' }}>Choose how to upload your bill</p>
            </div>
            
            {appendFilesQueue.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                {appendFilesQueue.map((photo, idx) => (
                  <div key={idx} style={{ position: 'relative', width: '80px', height: '80px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                    <img src={photo.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Pending upload" />
                    <button 
                      onClick={(e) => { e.stopPropagation(); setAppendFilesQueue(prev => prev.filter((_, i) => i !== idx)); }}
                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="action-btn"
                style={{ flexDirection: 'row', backgroundColor: 'var(--primary-light)', color: 'var(--primary-color)', padding: '16px', fontSize: '1.1rem', border: '1px solid var(--primary-color)' }}
                onClick={() => takePhoto(CameraSource.Camera)}
              >
                <CameraIcon size={24} style={{ marginRight: '12px' }} />
                Take Photo
              </button>
              
              <button 
                className="action-btn"
                style={{ flexDirection: 'row', backgroundColor: 'var(--surface)', color: 'var(--text-main)', padding: '16px', fontSize: '1.1rem' }}
                onClick={() => takePhoto(CameraSource.Photos)}
              >
                <Upload size={24} style={{ marginRight: '12px' }} />
                Upload from Gallery
              </button>
              
              {appendingToBillId && appendFilesQueue.length > 0 && (
                <button 
                  className="action-btn"
                  style={{ flexDirection: 'row', backgroundColor: 'var(--success)', color: 'white', padding: '16px', fontSize: '1.1rem', marginTop: '16px' }}
                  onClick={() => handleAppendFiles(appendFilesQueue, appendingToBillId)}
                  disabled={isUploading}
                >
                  {isUploading ? <><Loader2 className="animate-spin" size={24} style={{ marginRight: '12px' }} /> Uploading...</> : <><CheckCircle size={24} style={{ marginRight: '12px' }} /> Upload {appendFilesQueue.length} Photo(s)</>}
                </button>
              )}
              
              <button 
                className="action-btn"
                style={{ flexDirection: 'row', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', boxShadow: 'none', padding: '12px', marginTop: '8px' }}
                onClick={() => { setShowCameraMenu(false); setAppendingToBillId(null); setAppendFilesQueue([]); }}
                disabled={isUploading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmAction && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', backdropFilter: 'blur(2px)' }} onClick={() => setConfirmAction(null)}>
          <div style={{ backgroundColor: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', width: '100%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-main)', fontSize: '1.25rem' }}>{confirmAction.title}</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', lineHeight: '1.5' }}>{confirmAction.message}</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', boxShadow: 'none' }}
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button 
                className="action-btn" 
                style={{ flex: 1, padding: '12px', backgroundColor: confirmAction.confirmStyle, color: 'white' }}
                onClick={confirmAction.action}
              >
                {confirmAction.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
