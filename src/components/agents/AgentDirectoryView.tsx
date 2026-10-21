import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Phone,
  ShieldCheck,
  UserCheck,
  UserX,
  CreditCard,
  X,
  Eye,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { AgentBadgeModal } from './AgentBadgeModal';
import type { User, Role } from '../../types';

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export const AgentDirectoryView: React.FC<Props> = ({
  isOpen = true,
  onClose,
  embedded = false,
}) => {
  const { currentUser } = useAuth();
  const { users } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [selectedBadgeAgent, setSelectedBadgeAgent] = useState<User | undefined>(undefined);
  const [badgeModalOpen, setBadgeModalOpen] = useState(false);

  const canManageBadges = currentUser?.role === 'ADMINISTRATEUR';
  const isReadOnlyControleur = currentUser?.role === 'CONTROLEUR';

  const operationalUsers = useMemo(() => {
    return users
      .filter((u) => {
        if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          (u.phone && u.phone.toLowerCase().includes(q)) ||
          (u.matricule && u.matricule.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [users, roleFilter, searchQuery]);

  if (!isOpen || !currentUser) return null;

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMINISTRATEUR':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            ADMIN GÉNÉRAL
          </span>
        );
      case 'RESPONSABLE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            SUPERVISEUR
          </span>
        );
      case 'AGENT':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            AGENT PERCEPTEUR
          </span>
        );
      case 'CONTROLEUR':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            CONTRÔLEUR ROUTIER
          </span>
        );
      default:
        return null;
    }
  };

  const content = (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-white">
                Trombinoscope Officiel U.J.P.A.S. ({operationalUsers.length})
              </h3>
              {isReadOnlyControleur && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                  <Eye className="w-3 h-3" /> Lecture seule
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Identification visuelle et coordonnées des agents et superviseurs assermentés
            </p>
          </div>
        </div>
        {onClose && !embedded && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer self-end sm:self-auto"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Barre de recherche et filtres */}
      <div className="flex flex-col sm:flex-row gap-2.5 bg-slate-950/90 p-3 rounded-xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, identifiant, téléphone ou matricule..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900 pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-hidden"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL', label: 'Tous' },
            { id: 'AGENT', label: 'Agents Terrain' },
            { id: 'RESPONSABLE', label: 'Superviseurs' },
            { id: 'CONTROLEUR', label: 'Contrôleurs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                roleFilter === tab.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grille Trombinoscope */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {operationalUsers.map((person) => (
          <div
            key={person.id}
            className={`rounded-2xl border p-4 transition flex flex-col justify-between gap-3 ${
              person.isActive
                ? 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                : 'border-rose-500/20 bg-rose-950/10 opacity-75'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Photo officielle grand format */}
              <div className="relative shrink-0">
                {person.avatarUrl ? (
                  <img
                    src={person.avatarUrl}
                    alt={person.fullName}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500/50 shadow-md bg-slate-950"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-lg font-black text-emerald-400">
                    {person.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                )}
                <span
                  className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 flex items-center justify-center ${
                    person.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  title={person.isActive ? 'Agent Actif' : 'Compte Désactivé'}
                >
                  {person.isActive ? (
                    <UserCheck className="w-2.5 h-2.5 text-slate-950" />
                  ) : (
                    <UserX className="w-2.5 h-2.5 text-white" />
                  )}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  {getRoleBadge(person.role)}
                </div>
                <h4 className="text-sm font-black text-white truncate" title={person.fullName}>
                  {person.fullName}
                </h4>
                <p className="text-[11px] text-slate-400 font-mono truncate">@{person.username}</p>
                {person.matricule && (
                  <p className="text-[10px] text-emerald-400 font-mono font-bold mt-0.5">
                    Mat: {person.matricule}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] text-slate-500">Téléphone :</span>
                {person.phone ? (
                  <a
                    href={`tel:${person.phone}`}
                    className="font-mono font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Phone className="w-3 h-3" />
                    {person.phone}
                  </a>
                ) : (
                  <span className="text-[11px] text-slate-500 italic">Non renseigné</span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">Statut :</span>
                <span
                  className={`text-[11px] font-bold flex items-center gap-1 ${
                    person.isActive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {person.isActive ? 'Habilité U.J.P.A.S.' : 'Suspendu'}
                </span>
              </div>

              {canManageBadges && (
                <button
                  onClick={() => {
                    setSelectedBadgeAgent(person);
                    setBadgeModalOpen(true);
                  }}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 py-2 text-xs font-bold text-orange-300 transition cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Badge Pro &amp; Photo</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManageBadges && (
        <AgentBadgeModal
          isOpen={badgeModalOpen}
          onClose={() => {
            setBadgeModalOpen(false);
            setSelectedBadgeAgent(undefined);
          }}
          selectedAgent={selectedBadgeAgent}
        />
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-md">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-6xl my-auto rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto">
        {content}
      </div>
    </div>
  );
};
