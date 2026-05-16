import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
	className?: string;
}

function Collapsible({
	open,
	onOpenChange,
	children,
	className,
}: CollapsibleProps) {
	const [internalOpen, setInternalOpen] = React.useState(open ?? false);
	const isOpen = open ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;

	return (
		<CollapsibleContext.Provider value={{ open: isOpen, setOpen }}>
			<div className={className}>{children}</div>
		</CollapsibleContext.Provider>
	);
}

interface CollapsibleContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue>({
	open: false,
	setOpen: () => {},
});

function useCollapsible() {
	return React.useContext(CollapsibleContext);
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

function CollapsibleTrigger({
	className,
	onClick,
	children,
	...props
}: CollapsibleTriggerProps) {
	const { open, setOpen } = useCollapsible();

	return (
		<button
			type="button"
			className={cn("flex items-center", className)}
			onClick={(event) => {
				setOpen(!open);
				onClick?.(event);
			}}
			aria-expanded={open}
			{...props}
		>
			{children}
		</button>
	);
}

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {}

function CollapsibleContent({
	className,
	children,
	...props
}: CollapsibleContentProps) {
	const { open } = useCollapsible();

	if (!open) return null;

	return (
		<div className={cn("overflow-hidden", className)} {...props}>
			{children}
		</div>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, useCollapsible };
