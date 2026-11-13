import { RequireMechanic } from '@/components/RequireMechanic';
import { NotificationsPage } from '@/pages/customer/NotificationsPage';

export function MechanicNotificationsPage() {
  return <RequireMechanic><NotificationsPage portal="mechanic" /></RequireMechanic>;
}
