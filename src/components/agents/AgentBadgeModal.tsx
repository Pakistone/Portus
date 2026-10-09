import React, { useState, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { generateAgentBadgePDF, type BadgeParams } from '../../utils/badgePdfGenerator';
import { 
  Camera, 
  Upload, 
  Download, 
  X, 
  User, 
  Shield, 
  Phone, 
  Activity, 
  CreditCard, 
  RefreshCw, 
  Check, 
  Sparkles 
} from 'lucide-react';

interface AgentBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAgent?: {
    id: string;
    username: string;
    fullName: string;
    role: string;
    sectorName?: string;
    phone?: string;
  };
}

export const AgentBadgeModal: React.FC<AgentBadgeModalProps> = ({ isOpen, onClose, selectedAgent }) => {
  const { isOnline } = useData();
  
  // Form State
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [matricule, setMatricule] = useState('');
  const [role, setRole] = useState('Agent de Terrain');
  const [brigade, setBrigade] = useState('MATIN');
  const [sector, setSector] = useState('VRIDI PORT');
  
  // Urgent Medical / Personal Details
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [cniNumber, setCniNumber] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  
  // Photo State
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Preview Mode
  const [previewSide, setPreviewSide] = useState<'recto' | 'verso'>('recto');
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs for camera stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize values when selectedAgent changes
  useEffect(() => {
    if (selectedAgent) {
      const parts = selectedAgent.fullName.trim().split(/\s+/);
      const computedName = parts.length > 0 ? parts[0] : '';
      const computedFirstName = parts.length > 1 ? parts.slice(1).join(' ') : 'Agent';
      
      setName(computedName);
      setFirstName(computedFirstName);
      setRole(selectedAgent.role === 'CONTROLEUR' ? 'Contrôleur Sécurité' : selectedAgent.role === 'ADMINISTRATEUR' ? 'Administrateur' : 'Agent de Terrain');
      setSector(selectedAgent.sectorName || 'VRIDI PORT');
      setEmergencyPhone(selectedAgent.phone || '');
      
      // Auto-generate realistic UJPAS matricule (ex. UJPAS-AGT-104)
      const numericSeed = Math.floor(100 + Math.random() * 900);
      const prefix = selectedAgent.role === 'CONTROLEUR' ? 'CTL' : selectedAgent.role === 'ADMINISTRATEUR' ? 'ADM' : 'AGT';
      setMatricule(`UJPAS-${prefix}-${numericSeed}`);
    } else {
      setName('');
      setFirstName('');
      setMatricule(`UJPAS-AGT-${Math.floor(100 + Math.random() * 900)}`);
      setRole('Agent de Terrain');
      setSector('VRIDI PORT');
    }
    setPhotoUrl('');
    stopCamera();
  }, [selectedAgent, isOpen]);

  // Handle camera start
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 320, facingMode: 'user' } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.warn('Camera initiation error:', err);
      setCameraError("Impossible d'accéder à la caméra. Veuillez importer une photo.");
      setIsCameraActive(false);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Capture photo
  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = 260;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Center-crop video to passport proportions (vertical 260x320)
        const vW = videoRef.current.videoWidth;
        const vH = videoRef.current.videoHeight;
        const minDim = Math.min(vW, vH);
        
        ctx.drawImage(
          videoRef.current,
          (vW - minDim) / 2, // sx
          (vH - minDim) / 2, // sy
          minDim, // sw
          minDim, // sh
          0, // dx
          0, // dy
          260, // dw
          320 // dh
        );
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setPhotoUrl(dataUrl);
        stopCamera();
      }
    }
  };

  // Handle passport photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          setPhotoUrl(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Print A4 Planche PDF
  const handlePrintBadge = async () => {
    if (!name || !firstName || !matricule) {
      alert("Veuillez renseigner au moins le Nom, le Prénom et le Matricule de l'agent.");
      return;
    }

    setIsGenerating(true);
    try {
      const params: BadgeParams = {
        name,
        firstName,
        matricule,
        role,
        brigade,
        sector,
        photoUrl: photoUrl || undefined,
        bloodGroup,
        cniNumber: cniNumber || `CI-${Math.floor(10000000 + Math.random() * 89999999)}`,
        emergencyPhone: emergencyPhone || '01 03 31 37 68',
      };

      const pdfBlob = await generateAgentBadgePDF(params);
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Badge_UJPAS_${matricule}_${name.toUpperCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error printing badge:', err);
      alert("Une erreur est survenue lors de la génération du badge PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full flex flex-col md:flex-row overflow-hidden max-h-[92vh]">
        
        {/* LEFT COLUMN: EDITING FORM (60%) */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[92vh] md:max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <Shield className="w-6 height-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Éditeur de Badges Professionnels</h3>
                <p className="text-xs text-slate-500">Conforme à la réglementation UJPAS (Format de cou 85 × 120 mm)</p>
              </div>
            </div>
            <button 
              onClick={() => { stopCamera(); onClose(); }} 
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Identity Fields */}
            <div className="space-y-4">
              <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-50 pb-1">
                <User className="w-4 h-4 text-emerald-600" /> Informations d'Identité
              </h4>
              
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nom de Famille</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="EX: BLÉ" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Prénoms</label>
                <input 
                  type="text" 
                  value={firstName} 
                  onChange={(e) => setFirstName(e.target.value)} 
                  placeholder="EX: Flavien" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">N° Matricule</label>
                  <input 
                    type="text" 
                    value={matricule} 
                    onChange={(e) => setMatricule(e.target.value)} 
                    placeholder="EX: UJPAS-AGT-001" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none text-orange-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rôle de l'Agent</label>
                  <select 
                    value={role} 
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="Agent de Terrain">Agent de Terrain</option>
                    <option value="Contrôleur Sécurité">Contrôleur Sécurité</option>
                    <option value="Superviseur Corridor">Superviseur Corridor</option>
                    <option value="Trésorier Général">Trésorier Général</option>
                    <option value="Secrétaire Général">Secrétaire Général</option>
                    <option value="Président Organisateur">Président Organisateur</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Secteur Affecté</label>
                  <select 
                    value={sector} 
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="VRIDI PORT">Vridi Port</option>
                    <option value="CANAL">Canal d'Assinie / Vridi</option>
                    <option value="ZONE INDUSTRIELLE">Zone Industrielle (ZI)</option>
                    <option value="CORRIDOR SIR">SIR / Vridi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Quart / Brigade</label>
                  <select 
                    value={brigade} 
                    onChange={(e) => setBrigade(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="MATIN">Matin (06h - 14h)</option>
                    <option value="SOIR">Soir (14h - 22h)</option>
                    <option value="NUIT">Nuit (22h - 06h)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Photo Capture & Urgent Health Details */}
            <div className="space-y-4 flex flex-col justify-between">
              <div>
                <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-50 pb-1 mb-3">
                  <Activity className="w-4 h-4 text-emerald-600" /> Fiche Médicale & Urgence
                </h4>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Groupe Sanguin</label>
                    <select 
                      value={bloodGroup} 
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="A+">A Rh+ (A+)</option>
                      <option value="A-">A Rh- (A-)</option>
                      <option value="B+">B Rh+ (B+)</option>
                      <option value="B-">B Rh- (B-)</option>
                      <option value="AB+">AB Rh+ (AB+)</option>
                      <option value="AB-">AB Rh- (AB-)</option>
                      <option value="O+">O Rh+ (O+)</option>
                      <option value="O-">O Rh- (O-)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">N° CNI / ID Card</label>
                    <input 
                      type="text" 
                      value={cniNumber} 
                      onChange={(e) => setCniNumber(e.target.value)} 
                      placeholder="EX: CI00388910" 
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Contact Parent (Urgence)</label>
                  <input 
                    type="text" 
                    value={emergencyPhone} 
                    onChange={(e) => setEmergencyPhone(e.target.value)} 
                    placeholder="EX: 01 02 03 04 05" 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {/* Photo Source Panel */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-2">
                <span className="block text-xs font-bold text-slate-700 mb-2">Photo d'identité (Requis)</span>
                
                <div className="flex gap-2">
                  {!isCameraActive ? (
                    <button 
                      onClick={startCamera} 
                      type="button"
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition"
                    >
                      <Camera className="w-4 h-4" /> Activer Caméra
                    </button>
                  ) : (
                    <button 
                      onClick={capturePhoto} 
                      type="button"
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 animate-pulse transition"
                    >
                      <Camera className="w-4 h-4" /> Prendre Photo
                    </button>
                  )}
                  
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    type="button"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 transition"
                  >
                    <Upload className="w-4 h-4" /> Charger Fichier
                  </button>
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handlePhotoUpload} 
                  accept="image/*" 
                  className="hidden" 
                />

                {isCameraActive && (
                  <div className="relative mt-3 rounded-lg overflow-hidden border border-emerald-500 aspect-square max-w-[200px] mx-auto bg-black">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover transform -scale-x-100" 
                    />
                    <div className="absolute inset-0 border-2 border-dashed border-white/50 pointer-events-none rounded-full m-6"></div>
                  </div>
                )}

                {cameraError && (
                  <p className="text-[10px] text-red-500 mt-2 font-medium">{cameraError}</p>
                )}

                {photoUrl && !isCameraActive && (
                  <div className="flex items-center gap-2 mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg text-[10px] font-semibold">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Photo d'identité chargée et normalisée avec succès</span>
                    <button 
                      onClick={() => setPhotoUrl('')} 
                      className="ml-auto text-emerald-600 hover:text-emerald-800 underline uppercase"
                    >
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6 flex flex-col sm:flex-row gap-4">
            <button 
              onClick={handlePrintBadge}
              disabled={isGenerating}
              className="flex-1 flex items-center justify-center gap-3 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/25 transition"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" /> Génération du PDF...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" /> Télécharger Planche d'Impression (A4 PDF)
                </>
              )}
            </button>
            <button 
              onClick={() => { stopCamera(); onClose(); }}
              className="px-6 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition text-sm"
            >
              Fermer l'éditeur
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: REAL-TIME BADGE VISUAL PREVIEW (40%) */}
        <div className="w-full md:w-[360px] bg-slate-900 p-6 md:p-8 flex flex-col items-center justify-between border-t md:border-t-0 md:border-l border-slate-800">
          
          <div className="text-center w-full">
            <span className="text-[10px] font-bold text-emerald-400 tracking-widest uppercase">Aperçu Haute Définition</span>
            <div className="flex bg-slate-800 rounded-lg p-1 mt-2 w-fit mx-auto mb-6">
              <button 
                onClick={() => setPreviewSide('recto')}
                className={`px-4 py-1 rounded-md text-xs font-bold transition ${previewSide === 'recto' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                RECTO (Face)
              </button>
              <button 
                onClick={() => setPreviewSide('verso')}
                className={`px-4 py-1 rounded-md text-xs font-bold transition ${previewSide === 'verso' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                VERSO (Dos)
              </button>
            </div>
          </div>

          {/* BADGE COMPONENT SIMULATOR (Fits exact 85x120 aspect ratio) */}
          <div className="relative w-[240px] h-[338px] bg-white rounded-xl border-4 border-slate-800 shadow-2xl overflow-hidden text-slate-800 flex flex-col justify-between p-2 select-none">
            
            {/* Inner frame decor */}
            <div className="absolute inset-1 border border-amber-600/30 rounded-lg pointer-events-none"></div>

            {previewSide === 'recto' ? (
              // RECTO SIMULATION
              <div className="h-full flex flex-col justify-between relative">
                {/* Tricolor slot band */}
                <div className="w-full flex h-3.5 rounded-sm overflow-hidden mb-1">
                  <div className="w-1/3 bg-orange-500 h-full"></div>
                  <div className="w-1/3 bg-white border-y border-slate-200 h-full"></div>
                  <div className="w-1/3 bg-emerald-600 h-full"></div>
                </div>

                {/* Neck slot hole sim */}
                <div className="w-10 h-1.5 bg-slate-900 rounded-sm mx-auto -mt-2.5 z-10"></div>

                {/* Org header */}
                <div className="text-center mt-2">
                  <h5 className="text-[6.5px] font-extrabold text-slate-900 leading-none">UNION DES JEUNES DU PORT</h5>
                  <span className="text-[5.5px] font-bold text-slate-600 leading-none block mt-0.5">POUR L'ASSISTANCE ET LA SÉCURITÉ</span>
                  <span className="text-[9px] font-black text-orange-500 tracking-wider block mt-1 leading-none">U. J. P. A. S.</span>
                </div>

                <div className="h-[0.5px] bg-slate-300 w-[90%] mx-auto my-1"></div>

                {/* Photo row */}
                <div className="flex justify-between items-center px-2 mt-1">
                  {/* Miniature Logo */}
                  <img src="/public/logo-ujpas.png" alt="UJPAS Logo" className="w-6 h-6 object-contain shrink-0" onError={(e) => { e.currentTarget.src = 'https://placehold.co/100x100?text=UJPAS'; }} />
                  
                  {/* Card photo frame */}
                  <div className="w-16 h-20 bg-slate-100 border border-slate-900 rounded overflow-hidden flex items-center justify-center shrink-0">
                    {photoUrl ? (
                      <img src={photoUrl} alt="Identity Photo" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <User className="w-6 h-6 text-slate-300" />
                        <span className="text-[5px] text-slate-400 scale-[0.8]">PHOTO</span>
                      </div>
                    )}
                  </div>

                  {/* Simulated QR Code */}
                  <div className="w-6 h-6 bg-slate-200 border border-slate-900 rounded p-0.5 flex items-center justify-center shrink-0">
                    <div className="grid grid-cols-3 gap-[1px] w-full h-full opacity-60">
                      {[...Array(9)].map((_, i) => (
                        <div key={i} className={`w-full h-full ${i % 2 === 0 ? 'bg-black' : 'bg-transparent'}`}></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Information Card */}
                <div className="px-2 mt-2 space-y-1 text-left">
                  <div className="flex text-[6.5px]">
                    <span className="font-bold text-slate-500 w-12 uppercase shrink-0">Nom:</span>
                    <span className="font-extrabold text-slate-900 truncate">{name || 'BLÉ'}</span>
                  </div>
                  <div className="flex text-[6.5px]">
                    <span className="font-bold text-slate-500 w-12 uppercase shrink-0">Prénoms:</span>
                    <span className="font-bold text-slate-800 truncate">{firstName || 'Flavien'}</span>
                  </div>
                  <div className="flex text-[6.5px]">
                    <span className="font-bold text-slate-500 w-12 uppercase shrink-0">Matricule:</span>
                    <span className="font-black text-orange-600">{matricule || 'UJPAS-AGT-024'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[5px] mt-1 border-t border-dashed border-slate-100 pt-1 text-slate-500 font-bold">
                    <div>BRIGADE: <span className="text-slate-800">{brigade}</span></div>
                    <div>SECTEUR: <span className="text-slate-800">{sector.slice(0, 10)}</span></div>
                  </div>
                </div>

                {/* Role Bottom Banner */}
                <div className={`mx-1 mt-2 mb-1 p-1 rounded text-center ${role.includes('AGENT') ? 'bg-emerald-700' : 'bg-sky-900'}`}>
                  <span className="text-[8px] font-black text-white block tracking-widest uppercase">{role}</span>
                </div>

                <div className="text-[4px] text-slate-400 font-bold text-center leading-none mt-1">
                  RÉPUBLIQUE DE CÔTE D'IVOIRE
                </div>
              </div>
            ) : (
              // VERSO SIMULATION
              <div className="h-full flex flex-col justify-between relative text-left">
                {/* Reverse tricolor slot band */}
                <div className="w-full flex h-3.5 rounded-sm overflow-hidden mb-1">
                  <div className="w-1/3 bg-emerald-600 h-full"></div>
                  <div className="w-1/3 bg-white border-y border-slate-200 h-full"></div>
                  <div className="w-1/3 bg-orange-500 h-full"></div>
                </div>

                {/* Slot Hole */}
                <div className="w-10 h-1.5 bg-slate-900 rounded-sm mx-auto -mt-2.5 z-10"></div>

                {/* Title */}
                <div className="text-center mt-1">
                  <h5 className="text-[7px] font-extrabold text-slate-900 leading-none">DISPOSITIONS LÉGALES</h5>
                  <div className="h-[0.5px] bg-slate-300 w-[60%] mx-auto my-1"></div>
                </div>

                {/* Legal Summary */}
                <p className="text-[4.8px] text-slate-600 leading-tight px-1 font-medium">
                  Art. 5 : Le titulaire est membre actif assermenté de l'UJPAS. Les autorités sont priées de lui accorder assistance pour la facilitation, fluidité et sécurité routière sur l'ensemble du corridor industriel portuaire de Vridi Abidjan.
                </p>

                {/* Health & Emergency Box */}
                <div className="bg-amber-50 border border-amber-500/20 rounded p-1.5 mx-1 mt-1 space-y-0.5">
                  <div className="text-[6px] font-black text-amber-800 text-center leading-none uppercase border-b border-amber-200 pb-0.5">Urgence & Santé</div>
                  <div className="text-[5px] text-slate-700 font-bold">GROUPE SANGUIN: <span className="text-red-600">{bloodGroup}</span></div>
                  <div className="text-[5px] text-slate-700 font-bold">CNI / ID CARD: <span className="text-slate-900">{cniNumber || 'M-2291038'}</span></div>
                  <div className="text-[5px] text-slate-700 font-bold truncate">PARENT N°: <span className="text-slate-900">{emergencyPhone || '01 03 31 37 68'}</span></div>
                </div>

                {/* Stamp and Signature block */}
                <div className="relative h-14 mt-1 px-1 flex justify-between items-end">
                  <div className="text-left">
                    <span className="text-[5px] font-bold text-slate-400 block leading-none">LE PRÉSIDENT,</span>
                    <span className="text-[5.5px] font-extrabold text-slate-800 block mt-1">M. BLÉ FLAVIEN</span>
                    <div className="w-16 h-[0.5px] bg-blue-600 mt-2"></div>
                  </div>
                  
                  {/* Sceau administratif mini-overlay */}
                  <img src="/public/cachet-ujpas.png" alt="Stamp Cachet" className="w-11 h-11 object-contain shrink-0 rotate-12 -mb-2" onError={(e) => { e.currentTarget.src = 'https://placehold.co/100x100?text=UJPAS+Stamp'; }} />
                </div>

                {/* Verso Dark Footer */}
                <div className="bg-slate-900 text-white p-1 rounded text-center mx-0.5 mb-1 leading-tight">
                  <span className="text-[4px] block font-bold text-slate-300">GONZAGUEVILLE, PORT-BOUËT | ABIDJAN</span>
                  <span className="text-[5px] block font-black text-amber-400 mt-0.5">INFOLINE: 01 03 31 37 68</span>
                </div>
              </div>
            )}
          </div>

          <div className="text-center text-xs text-slate-400 flex items-center gap-1.5 bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-800 mt-4 w-full justify-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />
            <span>Format standardisé lamination</span>
          </div>
        </div>

      </div>
    </div>
  );
};
