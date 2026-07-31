import { lazy } from 'react';
/* eslint-disable react/only-export-components -- Lazy-Bildschirme und Router bilden gemeinsam die zentrale Routenkonfiguration. */
import { createHashRouter, Navigate } from 'react-router';
import { AppLayout } from './AppLayout';
import { ModuleGuard } from './ModuleGuard';

const DashboardScreen = lazy(() =>
  import('../features/dashboard/DashboardScreen').then((module) => ({
    default: module.DashboardScreen,
  })),
);
const ZuchtScreen = lazy(() =>
  import('../features/litters/ZuchtScreen').then((module) => ({ default: module.ZuchtScreen })),
);
const LitterDetailScreen = lazy(() =>
  import('../features/litters/LitterDetailScreen').then((module) => ({
    default: module.LitterDetailScreen,
  })),
);
const KittenDetailScreen = lazy(() =>
  import('../features/litters/KittenDetailScreen').then((module) => ({
    default: module.KittenDetailScreen,
  })),
);
const CatDetailScreen = lazy(() =>
  import('../features/cats/CatDetailScreen').then((module) => ({
    default: module.CatDetailScreen,
  })),
);
const WeighScreen = lazy(() =>
  import('../features/weights/WeighScreen').then((module) => ({ default: module.WeighScreen })),
);
const WaitlistScreen = lazy(() =>
  import('../features/waitlist/WaitlistScreen').then((module) => ({
    default: module.WaitlistScreen,
  })),
);
const InterestDetailScreen = lazy(() =>
  import('../features/waitlist/InterestDetailScreen').then((module) => ({
    default: module.InterestDetailScreen,
  })),
);
const CalendarScreen = lazy(() =>
  import('../features/appointments/CalendarScreen').then((module) => ({
    default: module.CalendarScreen,
  })),
);
const AppointmentDetailScreen = lazy(() =>
  import('../features/appointments/AppointmentDetailScreen').then((module) => ({
    default: module.AppointmentDetailScreen,
  })),
);
const MoreScreen = lazy(() =>
  import('../features/more/MoreScreen').then((module) => ({ default: module.MoreScreen })),
);
const DocumentsScreen = lazy(() =>
  import('../features/documents/DocumentsScreen').then((module) => ({
    default: module.DocumentsScreen,
  })),
);
const ContractsScreen = lazy(() =>
  import('../features/contracts/ContractsScreen').then((module) => ({
    default: module.ContractsScreen,
  })),
);
const ContractEditorScreen = lazy(() =>
  import('../features/contracts/ContractEditorScreen').then((module) => ({
    default: module.ContractEditorScreen,
  })),
);
const BreedingUseScreen = lazy(() =>
  import('../features/contracts/BreedingUseScreen').then((module) => ({
    default: module.BreedingUseScreen,
  })),
);
const CostsScreen = lazy(() =>
  import('../features/costs/CostsScreen').then((module) => ({ default: module.CostsScreen })),
);
const SettingsScreen = lazy(() =>
  import('../features/settings/SettingsScreen').then((module) => ({
    default: module.SettingsScreen,
  })),
);

/**
 * Hash-Routing (`#/zucht`) statt sauberer Pfade — GitHub Pages liefert
 * bei einem direkten Aufruf von `/zucht` sonst einen 404, weil es dort
 * keine Datei gibt. Mit Hash funktioniert Neuladen und Lesezeichen überall.
 */
export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardScreen /> },

      {
        path: 'zucht',
        element: (
          <ModuleGuard modules={['cats', 'litters']}>
            <ZuchtScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'zucht/katze/:catId',
        element: (
          <ModuleGuard modules={['cats']}>
            <CatDetailScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'zucht/wurf/:litterId',
        element: (
          <ModuleGuard modules={['litters']}>
            <LitterDetailScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'zucht/kitten/:kittenId',
        element: (
          <ModuleGuard modules={['litters']}>
            <KittenDetailScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'wiegen/:litterId',
        element: (
          <ModuleGuard modules={['litters', 'weights']} requireAll>
            <WeighScreen />
          </ModuleGuard>
        ),
      },

      {
        path: 'warteliste',
        element: (
          <ModuleGuard modules={['waitlist']}>
            <WaitlistScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'warteliste/:interestId',
        element: (
          <ModuleGuard modules={['waitlist']}>
            <InterestDetailScreen />
          </ModuleGuard>
        ),
      },

      {
        path: 'kalender',
        element: (
          <ModuleGuard modules={['appointments']}>
            <CalendarScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'kalender/:appointmentId',
        element: (
          <ModuleGuard modules={['appointments']}>
            <AppointmentDetailScreen />
          </ModuleGuard>
        ),
      },

      { path: 'mehr', element: <MoreScreen /> },
      {
        path: 'mehr/dokumente',
        element: (
          <ModuleGuard modules={['documents']} redirectTo="/mehr">
            <DocumentsScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'mehr/vertraege',
        element: (
          <ModuleGuard modules={['contracts']} redirectTo="/mehr">
            <ContractsScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'mehr/vertraege/neu',
        element: (
          <ModuleGuard modules={['contracts']} redirectTo="/mehr">
            <ContractEditorScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'mehr/vertraege/:contractId',
        element: (
          <ModuleGuard modules={['contracts']} redirectTo="/mehr">
            <ContractEditorScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'mehr/zuchtnutzung/:breedingUseId',
        element: (
          <ModuleGuard modules={['contracts']} redirectTo="/mehr">
            <BreedingUseScreen />
          </ModuleGuard>
        ),
      },
      {
        path: 'mehr/kosten',
        element: (
          <ModuleGuard modules={['costs']} redirectTo="/mehr">
            <CostsScreen />
          </ModuleGuard>
        ),
      },
      { path: 'mehr/einstellungen', element: <SettingsScreen /> },

      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
