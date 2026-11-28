'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, MapPin, ShieldAlert, Users, X } from 'lucide-react';
import { User } from '../../types';
import {
  CoordinatedLandslideItem,
  EvaluatedLandslideZone,
  FieldObservationCategory,
  FieldReportReviewStatus,
  FieldReportSeverity
} from './landslideTypes';

interface LogObservationModalProps {
  open: boolean;
  onClose: () => void;
  zones: EvaluatedLandslideZone[];
  initialZoneId: string;
  canSyncBackend: boolean;
  onSubmitObservation: (payload: {
    zoneId: string;
    category: FieldObservationCategory;
    severity: FieldReportSeverity;
    note: string;
    lat: number;
    lng: number;
    escalateToCommand: boolean;
  }) => Promise<{ ok: boolean; message: string }>;
}

export const LogObservationModal: React.FC<LogObservationModalProps> = ({
  open,
  onClose,
  zones,
  initialZoneId,
  canSyncBackend,
  onSubmitObservation
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="log-landslide-obs-title"
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      onClick={e => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(94vw,520px)] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      {open && (
        <LogObservationFormBody
          key={initialZoneId}
          zones={zones}
          initialZoneId={initialZoneId}
          canSyncBackend={canSyncBackend}
          onClose={onClose}
          onSubmitObservation={onSubmitObservation}
        />
      )}
    </dialog>
  );
};

const LogObservationFormBody: React.FC<Omit<LogObservationModalProps, 'open'>> = ({
  onClose,
  zones,
  initialZoneId,
  canSyncBackend,
  onSubmitObservation
}) => {
  const initialTarget = zones.find(z => z.zone.id === initialZoneId) || zones[0];
  const [zoneId, setZoneId] = useState(initialTarget?.zone.id || initialZoneId);
  const [category, setCategory] = useState<FieldObservationCategory>('Slope Crack');
  const [severity, setSeverity] = useState<FieldReportSeverity>('Moderate');
  const [note, setNote] = useState('');
  const [latStr, setLatStr] = useState(initialTarget ? initialTarget.zone.lat.toFixed(4) : '18.2350');
  const [lngStr, setLngStr] = useState(initialTarget ? initialTarget.zone.lng.toFixed(4) : '83.0050');
  const [escalateToCommand, setEscalateToCommand] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleZoneChange = (nextId: string) => {
    setZoneId(nextId);
    const target = zones.find(z => z.zone.id === nextId);
    if (target) {
      setLatStr(target.zone.lat.toFixed(4));
      setLngStr(target.zone.lng.toFixed(4));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    const selectedZone = zones.find(z => z.zone.id === zoneId) || zones[0];
    const parsedLat = Number(latStr);
    const parsedLng = Number(lngStr);
    const finalLat = Number.isFinite(parsedLat) ? parsedLat : selectedZone?.zone.lat ?? 18.235;
    const finalLng = Number.isFinite(parsedLng) ? parsedLng : selectedZone?.zone.lng ?? 83.005;

    setSubmitting(true);
    setFeedback(null);
    try {
      const result = await onSubmitObservation({
        zoneId: selectedZone?.zone.id || zoneId,
        category,
        severity,
        note: note.trim(),
        lat: finalLat,
        lng: finalLng,
        escalateToCommand: canSyncBackend && escalateToCommand
      });
      if (result.ok) {
        setNote('');
        onClose();
      } else {
        setFeedback(result.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <Camera className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 id="log-landslide-obs-title" className="text-sm font-black text-slate-900">
              Log Geo-Tagged Field Observation
            </h3>
            <p className="text-[11px] text-slate-500">
              Record slope cracks, rockfalls, or drainage slips along monitored corridors
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close observation dialog"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        <div>
          <label htmlFor="obs-corridor-select" className="block font-bold text-slate-700 mb-1">
            Monitoring Corridor
          </label>
          <select
            id="obs-corridor-select"
            value={zoneId}
            onChange={e => handleZoneChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
          >
            {zones.map(z => (
              <option key={z.zone.id} value={z.zone.id}>
                {z.zone.name} ({z.zone.stateOrDistrict})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="obs-category-select" className="block font-bold text-slate-700 mb-1">
              Observation Type
            </label>
            <select
              id="obs-category-select"
              value={category}
              onChange={e => setCategory(e.target.value as FieldObservationCategory)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
            >
              <option value="Slope Crack">Slope Crack</option>
              <option value="Rockfall">Rockfall</option>
              <option value="Mudslide / Slip">Mudslide / Slip</option>
              <option value="Retaining Wall Distress">Retaining Wall Distress</option>
              <option value="Road Blockage">Road Blockage</option>
            </select>
          </div>

          <div>
            <label htmlFor="obs-severity-select" className="block font-bold text-slate-700 mb-1">
              Hazard Severity
            </label>
            <select
              id="obs-severity-select"
              value={severity}
              onChange={e => setSeverity(e.target.value as FieldReportSeverity)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
            >
              <option value="Observation">Observation</option>
              <option value="Moderate">Moderate Slip</option>
              <option value="High">High Hazard</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="obs-lat-input" className="block font-bold text-slate-700 mb-1">
              Latitude
            </label>
            <input
              id="obs-lat-input"
              type="number"
              step="0.0001"
              required
              value={latStr}
              onChange={e => setLatStr(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="obs-lng-input" className="block font-bold text-slate-700 mb-1">
              Longitude
            </label>
            <input
              id="obs-lng-input"
              type="number"
              step="0.0001"
              required
              value={lngStr}
              onChange={e => setLngStr(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="obs-description-input" className="block font-bold text-slate-700 mb-1">
            Field Description / Km Marker Details
          </label>
          <textarea
            id="obs-description-input"
            required
            rows={3}
            placeholder="e.g., 12m tension crack noticed on shoulder near Hairpin Bend 4 after overnight drizzle..."
            value={note}
            onChange={e => setNote(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
          />
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
          {canSyncBackend ? (
            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={escalateToCommand}
                onChange={e => setEscalateToCommand(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Sync to HERO Command Incident Queue (`/api/incidents`)
            </label>
          ) : (
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" aria-hidden="true" />
              Saved locally to operator console &amp; geo-tagged map pins
            </span>
          )}
        </div>

        {feedback && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold">
            {feedback}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !note.trim()}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Logging...' : 'Submit Observation'}
          </button>
        </div>
      </form>
    </div>
  );
};

interface CoordinateResponseModalProps {
  open: boolean;
  onClose: () => void;
  items: CoordinatedLandslideItem[];
  initialItemKey?: string;
  officers: User[];
  canBackendDispatch: boolean;
  onUpdateFieldReportStatus: (
    reportId: string,
    status: FieldReportReviewStatus,
    assignedUnit?: string
  ) => void;
  onUpdateBackendIncidentStatus: (
    incidentId: string,
    status: 'Open' | 'Dispatched' | 'Resolved' | 'Closed'
  ) => Promise<{ ok: boolean; message: string }>;
  onDispatchOfficerToIncident: (
    incidentId: string,
    assigneeId: string
  ) => Promise<{ ok: boolean; message: string }>;
  onOpenNewObservation: () => void;
}

export const CoordinateResponseModal: React.FC<CoordinateResponseModalProps> = ({
  open,
  onClose,
  items,
  initialItemKey,
  officers,
  canBackendDispatch,
  onUpdateFieldReportStatus,
  onUpdateBackendIncidentStatus,
  onDispatchOfficerToIncident,
  onOpenNewObservation
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="coord-landslide-title"
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      onClick={e => {
        if (e.target === dialogRef.current) onClose();
      }}
      className="m-auto w-[min(94vw,560px)] rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50"
    >
      {open && (
        <CoordinateResponseBody
          key={initialItemKey || items[0]?.key || 'empty'}
          items={items}
          initialItemKey={initialItemKey}
          officers={officers}
          canBackendDispatch={canBackendDispatch}
          onUpdateFieldReportStatus={onUpdateFieldReportStatus}
          onUpdateBackendIncidentStatus={onUpdateBackendIncidentStatus}
          onDispatchOfficerToIncident={onDispatchOfficerToIncident}
          onOpenNewObservation={onOpenNewObservation}
          onClose={onClose}
        />
      )}
    </dialog>
  );
};

const CoordinateResponseBody: React.FC<Omit<CoordinateResponseModalProps, 'open'>> = ({
  onClose,
  items,
  initialItemKey,
  officers,
  canBackendDispatch,
  onUpdateFieldReportStatus,
  onUpdateBackendIncidentStatus,
  onDispatchOfficerToIncident,
  onOpenNewObservation
}) => {
  const initialTarget = items.find(i => i.key === initialItemKey) || items[0];
  const [selectedKey, setSelectedKey] = useState<string>(initialTarget?.key || '');
  const [fieldStatus, setFieldStatus] = useState<FieldReportReviewStatus>(
    initialTarget?.fieldReport?.reviewStatus || 'Under Review'
  );
  const [unitNote, setUnitNote] = useState<string>(initialTarget?.fieldReport?.assignedUnit || '');
  const [incidentStatus, setIncidentStatus] = useState<'Open' | 'Dispatched' | 'Resolved' | 'Closed'>(
    initialTarget?.incident?.status || 'Open'
  );
  const [assigneeId, setAssigneeId] = useState<string>(initialTarget?.incident?.assigneeId || '');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const activeItem = items.find(i => i.key === selectedKey) || items[0];

  const handleSelectItem = (key: string) => {
    setSelectedKey(key);
    setStatusMsg(null);
    const target = items.find(i => i.key === key);
    if (target?.fieldReport) {
      setFieldStatus(target.fieldReport.reviewStatus || 'Under Review');
      setUnitNote(target.fieldReport.assignedUnit || '');
    }
    if (target?.incident) {
      setIncidentStatus(target.incident.status);
      setAssigneeId(target.incident.assigneeId || '');
    }
  };

  const matchedOfficers = (() => {
    if (!activeItem?.incident?.districtId) return officers;
    const sameDistrict = officers.filter(o => o.districtId === activeItem.incident?.districtId);
    return sameDistrict.length > 0 ? sameDistrict : officers;
  })();

  const handleSaveFieldReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem?.fieldReport) return;
    onUpdateFieldReportStatus(activeItem.fieldReport.id, fieldStatus, unitNote.trim() || undefined);
    setStatusMsg({ type: 'ok', text: `Updated ${activeItem.displayId} to "${fieldStatus}".` });
  };

  const handleSaveIncidentAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem?.incident) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      if (assigneeId && assigneeId !== activeItem.incident.assigneeId) {
        const dispatchRes = await onDispatchOfficerToIncident(activeItem.incident.id, assigneeId);
        if (!dispatchRes.ok) {
          setStatusMsg({ type: 'err', text: dispatchRes.message });
          return;
        }
        setStatusMsg({ type: 'ok', text: dispatchRes.message });
        return;
      }

      const statusRes = await onUpdateBackendIncidentStatus(activeItem.incident.id, incidentStatus);
      setStatusMsg({ type: statusRes.ok ? 'ok' : 'err', text: statusRes.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 space-y-4 text-xs">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
            <Users className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 id="coord-landslide-title" className="text-sm font-black text-slate-900">
              Coordinate Response &amp; Assign Field Team
            </h3>
            <p className="text-[11px] text-slate-500">
              Review field observations or dispatch units to active HERO incidents
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close response coordination dialog"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-3">
          <ShieldAlert className="w-7 h-7 text-slate-400 mx-auto" aria-hidden="true" />
          <div>
            <p className="font-bold text-slate-800">No active landslide reports or incidents to coordinate</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Log a geo-tagged field observation first so a response check or dispatch can be coordinated.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewObservation();
              }}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black cursor-pointer"
            >
              Log Field Observation
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="coord-item-select" className="block font-bold text-slate-700 mb-1">
              Select Field Observation or HERO Incident
            </label>
            <select
              id="coord-item-select"
              value={activeItem?.key || ''}
              onChange={e => handleSelectItem(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
            >
              {items.map(item => (
                <option key={item.key} value={item.key}>
                  [{item.displayId}] {item.locationLabel} — {item.observation}
                </option>
              ))}
            </select>
          </div>

          {activeItem && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-800">{activeItem.locationLabel}</span>
                <span className="font-mono text-[10px] font-bold text-slate-500">
                  {activeItem.source === 'incident' ? 'HERO Backend Incident' : 'Geo-Tagged Field Report'}
                </span>
              </div>
              <p className="text-slate-600">{activeItem.observation}</p>
            </div>
          )}

          {activeItem?.source === 'field' && activeItem.fieldReport && (
            <form onSubmit={handleSaveFieldReport} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="coord-field-status" className="block font-bold text-slate-700 mb-1">
                    Review / Verification Status
                  </label>
                  <select
                    id="coord-field-status"
                    value={fieldStatus}
                    onChange={e => setFieldStatus(e.target.value as FieldReportReviewStatus)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
                  >
                    <option value="Under Review">Under Review</option>
                    <option value="Field Check">Field Check</option>
                    <option value="Verified">Verified</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="coord-unit-note" className="block font-bold text-slate-700 mb-1">
                    Field Team / Patrol Tag
                  </label>
                  <input
                    id="coord-unit-note"
                    type="text"
                    placeholder="e.g., SDRF Ghat Unit / PS Team"
                    value={unitNote}
                    onChange={e => setUnitNote(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {statusMsg && (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1.5 ${
                    statusMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {statusMsg.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black cursor-pointer"
                >
                  Save Verification Status
                </button>
              </div>
            </form>
          )}

          {activeItem?.source === 'incident' && activeItem.incident && (
            <form onSubmit={handleSaveIncidentAction} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="coord-inc-status" className="block font-bold text-slate-700 mb-1">
                    Incident Status
                  </label>
                  <select
                    id="coord-inc-status"
                    disabled={!canBackendDispatch}
                    value={incidentStatus}
                    onChange={e =>
                      setIncidentStatus(e.target.value as 'Open' | 'Dispatched' | 'Resolved' | 'Closed')
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:bg-slate-100"
                  >
                    <option value="Open">Open</option>
                    <option value="Dispatched">Dispatched</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="coord-inc-officer" className="block font-bold text-slate-700 mb-1">
                    Assign District Officer
                  </label>
                  <select
                    id="coord-inc-officer"
                    disabled={!canBackendDispatch || matchedOfficers.length === 0}
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 disabled:bg-slate-100"
                  >
                    <option value="">-- Select Officer ({matchedOfficers.length} available) --</option>
                    {matchedOfficers.map(off => (
                      <option key={off.id} value={off.id}>
                        {off.badgeNumber} • {off.name} ({off.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!canBackendDispatch && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">
                  Backend dispatch via `/api/incidents/:id/dispatch` requires local tactical node authentication as State Admin or Dispatcher.
                </p>
              )}

              {statusMsg && (
                <div
                  className={`p-2.5 rounded-xl border text-[11px] font-semibold ${
                    statusMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!canBackendDispatch || busy}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Applying...' : assigneeId && assigneeId !== activeItem.incident.assigneeId ? 'Dispatch Field Officer' : 'Update Incident Status'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
