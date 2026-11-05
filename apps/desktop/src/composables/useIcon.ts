import * as icons from 'lucide-vue-next';

type LucideIcons = typeof icons;

export function useIcon() {
  const getIconComponent = (iconName: string): any => {
    return (icons as LucideIcons)[iconName as keyof LucideIcons] || null;
  };

  return {
    getIconComponent,
  };
}
