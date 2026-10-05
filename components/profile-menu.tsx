'use client';

import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function ProfileMenu({ children }: { children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  const closeMenu = () => {
    detailsRef.current?.removeAttribute('open');
  };

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        closeMenu();
        detailsRef.current?.querySelector('summary')?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleClick = (event: ReactMouseEvent<HTMLDetailsElement>) => {
    if (event.target instanceof Element && event.target.closest('a, button')) {
      closeMenu();
    }
  };

  return (
    <details ref={detailsRef} className="profile-menu" onClick={handleClick} onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeMenu();
    }} onToggle={event => {
      if (event.currentTarget.open) window.dispatchEvent(new Event('hundetimer:profile-menu-open'));
    }}>
      {children}
    </details>
  );
}
