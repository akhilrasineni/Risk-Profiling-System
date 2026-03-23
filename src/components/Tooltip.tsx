import { useState, useRef, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Props for the Tooltip component.
 */
interface TooltipProps {
  /** The content to be displayed within the tooltip. */
  content: ReactNode;
  /** The element that triggers the tooltip on hover. */
  children: ReactNode;
  /** Optional CSS class name for the tooltip container. */
  className?: string;
  /** Horizontal alignment of the tooltip relative to the trigger. Defaults to 'center'. */
  alignment?: 'left' | 'center' | 'right';
  /** Vertical position of the tooltip relative to the trigger. Defaults to 'top'. */
  position?: 'top' | 'bottom';
}

/**
 * Tooltip component provides a simple way to display additional information on hover.
 * It uses React Portals to ensure the tooltip is rendered above other elements.
 * 
 * @param props - The component props.
 * @returns A JSX element representing the tooltip.
 */
export default function Tooltip({ content, children, className = '', alignment = 'center', position = 'top' }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;

      // Vertical positioning
      if (position === 'top') {
        top = rect.top - 8; // 8px gap
      } else {
        top = rect.bottom + 8;
      }

      // Horizontal positioning
      if (alignment === 'center') {
        left = rect.left + rect.width / 2;
      } else if (alignment === 'left') {
        left = rect.left;
      } else {
        left = rect.right;
      }

      setCoords({ top, left });
    }
  };

  const handleMouseEnter = () => {
    updatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  // Update position on scroll or resize while visible
  useEffect(() => {
    if (isVisible) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible]);

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex items-center cursor-help"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>
      {isVisible && createPortal(
        <div
          className={`fixed z-[9999] px-4 py-3 bg-slate-900 text-white text-xs rounded-xl shadow-xl w-max max-w-xs whitespace-normal pointer-events-none transition-opacity duration-200 ${className}`}
          style={{
            top: coords.top,
            left: coords.left,
            transform: `translate(${alignment === 'center' ? '-50%' : alignment === 'right' ? '-100%' : '0'}, ${position === 'top' ? '-100%' : '0'})`,
          }}
        >
          {content}
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 border-4 border-transparent ${
              position === 'top'
                ? 'top-full border-t-slate-900'
                : 'bottom-full border-b-slate-900'
            }`}
            style={{
              left: alignment === 'center' ? '50%' : alignment === 'left' ? '1rem' : 'auto',
              right: alignment === 'right' ? '1rem' : 'auto',
              transform: alignment === 'center' ? 'translateX(-50%)' : 'none',
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}
