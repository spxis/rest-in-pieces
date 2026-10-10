import {
  Activity,
  ArrowLeftRight,
  Bell,
  Boxes,
  Braces,
  Briefcase,
  Building2,
  CalendarDays,
  ChartLine,
  FileText,
  Globe2,
  ListTodo,
  type LucideIcon,
  Mail,
  MapPin,
  MessageSquare,
  Receipt,
  ScrollText,
  ShoppingCart,
  Star,
  Users,
} from 'lucide-react';
import type { ResourceInfo } from '../hooks/useCatalog.ts';
import { useSpeaker } from '../i18n/LocaleProvider.tsx';

const ICONS: Record<string, LucideIcon> = {
  names: Activity,
  users: Users,
  products: Boxes,
  companies: Building2,
  countries: Globe2,
  orders: ShoppingCart,
  posts: FileText,
  comments: MessageSquare,
  todos: ListTodo,
  reviews: Star,
  invoices: Receipt,
  transactions: ArrowLeftRight,
  events: CalendarDays,
  messages: Mail,
  notifications: Bell,
  jobs: Briefcase,
  places: MapPin,
  metrics: ChartLine,
  logs: ScrollText,
  generate: Braces,
};

const label = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

export function EndpointTabs({
  resources,
  value,
  onChange,
}: {
  resources: ResourceInfo[];
  value: string;
  onChange: (endpoint: string) => void;
}) {
  const { say } = useSpeaker();
  const names = [...resources.map((resource) => resource.name), 'generate'];
  return (
    <div className="endpoint-tabs" role="tablist" aria-label={say('endpoints.label')}>
      {names.map((name) => {
        const Icon = ICONS[name] ?? Activity;
        return (
          <button
            type="button"
            key={name}
            className={value === name ? 'endpoint-tab active' : 'endpoint-tab'}
            onClick={() => onChange(name)}
            role="tab"
            aria-selected={value === name}
          >
            <Icon size={15} /> {label(name)}
          </button>
        );
      })}
    </div>
  );
}
