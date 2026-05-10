import { Link, useNavigate } from "react-router-dom";
import Layout from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Settings, LogOut, Building2, Layers, Wallet, Mail, User as UserIcon, ArrowRight,
} from "lucide-react";
import useStore from "@/store";
import TelegramConnect from "@/components/telegram-connect";

export default function SettingsPage() {
  const { user } = useStore((s) => s.auth);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Settings size={22} /> Ajustes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona tu cuenta y la configuración de la app.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mi cuenta</CardTitle>
            <CardDescription>Información de tu sesión</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={<UserIcon size={14} />} label="Usuario" value={user?.username || "—"} />
            <InfoRow icon={<Mail size={14} />} label="Email" value={user?.email || "—"} />
            <Button variant="outline" onClick={handleLogout} className="gap-2 mt-2">
              <LogOut size={14} /> Cerrar sesión
            </Button>
          </CardContent>
        </Card>

        <TelegramConnect />

        <Card>
          <CardHeader>
            <CardTitle>Atajos</CardTitle>
            <CardDescription>Configura las piezas que estructuran tus finanzas</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ShortcutCard to="/entities" icon={<Building2 size={18} />} title="Entidades" desc="Personal y empresas" />
            <ShortcutCard to="/accounts" icon={<Wallet size={18} />} title="Cuentas" desc="Bancos, tarjetas, cripto" />
            <ShortcutCard to="/categories" icon={<Layers size={18} />} title="Categorías" desc="Ingresos y gastos" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sobre</CardTitle>
            <CardDescription>AI Finance · v0.2</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Tu copiloto financiero personal. Categorías, cuentas, entidades, ticket OCR, mercados en vivo y asesores IA con memoria.
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-muted-foreground w-20">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ShortcutCard({ to, icon, title, desc }) {
  return (
    <Link to={to}>
      <div className="p-4 rounded-lg border border-border bg-card/50 hover:border-foreground/30 transition-colors h-full">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-indigo-500/10 text-indigo-400">{icon}</div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{title}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
          <ArrowRight size={14} className="text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}
