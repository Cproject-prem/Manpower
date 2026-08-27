import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="w-full md:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <div className="w-10 h-10 bg-zinc-900 rounded-md flex items-center justify-center mb-6">
              <span className="text-white font-bold" style={{ fontFamily: "Cabinet Grotesk" }}>M</span>
            </div>
            <h1 className="text-3xl tracking-tight font-semibold text-zinc-900" style={{ fontFamily: "Cabinet Grotesk" }}>
              Manpower Management Portal
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Sign in to manage contractors, manpower &amp; medical certificates.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>

      <div className="hidden md:flex md:w-1/2 bg-zinc-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Workforce Operations</p>
        </div>
        <div className="relative z-10 max-w-lg">
          <h2 className="text-4xl tracking-tight font-semibold leading-tight" style={{ fontFamily: "Cabinet Grotesk" }}>
            Approve faster.<br />Renew on time.<br />Stay compliant.
          </h2>
          <p className="mt-4 text-sm text-zinc-400">
            A single workspace to onboard manpower, manage documents and track medical certificate
            renewals across all contractors.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-6 text-xs text-zinc-400">
          <div><div className="text-2xl font-semibold text-white mono">RBAC</div>Role-based access</div>
          <div><div className="text-2xl font-semibold text-white mono">MC</div>Annual renewals</div>
          <div><div className="text-2xl font-semibold text-white mono">AUDIT</div>Full audit trail</div>
        </div>
      </div>
    </div>
  );
}
