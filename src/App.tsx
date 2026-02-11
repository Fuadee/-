import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import CaseFormPage from './pages/CaseFormPage';
import CaseListPage from './pages/CaseListPage';
import PreviewGeneratePage from './pages/PreviewGeneratePage';

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/cases" replace />} />
        <Route path="/cases" element={<CaseListPage />} />
        <Route path="/cases/new" element={<CaseFormPage mode="create" />} />
        <Route path="/cases/:id/edit" element={<CaseFormPage mode="edit" />} />
        <Route path="/cases/:id/preview" element={<PreviewGeneratePage />} />
      </Routes>
    </AppLayout>
  );
}
