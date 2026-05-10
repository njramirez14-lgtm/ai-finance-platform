import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash, Loader2, AlertCircle, Tag } from "lucide-react";
import Layout from "@/components/layout";
import api from "@/api/axios";

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", type: "EXPENSE" });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/categories/");
      setCategories(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Error cargando categorías");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", type: "EXPENSE" });
    setOpen(true);
  };
  const openEdit = (cat) => {
    setEditing(cat);
    setForm({ name: cat.name, type: cat.type });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("El nombre es obligatorio"); return; }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, form);
      } else {
        await api.post("/categories/", form);
      }
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error guardando");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`¿Borrar la categoría "${cat.name}"?`)) return;
    try {
      await api.delete(`/categories/${cat.id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "Error borrando");
    }
  };

  const incomeCats = categories.filter((c) => c.type === "INCOME");
  const expenseCats = categories.filter((c) => c.type === "EXPENSE");

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Tag size={22} /> Categorías
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organiza tus ingresos y gastos en categorías personalizadas.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="gap-2"><Plus size={16} /> Nueva categoría</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="cat-name">Nombre</Label>
                  <Input
                    id="cat-name"
                    placeholder="Ej. Comida, Transporte, Salario…"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(val) => setForm({ ...form, type: val })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCOME">Ingreso</SelectItem>
                      <SelectItem value="EXPENSE">Gasto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…</> : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && !open && (
          <div className="flex items-start gap-2 p-3 rounded-md text-sm bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-emerald-500">Ingresos</CardTitle>
              <CardDescription>{incomeCats.length} categorías</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryList items={incomeCats} loading={loading} onEdit={openEdit} onDelete={handleDelete} emptyText="Aún no tienes categorías de ingresos" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-rose-500">Gastos</CardTitle>
              <CardDescription>{expenseCats.length} categorías</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryList items={expenseCats} loading={loading} onEdit={openEdit} onDelete={handleDelete} emptyText="Aún no tienes categorías de gastos" />
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function CategoryList({ items, loading, onEdit, onDelete, emptyText }) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-muted/50" />)}
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">{emptyText}</div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead className="w-24 text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((cat) => (
          <TableRow key={cat.id}>
            <TableCell className="font-medium">{cat.name}</TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm" onClick={() => onEdit(cat)} title="Editar">
                <Edit size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(cat)} title="Borrar">
                <Trash size={14} />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
