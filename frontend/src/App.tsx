import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useApp } from "./context";
import Shell from "./components/Shell";
import Start from "./pages/Start";
import Home from "./pages/Home";
import Society from "./pages/Society";
import Groundwater from "./pages/Groundwater";
import Leaks, { LeakNew } from "./pages/Leaks";
import Ward from "./pages/Ward";
import Community from "./pages/Community";
import { Loading } from "./components/Bits";

function Private({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, ready } = useApp();
  if (!ready) return <div className="p-6"><Loading h={300} /></div>;
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === "ward_officer" ? "/ward" : "/home"} replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const { user, ready } = useApp();
  const resident = ["resident", "society_admin"];
  return (
    <Routes>
      <Route path="/" element={ready && user ? <Navigate to={user.role === "ward_officer" ? "/ward" : "/home"} replace /> : <Start />} />
      <Route path="/home" element={<Private roles={resident}><Home /></Private>} />
      <Route path="/society" element={<Private roles={resident}><Society /></Private>} />
      <Route path="/groundwater" element={<Private><Groundwater /></Private>} />
      <Route path="/leaks" element={<Private roles={resident}><Leaks /></Private>} />
      <Route path="/leaks/new" element={<Private roles={resident}><LeakNew /></Private>} />
      <Route path="/ward" element={<Private roles={["ward_officer"]}><Ward /></Private>} />
      <Route path="/community" element={<Private><Community /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
