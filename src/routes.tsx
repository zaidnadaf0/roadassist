import type { ComponentType } from 'react';
import { Navigate, Route, Routes as RouterRoutes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { CustomerLayout } from './layouts/CustomerLayout';
import { AdminLayout, MechanicLayout } from './layouts/PortalLayouts';
import { LandingPage } from './pages/public/LandingPage';
import { AboutPage, ContactPage, FeaturesPage, OnboardingPage, PricingPage } from './pages/public/MarketingPages';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { AdminSignupPage } from './pages/auth/AuthPages';
import { ForgotPage } from './pages/auth/ForgotPage';
import { VerifyPage } from './pages/auth/VerifyPage';
import { RequireAuth } from './components/RequireAuth';
import { RequireCustomer } from './components/RequireCustomer';
import { CustomerDashboard } from './pages/customer/CustomerDashboard';
import { ServicesPage } from './pages/customer/ServicesPage';
import { RequestPage } from './pages/customer/RequestPage';
import { RequestAliasPage } from './pages/customer/RequestPage';
import { MechanicDirectoryPage } from './pages/customer/MechanicDirectoryPage';
import { MechanicDetailPage } from './pages/customer/MechanicDetailPage';
import { TrackingPage } from './pages/customer/TrackingPage';
import { HistoryDetailPage, HistoryPage } from './pages/customer/HistoryPages';
import { VehiclesPage } from './pages/customer/VehiclesPage';
import { EmergencyPage } from './pages/customer/EmergencyPage';
import { NotificationsPage } from './pages/customer/NotificationsPage';
import { ProfilePage } from './pages/customer/ProfilePage';
import { SettingsPage } from './pages/customer/SettingsPage';
import { MechanicGuidePage } from './pages/customer/MechanicGuidePage';
import { CoverageMapPage } from './pages/customer/CoverageMapPage';
import { MechanicDashboardPage } from './pages/mechanic/MechanicDashboardPage';
import { MechanicRequestsPage } from './pages/mechanic/MechanicRequestsPage';
import { MechanicJobPage } from './pages/mechanic/MechanicJobPage';
import { MechanicEarningsPage, MechanicHistoryPage } from './pages/mechanic/MechanicHistoryEarnings';
import { MechanicProfilePage } from './pages/mechanic/MechanicProfilePage';
import { MechanicApplyPage } from './pages/mechanic/MechanicApplyPage';
import { MechanicNotificationsPage } from './pages/mechanic/MechanicNotificationsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { MechanicManagementPage } from './pages/admin/MechanicManagementPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AdminRequestDetailPage, AuditPage, DispatchPage, RequestsPage } from './pages/admin/OpsPages';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { ReportsHubPage } from './pages/admin/ReportsHubPage';
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage';
import { LogsPage } from './pages/admin/LogsPage';

export type Portal = 'public' | 'auth' | 'customer' | 'mechanic' | 'admin';

export interface RoutePageProps {
  title: string;
  description: string;
  routePath: string;
}

export interface RouteDef {
  path: string;
  portal: Portal;
  title: string;
  description: string;
  page?: ComponentType<RoutePageProps>;
}

/**
 * Application route map. Every entry points to a real page; portal access is
 * additionally guarded by the relevant role/claim gate at render time.
 */
export const ROUTE_DEFS: RouteDef[] = [
  // --- public ---
  { path: '/', portal: 'public', title: 'RoadAssist', description: 'Landing', page: LandingPage },
  { path: '/features', portal: 'public', title: 'Features', description: 'What RoadAssist covers and how it works.', page: FeaturesPage },
  { path: '/pricing', portal: 'public', title: 'Pricing', description: 'Transparent call-out rates per service.', page: PricingPage },
  { path: '/about', portal: 'public', title: 'About', description: 'Who we are and the verified network behind every rescue.', page: AboutPage },
  { path: '/contact', portal: 'public', title: 'Contact', description: 'Talk to the RoadAssist operations team.', page: ContactPage },
  { path: '/onboarding', portal: 'public', title: 'Welcome', description: 'A clear route from a breakdown to recovery.', page: OnboardingPage },
  // --- auth (Firebase Email/Password flows with role-specific entry points) ---
  { path: '/login', portal: 'auth', title: 'Log in', description: 'Sign in to your RoadAssist portal.', page: LoginPage },
  { path: '/signup', portal: 'auth', title: 'Sign up', description: 'Create your RoadAssist account.', page: SignupPage },
  { path: '/customer/login', portal: 'auth', title: 'Customer log in', description: 'Access your roadside assistance dashboard.', page: LoginPage },
  { path: '/customer/signup', portal: 'auth', title: 'Customer sign up', description: 'Create your customer account and request help when you need it.', page: SignupPage },
  { path: '/mechanic/login', portal: 'auth', title: 'Mechanic log in', description: 'Access your jobs, offers, and earnings.', page: LoginPage },
  { path: '/mechanic/signup', portal: 'auth', title: 'Mechanic sign up', description: 'Create an account and submit your workshop application.', page: SignupPage },
  { path: '/admin/login', portal: 'auth', title: 'Admin log in', description: 'Secure access for RoadAssist operations staff.', page: LoginPage },
  { path: '/admin/signup', portal: 'auth', title: 'Admin enrollment', description: 'Learn how administrator access is provisioned.', page: AdminSignupPage },
  { path: '/forgot', portal: 'auth', title: 'Reset password', description: 'Recover access to your account.', page: ForgotPage },
  { path: '/verify', portal: 'auth', title: 'Verify email', description: 'Confirm your email address.', page: VerifyPage },
  // --- customer (M4: real screens on the M3 backend) ---
  { path: '/app', portal: 'customer', title: 'Dashboard', description: 'Request help, see your active request, and pick up where you left off.', page: CustomerDashboard },
  { path: '/services', portal: 'customer', title: 'Request help', description: 'Towing, battery, tire, fuel, lockout, winch-out.', page: ServicesPage },
  { path: '/guide', portal: 'customer', title: 'Mechanic Guide', description: 'Describe the problem, check safety, and prepare a request.', page: MechanicGuidePage },
  { path: '/request', portal: 'customer', title: 'New request', description: 'Vehicle, problem, location, mechanic, confirm.', page: RequestPage },
  { path: '/request/:id', portal: 'customer', title: 'New request', description: 'Vehicle, problem, location, mechanic, confirm.', page: RequestAliasPage },
  { path: '/mechanics', portal: 'customer', title: 'Find mechanics', description: 'Vetted mechanics currently accepting jobs.', page: MechanicDirectoryPage },
  { path: '/mechanic/:id', portal: 'customer', title: 'Mechanic', description: 'Ratings, specialties, service area.', page: MechanicDetailPage },
  { path: '/map', portal: 'customer', title: 'Live map', description: 'Explore coverage and start a roadside request.', page: CoverageMapPage },
  { path: '/track', portal: 'customer', title: 'Track request', description: 'Follow your active rescue step by step.', page: TrackingPage },
  { path: '/track/:id', portal: 'customer', title: 'Track request', description: 'Follow your active rescue step by step.', page: TrackingPage },
  { path: '/history', portal: 'customer', title: 'Service history', description: 'Every completed rescue with receipts.', page: HistoryPage },
  { path: '/history/:id', portal: 'customer', title: 'Receipt', description: 'Line items, rating, and support reference.', page: HistoryDetailPage },
  { path: '/vehicles', portal: 'customer', title: 'My vehicles', description: 'The vehicles mechanics will come to help.', page: VehiclesPage },
  { path: '/emergency', portal: 'customer', title: 'Emergency', description: 'SOS contacts and what to do while you wait.', page: EmergencyPage },
  { path: '/notifications', portal: 'customer', title: 'Notifications', description: 'Dispatch updates and account notices.', page: NotificationsPage },
  { path: '/profile', portal: 'customer', title: 'Profile', description: 'Name, contact, and preferences.', page: ProfilePage },
  { path: '/settings', portal: 'customer', title: 'Settings', description: 'Backend status, appearance, and data controls.', page: SettingsPage },
  // --- mechanic (real screens on the Firebase backend, with guarded location updates) ---
  { path: '/m', portal: 'mechanic', title: 'Dashboard', description: 'Availability, incoming work, active job, earnings at a glance.', page: MechanicDashboardPage },
  { path: '/m/requests', portal: 'mechanic', title: 'Incoming requests', description: 'Offers waiting on your decision.', page: MechanicRequestsPage },
  { path: '/m/job', portal: 'mechanic', title: 'Active job', description: 'Navigate, update status, complete the rescue.', page: MechanicJobPage },
  { path: '/m/job/:id', portal: 'mechanic', title: 'Job', description: 'Status progression, release, and completion with billing.', page: MechanicJobPage },
  { path: '/m/history', portal: 'mechanic', title: 'Job history', description: 'Your completed jobs, newest first.', page: MechanicHistoryPage },
  { path: '/m/earnings', portal: 'mechanic', title: 'Earnings', description: 'Derived from completed-job amounts. Read-only.', page: MechanicEarningsPage },
  { path: '/m/profile', portal: 'mechanic', title: 'Workshop profile', description: 'Garage, coverage, specialties, verification.', page: MechanicProfilePage },
  { path: '/m/apply', portal: 'mechanic', title: 'Apply', description: 'Workshop application for operations review.', page: MechanicApplyPage },
  { path: '/m/notifications', portal: 'mechanic', title: 'Notifications', description: 'Assignment and account notices.', page: MechanicNotificationsPage },
  // --- admin (claim-gated operations screens; analytics/reports use honest live snapshots) ---
  { path: '/admin', portal: 'admin', title: 'Operations', description: 'Network health and pending work.', page: AdminDashboardPage },
  { path: '/admin/dispatch', portal: 'admin', title: 'Dispatch', description: 'Read-only operations view.', page: DispatchPage },
  { path: '/admin/approvals', portal: 'admin', title: 'Approvals', description: 'Verify mechanics before their first job.', page: MechanicManagementPage },
  { path: '/admin/mechanics', portal: 'admin', title: 'Mechanics', description: 'Applications, approvals, suspensions.', page: MechanicManagementPage },
  { path: '/admin/users', portal: 'admin', title: 'Users', description: 'Accounts on the network.', page: UsersPage },
  { path: '/admin/requests', portal: 'admin', title: 'Requests', description: 'Live service requests across the network.', page: RequestsPage },
  { path: '/admin/requests/:id', portal: 'admin', title: 'Request details', description: 'Authoritative request and assignment details.', page: AdminRequestDetailPage },
  { path: '/admin/audit', portal: 'admin', title: 'System activity', description: 'Recent transitions from live data.', page: AuditPage },
  { path: '/admin/analytics', portal: 'admin', title: 'Analytics', description: 'Authoritative aggregates, UTC windows.', page: AdminAnalyticsPage },
  { path: '/admin/reports', portal: 'admin', title: 'Reports', description: 'CSV exports from live snapshots.', page: ReportsHubPage },
  { path: '/admin/notifications', portal: 'admin', title: 'Notifications', description: 'Your admin inbox.', page: AdminNotificationsPage },
  { path: '/admin/logs', portal: 'admin', title: 'Logs', description: 'Operational request activity.', page: LogsPage },
];

function layoutFor(portal: Portal) {
  switch (portal) {
    case 'auth':
      return AuthLayout;
    case 'customer':
      return CustomerLayout;
    case 'mechanic':
      return MechanicLayout;
    case 'admin':
      return AdminLayout;
    default:
      return PublicLayout;
  }
}

/**
 * Every portal route requires a signed-in Firebase user. Customer routes also
 * redirect mechanics/admins to their dedicated workspaces; backend rules are
 * still the authoritative security boundary.
 */
export function Routes() {
  return (
    <RouterRoutes>
      {ROUTE_DEFS.map((def) => {
        const Layout = layoutFor(def.portal);
        const Page = def.page!;
        const needsAuth = def.portal === 'customer' || def.portal === 'mechanic' || def.portal === 'admin';
        const content = <Page title={def.title} description={def.description} routePath={def.path} />;
        return (
          <Route
            key={def.path}
            path={def.path}
            element={
              needsAuth ? (
                <RequireAuth>
                  <Layout title={def.title} description={def.description} routePath={def.path}>
                    {def.portal === 'customer' ? <RequireCustomer>{content}</RequireCustomer> : content}
                  </Layout>
                </RequireAuth>
              ) : (
                <Layout title={def.title} description={def.description} routePath={def.path}>
                  <Page title={def.title} description={def.description} routePath={def.path} />
                </Layout>
              )
            }
          />
        );
      })}
      <Route path="*" element={<Navigate to="/" replace />} />
    </RouterRoutes>
  );
}
