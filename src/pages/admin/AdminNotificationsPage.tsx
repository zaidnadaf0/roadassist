import { RequireAdmin } from '@/components/RequireAdmin';
import { NotificationsPage } from '@/pages/customer/NotificationsPage';

export function AdminNotificationsPage() {
  return <RequireAdmin><NotificationsPage portal="admin" /></RequireAdmin>;
}
