import { useMemo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Acceso } from './auth/Acceso';
import { Marco } from './components/Marco';
import { DatosProvider } from './data/DatosContext';
import { SincronizacionCarpetaProvider } from './data/SincronizacionCarpeta';
import { RepositorioLocal } from './data/repositorioLocal';
import { RepositorioSupabase } from './data/repositorioSupabase';
import { supabase } from './data/supabase';
import { ListaAdjuntos } from './pages/AdjuntosPage';
import { AgendaPage } from './pages/AgendaPage';
import { BibliotecaMarco, ListaBiblioteca, ListaPlantillas, ListaProgramas, PlantillaPage, ProgramaPage } from './pages/BibliotecaPage';
import { CentrosPage } from './pages/CentrosPage';
import { DatosPage } from './pages/DatosPage';
import { EvaluacionPage } from './pages/EvaluacionPage';
import { ImprimirPage } from './pages/ImprimirPage';
import { IngresoPage } from './pages/IngresoPage';
import { DatosPacientePage, ListaEvaluaciones, ListaIngresos, ListaSesiones, PacienteMarco, ResumenPaciente } from './pages/PacientePage';
import { PacientesPage } from './pages/PacientesPage';
import { PrivacidadPage } from './pages/PrivacidadPage';
import { SesionPage } from './pages/SesionPage';
import { TerminosPage } from './pages/TerminosPage';
import { BASE } from './rutaBase';
import { AccesoComercialGate } from './suscripciones/AccesoComercial';
import { PantallaBloqueo } from './suscripciones/PantallaBloqueo';

function Rutas({ ambito, email, onSalir, aviso }: { ambito: string; email?: string; onSalir?: () => void; aviso?: ReactNode }) {
  return (
    <SincronizacionCarpetaProvider ambito={ambito}>
      <Routes>
        <Route element={<Marco email={email} onSalir={onSalir} aviso={aviso} />}>
          <Route index element={<PacientesPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="centros" element={<CentrosPage />} />
          <Route path="datos" element={<DatosPage />} />
          <Route path="ejercicios" element={<BibliotecaMarco />}>
            <Route index element={<ListaBiblioteca />} />
            <Route path="plantillas" element={<ListaPlantillas />} />
            <Route path="plantillas/:id" element={<PlantillaPage />} />
            <Route path="programas" element={<ListaProgramas />} />
            <Route path="programas/:id" element={<ProgramaPage />} />
          </Route>
          <Route path="pacientes/:pid/imprimir" element={<ImprimirPage />} />
          <Route path="pacientes/:pid" element={<PacienteMarco />}>
            <Route index element={<ResumenPaciente />} />
            <Route path="datos" element={<DatosPacientePage />} />
            <Route path="ingresos" element={<ListaIngresos />} />
            <Route path="ingresos/:id" element={<IngresoPage />} />
            <Route path="evaluaciones" element={<ListaEvaluaciones />} />
            <Route path="evaluaciones/:id" element={<EvaluacionPage />} />
            <Route path="sesiones" element={<ListaSesiones />} />
            <Route path="sesiones/:id" element={<SesionPage />} />
            <Route path="adjuntos" element={<ListaAdjuntos />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SincronizacionCarpetaProvider>
  );
}

function AppConSesion({ userId, email }: { userId: string; email?: string }) {
  const repositorio = useMemo(() => new RepositorioSupabase(supabase!, userId), [userId]);
  return (
    <AccesoComercialGate
      sb={supabase!}
      onSalir={() => void supabase!.auth.signOut()}
      renderBloqueada={(contexto) => <PantallaBloqueo {...contexto} repositorio={repositorio} email={email} />}
    >
      {({ aviso }) => (
        // key: al cambiar de usuario se recargan los datos desde cero.
        <DatosProvider key={userId} repositorio={repositorio}>
          <Rutas ambito={`supabase:${userId}`} email={email} onSalir={() => void supabase!.auth.signOut()} aviso={aviso} />
        </DatosProvider>
      )}
    </AccesoComercialGate>
  );
}

export function App() {
  const local = useMemo(() => new RepositorioLocal(), []);
  const aplicacion = supabase ? (
    <Acceso>{(sesion) => <AppConSesion userId={sesion.user.id} email={sesion.user.email} />}</Acceso>
  ) : (
    <DatosProvider repositorio={local}>
      <Rutas ambito="local" />
    </DatosProvider>
  );

  return (
    <BrowserRouter basename={BASE.replace(/\/$/, '') || '/'}>
      <Routes>
        <Route path="/terminos" element={<TerminosPage />} />
        <Route path="/privacidad" element={<PrivacidadPage />} />
        <Route path="/*" element={aplicacion} />
      </Routes>
    </BrowserRouter>
  );
}
