import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useApp } from "./context";
import { homeOf } from "./lib/session";
import { getToken } from "./lib/api";
import ActionErrors from "./components/ActionErrors";
import Shell from "./components/Shell";
import Start from "./pages/Start";
import Home from "./pages/Home";
import Society from "./pages/Society";
import Groundwater from "./pages/Groundwater";
import Leaks, { LeakNew } from "./pages/Leaks";
import Ward from "./pages/Ward";
import Community from "./pages/Community";
import { Loading } from "./components/Bits";

const Waiting = () => <div className="mx-auto max-w-7xl p-6"><Loading h={300} /></div>;

function Private({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, ready } = useApp();
  const at = useLocation();
  if (!ready) return <Waiting />;
  if (!user) return <Navigate to="/login" replace state={{ from: at.pathname + at.search + at.hash }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeOf(user)} replace />;
  return <Shell>{children}</Shell>;
}

/** Sign in and register: once signed in, go to the page that was asked for, or home. */
function SignedOut() {
  const { user, ready } = useApp();
  const from = (useLocation().state as { from?: unknown } | null)?.from;
  if (!ready && getToken()) return <Waiting />;
  if (user) return <Navigate to={typeof from === "string" && from.startsWith("/") ? from : homeOf(user)} replace />;
  return <Start />;
}

export default function App() {
  const resident = ["resident", "society_admin"];
  return (
    <>
      <Routes>
        <Route element={<SignedOut />}>
          <Route path="/" element={null} />
          <Route path="/login" element={null} />
          <Route path="/register" element={null} />
        </Route>
        <Route path="/home" element={<Private roles={resident}><Home /></Private>} />
        <Route path="/society" element={<Private roles={resident}><Society /></Private>} />
        <Route path="/groundwater" element={<Private><Groundwater /></Private>} />
        <Route path="/leaks" element={<Private roles={resident}><Leaks /></Private>} />
        <Route path="/leaks/new" element={<Private roles={resident}><LeakNew /></Private>} />
        <Route path="/ward" element={<Private roles={["ward_officer"]}><Ward /></Private>} />
        <Route path="/community" element={<Private><Community /></Private>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ActionErrors />
    </>
  );
}
