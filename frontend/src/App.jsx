import useStore from "./store";
import Home from "./pages/home";
import { useEffect } from "react";
import LoginPage from "./pages/login";
import SignupPage from "./pages/signup";
import ReportsPage from "./pages/reports";
import TradingPage from "./pages/trading";
import SettingsPage from "./pages/settings";
import DashboardPage from "./pages/dashboard";
import TransactionsPage from "./pages/transactions";
import CategoriesPage from "./pages/categories/categories";
import AccountsPage from "./pages/accounts";
import EntitiesPage from "./pages/entities";
import AdvisorPage from "./pages/advisor";
import MarketsPage from "./pages/markets";
import SmartMoneyPage from "./pages/smart-money";
import LiabilitiesPage from "./pages/liabilities";
import CardsPage from "./pages/cards";
import SubscriptionsPage from "./pages/subscriptions";
import IncomePage from "./pages/income";
import BudgetsPage from "./pages/budgets";
import NewsPage from "./pages/news";
import BacktestPage from "./pages/backtest";
import StrategyPage from "./pages/strategy";
import PortfolioPage from "./pages/portfolio";
import ProtectedRoute from "./components/protected-routes";
import { ThemeProvider } from "./components/theme-provider";
import { BrowserRouter, Routes, Route } from "react-router-dom";

function App() {
  const rehydrateAuth = useStore((state) => state.rehydrateAuth);
  const rehydrateScope = useStore((state) => state.rehydrateScope);

  useEffect(() => {
    rehydrateAuth();
    rehydrateScope();
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          {/* Protected routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute>
                <TransactionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <AccountsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entities"
            element={
              <ProtectedRoute>
                <EntitiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/advisor"
            element={
              <ProtectedRoute>
                <AdvisorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/markets"
            element={
              <ProtectedRoute>
                <MarketsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/smart-money"
            element={
              <ProtectedRoute>
                <SmartMoneyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/liabilities"
            element={
              <ProtectedRoute>
                <LiabilitiesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cards"
            element={
              <ProtectedRoute>
                <CardsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/subscriptions"
            element={
              <ProtectedRoute>
                <SubscriptionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/income"
            element={
              <ProtectedRoute>
                <IncomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute>
                <BudgetsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/news"
            element={
              <ProtectedRoute>
                <NewsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/backtest"
            element={
              <ProtectedRoute>
                <BacktestPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/strategy"
            element={
              <ProtectedRoute>
                <StrategyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trading"
            element={
              <ProtectedRoute>
                <TradingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/portfolio"
            element={
              <ProtectedRoute>
                <PortfolioPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
