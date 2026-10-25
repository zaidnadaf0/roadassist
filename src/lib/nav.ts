import type { IconName } from '@/components/Icon';

export interface NavItem {
  route: string;
  icon: IconName;
  label: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * M1 portal navigation — mirrors legacy/chrome.js NAV structure
 * (labels, grouping, and mobile tabs preserved as IA reference).
 */
export const CUSTOMER_NAV: NavGroup[] = [
  {
    label: 'Assistance',
    items: [
      { route: '/app', icon: 'home', label: 'Dashboard' },
      { route: '/services', icon: 'wrench', label: 'Request Help' },
      { route: '/guide', icon: 'wrench', label: 'Mechanic Guide' },
      { route: '/mechanics', icon: 'users', label: 'Find Mechanics' },
      { route: '/map', icon: 'map', label: 'Live Map' },
      { route: '/track', icon: 'route', label: 'Track Request' },
    ],
  },
  {
    label: 'My Account',
    items: [
      { route: '/history', icon: 'history', label: 'Service History' },
      { route: '/vehicles', icon: 'car', label: 'My Vehicles' },
      { route: '/emergency', icon: 'shield', label: 'Emergency Contacts' },
      { route: '/notifications', icon: 'bell', label: 'Notifications' },
      { route: '/profile', icon: 'person', label: 'Profile' },
      { route: '/settings', icon: 'settings', label: 'Settings' },
    ],
  },
];

export const CUSTOMER_TABS: NavItem[] = [
  { route: '/app', icon: 'home', label: 'Home' },
  { route: '/map', icon: 'map', label: 'Map' },
  { route: '/services', icon: 'wrench', label: 'Request' },
  { route: '/notifications', icon: 'bell', label: 'Alerts' },
  { route: '/profile', icon: 'person', label: 'Profile' },
];

export const MECHANIC_NAV: NavGroup[] = [
  {
    label: 'Workshop',
    items: [
      { route: '/m', icon: 'grid', label: 'Dashboard' },
      { route: '/m/requests', icon: 'inbox', label: 'Incoming Requests' },
      { route: '/m/job', icon: 'route', label: 'Active Job' },
      { route: '/m/history', icon: 'history', label: 'Job History' },
      { route: '/m/earnings', icon: 'dollar', label: 'Earnings' },
      { route: '/m/notifications', icon: 'bell', label: 'Notifications' },
      { route: '/m/profile', icon: 'person', label: 'Profile' },
    ],
  },
];

export const MECHANIC_TABS: NavItem[] = [
  { route: '/m', icon: 'grid', label: 'Home' },
  { route: '/m/requests', icon: 'inbox', label: 'Requests' },
  { route: '/m/job', icon: 'route', label: 'Active job' },
  { route: '/m/earnings', icon: 'dollar', label: 'Earnings' },
  { route: '/m/profile', icon: 'person', label: 'Profile' },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { route: '/admin', icon: 'grid', label: 'Dashboard' },
      { route: '/admin/dispatch', icon: 'route', label: 'Dispatch' },
      { route: '/admin/approvals', icon: 'check', label: 'Approvals' },
      { route: '/admin/mechanics', icon: 'users', label: 'Mechanics' },
      { route: '/admin/users', icon: 'person', label: 'Users' },
      { route: '/admin/requests', icon: 'list', label: 'Requests' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { route: '/admin/analytics', icon: 'chart', label: 'Analytics' },
      { route: '/admin/reports', icon: 'file', label: 'Reports' },
      { route: '/admin/audit', icon: 'history', label: 'Audit' },
      { route: '/admin/logs', icon: 'list', label: 'Logs' },
      { route: '/admin/notifications', icon: 'bell', label: 'Notifications' },
    ],
  },
];

export const ADMIN_TABS: NavItem[] = [
  { route: '/admin', icon: 'grid', label: 'Home' },
  { route: '/admin/dispatch', icon: 'route', label: 'Dispatch' },
  { route: '/admin/requests', icon: 'list', label: 'Requests' },
  { route: '/admin/mechanics', icon: 'users', label: 'Mechanics' },
  { route: '/admin/notifications', icon: 'bell', label: 'Alerts' },
];

export const PUBLIC_LINKS: NavItem[] = [
  { route: '/features', icon: 'star', label: 'Features' },
  { route: '/pricing', icon: 'dollar', label: 'Pricing' },
  { route: '/about', icon: 'info', label: 'About' },
  { route: '/contact', icon: 'phone', label: 'Contact' },
];
