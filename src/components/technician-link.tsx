'use client';

import { getUserNameByEmail } from '@/app/lib/auth-config';
import { cn } from '@/lib/utils';

interface TechnicianLinkProps {
  email: string | null;
  className?: string;
}

/**
 * Muestra el nombre del técnico asociado a un email como un hipervínculo.
 */
export function TechnicianLink({ email, className }: TechnicianLinkProps) {
  const name = getUserNameByEmail(email);
  return (
    <a 
      href="#" 
      onClick={(e) => e.preventDefault()} 
      className={cn(
        "text-primary hover:underline decoration-primary/50 transition-colors cursor-default",
        className
      )}
    >
      {name}
    </a>
  );
}
