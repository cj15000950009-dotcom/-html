
import React, { useState, useMemo } from 'react';
import { BackgroundItem, TacticalZone, TacticalLocation } from '../../types';
import { TACTICAL_MAP_ZONES } from '../../constants';

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  backgrounds: BackgroundItem[]; // Kept for reference but not primary
  currentBackgroundUrl: string;
  onTravel: (locationName: string) => void;
  theme?: string;
}

export const MapModal: React.FC<MapModalProps> = ({ 
  isOpen, onClose, currentBackgroundUrl, onTravel, theme = 'night'
}) => {
  const [selectedZone, setSelectedZone] = useState<TacticalZone | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<TacticalLocation | null>(null);

  if (!isOpen) return null;

  const styles = {
      modalBg: theme === 'day' ? 'bg-slate-50 text-slate-900 border-slate-300' : 
               'bg-[#050b14] text-white border-emerald-500/30',
      header: theme === 'day' ? 'bg-white border-slate-200' : 'bg-black/60 border-emerald-500/10',
      accent: 'text-emerald-500',
      mapBg: 'bg-[#020408]',
      detailsPanel: 'bg-[#08101c] border-l border-emerald-500/20',
      button: 'bg-emerald-600 text-slate-950 font-black hover:bg-emerald-400'
  };

  const handleZoneClick = (zone: TacticalZone) => {
      setSelectedZone(zone);
      setSelectedLocation(null);
  };

  const handleLocationClick = (loc: TacticalLocation, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedLocation(loc);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`w-full max-w-7xl h-[90vh] rounded-lg shadow-[0_0_50px_rgba(16,185,129,0.1)] overflow-hidden flex flex-col border clip-tactical-box ${styles.modalBg}`} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className={`h-16 flex justify-between items-center px-8 shrink-0 ${styles.header} border-b z-20 relative`}>
             <div className="flex flex-col">
                 <h2 className={`font-black tracking-[0.3em] text-lg flex items-center gap-3 ${styles.accent} italic uppercase`}>
                     <span className="text-2xl">🗺️</span> 磐石营区战术态势图 // TACTICAL_MAP_V4
                 </h2>
                 <span className="text-[9px] font-mono text-white/30 tracking-[0.5em]">SECTOR: 73RD_BRIGADE_AO</span>
             </div>
             
        </div>

        <div className="flex-1 flex overflow-hidden relative">
            
            {/* SVG Map Container */}
            <div className={`flex-1 relative ${styles.mapBg} overflow-hidden cursor-crosshair group`}>
                {/* Background Grid */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" 
                     style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)', backgroundSize: '50px 50px' }}>
                </div>
                
                <svg viewBox="0 0 800 600" className="w-full h-full object-contain pointer-events-auto">
                    <defs>
                        <pattern id="diagonalHatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                            <line x1="0" y1="0" x2="0" y2="10" style={{stroke: '#10b981', strokeWidth: 1, opacity: 0.1}} />
                        </pattern>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>

                    {/* Geography: Coastline (East) */}
                    <path d="M 500 0 Q 550 100 520 200 T 580 400 T 550 600 L 800 600 L 800 0 Z" fill="#082f49" opacity="0.3" />
                    
                    {/* Geography: Longya Mountain Ridge (West/North) */}
                    <path d="M 0 100 L 150 50 L 300 120 L 250 250 L 100 300 L 0 250 Z" fill="#1e293b" stroke="#334155" strokeWidth="2" opacity="0.6" />
                    <text x="100" y="150" fill="white" fontSize="14" opacity="0.3" fontWeight="bold" letterSpacing="2">磐石山麓 (NORTH)</text>

                    {/* Geography: River/Border */}
                    <path d="M 0 450 Q 100 480 200 460 T 400 500" fill="none" stroke="#64748b" strokeWidth="3" strokeDasharray="5,5" />

                    {/* Zones */}
                    {TACTICAL_MAP_ZONES.map(zone => (
                        <g 
                            key={zone.id} 
                            onClick={() => handleZoneClick(zone)}
                            className={`transition-all duration-300 ${selectedZone?.id === zone.id ? 'opacity-100' : 'opacity-60 hover:opacity-90'}`}
                        >
                            {/* Zone Area */}
                            <rect 
                                x={zone.x} y={zone.y} width={zone.width} height={zone.height} 
                                fill={zone.color} stroke={selectedZone?.id === zone.id ? "#10b981" : "transparent"} 
                                strokeWidth="2"
                                className="transition-all duration-300"
                            />
                            
                            {/* Zone Label */}
                            <text x={zone.x + 10} y={zone.y + 20} fill="#10b981" fontSize="12" fontWeight="bold" letterSpacing="1" filter="url(#glow)">
                                {zone.name}
                            </text>

                            {/* Locations within Zone */}
                            {zone.locations.map(loc => (
                                <g 
                                    key={loc.id} 
                                    transform={`translate(${zone.x + loc.x}, ${zone.y + loc.y})`}
                                    onClick={(e) => handleLocationClick(loc, e)}
                                    className="cursor-pointer"
                                >
                                    <circle r={selectedLocation?.id === loc.id ? "6" : "4"} fill="#10b981" className="animate-pulse" />
                                    <circle r={selectedLocation?.id === loc.id ? "12" : "0"} fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5" />
                                    <text x="10" y="4" fill="white" fontSize="9" opacity="0.8" fontWeight="bold">{loc.name}</text>
                                </g>
                            ))}
                        </g>
                    ))}
                </svg>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 p-4 bg-black/60 border border-white/10 rounded pointer-events-none">
                    <div className="text-[9px] text-white/40 mb-2 font-mono uppercase">Map Legend</div>
                    <div className="flex flex-col gap-1 text-[10px] text-white/70">
                        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-slate-700"></span> 山脉 (Mountain)</div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-sky-900"></span> 水域 (Water)</div>
                        <div className="flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span> 关键地点 (POI)</div>
                    </div>
                </div>
            </div>

            {/* Details Panel */}
            <div className={`w-96 shrink-0 flex flex-col ${styles.detailsPanel} transition-all duration-300 z-10 shadow-2xl`}>
                {selectedLocation ? (
                    <>
                        {selectedLocation.bgUrl && (
                            <div className="h-48 w-full relative overflow-hidden shrink-0">
                                <img src={selectedLocation.bgUrl} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#08101c] to-transparent"></div>
                            </div>
                        )}
                        <div className="p-8 flex-1 flex flex-col gap-6 overflow-y-auto">
                            <div>
                                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">TARGET_LOCATION</div>
                                <h3 className="text-2xl font-black text-white">{selectedLocation.name}</h3>
                                <div className="text-[9px] font-mono text-white/30 mt-1">COORDS: {selectedLocation.x * 12}.{selectedLocation.y * 8} // ZONE: {selectedZone?.name}</div>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="w-full h-px bg-emerald-500/20"></div>
                                <p className="text-sm text-white/80 leading-relaxed font-sans">{selectedLocation.description}</p>
                                <div className="w-full h-px bg-emerald-500/20"></div>
                            </div>

                            <div className="flex-1"></div>
                            
                            <button 
                                onClick={() => onTravel(selectedLocation.name)}
                                className={`w-full py-4 text-xs uppercase tracking-[0.4em] font-black transition-all clip-tactical-sm shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] ${styles.button}`}
                            >
                                战术机动 (MOVE)
                            </button>
                        </div>
                    </>
                ) : selectedZone ? (
                    <div className="p-8 flex-1 flex flex-col gap-6">
                        <div>
                            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">SECTOR_INTEL</div>
                            <h3 className="text-2xl font-black text-white">{selectedZone.name}</h3>
                        </div>
                        <p className="text-sm text-white/70 leading-relaxed">{selectedZone.description}</p>
                        
                        <div className="mt-4">
                            <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">包含地点 (LOCATIONS)</div>
                            <div className="flex flex-col gap-2">
                                {selectedZone.locations.map(loc => (
                                    <button 
                                        key={loc.id}
                                        onClick={(e) => handleLocationClick(loc, e)}
                                        className="text-left px-4 py-3 bg-white/5 border border-white/5 hover:border-emerald-500/50 text-sm font-bold text-white/80 hover:text-white transition-all flex justify-between items-center group"
                                    >
                                        <span>{loc.name}</span>
                                        <span className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">►</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div className="flex-1 flex items-end opacity-30 text-center text-xs italic">
                            请选择具体地点以执行操作...
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center flex-col opacity-30 gap-4">
                        <div className="w-16 h-16 border-2 border-dashed border-white/50 rounded-full flex items-center justify-center animate-spin-slow">
                            <span className="text-2xl">✛</span>
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest">等待战术指令...</span>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
