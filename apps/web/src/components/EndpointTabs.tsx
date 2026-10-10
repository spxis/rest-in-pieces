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
  HeartPulse,
  History,
  Hospital,
  House,
  Layers,
  ListTodo,
  type LucideIcon,
  Mail,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Mountain,
  Pill,
  Radio,
  Receipt,
  ScrollText,
  ShoppingCart,
  Star,
  Stethoscope,
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
  withdrawn: History,
  addresses: House,
  subdivisions: MapIcon,
  groupings: Layers,
  features: Mountain,
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
  patients: HeartPulse,
  observations: Stethoscope,
  conditions: Pill,
  encounters: Hospital,
  generate: Braces,
  streams: Radio,
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
  const names = [...resources.map((resource) => resource.name), 'generate', 'streams'];
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
