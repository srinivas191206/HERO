'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, BookOpen, Building2, CheckCircle2, Copy, Download, ExternalLink,
  Eye, EyeOff, Info, KeyRound, Layers, Lock, MapPin, Plus, RefreshCw, ShieldCheck,
  Tag, UserCheck, UserPlus, Users, X
} from 'lucide-react';
import { AP_DISTRICTS } from '../../utils/apDistricts';
import { SupabaseStateClient } from '../../services/cloud/SupabaseStateClient';
import { DistrictSummary, User } from '../../types';

interface GeneratedCredential {
  badgeNumber: string;
  name: string;
  pin: string;
  role?: 'officer' | 'dispatcher';
  teamName?: string;
}

interface ProvisioningOutcome {
  kind: 'district' | 'batch' | 'single';
  districtId: string;
  districtName: string;
  districtCode: string;
  nodeKey?: string;
  credentials: GeneratedCredential[];
  summaryText: string;
}

interface PartialRecoveryState {
  districtId: string;
  districtName: string;
  districtCode: string;
  nodeKey: string;
  requestedCount: number;
  errorText: string;
}

interface ProvisioningWorkspaceProps {
  districts: DistrictSummary[];
  officers: User[];
  token: string | null;
  authMode: 'local' | 'cloud';
  backendUrl: string;
  onRefreshState: () => Promise<void> | void;
  onOpenDistrictHub: (districtId: string) => void;
  onExportBundle: (district: DistrictSummary) => Promise<void> | void;
  onReturnToHub: () => void;
}

const getErrMsg = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback;

export const ProvisioningWorkspace: React.FC<ProvisioningWorkspaceProps> = ({
  districts,
  officers,
  token,
  authMode,
  backendUrl,
  onRefreshState,
  onOpenDistrictHub,
  onExportBundle,
  onReturnToHub
}) => {
  // Left Panel — Create Disaster Response District state
  const [selectedPresetDistrict, setSelectedPresetDistrict] = useState<string>('');
  const [distName, setDistName] = useState<string>('');
  const [distCode, setDistCode] = useState<string>('');
  const [distState, setDistState] = useState<string>('Andhra Pradesh');
  const [distLat, setDistLat] = useState<string>('17.6868');
  const [distLng, setDistLng] = useState<string>('83.2185');
  const [distOfficerCount, setDistOfficerCount] = useState<number>(5);
  const [submittingDistrict, setSubmittingDistrict] = useState<boolean>(false);
  const [districtFormError, setDistrictFormError] = useState<string | null>(null);
  const [partialRecovery, setPartialRecovery] = useState<PartialRecoveryState | null>(null);

  // Right Panel — Assign District Personnel state
  const [assignMode, setAssignMode] = useState<'batch' | 'single'>('batch');
  const [selectedTargetDistrictId, setSelectedTargetDistrictId] = useState<string>('');
  const [batchCount, setBatchCount] = useState<number>(5);
  const [batchPrefix, setBatchPrefix] = useState<string>('');
  const [batchPin, setBatchPin] = useState<string>('police');
  const [officerRole, setOfficerRole] = useState<'officer' | 'dispatcher'>('officer');
  const [badgeNumber, setBadgeNumber] = useState<string>('');
  const [officerName, setOfficerName] = useState<string>('');
  const [officerPin, setOfficerPin] = useState<string>('police');
  const [showSinglePin, setShowSinglePin] = useState<boolean>(false);
  const [submittingPersonnel, setSubmittingPersonnel] = useState<boolean>(false);
  const [personnelFormError, setPersonnelFormError] = useState<string | null>(null);

  // Outcome & Confirmation Modal state
  const [outcome, setOutcome] = useState<ProvisioningOutcome | null>(null);
  const [copiedBanner, setCopiedBanner] = useState<boolean>(false);

  const effectiveTargetDistrictId = useMemo(() => {
    if (selectedTargetDistrictId && districts.some(d => d.id === selectedTargetDistrictId)) {
      return selectedTargetDistrictId;
    }
    return districts[0]?.id || '';
  }, [selectedTargetDistrictId, districts]);

  const targetDistrictObj = useMemo(
    () => districts.find(d => d.id === effectiveTargetDistrictId) || null,
    [districts, effectiveTargetDistrictId]
  );

  // Existing conflict checks
  const cleanCodeUpper = distCode.trim().toUpperCase();
  const duplicateCodeDistrict = useMemo(
    () => (cleanCodeUpper ? districts.find(d => d.code.toUpperCase() === cleanCodeUpper) || null : null),
    [districts, cleanCodeUpper]
  );

  const existingBadgeSet = useMemo(
    () => new Set(officers.map(o => o.badgeNumber.toLowerCase())),
    [officers]
  );

  const effectiveBatchPrefix = useMemo(() => {
    const manual = batchPrefix.trim().toLowerCase();
    if (manual) return manual;
    if (!targetDistrictObj) return 'p';
    return targetDistrictObj.id === 'd_eluru' ? 'p' : `${targetDistrictObj.code.toLowerCase()}_p`;
  }, [batchPrefix, targetDistrictObj]);

  const validateDistrictForm = (): string | null => {
    if (distName.trim().length < 2) {
      return 'District Name must be at least 2 characters.';
    }
    if (!/^[A-Z0-9_-]{2,8}$/.test(cleanCodeUpper)) {
      return 'District Code must be 2–8 alphanumeric characters (e.g. VZG, ELR, KKD).';
    }
    if (duplicateCodeDistrict) {
      return `District code "${cleanCodeUpper}" is already registered to ${duplicateCodeDistrict.name}.`;
    }
    const lat = Number(distLat);
    const lng = Number(distLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return 'HQ Latitude must be a valid coordinate between -90 and 90.';
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return 'HQ Longitude must be a valid coordinate between -180 and 180.';
    }
    if (!Number.isInteger(distOfficerCount) || distOfficerCount < 0 || distOfficerCount > 50) {
      return 'Deploy Officers count must be an integer between 0 and 50.';
    }
    return null;
  };

  const handleOpenDistrictConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setDistrictFormError(null);
    const err = validateDistrictForm();
    if (err) {
      setDistrictFormError(err);
      return;
    }
    const dlg = document.getElementById('hero-confirm-district-dialog') as HTMLDialogElement | null;
    dlg?.showModal();
  };

  const executeCreateDistrict = async () => {
    if (!token) return;
    const dlg = document.getElementById('hero-confirm-district-dialog') as HTMLDialogElement | null;
    dlg?.close();

    setDistrictFormError(null);
    setPartialRecovery(null);
    setSubmittingDistrict(true);

    const parsedLat = parseFloat(distLat);
    const parsedLng = parseFloat(distLng);

    try {
      if (authMode === 'cloud') {
        const created = await SupabaseStateClient.createDistrict(token, {
          name: distName.trim(),
          code: cleanCodeUpper,
          stateName: distState.trim() || 'Andhra Pradesh',
          centerLat: parsedLat,
          centerLng: parsedLng
        });

        let deployed: GeneratedCredential[] = [];
        if (distOfficerCount > 0) {
          try {
            deployed = await SupabaseStateClient.batchDeployOfficers(token, {
              districtId: created.district.id,
              count: distOfficerCount,
              defaultPin: 'police'
            });
          } catch (officerErr: unknown) {
            setPartialRecovery({
              districtId: created.district.id,
              districtName: created.district.name,
              districtCode: created.district.code,
              nodeKey: created.nodeKey,
              requestedCount: distOfficerCount,
              errorText: getErrMsg(officerErr, 'Initial officer deployment failed in State Cloud.')
            });
            setSelectedTargetDistrictId(created.district.id);
            await onRefreshState();
            return;
          }
        }

        setOutcome({
          kind: 'district',
          districtId: created.district.id,
          districtName: created.district.name,
          districtCode: created.district.code,
          nodeKey: created.nodeKey,
          credentials: deployed,
          summaryText: `Created "${created.district.name}" (${created.district.code}) with ${deployed.length} officer credentials in State Cloud.`
        });
        setSelectedTargetDistrictId(created.district.id);
        setSelectedPresetDistrict('');
        setDistName('');
        setDistCode('');
        await onRefreshState();
        return;
      }

      const res = await fetch(`${backendUrl}/api/state/districts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: distName.trim(),
          code: cleanCodeUpper,
          stateName: distState.trim() || 'Andhra Pradesh',
          centerLat: parsedLat,
          centerLng: parsedLng,
          officerCount: distOfficerCount,
          defaultPin: 'police'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDistrictFormError(data.error || `Failed to create district (HTTP ${res.status}).`);
        return;
      }

      const deployed: GeneratedCredential[] = data.deployedOfficers || [];
      setOutcome({
        kind: 'district',
        districtId: data.district.id,
        districtName: data.district.name,
        districtCode: data.district.code,
        nodeKey: data.nodeKey,
        credentials: deployed,
        summaryText: `Created "${data.district.name}" (${data.district.code}) with ${deployed.length} officer credentials.`
      });
      setSelectedTargetDistrictId(data.district.id);
      setSelectedPresetDistrict('');
      setDistName('');
      setDistCode('');
      await onRefreshState();
    } catch (err: unknown) {
      setDistrictFormError(getErrMsg(err, 'Network error while provisioning district hub.'));
    } finally {
      setSubmittingDistrict(false);
    }
  };

  const handleRetryPartialOfficers = async () => {
    if (!token || !partialRecovery) return;
    setSubmittingDistrict(true);
    setDistrictFormError(null);
    try {
      const deployed =
        authMode === 'cloud'
          ? await SupabaseStateClient.batchDeployOfficers(token, {
              districtId: partialRecovery.districtId,
              count: partialRecovery.requestedCount,
              defaultPin: 'police'
            })
          : await (async () => {
              const res = await fetch(`${backendUrl}/api/officers/batch`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  districtId: partialRecovery.districtId,
                  count: partialRecovery.requestedCount,
                  defaultPin: 'police'
                })
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(body.error || 'Officer batch deployment failed.');
              return (body.created || []) as GeneratedCredential[];
            })();

      setOutcome({
        kind: 'district',
        districtId: partialRecovery.districtId,
        districtName: partialRecovery.districtName,
        districtCode: partialRecovery.districtCode,
        nodeKey: partialRecovery.nodeKey,
        credentials: deployed,
        summaryText: `Recovered initial deployment: generated ${deployed.length} officer credentials for "${partialRecovery.districtName}".`
      });
      setPartialRecovery(null);
      await onRefreshState();
    } catch (err: unknown) {
      setPartialRecovery(prev =>
        prev
          ? {
              ...prev,
              errorText: getErrMsg(err, 'Retry failed while deploying officers.')
            }
          : null
      );
    } finally {
      setSubmittingDistrict(false);
    }
  };

  const handleBatchDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setPersonnelFormError(null);

    if (!targetDistrictObj) {
      setPersonnelFormError('Select a provisioned Target District before generating PIDs.');
      return;
    }
    if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 50) {
      setPersonnelFormError('Person Count must be an integer between 1 and 50.');
      return;
    }
    if (batchPrefix.trim() && !/^[a-zA-Z0-9_-]{1,12}$/.test(batchPrefix.trim())) {
      setPersonnelFormError('PID Prefix may only contain 1–12 letters, numbers, "-" or "_".');
      return;
    }
    if (batchPin.trim().length < 4) {
      setPersonnelFormError('Default PIN must be at least 4 characters.');
      return;
    }

    setSubmittingPersonnel(true);
    try {
      const created: GeneratedCredential[] =
        authMode === 'cloud'
          ? await SupabaseStateClient.batchDeployOfficers(token, {
              districtId: targetDistrictObj.id,
              count: batchCount,
              prefix: batchPrefix.trim() || undefined,
              defaultPin: batchPin.trim()
            })
          : await (async () => {
              const res = await fetch(`${backendUrl}/api/officers/batch`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  districtId: targetDistrictObj.id,
                  count: batchCount,
                  prefix: batchPrefix.trim() || undefined,
                  defaultPin: batchPin.trim()
                })
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || 'Failed to batch deploy officers.');
              return (data.created || []) as GeneratedCredential[];
            })();

      setOutcome({
        kind: 'batch',
        districtId: targetDistrictObj.id,
        districtName: targetDistrictObj.name,
        districtCode: targetDistrictObj.code,
        credentials: created,
        summaryText: `Deployed ${created.length} new officer PIDs into ${targetDistrictObj.name} (${targetDistrictObj.code}).`
      });
      await onRefreshState();
    } catch (err: unknown) {
      setPersonnelFormError(getErrMsg(err, 'Failed to generate batch personnel PIDs.'));
    } finally {
      setSubmittingPersonnel(false);
    }
  };

  const handleAssignSingleUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setPersonnelFormError(null);

    if (!targetDistrictObj) {
      setPersonnelFormError('Select a Target District before assigning personnel.');
      return;
    }
    const cleanBadge = badgeNumber.trim();
    if (cleanBadge.length < 2) {
      setPersonnelFormError('Badge / Login ID must be at least 2 characters.');
      return;
    }
    if (existingBadgeSet.has(cleanBadge.toLowerCase())) {
      setPersonnelFormError(`Badge / Login ID "${cleanBadge}" is already assigned. Choose a unique PID.`);
      return;
    }
    if (officerName.trim().length < 2) {
      setPersonnelFormError('Full Name is required.');
      return;
    }
    if (officerPin.trim().length < 4) {
      setPersonnelFormError('Access PIN must be at least 4 characters.');
      return;
    }

    setSubmittingPersonnel(true);
    try {
      const created =
        authMode === 'cloud'
          ? await SupabaseStateClient.assignUser(token, {
              badgeNumber: cleanBadge,
              name: officerName.trim(),
              pin: officerPin.trim(),
              role: officerRole,
              districtId: targetDistrictObj.id
            })
          : await (async () => {
              const res = await fetch(`${backendUrl}/api/state/users`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  badgeNumber: cleanBadge,
                  name: officerName.trim(),
                  pin: officerPin.trim(),
                  role: officerRole,
                  districtId: targetDistrictObj.id
                })
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || 'Failed to assign user.');
              return data;
            })();

      setOutcome({
        kind: 'single',
        districtId: targetDistrictObj.id,
        districtName: targetDistrictObj.name,
        districtCode: targetDistrictObj.code,
        credentials: [
          {
            badgeNumber: created.badgeNumber || cleanBadge,
            name: created.name || officerName.trim(),
            pin: officerPin.trim(),
            role: officerRole
          }
        ],
        summaryText: `Assigned ${officerRole} "${created.name || officerName.trim()}" (${created.badgeNumber || cleanBadge}) to ${targetDistrictObj.name}.`
      });
      setBadgeNumber('');
      setOfficerName('');
      await onRefreshState();
    } catch (err: unknown) {
      setPersonnelFormError(getErrMsg(err, 'Failed to assign personnel account.'));
    } finally {
      setSubmittingPersonnel(false);
    }
  };

  const outcomeDistrictObj = outcome ? districts.find(d => d.id === outcome.districtId) || null : null;

  return (
    <div className="space-y-5">
      {/* Page-Level Heading & Provisioning Guide Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#0B193D] tracking-tight leading-tight">
              Create &amp; Assign Districts
            </h2>
            <p className="text-xs sm:text-[13px] text-slate-500 font-medium mt-0.5">
              Provision new district command hubs and deploy authorized personnel
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const dlg = document.getElementById('hero-provisioning-guide-dialog') as HTMLDialogElement | null;
            dlg?.showModal();
          }}
          className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 text-[#0B193D] text-xs font-bold inline-flex items-center gap-2 shadow-xs cursor-pointer transition"
        >
          <BookOpen className="w-4 h-4 text-[#0788C9]" aria-hidden="true" />
          <span>Provisioning Guide</span>
        </button>
      </div>

      {/* Partial Failure Safe Recovery Banner */}
      {partialRecovery && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-3 text-xs text-amber-950 shadow-xs"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#D99A28] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-extrabold text-amber-900">
                  Partial Provisioning Outcome: Hub Created ({partialRecovery.districtName})
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  The district hub and node key were saved, but initial deployment of{' '}
                  {partialRecovery.requestedCount} officers failed: {partialRecovery.errorText}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRetryPartialOfficers}
              disabled={submittingDistrict}
              className="px-3.5 py-2 rounded-xl bg-[#D99A28] hover:bg-amber-600 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${submittingDistrict ? 'animate-spin' : ''}`} />
              <span>Retry Officer Deployment Only</span>
            </button>
          </div>
          <pre className="font-mono text-[11px] bg-white p-2.5 rounded-xl border border-amber-200 select-all overflow-x-auto">
            {`DISTRICT_ID=${partialRecovery.districtId}\nDISTRICT_NODE_KEY=${partialRecovery.nodeKey}`}
          </pre>
        </div>
      )}

      {/* Post-Provisioning Success Result Panel */}
      {outcome && (
        <section
          aria-label="Provisioning Result"
          className="bg-white border border-emerald-300 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-[#16A477] flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#0B193D]">
                  {outcome.summaryText}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  District Hub: <span className="font-semibold text-[#0B193D]">{outcome.districtName}</span> (
                  {outcome.districtCode}) • Status:{' '}
                  <span className="font-semibold text-[#16A477]">Provisioned &amp; Synced</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenDistrictHub(outcome.districtId)}
                className="px-3 py-1.5 rounded-xl bg-[#0788C9] hover:bg-[#066CA1] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Open District Hub</span>
              </button>
              {outcomeDistrictObj && (
                <button
                  type="button"
                  onClick={() => onExportBundle(outcomeDistrictObj)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 text-[#0B193D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download Pack</span>
                </button>
              )}
              <button
                type="button"
                onClick={onReturnToHub}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F5F8FC] border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition"
              >
                Operations Hub
              </button>
              <button
                type="button"
                onClick={() => setOutcome(null)}
                aria-label="Dismiss provisioning summary"
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {outcome.nodeKey && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/80 text-xs space-y-1.5">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                <span>District Node Key (Save once for local District Server `.env`)</span>
              </div>
              <pre className="font-mono text-[11px] bg-white p-2.5 rounded-lg border border-amber-200 select-all overflow-x-auto text-[#0B193D]">
                {`DISTRICT_ID=${outcome.districtId}\nDISTRICT_NODE_KEY=${outcome.nodeKey}`}
              </pre>
            </div>
          )}

          {outcome.credentials.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0B193D] inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#16A477]" aria-hidden="true" />
                  <span>Provisioned Personnel Accounts ({outcome.credentials.length})</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const text = outcome.credentials
                      .map(c => `${c.badgeNumber} / ${c.pin} (${c.name})`)
                      .join('\n');
                    navigator.clipboard?.writeText(text);
                    setCopiedBanner(true);
                    setTimeout(() => setCopiedBanner(false), 2000);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#F5F8FC] hover:bg-slate-100 border border-slate-200 text-xs font-bold text-[#0B193D] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copiedBanner ? 'Copied' : 'Copy Credentials'}</span>
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {outcome.credentials.map((cred, idx) => (
                  <div
                    key={`${cred.badgeNumber}-${idx}`}
                    className="bg-[#F5F8FC] border border-slate-200 rounded-xl p-2.5 font-mono text-[11px]"
                  >
                    <div className="font-extrabold text-[#0788C9] truncate">PID: {cred.badgeNumber}</div>
                    <div className="text-[#0B193D] font-bold">PIN: {cred.pin}</div>
                    <div className="text-[10px] text-slate-500 font-sans truncate">{cred.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* MAIN TWO-COLUMN PROVISIONING WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* LEFT PANEL: CREATE DISASTER RESPONSE DISTRICT */}
        <section
          aria-label="Create Disaster Response District"
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
        >
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] text-[#0788C9] flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#0B193D] leading-tight">
                  Create Disaster Response District
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Provision a new district command hub with geo-coordinates and initial officers
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap ${
                submittingDistrict
                  ? 'bg-sky-50 border-sky-200 text-[#0788C9]'
                  : 'bg-amber-50 border-amber-200 text-[#D99A28]'
              }`}
            >
              {submittingDistrict ? 'Provisioning...' : 'Provisioning'}
            </span>
          </div>

          <form onSubmit={handleOpenDistrictConfirm} className="space-y-5 text-xs">
            {/* SECTION 01 — DISTRICT SELECTION */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#0788C9] text-white text-[11px] font-extrabold flex items-center justify-center">
                  1
                </span>
                <span className="text-[13px] font-bold text-[#0B193D]">1. District Selection</span>
              </div>

              <div>
                <label
                  htmlFor="ap-28-district-select"
                  className="text-xs font-semibold text-slate-600 block mb-1.5"
                >
                  Quick-select from AP 28 districts (Auto-fill coordinates)
                </label>
                <div className="relative">
                  <MapPin
                    className="w-4 h-4 text-[#0788C9] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <select
                    id="ap-28-district-select"
                    value={selectedPresetDistrict}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedPresetDistrict(val);
                      setDistrictFormError(null);
                      const chosen = AP_DISTRICTS.find(d => d.district === val);
                      if (chosen) {
                        setDistName(`${chosen.district} District Hub`);
                        setDistCode(chosen.code);
                        setDistState('Andhra Pradesh');
                        setDistLat(String(chosen.centerLat));
                        setDistLng(String(chosen.centerLng));
                      }
                    }}
                    className="w-full h-10 pl-9 pr-3 bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl font-semibold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
                  >
                    <option value="">-- Select AP District to auto-fill coordinates --</option>
                    {AP_DISTRICTS.map(d => {
                      const alreadyProvisioned = districts.some(
                        ex => ex.code.toUpperCase() === d.code.toUpperCase()
                      );
                      return (
                        <option key={d.district} value={d.district}>
                          {d.district} ({d.code}) — {d.centerLat.toFixed(4)}, {d.centerLng.toFixed(4)}
                          {alreadyProvisioned ? ' [Provisioned]' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 02 — DISTRICT DETAILS */}
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 pt-2">
                <span className="w-5 h-5 rounded-full bg-[#0788C9] text-white text-[11px] font-extrabold flex items-center justify-center">
                  2
                </span>
                <span className="text-[13px] font-bold text-[#0B193D]">2. District Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-7">
                  <label htmlFor="district-name-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    District Name <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="district-name-input"
                    type="text"
                    required
                    placeholder="e.g. Visakhapatnam District Hub"
                    value={distName}
                    onChange={e => {
                      setDistName(e.target.value);
                      setDistrictFormError(null);
                    }}
                    className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-medium text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                  />
                </div>
                <div className="sm:col-span-5">
                  <label htmlFor="district-code-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    District Code <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="district-code-input"
                    type="text"
                    required
                    maxLength={8}
                    placeholder="e.g. VZG"
                    value={distCode}
                    onChange={e => {
                      setDistCode(e.target.value.toUpperCase());
                      setDistrictFormError(null);
                    }}
                    className={`w-full h-10 px-3 bg-[#F5F8FC] border rounded-xl font-mono font-bold uppercase text-[#0B193D] focus:outline-none focus:bg-white ${
                      duplicateCodeDistrict
                        ? 'border-[#D93636] focus:border-[#D93636]'
                        : 'border-slate-200 focus:border-[#0788C9]'
                    }`}
                  />
                  {duplicateCodeDistrict && (
                    <span className="text-[10px] font-semibold text-[#D93636] block mt-1">
                      Already assigned to {duplicateCodeDistrict.name}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="district-state-input" className="text-xs font-semibold text-slate-600 block mb-1">
                  State
                </label>
                <input
                  id="district-state-input"
                  type="text"
                  required
                  value={distState}
                  onChange={e => setDistState(e.target.value)}
                  className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-medium text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                />
              </div>
            </div>

            {/* SECTION 03 — GEOGRAPHIC CONFIGURATION */}
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 pt-2">
                <span className="w-5 h-5 rounded-full bg-[#0788C9] text-white text-[11px] font-extrabold flex items-center justify-center">
                  3
                </span>
                <span className="text-[13px] font-bold text-[#0B193D]">3. Geographic Configuration</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="hq-lat-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    HQ Latitude <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="hq-lat-input"
                    type="number"
                    step="any"
                    required
                    min={-90}
                    max={90}
                    value={distLat}
                    onChange={e => setDistLat(e.target.value)}
                    className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-mono font-semibold text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                  />
                </div>
                <div>
                  <label htmlFor="hq-lng-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    HQ Longitude <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="hq-lng-input"
                    type="number"
                    step="any"
                    required
                    min={-180}
                    max={180}
                    value={distLng}
                    onChange={e => setDistLng(e.target.value)}
                    className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-mono font-semibold text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                  />
                </div>
                <div>
                  <label htmlFor="deploy-officers-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    Deploy Officers <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="deploy-officers-input"
                    type="number"
                    min={0}
                    max={50}
                    required
                    value={distOfficerCount}
                    onChange={e => setDistOfficerCount(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-mono font-bold text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                  />
                </div>
              </div>
            </div>

            {districtFormError && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-red-200 bg-red-50 text-[#D93636] text-xs font-semibold flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{districtFormError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submittingDistrict}
              className="w-full h-11 px-4 rounded-xl bg-[#0788C9] hover:bg-[#066CA1] disabled:opacity-60 text-white text-xs sm:text-[13px] font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
            >
              {submittingDistrict ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Provisioning District Hub...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {distOfficerCount > 0
                      ? `Create District Hub & Generate ${distOfficerCount} Officers`
                      : 'Create District Hub'}
                  </span>
                </>
              )}
            </button>
          </form>
        </section>

        {/* RIGHT PANEL: ASSIGN DISTRICT PERSONNEL */}
        <section
          aria-label="Assign District Personnel"
          className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
        >
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#16A477] flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-[#0B193D] leading-tight">
                  Assign District Personnel
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generate and deploy personnel accounts for a district
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-[#16A477] text-[11px] font-bold whitespace-nowrap">
              Personnel Deployment
            </span>
          </div>

          {/* Mode Switcher Segmented Control */}
          <div
            role="tablist"
            aria-label="Personnel Assignment Mode"
            className="grid grid-cols-2 gap-1.5 p-1 bg-[#F5F8FC] rounded-xl border border-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={assignMode === 'batch'}
              onClick={() => {
                setAssignMode('batch');
                setPersonnelFormError(null);
              }}
              className={`h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition ${
                assignMode === 'batch'
                  ? 'bg-[#0788C9] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0B193D] hover:bg-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Deploy by Count (Batch)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assignMode === 'single'}
              onClick={() => {
                setAssignMode('single');
                setPersonnelFormError(null);
              }}
              className={`h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition ${
                assignMode === 'single'
                  ? 'bg-[#0788C9] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0B193D] hover:bg-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Single Officer / Dispatcher</span>
            </button>
          </div>

          {/* Shared Target District Selector */}
          <div>
            <label htmlFor="target-district-select" className="text-xs font-semibold text-slate-600 block mb-1.5">
              Target District <span className="text-[#D93636]">*</span>
            </label>
            {districts.length === 0 ? (
              <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                No district hubs provisioned yet. Create a District Hub on the left first.
              </div>
            ) : (
              <div className="relative">
                <Building2
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <select
                  id="target-district-select"
                  value={effectiveTargetDistrictId}
                  onChange={e => {
                    setSelectedTargetDistrictId(e.target.value);
                    setPersonnelFormError(null);
                  }}
                  className="w-full h-10 pl-9 pr-3 bg-[#F5F8FC] border border-slate-200 hover:border-[#0788C9] rounded-xl text-xs font-bold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
                >
                  {districts.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {assignMode === 'batch' ? (
            <form onSubmit={handleBatchDeploy} className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F5F8FC] border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="batch-count-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    Person Count <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="batch-count-input"
                    type="number"
                    min={1}
                    max={50}
                    required
                    value={batchCount}
                    onChange={e => setBatchCount(Number(e.target.value))}
                    className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl font-mono font-bold text-[#0B193D] focus:outline-none focus:border-[#0788C9]"
                  />
                </div>
                <div>
                  <label htmlFor="batch-prefix-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    PID Prefix (Optional)
                  </label>
                  <div className="relative">
                    <Tag
                      className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="batch-prefix-input"
                      type="text"
                      maxLength={12}
                      placeholder={`auto (${effectiveBatchPrefix})`}
                      value={batchPrefix}
                      onChange={e => setBatchPrefix(e.target.value)}
                      className="w-full h-10 pl-8 pr-2.5 bg-white border border-slate-200 rounded-xl font-mono text-[#0B193D] focus:outline-none focus:border-[#0788C9]"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="batch-pin-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    Default PIN <span className="text-[#D93636]">*</span>
                  </label>
                  <div className="relative">
                    <Lock
                      className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="batch-pin-input"
                      type="text"
                      required
                      minLength={4}
                      value={batchPin}
                      onChange={e => setBatchPin(e.target.value)}
                      className="w-full h-10 pl-8 pr-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-[#0B193D] focus:outline-none focus:border-[#0788C9]"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] flex items-start gap-2.5 text-xs text-[#0B193D]">
                <Info className="w-4 h-4 text-[#0788C9] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">
                  This will generate <strong>{batchCount}</strong> officer PIDs starting with prefix{' '}
                  <strong className="font-mono">&quot;{effectiveBatchPrefix}&quot;</strong> (skipping
                  any existing badge numbers) and assign them to{' '}
                  <strong>{targetDistrictObj ? targetDistrictObj.name : 'the selected district'}</strong>.
                </p>
              </div>

              {personnelFormError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl border border-red-200 bg-red-50 text-[#D93636] text-xs font-semibold flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{personnelFormError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submittingPersonnel || districts.length === 0}
                className="w-full h-11 px-4 rounded-xl bg-[#16A477] hover:bg-[#128661] disabled:opacity-50 text-white text-xs sm:text-[13px] font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
              >
                {submittingPersonnel ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Generating Personnel PIDs...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    <span>
                      Generate {batchCount} Officer PIDs (PIN:{' '}
                      {batchPin.trim() ? batchPin.trim().toUpperCase() : 'REQUIRED'})
                    </span>
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAssignSingleUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="single-role-select" className="text-xs font-semibold text-slate-600 block mb-1">
                    Personnel Role <span className="text-[#D93636]">*</span>
                  </label>
                  <select
                    id="single-role-select"
                    value={officerRole}
                    onChange={e => setOfficerRole(e.target.value as 'officer' | 'dispatcher')}
                    className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-bold text-[#0B193D] focus:outline-none focus:border-[#0788C9] cursor-pointer"
                  >
                    <option value="officer">Field Officer</option>
                    <option value="dispatcher">District Command Dispatcher</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="single-pid-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    Badge / Login PID <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="single-pid-input"
                    type="text"
                    required
                    placeholder={
                      targetDistrictObj ? `e.g. ${targetDistrictObj.code.toLowerCase()}_p1` : 'e.g. vzg_p1'
                    }
                    value={badgeNumber}
                    onChange={e => {
                      setBadgeNumber(e.target.value);
                      setPersonnelFormError(null);
                    }}
                    className={`w-full h-10 px-3 bg-[#F5F8FC] border rounded-xl font-mono font-bold text-[#0B193D] focus:outline-none focus:bg-white ${
                      badgeNumber.trim() && existingBadgeSet.has(badgeNumber.trim().toLowerCase())
                        ? 'border-[#D93636]'
                        : 'border-slate-200 focus:border-[#0788C9]'
                    }`}
                  />
                  {badgeNumber.trim() && existingBadgeSet.has(badgeNumber.trim().toLowerCase()) && (
                    <span className="text-[10px] font-semibold text-[#D93636] block mt-1">
                      This PID already exists in district records.
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="single-name-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    Full Name <span className="text-[#D93636]">*</span>
                  </label>
                  <input
                    id="single-name-input"
                    type="text"
                    required
                    placeholder="e.g. Inspector Ravi"
                    value={officerName}
                    onChange={e => setOfficerName(e.target.value)}
                    className="w-full h-10 px-3 bg-[#F5F8FC] border border-slate-200 rounded-xl font-medium text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                  />
                </div>
                <div>
                  <label htmlFor="single-pin-input" className="text-xs font-semibold text-slate-600 block mb-1">
                    Access PIN <span className="text-[#D93636]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="single-pin-input"
                      type={showSinglePin ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={officerPin}
                      onChange={e => setOfficerPin(e.target.value)}
                      className="w-full h-10 pl-3 pr-9 bg-[#F5F8FC] border border-slate-200 rounded-xl font-mono font-bold text-[#0B193D] focus:outline-none focus:bg-white focus:border-[#0788C9]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSinglePin(prev => !prev)}
                      aria-label={showSinglePin ? 'Hide access PIN' : 'Show access PIN'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0B193D] cursor-pointer"
                    >
                      {showSinglePin ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#EEF4FD] border border-[#DCE7F7] flex items-start gap-2.5 text-xs text-[#0B193D]">
                <ShieldCheck className="w-4 h-4 text-[#0788C9] flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="leading-relaxed">
                  Account credentials are stored using bcrypt hashing compatible with offline District Node SQLite sync.
                </p>
              </div>

              {personnelFormError && (
                <div
                  role="alert"
                  className="p-3 rounded-xl border border-red-200 bg-red-50 text-[#D93636] text-xs font-semibold flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{personnelFormError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submittingPersonnel || districts.length === 0}
                className="w-full h-11 px-4 rounded-xl bg-[#16A477] hover:bg-[#128661] disabled:opacity-50 text-white text-xs sm:text-[13px] font-bold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition"
              >
                {submittingPersonnel ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    <span>
                      Assign {officerRole === 'dispatcher' ? 'Dispatcher' : 'Field Officer'} to District Roster
                    </span>
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      </div>

      {/* Confirmation Summary Native Modal before Creating District */}
      <dialog
        id="hero-confirm-district-dialog"
        aria-labelledby="confirm-dist-title"
        closedby="any"
        className="m-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-2">
          <h1 id="confirm-dist-title" className="text-base font-extrabold text-[#0B193D]">
            Confirm District Hub Provisioning
          </h1>
          <form method="dialog">
            <button
              type="submit"
              aria-label="Cancel provisioning"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="p-5 space-y-3 text-xs text-slate-600">
          <p>Review the new District Command Hub configuration before provisioning:</p>
          <div className="bg-[#F5F8FC] border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500 font-semibold">District Name</span>
              <span className="font-bold text-[#0B193D]">{distName.trim()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-semibold">District Code</span>
              <span className="font-mono font-bold text-[#0788C9]">{cleanCodeUpper}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-semibold">State</span>
              <span className="font-semibold text-[#0B193D]">{distState.trim()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-semibold">HQ Coordinates</span>
              <span className="font-mono font-semibold text-[#0B193D]">
                {distLat}, {distLng}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-semibold">Initial Officers</span>
              <span className="font-bold text-[#16A477]">{distOfficerCount} Accounts</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <form method="dialog">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
            </form>
            <button
              type="button"
              onClick={executeCreateDistrict}
              className="px-4 py-2 rounded-xl bg-[#0788C9] hover:bg-[#066CA1] text-white text-xs font-bold cursor-pointer"
            >
              Confirm &amp; Provision
            </button>
          </div>
        </div>
      </dialog>

      {/* Provisioning Guide Native Modal (Grounded in documented HERO sync setup) */}
      <dialog
        id="hero-provisioning-guide-dialog"
        aria-labelledby="prov-guide-title"
        closedby="any"
        className="m-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs"
      >
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#0788C9]" aria-hidden="true" />
            <h1 id="prov-guide-title" className="text-base font-extrabold text-[#0B193D]">
              District Node Provisioning Guide
            </h1>
          </div>
          <form method="dialog">
            <button
              type="submit"
              aria-label="Close provisioning guide"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="p-5 space-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="p-3 rounded-xl bg-[#F5F8FC] border border-slate-200 space-y-1">
            <div className="font-bold text-[#0B193D]">1. Create District Hub &amp; Save Node Key</div>
            <p>
              Creating a district hub seeds default <strong>Alpha</strong> and <strong>Bravo</strong> response teams
              and generates a one-time <code className="font-mono">DISTRICT_NODE_KEY</code> for the local District
              Node server&apos;s <code className="font-mono">backend/.env</code>.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F8FC] border border-slate-200 space-y-1">
            <div className="font-bold text-[#0B193D]">2. Offline Provisioning Bundle (.json)</div>
            <p>
              After provisioning, click <strong>Download Pack</strong> (or <strong>Pack</strong> on any District card)
              to export teams and bcrypt-hashed personnel credentials for offline import via{' '}
              <code className="font-mono">/api/sync/import-bundle</code>.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-[#F5F8FC] border border-slate-200 space-y-1">
            <div className="font-bold text-[#0B193D]">3. Sequential PID Generation</div>
            <p>
              Leaving <strong>PID Prefix</strong> blank uses <code className="font-mono">p</code> for Eluru or{' '}
              <code className="font-mono">&lt;code&gt;_p</code> for other districts, automatically skipping existing
              badge numbers to prevent duplicate IDs.
            </p>
          </div>
        </div>
      </dialog>
    </div>
  );
};
