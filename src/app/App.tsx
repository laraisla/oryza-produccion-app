import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Layout } from './Layout';
import { ErrorBoundary } from './ErrorBoundary';

const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Marketplace = lazy(() => import('@/features/marketplace/MarketplacePage'));
const Products = lazy(() => import('@/features/products/ProductsPage'));
const ProductDetail = lazy(() => import('@/features/products/ProductDetailPage'));
const Requests = lazy(() => import('@/features/requests/RequestsPage'));
const RequestDetail = lazy(() => import('@/features/requests/RequestDetailPage'));
const Matching = lazy(() => import('@/features/matching/MatchingPage'));
const Calculator = lazy(() => import('@/features/calculator/CalculatorPage'));
const Quotations = lazy(() => import('@/features/quotations/QuotationsPage'));
const QuotationDetail = lazy(() => import('@/features/quotations/QuotationDetailPage'));
const Operations = lazy(() => import('@/features/operations/OperationsPage'));
const OperationDetail = lazy(() => import('@/features/operations/OperationDetailPage'));
const Documents = lazy(() => import('@/features/documents/DocumentsPage'));
const Reconciliation = lazy(() => import('@/features/finance/ReconciliationPage'));
const Traceability = lazy(() => import('@/features/traceability/TraceabilityPage'));
const Verification = lazy(() => import('@/features/verification/VerificationPage'));
const Settings = lazy(() => import('@/features/settings/SettingsPage'));
const Wizard = lazy(() => import('@/features/wizard/WizardPage'));

function page(node: ReactNode) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Cargando…</div>}>{node}</Suspense>
    </ErrorBoundary>
  );
}

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: page(<Dashboard />) },
      { path: 'marketplace', element: page(<Marketplace />) },
      { path: 'productos', element: page(<Products />) },
      { path: 'productos/:productId', element: page(<ProductDetail />) },
      { path: 'solicitudes', element: page(<Requests />) },
      { path: 'solicitudes/:requestId', element: page(<RequestDetail />) },
      { path: 'matching', element: page(<Matching />) },
      { path: 'calculadora', element: page(<Calculator />) },
      { path: 'calculadora/:scenarioId', element: page(<Calculator />) },
      { path: 'cotizaciones', element: page(<Quotations />) },
      { path: 'cotizaciones/:quotationId', element: page(<QuotationDetail />) },
      { path: 'operaciones', element: page(<Operations />) },
      { path: 'operaciones/:operationId', element: page(<OperationDetail />) },
      { path: 'documentacion', element: page(<Documents />) },
      { path: 'conciliacion', element: page(<Reconciliation />) },
      { path: 'trazabilidad', element: page(<Traceability />) },
      { path: 'verificacion', element: page(<Verification />) },
      { path: 'configuracion', element: page(<Settings />) },
      { path: 'nueva-operacion', element: page(<Wizard />) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
