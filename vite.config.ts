import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import express from 'express';
import {
  handleGetState,
  handlePostUpdate,
  handleGetEvents,
  handleSuperAdminVerify,
  handleSuperAdminUpdate,
  handleHealth,
  handleBackupExport,
  handleBackupRestore,
  handleForceSave,
  handlePermanentSave,
  handleGetSnapshots,
  handleRestoreSnapshot,
  handleGetPricePresets,
  handleSavePricePreset,
  handleDeletePricePreset,
  handleAIAgent,
  handleGetSharedScreens,
  handleSaveSharedScreen,
  handleDeleteSharedScreen,
  handleRepublish,
  handlePublishStatus,
  handleRestaurantThemeUpdate,
  handleRestaurantCustomDomain,
  handlePWAManifest,
  handleUploadDishPhoto,
  handleServeDishPhoto,
  handleVerifyManagerPin,
  handleUpdateManagerPin,
  handleRestaurantSlipConfig,
  handlePrintSlip,
  handleResetState,
  handleReconcileState,
  handleBulkCategoryPhoto
} from './src/api.ts';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'sync-api-middleware',
        configureServer(server) {
          const apiApp = express();
          apiApp.use(express.json({ limit: '200mb' }));
          apiApp.use(express.urlencoded({ extended: true, limit: '200mb' }));

          apiApp.get('/uploads/dishes/:filename', handleServeDishPhoto);
          apiApp.use('/uploads', express.static(path.resolve(process.cwd(), 'public', 'uploads')));

          apiApp.get('/api/print-slip/:orderId?', handlePrintSlip);
          apiApp.get('/print-slip/:orderId?', handlePrintSlip);
          apiApp.get('/api/sync/state', handleGetState);
          apiApp.post('/api/sync/update', handlePostUpdate);
          apiApp.post('/api/sync/reconcile', handleReconcileState);
          apiApp.post('/api/sync/reset', handleResetState);
          apiApp.post('/api/sync/force-save', handleForceSave);
          apiApp.post('/api/admin/permanent-save', handlePermanentSave);
          apiApp.get('/api/admin/snapshots', handleGetSnapshots);
          apiApp.post('/api/admin/snapshots/restore', handleRestoreSnapshot);
          apiApp.get('/api/pricing-presets', handleGetPricePresets);
          apiApp.post('/api/pricing-presets/save', handleSavePricePreset);
          apiApp.post('/api/pricing-presets/delete', handleDeletePricePreset);
          apiApp.post('/api/admin/bulk-category-photo', handleBulkCategoryPhoto);
          apiApp.post('/api/super-admin/ai-agent', handleAIAgent);
          apiApp.get('/api/sync/events', handleGetEvents);
          apiApp.post('/api/auth/superadmin-verify', handleSuperAdminVerify);
          apiApp.post('/api/auth/superadmin-update', handleSuperAdminUpdate);
          apiApp.get('/api/health', handleHealth);
          apiApp.get('/api/backup/export', handleBackupExport);
          apiApp.get('/api/backup/download', handleBackupExport);
          apiApp.post('/api/backup/restore', handleBackupRestore);
          apiApp.get('/api/shared-screens', handleGetSharedScreens);
          apiApp.post('/api/shared-screens/save', handleSaveSharedScreen);
          apiApp.post('/api/shared-screens/delete', handleDeleteSharedScreen);
          apiApp.post('/api/publish/republish', handleRepublish);
          apiApp.get('/api/publish/status', handlePublishStatus);
          apiApp.post('/api/restaurants/:id/theme', handleRestaurantThemeUpdate);
          apiApp.post('/api/restaurants/theme', handleRestaurantThemeUpdate);
          apiApp.post('/api/restaurants/:id/domain', handleRestaurantCustomDomain);
          apiApp.get('/api/pwa/manifest.json', handlePWAManifest);
          apiApp.post('/api/upload/dish-photo', handleUploadDishPhoto);
          apiApp.post('/api/auth/manager-pin-verify', handleVerifyManagerPin);
          apiApp.post('/api/auth/manager-pin-update', handleUpdateManagerPin);
          apiApp.post('/api/restaurants/:id/slip-config', handleRestaurantSlipConfig);
          apiApp.post('/api/restaurants/slip-config', handleRestaurantSlipConfig);

          server.middlewares.use(apiApp);
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
