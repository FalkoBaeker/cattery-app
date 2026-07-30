import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './AppLayout';

import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { ZuchtScreen } from '../features/litters/ZuchtScreen';
import { LitterDetailScreen } from '../features/litters/LitterDetailScreen';
import { KittenDetailScreen } from '../features/litters/KittenDetailScreen';
import { CatDetailScreen } from '../features/cats/CatDetailScreen';
import { WeighScreen } from '../features/weights/WeighScreen';
import { WaitlistScreen } from '../features/waitlist/WaitlistScreen';
import { InterestDetailScreen } from '../features/waitlist/InterestDetailScreen';
import { CalendarScreen } from '../features/appointments/CalendarScreen';
import { AppointmentDetailScreen } from '../features/appointments/AppointmentDetailScreen';
import { MoreScreen } from '../features/more/MoreScreen';
import { DocumentsScreen } from '../features/documents/DocumentsScreen';
import { ContractsScreen } from '../features/contracts/ContractsScreen';
import { ContractEditorScreen } from '../features/contracts/ContractEditorScreen';
import { BreedingUseScreen } from '../features/contracts/BreedingUseScreen';
import { CostsScreen } from '../features/costs/CostsScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';

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

      { path: 'zucht', element: <ZuchtScreen /> },
      { path: 'zucht/katze/:catId', element: <CatDetailScreen /> },
      { path: 'zucht/wurf/:litterId', element: <LitterDetailScreen /> },
      { path: 'zucht/kitten/:kittenId', element: <KittenDetailScreen /> },
      { path: 'wiegen/:litterId', element: <WeighScreen /> },

      { path: 'warteliste', element: <WaitlistScreen /> },
      { path: 'warteliste/:interestId', element: <InterestDetailScreen /> },

      { path: 'kalender', element: <CalendarScreen /> },
      { path: 'kalender/:appointmentId', element: <AppointmentDetailScreen /> },

      { path: 'mehr', element: <MoreScreen /> },
      { path: 'mehr/dokumente', element: <DocumentsScreen /> },
      { path: 'mehr/vertraege', element: <ContractsScreen /> },
      { path: 'mehr/vertraege/neu', element: <ContractEditorScreen /> },
      { path: 'mehr/vertraege/:contractId', element: <ContractEditorScreen /> },
      { path: 'mehr/zuchtnutzung/:breedingUseId', element: <BreedingUseScreen /> },
      { path: 'mehr/kosten', element: <CostsScreen /> },
      { path: 'mehr/einstellungen', element: <SettingsScreen /> },

      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
