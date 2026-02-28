import { ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  alignment?: 'left' | 'center' | 'right';
  position?: 'top' | 'bottom';
}

export default function Tooltip({ content, children, className = '', alignment = 'center', position = 'top' }: TooltipProps) {
  // Default is 'top' (tooltip appears above the element)
  let positionClasses = position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';
  
  // Arrow positioning
  let arrowClasses = 'absolute w-0 h-0 border-4 border-transparent';
  if (position === 'top') {
    arrowClasses += ' top-full border-t-slate-900';
  } else {
    arrowClasses += ' bottom-full border-b-slate-900';
  }

  if (alignment === 'center') {
    positionClasses += ' left-1/2 -translate-x-1/2';
    arrowClasses += ' left-1/2 -translate-x-1/2';
  } else if (alignment === 'left') {
    positionClasses += ' left-0';
    arrowClasses += ' left-4';
  } else if (alignment === 'right') {
    positionClasses += ' right-0';
    arrowClasses += ' right-4';
  }

  return (
    <div className="group relative inline-flex items-center">
      {children}
      <div className={`invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute ${positionClasses} px-4 py-3 bg-slate-900 text-white text-xs rounded-xl z-50 pointer-events-none shadow-xl w-max max-w-xs whitespace-normal ${className}`}>
        {content}
        <div className={arrowClasses}></div>
      </div>
    </div>
  );
}
