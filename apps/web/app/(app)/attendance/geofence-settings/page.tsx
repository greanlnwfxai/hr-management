'use client';

import { useEffect, useState, useCallback } from 'react';
import { getGeofenceConfig, updateGeofenceConfig, type GeofenceConfig, ApiError } from '@/lib/api';
import { getUser, isAdmin } from '@/lib/auth';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import AccessDeniedCard from '@/components/AccessDeniedCard';
import Toast, { type ToastData } from '@/components/Toast';
import { useLanguage } from '@/hooks/useLanguage';

const INPUT = 'w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 dark:focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:focus:ring-zinc-400 disabled:opacity-50';
const LABEL = 'block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1';

export default function GeofenceSettingsPage() {
  const { t } = useLanguage();
  const user = getUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const [config, setConfig] = useState<GeofenceConfig | null>(null);

  // Form state
  const [enabled, setEnabled] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radiusMeters, setRadiusMeters] = useState('100');
  const [maxAccuracyMeters, setMaxAccuracyMeters] = useState('100');

  const adminUser = isAdmin(user);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getGeofenceConfig();
      setConfig(cfg);
      setEnabled(cfg.enabled);
      setLatitude(cfg.latitude !== null ? String(cfg.latitude) : '');
      setLongitude(cfg.longitude !== null ? String(cfg.longitude) : '');
      setRadiusMeters(String(cfg.radiusMeters));
      setMaxAccuracyMeters(String(cfg.maxAccuracyMeters));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('geofence_error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!adminUser) return;
    load();
  }, [adminUser, load]);

  if (!adminUser) {
    return <AccessDeniedCard testid="access-denied-geofence-settings" />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast(null);

    const lat = latitude.trim() !== '' ? parseFloat(latitude) : undefined;
    const lon = longitude.trim() !== '' ? parseFloat(longitude) : undefined;
    const radius = parseInt(radiusMeters, 10);
    const accuracy = parseInt(maxAccuracyMeters, 10);

    if (enabled && (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon))) {
      setToast({ type: 'error', message: t('geofence_enable_requires_coords') });
      setSaving(false);
      return;
    }

    try {
      const updated = await updateGeofenceConfig({
        enabled,
        ...(lat !== undefined && !isNaN(lat) ? { latitude: lat } : {}),
        ...(lon !== undefined && !isNaN(lon) ? { longitude: lon } : {}),
        ...(isNaN(radius) ? {} : { radiusMeters: radius }),
        ...(isNaN(accuracy) ? {} : { maxAccuracyMeters: accuracy }),
      });
      setConfig(updated);
      setToast({ type: 'success', message: t('geofence_saved') });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('geofence_error_save');
      setToast({ type: 'error', message: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-6">
        {t('page_geofence_settings')}
      </h1>

      {loading && <LoadingState message={t('loading_default')} />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && (
        <>
          {config && (
            <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">{t('geofence_source_label')}:</span>
              <span className={`rounded px-2 py-0.5 font-medium ${config.source === 'db' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                {config.source === 'db' ? t('geofence_source_db') : t('geofence_source_env')}
              </span>
            </div>
          )}

          <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t('geofence_production_notice')}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Enabled toggle */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="geofence-enabled"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-700"
              />
              <div>
                <label htmlFor="geofence-enabled" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  {t('geofence_enabled_label')}
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t('geofence_enabled_hint')}</p>
              </div>
            </div>

            {/* Latitude */}
            <div>
              <label htmlFor="geofence-lat" className={LABEL}>{t('geofence_latitude_label')}</label>
              <input
                id="geofence-lat"
                type="number"
                step="any"
                min="-90"
                max="90"
                value={latitude}
                onChange={e => setLatitude(e.target.value)}
                className={INPUT}
                placeholder="-90 to 90"
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t('geofence_coords_hint')}</p>
            </div>

            {/* Longitude */}
            <div>
              <label htmlFor="geofence-lon" className={LABEL}>{t('geofence_longitude_label')}</label>
              <input
                id="geofence-lon"
                type="number"
                step="any"
                min="-180"
                max="180"
                value={longitude}
                onChange={e => setLongitude(e.target.value)}
                className={INPUT}
                placeholder="-180 to 180"
              />
            </div>

            {/* Radius */}
            <div>
              <label htmlFor="geofence-radius" className={LABEL}>{t('geofence_radius_label')}</label>
              <input
                id="geofence-radius"
                type="number"
                min="10"
                max="10000"
                value={radiusMeters}
                onChange={e => setRadiusMeters(e.target.value)}
                className={INPUT}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t('geofence_radius_hint')}</p>
            </div>

            {/* Max accuracy */}
            <div>
              <label htmlFor="geofence-accuracy" className={LABEL}>{t('geofence_accuracy_label')}</label>
              <input
                id="geofence-accuracy"
                type="number"
                min="5"
                max="1000"
                value={maxAccuracyMeters}
                onChange={e => setMaxAccuracyMeters(e.target.value)}
                className={INPUT}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
            >
              {saving ? t('geofence_saving') : t('geofence_save')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
