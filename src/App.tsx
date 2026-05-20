import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute, AdminRoute } from "@/components/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import PredictionsPage from "./pages/PredictionsPage";
import RankingPage from "./pages/RankingPage";
import AllPredictionsPage from "./pages/AllPredictionsPage";
import AdminPage from "./pages/AdminPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<AuthPage />} />
            <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/predictions" element={<ProtectedRoute><PredictionsPage /></ProtectedRoute>} />
            <Route path="/ranking" element={<ProtectedRoute><RankingPage /></ProtectedRoute>} />
            <Route path="/all-predictions" element={<ProtectedRoute><AllPredictionsPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminPage /></AdminRoute></ProtectedRoute>} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
