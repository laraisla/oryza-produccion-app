import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DataProvider, useData } from '@/hooks/useData';
import { FeedbackProvider } from '@/hooks/useFeedback';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { RecordFormPage } from '@/pages/RecordFormPage';
import { RecordsPage } from '@/pages/RecordsPage';
import { RecordDetailPage } from '@/pages/RecordDetailPage';
import { TraceabilityPage } from '@/pages/TraceabilityPage';
import { DailyClosePage } from '@/pages/DailyClosePage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { CatalogPage } from '@/pages/admin/CatalogPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { ImportPage } from '@/pages/admin/ImportPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { AuditPage } from '@/pages/admin/AuditPage';
import { can } from '@/utils/permissions';
import type { User } from '@/types/domain';
import type { ReactNode } from 'react';

function Guard({ allow, children }: { allow: (u: User) => boolean; children: ReactNode }) {
  const { user } = useData();
  if (!allow(user))
    return (
      <div className="card p-8 text-center max-w-lg mx-auto mt-10">
        <h1 className="text-lg font-semibold">Acceso restringido</h1>
        <p className="text-sm text-slate-500 mt-2">Tu rol actual no tiene permiso para ver esta sección. Cambia de usuario desde la barra superior.</p>
      </div>
    );
  return <>{children}</>;
}

export function App() {
  return (
    <DataProvider>
      <FeedbackProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="registros" element={<RecordsPage />} />
              <Route path="registros/nuevo" element={<RecordFormPage />} />
              <Route path="registros/:id" element={<RecordDetailPage />} />
              <Route path="registros/:id/editar" element={<RecordFormPage />} />
              <Route path="trazabilidad" element={<TraceabilityPage />} />
              <Route path="cierre" element={<Guard allow={can.closeDay}><DailyClosePage /></Guard>} />
              <Route path="reportes" element={<Guard allow={can.viewReports}><ReportsPage /></Guard>} />
              <Route path="alertas" element={<AlertsPage />} />
              <Route path="admin/productos" element={<Guard allow={can.admin}><CatalogPage catalog="products" /></Guard>} />
              <Route path="admin/variedades" element={<Guard allow={can.admin}><CatalogPage catalog="varieties" /></Guard>} />
              <Route path="admin/presentaciones" element={<Guard allow={can.admin}><CatalogPage catalog="presentations" /></Guard>} />
              <Route path="admin/lineas" element={<Guard allow={can.admin}><CatalogPage catalog="lines" /></Guard>} />
              <Route path="admin/turnos" element={<Guard allow={can.admin}><CatalogPage catalog="shifts" /></Guard>} />
              <Route path="admin/paradas" element={<Guard allow={can.admin}><CatalogPage catalog="downtimeCategories" /></Guard>} />
              <Route path="admin/usuarios" element={<Guard allow={can.admin}><UsersPage /></Guard>} />
              <Route path="admin/importar" element={<Guard allow={can.admin}><ImportPage /></Guard>} />
              <Route path="admin/configuracion" element={<Guard allow={can.admin}><SettingsPage /></Guard>} />
              <Route path="admin/auditoria" element={<Guard allow={can.viewAudit}><AuditPage /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </FeedbackProvider>
    </DataProvider>
  );
}
