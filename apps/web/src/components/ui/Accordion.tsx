import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

type AccordionContextValue = {
  openValue: string | null;
  setOpenValue: (value: string) => void;
  collapsible: boolean;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);
const AccordionItemContext = React.createContext<{ value: string } | null>(null);

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'single';
  collapsible?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

function useAccordionContext() {
  const context = React.useContext(AccordionContext);
  if (!context) throw new Error('Accordion components must be used inside <Accordion>.');
  return context;
}

function useAccordionItemContext() {
  const context = React.useContext(AccordionItemContext);
  if (!context) throw new Error('Accordion item components must be used inside <AccordionItem>.');
  return context;
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      className,
      type = 'single',
      collapsible = false,
      value,
      defaultValue,
      onValueChange,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState<string | null>(defaultValue ?? null);
    const openValue = value ?? internalValue;

    const setOpenValue = (nextValue: string) => {
      const resolvedValue = nextValue === openValue && collapsible ? '' : nextValue;

      if (value === undefined) {
        setInternalValue(resolvedValue || null);
      }

      onValueChange?.(resolvedValue);
    };

    if (type !== 'single') {
      throw new Error('Only type="single" is supported in this accordion implementation.');
    }

    return (
      <AccordionContext.Provider value={{ openValue, setOpenValue, collapsible }}>
        <div ref={ref} className={cn('w-full', className)} {...props} />
      </AccordionContext.Provider>
    );
  }
);

Accordion.displayName = 'Accordion';

interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, ...props }, ref) => (
    <AccordionItemContext.Provider value={{ value }}>
      <div ref={ref} className={cn('border-b', className)} {...props} />
    </AccordionItemContext.Provider>
  )
);

AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => {
    const { openValue, setOpenValue } = useAccordionContext();
    const { value } = useAccordionItemContext();
    const open = openValue === value;

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => setOpenValue(value)}
        className={cn(
          'flex w-full items-center justify-between py-3 text-left text-sm font-medium transition-all hover:underline',
          className
        )}
        aria-expanded={open}
        {...props}
      >
        {children}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </button>
    );
  }
);

AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => {
    const { openValue } = useAccordionContext();
    const { value } = useAccordionItemContext();
    const open = openValue === value;

    return (
      <div ref={ref} className={cn('overflow-hidden text-sm', !open && 'hidden')} {...props}>
        <div className={cn('pb-3 pt-1', className)}>{children}</div>
      </div>
    );
  }
);

AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
